"use client";

import { SignInButton, SignUpButton, useUser } from "@clerk/nextjs";
import { AnimatePresence, MotionConfig, motion, useReducedMotion } from "motion/react";
import { ChangeEvent, CSSProperties, FormEvent, Fragment, PointerEvent, ReactNode, useEffect, useMemo, useState } from "react";
import {
  average,
  buildReadiness,
  contributors,
  correlation,
  dataQualityFlags,
  formatDateTime,
  metricForSession,
  metricLabel,
  metricSuffix,
  readinessTimeline,
  scoreTrendsByType,
  summarizeTestMode,
  todayVsBaseline,
  trendBySessionMetric,
  trendByType,
  TrendPoint,
} from "@/lib/analytics";
import { readBadgeExport } from "@/lib/badge-import";
import { demoData } from "@/lib/demo-data";
import type { AiHealthSummaryResponse } from "@/lib/ai-health-summary";
import { previewImportPayload } from "@/lib/import-validation";
import { buildTrainingSuggestions, TrainingSuggestion } from "@/lib/recommendations";
import { BadgeDevice, DashboardSession, HealthLog, ImportBatch, ReflexExport, ResearchPreviewRow, ResearchProfile, TEST_LABELS, TEST_TYPES, TestType } from "@/lib/types";

type TabId = "overview" | "import" | "sessions" | "tests" | "health" | "training" | "research" | "devices" | "exports" | "settings";
type ImportStepState = "idle" | "active" | "done" | "error";
type ChartDensity = "compact" | "comfortable";

type CloudDashboardPayload = {
  sessions?: DashboardSession[];
  devices?: BadgeDevice[];
  imports?: ImportBatch[];
};

type CloudHealthPayload = {
  logs?: HealthLog[];
};

type ResearchSettingsPayload = {
  consent?: { enabled: boolean; updated_at?: string };
  profile?: ResearchProfile;
};

type AiSummaryState = {
  status: "idle" | "loading" | "ready" | "error";
  text: string;
  meta: string;
};

const tabs: { id: TabId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "import", label: "Import" },
  { id: "sessions", label: "Sessions" },
  { id: "tests", label: "Tests" },
  { id: "health", label: "Health" },
  { id: "training", label: "Training" },
  { id: "research", label: "Research" },
  { id: "devices", label: "Devices" },
  { id: "exports", label: "Exports" },
  { id: "settings", label: "Settings" },
];

const importSteps = [
  "Connect to nearby badge",
  "Send REFLEX_EXPORT_V1",
  "Receive structured history",
  "Validate export",
  "Deduplicate sessions",
  "Import complete",
];

const healthReminderTimes = ["09:00", "14:00", "20:00"] as const;

function today() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function nowTime() {
  return new Date().toTimeString().slice(0, 5);
}

function detectHealthContext(date = new Date()) {
  const hour = date.getHours();
  if (hour >= 5 && hour < 11) return "morning";
  if (hour >= 11 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 22) return "evening";
  return "check-in";
}

function blankResearchProfile(): ResearchProfile {
  return {
    age_years: null,
    account_age_days: null,
    gender: "",
    handedness: "",
    notes: "",
    updated_at: "",
  };
}

function blankHealthLog(previousLog?: HealthLog): HealthLog {
  return {
    log_date: today(),
    log_time: nowTime(),
    context: detectHealthContext(),
    wake_time: previousLog?.wake_time ?? "07:00",
    sleep_hours: previousLog?.sleep_hours ?? 7.4,
    sleep_quality: previousLog?.sleep_quality ?? 7,
    stress: previousLog?.stress ?? 4,
    mood: previousLog?.mood ?? 7,
    exercise_minutes: previousLog?.exercise_minutes ?? 20,
    caffeine_mg: previousLog?.caffeine_mg ?? 0,
    caffeine_recent_mg: 0,
    hydration: previousLog?.hydration ?? 7,
    notes: previousLog?.notes ?? "",
  };
}

function healthReminderDismissKey(date = today()) {
  return `reflex-health-reminder-dismissed-${date}`;
}

function healthReminderFireKey(date: string, time: string) {
  return `reflex-health-reminder-fired-${date}-${time}`;
}

function classNames(...names: Array<string | false | undefined>) {
  return names.filter(Boolean).join(" ");
}

const motionSpring = { type: "spring", stiffness: 520, damping: 42, mass: 0.8 } as const;
const softEase = [0.22, 1, 0.36, 1] as const;

function tabMotion(reducedMotion: boolean) {
  if (reducedMotion) {
    return {
      initial: { opacity: 1, y: 0 },
      animate: { opacity: 1, y: 0 },
      exit: { opacity: 1, y: 0 },
    };
  }
  return {
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -6 },
  };
}

function itemMotion(reducedMotion: boolean, index = 0) {
  if (reducedMotion) {
    return {
      initial: { opacity: 1, y: 0 },
      whileInView: { opacity: 1, y: 0 },
      transition: { duration: 0 },
    };
  }
  return {
    initial: { opacity: 0, y: 8 },
    whileInView: { opacity: 1, y: 0 },
    transition: { duration: 0.22, delay: Math.min(index * 0.035, 0.18), ease: softEase },
  };
}

function MotionScene({ sceneKey, children }: { sceneKey: string; children: ReactNode }) {
  const reducedMotion = useReducedMotion();
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={sceneKey}
        className="tab-scene"
        {...tabMotion(!!reducedMotion)}
        transition={{ duration: 0.18, ease: softEase }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

function formatMetric(value: number, suffix = "") {
  if (!Number.isFinite(value)) return "—";
  return `${Math.round(value)}${suffix}`;
}

function downloadFile(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function escapeCsv(value: string | number | undefined) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function sessionsToCsv(sessions: DashboardSession[], healthLogs: HealthLog[]) {
  const healthByDay = new Map(healthLogs.map((log) => [log.log_date, log]));
  const columns = ["timestamp", "badge_id", "firmware_version", "test_type", "score", "median_ms", "spread_ms", "lapses", "false_starts", "accuracy", "matched_sleep_hours", "matched_stress", "matched_caffeine_mg", "matched_hydration"];
  const rows = sessions.map((session) => {
    const day = (session.timestamp ?? session.imported_at).slice(0, 10);
    const health = healthByDay.get(day);
    const accuracy = session.test_type === "choice" ? Math.round((session.correct / Math.max(1, session.attempts)) * 100) : "";
    return [session.timestamp ?? session.imported_at, session.badge_id, session.firmware_version, session.test_type, session.score, session.median, session.spread, session.lapses, session.false_starts, accuracy, health?.sleep_hours, health?.stress, health?.caffeine_mg, health?.hydration];
  });
  return [columns, ...rows].map((row) => row.map(escapeCsv).join(",")).join("\n");
}

function accuracyForSession(session: DashboardSession) {
  return Math.round((session.correct / Math.max(1, session.attempts)) * 100);
}

function consistencyForSession(session: DashboardSession) {
  return `${Math.round(session.spread)} ms`;
}

function MiniLineChart({ title, points, suffix = "", band = false }: { title: string; points: TrendPoint[]; suffix?: string; band?: boolean }) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const reducedMotion = useReducedMotion();
  const width = 640;
  const height = 210;
  const pad = 24;
  const values = points.filter((point) => Number.isFinite(point.value));
  const allValues = values.flatMap((point) => [point.value, point.low ?? point.value, point.high ?? point.value]);
  const min = Math.min(...allValues, 0);
  const max = Math.max(...allValues, 100);
  const range = max - min || 1;
  const xy = (point: TrendPoint, index: number, key: "value" | "low" | "high" = "value") => {
    const value = point[key] ?? point.value;
    const x = pad + (values.length <= 1 ? (width - pad * 2) / 2 : index * (width - pad * 2) / (values.length - 1));
    const y = height - pad - ((value - min) / range) * (height - pad * 2);
    return `${x},${y}`;
  };
  const line = values.map((point, index) => xy(point, index)).join(" ");
  const bandPolygon = band && values.length > 1
    ? `${values.map((point, index) => xy(point, index, "high")).join(" ")} ${values.map((point, index) => xy(point, index, "low")).reverse().join(" ")}`
    : "";
  const plotted = values.map((point, index) => {
    const [x, y] = xy(point, index).split(",").map(Number);
    const [, lowY] = xy(point, index, "low").split(",").map(Number);
    const [, highY] = xy(point, index, "high").split(",").map(Number);
    return { point, x, y, lowY, highY };
  });
  const selected = hoveredIndex === null ? plotted.at(-1) : plotted[hoveredIndex];
  const chartMeta = values.length ? `${values.length} points${band ? " · confidence band" : ""}` : "No chart data";
  function handlePointerMove(event: PointerEvent<SVGSVGElement>) {
    if (!plotted.length) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const cursorX = ((event.clientX - bounds.left) / bounds.width) * width;
    const nearest = plotted.reduce((best, item, index) => Math.abs(item.x - cursorX) < Math.abs(plotted[best].x - cursorX) ? index : best, 0);
    setHoveredIndex(nearest);
  }
  return (
    <section className="chart-card" aria-label={title}>
      <div className="chart-head">
        <h3>{title}</h3>
        <span>{chartMeta}</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${title} trend`} onPointerMove={handlePointerMove} onPointerLeave={() => setHoveredIndex(null)}>
        <line x1={pad} x2={width - pad} y1={height - pad} y2={height - pad} className="chart-axis" />
        {bandPolygon ? <motion.polygon points={bandPolygon} className="chart-band" initial={{ opacity: reducedMotion ? 1 : 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true, amount: 0.45 }} transition={{ duration: 0.18 }} /> : null}
        {line ? <motion.polyline points={line} className="chart-line" initial={{ pathLength: reducedMotion ? 1 : 0, opacity: reducedMotion ? 1 : 0.6 }} whileInView={{ pathLength: 1, opacity: 1 }} viewport={{ once: true, amount: 0.45 }} transition={{ duration: 0.55, ease: softEase }} /> : null}
        {selected ? (
          <g className="chart-cursor">
            <line x1={selected.x} x2={selected.x} y1={pad} y2={height - pad} />
            {band && <line x1={selected.x - 8} x2={selected.x + 8} y1={selected.highY} y2={selected.highY} />}
            {band && <line x1={selected.x - 8} x2={selected.x + 8} y1={selected.lowY} y2={selected.lowY} />}
            <circle cx={selected.x} cy={selected.y} r="7" />
          </g>
        ) : null}
        {plotted.map(({ point, x, y }, index) => <circle key={`${point.label}-${index}`} cx={x} cy={y} r="3.5" className="chart-dot" tabIndex={0} onFocus={() => setHoveredIndex(index)} />)}
        <rect x={pad} y={pad} width={width - pad * 2} height={height - pad * 2} className="chart-hit" />
      </svg>
      <div className="chart-readout" aria-live="polite">
        {selected ? <><strong>{hoveredIndex === null ? "Latest" : selected.point.label}</strong><span>{formatMetric(selected.point.value, suffix)}</span><small>{hoveredIndex === null ? selected.point.label : "Selected point"}{band && selected.point.low !== undefined && selected.point.high !== undefined ? ` · range ${formatMetric(selected.point.low, suffix)} to ${formatMetric(selected.point.high, suffix)}` : ""}</small></> : <span>No values available.</span>}
      </div>
    </section>
  );
}

function MiniBarChart({ title, points, suffix = "" }: { title: string; points: TrendPoint[]; suffix?: string }) {
  const max = Math.max(1, ...points.map((point) => point.value));
  const reducedMotion = useReducedMotion();
  return (
    <section className="chart-card">
      <div className="chart-head">
        <h3>{title}</h3>
        <span>{points.length ? `${points.length} groups` : "No chart data"}</span>
      </div>
      <div className="bar-chart">
        {points.map((point, index) => (
          <div key={point.label} className="bar-row">
            <span>{point.label}</span>
            <div><motion.i initial={{ width: reducedMotion ? `${Math.max(4, point.value / max * 100)}%` : "4%" }} whileInView={{ width: `${Math.max(4, point.value / max * 100)}%` }} viewport={{ once: true, amount: 0.65 }} transition={{ duration: 0.38, delay: Math.min(index * 0.025, 0.12), ease: softEase }} /></div>
            <strong>{formatMetric(point.value, suffix)}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

function MetricCard({ label, value, detail, tone = "neutral" }: { label: string; value: string; detail: string; tone?: "neutral" | "good" | "warn" }) {
  const reducedMotion = useReducedMotion();
  return (
    <motion.article className={classNames("metric-card", tone)} whileHover={reducedMotion ? undefined : { y: -2 }} transition={motionSpring}>
      <p>{label}</p>
      <strong>{value}</strong>
      <span>{detail}</span>
    </motion.article>
  );
}

function EmptyState({ title, detail, actions }: { title: string; detail: string; actions?: ReactNode }) {
  return (
    <section className="empty-state">
      <h3>{title}</h3>
      <p>{detail}</p>
      {actions ? <div className="action-row">{actions}</div> : null}
    </section>
  );
}

function TabIcon({ id }: { id: TabId }) {
  const common = { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  if (id === "overview") return <svg {...common}><path d="M4 13h6V4H4z" /><path d="M14 20h6V4h-6z" /><path d="M4 20h6v-3H4z" /></svg>;
  if (id === "import") return <svg {...common}><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></svg>;
  if (id === "sessions") return <svg {...common}><path d="M8 6h13" /><path d="M8 12h13" /><path d="M8 18h13" /><path d="M3 6h.01" /><path d="M3 12h.01" /><path d="M3 18h.01" /></svg>;
  if (id === "tests") return <svg {...common}><path d="M9 3h6" /><path d="M10 9h4" /><path d="M8 21h8" /><path d="M12 3v6" /><path d="M7 9h10l-1 12H8z" /></svg>;
  if (id === "health") return <svg {...common}><path d="M20 11c0 5-8 10-8 10S4 16 4 11a4 4 0 0 1 7-2.65A4 4 0 0 1 20 11Z" /></svg>;
  if (id === "training") return <svg {...common}><path d="M6 20V9" /><path d="M12 20V4" /><path d="M18 20v-7" /><path d="M4 20h16" /></svg>;
  if (id === "research") return <svg {...common}><path d="M10 2v8.5" /><path d="M14 2v8.5" /><path d="M8.5 2h7" /><path d="M7 10.5h10l-1.8 8.4A2.6 2.6 0 0 1 12.7 21h-1.4a2.6 2.6 0 0 1-2.5-2.1Z" /></svg>;
  if (id === "devices") return <svg {...common}><rect x="7" y="3" width="10" height="18" rx="2" /><path d="M11 6h2" /><path d="M11 18h2" /></svg>;
  if (id === "exports") return <svg {...common}><path d="M12 21V9" /><path d="m7 14 5-5 5 5" /><path d="M5 3h14v4H5z" /></svg>;
  if (id === "settings") return <svg {...common}><circle cx="12" cy="12" r="3" /><path d="M12 2v3" /><path d="M12 19v3" /><path d="m4.93 4.93 2.12 2.12" /><path d="m16.95 16.95 2.12 2.12" /><path d="M2 12h3" /><path d="M19 12h3" /><path d="m4.93 19.07 2.12-2.12" /><path d="m16.95 7.05 2.12-2.12" /></svg>;
  return <svg {...common}><path d="M12 20V10" /><path d="M18 20V4" /><path d="M6 20v-6" /></svg>;
}

function AppNav({ activeTab, onTabChange }: { activeTab: TabId; onTabChange: (tab: TabId) => void }) {
  return (
    <>
      <aside className="sidebar">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 42 42" role="img">
              <circle cx="21" cy="21" r="15" />
              <path d="M8 22h7l3-8 6 15 3-7h7" />
              <path d="M27 11c4 1.9 6.8 5.7 7.4 10.2" />
            </svg>
          </div>
          <div>
            <strong>Reflex Console</strong>
            <span>Badge performance dashboard</span>
          </div>
        </div>
        <nav aria-label="Dashboard tabs">
          {tabs.map((tab) => (
            <button key={tab.id} className={activeTab === tab.id ? "active" : ""} onClick={() => onTabChange(tab.id)} type="button">
              {activeTab === tab.id ? <motion.span className="nav-active-indicator" layoutId="desktop-tab-indicator" transition={motionSpring} /> : null}
              {tab.label}
            </button>
          ))}
        </nav>
      </aside>
      <nav className="mobile-nav" aria-label="Mobile dashboard tabs">
        {tabs.map((tab) => (
          <button key={tab.id} aria-label={tab.label} title={tab.label} className={activeTab === tab.id ? "active" : ""} onClick={() => onTabChange(tab.id)} type="button">
            {activeTab === tab.id ? <motion.span className="nav-active-indicator" layoutId="mobile-tab-indicator" transition={motionSpring} /> : null}
            <TabIcon id={tab.id} />
          </button>
        ))}
      </nav>
    </>
  );
}

function SignedOutIntro({ onTryDemo }: { onTryDemo: () => void }) {
  const reducedMotion = useReducedMotion();
  return (
    <main className="signed-out">
      <motion.section className="intro-panel" {...itemMotion(!!reducedMotion)} viewport={{ once: true }}>
        <p className="eyebrow">REFLEX CONSOLE</p>
        <h1>Private badge-session analytics for cognitive-performance training.</h1>
        <p>Import ESP32 badge session history, review personal performance trends, and optionally contribute pseudonymous aggregate research rows. Reflex Console is a non-medical wellness tool.</p>
        <div className="action-row">
          <button onClick={onTryDemo} type="button">Try Demo Mode</button>
          <SignInButton><button className="secondary" type="button">Sign In</button></SignInButton>
          <SignUpButton><button className="secondary" type="button">Create Account</button></SignUpButton>
        </div>
      </motion.section>
      <section className="intro-grid">
        <MetricCard label="Import paths" value="BLE + JSON" detail="Bluetooth LE command REFLEX_EXPORT_V1 or export-file upload fallback." />
        <MetricCard label="Privacy model" value="User scoped" detail="Research contribution is optional and pseudonymous." />
        <MetricCard label="Product scope" value="Wellness" detail="Personal performance trends without medical claims." />
      </section>
    </main>
  );
}

function OverviewTab({ sessions, healthLogs, imports, suggestions }: { sessions: DashboardSession[]; healthLogs: HealthLog[]; imports: ImportBatch[]; suggestions: TrainingSuggestion[] }) {
  const reducedMotion = useReducedMotion();
  const readiness = buildReadiness(sessions, healthLogs);
  const metrics = todayVsBaseline(sessions);
  const latestImport = imports[0];
  const quality = dataQualityFlags(sessions, healthLogs);
  const changed = contributors(sessions, healthLogs);
  const next = suggestions[0];
  return (
    <div className="tab-stack">
      <section className="overview-hero">
        <article className="readiness-card">
          <div>
            <p className="eyebrow">Performance Readiness</p>
            <h2>{readiness.score}</h2>
            <p>{readiness.confidence} data confidence · {readiness.low}–{readiness.high} estimated range</p>
            <span className={readiness.comparedToBaseline >= 0 ? "pill good" : "pill warn"}>
              {readiness.comparedToBaseline >= 0 ? "+" : ""}{readiness.comparedToBaseline} vs personal baseline
            </span>
          </div>
          <div className="readiness-ring" style={{ "--ready": `${readiness.score}%` } as CSSProperties}>
            <div className="readiness-ring-inner"><strong>{readiness.score}</strong><span>{readiness.confidence}</span></div>
          </div>
          <p className="span-full">{readiness.explanation}</p>
        </article>
        <article className="suggestion-card">
          <p className="eyebrow">Suggested Next Session</p>
          <h2>{next?.suggestedAction ?? "Collect another badge session"}</h2>
          <p><strong>Reason:</strong> {next?.signal ?? "Not enough recent data"}</p>
          <p><strong>Goal:</strong> {next?.goal ?? "Improve baseline confidence."}</p>
          <p><strong>Evidence:</strong> {next?.evidence ?? "Import badge sessions to unlock recommendations."}</p>
        </article>
      </section>
      <section className="metric-grid compact">
        {metrics.map((metric, index) => (
          <motion.div key={metric.label} {...itemMotion(!!reducedMotion, index)} viewport={{ once: true, amount: 0.4 }}>
            <MetricCard label={metric.label} value={metric.value} detail={metric.detail} />
          </motion.div>
        ))}
      </section>
      <section className="overview-grid">
        <article className="panel">
          <div className="panel-head"><div><h2>Import Status</h2><p>Latest retained badge history and import health.</p></div><span className={classNames("status-dot", latestImport && "good")}>{latestImport ? "Healthy" : "No import"}</span></div>
          <dl className="detail-list">
            <div><dt>Last import</dt><dd>{formatDateTime(latestImport?.imported_at)}</dd></div>
            <div><dt>Last badge ID</dt><dd>{latestImport?.badge_id ?? "—"}</dd></div>
            <div><dt>Firmware</dt><dd>{latestImport?.firmware_version ?? "—"}</dd></div>
            <div><dt>History retained</dt><dd>{latestImport ? `${latestImport.retained_sessions} / ${latestImport.history_capacity}` : "—"}</dd></div>
          </dl>
        </article>
        <article className="panel">
          <div className="panel-head"><div><h2>What Changed</h2><p>Ranked contributors to recent performance change.</p></div></div>
          {changed.length ? <div className="rank-list">
            {changed.slice(0, 6).map((item) => <div key={item.label}><span>{item.impact >= 0 ? "+" : ""}{item.impact}</span><strong>{item.label}</strong><p>{item.detail}</p></div>)}
          </div> : <EmptyState title="Not enough data" detail="Import badge sessions before comparing recent performance with your personal baseline." />}
        </article>
        <article className="panel">
          <div className="panel-head"><div><h2>Data Quality</h2><p>Issues that limit interpretation.</p></div></div>
          <div className="quality-list">
            {quality.map((flag) => <div key={flag.label} className={flag.severity}><strong>{flag.label}</strong><p>{flag.detail}</p></div>)}
          </div>
        </article>
      </section>
      <section className="chart-grid">
        <MiniLineChart title="Readiness timeline with confidence band" points={readinessTimeline(sessions)} band />
        <MiniBarChart title="Score trends by test type" points={scoreTrendsByType(sessions).map((point) => ({ ...point, label: TEST_LABELS[point.label as TestType] }))} />
        <MiniLineChart title="Reaction-time trend" points={trendByType(sessions, "quick", "metric")} suffix=" ms" />
        <MiniLineChart title="Lapse trend" points={trendBySessionMetric(sessions, "lapses")} />
      </section>
      <LatestSessions sessions={sessions.slice(0, 8)} />
      <Disclaimer />
    </div>
  );
}

function LatestSessions({ sessions }: { sessions: DashboardSession[] }) {
  return (
    <section className="panel">
      <div className="panel-head"><div><h2>Latest Sessions Preview</h2><p>Recent imported badge sessions with stored timing, consistency, lapse, and accuracy fields.</p></div></div>
      {!sessions.length ? <EmptyState title="No sessions to show" detail="Imported badge sessions will appear here with test type, score, timing, consistency, lapses, and badge ID." /> : <div className="mini-table latest-table">
        <table>
          <thead><tr><th>Test</th><th>Time</th><th>Score</th><th>Key metric</th><th>Consistency</th><th>Lapses</th><th>Accuracy</th><th>Badge</th></tr></thead>
          <tbody>
            {sessions.map((session) => <tr key={`${session.badge_id}-${session.sequence}`}><td>{TEST_LABELS[session.test_type]}</td><td>{formatDateTime(session.timestamp)}</td><td>{session.score}</td><td>{metricForSession(session)}{metricSuffix(session.test_type)}</td><td>{consistencyForSession(session)}</td><td>{session.lapses}</td><td>{accuracyForSession(session)}%</td><td>{session.badge_id}</td></tr>)}
          </tbody>
        </table>
      </div>}
    </section>
  );
}

function ImportTab({ sessions, onImportExport }: { sessions: DashboardSession[]; onImportExport: (payload: ReflexExport) => void }) {
  const [step, setStep] = useState(0);
  const [status, setStatus] = useState<ImportStepState>("idle");
  const [message, setMessage] = useState("Ready to connect over Bluetooth LE.");
  const [uploadMessage, setUploadMessage] = useState("No file selected.");
  const [preview, setPreview] = useState<ReturnType<typeof previewImportPayload> | null>(null);
  const [successMessage, setSuccessMessage] = useState("");
  const progress = status === "done" ? 100 : status === "idle" ? 0 : Math.min(95, Math.round(((step + 1) / importSteps.length) * 100));
  const reducedMotion = useReducedMotion();

  async function submitImport(exportData: ReflexExport, source: "badge" | "file") {
    const previewResult = previewImportPayload(exportData, sessions);
    if (!previewResult.ok || !previewResult.exportData) {
      throw new Error(previewResult.error ?? "Invalid export schema");
    }

    setStatus("active");
    setStep(3);
    setMessage("Validating export schema...");
    const response = await fetch("/api/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(previewResult.exportData),
    });
    const result = await response.json() as { imported?: number; duplicates?: number; badgeId?: string; error?: string };
    if (!response.ok) throw new Error(result.error ?? "Import failed");

    const imported = result.imported ?? previewResult.newCount ?? 0;
    const duplicates = result.duplicates ?? previewResult.duplicateCount ?? 0;
    setStep(5);
    setStatus("done");
    setMessage(`${imported} new sessions imported. ${duplicates} duplicate sessions skipped. Badge ${result.badgeId ?? previewResult.badgeId} · Firmware ${previewResult.firmwareVersion} · History retained ${previewResult.sessionCount} / ${previewResult.exportData.begin.history_capacity}.`);
    setUploadMessage(source === "badge" ? "Badge import complete." : "JSON import complete.");
    setSuccessMessage(`${source === "badge" ? "Bluetooth" : "JSON"} import complete: ${imported} new, ${duplicates} duplicate.`);
    onImportExport(previewResult.exportData);
  }

  async function connectBadgeImport() {
    try {
      setSuccessMessage("");
      setStatus("active");
      setStep(0);
      setMessage(importSteps[0]);
      const exportData = await readBadgeExport((progress) => {
        setStatus("active");
        setStep(progress.step);
        setMessage(progress.message);
      });
      await submitImport(exportData, "badge");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Badge import failed");
    }
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setSuccessMessage("");
      const text = await file.text();
      const result = previewImportPayload(text, sessions);
      setPreview(result);
      setUploadMessage(result.ok ? `${result.newCount} new sessions, ${result.duplicateCount} duplicates detected.` : result.error ?? "Invalid export schema");
    } catch (error) {
      setPreview({ ok: false, error: error instanceof Error ? error.message : "JSON schema validation error: file could not be parsed." });
      setUploadMessage("JSON schema validation error: file could not be parsed.");
    }
  }

  return (
    <div className="tab-stack">
      {successMessage ? (
        <section className="success-toast" role="status" aria-live="polite">
          <div><strong>Import complete</strong><p>{successMessage}</p></div>
          <button className="compact-button" type="button" onClick={() => setSuccessMessage("")}>Dismiss</button>
        </section>
      ) : null}
      <section className="import-progress" aria-label={`Import progress ${progress}%`}>
        <div><motion.span animate={{ width: `${progress}%` }} transition={reducedMotion ? { duration: 0 } : { duration: 0.28, ease: softEase }} /></div>
        <small>{status === "idle" ? "Import not started" : status === "done" ? "Import complete" : status === "error" ? "Import needs attention" : `${progress}% complete · ${message}`}</small>
      </section>
      <section className="import-layout">
        <article className="panel import-card">
          <div className="panel-head"><div><h2>Bluetooth LE Import</h2><p>Connect to a nearby badge and request structured history.</p></div><span className="pill">Primary</span></div>
          <button type="button" onClick={connectBadgeImport}>Connect Badge</button>
          <div className="import-flow">
            {importSteps.map((label, index) => (
              <motion.div key={label} className={classNames(index < step || status === "done" ? "done" : index === step && status === "active" ? "active" : "", status === "error" && index === step ? "error" : "")} animate={reducedMotion ? { scale: 1 } : { scale: index === step && status === "active" ? 1.015 : 1 }} transition={motionSpring}>
                <span>{index + 1}</span><p>{label}</p>
              </motion.div>
            ))}
          </div>
          <div className={classNames("notice", status === "done" && "good", status === "error" && "error")}>{message}</div>
        </article>
        <article className="panel import-card">
          <div className="panel-head"><div><h2>JSON Upload Fallback</h2><p>Upload a structured badge export file and preview records before import.</p></div><span className="pill subtle">Fallback</span></div>
          <label className="drop-zone" onDragOver={(event) => event.preventDefault()} onDrop={(event) => {
            event.preventDefault();
            const file = event.dataTransfer.files[0];
            if (!file) return;
            file.text().then((text) => {
              const result = previewImportPayload(text, sessions);
              setPreview(result);
              setUploadMessage(result.ok ? `${result.newCount} new sessions, ${result.duplicateCount} duplicates detected.` : result.error ?? "Invalid export schema");
            }).catch(() => {
              setPreview({ ok: false, error: "JSON schema validation error: file could not be parsed." });
              setUploadMessage("JSON schema validation error: file could not be parsed.");
            });
          }}>
            <input type="file" accept="application/json,.json" onChange={handleFile} />
            <strong>Upload JSON Export</strong>
            <span>Drag-and-drop styling with schema validation and duplicate detection.</span>
          </label>
          <div className={classNames("notice", preview?.ok && "good", !!preview && !preview.ok && "error")}>{uploadMessage}</div>
          {preview?.ok ? (
            <div className="preview-box">
              <dl className="detail-list">
                <div><dt>Badge</dt><dd>{preview.badgeId}</dd></div>
                <div><dt>Firmware</dt><dd>{preview.firmwareVersion}</dd></div>
                <div><dt>Records</dt><dd>{preview.sessionCount}</dd></div>
                <div><dt>Import result</dt><dd>{preview.newCount} new · {preview.duplicateCount} duplicate</dd></div>
              </dl>
              <button type="button" onClick={() => preview.exportData ? submitImport(preview.exportData, "file").catch((error) => {
                const errorMessage = error instanceof Error ? error.message : "Import failed";
                setPreview({ ok: false, error: errorMessage });
                setUploadMessage(errorMessage);
                setSuccessMessage("");
              }) : null}>Import Valid Records</button>
            </div>
          ) : null}
        </article>
      </section>
    </div>
  );
}

function SessionsTab({ sessions }: { sessions: DashboardSession[] }) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState<"all" | TestType>("all");
  const [badge, setBadge] = useState("all");
  const [firmware, setFirmware] = useState("all");
  const [sortKey, setSortKey] = useState<"timestamp" | "score" | "metric">("timestamp");
  const [expanded, setExpanded] = useState<string | null>(null);
  const badges = [...new Set(sessions.map((session) => session.badge_id))];
  const firmwares = [...new Set(sessions.map((session) => session.firmware_version ?? "unknown"))];
  const filtered = sessions.filter((session) => {
    const text = `${session.badge_id} ${session.sequence} ${TEST_LABELS[session.test_type]} ${session.firmware_version}`.toLowerCase();
    return text.includes(query.toLowerCase()) && (type === "all" || session.test_type === type) && (badge === "all" || session.badge_id === badge) && (firmware === "all" || session.firmware_version === firmware);
  }).sort((a, b) => {
    if (sortKey === "score") return b.score - a.score;
    if (sortKey === "metric") return metricForSession(a) - metricForSession(b);
    return new Date(b.timestamp ?? b.imported_at).getTime() - new Date(a.timestamp ?? a.imported_at).getTime();
  });
  return (
    <div className="tab-stack">
      <section className="panel">
        <div className="panel-head"><div><h2>Session History</h2><p>Search, filter, sort, and inspect retained badge sessions.</p></div><span className="pill">{filtered.length} rows</span></div>
        <div className="filter-bar">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search sessions" />
          <select value={type} onChange={(event) => setType(event.target.value as "all" | TestType)}><option value="all">All tests</option>{TEST_TYPES.map((item) => <option key={item} value={item}>{TEST_LABELS[item]}</option>)}</select>
          <select value={badge} onChange={(event) => setBadge(event.target.value)}><option value="all">All badges</option>{badges.map((item) => <option key={item}>{item}</option>)}</select>
          <select value={firmware} onChange={(event) => setFirmware(event.target.value)}><option value="all">All firmware</option>{firmwares.map((item) => <option key={item}>{item}</option>)}</select>
          <select value={sortKey} onChange={(event) => setSortKey(event.target.value as "timestamp" | "score" | "metric")}><option value="timestamp">Sort by timestamp</option><option value="score">Sort by score</option><option value="metric">Sort by metric</option></select>
        </div>
        {!sessions.length ? <EmptyState title="No badge sessions yet" detail="Connect your badge over Bluetooth or upload a JSON export to start reviewing performance trends." /> : null}
        {sessions.length && !filtered.length ? <EmptyState title="No matching sessions" detail="Adjust search, test type, badge, firmware, or sort filters to find retained sessions." /> : null}
        {filtered.length ? <div className="mini-table full-session-table">
          <table>
            <thead><tr><th>Time</th><th>Test</th><th>Badge</th><th>Firmware</th><th>Score</th><th>Metric</th><th>Consistency</th><th>Lapses</th><th>False starts</th><th>Attempts</th><th>Correct</th><th>Accuracy</th><th>Actions</th></tr></thead>
            <tbody>
              {filtered.map((session) => {
                const key = `${session.badge_id}-${session.sequence}`;
                return (
                  <Fragment key={key}>
                    <tr key={key}>
                      <td>{formatDateTime(session.timestamp)}</td><td>{TEST_LABELS[session.test_type]}</td><td>{session.badge_id}</td><td>{session.firmware_version}</td><td>{session.score}</td><td>{metricForSession(session)}{metricSuffix(session.test_type)}</td><td>{consistencyForSession(session)}</td><td>{session.lapses}</td><td>{session.false_starts}</td><td>{session.attempts}</td><td>{session.correct}</td><td>{accuracyForSession(session)}%</td>
                      <td><button className="compact-button" type="button" onClick={() => setExpanded(expanded === key ? null : key)}>Details</button></td>
                    </tr>
                    {expanded === key ? <tr key={`${key}-detail`} className="detail-row"><td colSpan={13}><code>{JSON.stringify(session, null, 2)}</code></td></tr> : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div> : null}
      </section>
    </div>
  );
}

function TestsTab({ sessions }: { sessions: DashboardSession[] }) {
  const [mode, setMode] = useState<TestType>("quick");
  const reducedMotion = useReducedMotion();
  const summary = summarizeTestMode(sessions, mode);
  const label = TEST_LABELS[mode];
  const metric = metricLabel(mode);
  const recentModeSessions = summary.modeSessions.slice(0, 12);
  const totalLapses = recentModeSessions.reduce((sum, session) => sum + session.lapses, 0);
  const totalFalseStarts = recentModeSessions.reduce((sum, session) => sum + session.false_starts, 0);
  const averageConsistency = Math.round(average(recentModeSessions.map((session) => session.spread)));
  const averageAccuracy = Math.round(average(recentModeSessions.map(accuracyForSession)));
  if (!sessions.length) return <EmptyState title="No test data yet" detail="Import badge sessions or enable Demo Mode in Settings before reviewing test drilldowns." />;
  return (
    <div className="tab-stack">
      <section className="segmented" aria-label="Test mode tabs">
        {TEST_TYPES.map((type) => (
          <button key={type} className={mode === type ? "active" : ""} onClick={() => setMode(type)} type="button">
            {mode === type ? <motion.span className="segmented-pill" layoutId="tests-mode-pill" transition={motionSpring} /> : null}
            <span>{TEST_LABELS[type]}</span>
          </button>
        ))}
      </section>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={mode}
          className="tab-stack"
          initial={reducedMotion ? { opacity: 1 } : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reducedMotion ? { opacity: 1 } : { opacity: 0, y: -4 }}
          transition={{ duration: reducedMotion ? 0 : 0.18, ease: softEase }}
        >
          <section className="metric-grid">
            <MetricCard label="Latest score" value={formatMetric(summary.latestScore)} detail={`${label} most recent session`} />
            <MetricCard label="Best score" value={formatMetric(summary.bestScore)} detail="Personal best in retained history" tone="good" />
            <MetricCard label="7-day trend" value={`${summary.trend7 >= 0 ? "+" : ""}${summary.trend7.toFixed(1)}`} detail="Score vs baseline" />
            <MetricCard label="30-day trend" value={`${summary.trend30 >= 0 ? "+" : ""}${summary.trend30.toFixed(1)}`} detail="Score vs baseline" />
            <MetricCard label="Baseline comparison" value={formatMetric(summary.latestMetric - summary.baselineMetric, metricSuffix(mode))} detail={`${metric} vs baseline`} />
            <MetricCard label="Consistency spread" value={formatMetric(averageConsistency, " ms")} detail={`Average of ${recentModeSessions.length} recent ${label.toLowerCase()} sessions`} />
            <MetricCard label="Recent lapses" value={`${totalLapses}`} detail="Stored lapse count in recent retained sessions" />
            <MetricCard label="False starts" value={`${totalFalseStarts}`} detail="Stored start-discipline count" />
            <MetricCard label="Accuracy" value={`${averageAccuracy}%`} detail="Correct responses divided by attempts" />
          </section>
          <section className="chart-grid">
            <MiniLineChart title={`${label} score trend`} points={trendByType(sessions, mode, "score")} />
            <MiniLineChart title={`${metric} trend`} points={trendByType(sessions, mode, "metric")} suffix={metricSuffix(mode)} />
            <MiniLineChart title={`${label} consistency spread`} points={trendByType(sessions, mode, "spread")} suffix=" ms" />
            <MiniLineChart title={`${label} lapses over time`} points={trendByType(sessions, mode, "lapses")} />
            <MiniLineChart title={`${label} false starts trend`} points={trendByType(sessions, mode, "false_starts")} />
          </section>
          <article className="panel">
            <h2>Metric Explanation</h2>
            <p>{testExplanation(mode)}</p>
            <p className="soft-note">{summary.modeSessions.length < 5 ? `Data-quality note: ${label} confidence is limited because fewer than 5 retained sessions are available.` : `Data-quality note: ${label} has enough retained demo sessions for a useful personal trend view.`}</p>
          </article>
          <LatestSessions sessions={summary.modeSessions.slice(0, 8)} />
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function testExplanation(mode: TestType) {
  const copy: Record<TestType, string> = {
    quick: "Quick Test tracks simple reaction time, spread/consistency, lapses, false starts, readiness score, personal best, and baseline median/spread.",
    focus: "Focus Test tracks repeated reaction performance over timed sessions, emphasizing median reaction time, lapses, consistency, and score stability.",
    choice: "Choice Test maps blue to Back/left and red to Select/right, balancing accuracy, attempts, median response time, false starts, and score.",
    rhythm: "Rhythm Test tracks tap timing against repeated flashes, including median timing error, rhythm bias, matched tap count, and score.",
    memory: "Memory Test tracks visual sequence recall, attempts, correct responses, recall timing, mistakes, best completed span, and score.",
  };
  return copy[mode];
}

function HealthTab({ sessions, healthLogs, onAddHealthLog }: { sessions: DashboardSession[]; healthLogs: HealthLog[]; onAddHealthLog: (log: HealthLog) => Promise<void> }) {
  const [form, setForm] = useState<HealthLog>(() => blankHealthLog(healthLogs[0]));
  const [formError, setFormError] = useState("");
  const sliderFields = [
    { field: "sleep_hours", label: "Sleep", min: 0, max: 16, step: 0.1, suffix: "h" },
    { field: "sleep_quality", label: "Sleep quality", min: 1, max: 10, step: 1, suffix: "/10" },
    { field: "stress", label: "Stress", min: 1, max: 10, step: 1, suffix: "/10" },
    { field: "mood", label: "Mood", min: 1, max: 10, step: 1, suffix: "/10" },
    { field: "exercise_minutes", label: "Exercise", min: 0, max: 600, step: 5, suffix: " min" },
    { field: "caffeine_mg", label: "Caffeine today", min: 0, max: 1200, step: 10, suffix: " mg" },
    { field: "caffeine_recent_mg", label: "Recent caffeine", min: 0, max: 1200, step: 10, suffix: " mg" },
    { field: "hydration", label: "Hydration", min: 1, max: 10, step: 1, suffix: "/10" },
  ] as const;
  const todayLogs = healthLogs.filter((log) => log.log_date === today());
  const priorCaffeineToday = todayLogs.reduce((max, log) => Math.max(max, log.caffeine_mg), 0);
  const matchedSessions = sessions.filter((session) => healthLogs.some((log) => log.log_date === (session.timestamp ?? session.imported_at).slice(0, 10))).slice(0, 8);
  const sleep = correlation(healthLogs.map((log) => log.sleep_hours), healthLogs.map((log) => 80 + log.sleep_quality - log.stress));
  const stress = correlation(healthLogs.map((log) => log.stress), healthLogs.map((_, index) => sessions[index]?.lapses ?? 0));
  const caffeine = correlation(healthLogs.map((log) => log.caffeine_mg), healthLogs.map((_, index) => sessions[index]?.median ?? 0));
  const hydration = correlation(healthLogs.map((log) => log.hydration), healthLogs.map((_, index) => sessions[index]?.spread ?? 0));
  function update<K extends keyof HealthLog>(key: K, value: HealthLog[K]) {
    setForm((current) => {
      if (key === "caffeine_recent_mg") {
        const recent = Number(value);
        return { ...current, caffeine_recent_mg: recent, caffeine_mg: Math.max(current.caffeine_mg, priorCaffeineToday + recent) };
      }
      if (key === "caffeine_mg") {
        const total = Number(value);
        return { ...current, caffeine_mg: Math.max(total, priorCaffeineToday), caffeine_recent_mg: Math.min(current.caffeine_recent_mg, Math.max(0, total - priorCaffeineToday)) };
      }
      return { ...current, [key]: value };
    });
  }

  useEffect(() => {
    setForm((current) => ({ ...current, caffeine_mg: Math.max(current.caffeine_mg, priorCaffeineToday) }));
  }, [priorCaffeineToday]);

  useEffect(() => {
    if (!healthLogs.length) return;
    const latest = healthLogs[0];
    setForm((current) => ({
      ...blankHealthLog(latest),
      log_date: today(),
      log_time: nowTime(),
      context: detectHealthContext(),
      caffeine_mg: Math.max(current.caffeine_mg, latest.caffeine_mg ?? 0),
    }));
  }, [healthLogs]);

  useEffect(() => {
    const syncAutomaticFields = () => {
      const now = new Date();
      setForm((current) => ({
        ...current,
        log_date: today(),
        log_time: nowTime(),
        context: detectHealthContext(now),
      }));
    };
    syncAutomaticFields();
    const timer = window.setInterval(syncAutomaticFields, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      const now = new Date();
      await onAddHealthLog({
        ...form,
        log_date: today(),
        log_time: nowTime(),
        context: detectHealthContext(now),
      });
      setFormError("");
      setForm(blankHealthLog(form));
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Could not save health check-in.");
    }
  }
  return (
    <div className="tab-stack">
      <section className="health-primary">
        <form className="panel form-panel health-checkin-panel" onSubmit={submit}>
          <div className="panel-head"><div><h2>Add Check-In</h2><p>Health context is website-only and matched to same-day badge sessions.</p></div></div>
          <div className="auto-context-card">
            <span className="pill good">Auto detected</span>
            <dl className="detail-list">
              <div><dt>Date</dt><dd>{form.log_date}</dd></div>
              <div><dt>Time</dt><dd>{form.log_time}</dd></div>
              <div><dt>Context</dt><dd>{form.context}</dd></div>
              <div><dt>Reminder cadence</dt><dd>9 AM · 2 PM · 8 PM</dd></div>
              <div><dt>Prior caffeine today</dt><dd>{priorCaffeineToday} mg</dd></div>
            </dl>
          </div>
          <div className="form-grid two">
            <label>Wake time<input type="time" value={form.wake_time} onChange={(event) => update("wake_time", event.target.value)} /></label>
          </div>
          <div className="slider-grid">
            {sliderFields.map(({ field, label, min, max, step, suffix }) => (
              <label className="slider-field" key={field}>
                <span className="slider-head"><strong>{label}</strong></span>
                <span className="slider-control">
                  <input type="range" min={min} max={max} step={step} value={form[field]} onChange={(event) => update(field, Number(event.target.value))} />
                  <input type="number" min={min} max={max} step={step} value={form[field]} aria-label={`${label} exact value`} onChange={(event) => update(field, Number(event.target.value))} />
                  <small>{suffix}</small>
                </span>
              </label>
            ))}
          </div>
          <label className="full-label">Notes<textarea value={form.notes} onChange={(event) => update("notes", event.target.value)} /></label>
          {formError ? <div className="notice error">{formError}</div> : null}
          <button type="submit">Add Check-In</button>
        </form>
      </section>
      <section className="health-context-grid">
        <article className="panel">
          <h2>Today’s Context</h2>
          {todayLogs.length ? <div className="quality-list">{todayLogs.map((log) => <div key={log.id ?? log.log_time}><strong>{log.context} · {log.log_time}</strong><p>{log.sleep_hours}h sleep · stress {log.stress}/10 · caffeine {log.caffeine_mg} mg · hydration {log.hydration}/10</p></div>)}</div> : <EmptyState title="No health context" detail="No health context has been logged today. Add sleep, stress, caffeine, hydration, and mood context to compare performance under different conditions." />}
        </article>
        <article className="panel"><h2>Timeline of Check-Ins</h2>{healthLogs.length ? <div className="quality-list">{healthLogs.slice(0, 10).map((log) => <div key={`${log.id}-${log.log_time}`}><strong>{log.log_date} · {log.context}</strong><p>{log.sleep_hours}h sleep · mood {log.mood}/10 · recent caffeine {log.caffeine_recent_mg} mg</p></div>)}</div> : <EmptyState title="No timeline yet" detail="Saved check-ins will appear here after the first health log." />}</article>
      </section>
      <section className="chart-grid">
        <MiniBarChart title="Sleep vs readiness · exploratory correlation" points={[{ label: "r", value: Math.round(Math.abs(sleep) * 100) }]} />
        <MiniBarChart title="Stress vs lapses · exploratory correlation" points={[{ label: "r", value: Math.round(Math.abs(stress) * 100) }]} />
        <MiniBarChart title="Caffeine vs reaction time · exploratory correlation" points={[{ label: "r", value: Math.round(Math.abs(caffeine) * 100) }]} />
        <MiniBarChart title="Hydration vs consistency · exploratory correlation" points={[{ label: "r", value: Math.round(Math.abs(hydration) * 100) }]} />
      </section>
      <LatestSessions sessions={matchedSessions} />
      <p className="soft-note">Correlations are exploratory and not causal.</p>
    </div>
  );
}

function LocalAiSummaryPanel({ sessions, healthLogs, suggestions }: { sessions: DashboardSession[]; healthLogs: HealthLog[]; suggestions: TrainingSuggestion[] }) {
  const [summary, setSummary] = useState<AiSummaryState>({ status: "idle", text: "", meta: "Configured from dashboard env vars." });
  const hasContext = sessions.length > 0 || healthLogs.length > 0;

  async function generateSummary() {
    setSummary({ status: "loading", text: "", meta: "Asking the configured model endpoint..." });
    try {
      const response = await fetch("/api/ai/health-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessions: sessions.slice(0, 36),
          healthLogs: healthLogs.slice(0, 20),
          suggestions,
        }),
      });
      const payload = await response.json() as AiHealthSummaryResponse & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Could not generate local AI summary.");
      setSummary({
        status: "ready",
        text: payload.summary,
        meta: `${payload.provider} · ${payload.model}`,
      });
    } catch (error) {
      setSummary({
        status: "error",
        text: error instanceof Error ? error.message : "Could not generate local AI summary.",
        meta: "Check that the model endpoint is reachable and LOCAL_AI_BASE_URL is set.",
      });
    }
  }

  return (
    <section className="panel ai-summary-panel">
      <div className="panel-head">
        <div>
          <h2>Local AI Health Summary</h2>
          <p>Generated through the dashboard API using the model server configured in your deployment env.</p>
        </div>
        <span className={classNames("pill", summary.status === "ready" && "good", summary.status === "error" && "warn")}>{summary.status}</span>
      </div>
      <div className="action-row">
        <button type="button" onClick={generateSummary} disabled={!hasContext || summary.status === "loading"}>{summary.status === "loading" ? "Generating..." : "Generate Summary"}</button>
        <span className="summary-meta">{summary.meta}</span>
      </div>
      {summary.text ? (
        <div className={classNames("ai-summary-output", summary.status === "error" && "error")}>
          {summary.text.split("\n").filter(Boolean).map((line) => <p key={line}>{line}</p>)}
        </div>
      ) : (
        <p className="soft-note">Uses recent badge sessions, health check-ins, and rule-based suggestions. Free-text health notes are not sent to the model.</p>
      )}
    </section>
  );
}

function TrainingTab({ sessions, healthLogs, suggestions }: { sessions: DashboardSession[]; healthLogs: HealthLog[]; suggestions: TrainingSuggestion[] }) {
  if (!suggestions.length) {
    return (
      <div className="tab-stack">
        <LocalAiSummaryPanel sessions={sessions} healthLogs={healthLogs} suggestions={suggestions} />
        <EmptyState title="No training suggestion yet" detail="Import enough recent badge sessions to generate evidence-based training suggestions." />
      </div>
    );
  }
  return (
    <div className="tab-stack">
      <LocalAiSummaryPanel sessions={sessions} healthLogs={healthLogs} suggestions={suggestions} />
      <section className="panel">
        <div className="panel-head"><div><h2>Evidence-Based Training Suggestions</h2><p>Deterministic rule-based recommendations from recent training signals.</p></div></div>
        <div className="suggestion-list">
          {suggestions.map((suggestion) => (
            <article key={`${suggestion.signal}-${suggestion.suggestedAction}`}>
              <span className="pill">{suggestion.confidence}</span>
              <h3>{suggestion.suggestedAction}</h3>
              <p><strong>Signal:</strong> {suggestion.signal}</p>
              <p><strong>Evidence:</strong> {suggestion.evidence}</p>
              <p><strong>Goal:</strong> {suggestion.goal}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="overview-grid">
        <MetricCard label="Training streak" value={`${Math.min(7, suggestions.length + 1)} days`} detail="Estimated from retained recent sessions" />
        <MetricCard label="Weekly balance" value={suggestions.some((suggestion) => suggestion.testType === "context") ? "Context first" : "Active"} detail="Rule-based balance from available signals" />
        <MetricCard label="Recent outcomes" value={`${suggestions.filter((suggestion) => suggestion.confidence !== "Limited").length} supported`} detail="Suggestions with moderate or strong confidence" />
      </section>
      <section className="calendar-grid">{Array.from({ length: 28 }, (_, index) => <span key={index} className={index % 6 === 0 ? "light" : "filled"} />)}</section>
      <p className="soft-note">AI output is local-demo interpretation only; core suggestions remain rule-based and do not require model integration.</p>
    </div>
  );
}

function ResearchTab({
  researchRows,
  enabled,
  setEnabled,
  profile,
  onSaveProfile,
}: {
  researchRows: ResearchPreviewRow[];
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
  profile: ResearchProfile;
  onSaveProfile: (profile: ResearchProfile) => Promise<void>;
}) {
  const [draft, setDraft] = useState<ResearchProfile>(profile);
  const [status, setStatus] = useState("");

  useEffect(() => {
    setDraft(profile);
  }, [profile]);

  function update<K extends keyof ResearchProfile>(key: K, value: ResearchProfile[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      setStatus("Saving research profile...");
      await onSaveProfile(draft);
      setStatus("Research profile saved. It will refill after refresh.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not save research profile.");
    }
  }

  return (
    <div className="tab-stack">
      <section className="research-status-grid">
        <article className="panel">
          <div className="panel-head"><div><h2>Contribution Status</h2><p>Research contribution is optional and separate from the personal dashboard.</p></div><span className={classNames("status-dot", enabled && "good")}>{enabled ? "Enabled" : "Off"}</span></div>
          <label className="demo-toggle inline"><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} /><span><strong>Contribute pseudonymous research rows</strong><small>No copied health check-ins or notes.</small></span></label>
        </article>
        <article className="panel"><h2>Research Protections</h2><div className="chip-row">{["Salted SHA-256 user hash", "Salted SHA-256 badge hash", "No copied health check-ins", "No copied notes", "No email/name/Clerk IDs"].map((item) => <span key={item}>{item}</span>)}</div></article>
      </section>
      <form className="panel form-panel research-profile-panel" onSubmit={submit}>
        <div className="panel-head">
          <div>
            <h2>Optional Research Profile</h2>
            <p>Saved to your account and reused after refresh. Profile notes are not copied into research session rows.</p>
          </div>
          {draft.updated_at ? <span className="pill subtle">Updated {formatDateTime(draft.updated_at)}</span> : null}
        </div>
        <div className="form-grid three">
          <label>Actual age<input type="number" min="0" max="120" placeholder="Optional" value={draft.age_years ?? ""} onChange={(event) => update("age_years", event.target.value === "" ? null : Number(event.target.value))} /></label>
          <label>Gender<select value={draft.gender} onChange={(event) => update("gender", event.target.value)}><option value="">Prefer not to say</option><option>Woman</option><option>Man</option><option>Non-binary</option><option>Self-describe in notes</option></select></label>
          <label>Dominant hand<select value={draft.handedness} onChange={(event) => update("handedness", event.target.value)}><option value="">Prefer not to say</option><option>Right</option><option>Left</option><option>Ambidextrous</option></select></label>
        </div>
        <div className="detected-profile-meta">
          <span>Signup-derived account age</span>
          <strong>{draft.account_age_days === null ? "Detected after save" : `${draft.account_age_days} days`}</strong>
        </div>
        <label className="full-label">Profile notes<textarea value={draft.notes} placeholder="Optional context, accessibility notes, training background, or anything useful for interpreting aggregate research." onChange={(event) => update("notes", event.target.value)} /></label>
        {status ? <div className={classNames("notice", status.includes("saved") && "good", status.includes("Could not") && "error")}>{status}</div> : null}
        <button type="submit">Save Research Profile</button>
      </form>
      <section className="two-column">
        <article className="panel"><h2>What is contributed</h2><ul className="clean-list"><li>Pseudonymous user hash</li><li>Pseudonymous badge hash</li><li>Test type and timestamp bucket</li><li>Score, median reaction time, spread, lapses, accuracy, rhythm timing, memory metrics</li><li>Firmware version and safe device/session metadata</li></ul></article>
        <article className="panel"><h2>What is never contributed</h2><ul className="clean-list"><li>Name</li><li>Email</li><li>Clerk ID</li><li>Raw health check-ins</li><li>Health notes, profile notes, or copied private notes</li></ul></article>
      </section>
      <section className="panel">
        <div className="panel-head"><div><h2>Pseudonymous Row Preview</h2><p>Exactly what a contributed row would look like in demo mode.</p></div></div>
        {researchRows[0] ? <pre className="code-block">{JSON.stringify(researchRows[0], null, 2)}</pre> : <EmptyState title="No research row preview" detail="Enable Demo Mode or import sessions to preview a pseudonymous contribution row." />}
      </section>
      <section className="chart-grid">
        <MiniBarChart title="Demo sessions by test type" points={TEST_TYPES.map((type) => ({ label: TEST_LABELS[type], value: researchRows.filter((row) => row.test_type === type).length + 8 }))} />
        <MiniBarChart title="Demo score distribution" points={[{ label: "50s", value: 3 }, { label: "60s", value: 9 }, { label: "70s", value: 18 }, { label: "80s", value: 34 }, { label: "90s", value: 21 }]} />
        <MiniBarChart title="Firmware distribution" points={[{ label: "v0.4.0", value: 18 }, { label: "v0.4.1", value: 31 }, { label: "v0.4.2", value: 55 }]} />
        <MiniLineChart title="Aggregate median reaction-time trend" points={[{ label: "W1", value: 301 }, { label: "W2", value: 292 }, { label: "W3", value: 284 }, { label: "W4", value: 276 }]} suffix=" ms" />
      </section>
    </div>
  );
}

function DevicesTab({ devices, imports }: { devices: BadgeDevice[]; imports: ImportBatch[] }) {
  if (!devices.length) return <EmptyState title="No devices yet" detail="Badge/device records appear after Bluetooth LE import, JSON import, or Demo Mode." />;
  return (
    <div className="tab-stack">
      <section className="device-grid">
        {devices.map((device) => <article className="panel" key={device.badge_id}><div className="panel-head"><div><h2>Badge {device.badge_id}</h2><p>Export schema {device.export_schema}</p></div><span className="status-dot good">{device.import_status}</span></div><dl className="detail-list"><div><dt>Firmware</dt><dd>{device.firmware_version}</dd></div><div><dt>Last import</dt><dd>{formatDateTime(device.last_import_at)}</dd></div><div><dt>History retained</dt><dd>{device.retained_sessions} / {device.history_capacity}</dd></div><div><dt>Data completeness</dt><dd>{device.data_completeness}%</dd></div></dl></article>)}
      </section>
      <section className="panel"><h2>Recent Import Batches</h2><div className="mini-table"><table><thead><tr><th>Imported</th><th>Badge</th><th>Firmware</th><th>New</th><th>Duplicates</th><th>Status</th></tr></thead><tbody>{imports.map((batch) => <tr key={batch.id}><td>{formatDateTime(batch.imported_at)}</td><td>{batch.badge_id}</td><td>{batch.firmware_version}</td><td>{batch.new_sessions}</td><td>{batch.duplicate_sessions}</td><td>{batch.status}</td></tr>)}</tbody></table></div></section>
    </div>
  );
}

function ExportsTab({ sessions, healthLogs, onDeleteHistory }: { sessions: DashboardSession[]; healthLogs: HealthLog[]; onDeleteHistory: () => void }) {
  const columns = ["timestamp", "badge_id", "firmware_version", "test_type", "score", "median_ms", "spread_ms", "lapses", "false_starts", "accuracy", "matched_sleep_hours", "matched_stress", "optional_profile_context"];
  const [deleteArmed, setDeleteArmed] = useState(false);
  const exportJson = () => downloadFile("reflex-personal-export.json", JSON.stringify({ exported_at: new Date().toISOString(), sessions, healthLogs }, null, 2), "application/json");
  const exportCsv = () => downloadFile("reflex-session-history.csv", sessionsToCsv(sessions, healthLogs), "text/csv");
  return (
    <div className="tab-stack">
      <section className="export-actions">
        <article className="panel"><h2>Export Personal CSV</h2><p>Session history with matched health context and optional profile context.</p><button type="button" disabled={!sessions.length} onClick={exportCsv}>Download CSV</button></article>
        <article className="panel"><h2>Export Personal JSON</h2><p>Structured personal archive for your signed-in account.</p><button type="button" disabled={!sessions.length && !healthLogs.length} onClick={exportJson}>Download JSON</button></article>
      </section>
      <section className="panel"><h2>Preview Export Columns</h2><div className="chip-row">{columns.map((column) => <span key={column}>{column}</span>)}</div></section>
      <LatestSessions sessions={sessions.slice(0, 6)} />
      <article className="panel danger-zone">
        <h2>Delete Cloud History</h2>
        <p>Destructive account-level data control. This is separated from export actions so it is harder to trigger accidentally.</p>
        <button className={deleteArmed ? "danger" : "secondary"} type="button" onClick={() => {
          if (!deleteArmed) setDeleteArmed(true);
          else {
            onDeleteHistory();
            setDeleteArmed(false);
          }
        }}>{deleteArmed ? "Confirm Delete Cloud History" : "Review Delete Confirmation"}</button>
      </article>
    </div>
  );
}

function SettingsTab({
  demoMode,
  setDemoMode,
  researchEnabled,
  setResearchEnabled,
  sessions,
  healthLogs,
  chartDensity,
  setChartDensity,
  defaultLanding,
  setDefaultLanding,
  onDeleteHistory,
}: {
  demoMode: boolean;
  setDemoMode: (enabled: boolean) => void;
  researchEnabled: boolean;
  setResearchEnabled: (enabled: boolean) => void;
  sessions: DashboardSession[];
  healthLogs: HealthLog[];
  chartDensity: ChartDensity;
  setChartDensity: (density: ChartDensity) => void;
  defaultLanding: TabId;
  setDefaultLanding: (tab: TabId) => void;
  onDeleteHistory: () => void;
}) {
  const [deleteArmed, setDeleteArmed] = useState(false);
  const exportJson = () => downloadFile("reflex-personal-export.json", JSON.stringify({ exported_at: new Date().toISOString(), sessions, healthLogs }, null, 2), "application/json");
  const exportCsv = () => downloadFile("reflex-session-history.csv", sessionsToCsv(sessions, healthLogs), "text/csv");
  return (
    <div className="tab-stack">
      <section className="settings-grid">
        <article className="panel">
          <h2>Account & Privacy</h2>
          <p>Dashboard data is scoped to the signed-in account. Clerk account controls, session management, and privacy preferences belong here when the live backend is connected.</p>
          <div className="settings-stack compact">
            <label className="demo-toggle inline"><input type="checkbox" defaultChecked /><span><strong>User-scoped dashboard access</strong><small>Keep personal sessions visible only to this account.</small></span></label>
            <label className="demo-toggle inline"><input type="checkbox" defaultChecked /><span><strong>Show import metadata</strong><small>Display badge ID, firmware, retained history, and import health.</small></span></label>
          </div>
        </article>
        <article className="panel">
          <h2>Display Preferences</h2>
          <div className="settings-stack compact">
            <label className="demo-toggle inline"><input type="checkbox" checked={demoMode} onChange={(event) => setDemoMode(event.target.checked)} /><span><strong>Demo Mode</strong><small>Populate the app with realistic sample data.</small></span></label>
            <label>Default landing tab<select value={defaultLanding} onChange={(event) => setDefaultLanding(event.target.value as TabId)}><option value="overview">Overview</option><option value="import">Import</option><option value="tests">Tests</option><option value="health">Health</option><option value="settings">Settings</option></select></label>
            <label>Chart density<select value={chartDensity} onChange={(event) => setChartDensity(event.target.value as ChartDensity)}><option value="compact">Compact</option><option value="comfortable">Comfortable</option></select></label>
          </div>
        </article>
        <article className="panel">
          <h2>Import Preferences</h2>
          <div className="settings-stack compact">
            <label className="demo-toggle inline"><input type="checkbox" defaultChecked /><span><strong>Validate before import</strong><small>Check schema and preview records before saving sessions.</small></span></label>
            <label className="demo-toggle inline"><input type="checkbox" defaultChecked /><span><strong>Idempotent import</strong><small>Deduplicate by signed-in user, badge ID, and session sequence.</small></span></label>
          </div>
        </article>
      </section>
      <section className="settings-support-grid">
        <article className="panel">
          <div className="panel-head"><div><h2>Research Contribution</h2><p>Optional pseudonymous aggregate contribution controls.</p></div><span className={classNames("status-dot", researchEnabled && "good")}>{researchEnabled ? "Enabled" : "Off"}</span></div>
          <label className="demo-toggle inline"><input type="checkbox" checked={researchEnabled} onChange={(event) => setResearchEnabled(event.target.checked)} /><span><strong>Contribute pseudonymous research rows</strong><small>No email, name, Clerk ID, raw health check-ins, or notes.</small></span></label>
        </article>
        <article className="panel">
          <h2>Research Protections</h2>
          <div className="chip-row">{["Salted SHA-256 user hash", "Salted SHA-256 badge hash", "No copied health check-ins", "No copied notes", "No email/name/Clerk IDs"].map((item) => <span key={item}>{item}</span>)}</div>
        </article>
      </section>
      <section className="export-actions">
        <article className="panel"><h2>Export Personal CSV</h2><p>Session history with matched health context and optional profile context.</p><button type="button" disabled={!sessions.length} onClick={exportCsv}>Download CSV</button></article>
        <article className="panel"><h2>Export Personal JSON</h2><p>Structured personal archive for this signed-in account.</p><button type="button" disabled={!sessions.length && !healthLogs.length} onClick={exportJson}>Download JSON</button></article>
      </section>
      <section className="panel">
        <h2>Data Controls</h2>
        <div className="chip-row">{["Export session history with matched health context", "Include optional profile context", "Preview export columns", "Delete signed-in cloud history", "Keep research analytics separate from personal dashboard"].map((item) => <span key={item}>{item}</span>)}</div>
      </section>
      <article className="panel danger-zone">
        <h2>Delete Cloud History</h2>
        <p>Use a confirmation step before destructive account data changes.</p>
        <button className={deleteArmed ? "danger" : "secondary"} type="button" onClick={() => {
          if (!deleteArmed) setDeleteArmed(true);
          else {
            onDeleteHistory();
            setDeleteArmed(false);
          }
        }}>{deleteArmed ? "Confirm Delete Cloud History" : "Review Delete Confirmation"}</button>
      </article>
      <Disclaimer />
    </div>
  );
}

function Disclaimer() {
  return <p className="disclaimer">Reflex Console is a personal wellness and training tool. It estimates performance trends from badge sessions and optional context logs. It is not a medical device and does not diagnose, treat, or screen for health conditions.</p>;
}

export function Dashboard() {
  const { user, isLoaded } = useUser();
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [defaultLanding, setDefaultLandingState] = useState<TabId>("overview");
  const [chartDensity, setChartDensity] = useState<ChartDensity>("compact");
  const [demoMode, setDemoMode] = useState(false);
  const [researchEnabled, setResearchEnabled] = useState(true);
  const [sessions, setSessions] = useState<DashboardSession[]>([]);
  const [healthLogs, setHealthLogs] = useState<HealthLog[]>([]);
  const [devices, setDevices] = useState<BadgeDevice[]>([]);
  const [imports, setImports] = useState<ImportBatch[]>([]);
  const [cloudStatus, setCloudStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [cloudMessage, setCloudMessage] = useState("Cloud history loads automatically after sign-in.");
  const [researchProfile, setResearchProfile] = useState<ResearchProfile>(() => blankResearchProfile());
  const [healthReminderDismissed, setHealthReminderDismissed] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | "unsupported">("unsupported");
  const visibleSessions = useMemo(() => sessions, [sessions]);
  const visibleHealthLogs = useMemo(() => healthLogs, [healthLogs]);
  const suggestions = useMemo(() => buildTrainingSuggestions(visibleSessions, visibleHealthLogs), [visibleSessions, visibleHealthLogs]);
  const researchRows = useMemo(() => visibleSessions.length ? demoData.researchRows : [], [visibleSessions.length]);
  const hasTodayHealthLog = visibleHealthLogs.some((log) => log.log_date === today());
  const showHealthReminder = Boolean(user && !demoMode && !hasTodayHealthLog && !healthReminderDismissed);

  function enableDemo(enabled: boolean) {
    setDemoMode(enabled);
    if (enabled) {
      setSessions(demoData.sessions);
      setHealthLogs(demoData.healthLogs);
      setDevices(demoData.devices);
      setImports(demoData.importBatches);
      setResearchProfile(blankResearchProfile());
    } else {
      setSessions([]);
      setHealthLogs([]);
      setDevices([]);
      setImports([]);
      setResearchProfile(blankResearchProfile());
    }
  }

  useEffect(() => {
    if (!isLoaded || !user || demoMode) return;
    const controller = new AbortController();
    setCloudStatus("loading");
    setCloudMessage("Loading cloud history...");

    async function loadCloudData() {
      const [sessionsResponse, healthResponse, researchResponse] = await Promise.all([
        fetch("/api/sessions", { signal: controller.signal }),
        fetch("/api/health", { signal: controller.signal }),
        fetch("/api/research-consent", { signal: controller.signal }),
      ]);
      if (!sessionsResponse.ok) throw new Error("Could not load cloud session history.");
      if (!healthResponse.ok) throw new Error("Could not load cloud health context.");
      if (!researchResponse.ok) throw new Error("Could not load research profile.");

      const sessionPayload = await sessionsResponse.json() as CloudDashboardPayload;
      const healthPayload = await healthResponse.json() as CloudHealthPayload;
      const researchPayload = await researchResponse.json() as ResearchSettingsPayload;
      setSessions(sessionPayload.sessions ?? []);
      setDevices(sessionPayload.devices ?? []);
      setImports(sessionPayload.imports ?? []);
      setHealthLogs(healthPayload.logs ?? []);
      setResearchEnabled(researchPayload.consent?.enabled ?? true);
      setResearchProfile({ ...blankResearchProfile(), ...researchPayload.profile });
      setCloudStatus("ready");
      setCloudMessage(`Cloud history loaded: ${sessionPayload.sessions?.length ?? 0} sessions.`);
    }

    loadCloudData().catch((error) => {
      if (controller.signal.aborted) return;
      setCloudStatus("error");
      setCloudMessage(error instanceof Error ? error.message : "Could not load cloud history.");
    });

    return () => controller.abort();
  }, [demoMode, isLoaded, user]);

  useEffect(() => {
    if (!user || demoMode) return;
    setHealthReminderDismissed(localStorage.getItem(healthReminderDismissKey()) === "1");
    setNotificationPermission("Notification" in window ? Notification.permission : "unsupported");
  }, [demoMode, user]);

  useEffect(() => {
    if (!user || demoMode) return;
    const tick = () => {
      const currentDate = today();
      const currentTime = nowTime();
      if (!healthReminderTimes.includes(currentTime as typeof healthReminderTimes[number])) return;
      if (visibleHealthLogs.some((log) => log.log_date === currentDate)) return;
      const fireKey = healthReminderFireKey(currentDate, currentTime);
      if (localStorage.getItem(fireKey) === "1") return;
      localStorage.setItem(fireKey, "1");
      setHealthReminderDismissed(false);
      if ("Notification" in window && Notification.permission === "granted") {
        new Notification("Reflex health check-in", { body: "Log sleep, stress, caffeine, hydration, and mood context." });
      }
    };
    tick();
    const timer = window.setInterval(tick, 60_000);
    return () => window.clearInterval(timer);
  }, [demoMode, user, visibleHealthLogs]);

  function importExportPayload(payload: ReflexExport) {
    const importedAt = new Date().toISOString();
    const existingKeys = new Set(sessions.map((session) => `${session.badge_id}:${session.sequence}`));
    const importedSessions: DashboardSession[] = payload.sessions
      .filter((session) => !existingKeys.has(`${payload.begin.badge_id}:${session.sequence}`))
      .map((session, index) => ({
        ...session,
        badge_id: payload.begin.badge_id,
        firmware_version: payload.begin.firmware_version,
        imported_at: importedAt,
        timestamp: new Date(Date.now() - (payload.sessions.length - index) * 3_600_000).toISOString(),
      }));
    setSessions((current) => [...importedSessions, ...current].sort((a, b) => new Date(b.timestamp ?? b.imported_at).getTime() - new Date(a.timestamp ?? a.imported_at).getTime()));
    setDevices((current) => {
      const retained = Math.min(payload.begin.history_capacity, payload.sessions.length);
      const nextDevice: BadgeDevice = {
        badge_id: payload.begin.badge_id,
        firmware_version: payload.begin.firmware_version,
        last_import_at: importedAt,
        history_capacity: payload.begin.history_capacity,
        retained_sessions: retained,
        export_schema: "REFLEX_EXPORT_V1",
        import_status: importedSessions.length ? "Healthy" : "Needs attention",
        data_completeness: Math.round((retained / Math.max(1, payload.begin.history_capacity)) * 100),
      };
      return [nextDevice, ...current.filter((device) => device.badge_id !== payload.begin.badge_id)];
    });
    setImports((current) => [{
      id: `imp-${Date.now()}`,
      badge_id: payload.begin.badge_id,
      firmware_version: payload.begin.firmware_version,
      imported_at: importedAt,
      new_sessions: importedSessions.length,
      duplicate_sessions: payload.sessions.length - importedSessions.length,
      retained_sessions: payload.sessions.length,
      history_capacity: payload.begin.history_capacity,
      status: importedSessions.length ? "Complete" : "Duplicate-only",
    }, ...current]);
    setActiveTab("overview");
  }

  function clearLocalHistory() {
    setSessions([]);
    setHealthLogs([]);
    setDevices([]);
    setImports([]);
    setDemoMode(false);
    fetch("/api/history", { method: "DELETE" }).catch(() => undefined);
  }

  async function addHealthLog(log: HealthLog) {
    const response = await fetch("/api/health", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(log),
    });
    const result = await response.json() as { log?: HealthLog; error?: string };
    if (!response.ok || !result.log) throw new Error(result.error ?? "Could not save health log");
    setHealthLogs((current) => [result.log!, ...current]);
    localStorage.setItem(healthReminderDismissKey(), "1");
    setHealthReminderDismissed(true);
  }

  async function saveResearchSettings(nextProfile = researchProfile, nextEnabled = researchEnabled) {
    const response = await fetch("/api/research-consent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: nextEnabled, profile: nextProfile }),
    });
    const result = await response.json() as ResearchSettingsPayload & { error?: string };
    if (!response.ok) throw new Error(result.error ?? "Could not save research settings");
    setResearchEnabled(result.consent?.enabled ?? nextEnabled);
    setResearchProfile({ ...blankResearchProfile(), ...result.profile });
  }

  function updateResearchEnabled(enabled: boolean) {
    setResearchEnabled(enabled);
    if (user && !demoMode) saveResearchSettings(researchProfile, enabled).catch(() => setResearchEnabled(!enabled));
  }

  function dismissHealthReminder() {
    localStorage.setItem(healthReminderDismissKey(), "1");
    setHealthReminderDismissed(true);
  }

  async function requestHealthNotifications() {
    if (!("Notification" in window)) {
      setNotificationPermission("unsupported");
      return;
    }
    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);
  }

  function setDefaultLanding(tab: TabId) {
    setDefaultLandingState(tab);
    setActiveTab(tab);
  }

  if (!isLoaded) return <SignedOutIntro onTryDemo={() => enableDemo(true)} />;
  if (!user && !demoMode) return <SignedOutIntro onTryDemo={() => enableDemo(true)} />;

  return (
    <MotionConfig reducedMotion="user">
      <div className={classNames("app-shell", chartDensity === "comfortable" && "density-comfortable")}>
        <AppNav activeTab={activeTab} onTabChange={setActiveTab} />
        <main className="dashboard-main">
        <header className="dashboard-header">
          <div>
            <p className="eyebrow">REFLEX CONSOLE</p>
            <h1>{tabs.find((tab) => tab.id === activeTab)?.label}</h1>
            <p>Private cognitive-performance and reaction-training dashboard for ESP32 badge sessions.</p>
            {user ? <span className={classNames("cloud-status", cloudStatus === "ready" && "good", cloudStatus === "error" && "error")}>{cloudMessage}</span> : null}
          </div>
        </header>
        {showHealthReminder ? (
          <section className="health-reminder" role="status" aria-live="polite">
            <div>
              <strong>Health check-in due</strong>
              <p>Log today’s sleep, stress, caffeine, hydration, and mood context. Browser reminders fire at 9 AM, 2 PM, and 8 PM while the dashboard is open.</p>
            </div>
            <div className="action-row">
              <button type="button" onClick={() => setActiveTab("health")}>Log Health</button>
              {notificationPermission === "default" ? <button className="secondary" type="button" onClick={requestHealthNotifications}>Enable Reminders</button> : null}
              <button className="secondary" type="button" onClick={dismissHealthReminder}>Not Now</button>
            </div>
          </section>
        ) : null}
          <MotionScene sceneKey={activeTab}>
            {activeTab === "overview" && visibleSessions.length ? <OverviewTab sessions={visibleSessions} healthLogs={visibleHealthLogs} imports={imports} suggestions={suggestions} /> : null}
            {activeTab === "overview" && !visibleSessions.length ? <div className="tab-stack"><EmptyState title="No badge sessions yet" detail="Connect your badge over Bluetooth, upload a JSON export, or enable Demo Mode from Settings to start reviewing performance trends." actions={<><button onClick={() => setActiveTab("import")} type="button">Connect Badge</button><button className="secondary" onClick={() => setActiveTab("settings")} type="button">Open Settings</button></>} /><Disclaimer /></div> : null}
            {activeTab === "import" ? <ImportTab sessions={visibleSessions} onImportExport={importExportPayload} /> : null}
            {activeTab === "sessions" ? <SessionsTab sessions={visibleSessions} /> : null}
            {activeTab === "tests" ? <TestsTab sessions={visibleSessions} /> : null}
            {activeTab === "health" ? <HealthTab sessions={visibleSessions} healthLogs={visibleHealthLogs} onAddHealthLog={addHealthLog} /> : null}
            {activeTab === "training" ? <TrainingTab sessions={visibleSessions} healthLogs={visibleHealthLogs} suggestions={suggestions} /> : null}
            {activeTab === "research" ? <ResearchTab researchRows={researchRows} enabled={researchEnabled} setEnabled={updateResearchEnabled} profile={researchProfile} onSaveProfile={(profile) => saveResearchSettings(profile, researchEnabled)} /> : null}
            {activeTab === "devices" ? <DevicesTab devices={devices} imports={imports} /> : null}
            {activeTab === "exports" ? <ExportsTab sessions={visibleSessions} healthLogs={visibleHealthLogs} onDeleteHistory={clearLocalHistory} /> : null}
            {activeTab === "settings" ? <SettingsTab demoMode={demoMode} setDemoMode={enableDemo} researchEnabled={researchEnabled} setResearchEnabled={updateResearchEnabled} sessions={visibleSessions} healthLogs={visibleHealthLogs} chartDensity={chartDensity} setChartDensity={setChartDensity} defaultLanding={defaultLanding} setDefaultLanding={setDefaultLanding} onDeleteHistory={clearLocalHistory} /> : null}
          </MotionScene>
        </main>
      </div>
    </MotionConfig>
  );
}
