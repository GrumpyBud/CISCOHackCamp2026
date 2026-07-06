-- Run this once against the Vercel-managed Neon database.
CREATE TABLE IF NOT EXISTS devices (
  id BIGSERIAL PRIMARY KEY,
  clerk_user_id TEXT NOT NULL,
  badge_id TEXT NOT NULL,
  firmware_version TEXT,
  history_capacity INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (clerk_user_id, badge_id)
);

CREATE TABLE IF NOT EXISTS sessions (
  id BIGSERIAL PRIMARY KEY,
  clerk_user_id TEXT NOT NULL,
  device_id BIGINT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  sequence BIGINT NOT NULL,
  test_type TEXT NOT NULL CHECK (test_type IN ('quick', 'focus', 'choice', 'rhythm', 'memory')),
  score SMALLINT NOT NULL CHECK (score BETWEEN 0 AND 100),
  median_ms INTEGER NOT NULL CHECK (median_ms >= 0),
  spread_ms REAL NOT NULL CHECK (spread_ms >= 0),
  lapses SMALLINT NOT NULL CHECK (lapses >= 0),
  false_starts SMALLINT NOT NULL CHECK (false_starts >= 0),
  attempts SMALLINT NOT NULL CHECK (attempts >= 0),
  correct SMALLINT NOT NULL CHECK (correct >= 0),
  rhythm_bias_ms SMALLINT NOT NULL,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (clerk_user_id, device_id, sequence)
);

CREATE INDEX IF NOT EXISTS sessions_user_sequence_idx ON sessions (clerk_user_id, sequence DESC);

CREATE TABLE IF NOT EXISTS health_logs (
  id BIGSERIAL PRIMARY KEY,
  clerk_user_id TEXT NOT NULL,
  log_date DATE NOT NULL,
  log_time TIME NOT NULL DEFAULT CURRENT_TIME,
  context TEXT NOT NULL DEFAULT 'check-in',
  wake_time TIME NOT NULL DEFAULT '07:00',
  sleep_hours REAL NOT NULL CHECK (sleep_hours BETWEEN 0 AND 16),
  sleep_quality SMALLINT NOT NULL CHECK (sleep_quality BETWEEN 1 AND 10),
  stress SMALLINT NOT NULL CHECK (stress BETWEEN 1 AND 10),
  mood SMALLINT NOT NULL CHECK (mood BETWEEN 1 AND 10),
  exercise_minutes SMALLINT NOT NULL CHECK (exercise_minutes BETWEEN 0 AND 600),
  caffeine_mg SMALLINT NOT NULL CHECK (caffeine_mg BETWEEN 0 AND 1200),
  caffeine_recent_mg SMALLINT NOT NULL DEFAULT 0 CHECK (caffeine_recent_mg BETWEEN 0 AND 1200),
  hydration SMALLINT NOT NULL CHECK (hydration BETWEEN 1 AND 10),
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS health_logs_user_date_idx ON health_logs (clerk_user_id, log_date DESC, log_time DESC, id DESC);

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
