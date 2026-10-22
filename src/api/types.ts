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
  moisture: number;
  temp: number;
  light_lux: number | null;
  light_ppfd: number | null;
  humidity: number;
  co2_ppm: number | null;
  soil_ph: number | null;
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
  recommendedValveState: "on" | "off" | null;
  effectiveValveState: "on" | "off";
  mode: "automatic" | "manual";
  reason: string;
  evaluatedAt: string;
  model: string;
  inputs: {
    moisturePercent: number | null;
    temperatureCelsius: number | null;
    humidityPercent: number | null;
    moistureThresholdPercent: number;
    growthStage: string;
    soilType: string;
  };
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
  status: "ok";
  persistence: "postgres" | "in-memory";
  hardware: "mock" | "disabled";
  mock_hardware: boolean;
  timestamp: string;
}

export interface ApiReadingsResponse {
  readings: ApiReading[];
  count: number;
}

export interface ApiSession {
  token: string;
  user: ApiUser;
}

export interface ApiEnvelope<T> {
  data: T;
}
