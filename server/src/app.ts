import express from "express";
import helmet from "helmet";
import { config } from "./config.js";
import type { User } from "./domain/types.js";
import { errorHandler, notFoundHandler } from "./http/errors.js";
import { hashPassword } from "./http/auth.js";
import { createApiRouter } from "./http/routes.js";
import { MemoryRepository } from "./repositories/memoryRepository.js";
import type { NileGuardRepository } from "./domain/types.js";
import { ThresholdDecisionEngine } from "./services/decisionEngine.js";
import type { DecisionEngine } from "./services/decisionEngine.js";
import { openMeteoWeatherService } from "./services/weatherService.js";
import type { WeatherService } from "./services/weatherService.js";

export async function createApp(
  repository: NileGuardRepository = new MemoryRepository(),
  decisionEngine: DecisionEngine = new ThresholdDecisionEngine(),
  weatherService: WeatherService = openMeteoWeatherService,
) {
  if (config.nodeEnv === "production" && repository instanceof MemoryRepository) {
    throw new Error("The in-memory repository is for local development only. Configure a persistent database adapter before production.");
  }

  if (config.nodeEnv === "production" && !(await repository.listUsers()).length) {
    throw new Error("Create at least one persistent database user before starting in production.");
  }

  if (repository instanceof MemoryRepository && !await repository.getUserByEmail(config.demoAdminEmail)) {
    const demoUser: User = {
      id: "user-demo-admin",
      name: "NileGuard Demo Farmer",
      email: config.demoAdminEmail.toLowerCase(),
      phoneNumber: "+1-202-555-0101",
      passwordHash: await hashPassword(config.demoAdminPassword),
      role: "admin",
      createdAt: new Date().toISOString(),
    };
    await repository.addUser(demoUser);
  }

  const app = express();
  app.disable("x-powered-by");
  app.use(helmet());
  app.use(express.json({ limit: "64kb" }));
  app.use("/api", createApiRouter(repository, decisionEngine, weatherService));
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
