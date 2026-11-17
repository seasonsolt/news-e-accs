// Reader-facing numbers and axis windows for the four-dimensional view: 79.6 亿人, 1.9×10¹³ 瓦, 3 天.
import { eraAt, toAxis, yearToDate, dateToYear, type ChronicleEra, type ChronicleMetric, type ChronicleMilestone } from "@aihot/contracts/chronicle";

const SUPERSCRIPT = "⁰¹²³⁴⁵⁶⁷⁸⁹";

/** 1.9×10¹³ */
export function scientific(v: number, digits = 1): string {
  if (v === 0) return "0";
  const e = Math.floor(Math.log10(Math.abs(v)));
  if (e >= -2 && e <= 3) return trimFixed(v, e < 0 ? 3 : digits);
  const m = v / 10 ** e;
  const exp = String(e).replace("-", "⁻").replace(/\d/g, (d) => SUPERSCRIPT[Number(d)]!);
  return `${trimFixed(m, digits)}×10${exp}`;
}

function trimFixed(v: number, digits: number): string {
  return String(Number(v.toFixed(digits)));
}

/** 79.6 亿 · 520 万 · 3,000 */
export function chineseCount(v: number): string {
  if (v >= 1e8) return `${trimFixed(v / 1e8, v >= 1e9 ? 1 : 2)} 亿`;
  if (v >= 1e4) return `${trimFixed(v / 1e4, v >= 1e6 ? 0 : 1)} 万`;
  return Math.round(v).toLocaleString("en-US");
}

/** A span of seconds as the largest sensible unit: 0.07 秒 · 12 分钟 · 3 天 · 2 个月. */
export function duration(seconds: number): string {
  if (seconds < 1) return `${trimFixed(seconds, 2)} 秒`;
  if (seconds < 60) return `${trimFixed(seconds, 0)} 秒`;
  if (seconds < 3600) return `${trimFixed(seconds / 60, 0)} 分钟`;
  if (seconds < 86400) return `${trimFixed(seconds / 3600, 1)} 小时`;
  if (seconds < 86400 * 45) return `${trimFixed(seconds / 86400, 0)} 天`;
  if (seconds < 86400 * 365) return `${trimFixed(seconds / 86400 / 30.44, 0)} 个月`;
  return `${trimFixed(seconds / 86400 / 365.2425, 1)} 年`;
}

/** The value of a metric with its unit, as the dashboard shows it. */
export function metricValue(metric: ChronicleMetric, v: number): { value: string; unit: string } {
  switch (metric.key) {
    case "population":
      return { value: chineseCount(v), unit: "人" };
    case "energy":
      return { value: scientific(v), unit: "瓦" };
    case "messaging":
      return { value: duration(v), unit: "" };
    case "travel":
      return { value: Math.round(v).toLocaleString("en-US"), unit: "千米/时" };
    default:
      return { value: scientific(v), unit: metric.unit };
  }
}

/** A time for the URL: short, and exact enough to land on the same point of the axis. */
export function timeParam(t: number, now: number): string {
  return Number(t.toPrecision(15)).toString().replace("e+", "e");
}

export type AxisWindow = { lo: number; hi: number };
// About ×667 zoom separates dense milestone pictures by several pixels even on a phone.
export const MIN_AXIS_SPAN = 0.0015;

/** Position within the visible window; values outside 0..1 are off the track. */
export function projectAxis(u: number, view: AxisWindow): number {
  return (u - view.lo) / (view.hi - view.lo);
}

/** A factor above 1 zooms in, keeping the anchor under the same point of the track. */
export function zoomAxisWindow(view: AxisWindow, anchor: number, factor: number): AxisWindow {
  const span = Math.min(1, Math.max(MIN_AXIS_SPAN, (view.hi - view.lo) / factor));
  const lo = Math.min(1 - span, Math.max(0, anchor - projectAxis(anchor, view) * span));
  return { lo, hi: lo + span };
}

/** Pan in axis units, preserving the span when either end reaches the boundary. */
export function panAxisWindow(view: AxisWindow, du: number): AxisWindow {
  const span = view.hi - view.lo;
  const lo = Math.min(1 - span, Math.max(0, view.lo + du));
  return { lo, hi: lo + span };
}

/** Follow a new moment without changing the zoom level. */
export function keepAxisInView(view: AxisWindow, u: number): AxisWindow {
  const span = view.hi - view.lo;
  const target = Math.min(1, Math.max(0, u));
  if (target < view.lo) return { lo: target, hi: target + span };
  if (target > view.hi) return { lo: target - span, hi: target };
  return view;
}

/** PageUp/PageDown navigation follows adjacent era plates, regardless of their distance on the log axis. */
export function stepEra(eras: ChronicleEra[], t: number, direction: -1 | 1): number {
  const current = eras.findLastIndex((era) => era.from <= t);
  const next = eras[Math.min(eras.length - 1, Math.max(0, current + direction))];
  return next?.from ?? t;
}

/** Arrow keys visit era plates and illustrated milestones in chronological order. */
export function stepPicture(eras: ChronicleEra[], milestones: ChronicleMilestone[], t: number, direction: -1 | 1): number {
  const pictures = [...new Set([
    ...eras.map((era) => era.from + 1e-9),
    ...milestones.filter((m) => m.art).map((m) => m.t),
  ])].sort((a, b) => a - b);
  return (direction === 1 ? pictures.find((moment) => moment > t + 1e-6) : pictures.findLast((moment) => moment < t - 1e-6)) ?? t;
}

/**
 * The milestone standing at t, if any: a click snaps to one, and the deck then shows that event. Of two at the
 * same moment the illustrated one wins: its picture is the one in view.
 */
export function focusAt(milestones: ChronicleMilestone[], t: number, now: number): ChronicleMilestone | null {
  const u = toAxis(t, now);
  return milestones.reduce<ChronicleMilestone | null>((best, m) => {
    const d = Math.abs(toAxis(m.t, now) - u);
    if (d >= 0.0008) return best;
    const b = best ? Math.abs(toAxis(best.t, now) - u) : Infinity;
    return d < b || (d === b && m.art && !best!.art) ? m : best;
  }, null);
}

/** The deck's plate: the milestone's own drawing if it has one, otherwise its era's. `src` has no width suffix. */
export function plateOf(era: ChronicleEra, focus: ChronicleMilestone | null) {
  const moment = focus?.art ? focus : null;
  return moment
    ? { key: `m-${moment.id}`, at: moment.t, src: `/media/art/moments/${moment.art}`, alt: `${moment.title}（${moment.artStyle ?? era.artStyle}）` }
    : { key: `e-${era.id}`, at: era.from, src: `/media/art/epochs/${era.art}`, alt: `${era.title}（${era.artStyle}）` };
}

/** The plates the arrow keys lead to from t, either way: worth fetching before the reader asks. */
export function nearbyPlates(eras: ChronicleEra[], milestones: ChronicleMilestone[], t: number, now: number): string[] {
  return ([-1, 1] as const).flatMap((direction) => {
    const next = stepPicture(eras, milestones, t, direction);
    const era = next === t ? undefined : eraAt(eras, next);
    return era ? [plateOf(era, focusAt(milestones, next, now)).src] : [];
  });
}

/** The next capability's distance, using the same units as the moment label. */
export function untilLabel(from: number, to: number): string {
  return to - from < 1 / 365 ? "即将出现" : `${distanceLabel(to, from)}出现`;
}

/** "距今 300 年" or, past now, "300 年后". */
export function distanceLabel(t: number, now: number): string {
  const d = now - t;
  const abs = Math.abs(d);
  const words = abs >= 1e8 ? `${trimFixed(abs / 1e8, 1)} 亿年` : abs >= 1e4 ? `${trimFixed(abs / 1e4, 1)} 万年` : abs >= 1 ? `${Math.round(abs)} 年` : abs >= 1 / 12 ? `${Math.round(abs * 12)} 个月` : `${Math.max(0, Math.round(abs * 365.2425))} 天`;
  if (abs < 1 / 365) return "就是现在";
  return d > 0 ? `距今 ${words}` : `${words}后`;
}

/** An axis tick in English ("1000万年前" → "10M yr", "10年后" → "+10 yr"): the full phrases are wider than the ticks' spacing. */
export function compactTick(label: string): string {
  const m = /^(\d+(?:\.\d+)?)(亿年|万年|年|个月)(前|后)$/.exec(label);
  if (!m) return label === "现在" ? "Now" : label;
  const n = Number(m[1]) * (m[2] === "亿年" ? 1e8 : m[2] === "万年" ? 1e4 : 1);
  const value = new Intl.NumberFormat("en", { notation: "compact" }).format(n);
  return `${m[3] === "后" ? "+" : ""}${value} ${m[2] === "个月" ? "mo" : "yr"}`;
}

/** Calendar ticks for a zoomed window of time: years, then months, then days. Empty above a human lifetime, where powers of ten read better. */
export function calendarTicks(from: number, to: number): Array<[number, string]> {
  const span = to - from;
  if (span > 60) return [];
  const pick = (steps: number[], units: number) => steps.find((s) => units / s <= 7) ?? steps.at(-1)!;
  const ticks: Array<[number, string]> = [];
  if (span >= 3) {
    const step = pick([1, 2, 5, 10], span);
    for (let y = Math.ceil(from / step) * step; y <= to; y += step) ticks.push([y, String(y)]);
  } else if (span >= .25) {
    const step = pick([1, 2, 3, 6], span * 12);
    for (let m = Math.ceil(Math.floor(from) * 12 / step) * step; m / 12 <= to + 1 / 12; m += step) {
      const date = `${Math.floor(m / 12)}-${String(m % 12 + 1).padStart(2, "0")}`;
      ticks.push([dateToYear(`${date}-01`), date]);
    }
  } else {
    const step = pick([1, 2, 7, 14], span * 365);
    const day = 864e5;
    const start = yearToDate(from);
    if (!start) return [];
    const first = Date.parse(start);
    for (let ms = Math.ceil(first / day / step) * step * day; ms <= first + (span + 1 / 365) * 365.2425 * day; ms += step * day) {
      const date = new Date(ms).toISOString().slice(0, 10);
      ticks.push([dateToYear(date), date.slice(5)]);
    }
  }
  // At the edges a label would hang off the deck.
  const margin = span * .04;
  return ticks.filter(([t]) => t >= from + margin && t <= to - margin);
}

/**
 * The tunnel's pictures (depth-tunnel.ts): era openings and illustrated milestones in axis order, the stops of
 * stepPicture. An era that opens on an illustrated milestone is that milestone's plate on the deck, and
 * stepPicture stops there once: a second picture at the same moment would make that step fly two.
 */
export function tunnelPictures(eras: ChronicleEra[], milestones: ChronicleMilestone[]): Array<{ t: number; src: string; milestone?: ChronicleMilestone }> {
  const illustrated = milestones.filter((m) => m.art);
  return [
    ...eras.filter((era) => !illustrated.some((m) => Math.abs(m.t - era.from) < 1e-6)).map((era) => ({ t: era.from + 1e-9, src: `/media/art/epochs/${era.art}` })),
    ...illustrated.map((m) => ({ t: m.t, src: `/media/art/moments/${m.art}`, milestone: m })),
  ].sort((a, b) => a.t - b.t);
}

/** The picture the deck and the tunnel rest on at t: the nearest on the axis, so the view never hangs between two. -1 without pictures. */
export function restingPicture(pictures: Array<{ t: number }>, t: number, now: number): number {
  const u = toAxis(t, now);
  return pictures.reduce((best, p, i) => best < 0 || Math.abs(toAxis(p.t, now) - u) < Math.abs(toAxis(pictures[best]!.t, now) - u) ? i : best, -1);
}
