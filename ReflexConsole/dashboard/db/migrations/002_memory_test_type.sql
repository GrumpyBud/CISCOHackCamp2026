-- Run once on existing databases created before Memory Test support.
ALTER TABLE sessions DROP CONSTRAINT IF EXISTS sessions_test_type_check;
ALTER TABLE sessions
  ADD CONSTRAINT sessions_test_type_check
  CHECK (test_type IN ('quick', 'focus', 'choice', 'rhythm', 'memory'));
