import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import request from "supertest";
import type { Express } from "express";
import { createApp } from "../src/app.js";
import { MemoryRepository } from "../src/repositories/memoryRepository.js";

describe("NileGuard repository-backed API", () => {
  let app: Express;
  let userToken: string;
  let gatewayToken: string;
  let nodeToken: string;

  before(async () => {
    app = await createApp();
    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: "farmer@nileguard.local", password: "NileGuard2026!" });
    assert.equal(login.status, 200);
    userToken = login.body.data.token as string;

    const gateway = await request(app).get("/api/dev/gateway-token");
    assert.equal(gateway.status, 200);
    gatewayToken = gateway.body.data.token as string;

    const node = await request(app).get("/api/dev/node-token/node-lettuce-clay");
    assert.equal(node.status, 200);
    nodeToken = node.body.data.token as string;

    const issuedGateway = await request(app)
      .post("/api/gateways/gateway-demo/token")
      .set("Authorization", `Bearer ${userToken}`);
    assert.equal(issuedGateway.status, 200);
    assert.equal(issuedGateway.body.data.token_type, "nileguard-gateway");
  });

  it("requires a login and returns only safe user fields", async () => {
    const unauthorized = await request(app).get("/api/zones");
    assert.equal(unauthorized.status, 401);

    const profile = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${userToken}`);
    assert.equal(profile.status, 200);
    assert.equal(profile.body.data.email, "farmer@nileguard.local");
    assert.equal(profile.body.data.phoneNumber, "+1-202-555-0101");
    assert.equal("passwordHash" in profile.body.data, false);
  });

  it("returns sample zones, readings, and explainable interim recommendations", async () => {
    const zones = await request(app).get("/api/zones").set("Authorization", `Bearer ${userToken}`);
    assert.equal(zones.status, 200);
    assert.equal(zones.body.data.length, 4);
    assert.equal(zones.body.data[0].reading.node_id, "node-lettuce-clay");

    const readings = await request(app)
      .get("/api/readings?zone_id=zone-lettuce-clay&hours=24")
      .set("Authorization", `Bearer ${userToken}`);
    assert.equal(readings.status, 200);
    assert.equal(readings.body.data.count, 24);
    const latestReading = readings.body.data.readings[0];
    assert.ok(Number.isFinite(latestReading.moisture));
    assert.ok(Number.isFinite(latestReading.temp));
    assert.ok(latestReading.light_lux !== null);
    assert.ok(latestReading.light_ppfd !== null);
    assert.ok(Number.isFinite(latestReading.humidity));
    assert.ok(latestReading.battery_mv > 0);
    assert.ok(latestReading.co2_ppm !== null);
    assert.ok(latestReading.soil_ph !== null);

    const historicalReadings = await request(app)
      .get("/api/readings?zone_id=zone-lettuce-clay&hours=4392&limit=10000")
      .set("Authorization", `Bearer ${userToken}`);
    assert.equal(historicalReadings.status, 200);
    assert.ok(historicalReadings.body.data.count > 0);

    const recommendation = await request(app)
      .get("/api/zones/zone-lettuce-clay/recommendation")
      .set("Authorization", `Bearer ${userToken}`);
    assert.equal(recommendation.status, 200);
    assert.equal(recommendation.body.data.action, "do_not_irrigate");
    assert.match(recommendation.body.data.reason, /30% irrigation threshold/);
  });

  it("keeps manual valve state authoritative through new readings and reevaluation", async () => {
    const override = await request(app)
      .put("/api/zones/zone-lettuce-clay/override")
      .set("Authorization", `Bearer ${userToken}`)
      .send({ valve_state: "off" });
    assert.equal(override.status, 200);
    assert.equal(override.body.data.mode, "manual");

    const ingestion = await request(app)
      .post("/api/readings")
      .set("Authorization", `Bearer ${gatewayToken}`)
      .set("X-Node-Token", nodeToken)
      .send({
        node_id: "node-lettuce-clay",
        zone: "zone-lettuce-clay",
        moisture: 10,
        temp: 27,
        humidity: 80,
        battery_mv: 3900,
        seq: 169,
        gateway_id: "gateway-demo",
      });
    assert.equal(ingestion.status, 201);
    assert.equal(ingestion.body.data.recommendation.action, "irrigate");
    assert.equal(ingestion.body.data.recommendation.effectiveValveState, "off");
    assert.match(ingestion.body.data.recommendation.reason, /manual control takes priority/);

    const repeat = await request(app)
      .post("/api/readings")
      .set("Authorization", `Bearer ${gatewayToken}`)
      .set("X-Node-Token", nodeToken)
      .send({
        node_id: "node-lettuce-clay",
        zone: "zone-lettuce-clay",
        moisture: 10,
        temp: 27,
        humidity: 80,
        battery_mv: 3900,
        seq: 169,
        gateway_id: "gateway-demo",
      });
    assert.equal(repeat.status, 409);
    assert.equal(repeat.body.error.code, "STALE_SEQUENCE");

    const released = await request(app)
      .delete("/api/zones/zone-lettuce-clay/override")
      .set("Authorization", `Bearer ${userToken}`);
    assert.equal(released.status, 200);
    assert.equal(released.body.data.mode, "automatic");
    assert.equal(released.body.data.valve_state, "on");
  });

  it("rejects invalid sensor packets and user tokens on gateway ingestion", async () => {
    const noGatewayAuth = await request(app).post("/api/readings").send({
      node_id: "node-lettuce-clay", zone: "zone-lettuce-clay", moisture: 40, temp: 22,
      humidity: 55, battery_mv: 3900, seq: 26, gateway_id: "gateway-demo",
    });
    assert.equal(noGatewayAuth.status, 401);

    const wrongTokenType = await request(app)
      .post("/api/readings")
      .set("Authorization", `Bearer ${userToken}`)
      .set("X-Node-Token", nodeToken)
      .send({
        node_id: "node-lettuce-clay", zone: "zone-lettuce-clay", moisture: 40, temp: 22,
        humidity: 55, battery_mv: 3900, seq: 26, gateway_id: "gateway-demo",
      });
    assert.equal(wrongTokenType.status, 401);

    const missingNodeToken = await request(app)
      .post("/api/readings")
      .set("Authorization", `Bearer ${gatewayToken}`)
      .send({
        node_id: "node-lettuce-clay", zone: "zone-lettuce-clay", moisture: 40, temp: 22,
        humidity: 55, battery_mv: 3900, seq: 169, gateway_id: "gateway-demo",
      });
    assert.equal(missingNodeToken.status, 401);
    assert.equal(missingNodeToken.body.error.code, "NODE_AUTH_REQUIRED");

    const differentNode = await request(app).get("/api/dev/node-token/node-lettuce-sandy");
    const nodeMismatch = await request(app)
      .post("/api/readings")
      .set("Authorization", `Bearer ${gatewayToken}`)
      .set("X-Node-Token", differentNode.body.data.token)
      .send({
        node_id: "node-lettuce-clay", zone: "zone-lettuce-clay", moisture: 40, temp: 22,
        humidity: 55, battery_mv: 3900, seq: 169, gateway_id: "gateway-demo",
      });
    assert.equal(nodeMismatch.status, 403);
    assert.equal(nodeMismatch.body.error.code, "NODE_MISMATCH");

    const invalid = await request(app)
      .post("/api/readings")
      .set("Authorization", `Bearer ${gatewayToken}`)
      .set("X-Node-Token", nodeToken)
      .send({
        node_id: "node-lettuce-clay", zone: "zone-lettuce-clay", moisture: 120, temp: 22,
        humidity: 55, battery_mv: 3900, seq: 26, gateway_id: "gateway-demo",
      });
    assert.equal(invalid.status, 400);
    assert.equal(invalid.body.error.code, "VALIDATION_ERROR");
  });

  it("simulates mock sensor readings and rejects unknown zones", async () => {
    const simulation = await request(app)
      .post("/api/mock/simulate-reading")
      .set("Authorization", `Bearer ${userToken}`)
      .send({ zone_id: "zone-lettuce-sandy" });
    assert.equal(simulation.status, 201);
    assert.equal(simulation.body.data.readings.length, 1);
    assert.equal(simulation.body.data.readings[0].zone, "zone-lettuce-sandy");

    const unknown = await request(app)
      .post("/api/mock/simulate-reading")
      .set("Authorization", `Bearer ${userToken}`)
      .send({ zone_id: "missing-zone" });
    assert.equal(unknown.status, 404);
  });

  it("provisions an unassigned zone through the gateway contract", async () => {
    const createdZone = await request(app)
      .post("/api/zones")
      .set("Authorization", `Bearer ${userToken}`)
      .send({
        name: "New Tomato Tunnel",
        crop_id: "lettuce",
        soil_type: "clay",
        growth_stage: "vegetative",
        planting_date: "2026-10-01",
        moisture_target_min_percent: 30,
        moisture_target_max_percent: 60,
      });
    assert.equal(createdZone.status, 201);
    assert.equal(createdZone.body.data.node.id, null);

    const zoneId = createdZone.body.data.id as string;
    const registration = await request(app)
      .post("/api/nodes/register")
      .set("Authorization", `Bearer ${gatewayToken}`)
      .send({ zone_id: zoneId });
    assert.equal(registration.status, 201);
    assert.equal(registration.body.data.gateway_id, "gateway-demo");
    assert.ok(registration.body.data.node_token);
    assert.match(registration.body.data.node_id, /^node-/);

    const firstReading = await request(app)
      .post("/api/readings")
      .set("Authorization", `Bearer ${gatewayToken}`)
      .set("X-Node-Token", registration.body.data.node_token)
      .send({
        node_id: registration.body.data.node_id,
        zone: zoneId,
        moisture: 20,
        temp: 24,
        light_lux: 1200,
        light_ppfd: 22.2,
        humidity: 70,
        co2_ppm: 450,
        soil_ph: 6.2,
        battery_mv: 3900,
        seq: 1,
        gateway_id: "gateway-demo",
      });
    assert.equal(firstReading.status, 201);
    assert.equal(firstReading.body.data.recommendation.action, "irrigate");

    const zone = await request(app)
      .get(`/api/zones/${zoneId}`)
      .set("Authorization", `Bearer ${userToken}`);
    assert.equal(zone.status, 200);
    assert.equal(zone.body.data.node.id, registration.body.data.node_id);
    assert.equal(zone.body.data.valve.state, "on");
  });

  it("enforces admin-only user management and prevents invalid crop stages", async () => {
    const createdUser = await request(app)
      .post("/api/users")
      .set("Authorization", `Bearer ${userToken}`)
      .send({
        name: "Field Operator",
        email: "operator@nileguard.local",
        phone_number: "+1-202-555-0110",
        password: "Operator Password 123!",
        role: "operator",
      });
    assert.equal(createdUser.status, 201);
    assert.equal("passwordHash" in createdUser.body.data, false);
    assert.equal(createdUser.body.data.phoneNumber, "+1-202-555-0110");

    const listedUsers = await request(app)
      .get("/api/users")
      .set("Authorization", `Bearer ${userToken}`);
    assert.ok(listedUsers.body.data.some((user: { id: string }) => user.id === createdUser.body.data.id));

    const duplicateUser = await request(app)
      .post("/api/users")
      .set("Authorization", `Bearer ${userToken}`)
      .send({
        name: "Duplicate Operator",
        email: "OPERATOR@nileguard.local",
        phone_number: "+1-202-555-0199",
        password: "Duplicate Password 123!",
        role: "operator",
      });
    assert.equal(duplicateUser.status, 409);
    assert.equal(duplicateUser.body.error.code, "EMAIL_IN_USE");

    const operatorLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: "operator@nileguard.local", password: "Operator Password 123!" });
    const forbidden = await request(app)
      .get("/api/users")
      .set("Authorization", `Bearer ${operatorLogin.body.data.token}`);
    assert.equal(forbidden.status, 403);

    const updatedUser = await request(app)
      .patch("/api/auth/me")
      .set("Authorization", `Bearer ${operatorLogin.body.data.token}`)
      .send({
        name: "Updated Operator",
        email: "operator.updated@nileguard.local",
        phone_number: "+1-202-555-0111",
        password: "Updated Password 456!",
      });
    assert.equal(updatedUser.status, 200);
    assert.equal(updatedUser.body.data.name, "Updated Operator");
    assert.equal(updatedUser.body.data.email, "operator.updated@nileguard.local");
    assert.equal(updatedUser.body.data.phoneNumber, "+1-202-555-0111");
    assert.equal(updatedUser.body.data.role, "operator");

    const roleChange = await request(app)
      .patch("/api/auth/me")
      .set("Authorization", `Bearer ${operatorLogin.body.data.token}`)
      .send({ role: "admin" });
    assert.equal(roleChange.status, 400);

    const oldPasswordLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: "operator.updated@nileguard.local", password: "Operator Password 123!" });
    assert.equal(oldPasswordLogin.status, 401);
    const updatedPasswordLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: "operator.updated@nileguard.local", password: "Updated Password 456!" });
    assert.equal(updatedPasswordLogin.status, 200);

    const noOtherUserEditRoute = await request(app)
      .patch(`/api/users/${createdUser.body.data.id}`)
      .set("Authorization", `Bearer ${userToken}`)
      .send({ name: "Admin changed this name" });
    assert.equal(noOtherUserEditRoute.status, 404);

    const createdAdmin = await request(app)
      .post("/api/users")
      .set("Authorization", `Bearer ${userToken}`)
      .send({
        name: "Second Admin",
        email: "second.admin@nileguard.local",
        phone_number: "+1-202-555-0113",
        password: "Second Admin Password 123!",
        role: "admin",
      });
    assert.equal(createdAdmin.status, 201);
    const secondAdminLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: "second.admin@nileguard.local", password: "Second Admin Password 123!" });
    const updatedAdmin = await request(app)
      .patch("/api/auth/me")
      .set("Authorization", `Bearer ${secondAdminLogin.body.data.token}`)
      .send({ name: "Second Admin Updated", phone_number: "+1-202-555-0114" });
    assert.equal(updatedAdmin.status, 200);
    assert.equal(updatedAdmin.body.data.name, "Second Admin Updated");
    assert.equal(updatedAdmin.body.data.phoneNumber, "+1-202-555-0114");
    assert.equal(updatedAdmin.body.data.role, "admin");

    const deleteCreatedAdmin = await request(app)
      .delete(`/api/users/${createdAdmin.body.data.id}`)
      .set("Authorization", `Bearer ${userToken}`);
    assert.equal(deleteCreatedAdmin.status, 204);

    const deletedUser = await request(app)
      .delete(`/api/users/${createdUser.body.data.id}`)
      .set("Authorization", `Bearer ${userToken}`);
    assert.equal(deletedUser.status, 204);
    const usersAfterDelete = await request(app)
      .get("/api/users")
      .set("Authorization", `Bearer ${userToken}`);
    assert.equal(usersAfterDelete.body.data.some((user: { id: string }) => user.id === createdUser.body.data.id), false);
    const deletedLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: "operator.updated@nileguard.local", password: "Updated Password 456!" });
    assert.equal(deletedLogin.status, 401);

    const reusedEmailUser = await request(app)
      .post("/api/users")
      .set("Authorization", `Bearer ${userToken}`)
      .send({
        name: "Recreated Operator",
        email: "operator.updated@nileguard.local",
        phone_number: "+1-202-555-0112",
        password: "Recreated Password 123!",
        role: "operator",
      });
    assert.equal(reusedEmailUser.status, 201);
    assert.notEqual(reusedEmailUser.body.data.id, createdUser.body.data.id);
    const cleanup = await request(app)
      .delete(`/api/users/${reusedEmailUser.body.data.id}`)
      .set("Authorization", `Bearer ${userToken}`);
    assert.equal(cleanup.status, 204);

    const invalidStage = await request(app)
      .patch("/api/zones/zone-lettuce-clay")
      .set("Authorization", `Bearer ${userToken}`)
      .send({ growth_stage: "tuber-initiation" });
    assert.equal(invalidStage.status, 400);
    assert.equal(invalidStage.body.error.code, "INVALID_GROWTH_STAGE");
  });

  it("holds automatic irrigation when sensor data is stale", async () => {
    const repository = new MemoryRepository();
    repository.updateNode("node-lettuce-clay", { lastSeenAt: new Date(Date.now() - 6 * 60_000).toISOString() });
    const staleApp = await createApp(repository);
    const staleLogin = await request(staleApp)
      .post("/api/auth/login")
      .send({ email: "farmer@nileguard.local", password: "NileGuard2026!" });
    const recommendation = await request(staleApp)
      .get("/api/zones/zone-lettuce-clay/recommendation")
      .set("Authorization", `Bearer ${staleLogin.body.data.token}`);
    assert.equal(recommendation.status, 200);
    assert.equal(recommendation.body.data.action, "hold");
    assert.match(recommendation.body.data.reason, /older than five minutes/);
    assert.equal(repository.getValve("zone-lettuce-clay")?.state, "off");
  });
});
