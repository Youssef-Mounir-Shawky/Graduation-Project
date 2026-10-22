import { randomBytes } from "node:crypto";
import { hashPassword } from "../http/auth.js";
import type { Pool, PoolClient } from "pg";

const crops = [
  {
    id: "lettuce",
    name: "Lettuce",
    threshold: 30,
    minimum: 35,
    maximum: 65,
    stages: ["seedling", "vegetative", "heading", "maturity"],
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
  { id: "zone-lettuce-clay", name: "Lettuce · Clay soil", crop: "lettuce", soil: "clay", stage: "vegetative", node: "node-lettuce-clay", moisture: 41 },
  { id: "zone-lettuce-sandy", name: "Lettuce · Sandy soil", crop: "lettuce", soil: "sandy", stage: "heading", node: "node-lettuce-sandy", moisture: 35 },
  { id: "zone-potato-clay", name: "Potato · Clay soil", crop: "potato", soil: "clay", stage: "bulking", node: "node-potato-clay", moisture: 38 },
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
  const soilOffset = zone.soil === "clay" ? 5 : -1;
  const cropOffset = zone.crop === "lettuce" ? 2 : 0;
  const moisture = zone.moisture + soilOffset + cropOffset
    + Math.sin(index / (zone.soil === "clay" ? 14 : 7)) * (zone.soil === "clay" ? 3 : 6)
    - daylight * (zone.soil === "clay" ? 1.5 : 3);
  const lux = daylight * (20_000 + 2_500 * seasonal);
  const temperatureBase = zone.crop === "lettuce" ? 20 : 18;
  const temperature = temperatureBase + seasonal * 1.8 + Math.sin(((hour - 8) / 24) * Math.PI * 2) * 3;
  const humidity = 67 - daylight * 10 - seasonal * 4 + Math.sin(index / 19) * 4;
  const co2 = 425 + daylight * 170 + Math.sin(index / 35) * 35;
  const soilPh = (zone.crop === "lettuce" ? 6.3 : 5.6)
    + (zone.soil === "clay" ? 0.25 : -0.1)
    + Math.sin(index / 720) * 0.12;
  const batteryMv = 4_120 - (index / count) * 330 + Math.sin(index / 180) * 12;

  return {
    moisture: round(Math.min(75, Math.max(12, moisture))),
    temperature: round(temperature, 1),
    lux: round(lux),
    ppfd: round(lux / 54),
    humidity: round(Math.min(90, Math.max(35, humidity))),
    co2: round(Math.min(750, Math.max(380, co2))),
    ph: round(Math.min(7.4, Math.max(4.8, soilPh)), 2),
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
  const timestamps: Date[] = [];
  for (let time = start.getTime(); time <= now.getTime(); time += hourMs) {
    timestamps.push(new Date(time));
  }
  if (timestamps.at(-1)?.getTime() !== now.getTime()) timestamps.push(now);
  const count = timestamps.length;
  const chunkSize = 500;

  for (const zone of demoZones) {
    const existing = await client.query(
      "SELECT 1 FROM nileguard.sensor_readings WHERE zone_id = $1 AND data_source = 'synthetic' LIMIT 1",
      [zone.id],
    );
    if (existing.rowCount) continue;

    const rows: Array<unknown[]> = [];
    for (let index = 0; index < count; index += 1) {
      const timestamp = timestamps[index];
      const sample = mockMeasurement(zone, timestamp, index, count);
      rows.push([
        zone.node,
        zone.id,
        "gateway-demo",
        timestamp.toISOString(),
        timestamp.toISOString(),
        sample.moisture,
        sample.temperature,
        sample.lux,
        sample.ppfd,
        sample.humidity,
        sample.battery,
        sample.co2,
        sample.ph,
        index + 1,
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
           air_temperature_c, light_lux, light_ppfd, relative_humidity_percent,
           battery_mv, co2_ppm, soil_ph, sequence, data_source
         ) VALUES ${tuples.join(", ")}`,
        values,
      );
    }

    const latest = mockMeasurement(zone, now, count - 1, count);
    await client.query(
      `UPDATE nileguard.nodes
       SET last_seen_at = COALESCE(last_seen_at, $2),
           battery_mv = CASE WHEN last_seen_at IS NULL THEN $3 ELSE battery_mv END
       WHERE id = $1`,
      [zone.node, now.toISOString(), latest.battery],
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
      "INSERT INTO nileguard.soil_types (id, name) VALUES ('clay', 'Clay soil'), ('sandy', 'Sandy soil') ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name",
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
      ["schedule-lettuce-clay", "zone-lettuce-clay", 6, 12, "Drip irrigation"],
      ["schedule-lettuce-sandy", "zone-lettuce-sandy", 6, 10, "Drip irrigation"],
      ["schedule-potato-clay", "zone-potato-clay", 7, 18, "Drip irrigation"],
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
