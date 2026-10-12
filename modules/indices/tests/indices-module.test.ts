import "../../../tests/setup.ts";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, before, test } from "node:test";
import { createId } from "@paralleldrive/cuid2";
import { closeDb, sql } from "@aihot/backend/db";
import { installModules } from "@aihot/backend/modules";
import { loadDiscoveryEntries } from "@aihot/backend/publication/sitemap";
import { loadLlmsAvailability, llmsTxt } from "@aihot/backend/publication/llms";
import { isApiOwned } from "@aihot/contracts/http-policy";
import { buildApp } from "../../../apps/api/src/app.ts";
import { startWebServer } from "../../../apps/web/tests/web-server.ts";
import type { CostOfIntelligence } from "../contracts.ts";

process.env.COLLECT_ENABLED = "false";
process.env.MODEL_CALLS_ENABLED = "false";
const { default: indices } = await import("../server.ts");
installModules([indices]);
const app = await buildApp();
const gpt4 = createId();
const cny = createId();

before(async () => {
  await app.ready();
  // gpt-4-0314 takes its launch price from seeds/price-history.json; the other has only a current CNY price.
  await sql`INSERT INTO lb_models (id, slug, name, provider, released_at) VALUES
    (${gpt4}, 'gpt-4-0314', 'GPT-4 (0314)', 'OpenAI', '2023-03-14T00:00Z'),
    (${cny}, 'coi-test-cny', 'Test CNY model', 'Test', '2024-05-01T00:00Z')`;
  const snapshot = createId();
  await sql`INSERT INTO lb_snapshots (id, source_key, source_name, fetched_at, license, attribution_url)
    VALUES (${snapshot}, 'epoch-gpqa', 'Epoch GPQA Diamond', '2026-10-10T00:00Z', 'CC BY 4.0', 'https://epoch.ai/benchmarks/gpqa-diamond')`;
  for (const [model, config, score] of [[gpt4, "default", 0.36], [cny, "low", 0.4], [cny, "high", 0.62]] as const) {
    await sql`INSERT INTO lb_scores (id, snapshot_id, model_id, configuration_key, metric_key, raw_score) VALUES (${createId()}, ${snapshot}, ${model}, ${config}, 'epoch-gpqa', ${score})`;
  }
  await sql`INSERT INTO lb_prices (model_id, kind, currency, input, output, source_url, verified_on) VALUES (${cny}, 'official', 'CNY', 1, 2, 'https://example.org/cny', '2026-09-26')`;
  await sql`INSERT INTO fx_rates (as_of, pair, rate, source_name) VALUES ('2026-10-09', 'USD/CNY', 7, '欧洲央行')`;
});
after(async () => {
  await app.close();
  installModules([]);
  await closeDb();
});

test("the index API steps from GPT-4's launch price to the cheaper CNY model, and offers CSV", async () => {
  const response = await app.inject("/api/site/indices/cost-of-intelligence");
  assert.equal(response.statusCode, 200);
  const body = response.json() as CostOfIntelligence;
  const low = body.tiers.find((t) => t.key === "gpqa-35")!;
  assert.deepEqual(low.points.map((p) => [p.date, p.model.slug, Number(p.price.toFixed(4))]), [["2023-03-14", "gpt-4-0314", 37.5], ["2024-05-01", "coi-test-cny", 0.1786]]);
  assert.equal(low.ratio !== null && Math.round(low.ratio), 210);
  assert.deepEqual(body.tiers.find((t) => t.key === "gpqa-50")!.points.map((p) => [p.model.slug, p.score]), [["coi-test-cny", 0.62]], "a model counts with its best configuration");
  assert.equal(body.modelCount, 2);
  assert.deepEqual(body.fx, { rate: 7, asOf: "2026-10-09" });
  assert.equal(body.gpqa.url, "https://epoch.ai/benchmarks/gpqa-diamond");
  assert.equal((await app.inject({ url: "/api/site/indices/cost-of-intelligence", headers: { "if-none-match": response.headers.etag } })).statusCode, 304);

  const csv = await app.inject("/api/site/indices/cost-of-intelligence.csv");
  assert.equal(csv.statusCode, 200);
  assert.match(String(csv.headers["content-type"]), /^text\/csv/);
  const lines = csv.body.trim().split("\n");
  assert.match(lines[0]!, /^tier,gpqa_threshold,date,blended_usd_per_mtok,model,/);
  assert.equal(lines.length, 1 + body.tiers.reduce((n, t) => n + t.points.length, 0));
  assert.ok(lines.includes("gpqa-35,0.35,2024-05-01,0.1786,Test CNY model,Test,0.6200,CNY,1,2,true,https://example.org/cny"));
});

test("the index is routed to the api, listed in the sitemap and llms.txt, and rendered in both editions", async () => {
  assert.equal(isApiOwned("/api/site/indices/cost-of-intelligence.csv"), true);
  assert.equal(isApiOwned("/index/cost-of-intelligence"), false);
  assert.ok((await loadDiscoveryEntries()).some((e) => e.loc === "/index/cost-of-intelligence"));
  assert.match(llmsTxt(await loadLlmsAvailability()), /\[Cost of intelligence\]\([^\n]+\/index\/cost-of-intelligence\)/);

  const web = await startWebServer(createServer(async (req, res) => {
    const response = await app.inject({ method: "GET", url: req.url!, headers: req.headers });
    res.writeHead(response.statusCode, response.headers);
    res.end(response.rawPayload);
  }), { COLLECT_ENABLED: "false", MODEL_CALLS_ENABLED: "false", FEISHU_INTERNAL_ENABLED: "false" });
  try {
    for (const [prefix, title] of [["", "The cost of intelligence"], ["/zh", "智能成本指数"]] as const) {
      const response = await fetch(`${web.origin}${prefix}/index/cost-of-intelligence`);
      assert.equal(response.status, 200, prefix);
      const html = await response.text();
      assert.ok(html.includes(title), prefix);
      assert.match(html, /"@type":"Dataset"/);
      assert.match(html, /hrefLang="zh-CN"|hreflang="zh-CN"/);
      assert.match(html, /<svg[^>]+role="img"/);
      assert.ok(html.includes("Test CNY model"), `${prefix}: the steps table names the model`);
      assert.ok(html.includes("/api/site/indices/cost-of-intelligence.csv"));
    }
    assert.equal(web.logs().includes("error"), false, web.logs());
  } finally {
    await web.stop();
  }
});
