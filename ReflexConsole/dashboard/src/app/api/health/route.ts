import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { HealthLog } from "@/lib/types";

type HealthLogRow = HealthLog & { id: number; created_at: string; updated_at: string };

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const toNumber = (value: unknown, field: string, min: number, max: number) => {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) throw new Error(`${field} must be between ${min} and ${max}`);
  return parsed;
};
const toText = (value: unknown, maxLength: number) => String(value ?? "").trim().slice(0, maxLength);

async function ensureHealthLogsTable() {
  const sql = getSql();
  await sql`
    CREATE TABLE IF NOT EXISTS health_logs (
      id BIGSERIAL PRIMARY KEY,
      clerk_user_id TEXT NOT NULL,
      log_date DATE NOT NULL,
      log_time TIME NOT NULL DEFAULT CURRENT_TIME,
      context TEXT NOT NULL DEFAULT 'check-in',
      wake_time TIME NOT NULL DEFAULT '07:00',
      sleep_hours REAL NOT NULL CHECK (sleep_hours BETWEEN 0 AND 16),
      sleep_quality SMALLINT NOT NULL CHECK (sleep_quality BETWEEN 1 AND 10),
      stress SMALLINT NOT NULL CHECK (stress BETWEEN 1 AND 10),
      mood SMALLINT NOT NULL CHECK (mood BETWEEN 1 AND 10),
      exercise_minutes SMALLINT NOT NULL CHECK (exercise_minutes BETWEEN 0 AND 600),
      caffeine_mg SMALLINT NOT NULL CHECK (caffeine_mg BETWEEN 0 AND 1200),
      caffeine_recent_mg SMALLINT NOT NULL DEFAULT 0 CHECK (caffeine_recent_mg BETWEEN 0 AND 1200),
      hydration SMALLINT NOT NULL CHECK (hydration BETWEEN 1 AND 10),
      notes TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await sql`ALTER TABLE health_logs ADD COLUMN IF NOT EXISTS log_time TIME NOT NULL DEFAULT CURRENT_TIME`;
  await sql`ALTER TABLE health_logs ADD COLUMN IF NOT EXISTS context TEXT NOT NULL DEFAULT 'check-in'`;
  await sql`ALTER TABLE health_logs ADD COLUMN IF NOT EXISTS wake_time TIME NOT NULL DEFAULT '07:00'`;
  await sql`ALTER TABLE health_logs ADD COLUMN IF NOT EXISTS caffeine_recent_mg SMALLINT NOT NULL DEFAULT 0`;
  await sql`ALTER TABLE health_logs DROP CONSTRAINT IF EXISTS health_logs_clerk_user_id_log_date_key`;
  await sql`CREATE INDEX IF NOT EXISTS health_logs_user_date_idx ON health_logs (clerk_user_id, log_date DESC, log_time DESC, id DESC)`;
}

function parseHealthLog(value: unknown): HealthLog {
  if (!isRecord(value)) throw new Error("Expected a health log object");
  const logDate = String(value.log_date ?? "");
  const logTime = String(value.log_time ?? "").slice(0, 5);
  const wakeTime = String(value.wake_time ?? "").slice(0, 5);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(logDate)) throw new Error("log_date must use YYYY-MM-DD");
  if (!/^\d{2}:\d{2}$/.test(logTime)) throw new Error("log_time must use HH:MM");
  if (!/^\d{2}:\d{2}$/.test(wakeTime)) throw new Error("wake_time must use HH:MM");
  return {
    log_date: logDate,
    log_time: logTime,
    context: toText(value.context, 40) || "check-in",
    wake_time: wakeTime,
    sleep_hours: Math.round(toNumber(value.sleep_hours, "sleep_hours", 0, 16) * 10) / 10,
    sleep_quality: Math.round(toNumber(value.sleep_quality, "sleep_quality", 1, 10)),
    stress: Math.round(toNumber(value.stress, "stress", 1, 10)),
    mood: Math.round(toNumber(value.mood, "mood", 1, 10)),
    exercise_minutes: Math.round(toNumber(value.exercise_minutes, "exercise_minutes", 0, 600)),
    caffeine_mg: Math.round(toNumber(value.caffeine_mg, "caffeine_mg", 0, 1200)),
    caffeine_recent_mg: Math.round(toNumber(value.caffeine_recent_mg, "caffeine_recent_mg", 0, 1200)),
    hydration: Math.round(toNumber(value.hydration, "hydration", 1, 10)),
    notes: toText(value.notes, 600),
  };
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ensureHealthLogsTable();
  const sql = getSql();
  const logs = await sql`
    SELECT id, log_date::text, left(log_time::text, 5) AS log_time, context, left(wake_time::text, 5) AS wake_time,
           sleep_hours, sleep_quality, stress, mood, exercise_minutes,
           caffeine_mg, caffeine_recent_mg, hydration, notes, created_at::text, updated_at::text
    FROM health_logs
    WHERE clerk_user_id = ${userId}
    ORDER BY log_date DESC, log_time DESC, id DESC
    LIMIT 120
  ` as unknown as HealthLogRow[];
  return NextResponse.json({ logs });
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const log = parseHealthLog(await request.json());
    await ensureHealthLogsTable();
    const sql = getSql();
    const prior = await sql`
      SELECT COALESCE(SUM(caffeine_recent_mg), 0)::int AS total
      FROM health_logs
      WHERE clerk_user_id = ${userId} AND log_date = ${log.log_date}
    ` as unknown as { total: number }[];
    const caffeineFloor = Math.min(1200, (prior[0]?.total ?? 0) + log.caffeine_recent_mg);
    const caffeineTotal = Math.max(log.caffeine_mg, caffeineFloor);
    const rows = await sql`
      INSERT INTO health_logs (
        clerk_user_id, log_date, log_time, context, wake_time, sleep_hours, sleep_quality, stress, mood, exercise_minutes,
        caffeine_mg, caffeine_recent_mg, hydration, notes, updated_at
      ) VALUES (
        ${userId}, ${log.log_date}, ${log.log_time}, ${log.context}, ${log.wake_time}, ${log.sleep_hours}, ${log.sleep_quality}, ${log.stress}, ${log.mood},
        ${log.exercise_minutes}, ${caffeineTotal}, ${log.caffeine_recent_mg}, ${log.hydration}, ${log.notes}, now()
      )
      RETURNING id, log_date::text, left(log_time::text, 5) AS log_time, context, left(wake_time::text, 5) AS wake_time,
                sleep_hours, sleep_quality, stress, mood, exercise_minutes,
                caffeine_mg, caffeine_recent_mg, hydration, notes, created_at::text, updated_at::text
    ` as unknown as HealthLogRow[];
    return NextResponse.json({ log: rows[0] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save health log";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
