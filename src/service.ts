/**
 * x402-weather-guard — service layer.
 *
 * Two live, keyless upstreams:
 *   - Open-Meteo  https://api.open-meteo.com  (global hourly forecast, no key)
 *   - NWS         https://api.weather.gov     (active US watches/warnings, no key)
 *
 * Open-Meteo covers the whole planet and is the forecast of record here. NWS is
 * consulted for active alerts, which only exist inside US jurisdictions; outside
 * them it simply returns an empty set and the response says so. An NWS failure
 * never fails the request — the forecast is still delivered, with the alert
 * lookup's status reported alongside it.
 */

const OPEN_METEO = "https://api.open-meteo.com/v1/forecast";
const NWS_ALERTS = "https://api.weather.gov/alerts/active";
const TIMEOUT_MS = 12_000;

const CONTACT = process.env.CONTACT_EMAIL || "nichxbt@gmail.com";
/** NWS asks every automated caller to identify itself with a contact address. */
const NWS_UA = `x402-weather-guard ${CONTACT}`;

/** The live, keyless upstreams this service queries. */
export const UPSTREAMS = ["Open-Meteo", "NWS"] as const;

const HOURLY_VARS = [
  "temperature_2m",
  "apparent_temperature",
  "relative_humidity_2m",
  "precipitation_probability",
  "precipitation",
  "wind_speed_10m",
  "wind_gusts_10m",
  "cloud_cover",
  "visibility",
  "weather_code",
].join(",");

/* ────────────────────────── errors ────────────────────────── */

export class UpstreamError extends Error {
  constructor(source: string, detail: string) {
    super(`${source}: ${detail}`);
    this.name = "UpstreamError";
  }
}

export class BadRequestError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "BadRequestError";
    this.code = code;
  }
}

/** One retry on a transport-level failure — these upstreams are free and occasionally blink. */
async function getJson(
  url: string,
  source: string,
  headers: Record<string, string> = {},
): Promise<Record<string, any>> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { Accept: "application/json", ...headers },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      lastErr = new UpstreamError(source, `unreachable — ${(err as Error).message}`);
      if (attempt === 0) await new Promise((r) => setTimeout(r, 750));
      continue;
    }
    if (res.status >= 500 && attempt === 0) {
      lastErr = new UpstreamError(source, `responded HTTP ${res.status}`);
      await new Promise((r) => setTimeout(r, 750));
      continue;
    }
    if (!res.ok) throw new UpstreamError(source, `responded HTTP ${res.status}`);
    return (await res.json()) as Record<string, any>;
  }
  throw lastErr;
}

/* ────────────────────────── WMO weather codes ────────────────────────── */

const WMO: Record<number, string> = {
  0: "clear sky",
  1: "mainly clear",
  2: "partly cloudy",
  3: "overcast",
  45: "fog",
  48: "depositing rime fog",
  51: "light drizzle",
  53: "moderate drizzle",
  55: "dense drizzle",
  56: "light freezing drizzle",
  57: "dense freezing drizzle",
  61: "slight rain",
  63: "moderate rain",
  65: "heavy rain",
  66: "light freezing rain",
  67: "heavy freezing rain",
  71: "slight snowfall",
  73: "moderate snowfall",
  75: "heavy snowfall",
  77: "snow grains",
  80: "slight rain showers",
  81: "moderate rain showers",
  82: "violent rain showers",
  85: "slight snow showers",
  86: "heavy snow showers",
  95: "thunderstorm",
  96: "thunderstorm with slight hail",
  99: "thunderstorm with heavy hail",
};

/** Codes that are dangerous regardless of any numeric threshold. */
const SEVERE_CODES = new Set([65, 67, 75, 82, 86, 95, 96, 99]);

/* ────────────────────────── forecast ────────────────────────── */

export interface Hour {
  time: string;
  temperatureC: number | null;
  feelsLikeC: number | null;
  humidityPct: number | null;
  precipitationProbabilityPct: number | null;
  precipitationMm: number | null;
  windKph: number | null;
  gustKph: number | null;
  cloudCoverPct: number | null;
  visibilityM: number | null;
  weatherCode: number | null;
  conditions: string;
}

export interface Alert {
  event: string;
  severity: string;
  urgency: string;
  certainty: string;
  onset: string | null;
  ends: string | null;
  headline: string | null;
  areaDesc: string | null;
}

export interface ForecastResult {
  source: { forecast: "open-meteo"; alerts: "nws" };
  location: {
    requested: { latitude: number; longitude: number };
    resolved: { latitude: number; longitude: number; elevationM: number | null };
    timezone: string;
  };
  window: { start: string; end: string; hours: number };
  units: Record<string, string>;
  hourly: Hour[];
  alerts: Alert[];
  alertStatus: string;
  retrievedAt: string;
}

const n = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Open-Meteo returns naive local times; stamp them with the offset we asked for. */
function isoUtc(t: string): string {
  return /Z|[+-]\d{2}:?\d{2}$/.test(t) ? new Date(t).toISOString() : new Date(`${t}Z`).toISOString();
}

export function validateCoords(lat: number, lon: number): void {
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    throw new BadRequestError("invalid_latitude", "'lat' must be a number between -90 and 90.");
  }
  if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
    throw new BadRequestError("invalid_longitude", "'lon' must be a number between -180 and 180.");
  }
}

/** Active NWS alerts for a point. Empty (with a reason) outside US jurisdictions. */
async function fetchAlerts(lat: number, lon: number): Promise<{ alerts: Alert[]; status: string }> {
  try {
    const data = await getJson(
      `${NWS_ALERTS}?point=${lat.toFixed(4)},${lon.toFixed(4)}`,
      "NWS",
      { "User-Agent": NWS_UA },
    );
    const features: Array<Record<string, any>> = Array.isArray(data.features) ? data.features : [];
    return {
      alerts: features.map((f) => {
        const p = f.properties ?? {};
        return {
          event: String(p.event ?? ""),
          severity: String(p.severity ?? "Unknown"),
          urgency: String(p.urgency ?? "Unknown"),
          certainty: String(p.certainty ?? "Unknown"),
          onset: p.onset ?? p.effective ?? null,
          ends: p.ends ?? p.expires ?? null,
          headline: p.headline ?? null,
          areaDesc: p.areaDesc ?? null,
        };
      }),
      status: features.length === 0 ? "ok (no active alerts)" : "ok",
    };
  } catch (err) {
    // NWS only covers US jurisdictions and is the optional half of this
    // service. A failure degrades to "no alert data", never a failed request.
    return { alerts: [], status: `unavailable: ${(err as Error).message}` };
  }
}

/**
 * Hourly forecast for a point over a window of `hours` starting at `startIso`
 * (default: now). Global coverage via Open-Meteo, plus active NWS alerts.
 */
export async function forecast(
  lat: number,
  lon: number,
  opts: { hours?: number; start?: string } = {},
): Promise<ForecastResult> {
  validateCoords(lat, lon);
  const hours = Math.min(Math.max(opts.hours ?? 24, 1), 168);
  const start = opts.start ? new Date(opts.start) : new Date();
  if (Number.isNaN(start.getTime())) {
    throw new BadRequestError("invalid_start", "'start' must be an ISO-8601 timestamp.");
  }

  // Open-Meteo bills by days, and the window may straddle midnight UTC.
  const days = Math.min(Math.ceil(hours / 24) + 2, 16);
  const url =
    `${OPEN_METEO}?latitude=${lat}&longitude=${lon}&hourly=${HOURLY_VARS}` +
    `&forecast_days=${days}&timezone=UTC&wind_speed_unit=kmh&past_hours=1`;

  const [data, alertResult] = await Promise.all([
    getJson(url, "Open-Meteo"),
    fetchAlerts(lat, lon),
  ]);

  const h = data.hourly ?? {};
  const times: string[] = Array.isArray(h.time) ? h.time : [];
  if (times.length === 0) throw new UpstreamError("Open-Meteo", "returned no hourly series");

  const startMs = start.getTime();
  const endMs = startMs + hours * 3_600_000;
  const hourly: Hour[] = [];
  for (let i = 0; i < times.length; i++) {
    const t = isoUtc(times[i]);
    const ms = Date.parse(t);
    if (ms < startMs - 3_600_000 || ms >= endMs) continue;
    const code = n(h.weather_code?.[i]);
    hourly.push({
      time: t,
      temperatureC: n(h.temperature_2m?.[i]),
      feelsLikeC: n(h.apparent_temperature?.[i]),
      humidityPct: n(h.relative_humidity_2m?.[i]),
      precipitationProbabilityPct: n(h.precipitation_probability?.[i]),
      precipitationMm: n(h.precipitation?.[i]),
      windKph: n(h.wind_speed_10m?.[i]),
      gustKph: n(h.wind_gusts_10m?.[i]),
      cloudCoverPct: n(h.cloud_cover?.[i]),
      visibilityM: n(h.visibility?.[i]),
      weatherCode: code,
      conditions: code != null ? (WMO[code] ?? `WMO code ${code}`) : "unknown",
    });
  }

  return {
    source: { forecast: "open-meteo", alerts: "nws" },
    location: {
      requested: { latitude: lat, longitude: lon },
      resolved: {
        latitude: n(data.latitude) ?? lat,
        longitude: n(data.longitude) ?? lon,
        elevationM: n(data.elevation),
      },
      timezone: "UTC",
    },
    window: {
      start: new Date(startMs).toISOString(),
      end: new Date(endMs).toISOString(),
      hours,
    },
    units: {
      temperatureC: "°C",
      precipitationMm: "mm",
      precipitationProbabilityPct: "%",
      windKph: "km/h",
      gustKph: "km/h",
      visibilityM: "m",
    },
    hourly,
    alerts: alertResult.alerts,
    alertStatus: alertResult.status,
    retrievedAt: new Date().toISOString(),
  };
}

/* ────────────────────────── decision ────────────────────────── */

export interface Thresholds {
  maxPrecipProbabilityPct: number;
  maxPrecipMm: number;
  maxWindKph: number;
  maxGustKph: number;
  minTempC: number;
  maxTempC: number;
  minVisibilityM: number;
}

/**
 * Threshold profiles for the activities agents actually plan. Each one is a
 * defensible default, not a guess dressed up as science — override any field
 * with the `thresholds` body parameter.
 */
export const ACTIVITY_PROFILES: Record<string, Thresholds> = {
  // A general outdoor gathering: people standing around, some shelter.
  "outdoor-event": {
    maxPrecipProbabilityPct: 35,
    maxPrecipMm: 0.5,
    maxWindKph: 30,
    maxGustKph: 45,
    minTempC: 5,
    maxTempC: 33,
    minVisibilityM: 1000,
  },
  // Small consumer drones: wind and gusts dominate, rain is disqualifying.
  "drone-flight": {
    maxPrecipProbabilityPct: 20,
    maxPrecipMm: 0.1,
    maxWindKph: 24,
    maxGustKph: 32,
    minTempC: -5,
    maxTempC: 40,
    minVisibilityM: 5000,
  },
  // Road cycling: headwind and wet roads matter more than temperature.
  cycling: {
    maxPrecipProbabilityPct: 40,
    maxPrecipMm: 1,
    maxWindKph: 35,
    maxGustKph: 50,
    minTempC: 2,
    maxTempC: 35,
    minVisibilityM: 500,
  },
  // Crane and roof work: gusts are the binding constraint.
  construction: {
    maxPrecipProbabilityPct: 50,
    maxPrecipMm: 2,
    maxWindKph: 32,
    maxGustKph: 40,
    minTempC: -10,
    maxTempC: 38,
    minVisibilityM: 500,
  },
  // Golden-hour photography: cloud and visibility carry the shoot.
  photography: {
    maxPrecipProbabilityPct: 25,
    maxPrecipMm: 0.2,
    maxWindKph: 40,
    maxGustKph: 60,
    minTempC: -15,
    maxTempC: 40,
    minVisibilityM: 8000,
  },
  // A permissive baseline for "will this be unpleasant?"
  generic: {
    maxPrecipProbabilityPct: 50,
    maxPrecipMm: 2,
    maxWindKph: 40,
    maxGustKph: 60,
    minTempC: -5,
    maxTempC: 38,
    minVisibilityM: 200,
  },
};

export type Verdict = "go" | "risky" | "no-go";

export interface Breach {
  factor: string;
  at: string;
  observed: number | string;
  limit: number | string;
  severity: "blocking" | "marginal";
  note: string;
}

export interface AlternativeWindow {
  start: string;
  end: string;
  verdict: Verdict;
  worstMarginPct: number;
  summary: string;
}

export interface DecisionResult {
  verdict: Verdict;
  summary: string;
  confidence: number;
  activity: string;
  thresholds: Thresholds;
  location: ForecastResult["location"];
  window: { start: string; end: string; hours: number };
  reasoning: Breach[];
  hoursEvaluated: number;
  worstHour: Hour | null;
  alerts: Alert[];
  alertStatus: string;
  alternativeWindows: AlternativeWindow[];
  hourly: Hour[];
  source: ForecastResult["source"];
  retrievedAt: string;
}

/** How badly one hour breaks a threshold. `null` when the value is missing. */
function evaluateHour(hour: Hour, t: Thresholds): { breaches: Breach[]; marginPct: number } {
  const breaches: Breach[] = [];
  const margins: number[] = [];

  const over = (
    factor: string,
    value: number | null,
    limit: number,
    blockingAt: number,
    unit: string,
    note: string,
  ) => {
    if (value == null) return;
    margins.push(limit === 0 ? (value > 0 ? -100 : 100) : ((limit - value) / limit) * 100);
    if (value > limit) {
      breaches.push({
        factor,
        at: hour.time,
        observed: `${value}${unit}`,
        limit: `${limit}${unit}`,
        severity: value >= blockingAt ? "blocking" : "marginal",
        note,
      });
    }
  };

  over(
    "precipitationProbability",
    hour.precipitationProbabilityPct,
    t.maxPrecipProbabilityPct,
    Math.min(t.maxPrecipProbabilityPct * 2, 90),
    "%",
    "Chance of precipitation exceeds the activity's tolerance.",
  );
  over(
    "precipitation",
    hour.precipitationMm,
    t.maxPrecipMm,
    Math.max(t.maxPrecipMm * 3, 2),
    " mm",
    "Expected rainfall exceeds the activity's tolerance.",
  );
  over(
    "wind",
    hour.windKph,
    t.maxWindKph,
    t.maxWindKph * 1.4,
    " km/h",
    "Sustained wind exceeds the activity's limit.",
  );
  over(
    "gusts",
    hour.gustKph,
    t.maxGustKph,
    t.maxGustKph * 1.3,
    " km/h",
    "Gusts exceed the activity's limit — usually the binding constraint.",
  );

  if (hour.temperatureC != null) {
    if (hour.temperatureC > t.maxTempC) {
      breaches.push({
        factor: "temperature",
        at: hour.time,
        observed: `${hour.temperatureC}°C`,
        limit: `max ${t.maxTempC}°C`,
        severity: hour.temperatureC > t.maxTempC + 5 ? "blocking" : "marginal",
        note: "Too hot for the activity's comfort range.",
      });
    } else if (hour.temperatureC < t.minTempC) {
      breaches.push({
        factor: "temperature",
        at: hour.time,
        observed: `${hour.temperatureC}°C`,
        limit: `min ${t.minTempC}°C`,
        severity: hour.temperatureC < t.minTempC - 5 ? "blocking" : "marginal",
        note: "Too cold for the activity's comfort range.",
      });
    }
    const span = Math.max(t.maxTempC - t.minTempC, 1);
    const distance = Math.min(hour.temperatureC - t.minTempC, t.maxTempC - hour.temperatureC);
    margins.push((distance / span) * 100);
  }

  if (hour.visibilityM != null && hour.visibilityM < t.minVisibilityM) {
    breaches.push({
      factor: "visibility",
      at: hour.time,
      observed: `${hour.visibilityM} m`,
      limit: `min ${t.minVisibilityM} m`,
      severity: hour.visibilityM < t.minVisibilityM / 2 ? "blocking" : "marginal",
      note: "Visibility below the activity's minimum.",
    });
  }

  if (hour.weatherCode != null && SEVERE_CODES.has(hour.weatherCode)) {
    breaches.push({
      factor: "conditions",
      at: hour.time,
      observed: hour.conditions,
      limit: "no severe conditions",
      severity: "blocking",
      note: `Forecast conditions (${hour.conditions}) are hazardous for any outdoor plan.`,
    });
    margins.push(-100);
  }

  return {
    breaches,
    marginPct: margins.length ? Math.min(...margins) : 0,
  };
}

function verdictFor(breaches: Breach[], alerts: Alert[]): Verdict {
  const severeAlert = alerts.some((a) => a.severity === "Severe" || a.severity === "Extreme");
  if (severeAlert || breaches.some((b) => b.severity === "blocking")) return "no-go";
  if (breaches.length > 0 || alerts.length > 0) return "risky";
  return "go";
}

/**
 * Go / no-go verdict for a point and a time window, with the reasoning that
 * produced it and alternative windows that would clear the same bar.
 */
export async function decision(input: {
  lat: number;
  lon: number;
  start?: string;
  end?: string;
  activity?: string;
  thresholds?: Partial<Thresholds>;
  lookaheadHours?: number;
}): Promise<DecisionResult> {
  validateCoords(input.lat, input.lon);

  const activity = (input.activity ?? "outdoor-event").toLowerCase();
  const profile = ACTIVITY_PROFILES[activity];
  if (!profile) {
    throw new BadRequestError(
      "unknown_activity",
      `Unknown activity "${activity}". Use one of: ${Object.keys(ACTIVITY_PROFILES).join(", ")} — or omit it and pass explicit thresholds.`,
    );
  }
  const thresholds: Thresholds = { ...profile, ...(input.thresholds ?? {}) };

  const start = input.start ? new Date(input.start) : new Date();
  if (Number.isNaN(start.getTime())) {
    throw new BadRequestError("invalid_start", "'start' must be an ISO-8601 timestamp.");
  }
  const end = input.end ? new Date(input.end) : new Date(start.getTime() + 3 * 3_600_000);
  if (Number.isNaN(end.getTime())) {
    throw new BadRequestError("invalid_end", "'end' must be an ISO-8601 timestamp.");
  }
  if (end.getTime() <= start.getTime()) {
    throw new BadRequestError("invalid_window", "'end' must be after 'start'.");
  }
  const windowHours = Math.ceil((end.getTime() - start.getTime()) / 3_600_000);
  if (windowHours > 72) {
    throw new BadRequestError("window_too_long", "The decision window may not exceed 72 hours.");
  }
  const lookahead = Math.min(Math.max(input.lookaheadHours ?? 48, windowHours), 160);

  // One forecast pull covers both the window and the search for alternatives.
  const fc = await forecast(input.lat, input.lon, {
    hours: lookahead + windowHours,
    start: start.toISOString(),
  });

  const inWindow = fc.hourly.filter((h) => {
    const ms = Date.parse(h.time);
    return ms >= start.getTime() - 1 && ms < end.getTime();
  });

  const reasoning: Breach[] = [];
  let worstHour: Hour | null = null;
  let worstMargin = Infinity;
  for (const hour of inWindow) {
    const { breaches, marginPct } = evaluateHour(hour, thresholds);
    reasoning.push(...breaches);
    if (marginPct < worstMargin) {
      worstMargin = marginPct;
      worstHour = hour;
    }
  }

  const activeAlerts = fc.alerts.filter((a) => {
    if (!a.ends) return true;
    const endsMs = Date.parse(a.ends);
    return Number.isNaN(endsMs) || endsMs > start.getTime();
  });

  const verdict = verdictFor(reasoning, activeAlerts);

  /* Alternative windows: slide a same-length window across the forecast after
   * the requested one and keep the ones that would come back "go". They never
   * overlap the window you asked about — an alternative you cannot take is not
   * an alternative. */
  const alternatives: AlternativeWindow[] = [];
  const all = fc.hourly;
  for (let i = 0; i + windowHours <= all.length && alternatives.length < 5; i++) {
    const slice = all.slice(i, i + windowHours);
    const sliceStart = Date.parse(slice[0].time);
    if (sliceStart < end.getTime()) continue;
    let ok = true;
    let minMargin = Infinity;
    for (const hour of slice) {
      const { breaches, marginPct } = evaluateHour(hour, thresholds);
      if (breaches.length > 0) {
        ok = false;
        break;
      }
      minMargin = Math.min(minMargin, marginPct);
    }
    if (!ok) continue;
    // Keep suggestions spread out rather than five consecutive hours.
    const last = alternatives.at(-1);
    if (last && sliceStart - Date.parse(last.start) < windowHours * 3_600_000) continue;
    const altEnd = new Date(sliceStart + windowHours * 3_600_000).toISOString();
    alternatives.push({
      start: slice[0].time,
      end: altEnd,
      verdict: "go",
      worstMarginPct: Math.round(Math.max(minMargin, 0)),
      summary: `${slice[0].conditions}, ${slice[0].temperatureC ?? "?"}°C, wind ${slice[0].windKph ?? "?"} km/h — clears every ${activity} threshold.`,
    });
  }

  const blocking = reasoning.filter((b) => b.severity === "blocking");
  const alertPhrase =
    activeAlerts.length === 0
      ? ""
      : `${activeAlerts.length} active ${activeAlerts.length === 1 ? "alert" : "alerts"} for this area (${[...new Set(activeAlerts.map((a) => a.event))].join(", ")})`;
  const breachPhrase =
    reasoning.length === 0
      ? ""
      : `${reasoning.length} threshold ${reasoning.length === 1 ? "breach" : "breaches"} (${[...new Set(reasoning.map((b) => b.factor))].join(", ")})`;
  const altPhrase = alternatives.length
    ? ` ${alternatives.length} alternative ${alternatives.length === 1 ? "window" : "windows"} below would clear the same bar.`
    : "";

  const summary =
    verdict === "go"
      ? `Go. Every hour of the ${windowHours}h window clears the ${activity} thresholds, and no alerts are in effect.`
      : verdict === "risky"
        ? `Risky. ${[breachPhrase, alertPhrase].filter(Boolean).join(" and ")} — none disqualifying on its own. Proceed with a contingency.${altPhrase}`
        : `No-go. ${[blocking.length ? `${blocking.length} disqualifying ${blocking.length === 1 ? "condition" : "conditions"} (${[...new Set(blocking.map((b) => b.factor))].join(", ")})` : "", activeAlerts.length ? alertPhrase : ""].filter(Boolean).join(" and ")} in the window.${altPhrase}`;

  // Confidence falls with forecast lead time and with how close the call is.
  const leadHours = Math.max((start.getTime() - Date.now()) / 3_600_000, 0);
  const leadPenalty = Math.min(leadHours / 168, 0.35);
  const closeness = verdict === "risky" ? 0.2 : Math.min(Math.abs(worstMargin) / 100, 0.15);
  const confidence = Math.round(Math.max(0.4, 0.95 - leadPenalty - closeness) * 100) / 100;

  return {
    verdict,
    summary,
    confidence,
    activity,
    thresholds,
    location: fc.location,
    window: { start: start.toISOString(), end: end.toISOString(), hours: windowHours },
    reasoning,
    hoursEvaluated: inWindow.length,
    worstHour,
    alerts: activeAlerts,
    alertStatus: fc.alertStatus,
    alternativeWindows: alternatives,
    hourly: inWindow,
    source: fc.source,
    retrievedAt: new Date().toISOString(),
  };
}
