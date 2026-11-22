import "../../../tests/setup.ts";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { after } from "node:test";
import { BoxGeometry, Mesh, MeshBasicMaterial, PlaneGeometry, Raycaster, Scene, Vector3 } from "three";
import { closeDb } from "@aihot/backend/db";
import { installModules } from "@aihot/backend/modules";
import { loadDiscoveryEntries } from "@aihot/backend/publication/sitemap";
import { normalizeSiteEvent, WALK_ACTS, WALK_PLACES, WALK_TIMES } from "@aihot/backend/site/analytics";
import { BRIDGE, CANAL, CAVE_S, CLEARINGS, COMPUTE_S, END_S, FIELD_S, FIRE_S, LAND, LINES, MILESTONES, MONO_S, ROADSIDE, SOW_S, STOP_YEARS, bridgeLift, chapterAt, cleared, ground, keepDry, roadX, sheet, yearReading, yearsAgo } from "../web/walk/land.ts";
import { messages as walk } from "../web/walk/messages.ts";
import { buildMonolith } from "../web/walk/monolith.ts";
import scenes from "../server.ts";

installModules([scenes]);
after(closeDb);
import { resolveRedirect } from "@aihot/contracts/http-policy";

test("the road runs in order from the hearth to the stone and stays walkable", () => {
  assert.ok(0 < FIRE_S && FIRE_S < CAVE_S && CAVE_S < SOW_S && SOW_S < FIELD_S && FIELD_S < COMPUTE_S && COMPUTE_S < END_S && END_S < MONO_S);
  assert.ok(MONO_S - END_S < 5 && MONO_S - END_S > 2, "the walk ends right under the stone without clipping into it");
  for (let s = 0; s < MONO_S; s += 2) {
    // A stride along the road never climbs a wall, never gets pushed by water, and never leaves the land that was laid.
    assert.ok(Math.abs(ground(roadX(s + 2), -(s + 2)) - ground(roadX(s), -s)) < 1.2, `step at ${s}`);
    assert.ok(Math.abs(roadX(s)) + 48 < 150, `road at ${s}`);
    if (s <= END_S) assert.deepEqual(keepDry(roadX(s), s), [roadX(s), s], `road stays dry at ${s}`);
  }
  // Pond and canal push walkers back onto the bank, except across the plank bridge at s = 424; clearings stay bare of wheat.
  const [pondS, pondOff] = CLEARINGS.pond, pondCenter = roadX(pondS) + pondOff;
  const [outX, outS] = keepDry(pondCenter + .2, pondS);
  assert.ok(Math.hypot(outX - pondCenter, outS - pondS) >= 4.34, "cannot stand in the pond");
  const canalMid = roadX(400) + CANAL.offset;
  assert.ok(Math.abs(keepDry(canalMid + .1, 400)[0] - canalMid) >= BRIDGE.bank - 1e-6, "cannot wade into the canal");
  const bridgeMid = roadX(BRIDGE.s) + CANAL.offset;
  assert.deepEqual(keepDry(bridgeMid, BRIDGE.s), [bridgeMid, BRIDGE.s], "can cross the plank bridge");
  assert.ok(bridgeLift(bridgeMid, BRIDGE.s) > .25 && bridgeLift(roadX(BRIDGE.s), BRIDGE.s) === 0);
  assert.equal(keepDry(bridgeMid, BRIDGE.s + BRIDGE.halfS + .15)[1], BRIDGE.s + BRIDGE.halfS, "cannot step off the side of the plank bridge into the canal");
  for (const [cs, off] of Object.values(CLEARINGS)) assert.equal(cleared(roadX(cs) + off, cs), true);
});

test("scenery samples the same two triangles drawn for each terrain cell", () => {
  const across = 15, along = 32;
  const plane = new PlaneGeometry(LAND.width, LAND.depth, across, along).rotateX(-Math.PI / 2).translate(0, 0, LAND.behind - LAND.depth / 2);
  const positions = plane.getAttribute("position");
  for (let i = 0; i < positions.count; i++) positions.setY(i, ground(positions.getX(i), positions.getZ(i)));
  const mesh = new Mesh(plane, new MeshBasicMaterial()), down = new Vector3(0, -1, 0);
  const floor = sheet(across, along, index => positions.getY(index));
  for (const [x, z] of [[-149, -749], [-132, -728], [4, -29], [37, -381], [149, 49]] as const) {
    const hit = new Raycaster(new Vector3(x, 100, z), down).intersectObject(mesh)[0];
    assert.ok(hit && Math.abs(floor(x, z) - hit.point.y) < 1e-6, `terrain at ${x}, ${z}`);
  }
  plane.dispose(); mesh.material.dispose();
});

test("the monolith is one unmarked matte black cuboid with 1:4:9 proportions", () => {
  const scene = new Scene(), owned: Array<{ dispose(): void }> = [];
  const monolith = buildMonolith({ scene, own: item => { owned.push(item); return item; } }, 3, 2, -MONO_S);
  try {
    assert.deepEqual(scene.children, [monolith]);
    assert.equal(monolith.children.length, 0);
    assert.ok(monolith.geometry instanceof BoxGeometry);
    monolith.geometry.computeBoundingBox();
    const size = monolith.geometry.boundingBox!.getSize(new Vector3());
    assert.ok(Math.abs(size.x / size.z - 4) < 1e-6);
    assert.ok(Math.abs(size.y / size.z - 9) < 1e-6);
    assert.ok(monolith.position.y - size.y / 2 < 2, "the base extends into the soil");
    assert.equal(monolith.material.emissive.getHex(), 0);
    assert.ok(Math.max(monolith.material.color.r, monolith.material.color.g, monolith.material.color.b) < .01);
    assert.ok(monolith.material.roughness >= .8);
    for (const value of Object.values(monolith.material)) assert.ok(!(value && typeof value === "object" && "isTexture" in value));
    assert.equal(monolith.castShadow, true);
    assert.equal(monolith.receiveShadow, true);
  } finally {
    for (const item of owned) item.dispose();
  }
});

test("time only runs forward along the road, from a million years ago to this year", () => {
  for (let s = 0; s < MONO_S; s += 5) assert.ok(yearsAgo(s + 5) <= yearsAgo(s), `year at ${s}`);
  assert.deepEqual(yearReading(0, "zh"), ["100", "万年前"]);
  assert.deepEqual(yearReading(0, "en"), ["1,000,000", "years ago"]);
  assert.ok(Math.abs(yearsAgo(CAVE_S) - 40000) < 1e-6);
  assert.deepEqual(yearReading(CAVE_S, "zh"), ["4", "万年前"]);
  assert.deepEqual(yearReading(CAVE_S, "en"), ["40,000", "years ago"]);
  assert.deepEqual(yearReading(SOW_S, "zh"), ["1.2", "万年前"]);
  const currentYear = String(new Date().getUTCFullYear());
  assert.deepEqual(yearReading(MONO_S, "en"), [currentYear, "CE"]);
  assert.deepEqual(yearReading(MONO_S, "zh"), [currentYear, "年"]);
  const [figure, unit] = yearReading(280, "en");
  assert.equal(unit, "BCE"); assert.match(figure, /^\d+00$/);
  assert.deepEqual([chapterAt(0), chapterAt(FIELD_S), chapterAt(MONO_S)], ["Ⅰ · 火", "Ⅱ · 田", "Ⅲ · 碑"]);
});

test("the clock holds the Chronicle date while each roadside scene is in view", () => {
  const { milestones } = JSON.parse(readFileSync(new URL("../../../industry/chronicle/milestones.json", import.meta.url), "utf8")) as { milestones: Array<{ id: string; t: number }> };
  const scenes = [
    ["migration", "out-of-africa", "60,000"], ["ledger", "cuneiform", "3200"],
    ["press", "gutenberg-press", "1440"], ["loom", "jacquard-loom", "1804"], ["terminal", "arpanet-first-message", "1969"],
  ] as const;
  for (const [stop, id, reading] of scenes) {
    const [s, off] = ROADSIDE[stop];
    assert.equal(STOP_YEARS[stop], milestones.find(m => m.id === id)?.t, id);
    for (const at of [s - 12, s - 5, s]) assert.equal(yearReading(at, "en")[0], reading, id);
    assert.ok(cleared(roadX(s) + off, s), id);
  }
});

test("everything the walk says has an English edition", () => {
  const en: Record<string, string> = walk.en;
  const said = LINES.map(([, line]) => line);
  for (const file of ["world.ts", "page.tsx"]) {
    const source = readFileSync(new URL(`../web/walk/${file}`, import.meta.url), "utf8");
    for (const [, text] of source.matchAll(/"([^"\n]*[㐀-鿿][^"\n]*)"/g)) said.push(text!);
  }
  assert.ok(said.length > 20);
  for (const text of said) if (/[㐀-鿿]/.test(text)) assert.ok(en[text] && !/[㐀-鿿]/.test(en[text]), text);
  for (let i = 1; i < LINES.length; i++) assert.ok(LINES[i]![0] > LINES[i - 1]![0]);
});

test("the walk reports only places, acts and times the server accepts, its places in order along the road", () => {
  assert.deepEqual(MILESTONES.map(([place]) => place), [...WALK_PLACES]);
  for (let i = 1; i < MILESTONES.length; i++) assert.ok(MILESTONES[i]![1] > MILESTONES[i - 1]![1], MILESTONES[i]![0]);
  assert.ok(MILESTONES.at(-1)![1] < END_S, "the last place can be reached");
  const source = readFileSync(new URL("../web/walk/world.ts", import.meta.url), "utf8");
  const acts = [...source.matchAll(/count\("walk_act", "([^"]+)"\)/g)].map((m) => m[1]!), times = [...source.matchAll(/"(\d+(?:-\d+)?m\+?)"/g)].map((m) => m[1]!);
  assert.deepEqual(new Set(acts), new Set(WALK_ACTS));
  assert.deepEqual(times, [...WALK_TIMES]);
  for (const act of acts) assert.ok(normalizeSiteEvent({ event: "walk_act", target: act }), act);
});

test("the walk is listed for discovery in both editions, and the retired workshops' addresses lead to it in their own language", async () => {
  const listed = (await loadDiscoveryEntries()).map((e) => e.loc);
  for (const loc of ["/chronicle/walk", "/zh/chronicle/walk"]) assert.equal(listed.filter((l) => l === loc).length, 1, loc);
  assert.ok(!listed.some((l) => /\/chronicle\/(?!walk$)[^/]+$/.test(l)), "no retired workshop is listed");
  for (const path of ["/chronicle/workshops", "/chronicle/fire", "/chronicle/difference-engine", "/chronicle/network"]) {
    assert.deepEqual(resolveRedirect(path, ""), { status: 301, location: "/chronicle/walk", headers: {} }, path);
    assert.deepEqual(resolveRedirect(`/zh${path}`, ""), { status: 301, location: "/zh/chronicle/walk", headers: {} }, path);
  }
  for (const path of ["/chronicle", "/chronicle/walk", "/zh/chronicle/walk"]) assert.equal(resolveRedirect(path, ""), null, path);
});
