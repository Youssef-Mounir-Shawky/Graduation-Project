ALTER TABLE nileguard.sensor_readings
  DROP COLUMN IF EXISTS light_lux,
  ADD COLUMN IF NOT EXISTS shortwave_radiation_w_m2 NUMERIC(10, 2),
  ALTER COLUMN soil_moisture_percent DROP NOT NULL,
  ALTER COLUMN air_temperature_c DROP NOT NULL,
  ALTER COLUMN relative_humidity_percent DROP NOT NULL;

ALTER TABLE nileguard.sensor_readings
  DROP CONSTRAINT IF EXISTS sensor_readings_soil_moisture_percent_check,
  DROP CONSTRAINT IF EXISTS sensor_readings_air_temperature_c_check,
  DROP CONSTRAINT IF EXISTS sensor_readings_light_ppfd_check,
  DROP CONSTRAINT IF EXISTS sensor_readings_relative_humidity_percent_check;

CREATE TABLE IF NOT EXISTS nileguard.environmental_observations (
  id BIGSERIAL PRIMARY KEY,
  zone_id TEXT NOT NULL REFERENCES nileguard.zones(id) ON DELETE CASCADE,
  parameter TEXT NOT NULL CHECK (parameter IN (
    'soil_moisture', 'air_temperature', 'relative_humidity', 'shortwave_radiation', 'ppfd'
  )),
  value NUMERIC(14, 4),
  unit TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('hardware', 'open-meteo', 'synthetic')),
  measured_at TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_valid BOOLEAN NOT NULL,
  location_id TEXT,
  CHECK (value IS NOT NULL OR NOT is_valid)
);

CREATE INDEX IF NOT EXISTS environmental_observations_zone_parameter_source_time_idx
  ON nileguard.environmental_observations (zone_id, parameter, source, measured_at DESC);

CREATE TABLE IF NOT EXISTS nileguard.environmental_comparisons (
  id BIGSERIAL PRIMARY KEY,
  zone_id TEXT NOT NULL REFERENCES nileguard.zones(id) ON DELETE CASCADE,
  parameter TEXT NOT NULL CHECK (parameter IN (
    'soil_moisture', 'air_temperature', 'relative_humidity', 'shortwave_radiation', 'ppfd'
  )),
  hardware_observation_id BIGINT REFERENCES nileguard.environmental_observations(id) ON DELETE SET NULL,
  weather_observation_id BIGINT REFERENCES nileguard.environmental_observations(id) ON DELETE SET NULL,
  status TEXT NOT NULL CHECK (status IN (
    'CONSISTENT', 'CONFLICT', 'HARDWARE_MISSING', 'WEATHER_MISSING', 'STALE_READING', 'INVALID_READING'
  )),
  difference NUMERIC(14, 4),
  tolerance NUMERIC(14, 4),
  selected_observation_id BIGINT REFERENCES nileguard.environmental_observations(id) ON DELETE SET NULL,
  selected_source TEXT CHECK (selected_source IN ('hardware', 'open-meteo', 'synthetic')),
  compared_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS environmental_comparisons_zone_parameter_time_idx
  ON nileguard.environmental_comparisons (zone_id, parameter, compared_at DESC);

INSERT INTO nileguard.environmental_observations (
  zone_id, parameter, value, unit, source, measured_at, received_at, is_valid
)
SELECT zone_id, 'soil_moisture', soil_moisture_percent, '%',
       CASE WHEN data_source = 'gateway' THEN 'hardware' ELSE 'synthetic' END,
       measured_at, received_at, soil_moisture_percent IS NOT NULL
FROM nileguard.sensor_readings
ON CONFLICT DO NOTHING;

INSERT INTO nileguard.environmental_observations (
  zone_id, parameter, value, unit, source, measured_at, received_at, is_valid
)
SELECT zone_id, 'air_temperature', air_temperature_c, '°C',
       CASE WHEN data_source = 'gateway' THEN 'hardware' ELSE 'synthetic' END,
       measured_at, received_at, air_temperature_c IS NOT NULL
FROM nileguard.sensor_readings
ON CONFLICT DO NOTHING;

INSERT INTO nileguard.environmental_observations (
  zone_id, parameter, value, unit, source, measured_at, received_at, is_valid
)
SELECT zone_id, 'relative_humidity', relative_humidity_percent, '%',
       CASE WHEN data_source = 'gateway' THEN 'hardware' ELSE 'synthetic' END,
       measured_at, received_at, relative_humidity_percent IS NOT NULL
FROM nileguard.sensor_readings
ON CONFLICT DO NOTHING;

INSERT INTO nileguard.environmental_observations (
  zone_id, parameter, value, unit, source, measured_at, received_at, is_valid
)
SELECT zone_id, 'ppfd', light_ppfd, 'µmol/m²/s',
       CASE WHEN data_source = 'gateway' THEN 'hardware' ELSE 'synthetic' END,
       measured_at, received_at, light_ppfd IS NOT NULL
FROM nileguard.sensor_readings
WHERE light_ppfd IS NOT NULL
ON CONFLICT DO NOTHING;
