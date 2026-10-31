ALTER TABLE nileguard.sensor_readings
  DROP COLUMN IF EXISTS co2_ppm,
  DROP COLUMN IF EXISTS soil_ph;

ALTER TABLE nileguard.environmental_observations
  ADD COLUMN IF NOT EXISTS is_stale BOOLEAN NOT NULL DEFAULT false;
