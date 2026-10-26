import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createObservatoryGame, createSteamGame, createElectricGame } from "../web/games/science-state.ts";
import { SCIENCE_MESSAGES, SCIENCE_WORLDS } from "../web/games/science.ts";

const factories = [createObservatoryGame, createSteamGame, createElectricGame];
test("science primary actions inspect choices rather than solving them; reset restores every reading", () => {
  for (const create of factories) {
    const game = create(), initial = game.snapshot();
    assert.ok(game.actions.some(action => action.id === initial.primary));
    for (let i = 0; i < 10; i++) game.act(game.snapshot().primary);
    assert.equal(game.snapshot().progress, 0); assert.equal(game.snapshot().complete, false);
    game.act("unknown-action"); assert.equal(game.snapshot().progress, 0);
    for (let i = 0; i < 8; i++) game.demo();
    assert.equal(game.snapshot().progress, 3); assert.equal(game.snapshot().complete, true);
    const complete = game.snapshot(); game.act("primary"); game.demo(); assert.deepEqual(game.snapshot(), complete);
    game.reset(); assert.deepEqual(game.snapshot(), initial);
  }
});

test("observatory distinguishes wrong direction from blurred focus, then records three chosen observations", () => {
  const game = createObservatoryGame();
  game.act("primary"); assert.match(game.snapshot().status, /方向不符/);
  game.act("aim-right"); game.act("primary"); assert.match(game.snapshot().status, /模糊/);
  game.act("focus-out"); game.act("primary"); assert.equal(game.snapshot().progress, 1);
  for (let i = 0; i < 2; i++) game.act("aim-right"); game.act("focus-out"); game.act("primary"); assert.equal(game.snapshot().progress, 2);
  for (let i = 0; i < 2; i++) game.act("aim-right"); game.act("focus-out"); game.act("primary"); assert.equal(game.snapshot().complete, true);
  game.reset(); game.act("aim-left"); game.act("focus-in"); assert.equal(game.view().aim, 5); assert.equal(game.view().focus, 3);
});

test("steam requires consecutive matching samples, detects excessive pressure, and recovers without losing trials", () => {
  const game = createSteamGame();
  for (let i = 0; i < 4; i++) game.act("valve-up"); game.act("primary"); assert.match(game.snapshot().status, /压力过高/);
  game.act("relief"); assert.equal(game.view().pressure, 0); assert.equal(game.view().stable, 0);
  game.act("valve-up"); game.act("valve-up"); game.act("load-up");
  game.act("primary"); assert.equal(game.view().stable, 1); assert.equal(game.snapshot().progress, 0);
  game.act("load-up"); assert.equal(game.view().stable, 0); game.act("primary"); assert.match(game.snapshot().status, /尚未平衡/);
  game.act("load-down"); game.act("primary"); game.act("primary"); assert.equal(game.snapshot().progress, 1); assert.equal(game.snapshot().readings[2], "0 / 2");
  game.act("relief"); assert.equal(game.snapshot().progress, 1);
  game.act("valve-up"); game.act("valve-up"); game.act("valve-up"); game.act("load-up");
  game.act("primary"); game.act("primary"); assert.equal(game.snapshot().progress, 2);
  game.act("valve-down"); game.act("primary"); game.act("primary"); assert.equal(game.snapshot().complete, true); assert.equal(game.snapshot().readings[2], "2 / 2");
  game.reset(); for (let i = 0; i < 12; i++) { game.act("valve-up"); game.act("load-down"); }
  assert.equal(game.view().valve, 4); assert.equal(game.view().load, 0);
});

test("electric rejects open and bypass paths, then requires each numbered branch to light its target", () => {
  const game = createElectricGame();
  game.act("primary"); assert.match(game.snapshot().status, /回路断开/);
  game.act("switch"); game.act("primary"); assert.match(game.snapshot().status, /短接/); assert.equal(game.view().closed, false);
  game.act("route-next"); game.act("route-next"); game.act("switch"); game.act("primary"); assert.match(game.snapshot().status, /当前目标灯/);
  game.act("route-next"); game.act("route-next"); game.act("route-next");
  for (let i = 0; i < 3; i++) { game.act("primary"); assert.equal(game.snapshot().progress, i + 1); if (i < 2) game.act("route-next"); }
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
