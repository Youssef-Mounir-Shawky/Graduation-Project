import "../styles/index.css";
import "./dashboard.css";
import arabicTranslations from "./i18n/ar.json";
import {
  ApiError,
  createUser,
  deleteUser,
  getAlerts,
  getCurrentUser,
  getHealth,
  getReadings,
  getRecommendations,
  getSchedule,
  getSessionToken,
  getWeather,
  getWeatherLocations,
  getUsers,
  getZones,
  login,
  logout,
  onAuthenticationExpired,
  restoreAutomaticValve,
  setManualValve,
  setSessionToken,
  simulateReadings,
  updateMyProfile,
} from "./api/client.js";
import type {
  ApiAlert,
  ApiRecommendation,
  ApiReading,
  ApiScheduleEntry,
  ApiUser,
  ApiWeather,
  ApiWeatherLocation,
  ApiZone,
  ApiHealth,
} from "./api/types.js";

type View = "Overview" | "Zones" | "Irrigation" | "Analytics" | "Weather Forecast" | "Trends" | "Alerts" | "Settings";
type TimeRange = "24 hours" | "7 days" | "30 days" | "6 months";
type Locale = "en" | "ar";

const views: View[] = ["Overview", "Zones", "Irrigation", "Analytics", "Weather Forecast", "Trends", "Alerts", "Settings"];
const HISTORY_HOURS = 24 * 183;
const mobileNavigationQuery = window.matchMedia("(max-width: 56rem)");
const RANGE_HOURS: Record<TimeRange, number> = {
  "24 hours": 24,
  "7 days": 24 * 7,
  "30 days": 24 * 30,
  "6 months": HISTORY_HOURS,
};
let nextDashboardRequest = 0;

const iconPaths: Record<string, string> = {
  leaf: '<path d="M20 4c-8 0-14 3.4-14 10a6 6 0 0 0 6 6c6.6 0 10-6 10-14V4h-2Z"/><path d="M4 21c3-5 7-8 13-11"/>',
  overview: '<rect x="3" y="3" width="8" height="8" rx="2"/><rect x="13" y="3" width="8" height="5" rx="2"/><rect x="13" y="10" width="8" height="11" rx="2"/><rect x="3" y="13" width="8" height="8" rx="2"/>',
  zones: '<path d="M3 21h18M5 21V7l7-4 7 4v14"/><path d="M9 21v-6h6v6M9 9h.01M15 9h.01"/>',
  irrigation: '<path d="M12 22a7 7 0 0 0 7-7c0-4-7-13-7-13S5 11 5 15a7 7 0 0 0 7 7Z"/><path d="M9 16a3 3 0 0 0 3 3"/>',
  analytics: '<path d="M4 19V5M4 19h16"/><path d="m7 15 4-4 3 2 5-7"/>',
  weather: '<path d="M7 18a4 4 0 1 1 .8-7.9A5.5 5.5 0 0 1 18.5 12 3 3 0 0 1 18 18Z"/><path d="M12 20v2m5-3 1.5 1.5M7 19l-1.5 1.5"/>',
  forecast: '<path d="M3 12h3l2-7 4 14 2-7h7"/><path d="M3 19h18"/>',
  trends: '<path d="M3 3v18h18"/><path d="m7 14 4-4 4 3 6-7"/>',
  alerts: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.7-.6a8 8 0 0 1-1.7 1l-.3 1.8h-2.8l-.3-1.8a8 8 0 0 1-1.7-1l-1.7.6-1.4-2.4 1.4-1.1a7 7 0 0 1 0-2l-1.4-1.1 1.4-2.4 1.7.6a8 8 0 0 1 1.7-1l.3-1.8h2.8l.3 1.8a8 8 0 0 1 1.7 1l1.7-.6 1.4 2.4-1.4 1.1a7 7 0 0 1 0 2Z" transform="translate(-1 -1)"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/>',
  arrow: '<path d="M7 17 17 7M7 7h10v10"/>',
  chevron: '<path d="m9 18 6-6-6-6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  thermometer: '<path d="M14 14.76V5a2 2 0 0 0-4 0v9.76a4 4 0 1 0 4 0Z"/><path d="M12 11v7"/>',
  droplet: '<path d="M12 22a7 7 0 0 0 7-7c0-4-7-13-7-13S5 11 5 15a7 7 0 0 0 7 7Z"/>',
  humidity: '<path d="M12 22a7 7 0 0 0 7-7c0-4-7-13-7-13S5 11 5 15a7 7 0 0 0 7 7Z"/><path d="M9 16a3 3 0 0 0 3 3"/>',
  simulate: '<path d="M4 12a8 8 0 0 1 14-5l2 2"/><path d="M20 4v5h-5"/><path d="M20 12a8 8 0 0 1-14 5l-2-2"/><path d="M4 20v-5h5"/>',
  logout: '<path d="M10 17l5-5-5-5M15 12H3"/><path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6"/>',
  moon: '<path d="M20.9 13A8.5 8.5 0 0 1 11 3.1 8.5 8.5 0 1 0 20.9 13Z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  chevronDown: '<path d="m7 10 5 5 5-5"/>',
};

const state: {
  view: View;
  range: TimeRange;
  user: ApiUser | null;
  zones: ApiZone[];
  recommendations: ApiRecommendation[];
  alerts: ApiAlert[];
  schedule: ApiScheduleEntry[];
  users: ApiUser[];
  weatherLocations: ApiWeatherLocation[];
  weather: ApiWeather | null;
  selectedWeatherLocationId: string;
  weatherLoading: boolean;
  weatherError: string;
  weatherRequestId: number;
  weatherLastAttemptAt: number;
  readings: ApiReading[];
  historyReadings: ApiReading[];
  selectedZoneId: string;
  usersExpanded: boolean;
  theme: "light" | "dark";
  locale: Locale;
  languageMenuOpen: boolean;
  weatherLocationMenuOpen: boolean;
  userRoleMenuOpen: boolean;
  newUserRole: "operator" | "admin";
  sidebarCollapsed: boolean;
  mobileNavOpen: boolean;
  zoneMenuOpen: boolean;
  loading: boolean;
  busy: boolean;
  error: string;
  loginError: string;
  mockHardwareEnabled: boolean;
  persistence: ApiHealth["persistence"];
  isInitializing: boolean;
  pollTimer: number;
  toastTimer: number;
} = {
  view: "Overview",
  range: "24 hours",
  user: null,
  zones: [],
  recommendations: [],
  alerts: [],
  schedule: [],
  users: [],
  weatherLocations: [],
  weather: null,
  selectedWeatherLocationId: "",
  weatherLoading: false,
  weatherError: "",
  weatherRequestId: 0,
  weatherLastAttemptAt: 0,
  readings: [],
  historyReadings: [],
  selectedZoneId: "",
  usersExpanded: false,
  theme: localStorage.getItem("nileguard.theme") === "dark" ? "dark" : "light",
  locale: localStorage.getItem("nileguard.locale") === "ar" ? "ar" : "en",
  languageMenuOpen: false,
  weatherLocationMenuOpen: false,
  userRoleMenuOpen: false,
  newUserRole: "operator",
  sidebarCollapsed: localStorage.getItem("nileguard.sidebar-collapsed") === "true",
  mobileNavOpen: false,
  zoneMenuOpen: false,
  loading: false,
  busy: false,
  error: "",
  loginError: "",
  mockHardwareEnabled: false,
  persistence: "in-memory",
  isInitializing: true,
  pollTimer: 0,
  toastTimer: 0,
};

document.documentElement.dataset.theme = state.theme;

const arabicTranslationEntries = Object.entries(arabicTranslations)
  .sort(([left], [right]) => right.length - left.length);

function translateText(value: string): string {
  if (state.locale !== "ar") return value;
  const preservedIdentifiers: string[] = [];
  let translated = value
    .replace(/\b(?:node|zone)-[a-z0-9]+(?:-[a-z0-9]+)+\b/gi, (identifier) => {
      preservedIdentifiers.push(identifier);
      return `\uE000${preservedIdentifiers.length - 1}\uE001`;
    })
    .replace(
      /^(.+) valve manually turned (on|off)\.$/i,
      (_match, zone: string, valveState: string) =>
        `${zone}: تم ${valveState.toLowerCase() === "on" ? "تشغيل" : "إيقاف"} الصمام يدويًا.`,
    )
    .replace(/^(.+) returned to automatic irrigation\.$/i, "$1 عادت إلى الري التلقائي.")
    .replace(
      /^(Tomato|Potato) soil moisture is ([\d.]+)%, (at or above|below) (?:the interim |its )?([\d.]+)% (?:irrigation threshold|interim threshold)\.(?: The valve remains (on|off) because manual control takes priority\.)?$/i,
      (_match, crop: string, moisture: string, comparison: string, threshold: string, manualState?: string) =>
        `${crop.toLowerCase() === "tomato" ? "الطماطم" : "البطاطس"}: رطوبة التربة ${moisture}٪، ${
          comparison.toLowerCase() === "below" ? "أقل من" : "عند أو أعلى من"
        } حد الري الأولي البالغ ${threshold}٪.${
          manualState ? ` يبقى الصمام ${manualState === "on" ? "مفتوحًا" : "مغلقًا"} لأن التحكم اليدوي له الأولوية.` : ""
        }`,
    )
    .replace(
      /(\d+)\s+of\s+(\d+)\s+nodes recently reported · data is mock until devices connect/i,
      "$1 من $2 عقد أرسلت تقارير مؤخرًا · البيانات تجريبية حتى اتصال الأجهزة",
    )
    .replace(/^(\d+) open$/i, "$1 مفتوحة");
  translated = arabicTranslationEntries.reduce((text, [source, translation]) => {
    const escaped = source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return text.replace(new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "giu"), translation);
  }, translated);
  translated = translated.replace(/\uE000(\d+)\uE001/g, (_match, index: string) => preservedIdentifiers[Number(index)]);
  return localizeDigits(translated);
}

function localizeDigits(value: string): string {
  return state.locale === "ar"
    ? value.replace(/\d/g, (digit) => "٠١٢٣٤٥٦٧٨٩"[Number(digit)])
    : value;
}

function normalizeDigits(value: string): string {
  return value.replace(/[٠-٩۰-۹]/g, (digit) => {
    const code = digit.charCodeAt(0);
    return String(code >= 0x06f0 ? code - 0x06f0 : code - 0x0660);
  });
}

function applyLocale(root: HTMLElement): void {
  const isArabic = state.locale === "ar";
  document.documentElement.lang = state.locale;
  document.documentElement.dir = isArabic ? "rtl" : "ltr";
  document.title = isArabic ? "NileGuard - لوحة الري" : "NileGuard - Irrigation dashboard";
  document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute(
    "content",
    state.theme === "dark" ? "#0b2319" : "#f4f6f2",
  );
  root.dir = isArabic ? "rtl" : "ltr";

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let textNode = walker.nextNode();
  while (textNode) {
    if (textNode.parentElement?.closest("script, style, [data-no-translate]") === null) {
      textNode.nodeValue = translateText(textNode.nodeValue ?? "");
    }
    textNode = walker.nextNode();
  }

  for (const element of root.querySelectorAll<HTMLElement>("[aria-label], [title], [placeholder], [data-chart-tip]")) {
    if (element.closest("[data-no-translate]")) continue;
    for (const attribute of ["aria-label", "title", "placeholder", "data-chart-tip"]) {
      const value = element.getAttribute(attribute);
      if (value !== null) element.setAttribute(attribute, translateText(value));
    }
  }

  if (isArabic) {
    for (const input of root.querySelectorAll<HTMLInputElement>('input[type="email"], input[type="tel"], input[name="name"]')) {
      input.value = localizeDigits(input.value);
    }
  }
}

function localeTag(): string {
  return state.locale === "ar" ? "ar-EG" : "en-US";
}

function escapeHtml(value: unknown): string {
  const entities: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };
  return String(value ?? "").replace(/[&<>"']/g, (character) => entities[character]);
}

function icon(name: string, className = ""): string {
  return `<svg class="icon ${escapeHtml(className)}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconPaths[name] ?? iconPaths.leaf}</svg>`;
}

function selectedZone(): ApiZone | undefined {
  return state.zones.find((zone) => zone.id === state.selectedZoneId) ?? state.zones[0];
}

function recommendationFor(zoneId: string): ApiRecommendation | undefined {
  return state.recommendations.find((recommendation) => recommendation.zoneId === zoneId);
}

function zoneStatus(zone: ApiZone): { label: string; tone: string } {
  if (!zone.node.online) return { label: "Offline", tone: "danger" };
  if (!zone.reading) return { label: "No readings", tone: "warning" };
  if (zone.reading.moisture < zone.moisture_threshold_percent) return { label: "Needs water", tone: "warning" };
  return { label: "Healthy", tone: "success" };
}

function formatTime(timestamp: string): string {
  return new Intl.DateTimeFormat(localeTag(), { hour: "numeric", minute: "2-digit" }).format(new Date(timestamp));
}

function formatDate(timestamp: string): string {
  return new Intl.DateTimeFormat(localeTag(), { month: "short", day: "numeric" }).format(new Date(timestamp));
}

function formatRangePoint(timestamp: string): string {
  return state.range === "24 hours"
    ? new Intl.DateTimeFormat(localeTag(), { hour: "numeric", minute: "2-digit" }).format(new Date(timestamp))
    : formatDate(timestamp);
}

function rangeAverages(readings: ApiReading[], field: NumericReadingKey): DailyPoint[] {
  const aggregates = new Map<string, { timestamp: string; total: number; count: number }>();
  for (const reading of readings) {
    const value = reading[field];
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    const bucket = state.range === "24 hours"
      ? new Date(reading.timestamp).toISOString().slice(0, 13) + ":00:00.000Z"
      : reading.timestamp.slice(0, 10);
    const aggregate = aggregates.get(bucket) ?? { timestamp: bucket, total: 0, count: 0 };
    aggregate.total += value;
    aggregate.count += 1;
    aggregates.set(bucket, aggregate);
  }
  return Array.from(aggregates.values(), ({ timestamp, total, count }) => ({ timestamp, value: total / count }));
}

function renderRangePicker(label: string): string {
  const ranges: TimeRange[] = ["24 hours", "7 days", "30 days", "6 months"];
  return `<div class="segmented-control range-picker" role="group" aria-label="${escapeHtml(label)}">${ranges.map((range) => `<button type="button" data-action="range" data-range="${range}" aria-pressed="${state.range === range}">${range}</button>`).join("")}</div>`;
}

function renderLanguageSelect(className = ""): string {
  const isArabic = state.locale === "ar";
  const options = (["en", "ar"] as const).map((locale) => {
    const label = locale === "en" ? "English" : "العربية";
    return `<button class="language-option ${state.locale === locale ? "is-selected" : ""}" type="button" role="option" aria-selected="${state.locale === locale}" data-action="select-language" data-locale="${locale}">${label}</button>`;
  }).join("");
  return `<div class="language-picker ${className}" data-no-translate>
    <button class="language-trigger" type="button" data-action="toggle-language-menu" aria-haspopup="listbox" aria-expanded="${state.languageMenuOpen}" aria-controls="language-options" aria-label="${isArabic ? "اللغة" : "Language"}">
      <span>${isArabic ? "العربية" : "English"}</span>${icon("chevronDown", "language-chevron")}
    </button>
    ${state.languageMenuOpen ? `<div class="language-menu" id="language-options" role="listbox" aria-label="${isArabic ? "اللغة" : "Language"}">${options}</div>` : ""}
  </div>`;
}

function renderNav(): string {
  return views.map((view) => {
    const iconName = view === "Weather Forecast"
      ? "weather"
      : view.toLowerCase() === "overview"
        ? "overview"
        : view.toLowerCase();
    const pendingAlerts = state.alerts.filter((alert) => alert.severity !== "info").length;
    return `<button class="dashboard-nav__item ${state.view === view ? "is-active" : ""}" type="button" data-action="navigate" data-view="${view}" ${state.view === view ? 'aria-current="page"' : ""}>${icon(iconName)}<span>${view}</span>${view === "Alerts" && pendingAlerts > 0 ? `<span class="nav-count">${pendingAlerts}</span>` : ""}</button>`;
  }).join("");
}

type NumericReadingKey = "moisture" | "temp" | "humidity" | "light_lux" | "light_ppfd" | "co2_ppm" | "soil_ph" | "battery_mv";
type DailyPoint = { timestamp: string; value: number };

function sampleEvenly<T>(items: T[], maximum: number): T[] {
  if (items.length <= maximum) return items;
  return Array.from({ length: maximum }, (_, index) =>
    items[Math.round(index * (items.length - 1) / (maximum - 1))],
  );
}

function chartTip(title: string, details: string[]): string {
  const text = [title, ...details].join("\n");
  return `data-chart-tip="${escapeHtml(text)}" tabindex="0" role="img" aria-label="${escapeHtml(text.replace(/\n/g, ", "))}"`;
}

function renderSeriesPanel(
  title: string,
  points: DailyPoint[],
  unit: string,
  color: "primary" | "warning" | "info",
  options: { area?: boolean; target?: [number, number]; decimals?: number; domain?: [number, number] } = {},
): string {
  const values = points.map((point) => point.value);
  const latest = values.at(-1);
  const average = values.length ? values.reduce((total, value) => total + value, 0) / values.length : null;
  if (!points.length) {
    return `<section class="panel analytics-chart-panel"><div class="panel__header"><div><p class="eyebrow">${escapeHtml(state.range)} history</p><h2>${escapeHtml(title)}</h2></div></div><div class="chart-empty">No stored ${escapeHtml(title.toLowerCase())} measurements are available for this zone.</div></section>`;
  }

  const width = 760;
  const height = 250;
  const left = 58;
  const right = width - 18;
  const top = 18;
  const bottom = 202;
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const padding = rawMax === rawMin ? Math.max(Math.abs(rawMax) * 0.08, 1) : (rawMax - rawMin) * 0.12;
  const minimum = options.domain?.[0] ?? rawMin - padding;
  const maximum = options.domain?.[1] ?? rawMax + padding;
  const sample = sampleEvenly(points, 72);
  const positionY = (value: number) => bottom - ((value - minimum) / (maximum - minimum)) * (bottom - top);
  const coords = sample.map((point, index) => ({
    x: left + (index / Math.max(sample.length - 1, 1)) * (right - left),
    y: positionY(point.value),
    point,
  }));
  const linePath = coords.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L ${right} ${bottom} L ${left} ${bottom} Z`;
  const target = options.target
    ? `<rect class="analytics-target-band" x="${left}" y="${positionY(options.target[1])}" width="${right - left}" height="${positionY(options.target[0]) - positionY(options.target[1])}"/>`
    : "";
  const ticks = Array.from({ length: 4 }, (_, index) => {
    const value = maximum - ((maximum - minimum) * index) / 3;
    const y = top + ((bottom - top) * index) / 3;
    return `<line class="analytics-gridline" x1="${left}" y1="${y}" x2="${right}" y2="${y}"/><text class="analytics-axis-label" x="${left - 8}" y="${y + 4}" text-anchor="end">${value.toFixed(options.decimals ?? 1)}</text>`;
  }).join("");
  const latestText = latest === undefined ? "—" : `${latest.toFixed(options.decimals ?? 1)}${unit}`;
  const meanText = average === null ? "—" : `${average.toFixed(options.decimals ?? 1)}${unit}`;
  const marks = coords.map(({ x, y, point }) => `<circle class="analytics-hit-point analytics-hit-point--${color}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="10" ${chartTip(formatRangePoint(point.timestamp), [`${title}: ${point.value.toFixed(options.decimals ?? 1)}${unit}`])}/>`).join("");

  return `<section class="panel analytics-chart-panel">
    <div class="panel__header"><div><p class="eyebrow">${state.range === "24 hours" ? "Hourly average" : "Daily average"} · ${escapeHtml(state.range)}</p><h2>${escapeHtml(title)}</h2></div><div class="analytics-chart-summary"><strong>${escapeHtml(latestText)}</strong><span>latest</span></div></div>
    <svg class="analytics-plot" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="${escapeHtml(title)} daily average over six months">
      ${ticks}${target}
      ${options.area ? `<path class="analytics-area analytics-area--${color}" d="${areaPath}"/>` : ""}
      <path class="analytics-line analytics-line--${color}" d="${linePath}"/>
      <circle class="analytics-point analytics-point--${color}" cx="${coords.at(-1)?.x ?? left}" cy="${coords.at(-1)?.y ?? bottom}" r="4"/>
      ${marks}
      <text class="analytics-axis-label" x="${left}" y="230">${escapeHtml(formatRangePoint(points[0].timestamp))}</text>
      <text class="analytics-axis-label" x="${right}" y="230" text-anchor="end">${escapeHtml(formatRangePoint(points.at(-1)?.timestamp ?? points[0].timestamp))}</text>
    </svg>
    <div class="chart-tooltip" aria-hidden="true"></div>
    <div class="analytics-chart-footer"><span>${points.length} ${state.range === "24 hours" ? "hours" : "days"} with readings</span><span>Mean ${escapeHtml(meanText)}</span>${options.target ? `<span>Configured target ${options.target[0]}–${options.target[1]}${escapeHtml(unit)}</span>` : ""}</div>
  </section>`;
}

function renderPhPie(readings: ApiReading[]): string {
  const phValues = readings.flatMap((reading) => reading.soil_ph === null ? [] : [reading.soil_ph]);
  if (!phValues.length) {
    return `<section class="panel analytics-chart-panel"><div class="panel__header"><div><p class="eyebrow">Observed pH bands</p><h2>Soil pH distribution</h2></div></div><div class="chart-empty">No soil pH measurements are available for this zone.</div></section>`;
  }
  const categories = [
    { label: "Below 6.0", count: phValues.filter((value) => value < 6).length, color: "primary" },
    { label: "6.0–7.0", count: phValues.filter((value) => value >= 6 && value <= 7).length, color: "warning" },
    { label: "Above 7.0", count: phValues.filter((value) => value > 7).length, color: "info" },
  ];
  let angle = -Math.PI / 2;
  const radius = 62;
  const segments = categories.map((category) => {
    if (!category.count) return "";
    if (category.count === phValues.length) {
      return `<circle class="ph-pie__segment ph-pie__segment--${category.color}" cx="80" cy="80" r="${radius}" ${chartTip(category.label, [`Readings: ${category.count.toLocaleString()}`, "Share: 100.0%"])}/>`;
    }
    const nextAngle = angle + (category.count / phValues.length) * Math.PI * 2;
    const x1 = 80 + radius * Math.cos(angle);
    const y1 = 80 + radius * Math.sin(angle);
    const x2 = 80 + radius * Math.cos(nextAngle);
    const y2 = 80 + radius * Math.sin(nextAngle);
    const largeArc = nextAngle - angle > Math.PI ? 1 : 0;
    const path = `M 80 80 L ${x1.toFixed(2)} ${y1.toFixed(2)} A ${radius} ${radius} 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z`;
    const segment = `<path class="ph-pie__segment ph-pie__segment--${category.color}" d="${path}" ${chartTip(category.label, [`Readings: ${category.count.toLocaleString()}`, `Share: ${((category.count / phValues.length) * 100).toFixed(1)}%`])}/>`;
    angle = nextAngle;
    return segment;
  }).join("");
  return `<section class="panel analytics-chart-panel">
    <div class="panel__header"><div><p class="eyebrow">Observed pH bands</p><h2>Soil pH distribution</h2></div><span class="status status--info">${phValues.length.toLocaleString()} readings</span></div>
    <div class="ph-donut-layout"><svg class="ph-pie" viewBox="0 0 160 160" role="img" aria-label="Pie chart of soil pH readings across three ranges">${segments}</svg>
      <ul class="ph-donut__legend">${categories.map((category) => `<li><span><i class="legend-dot legend-dot--${category.color}"></i>${category.label}</span><strong>${((category.count / phValues.length) * 100).toFixed(1)}%</strong></li>`).join("")}</ul>
    </div><div class="chart-tooltip" aria-hidden="true"></div><p class="analytics-note">Descriptive ranges only; they are not crop-specific pH recommendations.</p>
  </section>`;
}

function renderHistogram(
  title: string,
  points: DailyPoint[],
  unit: string,
  color: "primary" | "warning" | "info",
  decimals = 1,
): string {
  if (!points.length) {
    return `<section class="panel analytics-chart-panel"><div class="panel__header"><div><p class="eyebrow">Six-month distribution</p><h2>${escapeHtml(title)}</h2></div></div><div class="chart-empty">No measurements are available to build this histogram.</div></section>`;
  }
  const binCount = Math.min(8, Math.max(4, Math.ceil(Math.sqrt(points.length))));
  const minimum = Math.min(...points.map((point) => point.value));
  const maximum = Math.max(...points.map((point) => point.value));
  const step = maximum === minimum ? Math.max(Math.abs(maximum) * 0.1, 1) : (maximum - minimum) / binCount;
  const bins = Array.from({ length: binCount }, (_, index) => ({
    start: minimum + step * index,
    end: index === binCount - 1 ? maximum : minimum + step * (index + 1),
    count: 0,
  }));
  points.forEach((point) => {
    const index = maximum === minimum ? 0 : Math.min(binCount - 1, Math.floor((point.value - minimum) / step));
    bins[index].count += 1;
  });
  const width = 760;
  const height = 250;
  const left = 58;
  const right = width - 18;
  const top = 18;
  const bottom = 202;
  const maxCount = Math.max(...bins.map((bin) => bin.count), 1);
  const plotWidth = right - left;
  const barWidth = plotWidth / binCount;
  const bars = bins.map((bin, index) => {
    const barHeight = (bin.count / maxCount) * (bottom - top);
    const x = left + index * barWidth + 3;
    const y = bottom - barHeight;
    const label = `${bin.start.toFixed(decimals)}–${bin.end.toFixed(decimals)}${unit}`;
    return `<rect class="analytics-bar analytics-bar--${color}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${Math.max(barWidth - 6, 1).toFixed(1)}" height="${barHeight.toFixed(1)}" rx="4" ${chartTip(label, [`${title}: ${bin.count} days`, `Range: ${label}`])}/>`;
  }).join("");
  const grid = Array.from({ length: 4 }, (_, index) => {
    const count = Math.round(maxCount - (maxCount * index) / 3);
    const y = top + ((bottom - top) * index) / 3;
    return `<line class="analytics-gridline" x1="${left}" y1="${y}" x2="${right}" y2="${y}"/><text class="analytics-axis-label" x="${left - 8}" y="${y + 4}" text-anchor="end">${count}</text>`;
  }).join("");
  return `<section class="panel analytics-chart-panel">
    <div class="panel__header"><div><p class="eyebrow">${state.range === "24 hours" ? "Hourly averages" : "Daily averages"} · ${escapeHtml(state.range)}</p><h2>${escapeHtml(title)} distribution</h2></div><span class="status status--info">${points.length} periods</span></div>
    <svg class="analytics-plot" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="Histogram of ${escapeHtml(title)} daily averages">${grid}${bars}<text class="analytics-axis-label" x="${left}" y="230">${minimum.toFixed(decimals)}</text><text class="analytics-axis-label" x="${right}" y="230" text-anchor="end">${maximum.toFixed(decimals)}</text></svg>
    <div class="chart-tooltip" aria-hidden="true"></div><div class="analytics-chart-footer"><span>Daily average bins</span><span>Y axis · days</span></div>
  </section>`;
}

function renderRelationshipChart(
  readings: ApiReading[],
  config: {
    title: string;
    xKey: NumericReadingKey;
    xLabel: string;
    xUnit: string;
    yKey: NumericReadingKey;
    yLabel: string;
    yUnit: string;
    sizeKey?: NumericReadingKey;
    sizeLabel?: string;
    sizeUnit?: string;
    bubble?: boolean;
  },
): string {
  const pairs = readings.flatMap((reading) => {
    const x = reading[config.xKey];
    const y = reading[config.yKey];
    const size = config.sizeKey ? reading[config.sizeKey] : null;
    if (typeof x !== "number" || typeof y !== "number" || (config.sizeKey && typeof size !== "number")) return [];
    return [{ timestamp: reading.timestamp, x, y, size: typeof size === "number" ? size : 0 }];
  });
  if (!pairs.length) {
    return `<section class="panel analytics-chart-panel"><div class="panel__header"><div><p class="eyebrow">Sensor relationship</p><h2>${escapeHtml(config.title)}</h2></div></div><div class="chart-empty">Paired sensor readings are not available for this zone.</div></section>`;
  }
  const sample = sampleEvenly(pairs, 120);
  const width = 760;
  const left = 58;
  const right = width - 20;
  const top = 18;
  const bottom = 202;
  const xMin = Math.min(...sample.map((point) => point.x));
  const xMax = Math.max(...sample.map((point) => point.x));
  const yMin = Math.min(...sample.map((point) => point.y));
  const yMax = Math.max(...sample.map((point) => point.y));
  const xPadding = xMax === xMin ? Math.max(Math.abs(xMax) * 0.08, 1) : (xMax - xMin) * 0.12;
  const yPadding = yMax === yMin ? Math.max(Math.abs(yMax) * 0.08, 1) : (yMax - yMin) * 0.12;
  const xMinimum = xMin - xPadding;
  const xMaximum = xMax + xPadding;
  const yMinimum = yMin - yPadding;
  const yMaximum = yMax + yPadding;
  const sizeValues = sample.map((point) => point.size);
  const sizeMinimum = Math.min(...sizeValues);
  const sizeMaximum = Math.max(...sizeValues);
  const marks = sample.map((point) => {
    const x = left + ((point.x - xMinimum) / (xMaximum - xMinimum)) * (right - left);
    const y = bottom - ((point.y - yMinimum) / (yMaximum - yMinimum)) * (bottom - top);
    const radius = config.bubble
      ? 4 + (sizeMaximum === sizeMinimum ? 0.5 : ((point.size - sizeMinimum) / (sizeMaximum - sizeMinimum)) * 7)
      : 4;
    const details = [
      `X · ${config.xLabel}: ${point.x.toFixed(2)}${config.xUnit}`,
      `Y · ${config.yLabel}: ${point.y.toFixed(2)}${config.yUnit}`,
      ...(config.sizeKey ? [`Bubble · ${config.sizeLabel ?? config.sizeKey}: ${point.size.toFixed(1)}${config.sizeUnit ?? ""}`] : []),
    ];
    return `<circle class="analytics-scatter-point ${config.bubble ? "analytics-scatter-point--bubble" : ""}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${radius.toFixed(1)}" ${chartTip(formatRangePoint(point.timestamp), details)}/>`;
  }).join("");
  const grid = Array.from({ length: 4 }, (_, index) => {
    const value = yMaximum - ((yMaximum - yMinimum) * index) / 3;
    const y = top + ((bottom - top) * index) / 3;
    return `<line class="analytics-gridline" x1="${left}" y1="${y}" x2="${right}" y2="${y}"/><text class="analytics-axis-label" x="${left - 8}" y="${y + 4}" text-anchor="end">${value.toFixed(1)}</text>`;
  }).join("");
  return `<section class="panel analytics-chart-panel">
    <div class="panel__header"><div><p class="eyebrow">Sensor relationship · six months</p><h2>${escapeHtml(config.title)}</h2></div><span class="status status--info">${pairs.length.toLocaleString()} pairs</span></div>
    <svg class="analytics-plot" viewBox="0 0 ${width} 250" preserveAspectRatio="none" role="img" aria-label="${escapeHtml(config.bubble ? "Bubble chart" : "Scatter plot")} relating ${escapeHtml(config.xLabel)} and ${escapeHtml(config.yLabel)}">${grid}${marks}<text class="analytics-axis-label" x="${left}" y="230">${xMinimum.toFixed(1)}</text><text class="analytics-axis-label" x="${right}" y="230" text-anchor="end">${xMaximum.toFixed(1)}</text></svg>
    <div class="chart-tooltip" aria-hidden="true"></div><p class="analytics-chart-footer">${config.bubble ? `Bubble size represents ${escapeHtml(config.sizeLabel ?? "the third measure")}.` : "Each dot is a paired stored reading."} Hover or focus a mark to inspect both axis values.</p>
  </section>`;
}

function renderZonePicker(zone: ApiZone | undefined): string {
  return `<div class="analytics-zone-picker"><span id="zone-picker-label">Crop and soil</span><div class="zone-picker">
    <button class="zone-picker__trigger" type="button" data-action="toggle-zone-menu" aria-labelledby="zone-picker-label" aria-haspopup="listbox" aria-expanded="${state.zoneMenuOpen}">
      <span>${escapeHtml(zone ? `${zone.crop} · ${zone.soil_type} soil` : "Choose crop and soil")}</span>${icon("chevron", state.zoneMenuOpen ? "zone-picker__chevron is-open" : "zone-picker__chevron")}
    </button>
    ${state.zoneMenuOpen ? `<div class="zone-picker__menu" role="listbox" aria-labelledby="zone-picker-label">${state.zones.map((entry) => `<button class="zone-picker__option ${entry.id === zone?.id ? "is-selected" : ""}" type="button" role="option" aria-selected="${entry.id === zone?.id}" data-action="choose-dashboard-zone" data-zone="${escapeHtml(entry.id)}"><span class="zone-picker__option-mark">${icon("leaf")}</span><span><strong>${escapeHtml(entry.crop)}</strong><small>${escapeHtml(entry.soil_type)} soil</small></span>${entry.id === zone?.id ? icon("check", "zone-picker__check") : ""}</button>`).join("") || '<p class="zone-picker__empty">No crop and soil pairings are available.</p>'}</div>` : ""}
  </div></div>`;
}

function renderSummaryCard(title: string, value: string, unit: string, detail: string): string {
  return `<article class="panel analytics-summary-card"><span class="eyebrow">${escapeHtml(title)}</span><strong>${escapeHtml(value)}<small>${escapeHtml(unit)}</small></strong><span>${escapeHtml(detail)}</span></article>`;
}

function renderAnalytics(): string {
  const zone = selectedZone();
  const readings = state.historyReadings;
  const moisture = rangeAverages(readings, "moisture");
  const ph = rangeAverages(readings, "soil_ph");
  const ppfd = rangeAverages(readings, "light_ppfd");
  const lux = rangeAverages(readings, "light_lux");
  const moisturePh = renderRelationshipChart(readings, {
    title: "Moisture vs soil pH",
    xKey: "moisture",
    xLabel: "Soil moisture",
    xUnit: "%",
    yKey: "soil_ph",
    yLabel: "Soil pH",
    yUnit: " pH",
  });
  const latest = zone?.reading;
  const origin = latest?.data_source ?? "no current reading";
  const historySources = Array.from(new Set(readings.map((reading) => reading.data_source))).join(" + ") || "no stored readings";
  return `<div class="dashboard-heading analytics-heading"><div><p class="eyebrow">Field record · ${escapeHtml(state.range)} · ${escapeHtml(historySources)}</p><h1>Analytics</h1><p class="page-intro">Sensor averages and relationships for the selected crop and soil pairing. Readings are labeled by their data source.</p></div><div class="analytics-controls">${renderRangePicker("Analytics time range")}${renderZonePicker(zone)}</div></div>
    <div class="analytics-summary-grid">
      ${renderSummaryCard("Soil moisture", latest ? latest.moisture.toFixed(1) : "—", latest ? "%" : "", `Latest · ${origin}`)}
      ${renderSummaryCard("Soil pH", latest?.soil_ph == null ? "—" : latest.soil_ph.toFixed(2), "", `Latest · ${origin}`)}
      ${renderSummaryCard("Light intensity", latest?.light_ppfd == null ? "—" : latest.light_ppfd.toFixed(1), latest?.light_ppfd == null ? "" : " µmol/m²/s", `PPFD · ${latest?.light_lux == null ? "—" : `${latest.light_lux.toFixed(0)} lux`} · ${origin}`)}
    </div>
    <div class="analytics-chart-grid">
      ${renderSeriesPanel("Soil moisture", moisture, "%", "primary", { area: true, domain: [0, 100], target: zone ? [zone.moisture_target_min_percent, zone.moisture_target_max_percent] : undefined })}
      ${renderSeriesPanel("Soil pH", ph, " pH", "warning", { decimals: 2 })}
      ${renderSeriesPanel("Light intensity · PPFD", ppfd, " µmol/m²/s", "info", { area: true })}
      ${renderSeriesPanel("Light intensity · lux", lux, " lux", "primary", { decimals: 0 })}
      ${renderHistogram("Soil moisture", moisture, "%", "primary")}
      ${moisturePh}
      ${renderRelationshipChart(readings, { title: "Moisture, pH & light", xKey: "moisture", xLabel: "Soil moisture", xUnit: "%", yKey: "soil_ph", yLabel: "Soil pH", yUnit: " pH", sizeKey: "light_ppfd", sizeLabel: "Light intensity · PPFD", sizeUnit: " µmol/m²/s", bubble: true })}
      ${renderPhPie(readings)}
    </div>`;
}

function renderWeather(): string {
  const weather = state.weather;
  const current = weather?.current;
  const unit = (key: string) => weather?.units.current[key] ?? "";
  const value = (key: string, digits = 1) => formatWeatherValue(current?.[key], digits);
  const locationName = weather?.location.name ?? "Selected Cairo area";
  const header = `<div class="dashboard-heading weather-heading"><div><p class="eyebrow">Live conditions · Open-Meteo</p><h1>Weather</h1><p class="page-intro">Current outdoor weather for the selected farm area, independent of greenhouse sensor readings.</p></div>${renderWeatherLocationPicker()}</div>`;
  if (state.weatherLoading) {
    return `${header}<section class="weather-loading-grid" role="status" aria-label="Loading weather forecast">
      <div class="panel weather-skeleton weather-skeleton--current"><span></span><span></span><span></span><span></span></div>
      <div class="panel weather-skeleton"><span></span><span></span><span></span></div>
      <div class="panel weather-skeleton"><span></span><span></span><span></span></div>
      <div class="panel weather-skeleton weather-skeleton--daily"><span></span><span></span><span></span></div>
    </section>`;
  }
  if (state.weatherError) return `${header}${renderWeatherError()}`;

  const currentContent = weather && current
    ? `<section class="panel current-weather-card">
            <div class="current-weather-card__headline">
              <div><p class="eyebrow">${escapeHtml(locationName)} · ${escapeHtml(weather.location.timezone ?? "local time")}</p><h2>${escapeHtml(weatherCodeDescription(current.weather_code))}</h2><p>${escapeHtml(formatWeatherTimestamp(current.time, weather.location.timezone, true))}</p></div>
              <strong class="current-weather-card__temperature">${escapeHtml(value("temperature_2m"))}<small>${escapeHtml(unit("temperature_2m"))}</small></strong>
            </div>
            <div class="weather-metric-grid">
              ${renderWeatherMetric("Feels like", value("apparent_temperature"), unit("apparent_temperature"), "thermometer")}
              ${renderWeatherMetric("Humidity", value("relative_humidity_2m", 0), unit("relative_humidity_2m"), "humidity")}
              ${renderWeatherMetric("Wind speed", value("wind_speed_10m"), unit("wind_speed_10m"), "forecast")}
              ${renderWeatherMetric("Wind direction", value("wind_direction_10m", 0), unit("wind_direction_10m"), "forecast")}
              ${renderWeatherMetric("Cloud cover", value("cloud_cover", 0), unit("cloud_cover"), "weather")}
              ${renderWeatherMetric("Pressure", value("pressure_msl"), unit("pressure_msl"), "analytics")}
            </div>
          </section>`
        : '<div class="panel weather-state">Current weather is not available for this location.</div>';
  const hourlyCharts = weather ? renderWeatherHourlyCharts(weather) : "";
  const dailyForecast = weather ? renderWeatherDailyForecast(weather) : "";
  return `${header}
    ${currentContent}
    ${hourlyCharts}
    ${dailyForecast}
    ${weather ? `<p class="weather-attribution">${escapeHtml(weather.attribution)} · Updated ${escapeHtml(formatWeatherTimestamp(weather.retrieved_at, "UTC", true))}</p>` : ""}`;
}

function formatWeatherValue(value: unknown, digits = 1): string {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(digits) : "—";
}

function weatherCodeDescription(value: unknown): string {
  if (typeof value !== "number") return "Current conditions";
  if (value === 0) return "Clear sky";
  if (value === 1) return "Mainly clear";
  if (value === 2) return "Partly cloudy";
  if (value === 3) return "Overcast";
  if ([45, 48].includes(value)) return "Fog";
  if ([51, 53, 55, 56, 57].includes(value)) return "Drizzle";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(value)) return "Rain";
  if ([71, 73, 75, 77, 85, 86].includes(value)) return "Snow";
  if ([95, 96, 99].includes(value)) return "Thunderstorm";
  return "Variable conditions";
}

function formatWeatherTimestamp(value: unknown, timeZone?: string, includeDate = false): string {
  if (typeof value !== "string") return "—";
  const includesOffset = /[zZ]|[+-]\d{2}:\d{2}$/.test(value);
  const timestamp = new Date(includesOffset ? value : `${value}Z`);
  if (Number.isNaN(timestamp.getTime())) return value;
  try {
    return new Intl.DateTimeFormat(state.locale === "ar" ? "ar" : "en", {
      ...(includeDate ? { dateStyle: "medium" as const } : {}),
      timeStyle: "short",
      timeZone: includesOffset ? timeZone ?? "UTC" : "UTC",
    }).format(timestamp);
  } catch {
    return value;
  }
}

function formatWeatherDate(value: unknown): string {
  if (typeof value !== "string") return "—";
  const date = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  try {
    return new Intl.DateTimeFormat(state.locale === "ar" ? "ar" : "en", {
      weekday: "short",
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    }).format(date);
  } catch {
    return value;
  }
}

function renderWeatherMetric(label: string, value: string, unit: string, iconName: string): string {
  return `<article class="weather-metric"><span class="weather-metric__icon">${icon(iconName)}</span><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}<small>${escapeHtml(unit)}</small></strong></article>`;
}

function renderWeatherLocationPicker(): string {
  const selectedLocation = state.weatherLocations.find((location) => location.id === state.selectedWeatherLocationId);
  const selectedName = selectedLocation?.name ?? state.weather?.location.name ?? "Selected Cairo area";
  const options = state.weatherLocations.map((location) =>
    `<button class="language-option weather-location-option ${location.id === state.selectedWeatherLocationId ? "is-selected" : ""}" type="button" role="option" aria-selected="${location.id === state.selectedWeatherLocationId}" data-action="select-weather-location" data-location="${escapeHtml(location.id)}">${escapeHtml(location.name)}</button>`,
  ).join("");
  const isArabic = state.locale === "ar";
  return `<div class="weather-location-picker language-picker">
    <span>Weather location</span>
    <button class="language-trigger weather-location-trigger" type="button" data-action="toggle-weather-location-menu" aria-haspopup="listbox" aria-expanded="${state.weatherLocationMenuOpen}" aria-controls="weather-location-options" aria-label="${isArabic ? "موقع الطقس" : "Weather location"}" ${state.weatherLoading || !options ? "disabled" : ""}>
      <span>${escapeHtml(selectedName)}</span>${icon("chevronDown", "language-chevron")}
    </button>
    ${state.weatherLocationMenuOpen ? `<div class="language-menu weather-location-menu" id="weather-location-options" role="listbox" aria-label="${isArabic ? "موقع الطقس" : "Weather location"}">${options}</div>` : ""}
  </div>`;
}

function renderWeatherError(): string {
  return `<div class="panel weather-state weather-state--error" role="alert"><div><strong>Weather data is unavailable.</strong><p>${escapeHtml(state.weatherError)}</p></div><button class="button button--primary" type="button" data-action="retry-weather">Retry</button></div>`;
}

function renderUserRolePicker(): string {
  const options = [
    { value: "operator", label: "Operator" },
    { value: "admin", label: "Administrator" },
  ] as const;
  const selected = options.find((option) => option.value === state.newUserRole) ?? options[0];
  return `<div class="user-role-picker">
    <input type="hidden" name="role" value="${selected.value}" />
    <button class="user-role-trigger" type="button" data-action="toggle-user-role-menu" aria-haspopup="listbox" aria-expanded="${state.userRoleMenuOpen}" aria-controls="new-user-role-options" aria-label="Role">
      <span>${selected.label}</span>${icon("chevronDown", "user-role-chevron")}
    </button>
    ${state.userRoleMenuOpen ? `<div class="user-role-menu" id="new-user-role-options" role="listbox" aria-label="Choose user role">${options.map((option) => `<button class="user-role-option ${option.value === selected.value ? "is-selected" : ""}" type="button" role="option" aria-selected="${option.value === selected.value}" data-action="select-user-role" data-role="${option.value}">${option.label}</button>`).join("")}</div>` : ""}
  </div>`;
}

function updateUserRolePicker(): void {
  const picker = document.querySelector<HTMLElement>(".user-role-picker");
  if (picker) picker.innerHTML = renderUserRolePicker();
}

function weatherSeriesValue(series: ApiWeather["hourly"] | ApiWeather["daily"], key: string, index: number): string | number | null {
  const values = series[key];
  return Array.isArray(values) ? values[index] ?? null : null;
}

function renderWeatherHourlyCharts(weather: ApiWeather): string {
  const times = weather.hourly.time ?? [];
  const series = (key: string) => times.map((time, index) => ({
    timestamp: time,
    value: weatherSeriesValue(weather.hourly, key, index),
  }));
  return `<section class="forecast-section weather-hourly-section">
    <div class="panel__header"><div><p class="eyebrow">Next 24 hours</p><h2>Hourly forecast</h2></div></div>
    <div class="analytics-chart-grid weather-chart-grid">
      ${renderWeatherChart("Air temperature", series("temperature_2m"), weather.units.hourly.temperature_2m ?? "", "primary", "max")}
      ${renderWeatherChart("Humidity", series("relative_humidity_2m"), weather.units.hourly.relative_humidity_2m ?? "%", "info", "average")}
      ${renderWeatherChart("Light intensity · solar radiation", series("shortwave_radiation"), weather.units.hourly.shortwave_radiation ?? "W/m²", "info", "average")}
      ${renderWeatherChart("Air pressure", series("pressure_msl"), weather.units.hourly.pressure_msl ?? "hPa", "primary", "average")}
    </div>
  </section>`;
}

function renderWeatherChart(
  title: string,
  values: Array<{ timestamp: string | number | null; value: string | number | null }>,
  unit: string,
  color: "primary" | "info",
  summary: "max" | "average",
): string {
  const width = 760;
  const height = 250;
  const left = 58;
  const right = width - 18;
  const top = 18;
  const bottom = 202;
  const points = values.flatMap((point, index) =>
    typeof point.timestamp === "string" && typeof point.value === "number" && Number.isFinite(point.value)
      ? [{ timestamp: point.timestamp, value: point.value, index }]
      : [],
  );
  const numericValues = points.map(({ value }) => value);
  const dataMinimum = numericValues.length ? Math.min(...numericValues) : 0;
  const dataMaximum = numericValues.length ? Math.max(...numericValues) : 0;
  const padding = dataMinimum === dataMaximum
    ? Math.max(Math.abs(dataMaximum) * 0.08, 1)
    : (dataMaximum - dataMinimum) * 0.12;
  const unitLabel = unit ? ` ${unit}` : "";
  const summaryValue = numericValues.length
    ? summary === "max"
      ? `${dataMaximum.toFixed(1)}${unitLabel}`
      : `${(numericValues.reduce((total, value) => total + value, 0) / numericValues.length).toFixed(0)}${unitLabel}`
    : "—";
  const summaryLabel = summary === "max" ? "Max" : "Avg";
  const header = `<div class="panel__header"><div><p class="eyebrow">Next 24h</p><h2>${escapeHtml(title)}</h2></div><div class="analytics-chart-summary"><strong>${escapeHtml(summaryValue)}</strong><span>${summaryLabel}</span></div></div>`;
  if (!points.length) {
    return `<section class="panel analytics-chart-panel weather-chart-panel">${header}<div class="chart-empty">${escapeHtml(title)} data is unavailable.</div></section>`;
  }

  const minimum = dataMinimum - padding;
  const maximum = dataMaximum + padding;
  const positionY = (value: number) => bottom - ((value - minimum) / Math.max(maximum - minimum, 1)) * (bottom - top);
  const coords = points.map((point) => ({
    ...point,
    x: left + (point.index / Math.max(values.length - 1, 1)) * (right - left),
    y: positionY(point.value),
  }));
  const grid = Array.from({ length: 4 }, (_, index) => {
    const value = maximum - ((maximum - minimum) * index) / 3;
    const y = top + ((bottom - top) * index) / 3;
    return `<line class="analytics-gridline" x1="${left}" y1="${y}" x2="${right}" y2="${y}"/><text class="analytics-axis-label" x="${left - 8}" y="${y + 4}" text-anchor="end">${value.toFixed(1)}</text>`;
  }).join("");
  const axisLabels = `<text class="analytics-axis-label" x="${left}" y="230">${escapeHtml(formatWeatherTimestamp(points[0].timestamp, weatherLocationTimezone()))}</text><text class="analytics-axis-label" x="${right}" y="230" text-anchor="end">${escapeHtml(formatWeatherTimestamp(points.at(-1)?.timestamp, weatherLocationTimezone()))}</text>`;
  const marks = renderWeatherLineMarks(coords, title, unitLabel, color, left, bottom);
  return `<section class="panel analytics-chart-panel weather-chart-panel">${header}
    <svg class="analytics-plot weather-chart-plot" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="${escapeHtml(title)} for the next 24 hours">
      ${grid}<line class="weather-chart-cursor" x1="${left}" y1="${top}" x2="${left}" y2="${bottom}"/>
      ${marks}
      ${axisLabels}
    </svg>
    <div class="chart-tooltip" aria-hidden="true"></div>
  </section>`;
}

function weatherLocationTimezone(): string | undefined {
  return state.weather?.location.timezone;
}

function renderWeatherLineMarks(
  coords: Array<{ timestamp: string; value: number; index: number; x: number; y: number }>,
  title: string,
  unit: string,
  color: "primary" | "info",
  left: number,
  bottom: number,
): string {
  const segments: typeof coords[] = [];
  for (const point of coords) {
    const currentSegment = segments.at(-1);
    if (!currentSegment || point.index !== currentSegment.at(-1)!.index + 1) segments.push([point]);
    else currentSegment.push(point);
  }
  const linePaths = segments.map((segment) => segment.slice(1).reduce((path, point, index) => {
    const previous = segment[index];
    const midpoint = (previous.x + point.x) / 2;
    return `${path} Q ${midpoint.toFixed(1)} ${previous.y.toFixed(1)} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`;
  }, `M ${segment[0].x.toFixed(1)} ${segment[0].y.toFixed(1)}`));
  const linePath = linePaths.join(" ");
  const areaPath = segments.filter((segment) => segment.length > 1).map((segment) =>
    `${linePaths[segments.indexOf(segment)]} L ${segment.at(-1)!.x.toFixed(1)} ${bottom} L ${segment[0].x.toFixed(1)} ${bottom} Z`,
  ).join(" ");
  const marks = coords.map((point) => {
    const titleText = formatWeatherTimestamp(point.timestamp, weatherLocationTimezone(), true);
    return `<circle class="analytics-hit-point analytics-hit-point--${color} weather-chart-mark" cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="12" tabindex="0" role="img" aria-label="${escapeHtml(`${titleText}, ${title}: ${point.value.toFixed(1)}${unit}`)}" data-weather-x="${point.x.toFixed(1)}" ${chartTip(titleText, [`${title}: ${point.value.toFixed(1)}${unit}`])}/>`;
  }).join("");
  return `${areaPath ? `<path class="analytics-area analytics-area--${color}" d="${areaPath}"/>` : ""}<path class="analytics-line analytics-line--${color}" d="${linePath}"/><circle class="analytics-point analytics-point--${color}" cx="${coords.at(-1)?.x ?? left}" cy="${coords.at(-1)?.y ?? bottom}" r="4"/>${marks}`;
}

function renderWeatherDailyForecast(weather: ApiWeather): string {
  const dailyTimes = weather.daily.time ?? [];
  const daily = dailyTimes.map((date, index) => {
    const code = weatherSeriesValue(weather.daily, "weather_code", index);
    const high = weatherSeriesValue(weather.daily, "temperature_2m_max", index);
    const low = weatherSeriesValue(weather.daily, "temperature_2m_min", index);
    const rain = weatherSeriesValue(weather.daily, "precipitation_sum", index);
    const chance = weatherSeriesValue(weather.daily, "precipitation_probability_max", index);
    const wind = weatherSeriesValue(weather.daily, "wind_speed_10m_max", index);
    const sunrise = weatherSeriesValue(weather.daily, "sunrise", index);
    const sunset = weatherSeriesValue(weather.daily, "sunset", index);
    return `<article class="forecast-day-card"><time>${escapeHtml(formatWeatherDate(date))}</time><span>${escapeHtml(weatherCodeDescription(code))}</span><strong>${escapeHtml(formatWeatherValue(high))}<small>${escapeHtml(weather.units.daily.temperature_2m_max ?? "")}</small><span class="forecast-day-card__low">${escapeHtml(formatWeatherValue(low))}${escapeHtml(weather.units.daily.temperature_2m_min ?? "")}</span></strong><dl><div><dt>Precipitation</dt><dd>${escapeHtml(formatWeatherValue(rain))} ${escapeHtml(weather.units.daily.precipitation_sum ?? "")}</dd></div><div><dt>Rain chance</dt><dd>${escapeHtml(formatWeatherValue(chance, 0))}${escapeHtml(weather.units.daily.precipitation_probability_max ?? "")}</dd></div><div><dt>Wind max</dt><dd>${escapeHtml(formatWeatherValue(wind))} ${escapeHtml(weather.units.daily.wind_speed_10m_max ?? "")}</dd></div><div><dt>Sunrise / sunset</dt><dd>${escapeHtml(formatWeatherTimestamp(sunrise, weather.location.timezone))} / ${escapeHtml(formatWeatherTimestamp(sunset, weather.location.timezone))}</dd></div></dl></article>`;
  }).join("");
  return `<section class="forecast-section"><div class="panel__header"><div><p class="eyebrow">Next 7 days</p><h2>Daily forecast</h2></div></div><div class="forecast-day-grid">${daily || '<p class="weather-state">Daily forecast data is unavailable.</p>'}</div></section>`;
}

function renderChart(): string {
  const zone = selectedZone();
  if (!zone || state.readings.length === 0) {
    return `<div class="chart-empty">No sensor readings are available for this time range.</div>`;
  }

  const width = 760;
  const height = 260;
  const left = 58;
  const right = width - 18;
  const top = 18;
  const bottom = 204;
  const sample = sampleEvenly(state.readings.map((reading, index) => ({ reading, index })), 180);
  const coords = sample.map(({ reading, index }) => ({
    reading,
    x: left + (index / Math.max(state.readings.length - 1, 1)) * (right - left),
    y: bottom - (reading.moisture / 100) * (bottom - top),
  }));
  const linePath = coords.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L ${right},${bottom} L ${left},${bottom} Z`;
  const targetTop = bottom - (zone.moisture_target_max_percent / 100) * (bottom - top);
  const targetBottom = bottom - (zone.moisture_target_min_percent / 100) * (bottom - top);
  const startLabel = state.readings[0].timestamp;
  const endLabel = state.readings[state.readings.length - 1].timestamp;
  const markers = coords.map(({ reading, x, y }) => {
    return `<circle class="analytics-hit-point analytics-hit-point--primary" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="8" ${chartTip(`${formatRangePoint(reading.timestamp)} · ${state.range === "24 hours" ? formatTime(reading.timestamp) : ""}`, [`X · Time: ${formatDate(reading.timestamp)} ${formatTime(reading.timestamp)}`, `Y · Soil moisture: ${reading.moisture.toFixed(1)}%`])}/>`;
  }).join("");
  const grid = [0, 25, 50, 75, 100].map((value) => {
    const y = bottom - (value / 100) * (bottom - top);
    return `<line class="analytics-gridline" x1="${left}" y1="${y}" x2="${right}" y2="${y}"/><text class="analytics-axis-label" x="${left - 10}" y="${y + 4}" text-anchor="end">${value}</text>`;
  }).join("");

  return `<div class="chart-frame moisture-chart">
    <svg class="analytics-plot moisture-plot" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="Soil moisture trend for ${escapeHtml(zone.name)} over the last ${escapeHtml(state.range)}">
      ${grid}
      <rect x="${left}" y="${targetTop}" width="${right - left}" height="${targetBottom - targetTop}" class="chart-target-band"/>
      <path d="${areaPath}" class="moisture-area"/>
      <path d="${linePath}" class="chart-line"/>
      <circle cx="${coords.at(-1)?.x ?? left}" cy="${coords.at(-1)?.y ?? bottom}" r="5" class="chart-dot"/>
      ${markers}
      <text class="analytics-axis-label" x="${left}" y="232">${escapeHtml(formatRangePoint(startLabel))}</text>
      <text class="analytics-axis-label" x="${right}" y="232" text-anchor="end">${escapeHtml(formatRangePoint(endLabel))}</text>
    </svg>
    <div class="chart-tooltip" aria-hidden="true"></div>
  </div>
  <div class="chart-legend"><span><i class="legend-dot legend-dot--primary"></i>Soil moisture</span><span><i class="legend-dot legend-dot--target"></i>Target band · ${zone.moisture_target_min_percent}–${zone.moisture_target_max_percent}%</span><span>${state.readings.length} readings · ${escapeHtml(state.range)}</span></div>`;
}

function renderMetric(label: string, value: string, unit: string, detail: string, iconName: string): string {
  return `<article class="metric-card"><div class="metric-card__top"><span class="metric-icon">${icon(iconName)}</span><span class="metric-card__label">${escapeHtml(label)}</span></div><p class="metric-card__value">${escapeHtml(value)}<span class="metric-card__unit">${escapeHtml(unit)}</span></p><p class="metric-detail">${escapeHtml(detail)}</p></article>`;
}

function renderZoneRow(zone: ApiZone): string {
  const status = zoneStatus(zone);
  const reading = zone.reading;
  const moisture = reading ? `${reading.moisture}%` : "—";
  const climate = reading ? `${reading.temp.toFixed(1)}°C · ${reading.humidity}% RH` : "Waiting for first reading";
  return `<button class="zone-row ${state.selectedZoneId === zone.id ? "is-selected" : ""}" type="button" data-action="select-zone" data-zone="${escapeHtml(zone.id)}" aria-pressed="${state.selectedZoneId === zone.id}">
    <span class="zone-symbol">${icon("leaf")}</span>
    <span class="zone-info"><strong>${escapeHtml(zone.name)}</strong><small>${escapeHtml(zone.crop)} · ${escapeHtml(climate)}</small></span>
    <span class="zone-moisture"><strong>${escapeHtml(moisture)}</strong><small>soil moisture</small></span>
    <span class="status status--${status.tone}">${escapeHtml(status.label)}</span>${icon("chevron", "zone-chevron")}
  </button>`;
}

function renderScheduleEntry(entry: ApiScheduleEntry): string {
  return `<div class="schedule-item"><div class="schedule-time"><strong>${formatTime(entry.start_at)}</strong></div><div class="schedule-copy"><strong>${escapeHtml(entry.zone_name)}</strong><span>${escapeHtml(entry.method)} · ${entry.duration_minutes} min</span></div><span class="status status--${entry.status === "running" ? "success" : "info"}">${escapeHtml(entry.status === "running" ? "Watering" : new Date(entry.start_at).toLocaleDateString(localeTag()) === new Date().toLocaleDateString(localeTag()) ? "Today" : "Upcoming")}</span></div>`;
}

function renderOverview(): string {
  const zone = selectedZone();
  const reading = zone?.reading;
  const recommendation = zone ? recommendationFor(zone.id) : undefined;
  const activeNodes = state.zones.filter((entry) => entry.node.online).length;
  const valveOn = zone?.valve.state === "on";
  const alertCount = state.alerts.filter((alert) => alert.severity !== "info").length;
  const upcomingSchedule = state.schedule.slice(0, 3);

  return `<div class="dashboard-heading">
    <div><p class="eyebrow">${new Intl.DateTimeFormat(localeTag(), { weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(new Date())}</p><h1>Good ${new Date().getHours() < 12 ? "morning" : new Date().getHours() < 18 ? "afternoon" : "evening"}, ${escapeHtml(state.user?.name.split(" ")[0] ?? "grower")}</h1><p class="page-intro">Current readings and recommendations from your garden.</p></div>
    <div class="cluster dashboard-actions">${state.mockHardwareEnabled ? `<button type="button" class="button button--secondary" data-action="simulate" ${state.busy ? "disabled" : ""}>${icon("simulate")}<span>Simulate sensor update</span></button>` : ""}<button type="button" class="button button--primary" data-action="toggle-valve" data-zone="${escapeHtml(zone?.id ?? "")}" ${!zone || state.busy ? "disabled" : ""}>${icon("irrigation")}<span>${valveOn ? "Turn valve off" : "Turn valve on"}</span></button>${zone?.valve.mode === "manual" ? `<button type="button" class="button button--quiet" data-action="restore-auto" data-zone="${escapeHtml(zone.id)}" ${state.busy ? "disabled" : ""}>Return to automatic</button>` : ""}</div>
  </div>
  <section class="metric-grid" aria-label="Greenhouse summary">
    ${renderMetric("Connected nodes", `${activeNodes}/${state.zones.length}`, "", activeNodes === state.zones.length ? "All reporting within 5 minutes" : "One or more nodes need checking", "zones")}
    ${renderMetric("Soil moisture", reading ? String(reading.moisture) : "—", reading ? "%" : "", zone ? `${zone.name} · ${zone.valve.mode} mode` : "No zones configured", "irrigation")}
    ${renderMetric("Temperature · humidity", reading ? `${reading.temp.toFixed(1)}°` : "—", reading ? `C · ${reading.humidity}% RH` : "", reading ? `Battery ${zone?.node.battery_mv ?? "—"} mV` : "Waiting for sensor readings", "thermometer")}
    ${renderMetric("Light intensity", reading?.light_ppfd === null || reading?.light_ppfd === undefined ? "—" : reading.light_ppfd.toFixed(1), reading?.light_ppfd == null ? "" : "µmol/m²/s", reading?.light_lux == null ? "PPFD · Lux unavailable" : `${reading.light_lux.toFixed(0)} lux · ${reading.data_source} data`, "trends")}
    ${renderMetric("CO₂ concentration", reading?.co2_ppm == null ? "—" : reading.co2_ppm.toFixed(0), reading?.co2_ppm == null ? "" : "ppm", reading ? `${reading.data_source} sensor sample` : "Waiting for sensor readings", "humidity")}
    ${renderMetric("Soil pH", reading?.soil_ph == null ? "—" : reading.soil_ph.toFixed(2), reading?.soil_ph == null ? "" : "pH", reading ? `${reading.data_source} sensor sample` : "Waiting for sensor readings", "droplet")}
  </section>
  <div class="dashboard-content-grid">
    <section class="panel trend-panel">
      <div class="panel__header trend-panel__header">
        <div><p class="eyebrow">Live growing conditions</p><h2>Soil moisture</h2><p class="panel-subtitle">${escapeHtml(zone?.name ?? "No selected zone")} · ${escapeHtml(zone?.node.id ?? "No node assigned")}</p></div>
        ${renderRangePicker("Overview chart time range")}
      </div>
      <div class="chart-summary"><span class="chart-current">${reading ? reading.moisture : "—"}<small>${reading ? "%" : ""}</small></span><span class="chart-change">${icon(recommendation?.action === "irrigate" ? "alerts" : "check")} ${recommendation?.action === "irrigate" ? "Irrigation recommended" : recommendation?.action === "hold" ? "Decision on hold" : "Moisture in range"}</span></div>
      ${renderChart()}
      ${recommendation ? `<div class="recommendation-note"><span class="status status--${recommendation.action === "irrigate" ? "warning" : recommendation.action === "hold" ? "info" : "success"}">${recommendation.action === "irrigate" ? "Water recommended" : recommendation.action === "hold" ? "On hold" : "No watering needed"}</span><p>${escapeHtml(recommendation.reason)}</p><small>Interim model · ${escapeHtml(zone?.crop ?? "")} · ${escapeHtml(zone?.growth_stage ?? "")}</small></div>` : ""}
    </section>
    <section class="panel zones-panel">
      <div class="panel__header"><div><p class="eyebrow">Your growing spaces</p><h2>Garden zones</h2></div><button type="button" class="text-button" data-action="navigate" data-view="Zones">View all ${icon("chevron")}</button></div>
      <div class="zone-list">${state.zones.slice(0, 4).map(renderZoneRow).join("")}</div>
      <div class="panel-footer"><span class="connection-dot"></span>${activeNodes} of ${state.zones.length} nodes recently reported · data is mock until devices connect</div>
    </section>
  </div>
  <div class="dashboard-content-grid dashboard-content-grid--lower">
    <section class="panel schedule-panel">
      <div class="panel__header"><div><p class="eyebrow">Next planned cycles</p><h2>Irrigation schedule</h2></div><button class="icon-button" type="button" aria-label="Open irrigation schedule" data-action="navigate" data-view="Irrigation">${icon("arrow")}</button></div>
      ${upcomingSchedule.length ? upcomingSchedule.map(renderScheduleEntry).join("") : '<p class="empty-copy">No watering cycles are scheduled.</p>'}
    </section>
    <section class="panel attention-panel">
      <div class="panel__header"><div><p class="eyebrow">Reasoned notifications</p><h2>Needs attention</h2></div><span class="status status--${alertCount ? "warning" : "success"}">${alertCount} open</span></div>
      ${state.alerts.slice(0, 2).map((alert) => `<div class="attention-item">${icon(alert.type === "sensor_offline" ? "zones" : "alerts")}<div><strong>${escapeHtml(alert.title)}</strong><p>${escapeHtml(alert.reason)}</p></div></div>`).join("") || '<p class="empty-copy">No alerts. Every zone is within its configured limits.</p>'}
      <button type="button" class="text-button attention-link" data-action="navigate" data-view="Alerts">See all alerts ${icon("chevron")}</button>
    </section>
  </div>`;
}

function renderZones(): string {
  return `<div class="dashboard-heading"><div><p class="eyebrow">${state.zones.length} configured areas</p><h1>Your garden zones</h1><p class="page-intro">Live sensor conditions, node status, and the current valve mode for each zone.</p></div></div>
  <div class="zone-cards">${state.zones.map((zone) => {
    const status = zoneStatus(zone);
    const reading = zone.reading;
    const recommendation = recommendationFor(zone.id);
    return `<article class="zone-card">
      <div class="zone-card__top"><span class="zone-symbol">${icon("leaf")}</span><span class="status status--${status.tone}">${escapeHtml(status.label)}</span></div>
      <p class="eyebrow">${escapeHtml(zone.crop)} · ${escapeHtml(zone.growth_stage)} stage</p><h2>${escapeHtml(zone.name)}</h2>
      <div class="zone-card__metrics" aria-label="Latest sensor measurements">
        <div><span>Soil moisture</span><strong>${reading ? reading.moisture : "—"}<small>${reading ? "%" : ""}</small></strong></div>
        <div><span>Temperature</span><strong>${reading ? reading.temp.toFixed(1) : "—"}<small>${reading ? "°C" : ""}</small></strong></div>
        <div><span>Humidity</span><strong>${reading ? reading.humidity : "—"}<small>${reading ? "%" : ""}</small></strong></div>
        <div><span>Light</span><strong>${reading?.light_lux == null ? "—" : reading.light_lux.toFixed(0)}<small>${reading?.light_lux == null ? "" : " lux"}</small></strong></div>
        <div><span>PPFD</span><strong>${reading?.light_ppfd == null ? "—" : reading.light_ppfd.toFixed(1)}<small>${reading?.light_ppfd == null ? "" : " µmol/m²/s"}</small></strong></div>
        <div><span>Battery</span><strong>${reading?.battery_mv ?? zone.node.battery_mv ?? "—"}<small>${reading ? " mV" : ""}</small></strong></div>
        <div><span>CO₂</span><strong>${reading?.co2_ppm == null ? "—" : reading.co2_ppm.toFixed(0)}<small>${reading?.co2_ppm == null ? "" : " ppm"}</small></strong></div>
        <div><span>Soil pH</span><strong>${reading?.soil_ph == null ? "—" : reading.soil_ph.toFixed(2)}<small>${reading?.soil_ph == null ? "" : " pH"}</small></strong></div>
      </div>
      <p class="settings-note">${reading ? `${reading.data_source} reading · ${formatTime(reading.timestamp)}` : "Waiting for sensor measurements"}</p>
      <div class="moisture-track"><span style="width:${reading ? Math.max(0, Math.min(reading.moisture, 100)) : 0}%"></span></div>
      <p class="zone-card__footer">${icon("zones")} Node ${escapeHtml(zone.node.id)} · ${zone.node.online ? `online · ${zone.node.battery_mv} mV` : "offline"} · ${zone.node.last_seen_at ? `last seen ${formatTime(zone.node.last_seen_at)}` : "never reported"}</p>
      <div class="zone-card__valve"><span>Valve <strong>${escapeHtml(zone.valve.state)}</strong> · ${escapeHtml(zone.valve.mode)} mode</span><span class="status status--${zone.valve.mode === "manual" ? "warning" : "info"}">${zone.valve.mode === "manual" ? "Manual override" : "Automatic"}</span></div>
      ${recommendation ? `<p class="zone-reason">${escapeHtml(recommendation.reason)}</p>` : ""}
      <div class="zone-card__actions"><button type="button" class="button button--secondary button--small" data-action="select-zone" data-zone="${escapeHtml(zone.id)}">View trend</button><button type="button" class="button button--primary button--small" data-action="toggle-valve" data-zone="${escapeHtml(zone.id)}" ${state.busy ? "disabled" : ""}>Turn ${zone.valve.state === "on" ? "off" : "on"}</button>${zone.valve.mode === "manual" ? `<button type="button" class="button button--quiet button--small" data-action="restore-auto" data-zone="${escapeHtml(zone.id)}" ${state.busy ? "disabled" : ""}>Automatic</button>` : ""}</div>
    </article>`;
  }).join("") || '<div class="panel empty-copy">No garden zones have been configured.</div>'}</div>`;
}

function renderIrrigation(): string {
  const scheduledEntries = state.schedule;
  const estimatedDemand = scheduledEntries.reduce((total, entry) => total + entry.duration_minutes, 0);
  return `<div class="dashboard-heading"><div><p class="eyebrow">Water management · mock schedule</p><h1>Irrigation schedule</h1><p class="page-intro">Manage valve overrides and review the configured watering cycles.</p></div></div>
  <div class="irrigation-stats"><article class="panel"><span class="eyebrow">Connected valves</span><strong class="stat-large">${state.zones.length}</strong><p>One independently controlled valve per zone</p></article><article class="panel"><span class="eyebrow">Next scheduled cycle</span><strong class="stat-large">${scheduledEntries[0] ? escapeHtml(formatTime(scheduledEntries[0].start_at)) : "—"}</strong><p>${escapeHtml(scheduledEntries[0]?.zone_name ?? "No upcoming cycles")}</p></article><article class="panel"><span class="eyebrow">Scheduled run time</span><strong class="stat-large">${estimatedDemand} <small>min</small></strong><p>Sum of the configured daily cycle durations</p></article></div>
  <section class="panel irrigation-schedule"><div class="panel__header"><div><p class="eyebrow">Configured cycles</p><h2>Upcoming irrigation</h2></div></div>${scheduledEntries.map((entry) => `<div class="irrigation-row"><div class="irrigation-time">${icon("clock")}<strong>${escapeHtml(formatTime(entry.start_at))}</strong></div><div class="schedule-copy"><strong>${escapeHtml(entry.zone_name)}</strong><span>${escapeHtml(entry.method)} · ${entry.duration_minutes} minutes</span></div><span class="status status--${entry.status === "running" ? "success" : "info"}">${escapeHtml(entry.status)}</span></div>`).join("") || '<p class="empty-copy">No watering cycles are scheduled.</p>'}</section>
  <section class="panel valve-controls"><div class="panel__header"><div><p class="eyebrow">C4 · Manual always wins</p><h2>Valve control</h2><p class="panel-subtitle">A manual command stays in force until you return that zone to automatic mode.</p></div></div><div class="valve-zone-list">${state.zones.map((zone) => `<div class="valve-zone-row"><span class="zone-symbol">${icon("irrigation")}</span><div class="schedule-copy"><strong>${escapeHtml(zone.name)}</strong><span>Valve ${escapeHtml(zone.valve.state)} · ${escapeHtml(zone.valve.mode)} mode</span></div><button type="button" class="button button--secondary button--small" data-action="toggle-valve" data-zone="${escapeHtml(zone.id)}" ${state.busy ? "disabled" : ""}>Turn ${zone.valve.state === "on" ? "off" : "on"}</button>${zone.valve.mode === "manual" ? `<button type="button" class="button button--quiet button--small" data-action="restore-auto" data-zone="${escapeHtml(zone.id)}" ${state.busy ? "disabled" : ""}>Automatic</button>` : ""}</div>`).join("")}</div></section>`;
}

function renderTrends(): string {
  const zone = selectedZone();
  const moisture = rangeAverages(state.readings, "moisture");
  const temp = rangeAverages(state.readings, "temp");
  const humidity = rangeAverages(state.readings, "humidity");
  const co2 = rangeAverages(state.readings, "co2_ppm");
  const ph = rangeAverages(state.readings, "soil_ph");
  const ppfd = rangeAverages(state.readings, "light_ppfd");
  const lux = rangeAverages(state.readings, "light_lux");
  const battery = rangeAverages(state.readings, "battery_mv");
  const stat = (title: string, key: NumericReadingKey, unit: string, decimals = 1): string => {
    const values = state.readings.flatMap((reading) => {
      const value = reading[key];
      return typeof value === "number" && Number.isFinite(value) ? [value] : [];
    });
    const average = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
    const low = values.length ? Math.min(...values) : null;
    const high = values.length ? Math.max(...values) : null;
    return `<article class="panel analytics-summary-card"><span class="eyebrow">${escapeHtml(title)}</span><strong>${average === null ? "—" : average.toFixed(decimals)}<small>${escapeHtml(unit)}</small></strong><span>${low === null || high === null ? "No readings" : `${low.toFixed(decimals)} – ${high.toFixed(decimals)}${unit} range`}</span></article>`;
  };
  const relationship = renderRelationshipChart(state.readings, {
    title: "Moisture vs air temperature",
    xKey: "moisture",
    xLabel: "Soil moisture",
    xUnit: "%",
    yKey: "temp",
    yLabel: "Air temperature",
    yUnit: "°C",
    sizeKey: "humidity",
    sizeLabel: "Relative humidity",
    sizeUnit: "% RH",
    bubble: true,
  });
  return `<div class="dashboard-heading analytics-heading"><div><p class="eyebrow">Sensor history · ${escapeHtml(state.range)}</p><h1>Growing trends</h1><p class="page-intro">Compare stored soil and climate readings for the selected crop and soil pairing.</p></div><div class="analytics-controls">${renderRangePicker("Trends time range")}${renderZonePicker(zone)}</div></div>
  <div class="analytics-summary-grid trends-summary-grid">${stat("Soil moisture · mean", "moisture", "%")}${stat("Air temperature · mean", "temp", "°C")}${stat("Relative humidity · mean", "humidity", "% RH")}${stat("CO₂ concentration · mean", "co2_ppm", " ppm", 0)}${stat("Soil pH · mean", "soil_ph", " pH", 2)}${stat("Light intensity · PPFD mean", "light_ppfd", " µmol/m²/s")}${stat("Light intensity · lux mean", "light_lux", " lux", 0)}${stat("Battery voltage · mean", "battery_mv", " mV", 0)}</div>
  <section class="panel trend-panel"><div class="panel__header"><div><p class="eyebrow">Moisture history · ${escapeHtml(state.range)}</p><h2>${escapeHtml(zone?.name ?? "No selected zone")} · Soil moisture</h2><p class="panel-subtitle">Reference-style time-series with target band and exact readings on hover.</p></div></div>${renderChart()}</section>
  <div class="analytics-chart-grid trends-chart-grid">
    ${renderSeriesPanel("Soil pH", ph, " pH", "warning", { decimals: 2 })}
    ${renderSeriesPanel("Air temperature", temp, "°C", "warning")}
    ${renderSeriesPanel("Relative humidity", humidity, "% RH", "primary")}
    ${renderSeriesPanel("CO₂ concentration", co2, " ppm", "info", { decimals: 0 })}
    ${renderSeriesPanel("Light intensity · PPFD", ppfd, " µmol/m²/s", "info")}
    ${renderSeriesPanel("Light intensity · lux", lux, " lux", "primary", { decimals: 0 })}
    ${renderSeriesPanel("Battery voltage", battery, " mV", "warning", { decimals: 0 })}
    ${renderHistogram("Soil moisture", moisture, "%", "primary")}
    ${relationship}
  </div>`;
}

function renderAlerts(): string {
  const alertTone: Record<ApiAlert["severity"], string> = { info: "info", warning: "warning", critical: "danger" };
  const batteryRows = state.zones.map((zone) => {
    const battery = zone.reading?.battery_mv ?? zone.node.battery_mv;
    const status = zone.node.online ? "Online" : "Offline";
    return `<article class="battery-row"><span class="zone-symbol">${icon("zones")}</span><div class="schedule-copy"><strong>${escapeHtml(zone.name)}</strong><span>${escapeHtml(zone.crop)} · ${escapeHtml(zone.soil_type)} soil · node ${escapeHtml(status.toLowerCase())}</span></div><strong class="battery-value">${battery === null ? "—" : `${battery.toLocaleString()} mV`}</strong><span class="status status--${zone.node.online ? "success" : "danger"}">${status}</span></article>`;
  }).join("");
  return `<div class="dashboard-heading"><div><p class="eyebrow">Current sensor and irrigation conditions</p><h1>Alerts & recommendations</h1><p class="page-intro">Each item explains which measurement or control state triggered it.</p></div><span class="status status--warning">${state.alerts.length} current</span></div>
  <section class="panel battery-panel"><div class="panel__header"><div><p class="eyebrow">Device power</p><h2>Battery readings</h2><p class="panel-subtitle">Latest stored battery voltage by crop zone. Battery warning thresholds are not configured.</p></div></div><div class="battery-list">${batteryRows || '<p class="empty-copy">No zones have been configured.</p>'}</div></section>
  <section class="panel alerts-list">${state.alerts.map((alert) => `<article class="alert-row alert-row--${alertTone[alert.severity]}"><span class="alert-icon">${icon(alert.type === "sensor_offline" ? "zones" : "alerts")}</span><div><span class="eyebrow">${escapeHtml(alert.zone_name)} · ${escapeHtml(alert.type.replaceAll("_", " "))}</span><h2>${escapeHtml(alert.title)}</h2><p>${escapeHtml(alert.reason)}</p></div><span class="status status--${alertTone[alert.severity]}">${escapeHtml(alert.severity)}</span></article>`).join("") || '<div class="empty-copy">No current alerts. Your zones are reporting and within their configured thresholds.</div>'}</section>
  <section class="panel alerts-model-note"><p class="eyebrow">Decision trace</p><h2>Recommendations from the current model</h2>${state.recommendations.map((recommendation) => {
    const zone = state.zones.find((entry) => entry.id === recommendation.zoneId);
    return `<div class="recommendation-row"><strong>${escapeHtml(zone?.name ?? recommendation.zoneId)}</strong><span class="status status--${recommendation.action === "irrigate" ? "warning" : recommendation.action === "hold" ? "info" : "success"}">${escapeHtml(recommendation.action.replaceAll("_", " "))}</span><p>${escapeHtml(recommendation.reason)}</p></div>`;
  }).join("")}</section>`;
}

function renderSettings(): string {
  const userManagement = state.user?.role === "admin" ? `<section class="panel settings-panel user-management">
    <p class="eyebrow">Administrator controls</p><h2>Users</h2>
    <form class="user-form" data-form="user-create">
      <label class="field"><span class="field__label">Full name</span><input class="input" name="name" required maxlength="100" /></label>
      <label class="field"><span class="field__label">Email</span><input class="input" type="email" name="email" required maxlength="254" /></label>
      <label class="field"><span class="field__label">Phone number</span><input class="input" type="tel" name="phone_number" required maxlength="32" /></label>
      <label class="field"><span class="field__label">Initial password</span><input class="input" type="password" name="password" required minlength="12" maxlength="128" autocomplete="new-password" /></label>
      <label class="field"><span class="field__label">Role</span>${renderUserRolePicker()}</label>
      <button class="button button--primary" type="submit" ${state.busy ? "disabled" : ""}>Add user</button>
    </form>
    <div class="user-list">${(state.usersExpanded ? state.users : state.users.slice(0, 5)).map((user) => `<article class="user-row"><div><strong>${escapeHtml(user.name)}</strong><span>${escapeHtml(user.email)} · ${escapeHtml(user.phoneNumber)}</span></div><span class="status status--info">${escapeHtml(user.role)}</span><div class="cluster">${user.id === state.user?.id ? '<span class="settings-note">You</span>' : `<button type="button" class="button button--quiet button--small" data-action="delete-user" data-user="${escapeHtml(user.id)}" aria-label="Delete ${escapeHtml(user.name)}" ${state.busy ? "disabled" : ""}>Delete</button>`}</div></article>`).join("") || '<p class="empty-copy">No users were found.</p>'}${state.users.length > 5 ? `<div class="user-list__controls">${state.usersExpanded ? '<button type="button" class="button button--secondary button--small" data-action="show-less-users">Show less</button>' : '<button type="button" class="button button--secondary button--small" data-action="load-more-users">Show more</button>'}</div>` : ""}</div>
    <p class="settings-note">Users manage their own names, email addresses, phone numbers, and passwords in account settings. Administrators can add or delete accounts, but cannot edit another user's profile.</p>
  </section>` : "";
  return `<div class="dashboard-heading"><div><p class="eyebrow">Signed in securely</p><h1>Account & system</h1><p class="page-intro">Update your own account details and check backend status.</p></div><button type="button" class="button button--secondary" data-action="logout">${icon("logout")} Sign out</button></div>
  <div class="settings-grid"><section class="panel settings-panel"><p class="eyebrow">Your account · ${escapeHtml(state.user?.role ?? "")}</p><h2>Personal information</h2>
    <form class="user-form profile-form" data-form="profile-update">
      <label class="field"><span class="field__label">Full name</span><input class="input" name="name" autocomplete="name" required maxlength="100" value="${escapeHtml(state.user?.name)}" /></label>
      <label class="field"><span class="field__label">Email</span><input class="input" type="email" name="email" autocomplete="email" required maxlength="254" value="${escapeHtml(state.user?.email)}" /></label>
      <label class="field"><span class="field__label">Phone number</span><input class="input" type="tel" name="phone_number" autocomplete="tel" required maxlength="32" value="${escapeHtml(state.user?.phoneNumber)}" /></label>
      <label class="field"><span class="field__label">New password (optional)</span><input class="input" type="password" name="password" minlength="12" maxlength="128" autocomplete="new-password" /><small class="settings-note">Leave blank to keep your current password.</small></label>
      <button class="button button--primary" type="submit" ${state.busy ? "disabled" : ""}>Save my changes</button>
    </form>
    <p class="settings-note">You can change only your own account. Your role is managed separately and cannot be changed here.</p>
  </section>
  <section class="panel settings-panel"><p class="eyebrow">Backend status</p><h2>Database integration</h2><div class="account-detail"><span>Persistence</span><strong>${state.persistence === "postgres" ? "PostgreSQL" : "In-memory (tests only)"}</strong></div><div class="account-detail"><span>Sensor source</span><strong>${state.mockHardwareEnabled ? "Synthetic demo data enabled" : "Hardware simulator disabled"}</strong></div><p class="settings-note">Zones, accounts, controls and telemetry are read from PostgreSQL. Demo telemetry is clearly marked synthetic and remains stored after API restarts.</p>${state.mockHardwareEnabled ? `<button type="button" class="button button--secondary button--small" data-action="simulate" ${state.busy ? "disabled" : ""}>${icon("simulate")} Generate mock readings</button>` : ""}</section></div>${userManagement}`;
}

function renderLogin(): string {
  const loginError = state.loginError || (state.error && state.error !== "Please sign in to continue." ? state.error : "");
  return `<main class="login-page"><section class="login-card">
    ${renderLanguageSelect("login-language-select")}
    <div class="login-brand">${icon("leaf")}<span>NileGuard</span></div>
    <p class="eyebrow">Greenhouse irrigation</p><h1>Welcome back</h1><p class="login-intro">Sign in to view your zones, readings, and irrigation recommendations.</p>
    ${loginError ? `<div class="api-error" role="alert">${icon("alerts")}<span>${escapeHtml(loginError)}</span></div>` : ""}
    <form class="login-form" data-form="login">
      <label class="field"><span class="field__label">Email address</span><input class="input" type="email" name="email" autocomplete="username" value="farmer@nileguard.local" required maxlength="254" /></label>
      <label class="field"><span class="field__label">Password</span><input class="input" type="password" name="password" autocomplete="current-password" required maxlength="128" /></label>
      <button class="button button--primary login-submit" type="submit" ${state.busy || state.isInitializing ? "disabled" : ""}>${state.busy ? "Signing in…" : "Sign in"}</button>
    </form>
    <div class="demo-credentials"><strong>Local demo account</strong><span>farmer@nileguard.local</span><span>Enter the one-time password issued for this account.</span></div>
    ${state.isInitializing ? '<p class="login-status" role="status">Checking the local API…</p>' : ""}
  </section><p class="login-footnote">Development prototype · Sensor readings and irrigation actions are simulated</p></main>`;
}

function render(): void {
  const app = document.querySelector<HTMLDivElement>("#app");
  if (!app) throw new Error("The application root element #app is missing.");

  if (!state.user) {
    app.innerHTML = renderLogin();
    applyLocale(app);
    return;
  }

  const isMobileNav = mobileNavigationQuery.matches;
  const isNavigationExpanded = isMobileNav ? state.mobileNavOpen : !state.sidebarCollapsed;
  const navigationLabel = isMobileNav
    ? `${state.mobileNavOpen ? "Close" : "Open"} navigation menu`
    : `${state.sidebarCollapsed ? "Expand" : "Collapse"} navigation sidebar`;
  app.innerHTML = `<div class="app-shell ${state.sidebarCollapsed ? "is-sidebar-collapsed" : ""} ${state.mobileNavOpen ? "is-mobile-nav-open" : ""}">
    <header class="app-header">
      <div class="brand-lockup"><button class="icon-button sidebar-toggle" type="button" aria-label="${navigationLabel}" aria-expanded="${isNavigationExpanded}" data-action="toggle-sidebar">${icon("menu")}</button><a class="brand" href="#" aria-label="NileGuard overview" data-action="navigate" data-view="Overview">${icon("leaf", "brand__icon")}<span>NileGuard</span></a></div>
      <div class="header-context"><span class="connection-dot"></span><span>Willow Creek Greenhouse</span><span class="subtle">·</span><span>${state.mockHardwareEnabled ? "Mock sensors connected" : "API connected"}</span></div>
      <div class="app-header__actions">${renderLanguageSelect()}<button class="icon-button notification-button" type="button" aria-label="View alerts" data-action="navigate" data-view="Alerts">${icon("bell")}<i></i></button><button class="icon-button theme-toggle" type="button" aria-label="Switch to ${state.theme === "dark" ? "light" : "dark"} mode" title="Switch to ${state.theme === "dark" ? "light" : "dark"} mode" data-action="toggle-theme">${icon(state.theme === "dark" ? "sun" : "moon")}</button><button class="profile-button" type="button" aria-label="Account settings" data-action="navigate" data-view="Settings">${escapeHtml(state.user.name.slice(0, 1).toUpperCase())}</button></div>
    </header>
    <div class="dashboard-layout"><nav class="dashboard-nav" aria-label="Main navigation">${renderNav()}<div class="nav-bottom"><div class="help-card"><span class="help-card__icon">${icon("leaf")}</span><strong>Making every drop count</strong><small>Recommendations explain the reading and crop threshold behind each decision.</small><button type="button" class="text-button" data-action="navigate" data-view="Alerts">View decision reasons ${icon("chevron")}</button></div><div class="user-card"><span class="user-avatar">${escapeHtml(state.user.name.slice(0, 2).toUpperCase())}</span><span><strong>${escapeHtml(state.user.name)}</strong><small>${escapeHtml(state.user.role)}</small></span></div></div></nav>
      <main class="dashboard-main"><div class="main-content">${state.error ? `<div class="api-error" role="alert">${icon("alerts")}<span>${escapeHtml(state.error)}</span><button type="button" data-action="refresh" class="text-button">Retry</button></div>` : ""}${state.loading ? '<div class="loading-state" role="status">Loading greenhouse data…</div>' : ""}${renderContent()}</div><footer class="app-footer"><span>Module 3 threshold model · readings are mock data</span><span>Last sync ${state.zones[0]?.reading ? formatTime(state.zones[0].reading.received_at) : "—"} <i class="connection-dot"></i></span></footer></main>
    </div><div class="toast" role="status" aria-live="polite"></div></div>`;
  applyLocale(app);
}

function closeMobileNav(): void {
  state.mobileNavOpen = false;
  document.querySelector(".app-shell")?.classList.remove("is-mobile-nav-open");
  const toggle = document.querySelector<HTMLButtonElement>(".sidebar-toggle");
  toggle?.setAttribute("aria-expanded", "false");
  toggle?.setAttribute("aria-label", "Open navigation menu");
}

function renderContent(): string {
  switch (state.view) {
    case "Overview": return renderOverview();
    case "Zones": return renderZones();
    case "Irrigation": return renderIrrigation();
    case "Analytics": return renderAnalytics();
    case "Weather Forecast": return renderWeather();
    case "Trends": return renderTrends();
    case "Alerts": return renderAlerts();
    case "Settings": return renderSettings();
  }
}

function showToast(message: string): void {
  const toast = document.querySelector<HTMLDivElement>(".toast");
  if (!toast) return;
  toast.textContent = translateText(message);
  toast.classList.add("is-visible");
  window.clearTimeout(state.toastTimer);
  state.toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 2800);
}

function describeError(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "An unexpected error occurred while communicating with the API.";
}

async function getReadyHealth(): Promise<ApiHealth> {
  try {
    return await getHealth();
  } catch (error) {
    if (!(error instanceof ApiError) || (error.status < 500 && error.status !== 0)) throw error;
    await new Promise((resolve) => window.setTimeout(resolve, 750));
    return getHealth();
  }
}

async function fetchDashboardData(): Promise<void> {
  const requestId = ++nextDashboardRequest;
  const [zones, recommendations, alerts, schedule] = await Promise.all([
    getZones(),
    getRecommendations(),
    getAlerts(),
    getSchedule(),
  ]);
  if (requestId !== nextDashboardRequest) return;
  state.zones = zones;
  state.recommendations = recommendations;
  state.alerts = alerts;
  state.schedule = schedule;
  if (!zones.some((zone) => zone.id === state.selectedZoneId)) {
    state.selectedZoneId = zones[0]?.id ?? "";
  }
  const zone = zones.find((entry) => entry.id === state.selectedZoneId) ?? zones[0];
  const readings = zone
    ? await getReadings(zone.id, RANGE_HOURS[state.range], 10_000)
    : { readings: [], count: 0 };
  if (requestId !== nextDashboardRequest) return;
  state.readings = readings.readings;
  state.historyReadings = readings.readings;
}

async function refreshDashboard(): Promise<void> {
  state.loading = true;
  state.error = "";
  const requestId = nextDashboardRequest + 1;
  render();
  try {
    await fetchDashboardData();
  } catch (error) {
    state.error = describeError(error);
  } finally {
    if (requestId === nextDashboardRequest) state.loading = false;
    render();
  }
}

async function refreshWeather(): Promise<void> {
  const requestId = ++state.weatherRequestId;
  state.weatherLastAttemptAt = Date.now();
  state.weatherLoading = true;
  state.weatherError = "";
  state.weather = null;
  render();
  try {
    if (!state.weatherLocations.length) state.weatherLocations = await getWeatherLocations();
    const locationId = state.selectedWeatherLocationId || undefined;
    const weather = await getWeather(locationId);
    if (requestId !== state.weatherRequestId) return;
    state.weather = weather;
    state.selectedWeatherLocationId = weather.location.id;
  } catch (error) {
    if (requestId === state.weatherRequestId) state.weatherError = describeError(error);
  } finally {
    if (requestId === state.weatherRequestId) {
      state.weatherLoading = false;
      render();
    }
  }
}

function startPolling(): void {
  window.clearInterval(state.pollTimer);
  state.pollTimer = window.setInterval(() => {
    const refreshableViews: View[] = ["Zones", "Irrigation", "Alerts"];
    if (state.user && !state.loading && !state.busy && document.visibilityState === "visible") {
      if (state.view === "Weather Forecast") {
        if (Date.now() - state.weatherLastAttemptAt >= 12 * 60_000) void refreshWeather();
      } else if (refreshableViews.includes(state.view)) {
        void refreshDashboard();
      }
    }
  }, 30_000);
}

async function runApiAction(action: () => Promise<unknown>, successMessage: string): Promise<void> {
  if (state.busy) return;
  state.busy = true;
  state.error = "";
  render();
  try {
    await action();
    await fetchDashboardData();
    showToast(successMessage);
  } catch (error) {
    state.error = describeError(error);
  } finally {
    state.busy = false;
    render();
  }
}

async function runUserAction(action: () => Promise<unknown>, successMessage: string): Promise<void> {
  if (state.busy) return;
  state.busy = true;
  state.error = "";
  render();
  try {
    await action();
    if (state.user?.role === "admin") {
      state.users = await getUsers();
      state.usersExpanded = false;
      const updatedCurrentUser = state.users.find((user) => user.id === state.user?.id);
      if (updatedCurrentUser) state.user = updatedCurrentUser;
    }
    await fetchDashboardData();
    showToast(successMessage);
  } catch (error) {
    state.error = describeError(error);
  } finally {
    state.busy = false;
    render();
  }
}

async function loadUsers(): Promise<void> {
  if (state.user?.role !== "admin") return;
  try {
    state.users = await getUsers();
    state.usersExpanded = false;
    state.error = "";
  } catch (error) {
    state.error = describeError(error);
  }
  render();
}

async function handleLogin(form: HTMLFormElement): Promise<void> {
  if (state.busy) return;
  const formData = new FormData(form);
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  state.busy = true;
  state.loginError = "";
  state.error = "";
  render();

  try {
    const session = await login(email, password);
    setSessionToken(session.token);
    state.user = session.user;
    state.view = "Overview";
    await fetchDashboardData();
    startPolling();
  } catch (error) {
    setSessionToken(null);
    state.user = null;
    state.loginError = describeError(error);
  } finally {
    state.busy = false;
    render();
  }
}

function clearUserSession(message: string): void {
  nextDashboardRequest += 1;
  window.clearInterval(state.pollTimer);
  state.pollTimer = 0;
  setSessionToken(null);
  state.user = null;
  state.zones = [];
  state.recommendations = [];
  state.alerts = [];
  state.schedule = [];
  state.users = [];
  state.readings = [];
  state.historyReadings = [];
  state.error = message;
  state.loginError = "";
  state.busy = false;
  render();
}

function showChartTooltip(mark: SVGElement, clientX: number, clientY: number): void {
  const panel = mark.closest<HTMLElement>(".analytics-chart-panel, .trend-panel");
  const tooltip = panel?.querySelector<HTMLDivElement>(".chart-tooltip");
  const text = mark.dataset.chartTip;
  if (!panel || !tooltip || !text) return;
  tooltip.textContent = text;
  tooltip.classList.add("is-visible");
  tooltip.setAttribute("aria-hidden", "false");
  const panelRect = panel.getBoundingClientRect();
  const tipRect = tooltip.getBoundingClientRect();
  const left = Math.max(8, Math.min(clientX - panelRect.left + 12, panelRect.width - tipRect.width - 8));
  const top = Math.max(8, Math.min(clientY - panelRect.top - tipRect.height - 12, panelRect.height - tipRect.height - 8));
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}

function hideChartTooltip(mark: SVGElement): void {
  const panel = mark.closest<HTMLElement>(".analytics-chart-panel, .trend-panel");
  const tooltip = panel?.querySelector<HTMLDivElement>(".chart-tooltip");
  if (!tooltip) return;
  tooltip.classList.remove("is-visible");
  tooltip.setAttribute("aria-hidden", "true");
  if (mark.classList.contains("weather-chart-mark")) {
    const cursor = mark.closest("svg")?.querySelector<SVGLineElement>(".weather-chart-cursor");
    if (cursor) cursor.style.display = "none";
  }
}

function updateWeatherChartCursor(mark: SVGElement): void {
  if (!mark.classList.contains("weather-chart-mark")) return;
  const cursor = mark.closest("svg")?.querySelector<SVGLineElement>(".weather-chart-cursor");
  const x = mark.getAttribute("data-weather-x");
  if (!cursor || !x) return;
  cursor.setAttribute("x1", x);
  cursor.setAttribute("x2", x);
  cursor.style.display = "block";
}

function nearestChartMark(svg: SVGSVGElement, clientX: number, clientY: number): SVGElement | null {
  const marks = Array.from(svg.querySelectorAll<SVGElement>("[data-chart-tip]"));
  let nearest: SVGElement | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const mark of marks) {
    const rect = mark.getBoundingClientRect();
    const distance = Math.hypot(rect.left + rect.width / 2 - clientX, rect.top + rect.height / 2 - clientY);
    if (distance < nearestDistance) {
      nearest = mark;
      nearestDistance = distance;
    }
  }
  return nearest;
}

function hideChartPanelTooltip(panel: HTMLElement, svg?: SVGSVGElement): void {
  const tooltip = panel.querySelector<HTMLDivElement>(".chart-tooltip");
  tooltip?.classList.remove("is-visible");
  tooltip?.setAttribute("aria-hidden", "true");
  svg?.querySelector<SVGLineElement>(".weather-chart-cursor")?.style.setProperty("display", "none");
  svg?.querySelector<HTMLElement>(".is-active[data-chart-tip]")?.classList.remove("is-active");
}

document.addEventListener("pointerover", (event: PointerEvent) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const mark = target.closest<SVGElement>("[data-chart-tip]");
  if (mark) {
    updateWeatherChartCursor(mark);
    showChartTooltip(mark, event.clientX, event.clientY);
  }
});

document.addEventListener("pointermove", (event: PointerEvent) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const svg = target.closest<SVGSVGElement>(".analytics-plot");
  if (svg) {
    const mark = nearestChartMark(svg, event.clientX, event.clientY);
    const previousMark = svg.querySelector<SVGElement>(".is-active[data-chart-tip]");
    if (previousMark !== mark) {
      previousMark?.classList.remove("is-active");
      mark?.classList.add("is-active");
    }
    if (mark) {
      updateWeatherChartCursor(mark);
      showChartTooltip(mark, event.clientX, event.clientY);
    } else {
      const panel = svg.closest<HTMLElement>(".analytics-chart-panel, .trend-panel");
      if (panel) hideChartPanelTooltip(panel, svg);
    }
    return;
  }
  const mark = target.closest<SVGElement>("[data-chart-tip]");
  if (mark) {
    updateWeatherChartCursor(mark);
    showChartTooltip(mark, event.clientX, event.clientY);
  }
});

document.addEventListener("pointerout", (event: PointerEvent) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const mark = target.closest<SVGElement>("[data-chart-tip]");
  const svg = target.closest<SVGSVGElement>(".analytics-plot");
  const nextTarget = event.relatedTarget;
  if (svg && (!(nextTarget instanceof Node) || !svg.contains(nextTarget))) {
    const panel = svg.closest<HTMLElement>(".analytics-chart-panel, .trend-panel");
    if (panel) hideChartPanelTooltip(panel, svg);
  } else if (mark && (!(nextTarget instanceof Element) || !nextTarget.closest("[data-chart-tip]"))) {
    if (svg && nextTarget instanceof Node && svg.contains(nextTarget)) return;
    hideChartTooltip(mark);
  }
});

document.addEventListener("focusin", (event: FocusEvent) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const mark = target.closest<SVGElement>("[data-chart-tip]");
  if (!mark) return;
  mark.classList.add("is-active");
  updateWeatherChartCursor(mark);
  const rect = mark.getBoundingClientRect();
  showChartTooltip(mark, rect.left + rect.width / 2, rect.top + rect.height / 2);
});

document.addEventListener("focusout", (event: FocusEvent) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const mark = target.closest<SVGElement>("[data-chart-tip]");
  const nextTarget = event.relatedTarget;
  mark?.classList.remove("is-active");
  if (mark && (!(nextTarget instanceof Element) || !nextTarget.closest("[data-chart-tip]"))) hideChartTooltip(mark);
});

document.addEventListener("keydown", (event: KeyboardEvent) => {
  if (event.key === "Escape" && state.weatherLocationMenuOpen) {
    state.weatherLocationMenuOpen = false;
    render();
    document.querySelector<HTMLButtonElement>(".weather-location-trigger")?.focus();
    return;
  }
  if (event.key === "Escape" && state.userRoleMenuOpen) {
    state.userRoleMenuOpen = false;
    updateUserRolePicker();
    document.querySelector<HTMLButtonElement>(".user-role-trigger")?.focus();
    return;
  }
  if (event.key === "Escape" && state.languageMenuOpen) {
    state.languageMenuOpen = false;
    render();
    document.querySelector<HTMLButtonElement>(".language-trigger")?.focus();
    return;
  }
  if (event.key === "Escape" && state.mobileNavOpen) {
    closeMobileNav();
    render();
    document.querySelector<HTMLButtonElement>(".sidebar-toggle")?.focus();
    return;
  }
  if (event.key === "Escape" && state.zoneMenuOpen) {
    state.zoneMenuOpen = false;
    render();
    document.querySelector<HTMLButtonElement>('[data-action="toggle-zone-menu"]')?.focus();
  }
});

document.addEventListener("submit", (event: SubmitEvent) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  if (form.dataset.form === "profile-update") {
    event.preventDefault();
    const data = new FormData(form);
    void runUserAction(async () => {
      state.user = await updateMyProfile({
        name: normalizeDigits(String(data.get("name") ?? "")).trim(),
        email: normalizeDigits(String(data.get("email") ?? "")).trim(),
        phone_number: normalizeDigits(String(data.get("phone_number") ?? "")).trim(),
        ...(String(data.get("password") ?? "") ? { password: String(data.get("password")) } : {}),
      });
    }, "Your account details were updated.");
    return;
  }
  if (form.dataset.form === "user-create") {
    event.preventDefault();
    const data = new FormData(form);
    void runUserAction(() => createUser({
      name: normalizeDigits(String(data.get("name") ?? "")).trim(),
      email: normalizeDigits(String(data.get("email") ?? "")).trim(),
      phone_number: normalizeDigits(String(data.get("phone_number") ?? "")).trim(),
      password: String(data.get("password") ?? ""),
      role: data.get("role") === "admin" ? "admin" : "operator",
    }), "User created.");
    return;
  }
  if (form.dataset.form !== "login") return;
  event.preventDefault();
  void handleLogin(form);
});

document.addEventListener("click", (event: MouseEvent) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  if (state.mobileNavOpen && !target.closest(".dashboard-nav, .sidebar-toggle")) {
    closeMobileNav();
  }
  const control = target.closest<HTMLElement>("[data-action]");
  if (state.zoneMenuOpen && !target.closest(".zone-picker")) {
    state.zoneMenuOpen = false;
    render();
  }
  if (state.languageMenuOpen && !target.closest(".language-picker")) {
    state.languageMenuOpen = false;
    render();
  }
  if (state.weatherLocationMenuOpen && !target.closest(".weather-location-picker")) {
    state.weatherLocationMenuOpen = false;
    render();
  }
  if (state.userRoleMenuOpen && !target.closest(".user-role-picker")) {
    state.userRoleMenuOpen = false;
    updateUserRolePicker();
  }
  if (!control) return;

  switch (control.dataset.action) {
    case "navigate": {
      const nextView = control.dataset.view;
      if (nextView && views.includes(nextView as View)) {
        state.view = nextView as View;
        state.zoneMenuOpen = false;
        state.weatherLocationMenuOpen = false;
        state.userRoleMenuOpen = false;
        state.mobileNavOpen = false;
        render();
        if (state.view === "Settings" && state.user?.role === "admin") void loadUsers();
        if (["Analytics", "Trends"].includes(state.view)) void refreshDashboard();
        if (state.view === "Weather Forecast") void refreshWeather();
      }
      break;
    }
    case "toggle-theme": {
      state.theme = state.theme === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = state.theme;
      localStorage.setItem("nileguard.theme", state.theme);
      render();
      break;
    }
    case "toggle-language-menu": {
      state.languageMenuOpen = !state.languageMenuOpen;
      state.weatherLocationMenuOpen = false;
      state.userRoleMenuOpen = false;
      state.zoneMenuOpen = false;
      render();
      if (state.languageMenuOpen) {
        document.querySelector<HTMLButtonElement>(".language-option.is-selected")?.focus();
      }
      break;
    }
    case "toggle-weather-location-menu": {
      state.weatherLocationMenuOpen = !state.weatherLocationMenuOpen;
      state.languageMenuOpen = false;
      state.userRoleMenuOpen = false;
      state.zoneMenuOpen = false;
      render();
      if (state.weatherLocationMenuOpen) {
        document.querySelector<HTMLButtonElement>(".weather-location-option.is-selected")?.focus();
      }
      break;
    }
    case "toggle-user-role-menu": {
      state.userRoleMenuOpen = !state.userRoleMenuOpen;
      state.weatherLocationMenuOpen = false;
      state.languageMenuOpen = false;
      state.zoneMenuOpen = false;
      for (const [menuSelector, triggerSelector] of [
        [".language-menu", ".language-trigger"],
        [".weather-location-menu", ".weather-location-trigger"],
        [".zone-picker__menu", ".zone-picker__trigger"],
      ]) {
        document.querySelector(menuSelector)?.remove();
        document.querySelector<HTMLButtonElement>(triggerSelector)?.setAttribute("aria-expanded", "false");
      }
      updateUserRolePicker();
      if (state.userRoleMenuOpen) {
        document.querySelector<HTMLButtonElement>(".user-role-option.is-selected")?.focus();
      }
      break;
    }
    case "select-user-role": {
      const role = control.dataset.role;
      if (role === "operator" || role === "admin") {
        state.newUserRole = role;
        state.userRoleMenuOpen = false;
        updateUserRolePicker();
        document.querySelector<HTMLButtonElement>(".user-role-trigger")?.focus();
      }
      break;
    }
    case "select-weather-location": {
      const locationId = control.dataset.location;
      if (locationId && state.weatherLocations.some((location) => location.id === locationId)) {
        state.selectedWeatherLocationId = locationId;
        state.weatherLocationMenuOpen = false;
        void refreshWeather();
      }
      break;
    }
    case "select-language": {
      const locale = control.dataset.locale;
      if (locale === "en" || locale === "ar") {
        state.locale = locale;
        state.languageMenuOpen = false;
        localStorage.setItem("nileguard.locale", state.locale);
        render();
        document.querySelector<HTMLButtonElement>(".language-trigger")?.focus();
      }
      break;
    }
    case "load-more-users": {
      state.usersExpanded = true;
      render();
      break;
    }
    case "show-less-users": {
      state.usersExpanded = false;
      render();
      break;
    }
    case "toggle-sidebar": {
      if (mobileNavigationQuery.matches) {
        state.mobileNavOpen = !state.mobileNavOpen;
      } else {
        state.sidebarCollapsed = !state.sidebarCollapsed;
        localStorage.setItem("nileguard.sidebar-collapsed", String(state.sidebarCollapsed));
      }
      render();
      if (mobileNavigationQuery.matches) {
        if (state.mobileNavOpen) {
          document.querySelector<HTMLButtonElement>(".dashboard-nav__item")?.focus();
        } else {
          document.querySelector<HTMLButtonElement>(".sidebar-toggle")?.focus();
        }
      }
      break;
    }
    case "toggle-zone-menu": {
      state.zoneMenuOpen = !state.zoneMenuOpen;
      render();
      if (state.zoneMenuOpen) document.querySelector<HTMLButtonElement>(".zone-picker__option")?.focus();
      break;
    }
    case "choose-dashboard-zone": {
      const zoneId = control.dataset.zone;
      if (zoneId && state.zones.some((zone) => zone.id === zoneId)) {
        state.selectedZoneId = zoneId;
        state.zoneMenuOpen = false;
        render();
        void refreshDashboard();
      }
      break;
    }
    case "delete-user": {
      const userId = control.dataset.user;
      const user = state.users.find((entry) => entry.id === userId);
      const confirmation = user
        ? state.locale === "ar"
          ? `هل تريد حذف حساب ${user.name} نهائيًا؟ لا يمكن التراجع عن هذا الإجراء.`
          : `Permanently delete ${user.name}'s account? This cannot be undone.`
        : "";
      if (userId && user && window.confirm(confirmation)) {
        void runUserAction(() => deleteUser(userId), "User permanently deleted.");
      }
      break;
    }
    case "select-zone": {
      const zoneId = control.dataset.zone;
      if (zoneId && state.zones.some((zone) => zone.id === zoneId)) {
        state.selectedZoneId = zoneId;
        if (state.view === "Zones") state.view = "Trends";
        void refreshDashboard();
      }
      break;
    }
    case "range": {
      const range = control.dataset.range;
      if (range === "24 hours" || range === "7 days" || range === "30 days" || range === "6 months") {
        state.range = range;
        void refreshDashboard();
      }
      break;
    }
    case "toggle-valve": {
      const zone = state.zones.find((entry) => entry.id === control.dataset.zone);
      if (zone) {
        const nextState = zone.valve.state === "on" ? "off" : "on";
        void runApiAction(() => setManualValve(zone.id, nextState), `${zone.name} valve manually turned ${nextState}.`);
      }
      break;
    }
    case "restore-auto": {
      const zone = state.zones.find((entry) => entry.id === control.dataset.zone);
      if (zone) {
        void runApiAction(() => restoreAutomaticValve(zone.id), `${zone.name} returned to automatic irrigation.`);
      }
      break;
    }
    case "simulate":
      void runApiAction(() => simulateReadings(), "Mock sensor readings updated.");
      break;
    case "refresh":
      if (state.view === "Weather Forecast") void refreshWeather();
      else void refreshDashboard();
      break;
    case "retry-weather":
      void refreshWeather();
      break;
    case "logout":
      void (async () => {
        let message = "";
        try {
          await logout();
        } catch (error) {
          message = `Signed out locally. The API logout notification failed: ${describeError(error)}`;
        } finally {
          clearUserSession(message);
        }
      })();
      break;
  }
});

onAuthenticationExpired(() => {
  clearUserSession("Your session expired. Sign in again to continue.");
});

mobileNavigationQuery.addEventListener("change", () => {
  state.mobileNavOpen = false;
  render();
});

async function initialize(): Promise<void> {
  try {
    const health = await getReadyHealth();
    state.mockHardwareEnabled = health.mock_hardware;
    state.persistence = health.persistence;
    if (getSessionToken()) {
      state.user = await getCurrentUser();
      await fetchDashboardData();
      startPolling();
    }
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      clearUserSession("Please sign in to continue.");
    } else {
      state.error = describeError(error);
    }
  } finally {
    state.isInitializing = false;
    render();
  }
}

render();
void initialize();
