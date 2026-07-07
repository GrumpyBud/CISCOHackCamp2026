-- Optional research contribution tables. Session metrics are copied here when
-- research contribution remains enabled for the signed-in user. Research
-- sessions use salted pseudonymous user and badge hashes and do not copy
-- direct identifiers, health check-ins, or profile notes.
CREATE TABLE IF NOT EXISTS research_consent (
  clerk_user_id TEXT PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE research_consent ALTER COLUMN enabled SET DEFAULT true;

CREATE TABLE IF NOT EXISTS research_profile (
  clerk_user_id TEXT PRIMARY KEY,
  age_years INTEGER,
  gender TEXT,
  handedness TEXT,
  account_age_days INTEGER,
  notes TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE research_profile ADD COLUMN IF NOT EXISTS age_years INTEGER;
ALTER TABLE research_profile ADD COLUMN IF NOT EXISTS gender TEXT;
ALTER TABLE research_profile ADD COLUMN IF NOT EXISTS handedness TEXT;
ALTER TABLE research_profile ADD COLUMN IF NOT EXISTS account_age_days INTEGER;
ALTER TABLE research_profile ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE research_profile ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

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
);

CREATE INDEX IF NOT EXISTS research_sessions_type_idx ON research_sessions (test_type, imported_at DESC);
