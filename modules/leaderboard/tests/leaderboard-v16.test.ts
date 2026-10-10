// Method v16: FrontierCode leads the coding budget, and a source whose top ten sit within a few points
// counts at reduced weight. The FrontierCode reader turns Cognition's published JSON into one row per
// model × reasoning effort on the main subset.
import assert from "node:assert/strict";
import { test } from "node:test";
import { parseFrontierCode } from "@aihot/leaderboard/backend/fetch/sources/frontiercode";
import { SATURATION_FACTOR, SATURATION_SPREAD_PP, SATURATION_TOP, SCORING_SOURCES, saturationOf } from "@aihot/leaderboard/backend/method/v16";

test("the coding budget is 12%, led by FrontierCode", () => {
  const coding = SCORING_SOURCES.filter((s) => s.budget === "coding");
  const total = coding.reduce((sum, s) => sum + s.weight, 0);
  assert.ok(Math.abs(total - 0.12) < 1e-9, `coding budget sums to ${total}`);
  const lead = [...coding].sort((a, b) => b.weight - a.weight)[0]!;
  assert.equal(lead.key, "frontiercode");
  assert.equal(lead.weight, 0.048);
  assert.equal(SCORING_SOURCES.find((s) => s.key === "deepswe-v1-1")?.weight, 0.012);
});

test("every scoring source declares its scale; ratings have none", () => {
  for (const s of SCORING_SOURCES) assert.ok(s.scale === 1 || s.scale === 100 || s.scale === null, `${s.key} scale`);
  assert.equal(SCORING_SOURCES.find((s) => s.key === "arena-text")?.scale, null);
  assert.equal(SCORING_SOURCES.find((s) => s.key === "frontiercode")?.scale, 1);
});

test("saturation: top ten within 3 points on a bounded scale", () => {
  assert.equal(SATURATION_TOP, 10);
  assert.equal(SATURATION_SPREAD_PP, 3);
  assert.equal(SATURATION_FACTOR, 0.5);
  const packed = [0.91, 0.905, 0.9, 0.899, 0.895, 0.893, 0.89, 0.889, 0.887, 0.885, 0.5];
  assert.deepEqual(saturationOf(packed, 1), { saturated: true, spreadPp: 2.5 });
  const spread = [91, 88, 86, 84, 80, 79, 77, 75, 70, 66];
  assert.deepEqual(saturationOf(spread, 100), { saturated: false, spreadPp: 25 });
  assert.deepEqual(saturationOf([0.9, 0.87, ...Array(8).fill(0.89)], 1), { saturated: false, spreadPp: 3 }, "exactly 3 points is not saturated");
  assert.deepEqual(saturationOf([1500, 1499, 1498, 1497, 1496, 1495, 1494, 1493, 1492, 1491], null), { saturated: false, spreadPp: null }, "ratings are never checked");
  assert.deepEqual(saturationOf([0.9, 0.9, 0.9], 1), { saturated: false, spreadPp: null }, "fewer than ten models are not checked");
  assert.equal(saturationOf([10, 10.5, 11, 11.2, 11.4, 11.6, 11.8, 12, 12.2, 12.4], 100, "LOWER").saturated, true, "lower-is-better sorts the other way");
});

const run = (score: number | null, correct = 50) => ({ main: { correct, new_score: score, tokens: 1e6, cost: 2.5, duration_min: 30, flagged_rate: 0.01 }, extended: { correct: 70, new_score: 0.1, tokens: 1, cost: 1 } });

test("FrontierCode: one row per model and effort on the main subset", () => {
  const doc = {
    v1: { models: [], harness: {}, efforts: {}, subsets: {}, data: {} },
    v1_1: {
      models: ["gpt-x", "claude-y", "open-z"],
      harness: { "gpt-x": "codex", "claude-y": "claude-code", "open-z": "mini-swe-agent" },
      efforts: { "gpt-x": ["high", "medium"], "claude-y": ["max"], "open-z": ["none"] },
      subsets: { main: 100, extended: 150 },
      data: {
        "gpt-x": { high: run(0.62, 60), medium: run(0.55) },
        "claude-y": { max: run(0.62, 61) },
        "open-z": { none: run(null) },
      },
    },
  };
  const result = parseFrontierCode(doc);
  assert.equal(result.sourceKey, "frontiercode");
  assert.equal(result.attributionUrl, "https://cognition.com/frontiercode");
  assert.equal(result.rows.length, 3, "a run without a score is skipped");
  const [high, medium, claude] = result.rows;
  assert.equal(high!.rawScore, 0.62, "new_score, not the extended subset");
  assert.equal(high!.sampleSize, 100);
  assert.deepEqual([high!.sourceRank, medium!.sourceRank, claude!.sourceRank], [1, 3, 1], "ties share a rank");
  assert.equal(high!.metadata!.harness, "codex");
  assert.equal(high!.metadata!.reasoningEffort, "high");
  assert.equal(claude!.metadata!.correct, 61);
  assert.notEqual(high!.configuration, medium!.configuration, "efforts are distinct configurations");
  assert.throws(() => parseFrontierCode({}), /v1_1 missing/);
});
