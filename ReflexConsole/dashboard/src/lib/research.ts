import { createHash } from "crypto";
import { getSql } from "@/lib/db";
import { ReflexExport } from "@/lib/types";

const hashValue = (value: string) => createHash("sha256")
  .update(process.env.RESEARCH_HASH_SALT || process.env.CLERK_SECRET_KEY || "reflex-console-research-v1")
  .update(":")
  .update(value)
  .digest("hex");

export async function ensureResearchTables() {
  const sql = getSql();
  await sql`
    CREATE TABLE IF NOT EXISTS research_consent (
      clerk_user_id TEXT PRIMARY KEY,
      enabled BOOLEAN NOT NULL DEFAULT true,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await sql`ALTER TABLE research_consent ALTER COLUMN enabled SET DEFAULT true`;
  await sql`
    CREATE TABLE IF NOT EXISTS research_sessions (
      id BIGSERIAL PRIMARY KEY,
      pseudonymous_user_id TEXT NOT NULL,
      badge_hash TEXT NOT NULL,
      firmware_version TEXT,
      sequence BIGINT NOT NULL,
      test_type TEXT NOT NULL,
      score SMALLINT NOT NULL CHECK (score BETWEEN 0 AND 100),
      median_ms INTEGER NOT NULL CHECK (median_ms >= 0),
      spread_ms REAL NOT NULL CHECK (spread_ms >= 0),
      lapses SMALLINT NOT NULL CHECK (lapses >= 0),
      false_starts SMALLINT NOT NULL CHECK (false_starts >= 0),
      attempts SMALLINT NOT NULL CHECK (attempts >= 0),
      correct SMALLINT NOT NULL CHECK (correct >= 0),
      rhythm_bias_ms SMALLINT NOT NULL,
      imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (pseudonymous_user_id, badge_hash, sequence)
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS research_sessions_type_idx ON research_sessions (test_type, imported_at DESC)`;
}

export async function getResearchConsent(userId: string) {
  await ensureResearchTables();
  const sql = getSql();
  const rows = await sql`
    SELECT enabled, updated_at::text
    FROM research_consent
    WHERE clerk_user_id = ${userId}
  ` as unknown as { enabled: boolean; updated_at: string }[];
  return rows[0] ?? { enabled: true, updated_at: "" };
}

export async function setResearchConsent(userId: string, enabled: boolean) {
  await ensureResearchTables();
  const sql = getSql();
  const rows = await sql`
    INSERT INTO research_consent (clerk_user_id, enabled, updated_at)
    VALUES (${userId}, ${enabled}, now())
    ON CONFLICT (clerk_user_id) DO UPDATE SET
      enabled = EXCLUDED.enabled,
      updated_at = now()
    RETURNING enabled, updated_at::text
  ` as unknown as { enabled: boolean; updated_at: string }[];
  return rows[0] ?? { enabled, updated_at: "" };
}

export async function recordResearchSessions(userId: string, payload: ReflexExport) {
  const consent = await getResearchConsent(userId);
  if (!consent.enabled) return 0;
  const sql = getSql();
  const userHash = hashValue(`user:${userId}`);
  const badgeHash = hashValue(`badge:${userId}:${payload.begin.badge_id}`);
  for (const session of payload.sessions) {
    await sql`
      INSERT INTO research_sessions (
        pseudonymous_user_id, badge_hash, firmware_version, sequence, test_type, score, median_ms,
        spread_ms, lapses, false_starts, attempts, correct, rhythm_bias_ms
      ) VALUES (
        ${userHash}, ${badgeHash}, ${payload.begin.firmware_version}, ${session.sequence}, ${session.test_type}, ${session.score}, ${session.median},
        ${session.spread}, ${session.lapses}, ${session.false_starts}, ${session.attempts}, ${session.correct}, ${session.rhythm_bias}
      )
      ON CONFLICT (pseudonymous_user_id, badge_hash, sequence) DO UPDATE SET
        test_type = EXCLUDED.test_type,
        score = EXCLUDED.score,
        median_ms = EXCLUDED.median_ms,
        spread_ms = EXCLUDED.spread_ms,
        lapses = EXCLUDED.lapses,
        false_starts = EXCLUDED.false_starts,
        attempts = EXCLUDED.attempts,
        correct = EXCLUDED.correct,
        rhythm_bias_ms = EXCLUDED.rhythm_bias_ms
    `;
  }
  return payload.sessions.length;
}
