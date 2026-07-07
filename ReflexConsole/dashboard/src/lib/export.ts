import { ExportBegin, ExportEnd, ExportSession, ReflexExport, TEST_TYPES, TestType } from "@/lib/types";

export const BADGE_EXPORT_PREFIX = "REFLEX_EXPORT ";

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const isInteger = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value);
const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

function fail(message: string): never { throw new Error(`Invalid Reflex export: ${message}`); }

function parseBegin(value: unknown): ExportBegin {
  if (!isRecord(value) || value.type !== "begin" || value.protocol !== 1) fail("missing protocol-1 begin frame");
  const requiredStrings = ["firmware_version", "badge_id"] as const;
  for (const field of requiredStrings) if (typeof value[field] !== "string" || !value[field]) fail(`invalid ${field}`);
  for (const field of ["history_capacity", "session_sequence_start", "session_sequence_end", "session_count"] as const) if (!isInteger(value[field]) || (value[field] as number) < 0) fail(`invalid ${field}`);
  if ((value.history_capacity as number) < 1 || (value.history_capacity as number) > 1000) fail("history capacity out of range");
  return value as ExportBegin;
}

function parseSession(value: unknown): ExportSession {
  if (!isRecord(value) || value.type !== "session") fail("invalid session frame");
  if (!isInteger(value.sequence) || value.sequence < 1) fail("invalid session sequence");
  if (!TEST_TYPES.includes(value.test_type as TestType)) fail("invalid test type");
  for (const field of ["score", "median", "lapses", "false_starts", "attempts", "correct", "rhythm_bias"] as const) if (!isInteger(value[field])) fail(`invalid ${field}`);
  if (!isNumber(value.spread) || value.spread < 0) fail("invalid spread");
  const session = value as ExportSession;
  if (session.score < 0 || session.score > 100 || session.median < 0 || session.lapses < 0 || session.false_starts < 0 || session.attempts < 0 || session.correct < 0 || session.correct > session.attempts) fail("session value out of range");
  return session;
}

function parseEnd(value: unknown): ExportEnd {
  if (!isRecord(value) || value.type !== "end" || value.protocol !== 1) fail("missing protocol-1 end frame");
  for (const field of ["session_count", "session_sequence_start", "session_sequence_end"] as const) if (!isInteger(value[field]) || (value[field] as number) < 0) fail(`invalid end ${field}`);
  return value as ExportEnd;
}

export function validateExport(value: unknown): ReflexExport {
  if (!isRecord(value) || value.format !== "reflex-console-export" || value.protocol !== 1 || !Array.isArray(value.sessions)) fail("expected a protocol-1 export file");
  const begin = parseBegin(value.begin);
  const end = parseEnd(value.end);
  const sessions = value.sessions.map(parseSession);
  if (sessions.length !== begin.session_count || sessions.length !== end.session_count) fail("session count does not match frames");
  if (sessions.length > begin.history_capacity) fail("session count exceeds history capacity");
  const sequences = sessions.map((session) => session.sequence);
  if (new Set(sequences).size !== sequences.length || sequences.some((sequence, index) => index > 0 && sequence <= sequences[index - 1])) fail("session sequences must be strictly ordered");
  const start = sessions[0]?.sequence ?? 0;
  const finish = sessions.at(-1)?.sequence ?? 0;
  if (begin.session_sequence_start !== start || begin.session_sequence_end !== finish || end.session_sequence_start !== start || end.session_sequence_end !== finish) fail("session range does not match frames");
  return { format: "reflex-console-export", protocol: 1, begin, sessions, end };
}

export function exportFromFrames(frames: unknown[]): ReflexExport {
  const parsed = frames.filter((frame): frame is Record<string, unknown> => isRecord(frame));
  const begin = parsed.find((frame) => frame.type === "begin");
  const end = parsed.find((frame) => frame.type === "end");
  const sessions = parsed.filter((frame) => frame.type === "session");
  return validateExport({ format: "reflex-console-export", protocol: 1, begin, sessions, end });
}

export function parseBadgeExportStream(value: string): ReflexExport {
  const lines = value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) fail("empty badge export stream");
  const frames = lines.map((line) => {
    if (!line.startsWith(BADGE_EXPORT_PREFIX)) fail("badge export stream missing REFLEX_EXPORT prefix");
    const json = line.slice(BADGE_EXPORT_PREFIX.length);
    try {
      return JSON.parse(json);
    } catch (error) {
      throw new Error(`Invalid badge export stream: ${error instanceof Error ? error.message : "bad JSON"}`);
    }
  });
  return exportFromFrames(frames);
}
