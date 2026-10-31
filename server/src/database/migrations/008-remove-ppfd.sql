DELETE FROM nileguard.environmental_comparisons
WHERE parameter = 'ppfd';

DELETE FROM nileguard.environmental_observations
WHERE parameter = 'ppfd';

ALTER TABLE nileguard.environmental_comparisons
  DROP CONSTRAINT IF EXISTS environmental_comparisons_parameter_check,
  ADD CONSTRAINT environmental_comparisons_parameter_check
    CHECK (parameter IN ('soil_moisture', 'air_temperature', 'relative_humidity', 'shortwave_radiation'));

ALTER TABLE nileguard.environmental_observations
  DROP CONSTRAINT IF EXISTS environmental_observations_parameter_check,
  ADD CONSTRAINT environmental_observations_parameter_check
    CHECK (parameter IN ('soil_moisture', 'air_temperature', 'relative_humidity', 'shortwave_radiation'));

ALTER TABLE nileguard.sensor_readings
  DROP COLUMN IF EXISTS light_ppfd;
