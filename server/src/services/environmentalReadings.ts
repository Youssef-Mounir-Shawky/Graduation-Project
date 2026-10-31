import { config } from "../config.js";
import type {
  ComparisonStatus,
  EnvironmentalComparison,
  EnvironmentalObservation,
  EnvironmentalParameter,
  NileGuardRepository,
  Reading,
} from "../domain/types.js";
import type { OpenMeteoWeather } from "./weatherService.js";

const parameterUnits: Record<EnvironmentalParameter, string> = {
  soil_moisture: "%",
  air_temperature: "°C",
  relative_humidity: "%",
  shortwave_radiation: "W/m²",
};

const comparisonTolerances: Partial<Record<EnvironmentalParameter, number>> = {
  air_temperature: config.temperatureCompareToleranceC,
  relative_humidity: config.humidityCompareTolerancePercent,
};

const parameterRanges: Record<EnvironmentalParameter, readonly [number, number]> = {
  soil_moisture: [0, 100],
  air_temperature: [-50, 80],
  relative_humidity: [0, 100],
  shortwave_radiation: [0, 2000],
};

function isValidValue(parameter: EnvironmentalParameter, value: number | null): boolean {
  if (value === null || !Number.isFinite(value)) return false;
  const [minimum, maximum] = parameterRanges[parameter];
  return value >= minimum && value <= maximum;
}

function sourceForReading(reading: Reading): "hardware" | "synthetic" {
  return reading.data_source === "gateway" ? "hardware" : "synthetic";
}

export async function persistHardwareObservations(
  repository: NileGuardRepository,
  reading: Reading,
): Promise<void> {
  const source = sourceForReading(reading);
  const values: Array<[EnvironmentalParameter, number | null]> = [
    ["soil_moisture", reading.moisture],
    ["air_temperature", reading.temp],
    ["relative_humidity", reading.humidity],
    ["shortwave_radiation", reading.shortwave_radiation_w_m2],
  ];

  for (const [parameter, value] of values) {
    await repository.recordEnvironmentalObservation({
      zoneId: reading.zone,
      parameter,
      value,
      unit: parameterUnits[parameter],
      source,
      measuredAt: reading.timestamp,
      receivedAt: reading.received_at,
      isValid: isValidValue(parameter, value),
      isStale: false,
      locationId: null,
    });
  }
  await refreshEnvironmentalComparisons(repository, reading.zone);
}

export async function persistWeatherObservations(
  repository: NileGuardRepository,
  zoneId: string,
  weather: OpenMeteoWeather,
): Promise<void> {
  const providerTime = weather.current.time;
  const currentTime = typeof providerTime === "string"
    ? localWeatherTimestampToUtc(providerTime, weather.location.timezone) ?? weather.retrieved_at
    : weather.retrieved_at;
  const weatherFields: Array<[EnvironmentalParameter, string]> = [
    ["air_temperature", "temperature_2m"],
    ["relative_humidity", "relative_humidity_2m"],
    ["shortwave_radiation", "shortwave_radiation"],
  ];

  for (const [parameter, field] of weatherFields) {
    const rawValue = weather.current[field];
    const value = typeof rawValue === "number" && Number.isFinite(rawValue) ? rawValue : null;
    await repository.recordEnvironmentalObservation({
      zoneId,
      parameter,
      value,
      unit: weather.units.current[field] ?? parameterUnits[parameter],
      source: "open-meteo",
      measuredAt: currentTime,
      receivedAt: weather.retrieved_at,
      isValid: isValidValue(parameter, value),
      isStale: Boolean(weather.stale),
      locationId: weather.location.id,
    });
  }
  await refreshEnvironmentalComparisons(repository, zoneId);
}

function localWeatherTimestampToUtc(value: string, timeZone?: string): string | undefined {
  if (!timeZone) return undefined;
  const localAsUtc = Date.parse(`${value}:00Z`);
  if (!Number.isFinite(localAsUtc)) return undefined;
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(localAsUtc));
    const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value;
    const displayedAsUtc = Date.UTC(
      Number(part("year")),
      Number(part("month")) - 1,
      Number(part("day")),
      Number(part("hour")),
      Number(part("minute")),
      Number(part("second")),
    );
    return new Date(localAsUtc - (displayedAsUtc - localAsUtc)).toISOString();
  } catch {
    return undefined;
  }
}

function normalizeValue(observation: EnvironmentalObservation): number | undefined {
  if (!observation.isValid || observation.value === null || !Number.isFinite(observation.value)) return undefined;
  if (observation.unit === parameterUnits[observation.parameter]) return observation.value;
  if (observation.parameter === "air_temperature" && observation.unit === "°F") {
    return (observation.value - 32) * 5 / 9;
  }
  if (observation.parameter === "shortwave_radiation" && observation.unit === "kW/m²") {
    return observation.value * 1000;
  }
  return undefined;
}

function isFresh(observation: EnvironmentalObservation, now: number): boolean {
  if (observation.isStale) return false;
  const maxAge = observation.source === "open-meteo"
    ? config.weatherReadingFreshMs
    : config.hardwareReadingFreshMs;
  const age = now - Date.parse(observation.measuredAt);
  return Number.isFinite(age) && age >= -5 * 60_000 && age <= maxAge;
}

function latestHardwareOrSynthetic(
  observations: EnvironmentalObservation[],
  parameter: EnvironmentalParameter,
): EnvironmentalObservation | undefined {
  return observations.find((item) => item.parameter === parameter && item.source === "hardware")
    ?? (config.mockHardware
      ? observations.find((item) => item.parameter === parameter && item.source === "synthetic")
      : undefined);
}

function comparisonStatus(
  parameter: EnvironmentalParameter,
  hardware: EnvironmentalObservation | undefined,
  weather: EnvironmentalObservation | undefined,
  now: number,
): Pick<EnvironmentalComparison, "status" | "difference" | "tolerance" | "selectedObservationId" | "selectedSource"> {
  const tolerance = comparisonTolerances[parameter] ?? null;
  if (parameter === "soil_moisture") {
    const hardwareValue = hardware ? normalizeValue(hardware) : undefined;
    const selected = hardware && hardwareValue !== undefined && isFresh(hardware, now) ? hardware : undefined;
    return {
      status: hardware && hardware.value !== null && hardwareValue === undefined
        ? "INVALID_READING"
        : selected
          ? "WEATHER_MISSING"
          : hardware
            ? hardware.value === null
              ? "HARDWARE_MISSING"
              : "STALE_READING"
            : "HARDWARE_MISSING",
      difference: null,
      tolerance: null,
      selectedObservationId: selected?.id ?? null,
      selectedSource: selected?.source ?? null,
    };
  }

  const hardwareValue = hardware ? normalizeValue(hardware) : undefined;
  const weatherValue = weather ? normalizeValue(weather) : undefined;
  const hardwareFresh = Boolean(hardware && hardwareValue !== undefined && isFresh(hardware, now));
  const weatherFresh = Boolean(weather && weatherValue !== undefined && isFresh(weather, now));
  const delta = hardwareValue !== undefined && weatherValue !== undefined
    ? Math.abs(hardwareValue - weatherValue)
    : null;
  const maxComparisonSkewMs = Math.min(config.hardwareReadingFreshMs, config.weatherReadingFreshMs);
  const timesFarApart = hardware && weather
    && Math.abs(Date.parse(hardware.measuredAt) - Date.parse(weather.measuredAt)) > maxComparisonSkewMs;
  let status: ComparisonStatus;
  let selected: EnvironmentalObservation | undefined;

  if ((hardware && hardware.value !== null && hardwareValue === undefined)
    || (weather && weather.value !== null && weatherValue === undefined)) {
    status = "INVALID_READING";
    selected = hardwareFresh ? hardware : weatherFresh ? weather : undefined;
  } else if (hardwareFresh && weatherFresh && timesFarApart) {
    status = "STALE_READING";
    selected = hardwareFresh ? hardware : weatherFresh ? weather : undefined;
  } else if ((hardware && hardware.value !== null && !hardwareFresh)
    || (weather && weather.value !== null && !weatherFresh)) {
    status = "STALE_READING";
    selected = hardwareFresh ? hardware : weatherFresh ? weather : undefined;
  } else if (hardwareFresh && weatherFresh) {
    status = delta !== null && tolerance !== null && delta <= tolerance ? "CONSISTENT" : "CONFLICT";
    selected = hardware;
  } else if (hardwareFresh) {
    status = "WEATHER_MISSING";
    selected = hardware;
  } else if (weatherFresh) {
    status = "HARDWARE_MISSING";
    selected = weather;
  } else {
    const hardwareHasValue = hardware?.value !== null && hardware !== undefined;
    const weatherHasValue = weather?.value !== null && weather !== undefined;
    status = hardwareHasValue || weatherHasValue
      ? "STALE_READING"
      : hardware ? "WEATHER_MISSING" : "HARDWARE_MISSING";
  }

  return {
    status,
    difference: delta,
    tolerance,
    selectedObservationId: selected?.id ?? null,
    selectedSource: selected?.source ?? null,
  };
}

export async function refreshEnvironmentalComparisons(
  repository: NileGuardRepository,
  zoneId: string,
): Promise<void> {
  const now = Date.now();
  const parameters: EnvironmentalParameter[] = [
    "air_temperature",
    "relative_humidity",
  ];

  for (const parameter of parameters) {
    const observations = await repository.listEnvironmentalObservations(zoneId, 100);
    const hardware = latestHardwareOrSynthetic(observations, parameter);
    const weather = observations.find((item) =>
      item.parameter === parameter && item.source === "open-meteo");
    const result = comparisonStatus(parameter, hardware, weather, now);
    await repository.recordEnvironmentalComparison({
      zoneId,
      parameter,
      hardwareObservationId: hardware?.id ?? null,
      weatherObservationId: weather?.id ?? null,
      ...result,
      comparedAt: new Date(now).toISOString(),
    });
  }
}

export async function getSelectedEnvironmentalInputs(
  repository: NileGuardRepository,
  zoneId: string,
): Promise<{
  moisture: EnvironmentalObservation | undefined;
  temperature: EnvironmentalObservation | undefined;
  humidity: EnvironmentalObservation | undefined;
  radiation: EnvironmentalObservation | undefined;
}> {
  const observations = await repository.listEnvironmentalObservations(zoneId, 100);
  const now = Date.now();
  const getSelected = async (parameter: EnvironmentalParameter) => {
    const latestComparison = (await repository.listEnvironmentalComparisons(zoneId, 100))
      .find((item) => item.parameter === parameter);
    if (latestComparison?.selectedObservationId) {
      const selected = observations.find((item) => item.id === latestComparison.selectedObservationId);
      if (selected && isFresh(selected, now) && normalizeValue(selected) !== undefined) return selected;
    }

    const hardware = latestHardwareOrSynthetic(observations, parameter);
    const weather = observations.find((item) =>
      item.parameter === parameter && item.source === "open-meteo");
    if (hardware && hardware.isValid && isFresh(hardware, now) && normalizeValue(hardware) !== undefined) {
      return hardware;
    }
    if (weather && weather.isValid && isFresh(weather, now) && normalizeValue(weather) !== undefined) {
      return weather;
    }
    return undefined;
  };

  const [moisture, temperature, humidity, radiation] = await Promise.all([
    getSelected("soil_moisture"),
    getSelected("air_temperature"),
    getSelected("relative_humidity"),
    getSelected("shortwave_radiation"),
  ]);
  return {
    moisture,
    temperature,
    humidity,
    radiation,
  };
}

export function selectedValue(observation: EnvironmentalObservation | undefined): number | null {
  if (!observation) return null;
  return normalizeValue(observation) ?? null;
}
