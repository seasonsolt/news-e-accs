// The time machine (四维视角): the curated civilization timeline (industry/chronicle/) and the pure
// math web and backend share: decimal years, the two-sided log axis, metric interpolation, labels.
// Times are astronomical decimal years (year 0 = 1 BCE; the Big Bang is about -13.787e9).

export type ChronicleCategory = "cosmos" | "life" | "human" | "energy" | "compute" | "ai" | "culture";
export type ChroniclePrecision = "ga" | "ma" | "ka" | "year" | "month" | "day";
export type ChronicleMetricKey = "population" | "energy" | "compute" | "messaging" | "travel";

export interface ChronicleEra {
  id: string;
  /** When the era begins. */
  from: number;
  title: string;
  summary: string;
  /** Plate slug under /media/art/epochs/. */
  art: string;
  /** The period visual style the plate is drawn in (shown in its caption). */
  artStyle: string;
  /** Set on the era that opens one of the axis's few broad epochs (宇宙, 生命…): the epoch's name. */
  epoch?: string;
  forecast?: boolean;
}

export interface ChronicleMilestone {
  id: string;
  t: number;
  precision: ChroniclePrecision;
  /** YYYY, YYYY-MM or YYYY-MM-DD for year/month/day precision in the common era. */
  date?: string;
  title: string;
  detail: string;
  category: ChronicleCategory;
  /** A capability humanity holds from this moment on (the "已存在" list). */
  capability?: string;
  source: string;
  /** A published forecast rather than an event: drawn dashed. */
  forecast?: { by: string; url: string };
  /** Plate slug under /media/art/moments/, drawn in the look of its own year. */
  art?: string;
  /** The period visual style that plate is drawn in. */
  artStyle?: string;
}

export interface ChronicleMetric {
  key: ChronicleMetricKey;
  label: string;
  unit: string;
  points: Array<[number, number]>;
  /** Points after this time are projections. */
  forecastFrom?: number;
  source: { name: string; url: string };
  note: string;
}

export interface ChronicleResponse {
  eras: ChronicleEra[];
  milestones: ChronicleMilestone[];
  metrics: ChronicleMetric[];
}

/** First day (Beijing) each part of the site has history for; null when it has none yet. */
export interface TimeMachineBounds {
  today: string;
  /** The earliest of the three: where the site's own record begins. */
  earliest: string | null;
  feed: string | null;
  hot: string | null;
  daily: string | null;
  /** Kardashev rating of today's primary power (the masthead's K pill); null without energy data. */
  kardashev: number | null;
}

// ---------------------------------------------------------------------------
// Decimal years
// ---------------------------------------------------------------------------

function yearStart(y: number): number {
  const d = new Date(0);
  d.setUTCFullYear(y, 0, 1);
  return d.getTime();
}

/** Astronomical decimal year of an instant (UTC). */
export function decimalYear(instant: Date | string | number): number {
  const d = new Date(instant);
  const y = d.getUTCFullYear();
  const start = yearStart(y);
  return y + (d.getTime() - start) / (yearStart(y + 1) - start);
}

/** Decimal year of the middle of a YYYY-MM-DD calendar day. */
export function dateToYear(date: string): number {
  return decimalYear(Date.parse(`${date}T12:00:00Z`));
}

/** YYYY-MM-DD for a decimal year in the common era (for linking a point on the axis to the site's days). */
export function yearToDate(t: number): string | null {
  if (!Number.isFinite(t) || t < 1 || t >= 10000) return null;
  const y = Math.floor(t);
  const start = yearStart(y);
  const ms = start + (t - y) * (yearStart(y + 1) - start);
  return new Date(ms).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// The axis: logarithmic in distance from now, with the width of each span set by hand. Equal width per
// power of ten would crush the last century, where most of the milestones sit, and spend a quarter of the
// axis on forecasts, so the width follows where things happen: the nearer now, the more room.
// ---------------------------------------------------------------------------

export const BIG_BANG = -13.787e9;
/** How far ahead the forecasts reach. */
export const AXIS_FUTURE_YEARS = 100;
/** [years from now, axis position]: the past year gets a fifth of the axis, about 17px a month on a desktop deck. */
const AXIS_STOPS: Array<[number, number]> = [[-1e9, .08], [-1e6, .14], [-1e3, .21], [-100, .31], [-10, .53], [-1, .74], [0, .93]];

/** Log of the distance from now, close to linear within the last year. */
function warp(dYears: number): number {
  return Math.sign(dYears) * Math.log10(1 + Math.abs(dYears));
}

function unwarp(x: number): number {
  return Math.sign(x) * (10 ** Math.abs(x) - 1);
}

function axisKnots(now: number): Array<[number, number]> {
  return [[warp(BIG_BANG - now), 0], ...AXIS_STOPS.map(([d, u]): [number, number] => [warp(d), u]), [warp(AXIS_FUTURE_YEARS), 1]];
}

/** Position of time `t` on the axis, 0 (the Big Bang) to 1 (the far future); `now` sits in between. */
export function toAxis(t: number, now: number): number {
  if (t <= BIG_BANG) return 0;
  if (t >= now + AXIS_FUTURE_YEARS) return 1;
  const x = warp(t - now);
  const knots = axisKnots(now);
  const i = knots.findIndex(([kx]) => kx > x);
  const [x0, u0] = knots[i - 1]!;
  const [x1, u1] = knots[i]!;
  return u0 + (x - x0) / (x1 - x0) * (u1 - u0);
}

/** The time at axis position `u` (0..1). */
export function fromAxis(u: number, now: number): number {
  if (u <= 0) return BIG_BANG;
  if (u >= 1) return now + AXIS_FUTURE_YEARS;
  const knots = axisKnots(now);
  const i = knots.findIndex(([, ku]) => ku > u);
  const [x0, u0] = knots[i - 1]!;
  const [x1, u1] = knots[i]!;
  return now + unwarp(x0 + (u - u0) / (u1 - u0) * (x1 - x0));
}

/** Ticks at whole powers of ten before and after now, as [time, label]. */
export function axisTicks(now: number): Array<[number, string]> {
  const ticks: Array<[number, string]> = [];
  for (let p = 10; p >= -1; p--) ticks.push([now - 10 ** p, `${agoLabel(10 ** p)}前`]);
  ticks.push([now, "现在"]);
  for (let p = 0; p <= 2; p++) ticks.push([now + 10 ** p, `${agoLabel(10 ** p)}后`]);
  return ticks;
}

function agoLabel(years: number): string {
  if (years >= 1e8) return `${trim(years / 1e8)}亿年`;
  if (years >= 1e4) return `${trim(years / 1e4)}万年`;
  if (years >= 1) return `${trim(years)}年`;
  if (years >= 1 / 12) return `${Math.round(years * 12)}个月`;
  return `${Math.max(1, Math.round(years * 365.2425))}天`;
}

function trim(n: number): string {
  return n >= 100 ? String(Math.round(n)) : String(Math.round(n * 10) / 10);
}

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

/** Reader label of a time: 138亿年前 · 30万年前 · 公元前3200年 · 1769年 · 1969年7月20日. */
export function timeLabel(t: number, now: number, precision?: ChroniclePrecision, date?: string): string {
  if (date && (precision === "day" || precision === "month")) {
    const [y, m, d] = date.split("-");
    return precision === "day" && d ? `${Number(y)}年${Number(m)}月${Number(d)}日` : `${Number(y)}年${Number(m)}月`;
  }
  if (t < -10000 || precision === "ga" || precision === "ma" || precision === "ka") {
    const ago = now - t;
    return ago >= 1e4 ? `${agoLabel(ago)}前` : `约${Math.round(ago)}年前`;
  }
  if (t < 1) return `公元前${1 - Math.floor(t)}年`;
  return `${Math.floor(t)}年`;
}

// ---------------------------------------------------------------------------
// What a moment holds
// ---------------------------------------------------------------------------

/** Value of a metric at `t`, log-linear between its sourced points; null before the first point. */
export function interpolateMetric(points: ReadonlyArray<readonly [number, number]>, t: number, now: number, forecastFrom?: number): number | null {
  if (!points.length || !Number.isFinite(t) || t < points[0]![0]) return null;
  const last = points[points.length - 1]!;
  if (t > now && (forecastFrom === undefined || t > last[0])) return null;
  if (t >= last[0]) return last[1];
  let i = 1;
  while (points[i]![0] < t) i++;
  const [t0, v0] = points[i - 1]!;
  const [t1, v1] = points[i]!;
  if (t1 === t0) return v1;
  const f = (t - t0) / (t1 - t0);
  return 10 ** (Math.log10(v0) + f * (Math.log10(v1) - Math.log10(v0)));
}

/** Kardashev rating from the power a civilization commands (Sagan's interpolation). */
export function kardashev(watts: number): number {
  return (Math.log10(watts) - 6) / 10;
}

/** The era in effect at `t` (eras sorted by `from`). */
export function eraAt(eras: readonly ChronicleEra[], t: number): ChronicleEra | null {
  let found: ChronicleEra | null = null;
  for (const e of eras) {
    if (e.from > t) break;
    found = e;
  }
  return found ?? eras[0] ?? null;
}

/** Capabilities already in hand at `t` and the next ones not yet, nearest first. */
export function capabilitiesAt(milestones: readonly ChronicleMilestone[], t: number, upcoming = 6) {
  const withCap = milestones.filter((m) => m.capability && !m.forecast);
  return {
    held: withCap.filter((m) => m.t <= t),
    next: withCap.filter((m) => m.t > t).slice(0, upcoming),
  };
}
