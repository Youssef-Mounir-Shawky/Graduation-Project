import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import type { Pool } from "pg";

export async function runMigrations(database: Pool): Promise<void> {
  await database.query("CREATE SCHEMA IF NOT EXISTS nileguard AUTHORIZATION CURRENT_USER");
  await database.query(`
    CREATE TABLE IF NOT EXISTS nileguard.schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  const folder = join(process.cwd(), "server", "src", "database", "migrations");
  const files = (await readdir(folder)).filter((file) => file.endsWith(".sql")).sort();
  for (const filename of files) {
    const alreadyApplied = await database.query(
      "SELECT 1 FROM nileguard.schema_migrations WHERE filename = $1",
      [filename],
    );
    if (alreadyApplied.rowCount) continue;

    const sql = await readFile(join(folder, filename), "utf8");
    const client = await database.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO nileguard.schema_migrations (filename) VALUES ($1)", [filename]);
      await client.query("COMMIT");
      console.log(`Applied database migration ${filename}.`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
