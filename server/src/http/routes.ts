import { randomUUID } from "node:crypto";
import { compare, hashSync } from "bcryptjs";
import { Router } from "express";
import type { Request, Response } from "express";
import type { Alert, NileGuardRepository, Node, Reading, User, Zone } from "../domain/types.js";
import { config } from "../config.js";
import { applyAutomaticRecommendation, evaluateRecommendations, type DecisionEngine } from "../services/decisionEngine.js";
import { ApiError } from "./errors.js";
import {
  authenticateGateway,
  authenticateNode,
  authenticateUser,
  hashPassword,
  publicUser,
  requireGateway,
  requireNode,
  requireRole,
  requireUser,
  signGatewayToken,
  signNodeToken,
  signUserToken,
} from "./auth.js";
import {
  createNodeSchema,
  createUserSchema,
  createZoneSchema,
  loginSchema,
  nodeParamsSchema,
  overrideSchema,
  patchNodeSchema,
  patchZoneSchema,
  readingsQuerySchema,
  readingSchema,
  registerNodeSchema,
  updateProfileSchema,
  userParamsSchema,
  zoneParamsSchema,
} from "./schemas.js";
import { buildAlerts, PostgresRepository } from "../repositories/postgresRepository.js";
import { isNodeOnline } from "../services/telemetry.js";

function sendData(response: Response, data: unknown, status = 200): void {
  response.status(status).json({ data });
}

function isEmailUniqueViolation(error: unknown): boolean {
  return error !== null
    && typeof error === "object"
    && "code" in error
    && error.code === "23505"
    && "constraint" in error
    && (error.constraint === "users_email_key"
      || error.constraint === "users_active_email_unique_idx"
      || error.constraint === "users_email_case_insensitive_idx");
}

const DUMMY_PASSWORD_HASH = hashSync("nileguard-invalid-user-lookup", 12);

function safeReading(reading: Reading): Reading {
  return { ...reading };
}

async function getZoneOrThrow(repository: NileGuardRepository, zoneId: string) {
  const snapshot = await repository.getZoneSnapshot(zoneId);
  if (!snapshot) throw new ApiError(404, "ZONE_NOT_FOUND", `Zone '${zoneId}' was not found.`);
  return snapshot;
}

async function presentZone(repository: NileGuardRepository, zoneId: string) {
  const snapshot = await getZoneOrThrow(repository, zoneId);
  const lastSeenAt = snapshot.node?.lastSeenAt ?? null;
  return {
    id: snapshot.zone.id,
    name: snapshot.zone.name,
    crop: snapshot.crop.name,
    crop_id: snapshot.crop.id,
    soil_type: snapshot.zone.soilType,
    growth_stage: snapshot.zone.growthStage,
    planting_date: snapshot.zone.plantingDate,
    moisture_target_min_percent: snapshot.zone.moistureTargetMinPercent,
    moisture_target_max_percent: snapshot.zone.moistureTargetMaxPercent,
    moisture_threshold_percent: snapshot.crop.moistureThresholdPercent,
    node: {
      id: snapshot.node?.id ?? null,
      gateway_id: snapshot.node?.gatewayId ?? null,
      online: isNodeOnline(snapshot.node),
      last_seen_at: lastSeenAt,
      battery_mv: snapshot.node?.batteryMv ?? null,
    },
    reading: snapshot.latestReading ? safeReading(snapshot.latestReading) : null,
    valve: {
      state: snapshot.valve.state,
      mode: snapshot.valve.mode,
      updated_at: snapshot.valve.updatedAt,
      updated_by: snapshot.valve.updatedBy,
    },
  };
}

function presentAlert(alert: Alert) {
  return {
    id: alert.id,
    type: alert.type,
    zone_id: alert.zoneId,
    zone_name: alert.zoneName,
    severity: alert.severity,
    title: alert.title,
    reason: alert.reason,
    created_at: alert.createdAt,
    acknowledged: alert.acknowledged,
  };
}

function presentNode(node: Node) {
  return {
    id: node.id,
    zone_id: node.zoneId,
    gateway_id: node.gatewayId,
    last_seen_at: node.lastSeenAt,
    battery_mv: node.batteryMv,
    last_sequence: node.lastSequence,
    online: isNodeOnline(node),
  };
}

function parseZoneParams(request: Request): string {
  return zoneParamsSchema.parse(request.params).zoneId;
}

function parseNodeParams(request: Request): string {
  return nodeParamsSchema.parse(request.params).nodeId;
}

function parseUserParams(request: Request): string {
  return userParamsSchema.parse(request.params).userId;
}

export function createApiRouter(repository: NileGuardRepository, decisionEngine: DecisionEngine): Router {
  const router = Router();
  const userAuth = authenticateUser(repository);
  const adminOnly = [userAuth, requireRole("admin")];

  router.get("/health", (_request, response) => {
    sendData(response, {
      status: "ok",
      persistence: repository instanceof PostgresRepository ? "postgres" : "in-memory",
      hardware: config.mockHardware ? "mock" : "disabled",
      mock_hardware: config.mockHardware && config.nodeEnv !== "production",
      timestamp: new Date().toISOString(),
    });
  });

  router.post("/auth/login", async (request, response) => {
    const credentials = loginSchema.parse(request.body);
    const user = await repository.getUserByEmail(credentials.email);
    const passwordMatches = await compare(credentials.password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
    if (!user || !passwordMatches) throw new ApiError(401, "INVALID_CREDENTIALS", "Email or password is incorrect.");
    sendData(response, { token: signUserToken(user), user: publicUser(user) });
  });

  router.get("/auth/me", userAuth, async (request, response) => {
    const user = requireUser(request);
    const storedUser = await repository.getUserById(user.id);
    if (!storedUser) throw new ApiError(401, "INVALID_TOKEN", "The account for this token no longer exists.");
    sendData(response, publicUser(storedUser));
  });

  router.patch("/auth/me", userAuth, async (request, response) => {
    const currentUser = requireUser(request);
    const changes = updateProfileSchema.parse(request.body);
    const existing = await repository.getUserById(currentUser.id);
    if (!existing) throw new ApiError(401, "INVALID_TOKEN", "The account for this token no longer exists.");
    if (changes.email && changes.email.toLowerCase() !== existing.email.toLowerCase()
      && await repository.getUserByEmail(changes.email)) {
      throw new ApiError(409, "EMAIL_IN_USE", "A user with this email already exists.");
    }

    let updated: User | undefined;
    try {
      updated = await repository.updateUser(currentUser.id, {
        ...(changes.name !== undefined ? { name: changes.name } : {}),
        ...(changes.email !== undefined ? { email: changes.email } : {}),
        ...(changes.phone_number !== undefined ? { phoneNumber: changes.phone_number } : {}),
        ...(changes.password !== undefined ? { passwordHash: await hashPassword(changes.password) } : {}),
      });
    } catch (error) {
      if (isEmailUniqueViolation(error)) throw new ApiError(409, "EMAIL_IN_USE", "A user with this email already exists.");
      throw error;
    }
    if (!updated) throw new ApiError(401, "INVALID_TOKEN", "The account for this token no longer exists.");
    sendData(response, publicUser(updated));
  });

  router.post("/auth/logout", userAuth, (_request, response) => {
    sendData(response, { logged_out: true });
  });

  router.get("/zones", userAuth, async (_request, response) => {
    const snapshots = await repository.listZoneSnapshots();
    sendData(response, await Promise.all(snapshots.map((snapshot) => presentZone(repository, snapshot.zone.id))));
  });

  router.post("/zones", ...adminOnly, async (request, response) => {
    const input = createZoneSchema.parse(request.body);
    const crop = await repository.getCrop(input.crop_id);
    if (!crop) throw new ApiError(400, "CROP_NOT_FOUND", `Crop '${input.crop_id}' is not configured.`);
    if (!crop.stages.includes(input.growth_stage)) {
      throw new ApiError(400, "INVALID_GROWTH_STAGE", `${input.growth_stage} is not a stage for ${crop.name}.`);
    }
    const zoneId = `zone-${randomUUID()}`;
    const zone: Zone = {
      id: zoneId,
      name: input.name,
      cropId: input.crop_id,
      soilType: input.soil_type,
      growthStage: input.growth_stage,
      plantingDate: input.planting_date,
      nodeId: null,
      moistureTargetMinPercent: input.moisture_target_min_percent,
      moistureTargetMaxPercent: input.moisture_target_max_percent,
    };
    await repository.addZone(zone);
    sendData(response, await presentZone(repository, zoneId), 201);
  });

  router.get("/zones/:zoneId", userAuth, async (request, response) => {
    sendData(response, await presentZone(repository, parseZoneParams(request)));
  });

  router.patch("/zones/:zoneId", ...adminOnly, async (request, response) => {
    const zoneId = parseZoneParams(request);
    const changes = patchZoneSchema.parse(request.body);
    if (changes.crop_id && !await repository.getCrop(changes.crop_id)) {
      throw new ApiError(400, "CROP_NOT_FOUND", `Crop '${changes.crop_id}' is not configured.`);
    }
    const currentZone = await repository.getZone(zoneId);
    if (!currentZone) throw new ApiError(404, "ZONE_NOT_FOUND", `Zone '${zoneId}' was not found.`);
    const minimum = changes.moisture_target_min_percent ?? currentZone.moistureTargetMinPercent;
    const maximum = changes.moisture_target_max_percent ?? currentZone.moistureTargetMaxPercent;
    if (minimum >= maximum) {
      throw new ApiError(400, "INVALID_MOISTURE_TARGET", "The minimum moisture target must be lower than the maximum.");
    }
    const selectedCrop = await repository.getCrop(changes.crop_id ?? currentZone.cropId);
    if (!selectedCrop) throw new ApiError(400, "CROP_NOT_FOUND", "The zone's crop configuration is unavailable.");
    if (changes.growth_stage && !selectedCrop.stages.includes(changes.growth_stage)) {
      throw new ApiError(400, "INVALID_GROWTH_STAGE", `${changes.growth_stage} is not a stage for ${selectedCrop.name}.`);
    }
    const { crop_id, soil_type, growth_stage, planting_date, moisture_target_min_percent, moisture_target_max_percent, ...remaining } = changes;
    const updated = await repository.updateZone(zoneId, {
      ...remaining,
      ...(crop_id !== undefined ? { cropId: crop_id } : {}),
      ...(soil_type !== undefined ? { soilType: soil_type } : {}),
      ...(growth_stage !== undefined ? { growthStage: growth_stage } : {}),
      ...(planting_date !== undefined ? { plantingDate: planting_date } : {}),
      ...(moisture_target_min_percent !== undefined ? { moistureTargetMinPercent: moisture_target_min_percent } : {}),
      ...(moisture_target_max_percent !== undefined ? { moistureTargetMaxPercent: moisture_target_max_percent } : {}),
    });
    if (!updated) throw new ApiError(404, "ZONE_NOT_FOUND", `Zone '${zoneId}' was not found.`);
    sendData(response, await presentZone(repository, zoneId));
  });

  router.delete("/zones/:zoneId", ...adminOnly, async (request, response) => {
    const zoneId = parseZoneParams(request);
    if (!await repository.deleteZone(zoneId)) throw new ApiError(404, "ZONE_NOT_FOUND", `Zone '${zoneId}' was not found.`);
    response.status(204).end();
  });

  router.get("/crops", userAuth, async (_request, response) => {
    sendData(response, await repository.listCrops());
  });

  router.get("/nodes", userAuth, async (_request, response) => {
    sendData(response, (await repository.listNodes()).map(presentNode));
  });

  router.post("/nodes", ...adminOnly, async (request, response) => {
    const input = createNodeSchema.parse(request.body);
    const zone = await repository.getZone(input.zone_id);
    if (!zone) throw new ApiError(400, "ZONE_NOT_FOUND", `Zone '${input.zone_id}' was not found.`);
    if (zone.nodeId) throw new ApiError(409, "ZONE_ALREADY_HAS_NODE", "Each zone can be assigned one field node.");
    const nodeId = input.id ?? `node-${randomUUID()}`;
    if (await repository.getNode(nodeId)) throw new ApiError(409, "NODE_ID_IN_USE", `Node '${nodeId}' is already registered.`);
    await repository.addNode({ id: nodeId, zoneId: zone.id, gatewayId: input.gateway_id, lastSeenAt: null, batteryMv: 0, lastSequence: 0 });
    const node = await repository.getNode(nodeId);
    if (!node) throw new ApiError(500, "NODE_CREATE_FAILED", "The registered node could not be loaded.");
    sendData(response, presentNode(node), 201);
  });

  router.patch("/nodes/:nodeId", ...adminOnly, async (request, response) => {
    const nodeId = parseNodeParams(request);
    const changes = patchNodeSchema.parse(request.body);
    const current = await repository.getNode(nodeId);
    if (!current) throw new ApiError(404, "NODE_NOT_FOUND", `Node '${nodeId}' was not found.`);
    if (changes.zone_id && changes.zone_id !== current.zoneId) {
      const target = await repository.getZone(changes.zone_id);
      if (!target) throw new ApiError(400, "ZONE_NOT_FOUND", `Zone '${changes.zone_id}' was not found.`);
      if (target.nodeId) throw new ApiError(409, "ZONE_ALREADY_HAS_NODE", "Each zone can be assigned one field node.");
      const oldZone = await repository.getZone(current.zoneId);
      if (oldZone) await repository.updateZone(oldZone.id, { nodeId: null });
      await repository.updateZone(target.id, { nodeId: nodeId });
    }
    const updated = await repository.updateNode(nodeId, {
      ...(changes.zone_id !== undefined ? { zoneId: changes.zone_id } : {}),
      ...(changes.gateway_id !== undefined ? { gatewayId: changes.gateway_id } : {}),
    });
    if (!updated) throw new ApiError(404, "NODE_NOT_FOUND", `Node '${nodeId}' was not found.`);
    sendData(response, presentNode(updated));
  });

  router.delete("/nodes/:nodeId", ...adminOnly, async (request, response) => {
    const nodeId = parseNodeParams(request);
    const node = await repository.getNode(nodeId);
    if (!node) throw new ApiError(404, "NODE_NOT_FOUND", `Node '${nodeId}' was not found.`);
    await repository.deleteNode(nodeId);
    response.status(204).end();
  });

  router.get("/users", ...adminOnly, async (_request, response) => {
    sendData(response, (await repository.listUsers()).map(publicUser));
  });

  router.post("/users", ...adminOnly, async (request, response) => {
    const input = createUserSchema.parse(request.body);
    if (await repository.getUserByEmail(input.email)) throw new ApiError(409, "EMAIL_IN_USE", "A user with this email already exists.");
    const user: User = {
      id: `user-${randomUUID()}`,
      name: input.name,
      email: input.email.toLowerCase(),
      phoneNumber: input.phone_number,
      passwordHash: await hashPassword(input.password),
      role: input.role,
      createdAt: new Date().toISOString(),
    };
    try {
      await repository.addUser(user);
    } catch (error) {
      if (isEmailUniqueViolation(error)) throw new ApiError(409, "EMAIL_IN_USE", "A user with this email already exists.");
      throw error;
    }
    sendData(response, publicUser(user), 201);
  });

  router.delete("/users/:userId", ...adminOnly, async (request, response) => {
    const userId = parseUserParams(request);
    if (userId === requireUser(request).id) throw new ApiError(409, "CANNOT_DELETE_SELF", "An administrator cannot delete their own signed-in account.");
    const target = await repository.getUserById(userId);
    if (!target) throw new ApiError(404, "USER_NOT_FOUND", `User '${userId}' was not found.`);
    if (target.role === "admin" && (await repository.listUsers()).filter((user) => user.role === "admin").length < 2) {
      throw new ApiError(409, "LAST_ADMIN", "The last administrator cannot be deleted.");
    }
    await repository.deleteUser(userId);
    response.status(204).end();
  });

  router.get("/readings", userAuth, async (request, response) => {
    const query = readingsQuerySchema.parse(request.query);
    if (query.zone_id && !await repository.getZone(query.zone_id)) {
      throw new ApiError(404, "ZONE_NOT_FOUND", `Zone '${query.zone_id}' was not found.`);
    }
    const since = new Date(Date.now() - query.hours * 60 * 60_000);
    const readings = await repository.listReadings(query.zone_id, since, query.limit);
    sendData(response, { readings, count: readings.length });
  });

  router.post("/readings", authenticateGateway, authenticateNode, async (request, response) => {
    const gatewayId = requireGateway(request);
    const authenticatedNodeId = requireNode(request);
    const input = readingSchema.parse(request.body);
    if (input.node_id !== authenticatedNodeId) {
      throw new ApiError(403, "NODE_MISMATCH", "The node_id must match the authenticated field-node token.");
    }
    if (input.gateway_id !== gatewayId) throw new ApiError(403, "GATEWAY_MISMATCH", "The reading gateway_id must match the authenticated gateway.");
    const node = await repository.getNode(input.node_id);
    if (!node) throw new ApiError(404, "NODE_NOT_REGISTERED", `Node '${input.node_id}' is not registered.`);
    if (node.zoneId !== input.zone) throw new ApiError(409, "NODE_ZONE_MISMATCH", "The node is not registered to the supplied zone.");
    if (node.gatewayId !== gatewayId) throw new ApiError(403, "GATEWAY_NOT_ASSIGNED", "This gateway is not assigned to the node.");
    if (input.seq <= node.lastSequence) throw new ApiError(409, "STALE_SEQUENCE", "The reading sequence must be greater than the node's last accepted sequence.");
    const timestamp = input.timestamp ?? new Date().toISOString();
    if (Date.parse(timestamp) > Date.now() + 5 * 60_000) {
      throw new ApiError(400, "FUTURE_READING", "Reading timestamps cannot be more than five minutes in the future.");
    }
    const reading: Reading = {
      id: `${input.node_id}-${input.seq}`,
      node_id: input.node_id,
      zone: input.zone,
      moisture: input.moisture,
      temp: input.temp,
      light_lux: input.light_lux ?? null,
      light_ppfd: input.light_ppfd ?? null,
      humidity: input.humidity,
      co2_ppm: input.co2_ppm ?? null,
      soil_ph: input.soil_ph ?? null,
      battery_mv: input.battery_mv,
      seq: input.seq,
      gateway_id: gatewayId,
      timestamp,
      received_at: new Date().toISOString(),
      data_source: "gateway",
    };
    try {
      await repository.recordReading(reading);
    } catch (error) {
      if (error instanceof Error && error.message === "STALE_SEQUENCE") {
        throw new ApiError(409, "STALE_SEQUENCE", "The reading sequence must be greater than the node's last accepted sequence.");
      }
      throw error;
    }
    const recommendation = (await evaluateRecommendations(repository, decisionEngine, input.zone))[0];
    await applyAutomaticRecommendation(repository, recommendation);
    sendData(response, { reading, recommendation }, 201);
  });

  router.get("/recommendations", userAuth, async (request, response) => {
    const zoneId = typeof request.query.zone_id === "string" ? request.query.zone_id : undefined;
    if (zoneId && !await repository.getZone(zoneId)) throw new ApiError(404, "ZONE_NOT_FOUND", `Zone '${zoneId}' was not found.`);
    sendData(response, await evaluateRecommendations(repository, decisionEngine, zoneId));
  });

  router.get("/zones/:zoneId/recommendation", userAuth, async (request, response) => {
    const zoneId = parseZoneParams(request);
    const recommendation = (await evaluateRecommendations(repository, decisionEngine, zoneId))[0];
    if (!recommendation) throw new ApiError(404, "ZONE_NOT_FOUND", `Zone '${zoneId}' was not found.`);
    sendData(response, recommendation);
  });

  router.put("/zones/:zoneId/override", userAuth, async (request, response) => {
    const zoneId = parseZoneParams(request);
    const { valve_state } = overrideSchema.parse(request.body);
    const valve = await repository.setManualValve(zoneId, valve_state, requireUser(request).id);
    if (!valve) throw new ApiError(404, "ZONE_NOT_FOUND", `Zone '${zoneId}' was not found.`);
    sendData(response, {
      zone_id: zoneId,
      valve_state: valve.state,
      mode: valve.mode,
      updated_at: valve.updatedAt,
      updated_by: valve.updatedBy,
      reason: "Manual valve state is authoritative and overrides automatic irrigation recommendations.",
    });
  });

  router.delete("/zones/:zoneId/override", userAuth, async (request, response) => {
    const zoneId = parseZoneParams(request);
    if (!await repository.getZone(zoneId)) throw new ApiError(404, "ZONE_NOT_FOUND", `Zone '${zoneId}' was not found.`);
    const valve = await repository.clearManualValve(zoneId);
    const recommendation = (await evaluateRecommendations(repository, decisionEngine, zoneId))[0];
    if (!valve || !recommendation) throw new ApiError(404, "ZONE_NOT_FOUND", `Zone '${zoneId}' was not found.`);
    await applyAutomaticRecommendation(repository, recommendation);
    sendData(response, {
      zone_id: zoneId,
      valve_state: recommendation.effectiveValveState,
      mode: "automatic",
      updated_at: valve.updatedAt,
      updated_by: null,
      reason: "Automatic recommendations control this valve again.",
    });
  });

  router.get("/alerts", userAuth, async (_request, response) => {
    sendData(response, (await buildAlerts(repository)).map(presentAlert));
  });

  router.get("/irrigation/schedule", userAuth, async (_request, response) => {
    sendData(response, (await repository.listSchedule()).map((entry) => ({
      id: entry.id,
      zone_id: entry.zoneId,
      zone_name: entry.zoneName,
      start_at: entry.startAt,
      duration_minutes: entry.durationMinutes,
      method: entry.method,
      status: entry.status,
    })));
  });

  router.post("/nodes/register", authenticateGateway, async (request, response) => {
    const gatewayId = requireGateway(request);
    const { node_id: requestedNodeId, zone_id } = registerNodeSchema.parse(request.body);
    const zone = await repository.getZone(zone_id);
    if (!zone) throw new ApiError(404, "ZONE_NOT_FOUND", `Zone '${zone_id}' was not found.`);
    if (zone.nodeId) throw new ApiError(409, "ZONE_ALREADY_HAS_NODE", "This zone already has a registered node.");
    const node_id = requestedNodeId ?? `node-${randomUUID()}`;
    if (await repository.getNode(node_id)) throw new ApiError(409, "NODE_ID_IN_USE", `Node '${node_id}' is already registered.`);
    await repository.addNode({ id: node_id, zoneId: zone_id, gatewayId, lastSeenAt: null, batteryMv: 0, lastSequence: 0 });
    sendData(response, {
      node_id,
      zone_id,
      gateway_id: gatewayId,
      node_token: signNodeToken(node_id),
      token_type: "nileguard-node",
      registered: true,
    }, 201);
  });

  router.post("/gateways/:gatewayId/token", ...adminOnly, async (request, response) => {
    const gatewayId = request.params.gatewayId;
    if (typeof gatewayId !== "string" || !(await repository.listNodes()).some((node) => node.gatewayId === gatewayId)) {
      throw new ApiError(404, "GATEWAY_NOT_FOUND", `Gateway '${gatewayId}' has no registered nodes.`);
    }
    sendData(response, {
      gateway_id: gatewayId,
      token: signGatewayToken(gatewayId),
      token_type: "nileguard-gateway",
      expires_in: "30d",
    });
  });

  if (config.nodeEnv !== "production" && config.mockHardware) {
    router.get("/dev/gateway-token", (_request, response) => {
      sendData(response, {
        token: signGatewayToken("gateway-demo"),
        gateway_id: "gateway-demo",
        warning: "Development only. Never expose this endpoint in a deployed environment.",
      });
    });

    router.get("/dev/node-token/:nodeId", async (request, response) => {
      const nodeId = parseNodeParams(request);
      if (!await repository.getNode(nodeId)) throw new ApiError(404, "NODE_NOT_FOUND", `Node '${nodeId}' was not found.`);
      sendData(response, {
        node_id: nodeId,
        token: signNodeToken(nodeId),
        token_type: "nileguard-node",
        warning: "Development only. Never expose this endpoint in a deployed environment.",
      });
    });

    router.post("/mock/simulate-reading", userAuth, async (request, response) => {
      const zoneId = typeof request.body?.zone_id === "string" ? request.body.zone_id : undefined;
      const zoneIds = zoneId ? [zoneId] : (await repository.listZones()).map((zone) => zone.id);
      const readings = await Promise.all(zoneIds.map(async (id) => {
        if (!await repository.getZone(id)) throw new ApiError(404, "ZONE_NOT_FOUND", `Zone '${id}' was not found.`);
        if (!(await repository.getZoneSnapshot(id))?.node) {
          throw new ApiError(409, "NODE_NOT_REGISTERED", `Zone '${id}' does not have a registered mock node.`);
        }
        const reading = await repository.simulateReading(id);
        await repository.recordReading(reading);
        const recommendation = (await evaluateRecommendations(repository, decisionEngine, id))[0];
        await applyAutomaticRecommendation(repository, recommendation);
        return {
          ...reading,
          recommendation,
        };
      }));
      sendData(response, { readings, message: "Mock sensor readings generated and accepted." }, 201);
    });
  }

  return router;
}
