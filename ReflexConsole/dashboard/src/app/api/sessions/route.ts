import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { TEST_TYPES, TestType } from "@/lib/types";

type SessionRow = {
  sequence: number; test_type: TestType; score: number; median: number; spread: number;
  lapses: number; false_starts: number; attempts: number; correct: number; rhythm_bias: number;
  badge_id: string; firmware_version: string; imported_at: string;
};

type DeviceRow = {
  badge_id: string; firmware_version: string; last_import_at: string; history_capacity: number;
  retained_sessions: number; export_schema: "REFLEX_EXPORT_V1"; import_status: "Healthy" | "Needs attention" | "Old import";
  data_completeness: number;
};

type ImportRow = {
  id: string; badge_id: string; firmware_version: string; imported_at: string; new_sessions: number;
  duplicate_sessions: number; retained_sessions: number; history_capacity: number; status: "Complete" | "Duplicate-only" | "Failed";
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
               d.badge_id, COALESCE(d.firmware_version, 'unknown') AS firmware_version, s.imported_at::text
        FROM sessions s JOIN devices d ON d.id = s.device_id
        WHERE s.clerk_user_id = ${userId} AND d.clerk_user_id = ${userId} AND s.test_type = ${candidate}
        ORDER BY s.imported_at DESC, s.sequence DESC
      ` as unknown as SessionRow[]
    : await sql`
        SELECT s.sequence, s.test_type, s.score, s.median_ms AS median, s.spread_ms AS spread,
               s.lapses, s.false_starts, s.attempts, s.correct, s.rhythm_bias_ms AS rhythm_bias,
               d.badge_id, COALESCE(d.firmware_version, 'unknown') AS firmware_version, s.imported_at::text
        FROM sessions s JOIN devices d ON d.id = s.device_id
        WHERE s.clerk_user_id = ${userId} AND d.clerk_user_id = ${userId}
        ORDER BY s.imported_at DESC, s.sequence DESC
      ` as unknown as SessionRow[];

  if (candidate) {
    return NextResponse.json({
      sessions: rows.map((row) => ({ ...row, type: "session", timestamp: row.imported_at })),
    });
  }

  const devices = await sql`
    SELECT
      d.badge_id,
      COALESCE(d.firmware_version, 'unknown') AS firmware_version,
      COALESCE(MAX(s.imported_at), d.updated_at)::text AS last_import_at,
      COALESCE(d.history_capacity, 0)::int AS history_capacity,
      COUNT(s.id)::int AS retained_sessions,
      'REFLEX_EXPORT_V1' AS export_schema,
      CASE
        WHEN COUNT(s.id) = 0 THEN 'Needs attention'
        WHEN COALESCE(MAX(s.imported_at), d.updated_at) < now() - interval '5 days' THEN 'Old import'
        ELSE 'Healthy'
      END AS import_status,
      CASE
        WHEN COALESCE(d.history_capacity, 0) > 0 THEN LEAST(100, ROUND((COUNT(s.id)::numeric / d.history_capacity) * 100))::int
        ELSE 0
      END AS data_completeness
    FROM devices d
    LEFT JOIN sessions s ON s.device_id = d.id AND s.clerk_user_id = ${userId}
    WHERE d.clerk_user_id = ${userId}
    GROUP BY d.id
    ORDER BY COALESCE(MAX(s.imported_at), d.updated_at) DESC
  ` as unknown as DeviceRow[];

  const imports: ImportRow[] = devices.map((device) => ({
    id: `${device.badge_id}-${device.last_import_at}`,
    badge_id: device.badge_id,
    firmware_version: device.firmware_version,
    imported_at: device.last_import_at,
    new_sessions: device.retained_sessions,
    duplicate_sessions: 0,
    retained_sessions: device.retained_sessions,
    history_capacity: device.history_capacity,
    status: device.retained_sessions ? "Complete" : "Duplicate-only",
  }));

  return NextResponse.json({
    sessions: rows.map((row) => ({ ...row, type: "session", timestamp: row.imported_at })),
    devices,
    imports,
  });
}
