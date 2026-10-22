import { pool } from "./pool.js";
import { runMigrations } from "./migrate.js";
import { seedDatabase } from "./seed.js";

try {
  await runMigrations(pool);
  await seedDatabase(pool);
} catch (error) {
  console.error("PostgreSQL setup failed:", error instanceof Error ? error.message : "Unknown database setup error.");
  process.exitCode = 1;
} finally {
  await pool.end();
}
