import type { NileGuardRepository, Recommendation, ZoneSnapshot } from "../domain/types.js";
import { isNodeOnline, isReadingFresh } from "./telemetry.js";

export interface DecisionEngine {
  evaluate(repository: NileGuardRepository, snapshot: ZoneSnapshot): Promise<Recommendation>;
}

export class ThresholdDecisionEngine implements DecisionEngine {
  async evaluate(repository: NileGuardRepository, snapshot: ZoneSnapshot): Promise<Recommendation> {
    const reading = snapshot.latestReading;
    const evaluatedAt = new Date().toISOString();

    if (!reading || !isNodeOnline(snapshot.node) || !isReadingFresh(reading)) {
      const valve = await repository.getValve(snapshot.zone.id);
      return {
        zoneId: snapshot.zone.id,
        action: "hold",
        recommendedValveState: null,
        effectiveValveState: valve?.state ?? "off",
        mode: valve?.mode ?? "automatic",
        reason: !snapshot.node
          ? "No field node is registered to this zone. Irrigation decisions are on hold until a node is provisioned."
          : !reading
            ? "No sensor reading is available. Irrigation decisions are on hold until this zone reports valid data."
            : "The node is offline or the latest sensor measurement is older than five minutes. Irrigation decisions are on hold until fresh data arrives.",
        evaluatedAt,
        model: "threshold-v1",
        inputs: {
          moisturePercent: null,
          temperatureCelsius: null,
          humidityPercent: null,
          moistureThresholdPercent: snapshot.crop.moistureThresholdPercent,
          growthStage: snapshot.zone.growthStage,
          soilType: snapshot.zone.soilType,
        },
      };
    }

    const needsWater = reading.moisture < snapshot.crop.moistureThresholdPercent;
    const action = needsWater ? "irrigate" : "do_not_irrigate";
    const recommendedValveState = needsWater ? "on" : "off";
    const valve = await repository.getValve(snapshot.zone.id);
    const effectiveValve = valve?.mode === "manual"
      ? valve.state
      : recommendedValveState;
    const thresholdReason = needsWater
      ? `${snapshot.crop.name} soil moisture is ${reading.moisture}%, below the interim ${snapshot.crop.moistureThresholdPercent}% irrigation threshold.`
      : `${snapshot.crop.name} soil moisture is ${reading.moisture}%, at or above the interim ${snapshot.crop.moistureThresholdPercent}% irrigation threshold.`;
    const reason = valve?.mode === "manual"
      ? `${thresholdReason} The valve remains ${valve.state} because manual control takes priority.`
      : thresholdReason;

    return {
      zoneId: snapshot.zone.id,
      action,
      recommendedValveState,
      effectiveValveState: effectiveValve,
      mode: valve?.mode ?? "automatic",
      reason,
      evaluatedAt,
      model: "threshold-v1",
      inputs: {
        moisturePercent: reading.moisture,
        temperatureCelsius: reading.temp,
        humidityPercent: reading.humidity,
        moistureThresholdPercent: snapshot.crop.moistureThresholdPercent,
        growthStage: snapshot.zone.growthStage,
        soilType: snapshot.zone.soilType,
      },
    };
  }
}

export async function evaluateRecommendations(
  repository: NileGuardRepository,
  engine: DecisionEngine,
  zoneId?: string,
): Promise<Recommendation[]> {
  let snapshots: ZoneSnapshot[];
  if (zoneId) {
    const snapshot = await repository.getZoneSnapshot(zoneId);
    snapshots = snapshot ? [snapshot] : [];
  } else {
    snapshots = await repository.listZoneSnapshots();
  }
  return Promise.all(snapshots.map((snapshot) => engine.evaluate(repository, snapshot)));
}

export async function applyAutomaticRecommendation(repository: NileGuardRepository, recommendation: Recommendation): Promise<void> {
  if (recommendation.mode === "automatic" && recommendation.recommendedValveState !== null) {
    await repository.setAutomaticValve(recommendation.zoneId, recommendation.recommendedValveState);
  }
}
