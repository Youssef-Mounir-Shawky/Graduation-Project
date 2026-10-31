import type {
  ApiAlert,
  ApiEnvelope,
  ApiEnvironmentalStatus,
  ApiHealth,
  ApiRecommendation,
  ApiReading,
  ApiReadingsResponse,
  ApiScheduleEntry,
  ApiSession,
  ApiUser,
  ApiValveOverride,
  ApiWeather,
  ApiWeatherLocation,
  ApiZone,
} from "./types.js";

const TOKEN_KEY = "nileguard.session-token";
const AUTH_EXPIRED_EVENT = "nileguard:auth-expired";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function setSessionToken(token: string | null): void {
  if (token) sessionStorage.setItem(TOKEN_KEY, token);
  else sessionStorage.removeItem(TOKEN_KEY);
}

export function getSessionToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY);
}

async function requestData<T>(path: string, init: RequestInit = {}, authenticated = true): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (authenticated) {
    const token = getSessionToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }

  let response: Response;
  try {
    response = await fetch(`/api${path}`, { ...init, headers });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Network request failed.";
    throw new ApiError(0, "NETWORK_ERROR", `Could not reach the NileGuard API. ${detail}`);
  }

  if (response.status === 204) {
    if (!response.ok) throw new ApiError(response.status, "HTTP_ERROR", `The API returned HTTP ${response.status}.`);
    return undefined as T;
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    if (!response.ok) throw new ApiError(response.status, "HTTP_ERROR", `The API returned HTTP ${response.status}.`);
    throw new ApiError(response.status, "INVALID_API_RESPONSE", "The API response was not valid JSON.");
  }

  if (!response.ok) {
    const errorBody = payload as { error?: { code?: string; message?: string } };
    if (response.status === 401 && authenticated) {
      setSessionToken(null);
      document.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
    }
    throw new ApiError(
      response.status,
      errorBody.error?.code ?? "HTTP_ERROR",
      errorBody.error?.message ?? `The API returned HTTP ${response.status}.`,
    );
  }

  if (!payload || typeof payload !== "object" || !("data" in payload)) {
    throw new ApiError(response.status, "INVALID_API_RESPONSE", "The API response did not include its expected data envelope.");
  }
  return (payload as ApiEnvelope<T>).data;
}

export function login(email: string, password: string): Promise<ApiSession> {
  return requestData<ApiSession>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  }, false);
}

export function getCurrentUser(): Promise<ApiUser> {
  return requestData<ApiUser>("/auth/me");
}

export function updateMyProfile(changes: {
  name?: string;
  email?: string;
  phone_number?: string;
  password?: string;
}): Promise<ApiUser> {
  return requestData<ApiUser>("/auth/me", { method: "PATCH", body: JSON.stringify(changes) });
}

export function getUsers(): Promise<ApiUser[]> {
  return requestData<ApiUser[]>("/users");
}

export function createUser(input: {
  name: string;
  email: string;
  phone_number: string;
  password: string;
  role: "admin" | "operator";
}): Promise<ApiUser> {
  return requestData<ApiUser>("/users", { method: "POST", body: JSON.stringify(input) });
}

export function deleteUser(userId: string): Promise<void> {
  return requestData<void>(`/users/${encodeURIComponent(userId)}`, { method: "DELETE" });
}

export function logout(): Promise<{ logged_out: boolean }> {
  return requestData<{ logged_out: boolean }>("/auth/logout", { method: "POST" });
}

export function getHealth(): Promise<ApiHealth> {
  return requestData<ApiHealth>("/health", {}, false);
}

export function getZones(): Promise<ApiZone[]> {
  return requestData<ApiZone[]>("/zones");
}

export function getRecommendations(): Promise<ApiRecommendation[]> {
  return requestData<ApiRecommendation[]>("/recommendations");
}

export function getAlerts(): Promise<ApiAlert[]> {
  return requestData<ApiAlert[]>("/alerts");
}

export function getSchedule(): Promise<ApiScheduleEntry[]> {
  return requestData<ApiScheduleEntry[]>("/irrigation/schedule");
}

export function getReadings(zoneId: string, hours: number, limit = 500): Promise<ApiReadingsResponse> {
  const query = new URLSearchParams({ zone_id: zoneId, hours: String(hours), limit: String(limit) });
  return requestData<ApiReadingsResponse>(`/readings?${query}`);
}

export function getWeatherLocations(): Promise<ApiWeatherLocation[]> {
  return requestData<ApiWeatherLocation[]>("/weather/locations");
}

export function getWeather(
  location?: string | { latitude: number; longitude: number },
  zoneId?: string,
): Promise<ApiWeather> {
  const query = !location
    ? new URLSearchParams()
    : typeof location === "string"
      ? new URLSearchParams({ location })
      : new URLSearchParams({
      latitude: String(location.latitude),
      longitude: String(location.longitude),
    });
  if (zoneId) query.set("zone_id", zoneId);
  const suffix = query.size ? `?${query.toString()}` : "";
  return requestData<ApiWeather>(`/weather${suffix}`);
}

export function getEnvironmentalStatus(zoneId: string): Promise<ApiEnvironmentalStatus> {
  return requestData<ApiEnvironmentalStatus>(`/zones/${encodeURIComponent(zoneId)}/environment`);
}

export function setManualValve(zoneId: string, state: "on" | "off"): Promise<ApiValveOverride> {
  return requestData<ApiValveOverride>(`/zones/${encodeURIComponent(zoneId)}/override`, {
    method: "PUT",
    body: JSON.stringify({ valve_state: state }),
  });
}

export function restoreAutomaticValve(zoneId: string): Promise<ApiValveOverride> {
  return requestData<ApiValveOverride>(`/zones/${encodeURIComponent(zoneId)}/override`, {
    method: "DELETE",
  });
}

export function simulateReadings(zoneId?: string): Promise<{ readings: ApiReading[]; message: string }> {
  return requestData<{ readings: ApiReading[]; message: string }>("/mock/simulate-reading", {
    method: "POST",
    body: JSON.stringify(zoneId ? { zone_id: zoneId } : {}),
  });
}

export function onAuthenticationExpired(callback: () => void): () => void {
  document.addEventListener(AUTH_EXPIRED_EVENT, callback);
  return () => document.removeEventListener(AUTH_EXPIRED_EVENT, callback);
}
