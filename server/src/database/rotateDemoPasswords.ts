import { pool } from "./pool.js";
import { rotateDemoPasswords } from "./seed.js";

try {
  await rotateDemoPasswords(pool);
} catch (error) {
  console.error("Could not rotate demo user passwords:", error instanceof Error ? error.message : "Unknown error.");
  process.exitCode = 1;
} finally {
  await pool.end();
}
