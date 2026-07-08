import { average, baselineSessions, sessionsSince } from "@/lib/analytics";
import { DashboardSession, HealthLog, TEST_LABELS, TEST_TYPES } from "@/lib/types";

export type AiHealthSummaryRequest = {
  sessions?: DashboardSession[];
  healthLogs?: HealthLog[];
  suggestions?: Array<{ signal: string; suggestedAction: string; evidence: string; confidence: string }>;
};

export type AiHealthSummaryResponse = {
  summary: string;
  model: string;
  provider: "ollama" | "openai-compatible";
};

type SummaryStats = {
  sessionCount: number;
  recentSessionCount: number;
  healthLogCount: number;
  recentAverageScore: number;
  baselineAverageScore: number;
  averageMedianMs: number;
  averageSpreadMs: number;
  averageLapses: number;
  averageFalseStarts: number;
  healthCoverageDays: number;
};

export function compactSessions(sessions: DashboardSession[]) {
  return sessions.slice(0, 24).map((session) => ({
    date: (session.timestamp ?? session.imported_at).slice(0, 10),
    type: TEST_LABELS[session.test_type],
    score: session.score,
    median_ms: session.median,
    spread_ms: session.spread,
    lapses: session.lapses,
    false_starts: session.false_starts,
    attempts: session.attempts,
    correct: session.correct,
    rhythm_or_memory_value: session.rhythm_bias,
  }));
}

export function compactHealthLogs(healthLogs: HealthLog[]) {
  return healthLogs.slice(0, 14).map((log) => ({
    date: log.log_date,
    time: log.log_time,
    context: log.context,
    sleep_hours: log.sleep_hours,
    sleep_quality: log.sleep_quality,
    stress: log.stress,
    mood: log.mood,
    exercise_minutes: log.exercise_minutes,
    caffeine_mg: log.caffeine_mg,
    recent_caffeine_mg: log.caffeine_recent_mg,
    hydration: log.hydration,
  }));
}

export function summarizeInputs(sessions: DashboardSession[], healthLogs: HealthLog[]): SummaryStats {
  const recent = sessionsSince(sessions, 7);
  const baseline = baselineSessions(sessions);
  return {
    sessionCount: sessions.length,
    recentSessionCount: recent.length,
    healthLogCount: healthLogs.length,
    recentAverageScore: Math.round(average(recent.map((session) => session.score))),
    baselineAverageScore: Math.round(average(baseline.map((session) => session.score))),
    averageMedianMs: Math.round(average(recent.map((session) => session.median))),
    averageSpreadMs: Math.round(average(recent.map((session) => session.spread))),
    averageLapses: Math.round(average(recent.map((session) => session.lapses)) * 10) / 10,
    averageFalseStarts: Math.round(average(recent.map((session) => session.false_starts)) * 10) / 10,
    healthCoverageDays: new Set(healthLogs.slice(0, 14).map((log) => log.log_date)).size,
  };
}

export function buildHealthSummaryPrompt(input: AiHealthSummaryRequest) {
  const sessions = input.sessions ?? [];
  const healthLogs = input.healthLogs ?? [];
  const stats = summarizeInputs(sessions, healthLogs);
  const modeCounts = TEST_TYPES.map((type) => `${TEST_LABELS[type]}: ${sessions.filter((session) => session.test_type === type).length}`).join(", ");
  const payload = {
    stats,
    mode_counts: modeCounts,
    recent_sessions: compactSessions(sessions),
    recent_health_logs: compactHealthLogs(healthLogs),
    rule_based_suggestions: (input.suggestions ?? []).slice(0, 5),
  };

  return `You write concise wellness summaries for a non-medical reaction-training dashboard.

Rules:
- Do not diagnose, treat, or make medical claims.
- Do not say the data proves causation.
- Mention confidence limits when data is sparse.
- Give 3 short sections exactly: "Summary", "Likely factors", and "Next demo actions".
- Keep the full answer under 180 words.
- Use plain text, not markdown tables.

Dashboard data:
${JSON.stringify(payload, null, 2)}`;
}

export function cleanModelText(value: unknown) {
  return String(value ?? "")
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 1600);
}
