import { auth } from "@clerk/nextjs/server";
import { getSql } from "@/lib/db";

const quote = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;

export async function GET() {
  const { userId } = await auth();
  if (!userId) return new Response("Unauthorized", { status: 401 });
  const sql = getSql();
  const rows = await sql`
    SELECT d.badge_id, s.sequence, s.test_type, s.score, s.median_ms, s.spread_ms,
           s.lapses, s.false_starts, s.attempts, s.correct, s.rhythm_bias_ms, s.imported_at
    FROM sessions s JOIN devices d ON d.id = s.device_id
    WHERE s.clerk_user_id = ${userId} AND d.clerk_user_id = ${userId}
    ORDER BY d.badge_id, s.sequence
  ` as unknown as {
    badge_id: string; sequence: number; test_type: string; score: number; median_ms: number; spread_ms: number;
    lapses: number; false_starts: number; attempts: number; correct: number; rhythm_bias_ms: number; imported_at: string;
  }[];
  const headers = ["badge_id", "sequence", "test_type", "score", "median_ms", "spread_ms", "lapses", "false_starts", "attempts", "correct", "rhythm_bias_ms", "imported_at"];
  const body = [headers.join(","), ...rows.map((row) => headers.map((header) => quote(row[header as keyof typeof row])).join(","))].join("\n");
  return new Response(body, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=reflex-sessions.csv" } });
}
