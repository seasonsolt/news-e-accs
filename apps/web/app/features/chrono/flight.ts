// The voyage's coordinate: one equal segment per era, logarithmic time inside it.
// A single log of "years before now" piles the early universe onto one point and squeezes
// the many AI eras of the last decade into a short stretch. Equal segments give the Big Bang
// and a one-year era the same length of flight; log1p inside a segment keeps a long era from
// being one empty hop between its endpoints.
import { AXIS_FUTURE_YEARS, type ChronicleCategory, type ChronicleEra, type ChronicleMilestone } from "@aihot/contracts/chronicle";

export type Vec3 = [number, number, number];

/** World length of the whole route, in scene units. */
export const FLIGHT_LENGTH = 1568;

const TURNS = 2.15;

function clamp01(u: number): number {
  return Math.min(1, Math.max(0, u));
}

/** 0 at the first era, 1 at the far end of the axis. Eras must be sorted by `from`. */
export function flightCoordinate(t: number, eras: readonly Pick<ChronicleEra, "from">[], now: number): number {
  const n = eras.length;
  if (n === 0) return 0;
  const end = now + AXIS_FUTURE_YEARS;
  const first = eras[0]!.from;
  const last = eras[n - 1]!.from;
  const clamped = Math.min(Math.max(t, first), Math.max(end, last));
  let i = 0;
  while (i < n - 1 && eras[i + 1]!.from <= clamped) i++;
  const start = eras[i]!.from;
  const stop = i + 1 < n ? eras[i + 1]!.from : Math.max(end, start);
  const span = Math.max(stop - start, 1e-9);
  const local = Math.log1p(Math.max(0, clamped - start)) / Math.log1p(span);
  return (i + Math.min(1, Math.max(0, local))) / n;
}

/** Inverse of {@link flightCoordinate}. */
export function flightTime(u: number, eras: readonly Pick<ChronicleEra, "from">[], now: number): number {
  const n = eras.length;
  if (n === 0) return now;
  const end = now + AXIS_FUTURE_YEARS;
  const x = clamp01(u) * n;
  const i = Math.min(n - 1, x >= n ? n - 1 : Math.floor(x));
  const local = x >= n ? 1 : x - i;
  const start = eras[i]!.from;
  const stop = i + 1 < n ? eras[i + 1]!.from : Math.max(end, start);
  const span = Math.max(stop - start, 1e-9);
  return start + Math.expm1(Math.min(1, Math.max(0, local)) * Math.log1p(span));
}

/** Flight coordinate where the predictive eras begin, or null when none are marked. */
export function forecastStart(eras: readonly Pick<ChronicleEra, "from" | "forecast">[], now: number): number | null {
  const first = eras.find((era) => era.forecast);
  return first ? flightCoordinate(first.from, eras, now) : null;
}

function scale(a: Vec3, s: number): Vec3 {
  return [a[0] * s, a[1] * s, a[2] * s];
}
function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}
function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function len(a: Vec3): number {
  return Math.hypot(a[0], a[1], a[2]);
}
function norm(a: Vec3): Vec3 {
  const l = len(a);
  return l < 1e-8 ? [0, 0, 1] : scale(a, 1 / l);
}
function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

/** A gentle helix so the route reads as a flight, not a ruler. */
export function pathPoint(u: number): Vec3 {
  const t = clamp01(u);
  return [
    Math.sin(t * TURNS * Math.PI * 2) * 26,
    Math.cos(t * TURNS * Math.PI * 1.2) * 11,
    -t * FLIGHT_LENGTH,
  ];
}

export interface PathFrame {
  position: Vec3;
  tangent: Vec3;
  right: Vec3;
  up: Vec3;
}

export function pathFrame(u: number): PathFrame {
  const position = pathPoint(u);
  const tangent = norm(sub(pathPoint(Math.min(1, u + 0.0015)), position));
  let right = cross(tangent, [0, 1, 0]);
  if (len(right) < 1e-4) right = [1, 0, 0];
  right = norm(right);
  const up = norm(cross(right, tangent));
  return { position, tangent, right, up };
}

/** Camera just behind and above the route, looking toward the bodies on the right. */
export function cameraPose(u: number): { position: Vec3; target: Vec3 } {
  const here = pathFrame(u);
  const look = pathFrame(Math.min(1, u + 0.016));
  const position = add(add(add(here.position, scale(here.tangent, -18)), scale(here.up, 7.5)), scale(here.right, -9));
  const target = add(look.position, scale(look.right, 8));
  return { position, target };
}

export function hashUnit(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
}

const PLANET_COLORS = ["#c4b49a", "#8eafc9", "#d08a5a", "#7ea88a", "#e0c27a", "#9aa7c4", "#c48b7a", "#6f9eae"];

export interface EraStop {
  index: number;
  id: string;
  u: number;
  forecast: boolean;
  kind: "planet" | "nebula";
  seed: number;
  position: Vec3;
  color: string;
  art: string;
}

export function eraStops(eras: readonly ChronicleEra[], now: number): EraStop[] {
  return eras.map((era, index) => {
    const u = flightCoordinate(era.from, eras, now);
    const frame = pathFrame(u);
    const seed = hashUnit(era.id);
    const forecast = !!era.forecast;
    // The first ages are clouds of light; later ages are worlds. Forecasts stay worlds, drawn as projections.
    const kind = !forecast && (index < 3 || seed < 0.18) ? "nebula" : "planet";
    return {
      index,
      id: era.id,
      u,
      forecast,
      kind,
      seed,
      position: add(frame.position, scale(frame.right, 12)),
      color: forecast ? "#c8b48a" : PLANET_COLORS[Math.floor(seed * PLANET_COLORS.length) % PLANET_COLORS.length]!,
      art: era.art,
    };
  });
}

const CATEGORY_SLOT: Record<ChronicleCategory, number> = {
  cosmos: 0, life: 1, human: 2, energy: 3, compute: 4, ai: 5, culture: 6,
};

export interface StarStop {
  id: string;
  category: ChronicleCategory;
  forecast: boolean;
  u: number;
  position: Vec3;
}

/** One star per milestone, lifted off the route so it is not buried in its era's body. */
export function starStops(milestones: readonly ChronicleMilestone[], eras: readonly ChronicleEra[], now: number): StarStop[] {
  return milestones.map((milestone) => {
    const u = flightCoordinate(milestone.t, eras, now);
    const frame = pathFrame(u);
    const slot = CATEGORY_SLOT[milestone.category];
    const h = hashUnit(milestone.id);
    const position = add(
      add(add(frame.position, scale(frame.right, 3.2 + (slot % 4) * 1.25)), scale(frame.up, 5.6 + h * 4.8 + Math.floor(slot / 4) * 2.3)),
      scale(frame.tangent, (h - 0.5) * 2.6),
    );
    return { id: milestone.id, category: milestone.category, forecast: !!milestone.forecast, u, position };
  });
}
