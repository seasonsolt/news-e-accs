import "../../../tests/setup.ts";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { after } from "node:test";
import { closeDb } from "@aihot/backend/db";
import { installModules } from "@aihot/backend/modules";
import { loadDiscoveryEntries } from "@aihot/backend/publication/sitemap";
import { END_S, FIELD_S, FIRE_S, LINES, MONO_S, SOW_S, chapterAt, ground, roadX, yearReading, yearsAgo } from "../web/walk/land.ts";
import { messages as walk } from "../web/walk/messages.ts";
import scenes from "../server.ts";

installModules([scenes]);
after(closeDb);
import { resolveRedirect } from "@aihot/contracts/http-policy";

test("the road runs in order from the hearth to the stone and stays walkable", () => {
  assert.ok(0 < FIRE_S && FIRE_S < SOW_S && SOW_S < FIELD_S && FIELD_S < END_S && END_S < MONO_S);
  for (let s = 0; s < MONO_S; s += 2) {
    // A stride along the road never climbs a wall, and the road never leaves the land that was laid.
    assert.ok(Math.abs(ground(roadX(s + 2), -(s + 2)) - ground(roadX(s), -s)) < 1.2, `step at ${s}`);
    assert.ok(Math.abs(roadX(s)) + 48 < 150, `road at ${s}`);
  }
});

test("time only runs forward along the road, from a million years ago to this year", () => {
  for (let s = 0; s < MONO_S; s += 5) assert.ok(yearsAgo(s + 5) <= yearsAgo(s), `year at ${s}`);
  assert.deepEqual(yearReading(0, "zh"), ["100", "万年前"]);
  assert.deepEqual(yearReading(0, "en"), ["1,000,000", "years ago"]);
  assert.deepEqual(yearReading(SOW_S, "zh"), ["1.2", "万年前"]);
  assert.deepEqual(yearReading(MONO_S, "en"), ["2026", "CE"]);
  const [figure, unit] = yearReading(280, "en");
  assert.equal(unit, "BCE"); assert.match(figure, /^\d+00$/);
  assert.deepEqual([chapterAt(0), chapterAt(FIELD_S), chapterAt(MONO_S)], ["Ⅰ · 火", "Ⅱ · 田", "Ⅲ · 碑"]);
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
