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
import { mcpToolName } from "@aihot/contracts/mcp";
import { normalizePagePath } from "@aihot/backend/site/analytics";
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

/** Every JSON-LD node on a page, nested ones included: Google validates each Dataset it finds. */
function jsonLdNodes(html: string): Array<Record<string, unknown>> {
  const nodes: Array<Record<string, unknown>> = [];
  const walk = (value: unknown) => {
    if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === "object") {
      nodes.push(value as Record<string, unknown>);
      Object.values(value).forEach(walk);
    }
  };
  for (const [, json] of html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) walk(JSON.parse(json!));
  return nodes;
}

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

test("agents read the index as Markdown at its own address and as an MCP tool, and the guide names it", async () => {
  const markdown = await app.inject("/api/v1/agent/cost-of-intelligence");
  assert.equal(markdown.statusCode, 200);
  assert.match(String(markdown.headers["content-type"]), /^text\/markdown/);
  assert.match(markdown.body, /\| ≥ 35%（GPT-4） \| 2023-03-14 GPT-4 \(0314\) \$37\.50 \| 2024-05-01 Test CNY model \$0\.18 \| 210 倍 \|/);
  assert.match(markdown.body, /## 回答提示/);
  assert.match(markdown.body, /\/api\/site\/indices\/cost-of-intelligence\.csv/);
  assert.match((await app.inject("/api/v1/agent")).body, /智能成本指数[\s\S]*\/api\/v1\/agent\/cost-of-intelligence/);

  const rpc = async (method: string, params: object) => {
    const response = await app.inject({ method: "POST", url: "/api/mcp", headers: { host: "localhost", "content-type": "application/json", accept: "application/json, text/event-stream" }, payload: { jsonrpc: "2.0", id: 1, method, params } });
    assert.equal(response.statusCode, 200, response.body);
    return JSON.parse(response.body.startsWith("{") ? response.body : response.body.split("\n").find((line) => line.startsWith("data:"))!.slice(5));
  };
  const name = mcpToolName("get_cost_of_intelligence");
  assert.ok((await rpc("tools/list", {})).result.tools.some((tool: { name: string }) => tool.name === name));
  const called = (await rpc("tools/call", { name, arguments: {} })).result;
  assert.notEqual(called.isError, true, JSON.stringify(called));
  assert.match(called.content[0].text, /智能成本指数/);
  const low = called.structuredContent.tiers.find((t: { threshold: number }) => t.threshold === 0.35);
  assert.deepEqual([low.first.model.slug, low.current.model.slug, Math.round(low.ratio)], ["gpt-4-0314", "coi-test-cny", 210]);
});

test("the index is routed to the api, listed in the sitemap and llms.txt, and rendered in both editions", async () => {
  assert.equal(normalizePagePath("/index/cost-of-intelligence"), "/index/cost-of-intelligence", "its page views are counted");
  assert.equal(normalizePagePath("/zh/index/cost-of-intelligence"), "/zh/index/cost-of-intelligence");
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
      const datasets = jsonLdNodes(html).filter((node) => node["@type"] === "Dataset");
      assert.equal(datasets.length, 2, `${prefix}: the index and the benchmark it is based on`);
      for (const dataset of datasets) {
        assert.ok(typeof dataset.description === "string" && dataset.description.trim(), `${prefix}: ${dataset.name} has a description`);
        assert.ok((dataset.creator as { name?: string } | undefined)?.name, `${prefix}: ${dataset.name} has a creator`);
      }
      assert.match(html, /hrefLang="zh-CN"|hreflang="zh-CN"/);
      assert.match(html, /<svg[^>]+role="img"/);
      assert.ok(html.includes("Test CNY model"), `${prefix}: the steps table names the model`);
      assert.ok(html.includes("/api/site/indices/cost-of-intelligence.csv"));
    }
    for (const prefix of ["", "/zh"]) {
      assert.match(await (await fetch(`${web.origin}${prefix || "/"}`)).text(), new RegExp(`href="${prefix}/index/cost-of-intelligence"`), `${prefix || "/"}: the front page links the index`);
    }
    assert.equal(web.logs().includes("error"), false, web.logs());
  } finally {
    await web.stop();
  }
});
