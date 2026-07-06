import { auth } from "@clerk/nextjs/server";
import { getSql } from "@/lib/db";

const quote = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;

export async function GET() {
  const { userId } = await auth();
  if (!userId) return new Response("Unauthorized", { status: 401 });
  const sql = getSql();
  const rows = await sql`
    SELECT d.badge_id, s.sequence, s.test_type, s.score, s.median_ms, s.spread_ms,
           s.lapses, s.false_starts, s.attempts, s.correct, s.rhythm_bias_ms, s.imported_at,
           h.log_time, h.context AS health_context, h.wake_time, h.sleep_hours, h.sleep_quality, h.stress, h.mood, h.exercise_minutes,
           h.caffeine_mg, h.caffeine_recent_mg, h.hydration, h.notes AS health_notes
    FROM sessions s JOIN devices d ON d.id = s.device_id
    LEFT JOIN LATERAL (
      SELECT left(log_time::text, 5) AS log_time, context, left(wake_time::text, 5) AS wake_time,
             sleep_hours, sleep_quality, stress, mood, exercise_minutes, caffeine_mg, caffeine_recent_mg, hydration, notes
      FROM health_logs
      WHERE clerk_user_id = s.clerk_user_id AND log_date = s.imported_at::date
      ORDER BY log_time DESC, id DESC
      LIMIT 1
    ) h ON true
    WHERE s.clerk_user_id = ${userId} AND d.clerk_user_id = ${userId}
    ORDER BY d.badge_id, s.sequence
  ` as unknown as {
    badge_id: string; sequence: number; test_type: string; score: number; median_ms: number; spread_ms: number;
    lapses: number; false_starts: number; attempts: number; correct: number; rhythm_bias_ms: number; imported_at: string;
    log_time: string | null; health_context: string | null; wake_time: string | null;
    sleep_hours: number | null; sleep_quality: number | null; stress: number | null; mood: number | null;
    exercise_minutes: number | null; caffeine_mg: number | null; caffeine_recent_mg: number | null; hydration: number | null; health_notes: string | null;
  }[];
  const headers = ["badge_id", "sequence", "test_type", "score", "median_ms", "spread_ms", "lapses", "false_starts", "attempts", "correct", "rhythm_bias_ms", "imported_at", "log_time", "health_context", "wake_time", "sleep_hours", "sleep_quality", "stress", "mood", "exercise_minutes", "caffeine_mg", "caffeine_recent_mg", "hydration", "health_notes"];
  const body = [headers.join(","), ...rows.map((row) => headers.map((header) => quote(row[header as keyof typeof row])).join(","))].join("\n");
  return new Response(body, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=reflex-sessions.csv" } });
}
