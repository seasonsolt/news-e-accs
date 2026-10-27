import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { FlightGame, LogicGame, SpaceGame, NetworkGame } from "../web/games/modern-state.ts";
import { MODERN_MESSAGES, MODERN_WORLDS } from "../web/games/modern.ts";

const repeat = (game: { act(action: string): void }, action: string, count: number) => { for (let i = 0; i < count; i++) game.act(action); };
/** A fixed pseudo-random sequence in [0, 1), so a game's draws are the same on every run. */
const seeded = (seed: number) => () => {
  seed = seed + 0x6d2b79f5 | 0;
  let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
};
const seeds = Array.from({ length: 40 }, (_, i) => i + 1);

test("flight requires all three distinct trim cards and failed trials preserve earned legs", () => {
  const game = new FlightGame(seeded(2)), [first, second, third] = game.targets;
  const trim = ([cg, elevator]: readonly [number, number]) => { while (game.cg !== cg) game.act(game.cg < cg ? "cg-right" : "cg-left"); while (game.elevator !== elevator) game.act(game.elevator < elevator ? "elevator-up" : "elevator-down"); };
  assert.equal(new Set(game.targets.map(String)).size, 3);
  trim([(first![0] + 1) % 5 - 2, first![1]]); game.act("primary"); assert.equal(game.passed, 0); assert.match(game.status, /重心/); assert.equal(game.tone, "error");
  trim([first![0], first![1] === 2 ? 1 : 2]); game.act("primary"); assert.match(game.status, /偏/);
  trim(first!); game.act("primary"); assert.equal(game.passed, 1); assert.equal(game.tone, "progress");
  game.act("primary"); assert.equal(game.passed, 1);
  trim(second!); game.act("primary"); trim(third!); game.act("primary");
  assert.equal(game.snapshot().complete, true); assert.equal(game.attempts, 6);
  const before = game.targets; game.reset(); assert.equal(game.snapshot().complete, false); assert.equal(game.cg, -1); assert.equal(game.attempts, 0); assert.notDeepEqual(game.targets, before);
});

test("AND requires explicit input rows and predicted outputs in the order drawn, including rejecting OR", () => {
  const game = new LogicGame(seeded(3)), rows = [...game.rows];
  assert.deepEqual([...rows].sort(), [0, 1, 2, 3]);
  const set = (row: number, output: number) => { while (game.a !== row >> 1) game.act("input-a"); while (game.b !== (row & 1)) game.act("input-b"); while (game.output !== output) game.act("output"); };
  game.act("primary"); assert.equal(game.passed, 0);
  set(rows[0]!, rows[0]! >> 1 & (rows[0]! & 1)); game.act("primary"); assert.equal(game.passed, 1); assert.equal(game.tone, "progress");
  game.act("primary"); assert.match(game.status, /输入/); assert.equal(game.passed, 1);
  const or = rows[1]! >> 1 | rows[1]! & 1, and = rows[1]! >> 1 & rows[1]! & 1;
  if (or !== and) { set(rows[1]!, or); game.act("primary"); assert.match(game.status, /预测错误/); assert.equal(game.tone, "error"); assert.equal(game.passed, 1); }
  set(rows[1]!, and); game.act("primary"); assert.equal(game.passed, 2);
  assert.equal(game.snapshot().progress, 2); assert.equal(game.snapshot().readings[1], "2 / 4");
  set(rows[2]!, rows[2]! >> 1 & rows[2]! & 1); game.act("primary"); assert.equal(game.snapshot().complete, false);
  set(rows[3]!, rows[3]! >> 1 & rows[3]! & 1); game.act("primary"); assert.equal(game.snapshot().complete, true);
  assert.equal(game.snapshot().progress, 3);
  game.reset(); assert.equal(game.passed, 0); assert.equal(game.output, 1); assert.notDeepEqual(game.rows, rows);
});

test("docking requires both translation and yaw alignment at every approach checkpoint", () => {
  const game = new SpaceGame(seeded(5)), offsets = game.offsets;
  const align = (what: "xy" | "yaw") => {
    if (what === "xy") { while (game.x) game.act(game.x > 0 ? "left" : "right"); while (game.y) game.act(game.y > 0 ? "down" : "up"); }
    else while (game.yaw) game.act(game.yaw > 0 ? "yaw-left" : "yaw-right");
  };
  for (const offset of offsets) assert.ok(offset.filter(Boolean).length >= 2);
  assert.deepEqual([game.x, game.y, game.yaw], offsets[0]);
  game.act("primary"); assert.equal(game.passed, 0);
  align("yaw"); game.act("primary"); assert.equal(game.passed, 0); assert.equal(game.tone, "error");
  align("xy"); game.act("primary"); assert.equal(game.passed, 1); assert.equal(game.tone, "progress");
  assert.deepEqual([game.x, game.y, game.yaw], offsets[1]);
  game.act("primary"); assert.equal(game.passed, 1);
  align("xy"); game.act("primary"); assert.match(game.status, /姿态|位置/); assert.equal(game.passed, 1);
  align("yaw"); game.act("primary"); assert.equal(game.passed, 2);
  align("xy"); align("yaw"); game.act("primary");
  assert.equal(game.snapshot().complete, true);
  game.reset(); assert.deepEqual([game.x, game.y, game.yaw, game.passed], [...game.offsets[0]!, 0]);
});

test("network rejects a broken route and out-of-order shards while accepting the available routes", () => {
  const game = new NetworkGame(seeded(6));
  assert.equal(game.routes[0]![game.route], false);
  game.act("primary"); assert.match(game.status, /断开/); assert.equal(game.tone, "error");
  game.act("shard"); game.act("primary"); assert.match(game.status, /顺序/);
  repeat(game, "shard", 2);
  for (let shard = 1; shard <= 3; shard++) {
    while (game.shard !== shard) game.act("shard");
    while (!game.routes[shard - 1]![game.route]) game.act("route");
    game.act("primary"); assert.equal(game.passed, shard);
  }
  assert.equal(game.snapshot().complete, true);
  game.reset(); assert.deepEqual([game.shard, game.passed], [1, 0]); assert.equal(game.routes[0]![game.route], false);
});

test("modern games draw their targets from the injected source and a bare primary never solves a fresh game", () => {
  assert.deepEqual(new FlightGame(seeded(8)).targets, new FlightGame(seeded(8)).targets);
  for (const seed of seeds) {
    for (const Game of [FlightGame, LogicGame, SpaceGame, NetworkGame]) {
      const game = new Game(seeded(seed)), initial = game.snapshot();
      assert.ok(game.actions.some(action => action.id === initial.primary));
      repeat(game, "primary", 12); assert.equal(game.snapshot().complete, false); assert.equal(game.snapshot().progress, 0);
      game.reset();
      for (let step = 0; step < 60 && !game.snapshot().complete; step++) game.demo();
      assert.equal(game.snapshot().complete, true, `${Game.name} ${seed}`);
      const completed = game.snapshot(); game.act("primary"); assert.deepEqual(game.snapshot(), completed);
    }
  }
  assert.ok(new Set(seeds.map(seed => String(new FlightGame(seeded(seed)).targets))).size > 20);
  assert.ok(new Set(seeds.map(seed => String(new NetworkGame(seeded(seed)).routes))).size > 5);
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
