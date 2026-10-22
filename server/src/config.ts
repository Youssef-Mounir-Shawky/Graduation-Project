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
