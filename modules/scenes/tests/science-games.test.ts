import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createObservatoryGame, createSteamGame, createElectricGame } from "../web/games/science-state.ts";
import { SCIENCE_MESSAGES, SCIENCE_WORLDS } from "../web/games/science.ts";

/** A fixed pseudo-random sequence in [0, 1), so a game's draws are the same on every run. */
const seeded = (seed: number) => () => {
  seed = seed + 0x6d2b79f5 | 0;
  let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
};
const factories = [createObservatoryGame, createSteamGame, createElectricGame];
const seeds = Array.from({ length: 40 }, (_, i) => i + 1);

test("science primary actions inspect choices rather than solving them; reset restores every reading", () => {
  for (const create of factories) for (const seed of seeds) {
    const game = create(seeded(seed)), initial = game.snapshot();
    assert.ok(game.actions.some(action => action.id === initial.primary));
    for (let i = 0; i < 10; i++) game.act(game.snapshot().primary);
    assert.equal(game.snapshot().progress, 0); assert.equal(game.snapshot().complete, false);
    game.act("unknown-action"); assert.equal(game.snapshot().progress, 0);
    for (let i = 0; i < 8; i++) game.demo();
    assert.equal(game.snapshot().progress, 3); assert.equal(game.snapshot().complete, true);
    const complete = game.snapshot(); game.act("primary"); game.demo(); assert.deepEqual(game.snapshot(), complete);
  }
  // With nothing random to draw, a reset returns to exactly the first state.
  for (const create of factories) { const game = create(() => 0), initial = game.snapshot(); for (let i = 0; i < 8; i++) game.demo(); game.reset(); assert.deepEqual(game.snapshot(), initial); }
});

test("science games draw their targets from the injected source: repeatable, different between rounds, never the starting setting", () => {
  const targets = (seed: number) => createObservatoryGame(seeded(seed)).view().targets;
  assert.deepEqual(targets(3), targets(3));
  for (const seed of seeds) {
    const drawn = targets(seed);
    assert.equal(new Set(drawn.map(String)).size, 3); assert.ok(!drawn.some(([aim, focus]) => !aim && !focus));
    const steam = createSteamGame(seeded(seed)); steam.act("primary"); assert.notEqual(steam.view().pressure, steam.view().targetPressure);
    const electric = createElectricGame(seeded(seed)).view().order; assert.deepEqual([...electric].sort(), [1, 2, 3]);
  }
  assert.ok(new Set(seeds.map(seed => String(targets(seed)))).size > 20);
  assert.ok(new Set(seeds.map(seed => String(createElectricGame(seeded(seed)).view().order))).size === 6);
  const game = createObservatoryGame(seeded(9)), first = game.view().targets; game.reset(); assert.notDeepEqual(game.view().targets, first);
});

test("observatory distinguishes wrong direction from blurred focus, then records the three observations the chart asks for", () => {
  const game = createObservatoryGame(seeded(7));
  const turnTo = (aim: number, focus: number) => { while (game.view().aim !== aim) game.act("aim-right"); while (game.view().focus !== focus) game.act("focus-out"); };
  const [first, second, third] = game.view().targets;
  turnTo((first![0] + 1) % 6, first![1]); game.act("primary"); assert.match(game.snapshot().status, /方向不符/); assert.equal(game.snapshot().tone, "error");
  turnTo(first![0], (first![1] + 1) % 4); game.act("primary"); assert.match(game.snapshot().status, /模糊/);
  turnTo(...first!); game.act("primary"); assert.equal(game.snapshot().progress, 1); assert.equal(game.snapshot().tone, "progress");
  assert.deepEqual(game.view().target, second);
  turnTo(...second!); game.act("primary"); assert.equal(game.snapshot().progress, 2);
  turnTo(...third!); game.act("primary"); assert.equal(game.snapshot().complete, true);
  game.reset(); game.act("aim-left"); game.act("focus-in"); assert.equal(game.view().aim, 5); assert.equal(game.view().focus, 3);
});

test("steam requires consecutive matching samples, detects excessive pressure, and recovers without losing trials", () => {
  const game = createSteamGame(seeded(11));
  const setTo = (valve: number, load: number) => { for (let i = 0; i < 4; i++) { game.act("valve-down"); game.act("load-down"); } for (let i = 0; i < valve; i++) game.act("valve-up"); for (let i = 0; i < load; i++) game.act("load-up"); };
  /** The settings that read exactly the target pressure and speed: pressure = 2v - l, speed = 3v - 2l. */
  const solution = () => { const { targetPressure: p, targetSpeed: s } = game.view(), valve = 2 * p - s; return [valve, 2 * valve - p] as const; };
  for (let i = 0; i < 4; i++) game.act("valve-up"); game.act("primary"); assert.match(game.snapshot().status, /压力过高/); assert.equal(game.snapshot().tone, "error");
  game.act("relief"); assert.equal(game.view().pressure, 0); assert.equal(game.view().stable, 0);
  setTo(...solution()); game.act("primary");
  assert.equal(game.view().stable, 1); assert.equal(game.snapshot().progress, 0); assert.equal(game.snapshot().tone, "progress");
  game.act("load-up"); assert.equal(game.view().stable, 0); game.act("primary"); assert.match(game.snapshot().status, /尚未平衡/);
  setTo(...solution()); game.act("primary"); game.act("primary");
  assert.equal(game.snapshot().progress, 1); assert.equal(game.snapshot().readings[2], "0 / 2");
  game.act("relief"); assert.equal(game.snapshot().progress, 1);
  for (let trial = 0; trial < 2; trial++) { setTo(...solution()); game.act("primary"); game.act("primary"); }
  assert.equal(game.snapshot().complete, true); assert.equal(game.snapshot().readings[2], "2 / 2");
  game.reset(); for (let i = 0; i < 12; i++) { game.act("valve-up"); game.act("load-down"); }
  assert.equal(game.view().valve, 4); assert.equal(game.view().load, 0);
});

test("steam targets read differently on the dials, stay on them and below the relief limit", () => {
  for (const seed of seeds) {
    const game = createSteamGame(seeded(seed));
    for (let trial = 0; trial < 3; trial++) {
      const { targetPressure, targetSpeed } = game.view();
      assert.ok(targetPressure >= 1 && targetPressure < 7 && targetSpeed >= 1 && targetSpeed <= 8, `${targetPressure}/${targetSpeed}`);
      game.demo(); game.demo();
    }
    assert.equal(game.snapshot().complete, true);
  }
});

test("electric rejects open and bypass paths, then requires each lamp in the order drawn", () => {
  const game = createElectricGame(seeded(4)), { order } = game.view();
  const selectLamp = (lamp: number) => { while (game.view().route !== lamp) game.act("route-next"); };
  game.act("primary"); assert.match(game.snapshot().status, /回路断开/); assert.equal(game.snapshot().tone, "error");
  game.act("switch"); game.act("primary"); assert.match(game.snapshot().status, /短接/); assert.equal(game.view().closed, false);
  game.act("switch"); selectLamp(order[1]!); game.act("primary"); assert.match(game.snapshot().status, /当前目标灯/); assert.equal(game.snapshot().progress, 0);
  for (let i = 0; i < 3; i++) {
    assert.equal(game.view().target, order[i]); selectLamp(order[i]!); game.act("primary");
    assert.equal(game.snapshot().progress, i + 1); assert.deepEqual(game.view().lit, order.slice(0, i + 1));
  }
  assert.equal(game.snapshot().complete, true);
});

test("all science catalog, controls, feedback and hotspot text has explicit English coverage", async () => {
  const assertTranslated = (text: string) => { if (/[\u3400-\u9fff]/.test(text)) assert.ok(SCIENCE_MESSAGES[text], `missing English: ${text}`); };
  const walk = (value: unknown): void => { if (typeof value === "string") assertTranslated(value); else if (Array.isArray(value)) value.forEach(walk); else if (value && typeof value === "object") Object.values(value).forEach(walk); };
  walk(SCIENCE_WORLDS);
  for (const create of factories) {
    const game = create(); walk(game.actions); walk(game.snapshot());
    for (const action of [...game.actions.map(action => action.id), "primary", "relief", "primary"]) { game.act(action); walk(game.snapshot()); }
    for (let i = 0; i < 8; i++) { game.demo(); walk(game.snapshot()); }
  }
  for (const id of ["observatory", "steam", "electric"]) {
    const scene = await readFile(new URL(`../web/${id}/scene.ts`, import.meta.url), "utf8");
    for (const match of scene.matchAll(/"([^"\n]*[\u3400-\u9fff][^"\n]*)"/g)) assertTranslated(match[1]!);
  }
  assert.equal(SCIENCE_WORLDS.observatory.time, 1610);
  for (const world of Object.values(SCIENCE_WORLDS)) { assert.equal(world.challenge, true); assert.equal(world.phases.length, 4); }
});
