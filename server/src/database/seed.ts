import { randomBytes } from "node:crypto";
import { hashPassword } from "../http/auth.js";
import { config } from "../config.js";
import type { Pool, PoolClient } from "pg";

const crops = [
  {
    id: "tomato",
    name: "Tomato",
    threshold: 35,
    minimum: 40,
    maximum: 70,
    stages: ["seedling", "vegetative", "flowering", "fruiting", "maturity"],
  },
  {
    id: "potato",
    name: "Potato",
    threshold: 28,
    minimum: 35,
    maximum: 65,
    stages: ["emergence", "vegetative", "tuber-initiation", "bulking", "maturation"],
  },
] as const;

const demoZones = [
  { id: "zone-tomato-loam", name: "Tomato · Loam soil", crop: "tomato", soil: "loam", stage: "vegetative", node: "node-tomato-loam", moisture: 43 },
  { id: "zone-tomato-sandy", name: "Tomato · Sandy soil", crop: "tomato", soil: "sandy", stage: "flowering", node: "node-tomato-sandy", moisture: 38 },
  { id: "zone-potato-loam", name: "Potato · Loam soil", crop: "potato", soil: "loam", stage: "bulking", node: "node-potato-loam", moisture: 38 },
  { id: "zone-potato-sandy", name: "Potato · Sandy soil", crop: "potato", soil: "sandy", stage: "tuber-initiation", node: "node-potato-sandy", moisture: 32 },
] as const;

const defaultUsers = [
  { id: "user-demo-admin", name: "NileGuard Demo Admin", email: "farmer@nileguard.local", phone: "+1-202-555-0101", role: "admin" },
  { id: "user-demo-operator-1", name: "Amina Hassan", email: "amina.hassan@nileguard.local", phone: "+1-202-555-0102", role: "operator" },
  { id: "user-demo-operator-2", name: "Omar Khaled", email: "omar.khaled@nileguard.local", phone: "+1-202-555-0103", role: "operator" },
] as const;

function round(value: number, digits = 2): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function mockMeasurement(zone: typeof demoZones[number], timestamp: Date, index: number, count: number) {
  const hour = timestamp.getUTCHours();
  const daylight = Math.max(0, Math.sin(((hour - 6) / 12) * Math.PI));
  const seasonal = Math.sin((index / count) * Math.PI * 2);
  const soilOffset = zone.soil === "loam" ? 2 : -1;
  const cropOffset = zone.crop === "tomato" ? 2 : 0;
  const moisture = zone.moisture + soilOffset + cropOffset
    + Math.sin(index / (zone.soil === "loam" ? 11 : 7)) * (zone.soil === "loam" ? 4 : 6)
    - daylight * (zone.soil === "loam" ? 2 : 3);
  const radiation = daylight * (600 + 100 * seasonal);
  const temperatureBase = zone.crop === "tomato" ? 22 : 18;
  const temperature = temperatureBase + seasonal * 1.8 + Math.sin(((hour - 8) / 24) * Math.PI * 2) * 3;
  const humidity = 67 - daylight * 10 - seasonal * 4 + Math.sin(index / 19) * 4;
  const batteryMv = 4_120 - (index / count) * 330 + Math.sin(index / 180) * 12;

  return {
    moisture: round(Math.min(75, Math.max(12, moisture))),
    temperature: round(temperature, 1),
    radiation: round(radiation),
    humidity: round(Math.min(90, Math.max(35, humidity))),
    battery: Math.round(batteryMv),
  };
}

async function seedUsers(client: PoolClient): Promise<string[]> {
  const issuedCredentials: string[] = [];
  for (const user of defaultUsers) {
    const existing = await client.query("SELECT 1 FROM nileguard.users WHERE lower(email) = lower($1)", [user.email]);
    if (existing.rowCount) continue;
    const password = randomBytes(18).toString("base64url");
    const passwordHash = await hashPassword(password);
    const result = await client.query(
      `INSERT INTO nileguard.users (id, name, email, phone_number, password_hash, role)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT DO NOTHING
       RETURNING email`,
      [user.id, user.name, user.email, user.phone, passwordHash, user.role],
    );
    if (result.rowCount) issuedCredentials.push(`${user.email} / ${password}`);
  }

  return issuedCredentials;
}

async function seedSyntheticHistory(client: PoolClient): Promise<void> {
  const now = new Date();
  const start = new Date(now);
  start.setUTCMonth(start.getUTCMonth() - 6);
  const hourMs = 60 * 60 * 1000;
  const historyCount = Math.floor((now.getTime() - start.getTime()) / hourMs) + 1;
  const chunkSize = 500;

  for (const zone of demoZones) {
    const existing = await client.query<{
      latest_reading: Date | null;
      latest_synthetic: Date | null;
      latest_gateway: Date | null;
      synthetic_sequence: string | null;
    }>(
      `SELECT
         MAX(measured_at) AS latest_reading,
         MAX(measured_at) FILTER (WHERE data_source = 'synthetic') AS latest_synthetic,
         MAX(measured_at) FILTER (WHERE data_source = 'gateway') AS latest_gateway,
         MAX(sequence) FILTER (WHERE data_source = 'synthetic') AS synthetic_sequence
       FROM nileguard.sensor_readings
       WHERE zone_id = $1`,
      [zone.id],
    );
    const status = existing.rows[0];
    let timestamps: Date[] = [];
    let extendsExistingHistory = false;

    if (!status?.latest_synthetic) {
      for (let time = start.getTime(); time <= now.getTime(); time += hourMs) {
        timestamps.push(new Date(time));
      }
      if (timestamps.at(-1)?.getTime() !== now.getTime()) timestamps.push(now);
    } else if (
      config.mockHardware
      && (!status.latest_gateway || status.latest_gateway.getTime() < now.getTime() - 24 * hourMs)
    ) {
      extendsExistingHistory = true;
      const currentHour = Math.floor(now.getTime() / hourMs) * hourMs;
      const firstHour = currentHour - 23 * hourMs;
      const occupiedHours = await client.query<{ hour: Date }>(
        `SELECT date_trunc('hour', measured_at AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AS hour
         FROM nileguard.sensor_readings
         WHERE zone_id = $1
           AND measured_at >= $2
         GROUP BY 1`,
        [zone.id, new Date(firstHour)],
      );
      const occupied = new Set(occupiedHours.rows.map(({ hour }) => hour.getTime()));
      for (let time = firstHour; time <= currentHour; time += hourMs) {
        if (!occupied.has(time)) timestamps.push(new Date(time));
      }
      if (!status.latest_reading || status.latest_reading.getTime() < now.getTime() - 5 * 60_000) {
        timestamps.push(now);
      }
    } else {
      continue;
    }

    if (!timestamps.length) continue;

    const sequenceStart = extendsExistingHistory ? Number(status.synthetic_sequence ?? 0) : 0;
    const rows: Array<unknown[]> = [];
    for (let offset = 0; offset < timestamps.length; offset += 1) {
      const timestamp = timestamps[offset];
      const historyIndex = Math.max(0, Math.floor((timestamp.getTime() - start.getTime()) / hourMs));
      const sample = mockMeasurement(zone, timestamp, historyIndex, historyCount);
      rows.push([
        zone.node,
        zone.id,
        "gateway-demo",
        timestamp.toISOString(),
        timestamp.toISOString(),
        sample.moisture,
        sample.temperature,
        sample.radiation,
        sample.humidity,
        sample.battery,
        sequenceStart + offset + 1,
        "synthetic",
      ]);
    }

    for (let offset = 0; offset < rows.length; offset += chunkSize) {
      const chunk = rows.slice(offset, offset + chunkSize);
      const values: unknown[] = [];
      const tuples = chunk.map((row) => {
        const position = values.length;
        values.push(...row);
        return `(${row.map((_value, column) => `$${position + column + 1}`).join(", ")})`;
      });
      await client.query(
        `INSERT INTO nileguard.sensor_readings (
           node_id, zone_id, gateway_id, measured_at, received_at, soil_moisture_percent,
           air_temperature_c, shortwave_radiation_w_m2, relative_humidity_percent,
           battery_mv, sequence, data_source
         ) VALUES ${tuples.join(", ")}`,
        values,
      );
    }

    const latest = mockMeasurement(zone, now, historyCount - 1, historyCount);
    await client.query(
      `UPDATE nileguard.nodes
       SET last_seen_at = CASE WHEN $4 THEN $2 ELSE COALESCE(last_seen_at, $2) END,
           battery_mv = CASE WHEN $4 OR last_seen_at IS NULL THEN $3 ELSE battery_mv END
       WHERE id = $1`,
      [zone.node, now.toISOString(), latest.battery, extendsExistingHistory],
    );
  }
}

export async function seedDatabase(database: Pool): Promise<void> {
  const client = await database.connect();
  let issuedCredentials: string[] = [];
  try {
    await client.query("BEGIN");
    issuedCredentials = await seedUsers(client);
    for (const crop of crops) {
      await client.query(
        `INSERT INTO nileguard.crops (
           id, name, moisture_threshold_percent, moisture_target_min_percent,
           moisture_target_max_percent, stages
         ) VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           moisture_threshold_percent = EXCLUDED.moisture_threshold_percent,
           moisture_target_min_percent = EXCLUDED.moisture_target_min_percent,
           moisture_target_max_percent = EXCLUDED.moisture_target_max_percent,
           stages = EXCLUDED.stages`,
        [crop.id, crop.name, crop.threshold, crop.minimum, crop.maximum, crop.stages],
      );
    }
    await client.query(
      "INSERT INTO nileguard.soil_types (id, name) VALUES ('loam', 'Loam soil'), ('sandy', 'Sandy soil') ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name",
    );
    await client.query("INSERT INTO nileguard.gateways (id) VALUES ('gateway-demo') ON CONFLICT (id) DO NOTHING");

    for (const zone of demoZones) {
      const crop = crops.find((entry) => entry.id === zone.crop);
      if (!crop) throw new Error(`Seed zone ${zone.id} refers to an unknown crop.`);
      await client.query(
        `INSERT INTO nileguard.zones (
           id, name, crop_id, soil_type_id, growth_stage, planting_date,
           moisture_target_min_percent, moisture_target_max_percent
         ) VALUES ($1, $2, $3, $4, $5, current_date - interval '180 days', $6, $7)
         ON CONFLICT (id) DO NOTHING`,
        [zone.id, zone.name, zone.crop, zone.soil, zone.stage, crop.minimum, crop.maximum],
      );
      await client.query(
        `INSERT INTO nileguard.nodes (id, zone_id, gateway_id)
         VALUES ($1, $2, 'gateway-demo')
         ON CONFLICT (id) DO NOTHING`,
        [zone.node, zone.id],
      );
      await client.query(
        `INSERT INTO nileguard.valve_controls (zone_id, state, mode)
         VALUES ($1, 'off', 'automatic')
         ON CONFLICT (zone_id) DO NOTHING`,
        [zone.id],
      );
    }
    await seedSyntheticHistory(client);

    const schedules = [
      ["schedule-tomato-loam", "zone-tomato-loam", 6, 16, "Drip irrigation"],
      ["schedule-tomato-sandy", "zone-tomato-sandy", 6, 14, "Drip irrigation"],
      ["schedule-potato-loam", "zone-potato-loam", 7, 18, "Drip irrigation"],
      ["schedule-potato-sandy", "zone-potato-sandy", 7, 14, "Drip irrigation"],
    ] as const;
    for (const [id, zoneId, hour, duration, method] of schedules) {
      await client.query(
        `INSERT INTO nileguard.irrigation_schedule (id, zone_id, start_at, duration_minutes, method, status)
         VALUES ($1, $2, date_trunc('day', now()) + make_interval(hours => $3), $4, $5, 'scheduled')
         ON CONFLICT (id) DO NOTHING`,
        [id, zoneId, hour, duration, method],
      );
    }
    await client.query("COMMIT");
    if (issuedCredentials.length) {
      console.log("One-time demo credentials (save these now; passwords are stored only as hashes):");
      for (const credential of issuedCredentials) console.log(`  ${credential}`);
    } else {
      console.log("Default demo users already exist; passwords were not changed.");
    }
    console.log("Seeded the four crop/soil combinations with hourly samples from the previous six months; existing synthetic histories are preserved.");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function rotateDemoPasswords(database: Pool): Promise<void> {
  const client = await database.connect();
  const issuedCredentials: string[] = [];
  try {
    await client.query("BEGIN");
    for (const user of defaultUsers) {
      const password = randomBytes(18).toString("base64url");
      const passwordHash = await hashPassword(password);
      const result = await client.query(
        `UPDATE nileguard.users SET password_hash = $2, updated_at = now()
         WHERE id = $1
         RETURNING email`,
        [user.id, passwordHash],
      );
      if (!result.rowCount) throw new Error(`Active demo account '${user.email}' was not found.`);
      issuedCredentials.push(`${user.email} / ${password}`);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  console.log("Rotated demo credentials (save these now; passwords are stored only as hashes):");
  for (const credential of issuedCredentials) console.log(`  ${credential}`);
}
