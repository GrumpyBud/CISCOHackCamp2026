import { createHash } from "crypto";
import { auth, clerkClient } from "@clerk/nextjs/server";
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
    CREATE TABLE IF NOT EXISTS research_profile (
      clerk_user_id TEXT PRIMARY KEY,
      age_years INTEGER,
      gender TEXT,
      handedness TEXT,
      account_age_days INTEGER,
      notes TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await sql`ALTER TABLE research_profile ADD COLUMN IF NOT EXISTS age_years INTEGER`;
  await sql`ALTER TABLE research_profile ADD COLUMN IF NOT EXISTS gender TEXT`;
  await sql`ALTER TABLE research_profile ADD COLUMN IF NOT EXISTS handedness TEXT`;
  await sql`ALTER TABLE research_profile ADD COLUMN IF NOT EXISTS account_age_days INTEGER`;
  await sql`ALTER TABLE research_profile ADD COLUMN IF NOT EXISTS notes TEXT`;
  await sql`ALTER TABLE research_profile ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`;
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

export async function getAccountAgeDays(userId: string) {
  try {
    const { userId: authenticatedUserId } = await auth();
    if (!authenticatedUserId || authenticatedUserId !== userId) return null;
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    const createdAt = user.createdAt;
    if (!createdAt) return null;
    const created = new Date(createdAt as string | number | Date);
    if (Number.isNaN(created.getTime())) return null;
    return Math.max(0, Math.floor((Date.now() - created.getTime()) / 86_400_000));
  } catch {
    return null;
  }
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

export async function getResearchProfile(userId: string) {
  await ensureResearchTables();
  const sql = getSql();
  const rows = await sql`
    SELECT age_years, account_age_days, gender, handedness, notes, updated_at::text
    FROM research_profile
    WHERE clerk_user_id = ${userId}
  ` as unknown as { age_years: number | null; account_age_days: number | null; gender: string | null; handedness: string | null; notes: string | null; updated_at: string }[];
  return rows[0] ?? { age_years: null, account_age_days: null, gender: "", handedness: "", notes: "", updated_at: "" };
}

export async function setResearchProfile(userId: string, profile: { age_years?: number | null; account_age_days?: number | null; gender?: string | null; handedness?: string | null; notes?: string | null }) {
  await ensureResearchTables();
  const sql = getSql();
  const rows = await sql`
    INSERT INTO research_profile (clerk_user_id, age_years, account_age_days, gender, handedness, notes, updated_at)
    VALUES (${userId}, ${profile.age_years ?? null}, ${profile.account_age_days ?? null}, ${profile.gender ?? null}, ${profile.handedness ?? null}, ${profile.notes ?? null}, now())
    ON CONFLICT (clerk_user_id) DO UPDATE SET
      age_years = EXCLUDED.age_years,
      account_age_days = EXCLUDED.account_age_days,
      gender = EXCLUDED.gender,
      handedness = EXCLUDED.handedness,
      notes = EXCLUDED.notes,
      updated_at = now()
    RETURNING age_years, account_age_days, gender, handedness, notes, updated_at::text
  ` as unknown as { age_years: number | null; account_age_days: number | null; gender: string | null; handedness: string | null; notes: string | null; updated_at: string }[];
  return rows[0] ?? { age_years: profile.age_years ?? null, account_age_days: profile.account_age_days ?? null, gender: profile.gender ?? "", handedness: profile.handedness ?? "", notes: profile.notes ?? "", updated_at: "" };
}

export async function getResearchSessions(userId: string) {
  await ensureResearchTables();
  const sql = getSql();
  const rows = await sql`
    SELECT sequence, test_type, score, median_ms, spread_ms, lapses, false_starts, attempts, correct, rhythm_bias_ms, imported_at::text
    FROM research_sessions
    WHERE pseudonymous_user_id = ${hashValue(`user:${userId}`)}
    ORDER BY imported_at DESC, sequence DESC
    LIMIT 50
  ` as unknown as { sequence: number; test_type: string; score: number; median_ms: number; spread_ms: number; lapses: number; false_starts: number; attempts: number; correct: number; rhythm_bias_ms: number; imported_at: string }[];
  return rows;
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
