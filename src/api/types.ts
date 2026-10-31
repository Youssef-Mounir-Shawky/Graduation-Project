export interface ApiUser {
  id: string;
  name: string;
  email: string;
  phoneNumber: string;
  role: "admin" | "operator";
  createdAt: string;
}

export interface ApiReading {
  id: string;
  node_id: string;
  zone: string;
  moisture: number | null;
  temp: number | null;
  shortwave_radiation_w_m2: number | null;
  humidity: number | null;
  battery_mv: number;
  seq: number;
  gateway_id: string;
  timestamp: string;
  received_at: string;
  data_source: "synthetic" | "gateway";
}

export interface ApiZone {
  id: string;
  name: string;
  crop: string;
  crop_id: string;
  soil_type: string;
  growth_stage: string;
  planting_date: string;
  moisture_target_min_percent: number;
  moisture_target_max_percent: number;
  moisture_threshold_percent: number;
  node: {
    id: string | null;
    gateway_id: string | null;
    online: boolean;
    last_seen_at: string | null;
    battery_mv: number | null;
  };
  reading: ApiReading | null;
  valve: {
    state: "on" | "off";
    mode: "automatic" | "manual";
    updated_at: string;
    updated_by: string | null;
  };
}

export interface ApiValveOverride {
  zone_id: string;
  valve_state: "on" | "off";
  mode: "automatic" | "manual";
  updated_at: string;
  updated_by: string | null;
  reason: string;
}

export interface ApiRecommendation {
  zoneId: string;
  action: "irrigate" | "do_not_irrigate" | "hold";
  status: "READY" | "INSUFFICIENT_DATA" | "SENSOR_ERROR";
  recommendedValveState: "on" | "off" | null;
  effectiveValveState: "on" | "off";
  mode: "automatic" | "manual";
  reason: string;
  evaluatedAt: string;
  model: string;
  inputs: {
    moisturePercent: number | null;
    moistureSource: "hardware" | "open-meteo" | "synthetic" | null;
    temperatureCelsius: number | null;
    temperatureSource: "hardware" | "open-meteo" | "synthetic" | null;
    humidityPercent: number | null;
    humiditySource: "hardware" | "open-meteo" | "synthetic" | null;
    shortwaveRadiationWm2: number | null;
    shortwaveRadiationSource: "hardware" | "open-meteo" | "synthetic" | null;
    vaporPressureDeficitKpa: number | null;
    moistureThresholdPercent: number;
    growthStage: string;
    soilType: string;
  };
}

export interface ApiEnvironmentalObservation {
  id: string;
  zoneId: string;
  parameter: "soil_moisture" | "air_temperature" | "relative_humidity" | "shortwave_radiation";
  value: number | null;
  unit: string;
  source: "hardware" | "open-meteo" | "synthetic";
  measuredAt: string;
  receivedAt: string;
  isValid: boolean;
  isStale: boolean;
  locationId: string | null;
}

export interface ApiEnvironmentalComparison {
  id: string;
  zoneId: string;
  parameter: ApiEnvironmentalObservation["parameter"];
  hardwareObservationId: string | null;
  weatherObservationId: string | null;
  status: "CONSISTENT" | "CONFLICT" | "HARDWARE_MISSING" | "WEATHER_MISSING" | "STALE_READING" | "INVALID_READING";
  difference: number | null;
  tolerance: number | null;
  selectedObservationId: string | null;
  selectedSource: ApiEnvironmentalObservation["source"] | null;
  comparedAt: string;
}

export interface ApiEnvironmentalStatus {
  observations: ApiEnvironmentalObservation[];
  comparisons: ApiEnvironmentalComparison[];
}

export interface ApiAlert {
  id: string;
  type: "low_moisture" | "sensor_offline" | "irrigation_manual";
  zone_id: string;
  zone_name: string;
  severity: "info" | "warning" | "critical";
  title: string;
  reason: string;
  created_at: string;
  acknowledged: boolean;
}

export interface ApiScheduleEntry {
  id: string;
  zone_id: string;
  zone_name: string;
  start_at: string;
  duration_minutes: number;
  method: string;
  status: "scheduled" | "running" | "completed";
}

export interface ApiHealth {
  status: "ok" | "unavailable";
  persistence: "postgres" | "in-memory";
  database: "connected" | "in-memory" | "unavailable";
  hardware: "mock" | "disabled";
  mock_hardware: boolean;
  timestamp: string;
}

export interface ApiReadingsResponse {
  readings: ApiReading[];
  count: number;
}

export interface ApiWeatherLocation {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  timezone?: string;
  elevation?: number | null;
  preset?: boolean;
}

export type ApiWeatherValue = string | number | boolean | null;

export interface ApiWeather {
  source: "open-meteo";
  attribution: string;
  retrieved_at: string;
  stale?: boolean;
  location: ApiWeatherLocation;
  units: {
    current: Record<string, string>;
    hourly: Record<string, string>;
    daily: Record<string, string>;
  };
  current: Record<string, ApiWeatherValue>;
  hourly: Record<string, Array<string | number | null>>;
  daily: Record<string, Array<string | number | null>>;
}

export interface ApiSession {
  token: string;
  user: ApiUser;
}

export interface ApiEnvelope<T> {
  data: T;
}
