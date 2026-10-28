import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { computeCostOfIntelligence, halvingMonths, OFFICIAL_PRICE_FILE, readOfficialPrices, readPriceHistory, type CoiInput, type PriceEntry, type ScoredModel } from "../backend/cost-of-intelligence.ts";

const model = (slug: string, score: number, releasedOn: string | null = null): ScoredModel => ({ slug, name: slug.toUpperCase(), provider: null, releasedOn, score });
const price = (slug: string, from: string, input: number, output: number, extra: Partial<PriceEntry> = {}): PriceEntry =>
  ({ slug, from, currency: "USD", input, output, source: `https://example.org/${slug}`, verified: true, ...extra });
const base: CoiInput = { today: "2025-01-01", models: [], history: [], current: [], usdCny: 7 };
const steps = (input: CoiInput, key: string) => computeCostOfIntelligence(input).tiers.find((t) => t.key === key)!.points.map((p) => [p.date, p.model.slug, p.price]);

test("each threshold steps to the cheapest model at or above it, on launches and price changes", () => {
  const input: CoiInput = {
    ...base,
    models: [model("a", 0.4), model("b", 0.6), model("weak", 0.3)],
    history: [price("a", "2023-01-01", 10, 10), price("b", "2023-06-01", 4, 8), price("weak", "2023-02-01", 0.1, 0.1), price("a", "2024-01-01", 2, 2, { verified: false })],
  };
  assert.deepEqual(steps(input, "gpqa-35"), [["2023-01-01", "a", 10], ["2023-06-01", "b", 5], ["2024-01-01", "a", 2]]);
  assert.deepEqual(steps(input, "gpqa-50"), [["2023-06-01", "b", 5]]);
  assert.deepEqual(steps(input, "gpqa-90"), []);
  const tier = computeCostOfIntelligence(input).tiers[0]!;
  assert.equal(tier.ratio, 5);
  assert.equal(tier.points.at(-1)!.verified, false, "an unverified price stays marked");
  assert.equal(computeCostOfIntelligence(input).modelCount, 3);
});

test("a launch at the price already on the line is not a step", () => {
  const input: CoiInput = { ...base, models: [model("z-old", 0.5), model("a-new", 0.5)], history: [price("z-old", "2023-01-01", 4, 4), price("a-new", "2023-05-01", 4, 4)] };
  assert.deepEqual(steps(input, "gpqa-50"), [["2023-01-01", "z-old", 4]]);
  const together = { ...input, history: [price("z-old", "2023-01-01", 4, 4), price("a-new", "2023-01-01", 4, 4)] };
  assert.deepEqual(steps(together, "gpqa-50"), [["2023-01-01", "a-new", 4]], "launches on one day break the tie by slug");
});

test("current prices extend the history; a model without history has its current price since release", () => {
  const input: CoiInput = {
    ...base,
    models: [model("a", 0.4), model("same", 0.4), model("fresh", 0.4, "2024-03-01"), model("undated", 0.4)],
    history: [price("a", "2023-01-01", 10, 10), price("same", "2023-01-01", 20, 20)],
    current: [
      { slug: "a", currency: "USD", input: 6, output: 6, source: null, verifiedOn: "2024-09-26" },
      { slug: "same", currency: "USD", input: 20, output: 20, source: null, verifiedOn: "2024-09-26" },
      { slug: "fresh", currency: "USD", input: 8, output: 8, source: null, verifiedOn: "2024-09-26" },
      { slug: "undated", currency: "USD", input: 0.01, output: 0.01, source: null, verifiedOn: "2024-09-26" },
    ],
  };
  assert.deepEqual(steps(input, "gpqa-35"), [["2023-01-01", "a", 10], ["2024-03-01", "fresh", 8], ["2024-09-26", "a", 6]]);
  const later = { ...input, models: input.models.map((m) => (m.slug === "fresh" ? { ...m, score: 0.9 } : m)) };
  assert.deepEqual(steps(later, "gpqa-90"), [["2024-03-01", "fresh", 8]]);
  assert.equal(computeCostOfIntelligence(input).modelCount, 3, "a model with neither a history nor a release date is left out");
});

test("CNY prices convert at the rate given, are left out without one, and future prices wait", () => {
  const input: CoiInput = {
    ...base,
    models: [model("cny", 0.5)],
    history: [price("cny", "2024-01-01", 7, 7, { currency: "CNY" }), price("cny", "2026-01-01", 0.7, 0.7, { currency: "CNY" })],
  };
  assert.deepEqual(steps(input, "gpqa-50"), [["2024-01-01", "cny", 1]]);
  assert.deepEqual(steps({ ...input, usdCny: null }, "gpqa-50"), []);
});

test("the halving time fits log price on months and needs a falling line", () => {
  const monthly = Array.from({ length: 13 }, (_, i) => ({ date: `${2023 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}-01`, price: 2 ** (-i / 6) }));
  assert.ok(Math.abs(halvingMonths(monthly, "2024-01-15")! - 6) < 1e-9);
  assert.equal(halvingMonths([{ date: "2023-01-01", price: 1 }, { date: "2023-06-01", price: 2 }], "2024-01-01"), null, "a rising line has no halving time");
  assert.equal(halvingMonths([{ date: "2024-11-20", price: 2 }, { date: "2024-12-10", price: 1 }], "2025-01-05"), null, "under three samples");
  assert.equal(halvingMonths([{ date: "2023-01-01", price: 1 }], "2025-01-01"), null);
});

test("the price history names known models, in date order, with official https sources", () => {
  const history = readPriceHistory();
  const seeds = path.resolve(import.meta.dirname, "../../leaderboard/seeds");
  const directory = readdirSync(seeds).filter((f) => f.startsWith("lb-models-")).sort().at(-1)!;
  // Models released after the directory file was cut.
  const later = ["gemini-4-argon", "claude-haiku-5-5", "claude-sonnet-5-5", "gpt-6-1-sol", "mistral-large-4-0", "deepseek-v-4-1-flash-1017"];
  const known = new Set([...(JSON.parse(readFileSync(path.join(seeds, directory), "utf8")) as { models: unknown[][] }).models.map((m) => m[0] as string), ...later]);
  const raw = JSON.parse(readFileSync(path.resolve(import.meta.dirname, "../seeds/price-history.json"), "utf8")) as { prices: Array<Record<string, unknown>> };
  const bySlug = new Map<string, Array<Record<string, unknown>>>();
  for (const entry of raw.prices) {
    const where = `${entry.slug}@${entry.from}`;
    assert.ok(known.has(entry.slug as string), `${where}: not in the model directory`);
    assert.match(entry.from as string, /^\d{4}-\d{2}-\d{2}$/, where);
    assert.ok(!Number.isNaN(Date.parse(`${entry.from}T00:00:00Z`)) && new Date(`${entry.from}T00:00:00Z`).toISOString().startsWith(entry.from as string), `${where}: not a real date`);
    assert.ok(["USD", "CNY"].includes(entry.currency as string), where);
    assert.ok(typeof entry.input === "number" && entry.input > 0 && typeof entry.output === "number" && entry.output > 0, `${where}: prices`);
    assert.ok(["launch", "cut"].includes(entry.kind as string), where);
    assert.equal(typeof entry.verified, "boolean", where);
    assert.match(entry.source as string, /^https:\/\//, where);
    bySlug.set(entry.slug as string, [...(bySlug.get(entry.slug as string) ?? []), entry]);
  }
  for (const [slug, entries] of bySlug) {
    const dates = entries.map((e) => e.from as string);
    assert.deepEqual(dates, [...dates].sort(), `${slug}: entries out of date order`);
    assert.equal(new Set(dates).size, dates.length, `${slug}: two prices on one day`);
    assert.equal(entries[0]!.kind, "launch", `${slug}: the first entry is its launch price`);
  }
  assert.equal(history.length, raw.prices.length);
});

test("current prices are the official ones in the leaderboard's seed file, not its live prices", () => {
  const leaderboard = readFileSync(path.resolve(import.meta.dirname, "../../leaderboard/backend/prices.ts"), "utf8");
  assert.ok(leaderboard.includes(`"../seeds/${path.basename(OFFICIAL_PRICE_FILE)}"`), "the leaderboard's PRICE_FILE");
  const current = readOfficialPrices();
  assert.ok(current.length > 20);
  for (const p of current) {
    assert.match(p.source!, /^https:\/\//, p.slug);
    assert.ok(!p.source!.includes("openrouter.ai"), `${p.slug}: not an official source`);
    assert.ok(p.input >= 0 && p.output >= 0 && p.verifiedOn, p.slug);
  }
});
