import "dotenv/config";

function readSecret(name: string, fallback: string): string {
  const value = process.env[name] ?? fallback;
  if (process.env.NODE_ENV === "production"
    && (value.length < 32 || /replace-with|change-this|example/i.test(value))) {
    throw new Error(`${name} must be a unique secret of at least 32 characters in production.`);
  }
  return value;
}

const nodeEnv = process.env.NODE_ENV ?? "development";

export const config = {
  host: process.env.HOST ?? "127.0.0.1",
  port: Number(process.env.PORT ?? 3001),
  nodeEnv,
  mockHardware: process.env.MOCK_HARDWARE === undefined
    ? nodeEnv !== "production"
    : process.env.MOCK_HARDWARE === "true",
  jwtSecret: readSecret("JWT_SECRET", "local-only-change-this-user-secret"),
  gatewayJwtSecret: readSecret("GATEWAY_JWT_SECRET", "local-only-change-this-gateway-secret"),
  nodeJwtSecret: readSecret("NODE_JWT_SECRET", "local-only-change-this-node-secret"),
  demoAdminEmail: process.env.DEMO_ADMIN_EMAIL ?? "farmer@nileguard.local",
  demoAdminPassword: process.env.DEMO_ADMIN_PASSWORD ?? "NileGuard2026!",
  weatherDefaultLocation: process.env.WEATHER_DEFAULT_LOCATION ?? "nasr-city",
  weatherCacheTtlMs: Number(process.env.WEATHER_CACHE_TTL_MS ?? 15 * 60 * 1000),
  weatherRequestTimeoutMs: Number(process.env.WEATHER_REQUEST_TIMEOUT_MS ?? 10_000),
  hardwareReadingFreshMs: Number(process.env.HARDWARE_READING_FRESH_MS ?? 5 * 60 * 1000),
  weatherReadingFreshMs: Number(process.env.WEATHER_READING_FRESH_MS ?? 30 * 60 * 1000),
  temperatureCompareToleranceC: Number(process.env.TEMPERATURE_COMPARE_TOLERANCE_C ?? 2),
  humidityCompareTolerancePercent: Number(process.env.HUMIDITY_COMPARE_TOLERANCE_PERCENT ?? 10),
  weatherProxyUrl: process.env.WEATHER_PROXY_URL?.replace(/\/+$/, "") ?? "",
  weatherProxyToken: process.env.WEATHER_PROXY_TOKEN ?? "",
};

if (config.nodeEnv === "production"
  && new Set([config.jwtSecret, config.gatewayJwtSecret, config.nodeJwtSecret]).size !== 3) {
  throw new Error("JWT_SECRET, GATEWAY_JWT_SECRET, and NODE_JWT_SECRET must all be different in production.");
}

if (config.nodeEnv === "production" && config.mockHardware) {
  throw new Error("MOCK_HARDWARE must be false in production.");
}

if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) {
  throw new Error("PORT must be a valid TCP port.");
}

if (!["nasr-city", "new-cairo", "masr-el-gedida"].includes(config.weatherDefaultLocation)) {
  throw new Error("WEATHER_DEFAULT_LOCATION must be nasr-city, new-cairo, or masr-el-gedida.");
}

if (!Number.isInteger(config.weatherCacheTtlMs) || config.weatherCacheTtlMs < 60_000 || config.weatherCacheTtlMs > 15 * 60_000) {
  throw new Error("WEATHER_CACHE_TTL_MS must be between 60000 and 900000.");
}

if (!Number.isInteger(config.weatherRequestTimeoutMs) || config.weatherRequestTimeoutMs < 1000 || config.weatherRequestTimeoutMs > 60_000) {
  throw new Error("WEATHER_REQUEST_TIMEOUT_MS must be between 1000 and 60000.");
}

for (const [name, value] of [
  ["HARDWARE_READING_FRESH_MS", config.hardwareReadingFreshMs],
  ["WEATHER_READING_FRESH_MS", config.weatherReadingFreshMs],
  ["TEMPERATURE_COMPARE_TOLERANCE_C", config.temperatureCompareToleranceC],
  ["HUMIDITY_COMPARE_TOLERANCE_PERCENT", config.humidityCompareTolerancePercent],
] as const) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number.`);
  }
}

if (Boolean(config.weatherProxyUrl) !== Boolean(config.weatherProxyToken)) {
  throw new Error("WEATHER_PROXY_URL and WEATHER_PROXY_TOKEN must be configured together.");
}

if (config.weatherProxyUrl) {
  let weatherProxyUrl: URL;
  try {
    weatherProxyUrl = new URL(config.weatherProxyUrl);
  } catch {
    throw new Error("WEATHER_PROXY_URL must be a valid HTTPS origin.");
  }
  if (weatherProxyUrl.protocol !== "https:"
    || weatherProxyUrl.pathname !== "/"
    || weatherProxyUrl.search
    || weatherProxyUrl.hash
    || weatherProxyUrl.username
    || weatherProxyUrl.password) {
    throw new Error("WEATHER_PROXY_URL must be an HTTPS origin without a path, query, or credentials.");
  }
}
