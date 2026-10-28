// The embeddable PNG (backend/chart.ts) lays the index's lines in matchsticks, on paper. The page draws
// plain lines on the night ground, in its own colours.

/** Match heads, hotter as the capability rises. */
export const TIER_COLORS = ["#b08a4a", "#d9a441", "#ff8a3d", "#e0481a"];
export const tierColor = (i: number) => TIER_COLORS[i % TIER_COLORS.length]!;

/** A matchstick's length, the gap between two laid end to end, and the shortest broken stub worth drawing. */
export const MATCH = 52;
const GAP = 2.5;
const STUB = 8;
export const WOOD = "#dcb87e";
export const WOOD_EDGE = "#a47c43";
/** From a match's end back to the centre of its head. */
export const HEAD_INSET = 5.6;

/** A straight run of a stepped line: from (x, y), `len` long, at `angle` degrees (0 right, 90 down, −90 up). */
export type Run = { x: number; y: number; len: number; angle: number };

export function runsThrough(vertices: Array<[number, number]>): Run[] {
  const out: Run[] = [];
  for (let j = 1; j < vertices.length; j++) {
    const [ax, ay] = vertices[j - 1]!;
    const [bx, by] = vertices[j]!;
    const len = Math.hypot(bx - ax, by - ay);
    if (len >= 1) out.push({ x: ax, y: ay, len, angle: (Math.atan2(by - ay, bx - ax) * 180) / Math.PI });
  }
  return out;
}

export type Stick = { at: number; len: number; head: boolean };

/**
 * Matches laid end to end along a run, heads forward. Whole matches stretch by a few pixels to close a
 * small remainder; a larger one becomes a headless broken stub at the start; a run too short for a
 * match gets one short match (or a stub).
 */
export function sticksAlong(len: number): Stick[] {
  const n = Math.floor((len + GAP) / (MATCH + GAP));
  if (n === 0) return len >= 20 ? [{ at: 0, len, head: true }] : len >= STUB / 2 ? [{ at: 0, len, head: false }] : [];
  const rest = len - (n * MATCH + (n - 1) * GAP);
  const out: Stick[] = [];
  let at = 0;
  let size = MATCH;
  if (rest >= STUB + GAP) {
    out.push({ at: 0, len: rest - GAP, head: false });
    at = rest;
  } else size = MATCH + rest / n;
  for (let k = 0; k < n; k++, at += size + GAP) out.push({ at, len: size, head: true });
  return out;
}

/** The parts of one match lying along +x from `at`, as plain shapes (SVG text in the PNG). */
export function matchShapes({ at, len, head }: Stick, tint: string) {
  return {
    stick: { x: at, y: -2.4, width: Math.max(1, len - (head ? 5 : 0)), height: 4.8, rx: 1.4, fill: WOOD, stroke: WOOD_EDGE, strokeWidth: 0.7 },
    grain: { x: at + 1, y: -1.6, width: Math.max(0, len - (head ? 8 : 2)), height: 1, rx: 0.5, fill: "#fff", opacity: 0.3 },
    head: head ? { cx: at + len - HEAD_INSET, cy: 0, rx: 6.2, ry: 4.5, fill: tint, stroke: "rgb(0 0 0 / .22)", strokeWidth: 0.7 } : null,
    shine: head ? { cx: at + len - 7.2, cy: -1.5, rx: 2.3, ry: 1.2, fill: "#fff", opacity: 0.45 } : null,
  };
}

/** A flame rising from (0, 0) on a match head: an outer and an inner tongue, over a glow. */
export const FLAME = {
  glow: { cx: 0, cy: -12, r: 22 },
  outer: "M0,-2 C-7.5,-8 -6.5,-17 0,-29 C6.5,-17 7.5,-8 0,-2Z",
  inner: "M0,-4 C-3.4,-8 -3.1,-13 0,-18 C3.1,-13 3.4,-8 0,-4Z",
  glowColor: "#ff9a3c",
  fire: [["0", "#ff4d12", 1], ["0.45", "#ff9a2e", 1], ["1", "#ffe28a", 0.85]] as const,
  core: "#fff6cf",
};
