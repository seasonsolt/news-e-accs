// Prices from OpenRouter's public model list, against a local stand-in: the latest run's models take its
// standard listing; an unchanged price is re-verified, a changed one replaced, a missing one added, and a
// model it does not list keeps its price.
import "../../../tests/setup.ts";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, test } from "node:test";
import { createId } from "@paralleldrive/cuid2";
import { closeDb, sql } from "@aihot/backend/db";
import { config } from "@aihot/backend/config";
import { refreshPrices, routerIndex, routerMatch } from "../backend/prices.ts";
import { invalidateLeaderboard } from "../backend/read.ts";
import { LEADERBOARD_PUBLIC_BOARDS } from "../taxonomy.ts";

config.allowPrivateNetworkFetch = true;
const filler = Array.from({ length: 60 }, (_, i) => ({ id: `filler/m-${i}`, pricing: { prompt: "0.000001", completion: "0.000001" } }));

test("OpenRouter's standard listing matches a model by slug or name", () => {
  const data = [
    { id: "anthropic/claude-opus-5.5", pricing: { prompt: "0.000004", completion: "0.00002", input_cache_read: "0.0000002" } },
    { id: "anthropic/claude-opus-5.5:batch", pricing: { prompt: "0.000002", completion: "0.00001" } },
    { id: "~anthropic/claude-opus-latest", pricing: { prompt: "0.000001", completion: "0.000001" } },
    { id: "qwen/qwen3.8-max", pricing: { prompt: "0.000002", completion: "0.000006" } },
    { id: "free/model", pricing: { prompt: "0", completion: "0" } },
    ...filler,
  ];
  const index = routerIndex({ data });
  assert.deepEqual(routerMatch(index, { slug: "claude-opus-5-5", name: "Claude Opus 5.5" }), { id: "anthropic/claude-opus-5.5", input: 4, output: 20, cached: 0.2 });
  assert.equal(routerMatch(index, { slug: "qwen-3-8-max-x", name: "Qwen3.8 Max" })?.id, "qwen/qwen3.8-max");
  assert.equal(routerMatch(index, { slug: "claude-opus-latest", name: "x" }), null);
  assert.equal(routerMatch(index, { slug: "model", name: "Model" }), null, "a free listing is not a price");
  assert.throws(() => routerIndex({ data: data.slice(0, 3) }), /unexpected/);
});

const models = ["alpha-1", "beta-2", "gamma-3", "delta-4"].map((slug) => ({ slug, id: createId() }));
const [alpha, beta, gamma, delta] = models;
let listed: Record<string, [string, string, string?]> = {};
const router = createServer((req, res) => {
  if (req.url === "/broken") return void res.writeHead(500).end();
  const data = [...Object.entries(listed).map(([slug, [prompt, completion, cache]]) => ({ id: `vendor/${slug}`, pricing: { prompt, completion, ...(cache ? { input_cache_read: cache } : {}) } })), ...filler];
  res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ data }));
});
await new Promise<void>((resolve) => router.listen(0, "127.0.0.1", () => resolve()));
const url = `http://127.0.0.1:${(router.address() as { port: number }).port}/models`;
after(async () => { await new Promise((resolve) => router.close(resolve)); await closeDb(); });

const prices = async () => Object.fromEntries((await sql<{ slug: string; p: string }[]>`
  SELECT m.slug, concat_ws(' ', p.currency, p.input::float8, p.output::float8, p.cached_input::float8, to_char(p.verified_on, 'MM-DD'), p.source_url) AS p
  FROM lb_prices p JOIN lb_models m ON m.id = p.model_id WHERE p.kind = 'official' AND m.slug = ANY(${models.map((m) => m.slug)})`).map((r) => [r.slug, r.p]));

test("each refresh takes OpenRouter's price for the models it lists", async () => {
  for (const m of models) await sql`INSERT INTO lb_models (id, slug, name, provider) VALUES (${m.id}, ${m.slug}, ${m.slug.replace("-", " ")}, 'Vendor')`;
  const input = (board: string) => ({ board, registry: {}, signals: [], anchors: [] });
  await sql`INSERT INTO lb_runs (id, methodology_version, generated_at, source_snapshot_ids, summary, status, origin)
    VALUES ('price-run', 'test', now(), '{}', ${sql.json({ consensus: { input: LEADERBOARD_PUBLIC_BOARDS.map(input), boards: [] } })}, 'published', 'imported')`;
  for (const [i, m] of models.entries()) {
    for (const board of LEADERBOARD_PUBLIC_BOARDS) await sql`INSERT INTO lb_rankings (run_id, board, model_id, rank, score, coverage, metric_count, detail) VALUES ('price-run', ${board}, ${m.id}, ${i + 1}, ${10 - i}, 0.8, 1, '{}')`;
  }
  await sql`INSERT INTO lb_prices (model_id, kind, currency, input, output, cached_input, source_url, verified_on) VALUES
    (${alpha.id}, 'official', 'USD', 2, 10, 0.2, 'https://vendor.example/pricing', '2026-09-26'),
    (${beta.id}, 'official', 'CNY', 12, 36, null, 'https://vendor.example/cn', '2026-09-26'),
    (${delta.id}, 'official', 'USD', 1, 1, null, 'https://vendor.example/delta', '2026-09-26')`;
  invalidateLeaderboard();
  listed = { "alpha-1": ["0.000002", "0.00001", "0.0000002"], "beta-2": ["0.0000015", "0.0000045"], "gamma-3": ["0.000001", "0.000002"] };

  assert.deepEqual(await refreshPrices({ url, today: "2026-10-01" }), { same: 1, changed: 1, added: 1, notOnRouter: 1 });
  assert.deepEqual(await prices(), {
    "alpha-1": "USD 2 10 0.2 10-01 https://openrouter.ai/vendor/alpha-1",
    "beta-2": "USD 1.5 4.5 10-01 https://openrouter.ai/vendor/beta-2",
    "gamma-3": "USD 1 2 10-01 https://openrouter.ai/vendor/gamma-3",
    "delta-4": "USD 1 1 09-26 https://vendor.example/delta",
  });

  listed["alpha-1"] = ["0.000001", "0.000005", "0.0000001"];
  assert.deepEqual(await refreshPrices({ url, today: "2026-10-02" }), { same: 2, changed: 1, added: 0, notOnRouter: 1 });
  assert.equal((await prices())["beta-2"], "USD 1.5 4.5 10-02 https://openrouter.ai/vendor/beta-2");

  // A list that cannot be read changes nothing.
  await assert.rejects(refreshPrices({ url: url.replace("/models", "/broken"), today: "2026-10-03" }), /HTTP 500/);
  assert.equal((await prices())["alpha-1"], "USD 1 5 0.1 10-02 https://openrouter.ai/vendor/alpha-1");
});
