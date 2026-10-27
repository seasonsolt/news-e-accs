import test from "node:test";
import assert from "node:assert/strict";
import { createWritingGame, createIronGame, createPrintingGame } from "../web/games/craft-state.ts";
import { CRAFT_MESSAGES } from "../web/games/craft.ts";

/** A fixed pseudo-random sequence in [0, 1), so a game's draws are the same on every run. */
const seeded = (seed: number) => () => {
  seed = seed + 0x6d2b79f5 | 0;
  let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
};

test("writing records only the orders drawn, retains valid entries on retry, and resets with a new set", () => {
  const game = createWritingGame(seeded(1)), { orders } = game.view();
  assert.equal(orders.length, 3);
  assert.match(game.snapshot().status, new RegExp(orders[0]!.kind === "grain" ? "谷物" : "羊群"));
  const choose = (kind: string, count: number) => { game.act(kind); for (let i = 0; i < 5 && game.snapshot().readings[1] !== String(count); i++) game.act("quantity"); };
  const other = (kind: string) => kind === "grain" ? "sheep" : "grain";
  game.act("primary"); assert.equal(game.snapshot().progress, 0); assert.equal(game.snapshot().tone, "error"); assert.match(game.snapshot().status, /不符/);
  choose(orders[0]!.kind, orders[0]!.count); game.act("primary"); assert.equal(game.snapshot().progress, 1); assert.equal(game.snapshot().tone, "progress");
  game.act("primary"); assert.equal(game.snapshot().progress, 1);
  choose(other(orders[1]!.kind), orders[1]!.count); game.act("primary"); assert.equal(game.snapshot().progress, 1);
  choose(orders[1]!.kind, orders[1]!.count); game.act("primary"); assert.equal(game.snapshot().progress, 2);
  choose(orders[2]!.kind, orders[2]!.count % 5 + 1); game.act("primary"); assert.equal(game.snapshot().progress, 2);
  choose(orders[2]!.kind, orders[2]!.count); game.act("primary"); assert.equal(game.snapshot().complete, true);
  game.reset(); assert.equal(game.snapshot().complete, false); assert.deepEqual(game.snapshot().readings, ["谷物", "1", "0 / 3"]);
  assert.notDeepEqual(game.view().orders, orders);
});

test("writing draws three different orders, never the starting selection, the same ones for the same sequence, and every line is translated", () => {
  const draw = (seed: number) => createWritingGame(seeded(seed)).view().orders;
  assert.deepEqual(draw(5), draw(5));
  for (let seed = 1; seed <= 60; seed++) {
    const orders = draw(seed);
    assert.equal(new Set(orders.map(o => `${o.kind}${o.count}`)).size, 3);
    assert.ok(!(orders[0]!.kind === "grain" && orders[0]!.count === 1), "one press on a fresh bench must not record");
    const game = createWritingGame(seeded(seed));
    for (let i = 0; i < 4; i++) { assert.ok(CRAFT_MESSAGES[game.snapshot().status], game.snapshot().status); game.demo(); }
    assert.equal(game.snapshot().complete, true); assert.ok(CRAFT_MESSAGES[game.snapshot().status]);
  }
  assert.ok(new Set(Array.from({ length: 60 }, (_, seed) => JSON.stringify(draw(seed)))).size > 20);
});

test("iron rejects cold and overheated hammering, recovers by cooling, then requires finishing cooling", () => {
  const game = createIronGame(); game.act("primary"); assert.match(game.snapshot().status, /冷锤/);
  game.act("charcoal"); game.act("charcoal"); game.act("charcoal"); game.act("primary"); assert.equal(game.snapshot().readings[1], "0 / 2");
  game.act("cool"); game.act("primary"); assert.equal(game.snapshot().readings[1], "1 / 2");
  game.act("primary"); assert.equal(game.snapshot().complete, false); assert.equal(game.snapshot().readings[1], "2 / 2");
  game.act("cool"); assert.equal(game.snapshot().complete, true);
  game.reset(); assert.deepEqual(game.snapshot().readings, ["偏冷", "0 / 2", "待成形"]);
});

test("printing cannot bypass typesetting, proofreading, or reinking for each of three impressions", () => {
  const game = createPrintingGame(); game.act("primary"); assert.match(game.snapshot().status, /没有字版/);
  game.act("typeset"); game.act("ink"); game.act("primary"); assert.match(game.snapshot().status, /尚未校对/);
  game.act("proof"); game.act("primary"); assert.equal(game.snapshot().readings[2], "1 / 3");
  game.act("primary"); assert.equal(game.snapshot().readings[2], "1 / 3"); assert.match(game.snapshot().status, /油墨/);
  game.act("ink"); game.act("primary"); game.act("ink"); game.act("primary"); assert.equal(game.snapshot().complete, true);
  game.reset(); assert.deepEqual(game.snapshot().readings, ["空字版", "待上墨", "0 / 3"]);
});

test("iron and printing mark rejected attempts as errors and each step forward as progress", () => {
  const iron = createIronGame(); assert.equal(iron.snapshot().tone, "info");
  iron.act("primary"); assert.equal(iron.snapshot().tone, "error");
  iron.act("charcoal"); iron.act("bellows"); assert.equal(iron.snapshot().tone, "progress");
  const printing = createPrintingGame(); printing.act("proof"); assert.equal(printing.snapshot().tone, "error");
  printing.act("typeset"); assert.equal(printing.snapshot().tone, "progress");
});

test("explicit demonstrations finish all games while bare primary actions never solve choices", () => {
  const games = [...[1, 2, 3, 4, 5].map(seed => () => createWritingGame(seeded(seed))), createIronGame, createPrintingGame];
  for (const create of games) {
    const game = create(); for (let i = 0; i < 15; i++) game.act("primary"); assert.equal(game.snapshot().complete, false);
    game.reset(); for (let i = 0; i < 30; i++) game.demo(); assert.equal(game.snapshot().complete, true);
    const final = game.snapshot(); game.act("unknown"); assert.deepEqual(game.snapshot(), final);
  }
});
