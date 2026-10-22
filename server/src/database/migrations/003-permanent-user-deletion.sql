DROP INDEX IF EXISTS nileguard.users_active_email_unique_idx;

CREATE UNIQUE INDEX IF NOT EXISTS users_email_case_insensitive_idx
  ON nileguard.users (lower(email));

ALTER TABLE nileguard.users DROP COLUMN IF EXISTS deleted_at;
