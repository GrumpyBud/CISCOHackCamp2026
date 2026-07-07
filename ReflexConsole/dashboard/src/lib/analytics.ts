import { DashboardSession, HealthLog, TEST_TYPES, TestType } from "@/lib/types";

export type TrendPoint = { label: string; value: number; low?: number; high?: number };
export type Contributor = { label: string; impact: number; detail: string };
export type DataQualityFlag = { label: string; severity: "info" | "warning"; detail: string };
export type ReadinessEstimate = {
  score: number;
  low: number;
  high: number;
  confidence: "Strong" | "Moderate" | "Limited" | "Needs More Data";
  comparedToBaseline: number;
  explanation: string;
};

export function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

export function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function formatDateTime(value?: string) {
  if (!value) return "Not yet";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

export function metricForSession(session: DashboardSession) {
  if (session.test_type === "choice") return Math.round((session.correct / Math.max(1, session.attempts)) * 100);
  if (session.test_type === "rhythm") return session.median;
  if (session.test_type === "memory") return session.rhythm_bias;
  return session.median;
}

export function metricLabel(testType: TestType) {
  if (testType === "choice") return "Accuracy";
  if (testType === "rhythm") return "Timing error";
  if (testType === "memory") return "Best span";
  return "Median RT";
}

export function metricSuffix(testType: TestType) {
  if (testType === "choice") return "%";
  if (testType === "memory") return "";
  return " ms";
}

export function latestByType(sessions: DashboardSession[], type: TestType) {
  return sessions.find((session) => session.test_type === type);
}

export function sessionsSince(sessions: DashboardSession[], days: number) {
  const cutoff = Date.now() - days * 86_400_000;
  return sessions.filter((session) => new Date(session.timestamp ?? session.imported_at).getTime() >= cutoff);
}

export function baselineSessions(sessions: DashboardSession[]) {
  return sessions.slice(-Math.min(45, sessions.length));
}

export function summarizeTestMode(sessions: DashboardSession[], type: TestType) {
  const modeSessions = sessions.filter((session) => session.test_type === type);
  const latest = modeSessions[0];
  const recent7 = sessionsSince(modeSessions, 7);
  const recent30 = sessionsSince(modeSessions, 30);
  const baseline = baselineSessions(modeSessions);
  const baselineMetric = average(baseline.map(metricForSession));
  const latestMetric = latest ? metricForSession(latest) : 0;
  const higherIsBetter = type === "choice" || type === "memory";
  const trend7 = average(recent7.map((session) => session.score)) - average(baseline.map((session) => session.score));
  const trend30 = average(recent30.map((session) => session.score)) - average(baseline.map((session) => session.score));
  const bestScore = Math.max(0, ...modeSessions.map((session) => session.score));
  const bestMetric = higherIsBetter ? Math.max(0, ...modeSessions.map(metricForSession)) : Math.min(...modeSessions.map(metricForSession).filter(Boolean));
  return {
    modeSessions,
    latest,
    latestScore: latest?.score ?? 0,
    bestScore,
    trend7,
    trend30,
    baselineMetric,
    latestMetric,
    bestMetric: Number.isFinite(bestMetric) ? bestMetric : 0,
  };
}

export function buildReadiness(sessions: DashboardSession[], healthLogs: HealthLog[]): ReadinessEstimate {
  const recent = sessionsSince(sessions, 7);
  const baseline = baselineSessions(sessions);
  if (!sessions.length) {
    return { score: 0, low: 0, high: 0, confidence: "Needs More Data", comparedToBaseline: 0, explanation: "No badge sessions have been imported yet. Import sessions before estimating performance readiness." };
  }
  if (recent.length < 3) {
    return { score: 52, low: 40, high: 65, confidence: "Needs More Data", comparedToBaseline: 0, explanation: "Readiness confidence is limited because fewer than 5 recent sessions are available." };
  }
  const recentScore = average(recent.map((session) => session.score));
  const baselineScore = average(baseline.map((session) => session.score)) || recentScore;
  const lapsePenalty = average(recent.map((session) => session.lapses)) * 2.8;
  const falseStartPenalty = average(recent.map((session) => session.false_starts)) * 1.8;
  const healthCoverage = new Set(healthLogs.slice(0, 14).map((log) => log.log_date)).size;
  const confidenceBonus = Math.min(8, recent.length * 0.7) + Math.min(5, healthCoverage * 0.5);
  const score = clamp(Math.round(recentScore - lapsePenalty - falseStartPenalty + confidenceBonus), 0, 100);
  const uncertainty = recent.length >= 18 ? 5 : recent.length >= 10 ? 8 : 13;
  return {
    score,
    low: clamp(score - uncertainty, 0, 100),
    high: clamp(score + uncertainty, 0, 100),
    confidence: recent.length >= 18 && healthCoverage >= 8 ? "Strong" : recent.length >= 10 ? "Moderate" : "Limited",
    comparedToBaseline: Math.round(score - baselineScore),
    explanation: "Personal performance estimate from recent badge sessions, baseline comparison, and optional context coverage.",
  };
}

export function todayVsBaseline(sessions: DashboardSession[]) {
  if (!sessions.length) return [];
  const recent = sessionsSince(sessions, 7);
  const baseline = baselineSessions(sessions);
  const choice = recent.filter((session) => session.test_type === "choice");
  const rhythm = recent.filter((session) => session.test_type === "rhythm");
  const memory = recent.filter((session) => session.test_type === "memory");
  return [
    { label: "Median reaction time", value: `${Math.round(median(recent.filter((session) => ["quick", "focus", "choice"].includes(session.test_type)).map((session) => session.median)))} ms`, detail: `Baseline ${Math.round(median(baseline.map((session) => session.median)))} ms` },
    { label: "Spread / consistency", value: `${Math.round(average(recent.map((session) => session.spread)))} ms`, detail: `Baseline ${Math.round(average(baseline.map((session) => session.spread)))} ms` },
    { label: "Lapses", value: `${recent.reduce((sum, session) => sum + session.lapses, 0)}`, detail: "Last 7 days" },
    { label: "False starts", value: `${recent.reduce((sum, session) => sum + session.false_starts, 0)}`, detail: "Start discipline signal" },
    { label: "Choice accuracy", value: `${Math.round(average(choice.map((session) => session.correct / Math.max(1, session.attempts) * 100)))}%`, detail: `${choice.length} choice sessions` },
    { label: "Rhythm timing error", value: `${Math.round(average(rhythm.map((session) => session.median)))} ms`, detail: `${rhythm.length} rhythm sessions` },
    { label: "Memory best span", value: `${Math.max(0, ...memory.map((session) => session.rhythm_bias))}`, detail: `${memory.length} memory sessions` },
  ];
}

export function readinessTimeline(sessions: DashboardSession[]) {
  const byDay = new Map<string, DashboardSession[]>();
  sessions.forEach((session) => {
    const day = (session.timestamp ?? session.imported_at).slice(5, 10);
    byDay.set(day, [...(byDay.get(day) ?? []), session]);
  });
  return [...byDay.entries()].reverse().slice(-24).map(([label, daySessions]) => {
    const score = Math.round(average(daySessions.map((session) => session.score)) - average(daySessions.map((session) => session.lapses)) * 2);
    return { label, value: clamp(score, 0, 100), low: clamp(score - 7, 0, 100), high: clamp(score + 7, 0, 100) };
  });
}

export function trendByType(sessions: DashboardSession[], type: TestType, metric: "score" | "metric" | "lapses" | "false_starts" = "score"): TrendPoint[] {
  return sessions.filter((session) => session.test_type === type).slice(0, 24).reverse().map((session) => ({
    label: (session.timestamp ?? session.imported_at).slice(5, 10),
    value: metric === "score" ? session.score : metric === "metric" ? metricForSession(session) : session[metric],
  }));
}

export function scoreTrendsByType(sessions: DashboardSession[]): TrendPoint[] {
  return TEST_TYPES.map((type) => ({
    label: type,
    value: Math.round(average(sessions.filter((session) => session.test_type === type).slice(0, 12).map((session) => session.score))),
  }));
}

export function contributors(sessions: DashboardSession[], healthLogs: HealthLog[]): Contributor[] {
  if (!sessions.length) return [];
  const recent = sessionsSince(sessions, 7);
  const base = baselineSessions(sessions);
  const deltaMedian = average(base.map((session) => session.median)) - average(recent.map((session) => session.median));
  const deltaSpread = average(base.map((session) => session.spread)) - average(recent.map((session) => session.spread));
  const deltaLapses = average(base.map((session) => session.lapses)) - average(recent.map((session) => session.lapses));
  const choiceRecent = recent.filter((session) => session.test_type === "choice");
  const choiceBase = base.filter((session) => session.test_type === "choice");
  const accuracyDelta = average(choiceRecent.map((session) => session.correct / Math.max(1, session.attempts) * 100)) - average(choiceBase.map((session) => session.correct / Math.max(1, session.attempts) * 100));
  const memoryDelta = Math.max(0, ...recent.filter((session) => session.test_type === "memory").map((session) => session.rhythm_bias)) - Math.max(0, ...base.filter((session) => session.test_type === "memory").map((session) => session.rhythm_bias));
  const coverage = new Set(healthLogs.slice(0, 10).map((log) => log.log_date)).size;
  return [
    { label: "Response speed", impact: Math.round(deltaMedian / 4), detail: `${Math.round(Math.abs(deltaMedian))} ms ${deltaMedian >= 0 ? "faster" : "slower"} than baseline.` },
    { label: "Consistency", impact: Math.round(deltaSpread / 3), detail: `${Math.round(Math.abs(deltaSpread))} ms spread change versus baseline.` },
    { label: "Lapse control", impact: Math.round(deltaLapses * 8), detail: `${Math.abs(deltaLapses).toFixed(1)} average lapse shift.` },
    { label: "Accuracy", impact: Math.round(accuracyDelta), detail: `${Math.abs(accuracyDelta).toFixed(1)} point choice accuracy shift.` },
    { label: "Memory", impact: Math.round(memoryDelta * 4), detail: `${Math.abs(memoryDelta)} span change in recent memory sessions.` },
    { label: "Health context", impact: coverage >= 7 ? 4 : -5, detail: coverage >= 7 ? "Context coverage supports interpretation." : "Missing context limits interpretation." },
  ].sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact));
}

export function dataQualityFlags(sessions: DashboardSession[], healthLogs: HealthLog[]): DataQualityFlag[] {
  const recent = sessionsSince(sessions, 7);
  const flags: DataQualityFlag[] = [];
  if (!sessions.length) return [{ label: "No session data", severity: "warning", detail: "Import badge sessions before reviewing trend quality." }];
  if (recent.length < 5) flags.push({ label: "Low sample size", severity: "warning", detail: "Fewer than 5 recent sessions are available." });
  const healthDays = new Set(healthLogs.slice(0, 14).map((log) => log.log_date));
  if (healthDays.size < 5) flags.push({ label: "Missing health context", severity: "warning", detail: "Several recent days do not have context logs." });
  const latestImport = Math.max(...sessions.map((session) => new Date(session.imported_at).getTime()));
  if (Date.now() - latestImport > 5 * 86_400_000) flags.push({ label: "Old import", severity: "warning", detail: "Latest badge import is more than 5 days old." });
  TEST_TYPES.forEach((type) => {
    if (recent.filter((session) => session.test_type === type).length < 2) flags.push({ label: `Limited ${type} data`, severity: "info", detail: "This mode has limited recent coverage." });
  });
  if (sessions.some((session) => session.firmware_version && session.firmware_version < "v0.4.1")) flags.push({ label: "Firmware mix", severity: "info", detail: "Older firmware appears in historical sessions." });
  return flags.slice(0, 6);
}

export function correlation(x: number[], y: number[]) {
  const pairs = x.map((value, index) => ({ x: value, y: y[index] })).filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
  if (pairs.length < 4) return 0;
  const xMean = average(pairs.map((point) => point.x));
  const yMean = average(pairs.map((point) => point.y));
  const numerator = pairs.reduce((sum, point) => sum + (point.x - xMean) * (point.y - yMean), 0);
  const denominator = Math.sqrt(pairs.reduce((sum, point) => sum + (point.x - xMean) ** 2, 0) * pairs.reduce((sum, point) => sum + (point.y - yMean) ** 2, 0));
  return denominator ? numerator / denominator : 0;
}
