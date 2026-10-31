import type {
  Alert,
  EnvironmentalComparison,
  EnvironmentalObservation,
  EnvironmentalParameter,
  EnvironmentalSource,
  Crop,
  NileGuardRepository,
  Node,
  Reading,
  ScheduleEntry,
  User,
  ValveControl,
  ValveState,
  Zone,
  ZoneSnapshot,
} from "../domain/types.js";
import { isNodeOnline, isReadingFresh } from "../services/telemetry.js";

const initialCrops: Crop[] = [
  {
    id: "tomato",
    name: "Tomato",
    moistureThresholdPercent: 35,
    moistureTargetMinPercent: 40,
    moistureTargetMaxPercent: 70,
    stages: ["seedling", "vegetative", "flowering", "fruiting", "maturity"],
  },
  {
    id: "potato",
    name: "Potato",
    moistureThresholdPercent: 28,
    moistureTargetMinPercent: 35,
    moistureTargetMaxPercent: 65,
    stages: ["emergence", "vegetative", "tuber-initiation", "bulking", "maturation"],
  },
];

const initialZones: Zone[] = [
  { id: "zone-tomato-loam", name: "Tomato · Loam soil", cropId: "tomato", soilType: "loam", growthStage: "vegetative", plantingDate: "2026-04-21", nodeId: "node-tomato-loam", moistureTargetMinPercent: 40, moistureTargetMaxPercent: 70 },
  { id: "zone-tomato-sandy", name: "Tomato · Sandy soil", cropId: "tomato", soilType: "sandy", growthStage: "flowering", plantingDate: "2026-04-21", nodeId: "node-tomato-sandy", moistureTargetMinPercent: 40, moistureTargetMaxPercent: 70 },
  { id: "zone-potato-loam", name: "Potato · Loam soil", cropId: "potato", soilType: "loam", growthStage: "bulking", plantingDate: "2026-04-21", nodeId: "node-potato-loam", moistureTargetMinPercent: 35, moistureTargetMaxPercent: 65 },
  { id: "zone-potato-sandy", name: "Potato · Sandy soil", cropId: "potato", soilType: "sandy", growthStage: "tuber-initiation", plantingDate: "2026-04-21", nodeId: "node-potato-sandy", moistureTargetMinPercent: 35, moistureTargetMaxPercent: 65 },
];

const startingReadings = [
  { moisture: 46, temp: 20.5, shortwave_radiation_w_m2: 0, humidity: 65, battery_mv: 3790 },
  { moisture: 35, temp: 20.1, shortwave_radiation_w_m2: 0, humidity: 67, battery_mv: 3790 },
  { moisture: 43, temp: 18.2, shortwave_radiation_w_m2: 0, humidity: 65, battery_mv: 3790 },
  { moisture: 31, temp: 17.8, shortwave_radiation_w_m2: 0, humidity: 68, battery_mv: 3790 },
];

export class MemoryRepository implements NileGuardRepository {
  private readonly users = new Map<string, User>();
  private readonly crops = new Map(initialCrops.map((crop) => [crop.id, crop]));
  private readonly zones = new Map(initialZones.map((zone) => [zone.id, structuredClone(zone)]));
  private readonly nodes = new Map<string, Node>();
  private readonly readings: Reading[] = [];
  private readonly environmentalObservations: EnvironmentalObservation[] = [];
  private readonly environmentalComparisons: EnvironmentalComparison[] = [];
  private nextEnvironmentalId = 1;
  private readonly valves = new Map<string, ValveControl>();

  constructor() {
    const baseTime = Date.now();
    initialZones.forEach((zone, index) => {
      if (!zone.nodeId) throw new Error(`Seed zone ${zone.id} must have a registered sample node.`);
      const crop = initialCrops.find((entry) => entry.id === zone.cropId);
      if (!crop) throw new Error(`Seed zone ${zone.id} references an unknown crop.`);
      this.nodes.set(zone.nodeId, {
        id: zone.nodeId,
        zoneId: zone.id,
        gatewayId: "gateway-demo",
        lastSeenAt: new Date(baseTime).toISOString(),
        batteryMv: startingReadings[index].battery_mv,
        lastSequence: 168,
      });

      this.valves.set(zone.id, {
        state: startingReadings[index].moisture < crop.moistureThresholdPercent ? "on" : "off",
        mode: "automatic",
        updatedAt: new Date(baseTime).toISOString(),
        updatedBy: null,
      });

      for (let sample = 0; sample < 167; sample += 1) {
        const drift = Math.round(Math.sin((sample + index * 3) / 3.1) * 8);
        const readingTime = new Date(baseTime - (167 - sample) * 60 * 60_000).toISOString();
        const measurement = startingReadings[index];
        this.readings.push({
          id: `${zone.nodeId}-seed-${sample + 1}`,
          node_id: zone.nodeId,
          zone: zone.id,
          moisture: Math.min(95, Math.max(5, measurement.moisture - 5 + drift)),
          temp: Number((measurement.temp + Math.sin(sample / 4) * 2.1).toFixed(1)),
          shortwave_radiation_w_m2: Math.max(0, Math.round(750 * Math.max(0, Math.sin(((sample % 24 - 6) / 12) * Math.PI)))),
          humidity: Math.min(100, Math.max(15, Math.round(measurement.humidity + Math.cos(sample / 5) * 9))),
          battery_mv: measurement.battery_mv,
          seq: sample + 1,
          gateway_id: "gateway-demo",
          timestamp: readingTime,
          received_at: readingTime,
          data_source: "synthetic",
        });
      }

      const measurement = startingReadings[index];
      this.readings.push({
        id: `${zone.nodeId}-seed-24`,
        node_id: zone.nodeId,
        zone: zone.id,
        ...measurement,
        seq: 168,
        gateway_id: "gateway-demo",
        timestamp: new Date(baseTime).toISOString(),
        received_at: new Date(baseTime).toISOString(),
        data_source: "synthetic",
      });
      this.pushSyntheticObservations(this.readings.at(-1)!);
    });
  }

  listUsers(): User[] {
    return [...this.users.values()].map((user) => ({ ...user }));
  }

  getUserById(id: string): User | undefined {
    const user = this.users.get(id);
    return user && { ...user };
  }

  getUserByEmail(email: string): User | undefined {
    const user = [...this.users.values()].find((entry) => entry.email.toLowerCase() === email.toLowerCase());
    return user && { ...user };
  }

  addUser(user: User): void {
    this.users.set(user.id, { ...user, email: user.email.toLowerCase() });
  }

  updateUser(
    id: string,
    changes: Partial<Pick<User, "name" | "email" | "phoneNumber" | "passwordHash" | "role">>,
  ): User | undefined {
    const user = this.users.get(id);
    if (!user) return undefined;
    Object.assign(user, changes);
    if (changes.email) user.email = changes.email.toLowerCase();
    return { ...user };
  }

  deleteUser(id: string): boolean {
    return this.users.delete(id);
  }

  listCrops(): Crop[] {
    return [...this.crops.values()].map((crop) => ({ ...crop, stages: [...crop.stages] }));
  }

  getCrop(id: string): Crop | undefined {
    const crop = this.crops.get(id);
    return crop && { ...crop, stages: [...crop.stages] };
  }

  listZones(): Zone[] {
    return [...this.zones.values()].map((zone) => ({ ...zone }));
  }

  getZone(id: string): Zone | undefined {
    const zone = this.zones.get(id);
    return zone && { ...zone };
  }

  addZone(zone: Zone): void {
    this.zones.set(zone.id, { ...zone });
    this.valves.set(zone.id, {
      state: "off",
      mode: "automatic",
      updatedAt: new Date().toISOString(),
      updatedBy: null,
    });
  }

  updateZone(id: string, changes: Partial<Omit<Zone, "id">>): Zone | undefined {
    const zone = this.zones.get(id);
    if (!zone) return undefined;
    Object.assign(zone, changes);
    return { ...zone };
  }

  deleteZone(id: string): boolean {
    const zone = this.zones.get(id);
    if (!zone) return false;
    this.zones.delete(id);
    if (zone.nodeId) this.nodes.delete(zone.nodeId);
    this.valves.delete(id);
    for (let index = this.readings.length - 1; index >= 0; index -= 1) {
      if (this.readings[index].zone === id) this.readings.splice(index, 1);
    }
    for (let index = this.environmentalObservations.length - 1; index >= 0; index -= 1) {
      if (this.environmentalObservations[index].zoneId === id) this.environmentalObservations.splice(index, 1);
    }
    for (let index = this.environmentalComparisons.length - 1; index >= 0; index -= 1) {
      if (this.environmentalComparisons[index].zoneId === id) this.environmentalComparisons.splice(index, 1);
    }
    return true;
  }

  listNodes(): Node[] {
    return [...this.nodes.values()].map((node) => ({ ...node }));
  }

  getNode(id: string): Node | undefined {
    const node = this.nodes.get(id);
    return node && { ...node };
  }

  addNode(node: Node): void {
    this.nodes.set(node.id, { ...node });
    const zone = this.zones.get(node.zoneId);
    if (zone) zone.nodeId = node.id;
  }

  updateNode(id: string, changes: Partial<Omit<Node, "id">>): Node | undefined {
    const node = this.nodes.get(id);
    if (!node) return undefined;
    Object.assign(node, changes);
    return { ...node };
  }

  deleteNode(id: string): boolean {
    const node = this.nodes.get(id);
    if (!node) return false;
    const zone = this.zones.get(node.zoneId);
    if (zone) zone.nodeId = null;
    this.nodes.delete(id);
    return true;
  }

  getLatestReading(zoneId: string): Reading | undefined {
    if (!this.zones.has(zoneId)) return undefined;
    for (let index = this.readings.length - 1; index >= 0; index -= 1) {
      if (this.readings[index].zone === zoneId) return { ...this.readings[index] };
    }
    return undefined;
  }

  listReadings(zoneId: string | undefined, since: Date | undefined, limit: number): Reading[] {
    return this.readings
      .filter((reading) => (!zoneId || reading.zone === zoneId) && (!since || Date.parse(reading.timestamp) >= since.getTime()))
      .sort((left, right) => left.timestamp.localeCompare(right.timestamp))
      .slice(-limit)
      .map((reading) => ({ ...reading }));
  }

  recordReading(reading: Reading): void {
    this.readings.push({ ...reading });
    if (this.readings.length > 10_000) this.readings.splice(0, this.readings.length - 10_000);
    const node = this.nodes.get(reading.node_id);
    if (node) {
      node.lastSeenAt = reading.received_at;
      node.batteryMv = reading.battery_mv;
      node.lastSequence = reading.seq;
    }
  }

  recordEnvironmentalObservation(
    observation: Omit<EnvironmentalObservation, "id">,
  ): EnvironmentalObservation {
    const stored = { ...observation, id: String(this.nextEnvironmentalId++) };
    this.environmentalObservations.push(stored);
    return { ...stored };
  }

  getLatestEnvironmentalObservation(
    zoneId: string,
    parameter: EnvironmentalParameter,
    source: EnvironmentalSource,
  ): EnvironmentalObservation | undefined {
    return this.environmentalObservations
      .filter((entry) => entry.zoneId === zoneId && entry.parameter === parameter && entry.source === source)
      .sort((left, right) => right.measuredAt.localeCompare(left.measuredAt))
      .map((entry) => ({ ...entry }))[0];
  }

  listEnvironmentalObservations(zoneId: string, limit = 500): EnvironmentalObservation[] {
    return this.environmentalObservations
      .filter((entry) => entry.zoneId === zoneId)
      .sort((left, right) => right.measuredAt.localeCompare(left.measuredAt) || Number(right.id) - Number(left.id))
      .slice(0, limit)
      .map((entry) => ({ ...entry }));
  }

  recordEnvironmentalComparison(
    comparison: Omit<EnvironmentalComparison, "id">,
  ): EnvironmentalComparison {
    const stored = { ...comparison, id: String(this.nextEnvironmentalId++) };
    this.environmentalComparisons.push(stored);
    return { ...stored };
  }

  listEnvironmentalComparisons(zoneId: string, limit = 500): EnvironmentalComparison[] {
    return this.environmentalComparisons
      .filter((entry) => entry.zoneId === zoneId)
      .sort((left, right) => right.comparedAt.localeCompare(left.comparedAt) || Number(right.id) - Number(left.id))
      .slice(0, limit)
      .map((entry) => ({ ...entry }));
  }

  getValve(zoneId: string): ValveControl | undefined {
    const valve = this.valves.get(zoneId);
    return valve && { ...valve };
  }

  setManualValve(zoneId: string, state: ValveState, userId: string): ValveControl | undefined {
    const valve = this.valves.get(zoneId);
    if (!valve) return undefined;
    Object.assign(valve, { state, mode: "manual" as const, updatedAt: new Date().toISOString(), updatedBy: userId });
    return { ...valve };
  }

  private pushSyntheticObservations(reading: Reading): void {
    const values: Array<[EnvironmentalParameter, number | null, string]> = [
      ["soil_moisture", reading.moisture, "%"],
      ["air_temperature", reading.temp, "°C"],
      ["relative_humidity", reading.humidity, "%"],
      ["shortwave_radiation", reading.shortwave_radiation_w_m2, "W/m²"],
    ];
    for (const [parameter, value, unit] of values) {
      this.environmentalObservations.push({
        id: String(this.nextEnvironmentalId++),
        zoneId: reading.zone,
        parameter,
        value,
        unit,
        source: "synthetic",
        measuredAt: reading.timestamp,
        receivedAt: reading.received_at,
        isValid: value !== null && Number.isFinite(value),
        isStale: false,
        locationId: null,
      });
    }
  }

  clearManualValve(zoneId: string): ValveControl | undefined {
    const valve = this.valves.get(zoneId);
    if (!valve) return undefined;
    Object.assign(valve, { mode: "automatic" as const, updatedAt: new Date().toISOString(), updatedBy: null });
    return { ...valve };
  }

  setAutomaticValve(zoneId: string, state: ValveState): ValveControl | undefined {
    const valve = this.valves.get(zoneId);
    if (!valve || valve.mode === "manual") return valve && { ...valve };
    Object.assign(valve, { state, updatedAt: new Date().toISOString(), updatedBy: null });
    return { ...valve };
  }

  listSchedule(): ScheduleEntry[] {
    const entries: ScheduleEntry[] = [];
    const now = new Date();
    const todayAt = (hour: number, minute: number) => {
      const date = new Date(now);
      date.setHours(hour, minute, 0, 0);
      if (date.getTime() <= now.getTime()) date.setDate(date.getDate() + 1);
      return date.toISOString();
    };
    const schedule = [
      ["zone-tomato-loam", 6, 0, 16, "Drip irrigation"],
      ["zone-tomato-sandy", 6, 45, 14, "Drip irrigation"],
      ["zone-potato-loam", 7, 20, 18, "Drip irrigation"],
      ["zone-potato-sandy", 7, 45, 14, "Drip irrigation"],
    ] as const;
    for (const [zoneId, hour, minute, durationMinutes, method] of schedule) {
      const zone = this.zones.get(zoneId);
      if (!zone) continue;
      entries.push({
        id: `schedule-${zoneId}`,
        zoneId,
        zoneName: zone.name,
        startAt: todayAt(hour, minute),
        durationMinutes,
        method,
        status: "scheduled",
      });
    }
    return entries.sort((left, right) => left.startAt.localeCompare(right.startAt));
  }

  getZoneSnapshot(zoneId: string): ZoneSnapshot | undefined {
    const zone = this.zones.get(zoneId);
    if (!zone) return undefined;
    const crop = this.crops.get(zone.cropId);
    const node = zone.nodeId ? this.nodes.get(zone.nodeId) : undefined;
    const valve = this.valves.get(zoneId);
    if (!crop || !valve) return undefined;
    return {
      zone: { ...zone },
      crop: { ...crop, stages: [...crop.stages] },
      node: node ? { ...node } : null,
      latestReading: this.getLatestReading(zoneId) ?? null,
      valve: { ...valve },
    };
  }

  listZoneSnapshots(): ZoneSnapshot[] {
    return [...this.zones.keys()].flatMap((zoneId) => {
      const snapshot = this.getZoneSnapshot(zoneId);
      return snapshot ? [snapshot] : [];
    });
  }

  simulateReading(zoneId: string): Reading {
    const snapshot = this.getZoneSnapshot(zoneId);
    if (!snapshot) throw new Error(`Cannot simulate a reading for unknown zone ${zoneId}.`);
    if (!snapshot.node) throw new Error(`Cannot simulate a reading for zone ${zoneId} without a registered node.`);
    const previous = snapshot.latestReading;
    const seq = snapshot.node.lastSequence + 1;
    const moistureStep = (seq % 3) - 1;
    const readingTime = new Date().toISOString();
    return {
      id: `${snapshot.node.id}-${seq}`,
      node_id: snapshot.node.id,
      zone: zoneId,
      moisture: Math.max(5, Math.min(95, (previous?.moisture ?? 40) + moistureStep)),
      temp: Number(Math.max(5, Math.min(45, (previous?.temp ?? 22) + (seq % 2 === 0 ? 0.3 : -0.2))).toFixed(1)),
      shortwave_radiation_w_m2: 0,
      humidity: Math.max(15, Math.min(100, (previous?.humidity ?? 60) + (seq % 2 === 0 ? -1 : 1))),
      battery_mv: snapshot.node.batteryMv,
      seq,
      gateway_id: snapshot.node.gatewayId,
      timestamp: readingTime,
      received_at: readingTime,
      data_source: "synthetic",
    };
  }
}

export async function buildAlerts(repository: NileGuardRepository): Promise<Alert[]> {
  const alerts: Alert[] = [];
  const now = new Date().toISOString();
  for (const snapshot of await repository.listZoneSnapshots()) {
    const reading = snapshot.latestReading;
    if (!reading || !isNodeOnline(snapshot.node) || !isReadingFresh(reading)) {
      alerts.push({
        id: `offline-${snapshot.zone.id}`,
        type: "sensor_offline",
        zoneId: snapshot.zone.id,
        zoneName: snapshot.zone.name,
        severity: "warning",
        title: `${snapshot.zone.name} has no recent sensor data`,
        reason: !snapshot.node
          ? "No field node is registered to this zone, so irrigation decisions are on hold."
          : !reading
            ? "The zone has not reported a sensor reading yet, so its irrigation recommendation is on hold."
            : "The node is offline or the last sensor measurement is more than five minutes old, so irrigation decisions are on hold.",
        createdAt: now,
        acknowledged: false,
      });
      continue;
    }
    if (reading.moisture !== null && reading.moisture < snapshot.crop.moistureThresholdPercent) {
      alerts.push({
        id: `low-moisture-${snapshot.zone.id}`,
        type: "low_moisture",
        zoneId: snapshot.zone.id,
        zoneName: snapshot.zone.name,
        severity: reading.moisture < snapshot.crop.moistureThresholdPercent * 0.75 ? "critical" : "warning",
        title: `${snapshot.zone.name} soil moisture is low`,
        reason: `${reading.moisture}% moisture is below ${snapshot.crop.name}'s ${snapshot.crop.moistureThresholdPercent}% irrigation threshold.`,
        createdAt: reading.received_at,
        acknowledged: false,
      });
    }
    if (snapshot.valve.mode === "manual") {
      alerts.push({
        id: `manual-${snapshot.zone.id}`,
        type: "irrigation_manual",
        zoneId: snapshot.zone.id,
        zoneName: snapshot.zone.name,
        severity: "info",
        title: `${snapshot.zone.name} is in manual mode`,
        reason: `The valve is ${snapshot.valve.state}; manual control takes precedence over automatic recommendations until automatic mode is restored.`,
        createdAt: snapshot.valve.updatedAt,
        acknowledged: false,
      });
    }
  }
  return alerts;
}
