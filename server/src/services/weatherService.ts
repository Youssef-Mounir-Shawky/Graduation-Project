import { config } from "../config.js";

const weatherVariables = {
  current: [
    "temperature_2m",
    "relative_humidity_2m",
    "apparent_temperature",
    "is_day",
    "precipitation",
    "rain",
    "showers",
    "snowfall",
    "weather_code",
    "cloud_cover",
    "pressure_msl",
    "surface_pressure",
    "wind_speed_10m",
    "wind_direction_10m",
    "wind_gusts_10m",
  ],
  hourly: [
    "temperature_2m",
    "relative_humidity_2m",
    "dew_point_2m",
    "apparent_temperature",
    "precipitation_probability",
    "precipitation",
    "rain",
    "showers",
    "snowfall",
    "weather_code",
    "cloud_cover",
    "visibility",
    "wind_speed_10m",
    "wind_direction_10m",
    "wind_gusts_10m",
  ],
  daily: [
    "weather_code",
    "temperature_2m_max",
    "temperature_2m_min",
    "apparent_temperature_max",
    "apparent_temperature_min",
    "sunrise",
    "sunset",
    "daylight_duration",
    "sunshine_duration",
    "uv_index_max",
    "precipitation_sum",
    "rain_sum",
    "showers_sum",
    "snowfall_sum",
    "precipitation_hours",
    "precipitation_probability_max",
    "wind_speed_10m_max",
    "wind_gusts_10m_max",
    "wind_direction_10m_dominant",
  ],
} as const;

const presets = [
  { id: "nasr-city", name: "Nasr City", geocodingQuery: "Madīnat Naṣr", expectedName: "madinat nasr" },
  { id: "new-cairo", name: "New Cairo", geocodingQuery: "New Cairo", expectedName: "new cairo" },
  { id: "masr-el-gedida", name: "Masr El Gedida (Heliopolis)", geocodingQuery: "Heliopolis", expectedName: "heliopolis" },
] as const;

const weatherCacheTtlMs = config.weatherCacheTtlMs;
const geocodingCacheTtlMs = 24 * 60 * 60 * 1000;
const maximumCacheEntries = 200;

export interface WeatherLocation {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  timezone?: string;
  elevation?: number | null;
}

export interface WeatherService {
  listLocations(): Promise<Array<WeatherLocation & { preset: boolean }>>;
  getWeather(locationId?: string, latitude?: number, longitude?: number): Promise<OpenMeteoWeather>;
}

export interface OpenMeteoWeather {
  source: "open-meteo";
  attribution: "Weather data by Open-Meteo.com";
  retrieved_at: string;
  location: WeatherLocation;
  units: {
    current: Record<string, string>;
    hourly: Record<string, string>;
    daily: Record<string, string>;
  };
  current: Record<string, string | number | boolean | null>;
  hourly: Record<string, Array<string | number | null>>;
  daily: Record<string, Array<string | number | null>>;
}

export class WeatherServiceError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly retryAfterSeconds?: number,
  ) {
    super(message);
  }
}

type JsonRecord = Record<string, unknown>;

interface GeocodingResult {
  name: string;
  latitude: number;
  longitude: number;
  elevation?: number;
  country_code: string;
  admin1?: string;
  timezone?: string;
}

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizePlaceName(value: string): string {
  return value.normalize("NFKD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
}

function cacheGet<T>(cache: Map<string, { expiresAt: number; value: T }>, key: string): T | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return undefined;
  }
  return entry.value;
}

function cacheSet<T>(
  cache: Map<string, { expiresAt: number; value: T }>,
  key: string,
  value: T,
  ttlMs: number,
): void {
  if (cache.size >= maximumCacheEntries) {
    const oldestKey = cache.keys().next().value as string | undefined;
    if (oldestKey) cache.delete(oldestKey);
  }
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

function readRetryAfter(response: Response): number | undefined {
  const value = response.headers.get("retry-after");
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, Math.ceil(seconds));
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, Math.ceil((date - Date.now()) / 1000));
}

function asProviderValue(value: unknown): string | number | boolean | null {
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return null;
}

function providerError(response: Response, provider: string): WeatherServiceError {
  if (response.status === 429) {
    return new WeatherServiceError(
      503,
      "WEATHER_PROVIDER_RATE_LIMITED",
      `${provider} is rate-limiting requests. Retry later.`,
      readRetryAfter(response),
    );
  }
  return new WeatherServiceError(
    502,
    "WEATHER_PROVIDER_ERROR",
    `${provider} returned HTTP ${response.status}.`,
  );
}

export class OpenMeteoWeatherService implements WeatherService {
  private readonly weatherCache = new Map<string, { expiresAt: number; value: OpenMeteoWeather }>();
  private readonly geocodingCache = new Map<string, { expiresAt: number; value: GeocodingResult }>();

  constructor(
    private readonly fetcher: typeof fetch = fetch,
    private readonly requestTimeoutMs = config.weatherRequestTimeoutMs,
  ) {}

  async listLocations(): Promise<Array<WeatherLocation & { preset: boolean }>> {
    return Promise.all(presets.map(async (preset) => ({
      ...await this.resolvePreset(preset.id),
      preset: true,
    })));
  }

  async getWeather(
    locationId = config.weatherDefaultLocation,
    latitude?: number,
    longitude?: number,
  ): Promise<OpenMeteoWeather> {
    const location = latitude !== undefined && longitude !== undefined
      ? { id: "coordinates", name: "Field coordinates", latitude, longitude }
      : await this.resolvePreset(locationId);
    const cacheKey = JSON.stringify({
      locationId: location.id,
      latitude: location.latitude,
      longitude: location.longitude,
      current: weatherVariables.current,
      hourly: weatherVariables.hourly,
      daily: weatherVariables.daily,
      forecastDays: 7,
      forecastHours: 24,
      timezone: "auto",
    });
    const cached = cacheGet(this.weatherCache, cacheKey);
    if (cached) return cached;

    const parameters = new URLSearchParams({
      latitude: String(location.latitude),
      longitude: String(location.longitude),
      current: weatherVariables.current.join(","),
      hourly: weatherVariables.hourly.join(","),
      daily: weatherVariables.daily.join(","),
      forecast_days: "7",
      forecast_hours: "24",
      timezone: "auto",
    });
    const payload = await this.requestJson(
      `https://api.open-meteo.com/v1/forecast?${parameters.toString()}`,
      "Open-Meteo forecast API",
    );
    const weather = this.parseWeather(payload, location);
    cacheSet(this.weatherCache, cacheKey, weather, weatherCacheTtlMs);
    return weather;
  }

  private async resolvePreset(locationId: string): Promise<WeatherLocation> {
    const preset = presets.find((entry) => entry.id === locationId);
    if (!preset) {
      throw new WeatherServiceError(404, "WEATHER_LOCATION_NOT_FOUND", "The requested weather location is not configured.");
    }

    const cached = cacheGet(this.geocodingCache, preset.id);
    const result = cached ?? await this.resolveGeocoding(preset);
    if (!cached) cacheSet(this.geocodingCache, preset.id, result, geocodingCacheTtlMs);
    return {
      id: preset.id,
      name: preset.name,
      latitude: result.latitude,
      longitude: result.longitude,
      ...(result.timezone ? { timezone: result.timezone } : {}),
      ...(result.elevation !== undefined ? { elevation: result.elevation } : {}),
    };
  }

  private async resolveGeocoding(preset: typeof presets[number]): Promise<GeocodingResult> {
    const parameters = new URLSearchParams({
      name: preset.geocodingQuery,
      count: "20",
      language: "en",
      format: "json",
    });
    const payload = await this.requestJson(
      `https://geocoding-api.open-meteo.com/v1/search?${parameters.toString()}`,
      "Open-Meteo geocoding API",
    );
    const results = isRecord(payload) && Array.isArray(payload.results) ? payload.results : [];
    const match = results.find((entry): entry is JsonRecord => {
      if (!isRecord(entry)
        || entry.country_code !== "EG"
        || normalizePlaceName(String(entry.admin1 ?? "")) !== "cairo governorate"
        || normalizePlaceName(String(entry.name ?? "")) !== preset.expectedName) return false;
      return typeof entry.latitude === "number"
        && Number.isFinite(entry.latitude)
        && typeof entry.longitude === "number"
        && Number.isFinite(entry.longitude);
    });
    if (!match) {
      throw new WeatherServiceError(
        422,
        "WEATHER_LOCATION_UNRESOLVED",
        `Open-Meteo could not resolve ${preset.name} in Cairo Governorate, Egypt.`,
      );
    }
    return {
      name: String(match.name),
      latitude: match.latitude as number,
      longitude: match.longitude as number,
      ...(typeof match.elevation === "number" ? { elevation: match.elevation } : {}),
      country_code: "EG",
      admin1: "Cairo Governorate",
      ...(typeof match.timezone === "string" ? { timezone: match.timezone } : {}),
    };
  }

  private async requestJson(url: string, provider: string): Promise<unknown> {
    let response: Response;
    try {
      response = await this.fetcher(url, { signal: AbortSignal.timeout(this.requestTimeoutMs) });
    } catch (error) {
      if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
        throw new WeatherServiceError(504, "WEATHER_PROVIDER_TIMEOUT", `${provider} did not respond before the timeout.`);
      }
      throw new WeatherServiceError(502, "WEATHER_PROVIDER_UNAVAILABLE", `${provider} could not be reached.`);
    }
    if (!response.ok) throw providerError(response, provider);
    try {
      return await response.json() as unknown;
    } catch {
      throw new WeatherServiceError(502, "WEATHER_PROVIDER_INVALID_RESPONSE", `${provider} returned invalid JSON.`);
    }
  }

  private parseWeather(payload: unknown, location: WeatherLocation): OpenMeteoWeather {
    if (!isRecord(payload) || !isRecord(payload.current) || !isRecord(payload.hourly) || !isRecord(payload.daily)) {
      throw new WeatherServiceError(502, "WEATHER_PROVIDER_INVALID_RESPONSE", "Open-Meteo returned an incomplete forecast.");
    }
    const hourlyTimes = Array.isArray(payload.hourly.time) ? payload.hourly.time : [];
    const dailyTimes = Array.isArray(payload.daily.time) ? payload.daily.time : [];
    if (hourlyTimes.length < 24 || dailyTimes.length < 7
      || hourlyTimes.slice(0, 24).some((time) => typeof time !== "string")
      || dailyTimes.slice(0, 7).some((time) => typeof time !== "string")) {
      throw new WeatherServiceError(502, "WEATHER_PROVIDER_MISSING_FORECAST", "Open-Meteo returned no hourly or daily forecast.");
    }

    const series = (
      source: JsonRecord,
      times: unknown[],
      excluded: ReadonlySet<string>,
    ): Record<string, Array<string | number | null>> => {
      const output: Record<string, Array<string | number | null>> = {};
      output.time = times.map((value) => typeof value === "string" ? value : null) as Array<string | number | null>;
      for (const [key, value] of Object.entries(source)) {
        if (excluded.has(key) || !Array.isArray(value)) continue;
        output[key] = times.map((_time, index) => {
          const item = asProviderValue(value[index]);
          return typeof item === "boolean" ? Number(item) : item;
        });
      }
      return output;
    };

    return {
      source: "open-meteo",
      attribution: "Weather data by Open-Meteo.com",
      retrieved_at: new Date().toISOString(),
      location: {
        ...location,
        ...(location.timezone || typeof payload.timezone !== "string" ? {} : { timezone: payload.timezone }),
        ...(location.elevation !== undefined || typeof payload.elevation !== "number" ? {} : { elevation: payload.elevation }),
      },
      units: {
        current: isRecord(payload.current_units) ? Object.fromEntries(
          Object.entries(payload.current_units).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
        ) : {},
        hourly: isRecord(payload.hourly_units) ? Object.fromEntries(
          Object.entries(payload.hourly_units).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
        ) : {},
        daily: isRecord(payload.daily_units) ? Object.fromEntries(
          Object.entries(payload.daily_units).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
        ) : {},
      },
      current: Object.fromEntries(Object.entries(payload.current).map(([key, value]) => [key, asProviderValue(value)])),
      hourly: series(payload.hourly, hourlyTimes.slice(0, 24), new Set(["time"])),
      daily: series(payload.daily, dailyTimes.slice(0, 7), new Set(["time"])),
    };
  }
}

export const openMeteoWeatherService = new OpenMeteoWeatherService();
