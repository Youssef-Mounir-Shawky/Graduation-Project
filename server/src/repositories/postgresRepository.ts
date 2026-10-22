import type { Pool } from "pg";
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

type Row = Record<string, unknown>;

function date(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();
}

function numeric(value: unknown): number {
  return Number(value);
}

function mapUser(row: Row): User {
  return {
    id: String(row.id),
    name: String(row.name),
    email: String(row.email),
    phoneNumber: String(row.phone_number),
    passwordHash: String(row.password_hash),
    role: row.role as User["role"],
    createdAt: date(row.created_at) ?? new Date(0).toISOString(),
  };
}

function mapCrop(row: Row): Crop {
  return {
    id: String(row.id),
    name: String(row.name),
    moistureThresholdPercent: numeric(row.moisture_threshold_percent),
    moistureTargetMinPercent: numeric(row.moisture_target_min_percent),
    moistureTargetMaxPercent: numeric(row.moisture_target_max_percent),
    stages: row.stages as string[],
  };
}

function mapZone(row: Row): Zone {
  return {
    id: String(row.id),
    name: String(row.name),
    cropId: String(row.crop_id),
    soilType: String(row.soil_type),
    growthStage: String(row.growth_stage),
    plantingDate: date(row.planting_date)?.slice(0, 10) ?? "",
    nodeId: row.node_id ? String(row.node_id) : null,
    moistureTargetMinPercent: numeric(row.moisture_target_min_percent),
    moistureTargetMaxPercent: numeric(row.moisture_target_max_percent),
  };
}

function mapNode(row: Row): Node {
  return {
    id: String(row.id),
    zoneId: String(row.zone_id),
    gatewayId: String(row.gateway_id),
    lastSeenAt: date(row.last_seen_at),
    batteryMv: numeric(row.battery_mv),
    lastSequence: numeric(row.last_sequence),
  };
}

function mapReading(row: Row): Reading {
  return {
    id: `${String(row.node_id)}-${String(row.sequence)}`,
    node_id: String(row.node_id),
    zone: String(row.zone_id),
    moisture: numeric(row.soil_moisture_percent),
    temp: numeric(row.air_temperature_c),
    light_lux: row.light_lux === null ? null : numeric(row.light_lux),
    light_ppfd: row.light_ppfd === null ? null : numeric(row.light_ppfd),
    humidity: numeric(row.relative_humidity_percent),
    co2_ppm: row.co2_ppm === null ? null : numeric(row.co2_ppm),
    soil_ph: row.soil_ph === null ? null : numeric(row.soil_ph),
    battery_mv: numeric(row.battery_mv),
    seq: numeric(row.sequence),
    gateway_id: String(row.gateway_id),
    timestamp: date(row.measured_at) ?? new Date(0).toISOString(),
    received_at: date(row.received_at) ?? new Date(0).toISOString(),
    data_source: row.data_source as Reading["data_source"],
  };
}

function mapValve(row: Row): ValveControl {
  return {
    state: row.state as ValveControl["state"],
    mode: row.mode as ValveControl["mode"],
    updatedAt: date(row.updated_at) ?? new Date(0).toISOString(),
    updatedBy: row.updated_by ? String(row.updated_by) : null,
  };
}

const zoneSelect = `
  SELECT z.id, z.name, z.crop_id, st.id AS soil_type, z.growth_stage, z.planting_date,
         n.id AS node_id, z.moisture_target_min_percent, z.moisture_target_max_percent
  FROM nileguard.zones z
  JOIN nileguard.soil_types st ON st.id = z.soil_type_id
  LEFT JOIN nileguard.nodes n ON n.zone_id = z.id
`;

const readingSelect = `
  SELECT node_id, zone_id, gateway_id, measured_at, received_at,
         soil_moisture_percent, air_temperature_c, light_lux, light_ppfd,
         relative_humidity_percent, battery_mv, co2_ppm, soil_ph, sequence, data_source
  FROM nileguard.sensor_readings
`;

export class PostgresRepository implements NileGuardRepository {
  constructor(private readonly database: Pool) {}

  async listUsers(): Promise<User[]> {
    const result = await this.database.query("SELECT * FROM nileguard.users ORDER BY created_at, id");
    return result.rows.map(mapUser);
  }

  async getUserById(id: string): Promise<User | undefined> {
    const result = await this.database.query("SELECT * FROM nileguard.users WHERE id = $1", [id]);
    return result.rows[0] ? mapUser(result.rows[0]) : undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const result = await this.database.query("SELECT * FROM nileguard.users WHERE lower(email) = lower($1)", [email]);
    return result.rows[0] ? mapUser(result.rows[0]) : undefined;
  }

  async addUser(user: User): Promise<void> {
    await this.database.query(
      `INSERT INTO nileguard.users (id, name, email, phone_number, password_hash, role, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [user.id, user.name, user.email.toLowerCase(), user.phoneNumber, user.passwordHash, user.role, user.createdAt],
    );
  }

  async updateUser(
    id: string,
    changes: Partial<Pick<User, "name" | "email" | "phoneNumber" | "passwordHash" | "role">>,
  ): Promise<User | undefined> {
    const columns: Record<keyof typeof changes, string> = {
      name: "name",
      email: "email",
      phoneNumber: "phone_number",
      passwordHash: "password_hash",
      role: "role",
    };
    const entries = Object.entries(changes).filter((entry) => entry[1] !== undefined);
    if (!entries.length) return this.getUserById(id);
    const values = entries.map(([key, value]) => key === "email" ? String(value).toLowerCase() : value);
    const assignments = entries.map(([key], index) => `${columns[key as keyof typeof changes]} = $${index + 1}`);
    values.push(new Date().toISOString(), id);
    const result = await this.database.query(
      `UPDATE nileguard.users SET ${assignments.join(", ")}, updated_at = $${values.length - 1}
       WHERE id = $${values.length} RETURNING *`,
      values,
    );
    return result.rows[0] ? mapUser(result.rows[0]) : undefined;
  }

  async deleteUser(id: string): Promise<boolean> {
    const result = await this.database.query(
      "DELETE FROM nileguard.users WHERE id = $1",
      [id],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async listCrops(): Promise<Crop[]> {
    const result = await this.database.query("SELECT * FROM nileguard.crops ORDER BY name");
    return result.rows.map(mapCrop);
  }

  async getCrop(id: string): Promise<Crop | undefined> {
    const result = await this.database.query("SELECT * FROM nileguard.crops WHERE id = $1", [id]);
    return result.rows[0] ? mapCrop(result.rows[0]) : undefined;
  }

  async listZones(): Promise<Zone[]> {
    const result = await this.database.query(`${zoneSelect} ORDER BY z.name`);
    return result.rows.map(mapZone);
  }

  async getZone(id: string): Promise<Zone | undefined> {
    const result = await this.database.query(`${zoneSelect} WHERE z.id = $1`, [id]);
    return result.rows[0] ? mapZone(result.rows[0]) : undefined;
  }

  async addZone(zone: Zone): Promise<void> {
    await this.database.query(
      `INSERT INTO nileguard.zones (
         id, name, crop_id, soil_type_id, growth_stage, planting_date,
         moisture_target_min_percent, moisture_target_max_percent
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [zone.id, zone.name, zone.cropId, zone.soilType, zone.growthStage, zone.plantingDate,
        zone.moistureTargetMinPercent, zone.moistureTargetMaxPercent],
    );
    await this.database.query(
      "INSERT INTO nileguard.valve_controls (zone_id, state, mode) VALUES ($1, 'off', 'automatic')",
      [zone.id],
    );
  }

  async updateZone(id: string, changes: Partial<Omit<Zone, "id">>): Promise<Zone | undefined> {
    const mapping: Record<string, string> = {
      name: "name",
      cropId: "crop_id",
      soilType: "soil_type_id",
      growthStage: "growth_stage",
      plantingDate: "planting_date",
      moistureTargetMinPercent: "moisture_target_min_percent",
      moistureTargetMaxPercent: "moisture_target_max_percent",
    };
    const entries = Object.entries(changes).filter(([key, value]) => key !== "nodeId" && value !== undefined);
    if (entries.length) {
      const values = entries.map(([, value]) => value);
      values.push(id);
      const assignments = entries.map(([key], index) => `${mapping[key]} = $${index + 1}`);
      const updated = await this.database.query(
        `UPDATE nileguard.zones SET ${assignments.join(", ")} WHERE id = $${values.length} RETURNING id`,
        values,
      );
      if (!updated.rowCount) return undefined;
    }
    return this.getZone(id);
  }

  async deleteZone(id: string): Promise<boolean> {
    const result = await this.database.query("DELETE FROM nileguard.zones WHERE id = $1", [id]);
    return (result.rowCount ?? 0) > 0;
  }

  async listNodes(): Promise<Node[]> {
    const result = await this.database.query("SELECT * FROM nileguard.nodes ORDER BY id");
    return result.rows.map(mapNode);
  }

  async getNode(id: string): Promise<Node | undefined> {
    const result = await this.database.query("SELECT * FROM nileguard.nodes WHERE id = $1", [id]);
    return result.rows[0] ? mapNode(result.rows[0]) : undefined;
  }

  async addNode(node: Node): Promise<void> {
    const client = await this.database.connect();
    try {
      await client.query("BEGIN");
      await client.query("INSERT INTO nileguard.gateways (id) VALUES ($1) ON CONFLICT (id) DO NOTHING", [node.gatewayId]);
      await client.query(
        `INSERT INTO nileguard.nodes (id, zone_id, gateway_id, last_seen_at, battery_mv, last_sequence)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [node.id, node.zoneId, node.gatewayId, node.lastSeenAt, node.batteryMv, node.lastSequence],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async updateNode(id: string, changes: Partial<Omit<Node, "id">>): Promise<Node | undefined> {
    const mapping: Record<string, string> = {
      zoneId: "zone_id",
      gatewayId: "gateway_id",
      lastSeenAt: "last_seen_at",
      batteryMv: "battery_mv",
      lastSequence: "last_sequence",
    };
    const entries = Object.entries(changes).filter(([, value]) => value !== undefined);
    if (!entries.length) return this.getNode(id);
    const client = await this.database.connect();
    try {
      await client.query("BEGIN");
      if (changes.gatewayId) {
        await client.query("INSERT INTO nileguard.gateways (id) VALUES ($1) ON CONFLICT (id) DO NOTHING", [changes.gatewayId]);
      }
      const values = entries.map(([, value]) => value);
      values.push(id);
      const assignments = entries.map(([key], index) => `${mapping[key]} = $${index + 1}`);
      const result = await client.query(
        `UPDATE nileguard.nodes SET ${assignments.join(", ")} WHERE id = $${values.length} RETURNING *`,
        values,
      );
      await client.query("COMMIT");
      return result.rows[0] ? mapNode(result.rows[0]) : undefined;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async deleteNode(id: string): Promise<boolean> {
    const result = await this.database.query("DELETE FROM nileguard.nodes WHERE id = $1", [id]);
    return (result.rowCount ?? 0) > 0;
  }

  async getLatestReading(zoneId: string): Promise<Reading | undefined> {
    const result = await this.database.query(
      `${readingSelect} WHERE zone_id = $1 ORDER BY measured_at DESC, id DESC LIMIT 1`,
      [zoneId],
    );
    return result.rows[0] ? mapReading(result.rows[0]) : undefined;
  }

  async listReadings(zoneId: string | undefined, since: Date | undefined, limit: number): Promise<Reading[]> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    if (zoneId) {
      values.push(zoneId);
      conditions.push(`zone_id = $${values.length}`);
    }
    if (since) {
      values.push(since);
      conditions.push(`measured_at >= $${values.length}`);
    }
    values.push(limit);
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const result = await this.database.query(
      `${readingSelect} ${where} ORDER BY measured_at DESC, id DESC LIMIT $${values.length}`,
      values,
    );
    return result.rows.map(mapReading).reverse();
  }

  async recordReading(reading: Reading): Promise<void> {
    const client = await this.database.connect();
    try {
      await client.query("BEGIN");
      const nodeResult = await client.query(
        "SELECT last_sequence FROM nileguard.nodes WHERE id = $1 FOR UPDATE",
        [reading.node_id],
      );
      if (!nodeResult.rowCount) throw new Error(`Node '${reading.node_id}' disappeared before telemetry was stored.`);
      if (reading.seq <= numeric(nodeResult.rows[0].last_sequence)) {
        throw new Error("STALE_SEQUENCE");
      }
      await client.query(
        `INSERT INTO nileguard.sensor_readings (
           node_id, zone_id, gateway_id, measured_at, received_at,
           soil_moisture_percent, air_temperature_c, light_lux, light_ppfd,
           relative_humidity_percent, battery_mv, co2_ppm, soil_ph, sequence, data_source
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
        [reading.node_id, reading.zone, reading.gateway_id, reading.timestamp, reading.received_at,
          reading.moisture, reading.temp, reading.light_lux, reading.light_ppfd, reading.humidity,
          reading.battery_mv, reading.co2_ppm, reading.soil_ph, reading.seq, reading.data_source],
      );
      await client.query(
        "UPDATE nileguard.nodes SET last_sequence = $2, last_seen_at = $3, battery_mv = $4 WHERE id = $1",
        [reading.node_id, reading.seq, reading.received_at, reading.battery_mv],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async getValve(zoneId: string): Promise<ValveControl | undefined> {
    const result = await this.database.query("SELECT * FROM nileguard.valve_controls WHERE zone_id = $1", [zoneId]);
    return result.rows[0] ? mapValve(result.rows[0]) : undefined;
  }

  async setManualValve(zoneId: string, state: ValveState, userId: string): Promise<ValveControl | undefined> {
    const result = await this.database.query(
      `UPDATE nileguard.valve_controls
       SET state = $2, mode = 'manual', updated_at = now(), updated_by = $3
       WHERE zone_id = $1 RETURNING *`,
      [zoneId, state, userId],
    );
    return result.rows[0] ? mapValve(result.rows[0]) : undefined;
  }

  async clearManualValve(zoneId: string): Promise<ValveControl | undefined> {
    const result = await this.database.query(
      `UPDATE nileguard.valve_controls
       SET mode = 'automatic', updated_at = now(), updated_by = NULL
       WHERE zone_id = $1 RETURNING *`,
      [zoneId],
    );
    return result.rows[0] ? mapValve(result.rows[0]) : undefined;
  }

  async setAutomaticValve(zoneId: string, state: ValveState): Promise<ValveControl | undefined> {
    const result = await this.database.query(
      `UPDATE nileguard.valve_controls
       SET state = $2, updated_at = now(), updated_by = NULL
       WHERE zone_id = $1 AND mode = 'automatic' RETURNING *`,
      [zoneId, state],
    );
    return result.rows[0] ? mapValve(result.rows[0]) : this.getValve(zoneId);
  }

  async listSchedule(): Promise<ScheduleEntry[]> {
    const result = await this.database.query(
      `SELECT s.id, s.zone_id, z.name AS zone_name, s.start_at,
              s.duration_minutes, s.method, s.status
       FROM nileguard.irrigation_schedule s JOIN nileguard.zones z ON z.id = s.zone_id
       ORDER BY s.start_at`,
    );
    return result.rows.map((row: Row) => ({
      id: String(row.id),
      zoneId: String(row.zone_id),
      zoneName: String(row.zone_name),
      startAt: date(row.start_at) ?? new Date(0).toISOString(),
      durationMinutes: numeric(row.duration_minutes),
      method: String(row.method),
      status: row.status as ScheduleEntry["status"],
    }));
  }

  async getZoneSnapshot(zoneId: string): Promise<ZoneSnapshot | undefined> {
    const [zone, cropResult, nodeResult, reading, valve] = await Promise.all([
      this.getZone(zoneId),
      this.database.query(
        `SELECT c.* FROM nileguard.crops c JOIN nileguard.zones z ON z.crop_id = c.id WHERE z.id = $1`,
        [zoneId],
      ),
      this.database.query("SELECT n.* FROM nileguard.nodes n WHERE n.zone_id = $1", [zoneId]),
      this.getLatestReading(zoneId),
      this.getValve(zoneId),
    ]);
    const cropRow = cropResult.rows[0];
    if (!zone || !cropRow || !valve) return undefined;
    return {
      zone,
      crop: mapCrop(cropRow),
      node: nodeResult.rows[0] ? mapNode(nodeResult.rows[0]) : null,
      latestReading: reading ?? null,
      valve,
    };
  }

  async listZoneSnapshots(): Promise<ZoneSnapshot[]> {
    const zones = await this.listZones();
    const snapshots = await Promise.all(zones.map((zone) => this.getZoneSnapshot(zone.id)));
    return snapshots.filter((snapshot): snapshot is ZoneSnapshot => snapshot !== undefined);
  }

  async simulateReading(zoneId: string): Promise<Reading> {
    const snapshot = await this.getZoneSnapshot(zoneId);
    if (!snapshot) throw new Error(`Cannot simulate a reading for unknown zone ${zoneId}.`);
    if (!snapshot.node) throw new Error(`Cannot simulate a reading for zone ${zoneId} without a registered node.`);
    const previous = snapshot.latestReading;
    const sequence = snapshot.node.lastSequence + 1;
    const timestamp = new Date().toISOString();
    const daylight = Math.max(0, Math.sin(((new Date().getHours() - 6) / 12) * Math.PI));
    const lux = Math.round(daylight * 20_000);
    const reading: Reading = {
      id: `${snapshot.node.id}-${sequence}`,
      node_id: snapshot.node.id,
      zone: zoneId,
      moisture: Math.max(12, Math.min(75, (previous?.moisture ?? 40) + (sequence % 2 ? -1 : 1))),
      temp: Number(((previous?.temp ?? 20) + (sequence % 2 ? -0.2 : 0.2)).toFixed(1)),
      light_lux: lux,
      light_ppfd: Number((lux / 54).toFixed(1)),
      humidity: Math.max(35, Math.min(90, (previous?.humidity ?? 65) + (sequence % 2 ? 1 : -1))),
      co2_ppm: previous?.co2_ppm ?? 450,
      soil_ph: previous?.soil_ph ?? 6,
      battery_mv: snapshot.node.batteryMv,
      seq: sequence,
      gateway_id: snapshot.node.gatewayId,
      timestamp,
      received_at: timestamp,
      data_source: "synthetic",
    };
    return reading;
  }
}

export async function buildAlerts(repository: NileGuardRepository): Promise<Alert[]> {
  const snapshots = await repository.listZoneSnapshots();
  const now = new Date();
  const alerts: Alert[] = [];
  for (const snapshot of snapshots) {
    const reading = snapshot.latestReading;
    if (!snapshot.node?.lastSeenAt || now.getTime() - Date.parse(snapshot.node.lastSeenAt) > 5 * 60_000
      || !reading || now.getTime() - Date.parse(reading.timestamp) > 5 * 60_000) {
      alerts.push({
        id: `offline-${snapshot.zone.id}`,
        type: "sensor_offline",
        zoneId: snapshot.zone.id,
        zoneName: snapshot.zone.name,
        severity: "warning",
        title: `${snapshot.zone.name} has no recent sensor data`,
        reason: !snapshot.node
          ? "No field node is registered to this zone, so irrigation decisions are on hold."
          : "The node is offline or the last sensor measurement is more than five minutes old, so irrigation decisions are on hold.",
        createdAt: snapshot.node?.lastSeenAt ?? now.toISOString(),
        acknowledged: false,
      });
      continue;
    }
    if (reading.moisture < snapshot.crop.moistureThresholdPercent) {
      alerts.push({
        id: `moisture-${snapshot.zone.id}`,
        type: "low_moisture",
        zoneId: snapshot.zone.id,
        zoneName: snapshot.zone.name,
        severity: "critical",
        title: `${snapshot.zone.name} soil moisture is low`,
        reason: `${snapshot.crop.name} soil moisture is ${reading.moisture}%, below its ${snapshot.crop.moistureThresholdPercent}% interim threshold.`,
        createdAt: reading.timestamp,
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
        title: `${snapshot.zone.name} is under manual irrigation control`,
        reason: `The valve is manually set to ${snapshot.valve.state}; automatic recommendations will not change it.`,
        createdAt: snapshot.valve.updatedAt,
        acknowledged: false,
      });
    }
  }
  return alerts.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}
