CREATE TABLE IF NOT EXISTS nileguard.users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  email TEXT NOT NULL UNIQUE,
  phone_number TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'operator')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS nileguard.crops (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  moisture_threshold_percent NUMERIC(5, 2) NOT NULL CHECK (moisture_threshold_percent BETWEEN 0 AND 100),
  moisture_target_min_percent NUMERIC(5, 2) NOT NULL CHECK (moisture_target_min_percent BETWEEN 0 AND 100),
  moisture_target_max_percent NUMERIC(5, 2) NOT NULL CHECK (moisture_target_max_percent BETWEEN 0 AND 100),
  stages TEXT[] NOT NULL,
  CHECK (moisture_target_min_percent < moisture_target_max_percent)
);

CREATE TABLE IF NOT EXISTS nileguard.soil_types (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS nileguard.gateways (
  id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS nileguard.zones (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  crop_id TEXT NOT NULL REFERENCES nileguard.crops(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  soil_type_id TEXT NOT NULL REFERENCES nileguard.soil_types(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  growth_stage TEXT NOT NULL,
  planting_date DATE NOT NULL,
  moisture_target_min_percent NUMERIC(5, 2) NOT NULL CHECK (moisture_target_min_percent BETWEEN 0 AND 100),
  moisture_target_max_percent NUMERIC(5, 2) NOT NULL CHECK (moisture_target_max_percent BETWEEN 0 AND 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (moisture_target_min_percent < moisture_target_max_percent)
);

CREATE TABLE IF NOT EXISTS nileguard.nodes (
  id TEXT PRIMARY KEY,
  zone_id TEXT NOT NULL UNIQUE REFERENCES nileguard.zones(id) ON DELETE CASCADE,
  gateway_id TEXT NOT NULL REFERENCES nileguard.gateways(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  last_seen_at TIMESTAMPTZ,
  battery_mv INTEGER NOT NULL DEFAULT 0 CHECK (battery_mv BETWEEN 0 AND 10000),
  last_sequence BIGINT NOT NULL DEFAULT 0 CHECK (last_sequence >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS nileguard.sensor_readings (
  id BIGSERIAL PRIMARY KEY,
  node_id TEXT NOT NULL REFERENCES nileguard.nodes(id) ON DELETE CASCADE,
  zone_id TEXT NOT NULL REFERENCES nileguard.zones(id) ON DELETE CASCADE,
  gateway_id TEXT NOT NULL REFERENCES nileguard.gateways(id) ON DELETE RESTRICT,
  measured_at TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  soil_moisture_percent NUMERIC(6, 2) NOT NULL CHECK (soil_moisture_percent BETWEEN 0 AND 100),
  air_temperature_c NUMERIC(6, 2) NOT NULL CHECK (air_temperature_c BETWEEN -50 AND 80),
  light_lux NUMERIC(12, 2) CHECK (light_lux >= 0),
  light_ppfd NUMERIC(10, 2) CHECK (light_ppfd >= 0),
  relative_humidity_percent NUMERIC(6, 2) NOT NULL CHECK (relative_humidity_percent BETWEEN 0 AND 100),
  battery_mv INTEGER NOT NULL CHECK (battery_mv BETWEEN 0 AND 10000),
  co2_ppm NUMERIC(8, 2) CHECK (co2_ppm BETWEEN 0 AND 100000),
  soil_ph NUMERIC(4, 2) CHECK (soil_ph BETWEEN 0 AND 14),
  sequence BIGINT NOT NULL CHECK (sequence > 0),
  data_source TEXT NOT NULL CHECK (data_source IN ('synthetic', 'gateway'))
);

CREATE UNIQUE INDEX IF NOT EXISTS sensor_readings_gateway_sequence_idx
  ON nileguard.sensor_readings (node_id, sequence)
  WHERE data_source = 'gateway';
CREATE INDEX IF NOT EXISTS sensor_readings_zone_time_idx
  ON nileguard.sensor_readings (zone_id, measured_at DESC);
CREATE INDEX IF NOT EXISTS sensor_readings_node_time_idx
  ON nileguard.sensor_readings (node_id, measured_at DESC);
CREATE INDEX IF NOT EXISTS sensor_readings_received_at_idx
  ON nileguard.sensor_readings (received_at DESC);

CREATE TABLE IF NOT EXISTS nileguard.valve_controls (
  zone_id TEXT PRIMARY KEY REFERENCES nileguard.zones(id) ON DELETE CASCADE,
  state TEXT NOT NULL CHECK (state IN ('on', 'off')),
  mode TEXT NOT NULL CHECK (mode IN ('automatic', 'manual')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT REFERENCES nileguard.users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS nileguard.irrigation_schedule (
  id TEXT PRIMARY KEY,
  zone_id TEXT NOT NULL REFERENCES nileguard.zones(id) ON DELETE CASCADE,
  start_at TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
  method TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('scheduled', 'running', 'completed'))
);

CREATE TABLE IF NOT EXISTS nileguard.schema_migrations (
  filename TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
