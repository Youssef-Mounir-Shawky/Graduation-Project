export type UserRole = "admin" | "operator";
export type ValveState = "on" | "off";
export type OperatingMode = "automatic" | "manual";
export type RecommendationAction = "irrigate" | "do_not_irrigate" | "hold";
export type AlertType = "low_moisture" | "sensor_offline" | "irrigation_manual";
export type DataSource = "synthetic" | "gateway";
export type Awaitable<T> = T | Promise<T>;

export interface User {
  id: string;
  name: string;
  email: string;
  phoneNumber: string;
  passwordHash: string;
  role: UserRole;
  createdAt: string;
}

export interface Crop {
  id: string;
  name: string;
  moistureThresholdPercent: number;
  moistureTargetMinPercent: number;
  moistureTargetMaxPercent: number;
  stages: readonly string[];
}

export interface Zone {
  id: string;
  name: string;
  cropId: string;
  soilType: string;
  growthStage: string;
  plantingDate: string;
  nodeId: string | null;
  moistureTargetMinPercent: number;
  moistureTargetMaxPercent: number;
}

export interface Node {
  id: string;
  zoneId: string;
  gatewayId: string;
  lastSeenAt: string | null;
  batteryMv: number;
  lastSequence: number;
}

export interface Reading {
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
  data_source: DataSource;
}

export interface ValveControl {
  state: ValveState;
  mode: OperatingMode;
  updatedAt: string;
  updatedBy: string | null;
}

export interface ZoneSnapshot {
  zone: Zone;
  crop: Crop;
  node: Node | null;
  latestReading: Reading | null;
  valve: ValveControl;
}

export interface Recommendation {
  zoneId: string;
  action: RecommendationAction;
  recommendedValveState: ValveState | null;
  effectiveValveState: ValveState;
  mode: OperatingMode;
  reason: string;
  evaluatedAt: string;
  model: "threshold-v1";
  inputs: {
    moisturePercent: number | null;
    temperatureCelsius: number | null;
    humidityPercent: number | null;
    moistureThresholdPercent: number;
    growthStage: string;
    soilType: string;
  };
}

export interface Alert {
  id: string;
  type: AlertType;
  zoneId: string;
  zoneName: string;
  severity: "info" | "warning" | "critical";
  title: string;
  reason: string;
  createdAt: string;
  acknowledged: boolean;
}

export interface ScheduleEntry {
  id: string;
  zoneId: string;
  zoneName: string;
  startAt: string;
  durationMinutes: number;
  method: string;
  status: "scheduled" | "running" | "completed";
}

export interface NileGuardRepository {
  listUsers(): Awaitable<User[]>;
  getUserById(id: string): Awaitable<User | undefined>;
  getUserByEmail(email: string): Awaitable<User | undefined>;
  addUser(user: User): Awaitable<void>;
  updateUser(
    id: string,
    changes: Partial<Pick<User, "name" | "email" | "phoneNumber" | "passwordHash" | "role">>,
  ): Awaitable<User | undefined>;
  deleteUser(id: string): Awaitable<boolean>;
  listCrops(): Awaitable<Crop[]>;
  getCrop(id: string): Awaitable<Crop | undefined>;
  listZones(): Awaitable<Zone[]>;
  getZone(id: string): Awaitable<Zone | undefined>;
  addZone(zone: Zone): Awaitable<void>;
  updateZone(id: string, changes: Partial<Omit<Zone, "id">>): Awaitable<Zone | undefined>;
  deleteZone(id: string): Awaitable<boolean>;
  listNodes(): Awaitable<Node[]>;
  getNode(id: string): Awaitable<Node | undefined>;
  addNode(node: Node): Awaitable<void>;
  updateNode(id: string, changes: Partial<Omit<Node, "id">>): Awaitable<Node | undefined>;
  deleteNode(id: string): Awaitable<boolean>;
  getLatestReading(zoneId: string): Awaitable<Reading | undefined>;
  listReadings(zoneId: string | undefined, since: Date | undefined, limit: number): Awaitable<Reading[]>;
  recordReading(reading: Reading): Awaitable<void>;
  getValve(zoneId: string): Awaitable<ValveControl | undefined>;
  setManualValve(zoneId: string, state: ValveState, userId: string): Awaitable<ValveControl | undefined>;
  clearManualValve(zoneId: string): Awaitable<ValveControl | undefined>;
  setAutomaticValve(zoneId: string, state: ValveState): Awaitable<ValveControl | undefined>;
  listSchedule(): Awaitable<ScheduleEntry[]>;
  getZoneSnapshot(zoneId: string): Awaitable<ZoneSnapshot | undefined>;
  listZoneSnapshots(): Awaitable<ZoneSnapshot[]>;
  simulateReading(zoneId: string): Awaitable<Reading>;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: UserRole;
}
