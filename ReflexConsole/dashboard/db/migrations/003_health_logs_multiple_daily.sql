-- Run once on existing databases to support multiple health check-ins per day.
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

ALTER TABLE health_logs ADD COLUMN IF NOT EXISTS log_time TIME NOT NULL DEFAULT CURRENT_TIME;
ALTER TABLE health_logs ADD COLUMN IF NOT EXISTS context TEXT NOT NULL DEFAULT 'check-in';
ALTER TABLE health_logs ADD COLUMN IF NOT EXISTS wake_time TIME NOT NULL DEFAULT '07:00';
ALTER TABLE health_logs ADD COLUMN IF NOT EXISTS caffeine_recent_mg SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE health_logs DROP CONSTRAINT IF EXISTS health_logs_clerk_user_id_log_date_key;
CREATE INDEX IF NOT EXISTS health_logs_user_date_idx ON health_logs (clerk_user_id, log_date DESC, log_time DESC, id DESC);
