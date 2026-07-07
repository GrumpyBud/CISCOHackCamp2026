import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { validateExport } from "@/lib/export";
import { recordResearchSessions } from "@/lib/research";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const payload = validateExport(await request.json());
    const sql = getSql();
    const devices = await sql`
      INSERT INTO devices (clerk_user_id, badge_id, firmware_version, history_capacity, updated_at)
      VALUES (${userId}, ${payload.begin.badge_id}, ${payload.begin.firmware_version}, ${payload.begin.history_capacity}, now())
      ON CONFLICT (clerk_user_id, badge_id) DO UPDATE
      SET firmware_version = EXCLUDED.firmware_version,
          history_capacity = EXCLUDED.history_capacity,
          updated_at = now()
      RETURNING id
    ` as unknown as { id: number }[];
    const deviceId = devices[0]?.id;
    if (!deviceId) throw new Error("Could not create device");

    for (const session of payload.sessions) {
      await sql`
        INSERT INTO sessions (
          clerk_user_id, device_id, sequence, test_type, score, median_ms, spread_ms,
          lapses, false_starts, attempts, correct, rhythm_bias_ms
        ) VALUES (
          ${userId}, ${deviceId}, ${session.sequence}, ${session.test_type}, ${session.score}, ${session.median}, ${session.spread},
          ${session.lapses}, ${session.false_starts}, ${session.attempts}, ${session.correct}, ${session.rhythm_bias}
        ) ON CONFLICT (clerk_user_id, device_id, sequence) DO UPDATE SET
          test_type = EXCLUDED.test_type, score = EXCLUDED.score, median_ms = EXCLUDED.median_ms,
          spread_ms = EXCLUDED.spread_ms, lapses = EXCLUDED.lapses, false_starts = EXCLUDED.false_starts,
          attempts = EXCLUDED.attempts, correct = EXCLUDED.correct, rhythm_bias_ms = EXCLUDED.rhythm_bias_ms
      `;
    }
    const researchImported = await recordResearchSessions(userId, payload);
    return NextResponse.json({ imported: payload.sessions.length, badgeId: payload.begin.badge_id, researchImported });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Import failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
