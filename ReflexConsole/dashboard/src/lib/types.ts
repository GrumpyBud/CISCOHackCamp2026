export const TEST_TYPES = ["quick", "focus", "choice", "rhythm"] as const;
export type TestType = (typeof TEST_TYPES)[number];

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
  imported_at: string;
};
