import { createApp } from "./app.js";
import { config } from "./config.js";
import { pool } from "./database/pool.js";
import { runMigrations } from "./database/migrate.js";
import { seedDatabase } from "./database/seed.js";
import { PostgresRepository } from "./repositories/postgresRepository.js";

await runMigrations(pool);
await seedDatabase(pool);
const app = await createApp(new PostgresRepository(pool));
const server = app.listen(config.port, config.host, () => {
  console.log(`NileGuard API listening at http://${config.host}:${config.port}`);
  console.log(`Persistence: PostgreSQL; hardware simulator: ${config.mockHardware ? "enabled" : "disabled"}`);
});

function closeServer(signal: string): void {
  console.log(`${signal} received; closing NileGuard API.`);
  server.close((error) => {
    if (error) {
      console.error("API shutdown failed:", error);
      process.exitCode = 1;
    }
    void pool.end();
  });
}

process.once("SIGINT", () => closeServer("SIGINT"));
process.once("SIGTERM", () => closeServer("SIGTERM"));
