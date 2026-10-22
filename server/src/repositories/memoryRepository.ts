import type {
  Alert,
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
    id: "lettuce",
    name: "Lettuce",
    moistureThresholdPercent: 30,
    moistureTargetMinPercent: 35,
    moistureTargetMaxPercent: 65,
    stages: ["seedling", "vegetative", "heading", "maturity"],
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
  { id: "zone-lettuce-clay", name: "Lettuce · Clay soil", cropId: "lettuce", soilType: "clay", growthStage: "vegetative", plantingDate: "2026-04-21", nodeId: "node-lettuce-clay", moistureTargetMinPercent: 35, moistureTargetMaxPercent: 65 },
  { id: "zone-lettuce-sandy", name: "Lettuce · Sandy soil", cropId: "lettuce", soilType: "sandy", growthStage: "heading", plantingDate: "2026-04-21", nodeId: "node-lettuce-sandy", moistureTargetMinPercent: 35, moistureTargetMaxPercent: 65 },
  { id: "zone-potato-clay", name: "Potato · Clay soil", cropId: "potato", soilType: "clay", growthStage: "bulking", plantingDate: "2026-04-21", nodeId: "node-potato-clay", moistureTargetMinPercent: 35, moistureTargetMaxPercent: 65 },
  { id: "zone-potato-sandy", name: "Potato · Sandy soil", cropId: "potato", soilType: "sandy", growthStage: "tuber-initiation", plantingDate: "2026-04-21", nodeId: "node-potato-sandy", moistureTargetMinPercent: 35, moistureTargetMaxPercent: 65 },
];

const startingReadings = [
  { moisture: 46, temp: 20.5, light_lux: 0, light_ppfd: 0, humidity: 65, co2_ppm: 450, soil_ph: 6.5, battery_mv: 3790 },
  { moisture: 35, temp: 20.1, light_lux: 0, light_ppfd: 0, humidity: 67, co2_ppm: 450, soil_ph: 6.2, battery_mv: 3790 },
  { moisture: 43, temp: 18.2, light_lux: 0, light_ppfd: 0, humidity: 65, co2_ppm: 450, soil_ph: 5.8, battery_mv: 3790 },
  { moisture: 31, temp: 17.8, light_lux: 0, light_ppfd: 0, humidity: 68, co2_ppm: 450, soil_ph: 5.5, battery_mv: 3790 },
];

export class MemoryRepository implements NileGuardRepository {
  private readonly users = new Map<string, User>();
  private readonly crops = new Map(initialCrops.map((crop) => [crop.id, crop]));
  private readonly zones = new Map(initialZones.map((zone) => [zone.id, structuredClone(zone)]));
  private readonly nodes = new Map<string, Node>();
  private readonly readings: Reading[] = [];
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
          light_lux: Math.max(0, Math.round(20_000 * Math.max(0, Math.sin(((sample % 24 - 6) / 12) * Math.PI)))),
          light_ppfd: Math.max(0, Math.round(20_000 * Math.max(0, Math.sin(((sample % 24 - 6) / 12) * Math.PI)) / 54)),
          humidity: Math.min(100, Math.max(15, Math.round(measurement.humidity + Math.cos(sample / 5) * 9))),
          co2_ppm: measurement.co2_ppm,
          soil_ph: measurement.soil_ph,
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
      ["zone-lettuce-clay", 6, 0, 12, "Drip irrigation"],
      ["zone-lettuce-sandy", 6, 45, 10, "Drip irrigation"],
      ["zone-potato-clay", 7, 20, 18, "Drip irrigation"],
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
      light_lux: 0,
      light_ppfd: 0,
      humidity: Math.max(15, Math.min(100, (previous?.humidity ?? 60) + (seq % 2 === 0 ? -1 : 1))),
      co2_ppm: previous?.co2_ppm ?? 450,
      soil_ph: previous?.soil_ph ?? 6,
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
    if (reading.moisture < snapshot.crop.moistureThresholdPercent) {
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
