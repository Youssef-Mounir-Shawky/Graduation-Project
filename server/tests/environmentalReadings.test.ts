import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MemoryRepository } from "../src/repositories/memoryRepository.js";
import type { Reading } from "../src/domain/types.js";
import { ThresholdDecisionEngine } from "../src/services/decisionEngine.js";
import {
  getSelectedEnvironmentalInputs,
  persistHardwareObservations,
  persistWeatherObservations,
  selectedValue,
} from "../src/services/environmentalReadings.js";
import type { OpenMeteoWeather } from "../src/services/weatherService.js";

function weatherReading(overrides: Record<string, number | string | null> = {}): OpenMeteoWeather {
  const retrievedAt = new Date().toISOString();
  return {
    source: "open-meteo",
    attribution: "Weather data by Open-Meteo.com",
    retrieved_at: retrievedAt,
    location: { id: "nasr-city", name: "Nasr City", latitude: 30.05, longitude: 31.24, timezone: "UTC" },
    units: {
      current: { temperature_2m: "°C", relative_humidity_2m: "%", shortwave_radiation: "W/m²" },
      hourly: {},
      daily: {},
    },
    current: {
      time: retrievedAt.slice(0, 16),
      temperature_2m: 25,
      relative_humidity_2m: 65,
      shortwave_radiation: 400,
      ...overrides,
    },
    hourly: {},
    daily: {},
  };
}

async function recordHardware(
  repository: MemoryRepository,
  changes: Partial<Reading> = {},
): Promise<Reading> {
  const previous = repository.simulateReading("zone-tomato-loam");
  const reading = { ...previous, data_source: "gateway" as const, ...changes };
  repository.recordReading(reading);
  await persistHardwareObservations(repository, reading);
  return reading;
}

describe("environmental source comparison", () => {
  it("normalizes canonical units, records comparisons, and prefers fresh hardware on conflict", async () => {
    const repository = new MemoryRepository();
    await recordHardware(repository, {
      temp: 32,
      humidity: 58,
      shortwave_radiation_w_m2: 650,
    });
    await persistWeatherObservations(repository, "zone-tomato-loam", weatherReading({
      temperature_2m: 25,
      relative_humidity_2m: 65,
      shortwave_radiation: 400,
    }));

    const comparisons = await repository.listEnvironmentalComparisons("zone-tomato-loam", 10);
    const latestComparison = (parameter: string) => comparisons.find((comparison) => comparison.parameter === parameter);
    assert.equal(latestComparison("air_temperature")?.status, "CONFLICT");
    assert.equal(latestComparison("relative_humidity")?.status, "CONSISTENT");
    assert.deepEqual(new Set(comparisons.map((comparison) => comparison.parameter)), new Set([
      "air_temperature",
      "relative_humidity",
    ]));
    assert.equal(latestComparison("air_temperature")?.selectedSource, "hardware");

    const selected = await getSelectedEnvironmentalInputs(repository, "zone-tomato-loam");
    assert.equal(selected.temperature?.source, "hardware");
    assert.equal(selected.radiation?.source, "hardware");
    assert.equal(selected.moisture?.source, "hardware");
    const snapshot = await repository.getZoneSnapshot("zone-tomato-loam");
    assert.ok(snapshot);
    const recommendation = await new ThresholdDecisionEngine().evaluate(repository, snapshot);
    assert.equal(recommendation.inputs.moistureSource, "hardware");
    assert.equal(recommendation.inputs.temperatureSource, "hardware");
    assert.equal(recommendation.inputs.humiditySource, "hardware");
    assert.equal(recommendation.inputs.shortwaveRadiationSource, "hardware");
  });

  it("normalizes supported equivalent units before comparing observations", async () => {
    const repository = new MemoryRepository();
    const measuredAt = new Date().toISOString();
    const observations = [
      { parameter: "air_temperature" as const, value: 77, unit: "°F" },
      { parameter: "relative_humidity" as const, value: 65, unit: "%" },
      { parameter: "shortwave_radiation" as const, value: 0.4, unit: "kW/m²" },
    ];
    for (const observation of observations) {
      await repository.recordEnvironmentalObservation({
        zoneId: "zone-tomato-loam",
        ...observation,
        source: "hardware",
        measuredAt,
        receivedAt: measuredAt,
        isValid: true,
        isStale: false,
        locationId: null,
      });
    }
    await persistWeatherObservations(repository, "zone-tomato-loam", weatherReading());

    const comparisons = await repository.listEnvironmentalComparisons("zone-tomato-loam", 10);
    for (const parameter of ["air_temperature", "relative_humidity"]) {
      assert.equal(comparisons.find((comparison) => comparison.parameter === parameter)?.status, "CONSISTENT");
    }
    const selected = await getSelectedEnvironmentalInputs(repository, "zone-tomato-loam");
    assert.equal(selected.temperature?.unit, "°F");
    assert.equal(selectedValue(selected.temperature), 25);
    assert.equal(selectedValue(selected.radiation), 400);
  });

  it("falls back to weather for missing hardware and never invents soil moisture or radiation", async () => {
    const repository = new MemoryRepository();
    await recordHardware(repository, {
      moisture: null,
      temp: null,
      humidity: null,
      shortwave_radiation_w_m2: null,
    });
    await persistWeatherObservations(repository, "zone-tomato-loam", weatherReading({
      temperature_2m: 25,
      relative_humidity_2m: 65,
      shortwave_radiation: null,
    }));

    const selected = await getSelectedEnvironmentalInputs(repository, "zone-tomato-loam");
    assert.equal(selected.moisture, undefined);
    assert.equal(selected.temperature?.source, "open-meteo");
    assert.equal(selected.humidity?.source, "open-meteo");
    assert.equal(selected.radiation, undefined);

    const snapshot = await repository.getZoneSnapshot("zone-tomato-loam");
    assert.ok(snapshot);
    const recommendation = await new ThresholdDecisionEngine().evaluate(repository, snapshot);
    assert.equal(recommendation.status, "SENSOR_ERROR");
    assert.equal(recommendation.action, "hold");
    assert.equal(recommendation.recommendedValveState, null);
    assert.equal(recommendation.inputs.shortwaveRadiationWm2, null);
    assert.equal(recommendation.inputs.temperatureSource, "open-meteo");
    assert.equal(recommendation.inputs.humiditySource, "open-meteo");
    assert.equal(recommendation.inputs.moistureSource, null);
  });

  it("uses weather as atmospheric fallback for stale hardware while moisture remains unavailable", async () => {
    const repository = new MemoryRepository();
    const oldTimestamp = new Date(Date.now() - 10 * 60_000).toISOString();
    await recordHardware(repository, {
      timestamp: oldTimestamp,
      received_at: new Date().toISOString(),
      temp: 12,
      humidity: 30,
      shortwave_radiation_w_m2: 100,
      moisture: 41,
    });
    await persistWeatherObservations(repository, "zone-tomato-loam", weatherReading());

    const comparisons = await repository.listEnvironmentalComparisons("zone-tomato-loam", 10);
    const temperature = comparisons.find((comparison) => comparison.parameter === "air_temperature");
    assert.equal(temperature?.status, "STALE_READING");
    assert.equal(temperature?.selectedSource, "open-meteo");
    const selected = await getSelectedEnvironmentalInputs(repository, "zone-tomato-loam");
    assert.equal(selected.temperature?.source, "open-meteo");
    assert.equal(selected.moisture, undefined);
  });

  it("uses fresh weather when hardware is invalid while preserving the invalid measurement", async () => {
    const repository = new MemoryRepository();
    await recordHardware(repository, { temp: 100 });
    await persistWeatherObservations(repository, "zone-tomato-loam", weatherReading());

    const comparisons = await repository.listEnvironmentalComparisons("zone-tomato-loam", 10);
    const temperature = comparisons.find((comparison) => comparison.parameter === "air_temperature");
    assert.equal(temperature?.status, "INVALID_READING");
    assert.equal(temperature?.selectedSource, "open-meteo");
    const observations = await repository.listEnvironmentalObservations("zone-tomato-loam", 20);
    assert.ok(observations.some((observation) =>
      observation.parameter === "air_temperature" && observation.source === "hardware"
        && observation.value === 100 && !observation.isValid));
    const selected = await getSelectedEnvironmentalInputs(repository, "zone-tomato-loam");
    assert.equal(selected.temperature?.source, "open-meteo");
  });

  it("falls back to fresh hardware when Open-Meteo marks current weather stale", async () => {
    const repository = new MemoryRepository();
    await recordHardware(repository, { temp: 24, humidity: 52 });
    await persistWeatherObservations(repository, "zone-tomato-loam", {
      ...weatherReading(),
      stale: true,
    });

    const comparisons = await repository.listEnvironmentalComparisons("zone-tomato-loam", 10);
    const latestComparison = (parameter: string) => comparisons.find((comparison) => comparison.parameter === parameter);
    for (const parameter of ["air_temperature", "relative_humidity"]) {
      assert.equal(latestComparison(parameter)?.status, "STALE_READING");
      assert.equal(latestComparison(parameter)?.selectedSource, "hardware");
    }
    const selected = await getSelectedEnvironmentalInputs(repository, "zone-tomato-loam");
    assert.equal(selected.temperature?.source, "hardware");
    assert.equal(selected.humidity?.source, "hardware");
    const observations = await repository.listEnvironmentalObservations("zone-tomato-loam", 20);
    assert.ok(observations.some((observation) => observation.source === "open-meteo" && observation.isStale));
  });
});
