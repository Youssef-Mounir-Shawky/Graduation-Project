import "../styles/index.css";
import "./dashboard.css";
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
  ApiZone,
  ApiHealth,
} from "./api/types.js";

type View = "Overview" | "Zones" | "Irrigation" | "Analytics" | "Weather" | "Trends" | "Alerts" | "Settings";
type TimeRange = "24 hours" | "7 days" | "30 days" | "6 months";

const views: View[] = ["Overview", "Zones", "Irrigation", "Analytics", "Weather", "Trends", "Alerts", "Settings"];
const HISTORY_HOURS = 24 * 183;
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
  readings: ApiReading[];
  historyReadings: ApiReading[];
  selectedZoneId: string;
  theme: "light" | "dark";
  sidebarCollapsed: boolean;
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
  readings: [],
  historyReadings: [],
  selectedZoneId: "",
  theme: localStorage.getItem("nileguard.theme") === "dark" ? "dark" : "light",
  sidebarCollapsed: localStorage.getItem("nileguard.sidebar-collapsed") === "true",
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
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(timestamp));
}

function formatDate(timestamp: string): string {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(timestamp));
}

function formatRangePoint(timestamp: string): string {
  return state.range === "24 hours"
    ? new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(timestamp))
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

function renderNav(): string {
  return views.map((view) => {
    const iconName = view.toLowerCase() === "overview" ? "overview" : view.toLowerCase();
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
  const marks = coords.map(({ x, y, point }) => `<circle class="analytics-hit-point analytics-hit-point--${color}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="7" ${chartTip(formatRangePoint(point.timestamp), [`${title}: ${point.value.toFixed(options.decimals ?? 1)}${unit}`])}/>`).join("");

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

function renderHumidityPie(readings: ApiReading[]): string {
  const values = readings.map((reading) => reading.humidity).filter(Number.isFinite);
  if (!values.length) {
    return `<section class="panel analytics-chart-panel"><div class="panel__header"><div><p class="eyebrow">Observed humidity bands</p><h2>Relative humidity distribution</h2></div></div><div class="chart-empty">No relative humidity measurements are available for this zone.</div></section>`;
  }
  const categories = [
    { label: "Below 40% RH", count: values.filter((value) => value < 40).length, color: "primary" },
    { label: "40–70% RH", count: values.filter((value) => value >= 40 && value <= 70).length, color: "warning" },
    { label: "Above 70% RH", count: values.filter((value) => value > 70).length, color: "info" },
  ];
  let angle = -Math.PI / 2;
  const segments = categories.map((category) => {
    if (!category.count) return "";
    if (category.count === values.length) {
      return `<circle class="ph-pie__segment ph-pie__segment--${category.color}" cx="80" cy="80" r="62" ${chartTip(category.label, [`Readings: ${category.count.toLocaleString()}`, "Share: 100.0%"])}/>`;
    }
    const nextAngle = angle + (category.count / values.length) * Math.PI * 2;
    const x1 = 80 + 62 * Math.cos(angle);
    const y1 = 80 + 62 * Math.sin(angle);
    const x2 = 80 + 62 * Math.cos(nextAngle);
    const y2 = 80 + 62 * Math.sin(nextAngle);
    const largeArc = nextAngle - angle > Math.PI ? 1 : 0;
    const path = `M 80 80 L ${x1.toFixed(2)} ${y1.toFixed(2)} A 62 62 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z`;
    const segment = `<path class="ph-pie__segment ph-pie__segment--${category.color}" d="${path}" ${chartTip(category.label, [`Readings: ${category.count.toLocaleString()}`, `Share: ${((category.count / values.length) * 100).toFixed(1)}%`])}/>`;
    angle = nextAngle;
    return segment;
  }).join("");
  return `<section class="panel analytics-chart-panel">
    <div class="panel__header"><div><p class="eyebrow">Observed humidity bands</p><h2>Relative humidity distribution</h2></div><span class="status status--info">${values.length.toLocaleString()} readings</span></div>
    <div class="ph-donut-layout"><svg class="ph-pie" viewBox="0 0 160 160" role="img" aria-label="Pie chart of relative humidity readings across three descriptive ranges">${segments}</svg>
      <ul class="ph-donut__legend">${categories.map((category) => `<li><span><i class="legend-dot legend-dot--${category.color}"></i>${category.label}</span><strong>${((category.count / values.length) * 100).toFixed(1)}%</strong></li>`).join("")}</ul>
    </div><div class="chart-tooltip" aria-hidden="true"></div><p class="analytics-note">Descriptive ranges only; they are not crop-specific humidity recommendations.</p>
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
    <svg class="analytics-plot" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="Histogram of ${escapeHtml(title)} daily averages">${grid}${bars}<text class="analytics-axis-label" x="${left}" y="230">${minimum.toFixed(decimals)}${escapeHtml(unit)}</text><text class="analytics-axis-label" x="${right}" y="230" text-anchor="end">${maximum.toFixed(decimals)}${escapeHtml(unit)}</text></svg>
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
    <svg class="analytics-plot" viewBox="0 0 ${width} 250" preserveAspectRatio="none" role="img" aria-label="${escapeHtml(config.bubble ? "Bubble chart" : "Scatter plot")} relating ${escapeHtml(config.xLabel)} and ${escapeHtml(config.yLabel)}">${grid}${marks}<text class="analytics-axis-label" x="${left}" y="230">${xMinimum.toFixed(1)}${escapeHtml(config.xUnit)}</text><text class="analytics-axis-label" x="${right}" y="230" text-anchor="end">${xMaximum.toFixed(1)}${escapeHtml(config.xUnit)}</text></svg>
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
  const zone = selectedZone();
  const readings = state.historyReadings;
  const temp = rangeAverages(readings, "temp");
  const humidity = rangeAverages(readings, "humidity");
  const co2 = rangeAverages(readings, "co2_ppm");
  const climatePair = renderRelationshipChart(readings, {
    title: "Temperature, humidity & CO₂",
    xKey: "temp",
    xLabel: "Air temperature",
    xUnit: "°C",
    yKey: "humidity",
    yLabel: "Relative humidity",
    yUnit: "% RH",
    sizeKey: "co2_ppm",
    sizeLabel: "CO₂ concentration",
    sizeUnit: " ppm",
    bubble: true,
  });
  const latest = zone?.reading;
  const origin = latest?.data_source ?? "no current reading";
  const historySources = Array.from(new Set(readings.map((reading) => reading.data_source))).join(" + ") || "no stored readings";
  return `<div class="dashboard-heading analytics-heading"><div><p class="eyebrow">Field climate · ${escapeHtml(state.range)} · ${escapeHtml(historySources)}</p><h1>Weather</h1><p class="page-intro">Temperature, relative humidity, and CO₂ concentration from stored zone readings; this is sensor history, not a forecast.</p></div><div class="analytics-controls">${renderRangePicker("Weather time range")}${renderZonePicker(zone)}</div></div>
    <div class="analytics-summary-grid analytics-summary-grid--weather">
      ${renderSummaryCard("Air temperature", latest ? latest.temp.toFixed(1) : "—", latest ? "°C" : "", `Latest · ${origin}`)}
      ${renderSummaryCard("Relative humidity", latest ? latest.humidity.toFixed(1) : "—", latest ? "% RH" : "", `Latest · ${origin}`)}
      ${renderSummaryCard("CO₂ concentration", latest?.co2_ppm == null ? "—" : latest.co2_ppm.toFixed(0), latest?.co2_ppm == null ? "" : " ppm", `Latest · ${origin}`)}
    </div>
    <div class="analytics-chart-grid analytics-chart-grid--weather">
      ${renderSeriesPanel("Air temperature", temp, "°C", "warning")}
      ${renderSeriesPanel("Relative humidity", humidity, "% RH", "primary")}
      ${renderSeriesPanel("CO₂ concentration", co2, " ppm", "info", { area: true, decimals: 0 })}
      ${renderHistogram("Air temperature", temp, "°C", "warning")}
      ${climatePair}
      ${renderHumidityPie(readings)}
    </div>`;
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
    return `<line class="analytics-gridline" x1="${left}" y1="${y}" x2="${right}" y2="${y}"/><text class="analytics-axis-label" x="${left - 10}" y="${y + 4}" text-anchor="end">${value}%</text>`;
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
  return `<div class="schedule-item"><div class="schedule-time"><strong>${formatTime(entry.start_at)}</strong></div><div class="schedule-copy"><strong>${escapeHtml(entry.zone_name)}</strong><span>${escapeHtml(entry.method)} · ${entry.duration_minutes} min</span></div><span class="status status--${entry.status === "running" ? "success" : "info"}">${escapeHtml(entry.status === "running" ? "Watering" : new Date(entry.start_at).toLocaleDateString() === new Date().toLocaleDateString() ? "Today" : "Upcoming")}</span></div>`;
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
    <div><p class="eyebrow">${new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(new Date())}</p><h1>Good ${new Date().getHours() < 12 ? "morning" : new Date().getHours() < 18 ? "afternoon" : "evening"}, ${escapeHtml(state.user?.name.split(" ")[0] ?? "grower")}</h1><p class="page-intro">Current readings and recommendations from your garden.</p></div>
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
      <label class="field"><span class="field__label">Role</span><select class="select" name="role"><option value="operator">Operator</option><option value="admin">Administrator</option></select></label>
      <button class="button button--primary" type="submit" ${state.busy ? "disabled" : ""}>Add user</button>
    </form>
    <div class="user-list">${state.users.map((user) => `<article class="user-row"><div><strong>${escapeHtml(user.name)}</strong><span>${escapeHtml(user.email)} · ${escapeHtml(user.phoneNumber)}</span></div><span class="status status--info">${escapeHtml(user.role)}</span><div class="cluster">${user.id === state.user?.id ? '<span class="settings-note">You</span>' : `<button type="button" class="button button--quiet button--small" data-action="delete-user" data-user="${escapeHtml(user.id)}" aria-label="Delete ${escapeHtml(user.name)}" ${state.busy ? "disabled" : ""}>Delete</button>`}</div></article>`).join("") || '<p class="empty-copy">No users were found.</p>'}</div>
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
    return;
  }

  app.innerHTML = `<div class="app-shell ${state.sidebarCollapsed ? "is-sidebar-collapsed" : ""}">
    <header class="app-header">
      <div class="brand-lockup"><button class="icon-button sidebar-toggle" type="button" aria-label="${state.sidebarCollapsed ? "Expand" : "Collapse"} navigation sidebar" aria-expanded="${!state.sidebarCollapsed}" data-action="toggle-sidebar">${icon("menu")}</button><a class="brand" href="#" aria-label="NileGuard overview" data-action="navigate" data-view="Overview">${icon("leaf", "brand__icon")}<span>NileGuard</span></a></div>
      <div class="header-context"><span class="connection-dot"></span><span>Willow Creek Greenhouse</span><span class="subtle">·</span><span>${state.mockHardwareEnabled ? "Mock sensors connected" : "API connected"}</span></div>
      <div class="app-header__actions"><button class="icon-button notification-button" type="button" aria-label="View alerts" data-action="navigate" data-view="Alerts">${icon("bell")}<i></i></button><button class="icon-button theme-toggle" type="button" aria-label="Switch to ${state.theme === "dark" ? "light" : "dark"} mode" title="Switch to ${state.theme === "dark" ? "light" : "dark"} mode" data-action="toggle-theme">${icon(state.theme === "dark" ? "sun" : "moon")}</button><button class="profile-button" type="button" aria-label="Account settings" data-action="navigate" data-view="Settings">${escapeHtml(state.user.name.slice(0, 1).toUpperCase())}</button></div>
    </header>
    <div class="dashboard-layout"><nav class="dashboard-nav" aria-label="Main navigation">${renderNav()}<div class="nav-bottom"><div class="help-card"><span class="help-card__icon">${icon("leaf")}</span><strong>Making every drop count</strong><small>Recommendations explain the reading and crop threshold behind each decision.</small><button type="button" class="text-button" data-action="navigate" data-view="Alerts">View decision reasons ${icon("chevron")}</button></div><div class="user-card"><span class="user-avatar">${escapeHtml(state.user.name.slice(0, 2).toUpperCase())}</span><span><strong>${escapeHtml(state.user.name)}</strong><small>${escapeHtml(state.user.role)}</small></span></div></div></nav>
      <main class="dashboard-main"><div class="main-content">${state.error ? `<div class="api-error" role="alert">${icon("alerts")}<span>${escapeHtml(state.error)}</span><button type="button" data-action="refresh" class="text-button">Retry</button></div>` : ""}${state.loading ? '<div class="loading-state" role="status">Loading greenhouse data…</div>' : ""}${renderContent()}</div><footer class="app-footer"><span>Module 3 threshold model · readings are mock data</span><span>Last sync ${state.zones[0]?.reading ? formatTime(state.zones[0].reading.received_at) : "—"} <i class="connection-dot"></i></span></footer></main>
    </div><div class="toast" role="status" aria-live="polite"></div></div>`;
}

function renderContent(): string {
  switch (state.view) {
    case "Overview": return renderOverview();
    case "Zones": return renderZones();
    case "Irrigation": return renderIrrigation();
    case "Analytics": return renderAnalytics();
    case "Weather": return renderWeather();
    case "Trends": return renderTrends();
    case "Alerts": return renderAlerts();
    case "Settings": return renderSettings();
  }
}

function showToast(message: string): void {
  const toast = document.querySelector<HTMLDivElement>(".toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("is-visible");
  window.clearTimeout(state.toastTimer);
  state.toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 2800);
}

function describeError(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "An unexpected error occurred while communicating with the API.";
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

function startPolling(): void {
  window.clearInterval(state.pollTimer);
  state.pollTimer = window.setInterval(() => {
    if (state.user && state.view !== "Settings" && !state.loading && !state.busy && document.visibilityState === "visible") {
      void refreshDashboard();
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

function showChartTooltip(mark: HTMLElement, clientX: number, clientY: number): void {
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

function hideChartTooltip(mark: HTMLElement): void {
  const panel = mark.closest<HTMLElement>(".analytics-chart-panel, .trend-panel");
  const tooltip = panel?.querySelector<HTMLDivElement>(".chart-tooltip");
  if (!tooltip) return;
  tooltip.classList.remove("is-visible");
  tooltip.setAttribute("aria-hidden", "true");
}

document.addEventListener("pointerover", (event: PointerEvent) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const mark = target.closest<HTMLElement>("[data-chart-tip]");
  if (mark) showChartTooltip(mark, event.clientX, event.clientY);
});

document.addEventListener("pointermove", (event: PointerEvent) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const mark = target.closest<HTMLElement>("[data-chart-tip]");
  if (mark) showChartTooltip(mark, event.clientX, event.clientY);
});

document.addEventListener("pointerout", (event: PointerEvent) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const mark = target.closest<HTMLElement>("[data-chart-tip]");
  const nextTarget = event.relatedTarget;
  if (mark && (!(nextTarget instanceof Element) || !nextTarget.closest("[data-chart-tip]"))) hideChartTooltip(mark);
});

document.addEventListener("focusin", (event: FocusEvent) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const mark = target.closest<HTMLElement>("[data-chart-tip]");
  if (!mark) return;
  const rect = mark.getBoundingClientRect();
  showChartTooltip(mark, rect.left + rect.width / 2, rect.top + rect.height / 2);
});

document.addEventListener("focusout", (event: FocusEvent) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const mark = target.closest<HTMLElement>("[data-chart-tip]");
  const nextTarget = event.relatedTarget;
  if (mark && (!(nextTarget instanceof Element) || !nextTarget.closest("[data-chart-tip]"))) hideChartTooltip(mark);
});

document.addEventListener("keydown", (event: KeyboardEvent) => {
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
        name: String(data.get("name") ?? "").trim(),
        email: String(data.get("email") ?? "").trim(),
        phone_number: String(data.get("phone_number") ?? "").trim(),
        ...(String(data.get("password") ?? "") ? { password: String(data.get("password")) } : {}),
      });
    }, "Your account details were updated.");
    return;
  }
  if (form.dataset.form === "user-create") {
    event.preventDefault();
    const data = new FormData(form);
    void runUserAction(() => createUser({
      name: String(data.get("name") ?? "").trim(),
      email: String(data.get("email") ?? "").trim(),
      phone_number: String(data.get("phone_number") ?? "").trim(),
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
  const control = target.closest<HTMLElement>("[data-action]");
  if (state.zoneMenuOpen && !target.closest(".zone-picker")) {
    state.zoneMenuOpen = false;
    render();
  }
  if (!control) return;

  switch (control.dataset.action) {
    case "navigate": {
      const nextView = control.dataset.view;
      if (nextView && views.includes(nextView as View)) {
        state.view = nextView as View;
        state.zoneMenuOpen = false;
        render();
        if (state.view === "Settings" && state.user?.role === "admin") void loadUsers();
        if (["Analytics", "Weather", "Trends"].includes(state.view)) void refreshDashboard();
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
    case "toggle-sidebar": {
      state.sidebarCollapsed = !state.sidebarCollapsed;
      localStorage.setItem("nileguard.sidebar-collapsed", String(state.sidebarCollapsed));
      render();
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
      if (userId && user && window.confirm(`Permanently delete ${user.name}'s account? This cannot be undone.`)) {
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
      void refreshDashboard();
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

async function initialize(): Promise<void> {
  try {
    const health = await getHealth();
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
