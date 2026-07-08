export const TEST_TYPES = ["quick", "focus", "choice", "rhythm", "memory"] as const;
export type TestType = (typeof TEST_TYPES)[number];

export const TEST_LABELS: Record<TestType, string> = {
  quick: "Quick",
  focus: "Focus",
  choice: "Choice",
  rhythm: "Rhythm",
  memory: "Memory",
};

export type ExportSession = {
  type: "session";
  sequence: number;
  test_type: TestType;
  score: number;
  median: number;
  spread: number;
  lapses: number;
  false_starts: number;
  attempts: number;
  correct: number;
  rhythm_bias: number;
};

export type ExportBegin = {
  type: "begin";
  protocol: 1;
  firmware_version: string;
  badge_id: string;
  history_capacity: number;
  session_sequence_start: number;
  session_sequence_end: number;
  session_count: number;
};

export type ExportEnd = {
  type: "end";
  protocol: 1;
  session_count: number;
  session_sequence_start: number;
  session_sequence_end: number;
};

export type ReflexExport = {
  format: "reflex-console-export";
  protocol: 1;
  begin: ExportBegin;
  sessions: ExportSession[];
  end: ExportEnd;
};

export type DashboardSession = ExportSession & {
  badge_id: string;
  firmware_version?: string;
  timestamp?: string;
  imported_at: string;
};

export type BadgeDevice = {
  badge_id: string;
  firmware_version: string;
  last_import_at: string;
  history_capacity: number;
  retained_sessions: number;
  export_schema: "REFLEX_EXPORT_V1";
  import_status: "Healthy" | "Needs attention" | "Old import";
  data_completeness: number;
};

export type ImportBatch = {
  id: string;
  badge_id: string;
  firmware_version: string;
  imported_at: string;
  new_sessions: number;
  duplicate_sessions: number;
  retained_sessions: number;
  history_capacity: number;
  status: "Complete" | "Duplicate-only" | "Failed";
};

export type HealthLog = {
  id?: number;
  log_date: string;
  log_time: string;
  context: string;
  wake_time: string;
  sleep_hours: number;
  sleep_quality: number;
  stress: number;
  mood: number;
  exercise_minutes: number;
  caffeine_mg: number;
  caffeine_recent_mg: number;
  hydration: number;
  notes: string;
  created_at?: string;
  updated_at?: string;
};

export type ResearchProfile = {
  age_years: number | null;
  account_age_days: number | null;
  gender: string;
  handedness: string;
  notes: string;
  updated_at?: string;
};

export type ResearchPreviewRow = {
  user_hash: string;
  badge_hash: string;
  test_type: TestType;
  timestamp_bucket: string;
  score: number;
  median_reaction_ms: number | null;
  spread_ms: number | null;
  lapses: number;
  accuracy: number | null;
  rhythm_timing_error_ms: number | null;
  memory_best_span: number | null;
  firmware_version: string;
  export_schema: "REFLEX_EXPORT_V1";
};

export type DemoData = {
  sessions: DashboardSession[];
  healthLogs: HealthLog[];
  devices: BadgeDevice[];
  importBatches: ImportBatch[];
  researchRows: ResearchPreviewRow[];
};
