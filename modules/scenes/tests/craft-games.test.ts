import test from "node:test";
import assert from "node:assert/strict";
import { createWritingGame, createIronGame, createPrintingGame } from "../web/games/craft-state.ts";

test("writing records only matching goods and quantities, retains valid entries on retry, and resets", () => {
  const game = createWritingGame();
  game.act("primary"); assert.equal(game.snapshot().progress, 0); assert.match(game.snapshot().status, /不符/);
  game.act("quantity"); game.act("quantity"); game.act("primary"); assert.equal(game.snapshot().progress, 1);
  game.act("sheep"); game.act("primary"); assert.equal(game.snapshot().progress, 1);
  for (let i = 0; i < 4; i++) game.act("quantity");
  game.act("primary"); assert.equal(game.snapshot().progress, 2);
  game.act("grain"); for (let i = 0; i < 3; i++) game.act("quantity");
  game.act("primary"); assert.equal(game.snapshot().complete, true);
  game.reset(); assert.equal(game.snapshot().complete, false); assert.deepEqual(game.snapshot().readings, ["谷物", "1", "0 / 3"]);
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

test("explicit demonstrations finish all games while bare primary actions never solve choices", () => {
  for (const create of [createWritingGame, createIronGame, createPrintingGame]) {
    const game = create(); for (let i = 0; i < 15; i++) game.act("primary"); assert.equal(game.snapshot().complete, false);
    game.reset(); for (let i = 0; i < 30; i++) game.demo(); assert.equal(game.snapshot().complete, true);
    const final = game.snapshot(); game.act("unknown"); assert.deepEqual(game.snapshot(), final);
  }
});
