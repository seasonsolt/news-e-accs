import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { FlightGame, LogicGame, SpaceGame, NetworkGame } from "../web/games/modern-state.ts";
import { MODERN_MESSAGES, MODERN_WORLDS } from "../web/games/modern.ts";

const repeat = (game: { act(action: string): void }, action: string, count: number) => { for (let i = 0; i < count; i++) game.act(action); };

test("flight requires all three distinct trim cards and failed trials preserve earned legs", () => {
  const game = new FlightGame();
  game.act("primary"); assert.equal(game.passed, 0); assert.match(game.status, /重心/);
  game.act("cg-right"); game.act("primary"); assert.match(game.status, /偏低/);
  game.act("elevator-up"); game.act("primary"); assert.equal(game.passed, 1);
  game.act("primary"); assert.equal(game.passed, 1);
  game.act("cg-right"); game.act("elevator-down"); game.act("primary");
  repeat(game, "cg-left", 2); game.act("elevator-down"); game.act("primary");
  assert.equal(game.snapshot().complete, true); assert.equal(game.attempts, 6);
  game.reset(); assert.equal(game.snapshot().complete, false); assert.equal(game.cg, -1); assert.equal(game.attempts, 0);
});

test("AND requires explicit input rows and predicted outputs, including rejecting OR on row 01", () => {
  const game = new LogicGame(); game.act("primary"); assert.equal(game.passed, 0);
  game.act("output"); game.act("primary"); assert.equal(game.passed, 1);
  game.act("primary"); assert.match(game.status, /输入/); assert.equal(game.passed, 1);
  game.act("input-b"); game.act("output"); game.act("primary"); assert.match(game.status, /预测错误/);
  game.act("output"); game.act("primary"); assert.equal(game.passed, 2);
  game.act("input-a"); game.act("input-b"); game.act("primary");
  assert.equal(game.snapshot().progress, 2); assert.equal(game.snapshot().readings[1], "3 / 4");
  game.act("input-b"); game.act("primary"); assert.equal(game.snapshot().complete, false);
  game.act("output"); game.act("primary"); assert.equal(game.snapshot().complete, true);
  assert.equal(game.snapshot().progress, 3);
  game.reset(); assert.equal(game.passed, 0); assert.equal(game.output, 1);
});

test("docking requires both translation and yaw alignment at every approach checkpoint", () => {
  const game = new SpaceGame(); game.act("primary"); assert.match(game.status, /位置/);
  repeat(game, "left", 2); game.act("up"); game.act("primary"); assert.match(game.status, /姿态/);
  game.act("yaw-left"); game.act("primary"); assert.equal(game.passed, 1);
  game.act("primary"); assert.equal(game.passed, 1);
  game.act("down"); game.act("yaw-right"); game.act("primary"); assert.equal(game.passed, 2);
  game.act("right"); game.act("up"); game.act("yaw-left"); game.act("primary");
  assert.equal(game.snapshot().complete, true);
  game.reset(); assert.deepEqual([game.x, game.y, game.yaw, game.passed], [2, -1, 1, 0]);
});

test("network rejects a broken route and out-of-order shards while accepting alternative available routes", () => {
  const game = new NetworkGame(); game.act("primary"); assert.match(game.status, /断开/);
  game.act("shard"); game.act("primary"); assert.match(game.status, /顺序/);
  repeat(game, "shard", 2); game.act("route"); game.act("primary"); assert.equal(game.passed, 1);
  game.act("shard"); game.act("primary"); assert.equal(game.passed, 2);
  game.act("shard"); game.act("primary"); assert.equal(game.passed, 2); assert.match(game.status, /断开/);
  game.act("route"); game.act("primary"); assert.equal(game.snapshot().complete, true);
  game.reset(); assert.deepEqual([game.shard, game.route, game.passed], [1, 1, 0]);
});

test("primary never solves a fresh game, while explicit demonstrations can complete and reset each game", () => {
  for (const Game of [FlightGame, LogicGame, SpaceGame, NetworkGame]) {
    const game = new Game(), initial = game.snapshot();
    assert.ok(game.actions.some(action => action.id === initial.primary));
    repeat(game, "primary", 12); assert.equal(game.snapshot().complete, false); assert.equal(game.snapshot().progress, 0);
    game.reset(); assert.deepEqual(game.snapshot(), initial);
    for (let step = 0; step < 40 && !game.snapshot().complete; step++) game.demo();
    assert.equal(game.snapshot().complete, true, Game.name);
    const completed = game.snapshot(); game.act("primary"); assert.deepEqual(game.snapshot(), completed);
    game.reset(); assert.deepEqual(game.snapshot(), initial);
  }
});

test("modern challenge instructions, action labels and every feedback branch have English editions", () => {
  const translated = (text: string) => {
    if (!/[\u3400-\u9fff]/.test(text)) return;
    assert.ok(MODERN_MESSAGES[text] && !/[\u3400-\u9fff]/.test(MODERN_MESSAGES[text]), text);
  };
  for (const world of Object.values(MODERN_WORLDS)) {
    assert.equal(world.challenge, true); assert.equal(world.phases.length, 4);
    for (const text of [world.title, world.subtitle, world.action, world.unitLabel, world.note, ...world.readingLabels, ...world.phases.flatMap(p => [p.title, p.detail, ...p.readings])]) translated(text);
  }
  // Inspect literals as well as the happy path so failure-only feedback cannot lose its translation.
  const source = readFileSync(new URL("../web/games/modern-state.ts", import.meta.url), "utf8");
  for (const match of source.matchAll(/"([^"\n]*[\u3400-\u9fff][^"\n]*)"/g)) translated(match[1]!);
});
