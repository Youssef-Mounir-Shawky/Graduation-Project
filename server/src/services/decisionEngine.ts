import type { NileGuardRepository, Recommendation, ZoneSnapshot } from "../domain/types.js";
import { config } from "../config.js";
import { getSelectedEnvironmentalInputs, selectedValue } from "./environmentalReadings.js";
import { isNodeOnline } from "./telemetry.js";

export interface DecisionEngine {
  evaluate(repository: NileGuardRepository, snapshot: ZoneSnapshot): Promise<Recommendation>;
}

function calculateVaporPressureDeficit(temperature: number | null, humidity: number | null): number | null {
  if (temperature === null || humidity === null) return null;
  const saturationPressure = 0.6108 * Math.exp((17.27 * temperature) / (temperature + 237.3));
  return Number((saturationPressure * (1 - humidity / 100)).toFixed(3));
}

function sourceName(source: string | null): string {
  if (source === "open-meteo") return "Open-Meteo";
  if (source === "synthetic") return "simulated hardware";
  return source ?? "unavailable";
}

export class ThresholdDecisionEngine implements DecisionEngine {
  async evaluate(repository: NileGuardRepository, snapshot: ZoneSnapshot): Promise<Recommendation> {
    const evaluatedAt = new Date().toISOString();
    const valve = await repository.getValve(snapshot.zone.id);
    const context = await getSelectedEnvironmentalInputs(repository, snapshot.zone.id);
    const moisture = selectedValue(context.moisture);
    const temperature = selectedValue(context.temperature);
    const humidity = selectedValue(context.humidity);
    const shortwaveRadiation = selectedValue(context.radiation);
    const vaporPressureDeficit = calculateVaporPressureDeficit(temperature, humidity);
    const observations = await repository.listEnvironmentalObservations(snapshot.zone.id, 100);
    const latestMoistureObservation = observations.find((item) =>
      item.parameter === "soil_moisture" && item.source === "hardware")
      ?? (config.mockHardware
        ? observations.find((item) => item.parameter === "soil_moisture" && item.source === "synthetic")
        : undefined);
    const sensorInvalid = Boolean(latestMoistureObservation && !latestMoistureObservation.isValid);
    const nodeAvailable = isNodeOnline(snapshot.node);
    const noMoisture = moisture === null;
    const holdReason = !snapshot.node
      ? "No field node is registered to this zone."
      : !nodeAvailable
        ? "The node is offline or its latest sensor report is stale."
        : sensorInvalid
          ? "The soil-moisture sensor reading is invalid."
          : "No fresh, valid soil-moisture reading is available.";
    const status = noMoisture
      ? sensorInvalid ? "SENSOR_ERROR" : "INSUFFICIENT_DATA"
      : "READY";
    const recommendationStatus = (status === "READY" || status === "INSUFFICIENT_DATA" || status === "SENSOR_ERROR")
      ? status
      : "INSUFFICIENT_DATA";
    const dataContext = [
      temperature === null ? null : `air temperature ${temperature.toFixed(1)} °C from ${sourceName(context.temperature?.source ?? null)}`,
      humidity === null ? null : `relative humidity ${humidity.toFixed(1)}% from ${sourceName(context.humidity?.source ?? null)}`,
      vaporPressureDeficit === null ? null : `vapor-pressure deficit ${vaporPressureDeficit.toFixed(3)} kPa`,
      shortwaveRadiation === null
        ? null
        : `shortwave radiation ${shortwaveRadiation.toFixed(1)} W/m² from ${sourceName(context.radiation?.source ?? null)}`,
    ].filter((entry): entry is string => entry !== null);
    const contextReason = dataContext.length
      ? ` Environmental demand context: ${dataContext.join("; ")}.`
      : " Temperature, humidity, and shortwave-radiation readings are unavailable.";
    const agronomicContext = `${snapshot.crop.name}, ${snapshot.zone.soilType} soil, ${snapshot.zone.growthStage} stage`;
    const inputs: Recommendation["inputs"] = {
      moisturePercent: moisture,
      moistureSource: context.moisture?.source ?? null,
      temperatureCelsius: temperature,
      temperatureSource: context.temperature?.source ?? null,
      humidityPercent: humidity,
      humiditySource: context.humidity?.source ?? null,
      shortwaveRadiationWm2: shortwaveRadiation,
      shortwaveRadiationSource: context.radiation?.source ?? null,
      vaporPressureDeficitKpa: vaporPressureDeficit,
      moistureThresholdPercent: snapshot.crop.moistureThresholdPercent,
      growthStage: snapshot.zone.growthStage,
      soilType: snapshot.zone.soilType,
    };

    if (noMoisture || !nodeAvailable) {
      return {
        zoneId: snapshot.zone.id,
        action: "hold",
        status: noMoisture ? recommendationStatus : "INSUFFICIENT_DATA",
        recommendedValveState: null,
        effectiveValveState: valve?.state ?? "off",
        mode: valve?.mode ?? "automatic",
        reason: `${holdReason} Automatic irrigation is held; weather variables cannot replace soil moisture or independently trigger watering.${contextReason}`,
        evaluatedAt,
        model: "soil-moisture-v2",
        inputs,
      };
    }

    const needsWater = moisture < snapshot.crop.moistureThresholdPercent;
    const action = needsWater ? "irrigate" : "do_not_irrigate";
    const recommendedValveState = needsWater ? "on" : "off";
    const thresholdReason = needsWater
      ? `${agronomicContext}: soil moisture is ${moisture}%, below the configured ${snapshot.crop.moistureThresholdPercent}% trigger.`
      : `${agronomicContext}: soil moisture is ${moisture}%, at or above the configured ${snapshot.crop.moistureThresholdPercent}% trigger.`;
    const priorityReason = valve?.mode === "manual"
      ? `${thresholdReason} The valve remains ${valve.state} because manual control takes priority.`
      : thresholdReason;

    return {
      zoneId: snapshot.zone.id,
      action,
      status: "READY",
      recommendedValveState,
      effectiveValveState: valve?.mode === "manual" ? valve.state : recommendedValveState,
      mode: valve?.mode ?? "automatic",
      reason: `${priorityReason}${contextReason} Environmental variables contextualize atmospheric demand but cannot override the configured soil-moisture safety trigger.`,
      evaluatedAt,
      model: "soil-moisture-v2",
      inputs,
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
