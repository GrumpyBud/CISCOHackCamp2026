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

function parseHealthLog(value: unknown): HealthLog {
  if (!isRecord(value)) throw new Error("Expected a health log object");
  const logDate = String(value.log_date ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(logDate)) throw new Error("log_date must use YYYY-MM-DD");
  return {
    log_date: logDate,
    sleep_hours: Math.round(toNumber(value.sleep_hours, "sleep_hours", 0, 16) * 10) / 10,
    sleep_quality: Math.round(toNumber(value.sleep_quality, "sleep_quality", 1, 10)),
    stress: Math.round(toNumber(value.stress, "stress", 1, 10)),
    mood: Math.round(toNumber(value.mood, "mood", 1, 10)),
    exercise_minutes: Math.round(toNumber(value.exercise_minutes, "exercise_minutes", 0, 600)),
    caffeine_mg: Math.round(toNumber(value.caffeine_mg, "caffeine_mg", 0, 1200)),
    hydration: Math.round(toNumber(value.hydration, "hydration", 1, 10)),
    notes: toText(value.notes, 600),
  };
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sql = getSql();
  const logs = await sql`
    SELECT id, log_date::text, sleep_hours, sleep_quality, stress, mood, exercise_minutes,
           caffeine_mg, hydration, notes, created_at::text, updated_at::text
    FROM health_logs
    WHERE clerk_user_id = ${userId}
    ORDER BY log_date DESC
    LIMIT 120
  ` as unknown as HealthLogRow[];
  return NextResponse.json({ logs });
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const log = parseHealthLog(await request.json());
    const sql = getSql();
    const rows = await sql`
      INSERT INTO health_logs (
        clerk_user_id, log_date, sleep_hours, sleep_quality, stress, mood, exercise_minutes,
        caffeine_mg, hydration, notes, updated_at
      ) VALUES (
        ${userId}, ${log.log_date}, ${log.sleep_hours}, ${log.sleep_quality}, ${log.stress}, ${log.mood},
        ${log.exercise_minutes}, ${log.caffeine_mg}, ${log.hydration}, ${log.notes}, now()
      )
      ON CONFLICT (clerk_user_id, log_date) DO UPDATE SET
        sleep_hours = EXCLUDED.sleep_hours,
        sleep_quality = EXCLUDED.sleep_quality,
        stress = EXCLUDED.stress,
        mood = EXCLUDED.mood,
        exercise_minutes = EXCLUDED.exercise_minutes,
        caffeine_mg = EXCLUDED.caffeine_mg,
        hydration = EXCLUDED.hydration,
        notes = EXCLUDED.notes,
        updated_at = now()
      RETURNING id, log_date::text, sleep_hours, sleep_quality, stress, mood, exercise_minutes,
                caffeine_mg, hydration, notes, created_at::text, updated_at::text
    ` as unknown as HealthLogRow[];
    return NextResponse.json({ log: rows[0] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save health log";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
