import assert from "node:assert/strict";
import { describe, it } from "node:test";
import weatherProxy from "../../cloudflare/weather-proxy.js";

describe("Cloudflare Open-Meteo proxy", () => {
  it("authenticates requests and forwards only supported routes to fixed providers", async () => {
    const originalFetch = globalThis.fetch;
    const upstreamCalls: URL[] = [];
    globalThis.fetch = async (input) => {
      upstreamCalls.push(new URL(String(input)));
      return new Response(JSON.stringify({ ok: true }), {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": "30",
        },
      });
    };

    try {
      const env = { NILEGUARD_WEATHER_PROXY_TOKEN: "test-secret" };
      const unauthorized = await weatherProxy.fetch(
        new Request("https://worker.example.workers.dev/forecast?latitude=30"),
        env,
      );
      assert.equal(unauthorized.status, 401);
      assert.equal(upstreamCalls.length, 0);

      const unsupported = await weatherProxy.fetch(
        new Request("https://worker.example.workers.dev/arbitrary?url=https://example.com"),
        env,
      );
      assert.equal(unsupported.status, 404);
      assert.equal(upstreamCalls.length, 0);

      const forecast = await weatherProxy.fetch(
        new Request("https://worker.example.workers.dev/forecast?latitude=30&longitude=31", {
          headers: { Authorization: "Bearer test-secret" },
        }),
        env,
      );
      assert.equal(forecast.status, 429);
      assert.equal(forecast.headers.get("Retry-After"), "30");
      assert.equal(upstreamCalls[0].origin, "https://api.open-meteo.com");
      assert.equal(upstreamCalls[0].pathname, "/v1/forecast");
      assert.equal(upstreamCalls[0].searchParams.get("latitude"), "30");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
