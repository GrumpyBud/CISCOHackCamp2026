import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { TEST_TYPES, TestType } from "@/lib/types";

type SessionRow = {
  sequence: number; test_type: TestType; score: number; median: number; spread: number;
  lapses: number; false_starts: number; attempts: number; correct: number; rhythm_bias: number;
  badge_id: string; imported_at: string;
};

export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const candidate = new URL(request.url).searchParams.get("testType");
  if (candidate && !TEST_TYPES.includes(candidate as TestType)) return NextResponse.json({ error: "Invalid test type" }, { status: 400 });
  const sql = getSql();
  const rows: SessionRow[] = candidate
    ? await sql`
        SELECT s.sequence, s.test_type, s.score, s.median_ms AS median, s.spread_ms AS spread,
               s.lapses, s.false_starts, s.attempts, s.correct, s.rhythm_bias_ms AS rhythm_bias,
               d.badge_id, s.imported_at
        FROM sessions s JOIN devices d ON d.id = s.device_id
        WHERE s.clerk_user_id = ${userId} AND d.clerk_user_id = ${userId} AND s.test_type = ${candidate}
        ORDER BY s.sequence DESC
      ` as unknown as SessionRow[]
    : await sql`
        SELECT s.sequence, s.test_type, s.score, s.median_ms AS median, s.spread_ms AS spread,
               s.lapses, s.false_starts, s.attempts, s.correct, s.rhythm_bias_ms AS rhythm_bias,
               d.badge_id, s.imported_at
        FROM sessions s JOIN devices d ON d.id = s.device_id
        WHERE s.clerk_user_id = ${userId} AND d.clerk_user_id = ${userId}
        ORDER BY s.sequence DESC
      ` as unknown as SessionRow[];
  return NextResponse.json({ sessions: rows });
}
