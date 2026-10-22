DROP INDEX IF EXISTS users_active_email_unique_idx;

CREATE UNIQUE INDEX IF NOT EXISTS users_email_case_insensitive_idx
  ON users (lower(email));

ALTER TABLE users DROP COLUMN IF EXISTS deleted_at;
