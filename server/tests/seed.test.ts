import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { missingHourlyTimestamps } from "../src/database/seed.js";

describe("synthetic-history backfill", () => {
  it("returns missing hourly slots without replacing readings already present", () => {
    const hour = 60 * 60 * 1000;
    const start = new Date("2026-11-15T00:30:00.000Z");
    const end = new Date("2026-11-15T04:45:00.000Z");
    const occupied = new Set([Date.parse("2026-11-15T02:00:00.000Z")]);

    const missing = missingHourlyTimestamps(start, end, occupied);

    assert.deepEqual(missing.map((timestamp) => timestamp.toISOString()), [
      "2026-11-15T01:00:00.000Z",
      "2026-11-15T03:00:00.000Z",
      "2026-11-15T04:00:00.000Z",
    ]);
    assert.ok(missing.every((timestamp) => timestamp.getTime() % hour === 0));
  });
});
