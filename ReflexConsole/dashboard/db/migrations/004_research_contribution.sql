-- Optional research contribution tables. Session metrics are copied here only
-- after a signed-in user explicitly enables contribution.
CREATE TABLE IF NOT EXISTS research_consent (
  clerk_user_id TEXT PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

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
