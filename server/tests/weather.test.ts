import assert from "node:assert/strict";
import { describe, it } from "node:test";
import request from "supertest";
import { createApp } from "../src/app.js";
import { MemoryRepository } from "../src/repositories/memoryRepository.js";
import {
  OpenMeteoWeatherService,
  WeatherServiceError,
  type OpenMeteoWeather,
  type WeatherService,
} from "../src/services/weatherService.js";

const presetGeocoding: Record<string, { name: string; latitude: number; longitude: number }> = {
  "Madīnat Naṣr": { name: "Madīnat Naşr", latitude: 30.07152, longitude: 31.33642 },
  "New Cairo": { name: "New Cairo", latitude: 30.03, longitude: 31.47 },
  Heliopolis: { name: "Heliopolis", latitude: 30.10882, longitude: 31.37924 },
};

function forecastResponse(latitude: number, longitude: number): Record<string, unknown> {
  const times = Array.from({ length: 24 }, (_, index) => {
    const time = new Date(Date.UTC(2026, 9, 29, index));
    return `${time.toISOString().slice(0, 10)}T${time.toISOString().slice(11, 16)}`;
  });
  const days = Array.from({ length: 7 }, (_, index) =>
    new Date(Date.UTC(2026, 9, 29 + index)).toISOString().slice(0, 10),
  );
  return {
    latitude,
    longitude,
    elevation: 70,
    timezone: "Africa/Cairo",
    current_units: { time: "iso8601", temperature_2m: "°C", relative_humidity_2m: "%" },
    current: { time: "2026-10-29T15:00", temperature_2m: 27.3, relative_humidity_2m: null },
    hourly_units: {
      time: "iso8601",
      temperature_2m: "°C",
      precipitation: "mm",
      pressure_msl: "hPa",
      shortwave_radiation: "W/m²",
    },
    hourly: {
      time: times,
      temperature_2m: times.map((_time, index) => index === 1 ? null : 20 + index),
      precipitation: times.map(() => 0),
      pressure_msl: times.map((_time, index) => 1010 + index),
      shortwave_radiation: times.map((_time, index) => index * 10),
    },
    daily_units: { time: "iso8601", temperature_2m_max: "°C" },
    daily: {
      time: days,
      temperature_2m_max: days.map((_day, index) => 25 + index),
    },
  };
}

function response(body: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(body), { status, headers });
}

describe("Open-Meteo weather service", () => {
  it("geocodes all Cairo presets and caches forecasts separately by location", async () => {
    const calls: string[] = [];
    const service = new OpenMeteoWeatherService(async (input) => {
      const url = new URL(String(input));
      calls.push(url.href);
      if (url.hostname === "geocoding-api.open-meteo.com") {
        const result = presetGeocoding[url.searchParams.get("name") ?? ""];
        return response({
          results: result ? [{
            ...result,
            country_code: "EG",
            admin1: "Cairo Governorate",
            timezone: "Africa/Cairo",
            elevation: 70,
          }] : [],
        });
      }
      return response(forecastResponse(
        Number(url.searchParams.get("latitude")),
        Number(url.searchParams.get("longitude")),
      ));
    });

    const locations = await service.listLocations();
    assert.deepEqual(locations.map(({ id }) => id), ["nasr-city", "new-cairo", "masr-el-gedida"]);
    assert.deepEqual(locations.map(({ latitude, longitude }) => [latitude, longitude]), [
      [30.07152, 31.33642],
      [30.03, 31.47],
      [30.10882, 31.37924],
    ]);

    const nasrWeather = await service.getWeather("nasr-city");
    const cachedNasrWeather = await service.getWeather("nasr-city");
    const newCairoWeather = await service.getWeather("new-cairo");
    assert.equal(nasrWeather.source, "open-meteo");
    assert.equal(nasrWeather.attribution, "Weather data by Open-Meteo.com");
    assert.equal(nasrWeather.location.id, "nasr-city");
    assert.equal(nasrWeather.current.temperature_2m, 27.3);
    assert.equal(nasrWeather.current.relative_humidity_2m, null);
    assert.equal(nasrWeather.hourly.time?.length, 24);
    assert.equal(nasrWeather.hourly.temperature_2m?.[1], null);
    assert.equal(nasrWeather.hourly.pressure_msl?.[4], 1014);
    assert.equal(nasrWeather.hourly.shortwave_radiation?.[4], 40);
    const forecastRequest = new URL(calls.find((url) => url.includes("/v1/forecast"))!);
    assert.match(forecastRequest.searchParams.get("hourly") ?? "", /pressure_msl/);
    assert.match(forecastRequest.searchParams.get("hourly") ?? "", /shortwave_radiation/);
    assert.equal(nasrWeather.daily.time?.length, 7);
    assert.deepEqual(nasrWeather.units.current, {
      time: "iso8601",
      temperature_2m: "°C",
      relative_humidity_2m: "%",
    });
    assert.equal(cachedNasrWeather, nasrWeather);
    assert.equal(newCairoWeather.location.id, "new-cairo");
    assert.notEqual(newCairoWeather.location.latitude, nasrWeather.location.latitude);
    assert.equal(calls.filter((url) => url.includes("/v1/forecast")).length, 2);
  });

  it("accepts node-specific coordinates without a preset lookup", async () => {
    const calls: string[] = [];
    const service = new OpenMeteoWeatherService(async (input) => {
      const url = new URL(String(input));
      calls.push(url.hostname);
      return response(forecastResponse(
        Number(url.searchParams.get("latitude")),
        Number(url.searchParams.get("longitude")),
      ));
    });
    const weather = await service.getWeather(undefined, 31.2, 29.9);
    assert.deepEqual(calls, ["api.open-meteo.com"]);
    assert.equal(weather.location.id, "coordinates");
    assert.equal(weather.location.latitude, 31.2);
    assert.equal(weather.location.longitude, 29.9);
  });

  it("routes forecast and geocoding through the configured authenticated proxy", async () => {
    const calls: Array<{ url: URL; authorization: string | null }> = [];
    const service = new OpenMeteoWeatherService(async (input, init) => {
      const url = new URL(String(input));
      calls.push({
        url,
        authorization: new Headers(init?.headers).get("Authorization"),
      });
      if (url.pathname === "/geocoding") {
        const result = presetGeocoding[url.searchParams.get("name") ?? ""];
        return response({
          results: result ? [{
            ...result,
            country_code: "EG",
            admin1: "Cairo Governorate",
            timezone: "Africa/Cairo",
            elevation: 70,
          }] : [],
        });
      }
      return response(forecastResponse(
        Number(url.searchParams.get("latitude")),
        Number(url.searchParams.get("longitude")),
      ));
    }, 1000, 60_000, 60_000, {
      url: "https://nileguard-weather.example.workers.dev",
      token: "unit-test-proxy-secret",
    });

    await service.listLocations();
    const weather = await service.getWeather("nasr-city");
    assert.equal(weather.location.id, "nasr-city");
    assert.equal(calls.filter(({ url }) => url.pathname === "/geocoding").length, 3);
    assert.equal(calls.filter(({ url }) => url.pathname === "/forecast").length, 1);
    assert.ok(calls.every(({ url }) => url.hostname === "nileguard-weather.example.workers.dev"));
    assert.ok(calls.every(({ authorization }) => authorization === "Bearer unit-test-proxy-secret"));
  });

  it("shares simultaneous forecast requests and serves stale data during provider rate limits", async () => {
    let releaseForecast!: () => void;
    const forecastGate = new Promise<void>((resolve) => {
      releaseForecast = resolve;
    });
    let forecastCalls = 0;
    let rateLimited = false;
    const service = new OpenMeteoWeatherService(async (input) => {
      const url = new URL(String(input));
      if (url.hostname === "geocoding-api.open-meteo.com") {
        const result = presetGeocoding[url.searchParams.get("name") ?? ""];
        return response({
          results: result ? [{
            ...result,
            country_code: "EG",
            admin1: "Cairo Governorate",
            timezone: "Africa/Cairo",
            elevation: 70,
          }] : [],
        });
      }
      forecastCalls += 1;
      if (!rateLimited) await forecastGate;
      if (rateLimited) return response({}, 429, { "Retry-After": "45" });
      return response(forecastResponse(
        Number(url.searchParams.get("latitude")),
        Number(url.searchParams.get("longitude")),
      ));
    }, 1000, 0, 60_000);

    await service.listLocations();
    const firstRequest = service.getWeather("nasr-city");
    const secondRequest = service.getWeather("nasr-city");
    releaseForecast();
    const [first, second] = await Promise.all([firstRequest, secondRequest]);
    assert.equal(forecastCalls, 1);
    assert.equal(first, second);

    rateLimited = true;
    const stale = await service.getWeather("nasr-city");
    assert.equal(stale.stale, true);
    assert.equal(stale.retrieved_at, first.retrieved_at);
    assert.equal(forecastCalls, 2);

    await assert.rejects(
      service.getWeather("new-cairo"),
      (error: unknown) => error instanceof WeatherServiceError
        && error.code === "WEATHER_PROVIDER_RATE_LIMITED"
        && error.retryAfterSeconds !== undefined,
    );
    assert.equal(forecastCalls, 2);
  });

  it("honors the provider cooldown when no previous forecast is cached", async () => {
    let calls = 0;
    const service = new OpenMeteoWeatherService(async () => {
      calls += 1;
      return response({}, 429, { "Retry-After": "45" });
    });
    const isRateLimit = (error: unknown) => error instanceof WeatherServiceError
      && error.code === "WEATHER_PROVIDER_RATE_LIMITED"
      && error.retryAfterSeconds !== undefined;
    await assert.rejects(service.getWeather(undefined, 30, 31), isRateLimit);
    await assert.rejects(
      service.getWeather(undefined, 30, 31),
      (error: unknown) => isRateLimit(error) && error.retryAfterSeconds! > 0,
    );
    assert.equal(calls, 1);
  });

  it("rejects unresolved areas and does not fabricate fallback conditions", async () => {
    const service = new OpenMeteoWeatherService(async () => response({}));
    await assert.rejects(
      service.getWeather("nasr-city"),
      (error: unknown) => error instanceof WeatherServiceError
        && error.code === "WEATHER_LOCATION_UNRESOLVED"
        && error.status === 422,
    );
  });

  it("reports provider rate limiting and preserves retry timing", async () => {
    const service = new OpenMeteoWeatherService(async () => response({}, 429, { "Retry-After": "45" }));
    await assert.rejects(
      service.listLocations(),
      (error: unknown) => error instanceof WeatherServiceError
        && error.code === "WEATHER_PROVIDER_RATE_LIMITED"
        && error.retryAfterSeconds === 45,
    );
  });

  it("reports timeouts and malformed forecast responses as provider errors", async () => {
    const timeoutService = new OpenMeteoWeatherService(async () => {
      throw new DOMException("Request timed out.", "TimeoutError");
    });
    await assert.rejects(
      timeoutService.getWeather(undefined, 30, 31),
      (error: unknown) => error instanceof WeatherServiceError
        && error.code === "WEATHER_PROVIDER_TIMEOUT"
        && error.status === 504,
    );

    const incompleteService = new OpenMeteoWeatherService(async () => response({
      current: {},
      hourly: { time: ["2026-10-29T15:00"] },
      daily: { time: ["2026-10-29"] },
    }));
    await assert.rejects(
      incompleteService.getWeather(undefined, 30, 31),
      (error: unknown) => error instanceof WeatherServiceError
        && error.code === "WEATHER_PROVIDER_MISSING_FORECAST"
        && error.status === 502,
    );
  });
});

describe("Weather API routes", () => {
  it("exposes authenticated locations, preset weather, and future field coordinates", async () => {
    const weather: OpenMeteoWeather = {
      source: "open-meteo",
      attribution: "Weather data by Open-Meteo.com",
      retrieved_at: "2026-10-29T12:00:00.000Z",
      location: { id: "nasr-city", name: "Nasr City", latitude: 30.07152, longitude: 31.33642 },
      units: { current: {}, hourly: {}, daily: {} },
      current: { time: "2026-10-29T15:00", temperature_2m: 27.3 },
      hourly: { time: ["2026-10-29T15:00"], temperature_2m: [27.3] },
      daily: { time: ["2026-10-29"], temperature_2m_max: [27.3] },
    };
    const calls: Array<[string | undefined, number | undefined, number | undefined]> = [];
    const weatherService: WeatherService = {
      listLocations: async () => [{
        id: "nasr-city",
        name: "Nasr City",
        latitude: 30.07152,
        longitude: 31.33642,
        preset: true,
      }],
      getWeather: async (location, latitude, longitude) => {
        calls.push([location, latitude, longitude]);
        return weather;
      },
    };
    const app = await createApp(new MemoryRepository(), undefined, weatherService);
    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: "farmer@nileguard.local", password: "NileGuard2026!" });
    assert.equal(login.status, 200);
    const authorization = `Bearer ${login.body.data.token as string}`;

    assert.equal((await request(app).get("/api/weather/locations")).status, 401);
    const locations = await request(app).get("/api/weather/locations").set("Authorization", authorization);
    assert.equal(locations.status, 200);
    assert.equal(locations.body.data[0].id, "nasr-city");

    const preset = await request(app).get("/api/weather?location=nasr-city").set("Authorization", authorization);
    assert.equal(preset.status, 200);
    assert.equal(preset.body.data.source, "open-meteo");
    assert.deepEqual(calls[0], ["nasr-city", undefined, undefined]);

    const coordinates = await request(app)
      .get("/api/weather?latitude=31.2&longitude=29.9")
      .set("Authorization", authorization);
    assert.equal(coordinates.status, 200);
    assert.deepEqual(calls[1], [undefined, 31.2, 29.9]);

    const invalidCoordinates = await request(app)
      .get("/api/weather?latitude=31.2")
      .set("Authorization", authorization);
    assert.equal(invalidCoordinates.status, 400);
    assert.equal(calls.length, 2);
  });

  it("maps provider failures without returning substitute weather", async () => {
    const weatherService: WeatherService = {
      listLocations: async () => {
        throw new WeatherServiceError(503, "WEATHER_PROVIDER_RATE_LIMITED", "Rate limited.", 30);
      },
      getWeather: async () => {
        throw new WeatherServiceError(504, "WEATHER_PROVIDER_TIMEOUT", "Timed out.");
      },
    };
    const app = await createApp(new MemoryRepository(), undefined, weatherService);
    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: "farmer@nileguard.local", password: "NileGuard2026!" });
    const authorization = `Bearer ${login.body.data.token as string}`;

    const limited = await request(app).get("/api/weather/locations").set("Authorization", authorization);
    assert.equal(limited.status, 503);
    assert.equal(limited.headers["retry-after"], "30");
    assert.equal(limited.body.error.code, "WEATHER_PROVIDER_RATE_LIMITED");

    const timeout = await request(app).get("/api/weather").set("Authorization", authorization);
    assert.equal(timeout.status, 504);
    assert.equal(timeout.body.error.code, "WEATHER_PROVIDER_TIMEOUT");
    assert.equal("data" in timeout.body, false);
  });
});
