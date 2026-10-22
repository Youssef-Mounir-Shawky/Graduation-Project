ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_key;

CREATE UNIQUE INDEX IF NOT EXISTS users_active_email_unique_idx
  ON users (lower(email))
  WHERE deleted_at IS NULL;
