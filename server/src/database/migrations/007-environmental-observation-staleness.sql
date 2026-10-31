ALTER TABLE nileguard.environmental_observations
  ADD COLUMN IF NOT EXISTS is_stale BOOLEAN NOT NULL DEFAULT false;
