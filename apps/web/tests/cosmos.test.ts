import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { toAxis, type ChronicleEra, type ChronicleMilestone } from "@aihot/contracts/chronicle";
import { decideCosmos3d } from "../app/features/chrono/cosmos-mode.ts";
import { FLIGHT_LENGTH, eraStops, flightCoordinate, flightTime, forecastStart, starStops } from "../app/features/chrono/flight.ts";

const now = 2026.8;
const eras = (JSON.parse(readFileSync(new URL("../../../industry/chronicle/eras.json", import.meta.url), "utf8")) as { eras: ChronicleEra[] }).eras;
const milestones = (JSON.parse(readFileSync(new URL("../../../industry/chronicle/milestones.json", import.meta.url), "utf8")) as { milestones: ChronicleMilestone[] }).milestones;

function near(actual: number, expected: number, scale = 1) {
  assert.ok(Math.abs(actual - expected) / scale < 1e-6, `${actual} != ${expected}`);
}

test("each era owns the same stretch of the voyage, including the early universe and the AI years", () => {
  const starts = eras.map((era) => flightCoordinate(era.from, eras, now));
  const gaps = starts.slice(1).map((u, i) => u - starts[i]!);
  for (const gap of gaps) near(gap, 1 / eras.length);
  // On the page's log axis those first two eras, 100 million years apart and 13 billion years ago, collapse.
  const axisGap = toAxis(eras[1]!.from, now) - toAxis(eras[0]!.from, now);
  assert.ok(axisGap < 0.002);
  assert.ok(gaps[0]! > axisGap * 20);
  const ai = eras.findIndex((era) => era.id === "deep-learning");
  near(starts[ai + 1]! - starts[ai]!, gaps[0]!);
});

test("logarithmic time inside a long era moves off the boundary", () => {
  const start = eras[0]!.from;
  const stop = eras[1]!.from;
  const mid = start + (stop - start) / 2;
  const u0 = flightCoordinate(start, eras, now);
  const u = flightCoordinate(mid, eras, now);
  const u1 = flightCoordinate(stop, eras, now);
  assert.ok(u > u0 + (u1 - u0) * 0.7);
  assert.ok(u < u1);
});

test("flight time is the inverse of the flight coordinate and stays ordered", () => {
  for (const t of [eras[0]!.from, eras[5]!.from, 1769, 2024.7, now, now + 40, eras.at(-1)!.from]) {
    const back = flightTime(flightCoordinate(t, eras, now), eras, now);
    near(back, t, Math.max(1, Math.abs(t)));
  }
  let previous = -Infinity;
  for (let i = 0; i <= 40; i++) {
    const t = flightTime(i / 40, eras, now);
    assert.ok(t >= previous);
    previous = t;
  }
  assert.equal(flightCoordinate(eras[0]!.from, eras, now), 0);
  near(flightTime(1, eras, now), now + 100, 1);
});

test("predictive eras open a future zone and early eras are nebulae", () => {
  const forecast = eras.findIndex((era) => era.forecast);
  assert.equal(forecastStart(eras, now), forecast / eras.length);
  const stops = eraStops(eras, now);
  assert.equal(stops.length, eras.length);
  assert.ok(stops.slice(0, 3).every((stop) => stop.kind === "nebula"));
  assert.ok(stops.filter((stop) => stop.forecast).every((stop) => stop.kind === "planet"));
  const dz = Math.abs(stops[1]!.position[2] - stops[0]!.position[2]);
  assert.ok(Math.abs(dz - FLIGHT_LENGTH / eras.length) < 8, String(dz));
});

test("every milestone is a star spread along the route", () => {
  const stars = starStops(milestones, eras, now);
  assert.equal(stars.length, milestones.length);
  const categories = new Set(stars.map((star) => star.category));
  assert.equal(categories.size, 7);
  for (const star of stars) assert.ok(star.position.every((n) => Number.isFinite(n)));
  const zs = stars.map((star) => star.position[2]);
  assert.ok(Math.max(...zs) - Math.min(...zs) > FLIGHT_LENGTH * 0.75);
  assert.equal(stars.filter((star) => star.forecast).length, milestones.filter((m) => m.forecast).length);
});

test("3D is the desktop default only when WebGL2, motion and the machine allow it", () => {
  const ready = { flag: true, desktop: true, webgl2: true, reducedMotion: false, lowEnd: false, saveData: false };
  assert.deepEqual(decideCosmos3d(ready), { toggle: true, allowed: true, defaultOn: true });
  assert.deepEqual(decideCosmos3d({ ...ready, lowEnd: true }), { toggle: true, allowed: true, defaultOn: false });
  assert.deepEqual(decideCosmos3d({ ...ready, saveData: true }), { toggle: true, allowed: true, defaultOn: false });
  assert.deepEqual(decideCosmos3d({ ...ready, reducedMotion: true }), { toggle: true, allowed: false, defaultOn: false });
  assert.deepEqual(decideCosmos3d({ ...ready, webgl2: false }), { toggle: true, allowed: false, defaultOn: false });
  assert.deepEqual(decideCosmos3d({ ...ready, desktop: false }), { toggle: false, allowed: false, defaultOn: false });
  assert.deepEqual(decideCosmos3d({ ...ready, flag: false }), { toggle: false, allowed: false, defaultOn: false });
});
