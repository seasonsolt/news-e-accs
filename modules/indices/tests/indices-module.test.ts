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
  // gpt-4-0314 takes its launch price from seeds/price-history.json; glm-5-3-flash has only its official CNY
  // price in the leaderboard's seed file. Its live leaderboard price (from OpenRouter) is not read.
  await sql`INSERT INTO lb_models (id, slug, name, provider, released_at) VALUES
    (${gpt4}, 'gpt-4-0314', 'GPT-4 (0314)', 'OpenAI', '2023-03-14T00:00Z'),
    (${cny}, 'glm-5-3-flash', 'Test CNY model', 'Test', '2024-05-01T00:00Z')`;
  const snapshot = createId();
  await sql`INSERT INTO lb_snapshots (id, source_key, source_name, fetched_at, license, attribution_url)
    VALUES (${snapshot}, 'epoch-gpqa', 'Epoch GPQA Diamond', '2026-10-10T00:00Z', 'CC BY 4.0', 'https://epoch.ai/benchmarks/gpqa-diamond')`;
  for (const [model, config, score] of [[gpt4, "default", 0.36], [cny, "low", 0.4], [cny, "high", 0.62]] as const) {
    await sql`INSERT INTO lb_scores (id, snapshot_id, model_id, configuration_key, metric_key, raw_score) VALUES (${createId()}, ${snapshot}, ${model}, ${config}, 'epoch-gpqa', ${score})`;
  }
  await sql`INSERT INTO lb_prices (model_id, kind, currency, input, output, source_url, verified_on) VALUES (${cny}, 'official', 'USD', 0.01, 0.01, 'https://openrouter.ai/z-ai/glm-5.3-flash', '2026-10-19')`;
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
  assert.deepEqual(low.points.map((p) => [p.date, p.model.slug, Number(p.price.toFixed(4))]), [["2023-03-14", "gpt-4-0314", 37.5], ["2024-05-01", "glm-5-3-flash", 0.1857]]);
  assert.equal(low.ratio !== null && Math.round(low.ratio), 202);
  assert.deepEqual(body.tiers.find((t) => t.key === "gpqa-50")!.points.map((p) => [p.model.slug, p.score]), [["glm-5-3-flash", 0.62]], "a model counts with its best configuration");
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
  assert.ok(lines.includes("gpqa-35,0.35,2024-05-01,0.1857,Test CNY model,Test,0.6200,CNY,0.8,2.8,true,https://www.bigmodel.cn/pricing"));
});

test("the chart is a PNG beside the page, in English unless asked for Chinese, and answers 304 when unchanged", async () => {
  const en = await app.inject("/index/cost-of-intelligence.png");
  assert.equal(en.statusCode, 200);
  assert.equal(en.headers["content-type"], "image/png");
  assert.equal(en.headers["access-control-allow-origin"], "*");
  assert.equal(en.headers["cache-control"], "public, max-age=300, s-maxage=600, stale-while-revalidate=3600");
  assert.deepEqual([...en.rawPayload.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.deepEqual([en.rawPayload.readUInt32BE(16), en.rawPayload.readUInt32BE(20)], [1200, 630], "the share-card size");
  const zh = await app.inject("/index/cost-of-intelligence.png?lang=zh");
  assert.equal(zh.statusCode, 200);
  assert.notEqual(zh.headers.etag, en.headers.etag);
  assert.equal((await app.inject({ url: "/index/cost-of-intelligence.png", headers: { "if-none-match": String(en.headers.etag) } })).statusCode, 304);
  assert.equal((await app.inject("/index/cost-of-intelligence.png?lang=fr")).statusCode, 400);
});

test("agents read the index as Markdown at its own address and as an MCP tool, and the guide names it", async () => {
  const markdown = await app.inject("/api/v1/agent/cost-of-intelligence");
  assert.equal(markdown.statusCode, 200);
  assert.match(String(markdown.headers["content-type"]), /^text\/markdown/);
  assert.match(markdown.body, /\| ≥ 35%（GPT-4） \| 2023-03-14 GPT-4 \(0314\) \$37\.50 \| 2024-05-01 Test CNY model \$0\.19 \| 202 倍 \|/);
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
  assert.deepEqual([low.first.model.slug, low.current.model.slug, Math.round(low.ratio)], ["gpt-4-0314", "glm-5-3-flash", 202]);
});

test("the index is routed to the api, listed in the sitemap and llms.txt, and rendered in both editions", async () => {
  assert.equal(normalizePagePath("/index/cost-of-intelligence"), "/index/cost-of-intelligence", "its page views are counted");
  assert.equal(normalizePagePath("/zh/index/cost-of-intelligence"), "/zh/index/cost-of-intelligence");
  assert.equal(isApiOwned("/api/site/indices/cost-of-intelligence.csv"), true);
  assert.equal(isApiOwned("/index/cost-of-intelligence"), false);
  assert.equal(isApiOwned("/index/cost-of-intelligence.png"), true);
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
        assert.equal(dataset.license, "https://creativecommons.org/licenses/by/4.0/", `${prefix}: ${dataset.name} names its license`);
      }
      const distribution = datasets.find((d) => d.distribution)?.distribution as { contentUrl: string };
      const csvPath = new URL(distribution.contentUrl).pathname;
      const robots = await app.inject("/robots.txt");
      assert.equal(robots.statusCode, 200);
      const rules = [...robots.body.matchAll(/^(Allow|Disallow):\s*(\S+)/gm)].map((m) => ({ allow: m[1] === "Allow", path: m[2]! }));
      const allowed = (path: string) => rules.filter((r) => path.startsWith(r.path)).sort((a, b) => b.path.length - a.path.length || Number(b.allow) - Number(a.allow))[0]?.allow ?? true;
      assert.equal(allowed(csvPath), true);
      assert.equal(allowed("/api/site/indices/cost-of-intelligence"), false);
      assert.equal(allowed("/api/site/reports/daily/latest-page"), false);
      assert.match(html, /hrefLang="zh-CN"|hreflang="zh-CN"/);
      assert.match(html, /<svg[^>]+role="img"/);
      assert.ok(html.includes("Test CNY model"), `${prefix}: the steps table names the model`);
      assert.ok(html.includes("/api/site/indices/cost-of-intelligence.csv"));
      assert.equal(allowed("/index/cost-of-intelligence.png"), true, "crawlers may fetch the chart");
      const chart = prefix ? "/index/cost-of-intelligence.png?lang=zh" : "/index/cost-of-intelligence.png";
      assert.ok(html.includes(`property="og:image" content="${web.origin}${chart.replace("?", "?").replace("&", "&amp;")}"`), `${prefix}: the chart is the share image`);
      assert.ok(html.includes('id="cite"'), prefix);
      // Key figures: GPT-4 at launch → the CNY model now, 202× (see the API test above).
      assert.ok(html.includes(prefix ? "GPT-4 水平的能力（GPQA Diamond ≥ 35%）在 2023-03-14 每百万 token 要 $37.50，现在只要 $0.19（Test CNY model），便宜了 202 倍" : "Capability at GPQA Diamond ≥ 35% (GPT-4 level) cost $37.50 per million tokens on 2023-03-14 and costs $0.19 now (Test CNY model): 202× cheaper"), prefix);
      assert.ok(html.includes(`&lt;img src=&quot;${web.origin}${chart}&quot;`), `${prefix}: the embed code points at the chart`);
      assert.ok(html.includes(`&lt;a href=&quot;${web.origin}${prefix}/index/cost-of-intelligence&quot;&gt;`), `${prefix}: and links back to the page`);
    }
    for (const prefix of ["", "/zh"]) {
      assert.match(await (await fetch(`${web.origin}${prefix || "/"}`)).text(), new RegExp(`href="${prefix}/index/cost-of-intelligence"`), `${prefix || "/"}: the front page links the index`);
    }
    const listing = await app.inject({ method: "POST", url: "/api/mcp",
      headers: { host: "localhost", "content-type": "application/json", accept: "application/json, text/event-stream" },
      payload: { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} } });
    assert.equal(listing.statusCode, 200);
    const body = listing.body.startsWith("{") ? listing.body : listing.body.split("\n").find((line) => line.startsWith("data:"))!.slice(5);
    const tools = JSON.parse(body).result.tools.map((t: { name: string }) => t.name).sort();
    const agent = await (await fetch(`${web.origin}/agent?tab=mcp`)).text();
    const cells = [...agent.matchAll(/<tr[^>]*>\s*<td[^>]*>(.*?)<\/td>/gs)].map((m) => m[1]!.replace(/<[^>]+>/g, "").trim());
    assert.deepEqual(cells.filter((name) => name.startsWith("eacc_")).sort(), tools);
    assert.ok(agent.includes('href="/api/v1/agent/cost-of-intelligence"'));
    assert.equal(web.logs().includes("error"), false, web.logs());
  } finally {
    await web.stop();
  }
});
