import "../../../tests/setup.ts";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, before, test } from "node:test";
import { createId } from "@paralleldrive/cuid2";
import { closeDb, sql } from "@aihot/backend/db";
import { installModules } from "@aihot/backend/modules";
import { loadDiscoveryEntries } from "@aihot/backend/publication/sitemap";
import { loadLlmsAvailability, llmsTxt } from "@aihot/backend/publication/llms";
import { normalizePagePath } from "@aihot/backend/site/analytics";
import { isApiOwned, resolveRedirect } from "@aihot/contracts/http-policy";
import { buildApp } from "../../../apps/api/src/app.ts";
import { startWebServer } from "../../../apps/web/tests/web-server.ts";
import { invalidateLeaderboard } from "../backend/read.ts";
import { SOURCE_GROUPS } from "../backend/registry.ts";

process.env.COLLECT_ENABLED = "false";
process.env.MODEL_CALLS_ENABLED = "false";
const { default: leaderboard } = await import("../server.ts");
installModules([leaderboard]);
const app = await buildApp();
const ids = Array.from({ length: 31 }, () => createId());
const slugs = ids.map((_, i) => `lb-port-${i}`);
const snapshot = createId();
const oldRun = createId();
const liveRun = createId();
const categoryKeys = ["coding", "reasoning", "knowledge", "professional"];

before(async () => {
  await app.ready();
  invalidateLeaderboard();
});
after(async () => {
  await app.close();
  installModules([]);
  await closeDb();
});

async function storedRun(id: string, at: string, score: number, rate: number, saturated: boolean) {
  const input = {
    board: "overall",
    registry: { "livebench-coding": { family: "rolling-objective", weight: 0.012, operator: "livebench", protocol: "stored", direction: "HIGHER", interval_sd: null } },
    signals: [{ key: "livebench-coding", rows: slugs.map((modelSlug) => ({ modelSlug, score: 81.25, lowerBound: null, upperBound: null, configuration: "stored-config" })) }],
    anchors: [slugs[0]],
  };
  const summary = {
    budgets: [{ key: "coding", name: "编程与设计", weight: 0.12 }],
    fxQuote: { asOf: at.slice(0, 10), rate, sourceName: "欧洲央行" },
    sources: [{ key: "livebench-coding", weight: 0.012, evidenceBudgetKey: "coding", ...(saturated ? { saturated: true, spreadPp: 2.5, effectiveWeight: 0.006 } : {}) }],
    consensus: {
      input: ["overall", ...categoryKeys].map((board) => ({ ...input, board })),
      boards: [{ board: "overall", comparisons: { [slugs[0]]: [{ slug: slugs[1], net: 0.012, shared: 0.012, directCount: 1 }] } }],
      evidence: Object.fromEntries(slugs.map((slug) => [`livebench-coding:${slug}`, { snapshotId: snapshot, publishedAt: "1999-01-01T00:00:00.000Z", verifiedAt: "1999-01-02T00:00:00.000Z", configuration: "stored-config", carriedForward: false }])),
    },
  };
  await sql`INSERT INTO lb_runs (id, methodology_version, generated_at, source_snapshot_ids, summary, status, origin)
    VALUES (${id}, ${saturated ? "2026.10-public-consensus-v16" : "stored-pre-v16"}, ${at}, ${[snapshot]}, ${sql.json(summary)}, 'published', 'imported')`;
  for (const board of ["overall", ...categoryKeys]) {
    for (const [i, model] of ids.entries()) {
      await sql`INSERT INTO lb_rankings (run_id, board, model_id, rank, score, coverage, metric_count, detail)
        VALUES (${id}, ${board}, ${model}, ${i + 1}, ${score - i}, 0.8, 1, ${sql.json({ sourceCount: 1, stability: { from: i + 1, to: i + 1, fixedFrom: i + 1, fixedTo: i + 1, scenarios: 3, sensitive: false, incomplete: 0, unavailable: 0 } })})`;
    }
  }
}

test("module routing keeps legacy redirects and logo ownership", async () => {
  const { followsTime } = await import(new URL("../../../apps/web/app/features/chrono/at.ts", import.meta.url).href);
  const { localePath } = await import(new URL("../../../apps/web/app/lib/locale.ts", import.meta.url).href);
  assert.deepEqual(resolveRedirect("/leaderboard/methodology", "?at=1999-01-01"), { status: 308, location: "/leaderboard/sources", headers: {} });
  for (const category of ["aesthetics", "writing"]) assert.equal(resolveRedirect(`/leaderboard/category/${category}`, "")?.location, "/leaderboard");
  assert.equal(resolveRedirect("/leaderboard/category/overall", "")?.status, 404);
  for (const path of ["/model-providers/openai.svg", "/leaderboard-sources/arena.svg", "/api/site/leaderboard/sources"]) assert.equal(isApiOwned(path), true);
  assert.equal(isApiOwned("/leaderboard/sources"), false);
  for (const path of ["/leaderboard", "/leaderboard/category/coding", "/leaderboard/sources", "/leaderboard/rules"]) {
    assert.equal(followsTime(path), true);
    assert.equal(followsTime(`/zh${path}`), true);
    assert.equal(localePath(`${path}?at=1999-01-02`, "zh"), `/zh${path}?at=1999-01-02`);
  }
  assert.equal(followsTime("/model-providers/openai.svg"), false);
  assert.equal(normalizePagePath("/leaderboard"), "/leaderboard");
  assert.equal(normalizePagePath("/leaderboard/sources"), "/leaderboard/sources");
  assert.equal(normalizePagePath("/leaderboard/rules"), "/leaderboard/rules");
  assert.equal(normalizePagePath("/leaderboard/category/coding"), "/leaderboard/category/:key");
  assert.equal(normalizePagePath("/leaderboard/sources/arena-text"), "/leaderboard/sources/:key");
  assert.equal(normalizePagePath("/leaderboard/gpt-5-4"), "/leaderboard/:model");
});

test("empty site reports unavailable, kicks its first round and computes without fetching", async () => {
  const empty = await app.inject("/api/site/leaderboard/boards/overall");
  assert.equal(empty.statusCode, 503);
  assert.equal(empty.json().detail, "leaderboard not computed yet");
  assert.equal(empty.headers["retry-after"], "300");
  const past = await app.inject("/api/site/leaderboard/boards/overall?at=1998-01-01");
  assert.equal(past.statusCode, 404);
  assert.equal(past.json().detail, "no leaderboard run by that day");
  assert.equal(past.headers["cache-control"], "public, max-age=3600, s-maxage=86400");
  assert.equal((await leaderboard.llms!()).pages?.length, 0);
  assert.equal(await leaderboard.admin!.runs!(), null);
  const sent: unknown[][] = [];
  const boss = { send: async (...args: unknown[]) => { sent.push(args); return null; } } as unknown as Parameters<NonNullable<typeof leaderboard.workerStarted>>[0];
  await leaderboard.workerStarted!(boss);
  assert.deepEqual(sent, [["cron.leaderboard.round", {}, { singletonKey: "first-round" }]]);
  const [schedule] = leaderboard.schedules!;
  assert.deepEqual([schedule.name, schedule.cron, schedule.missed], ["leaderboard.round", "5 2,8,14,20 * * *", "once"]);
  const fetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("leaderboard must not fetch with collection off"); };
  try {
    const result = await schedule.run() as { status: string; reason: string };
    assert.equal(result.status, "failed");
    assert.equal(result.reason, "overall board has no evidence");
  } finally { globalThis.fetch = fetch; }
});

test("existing imported rows remain readable with their original run summary", async () => {
  for (const [i, id] of ids.entries()) {
    await sql`INSERT INTO lb_models (id, slug, name, provider, provider_slug, released_at, context_window_tokens)
      VALUES (${id}, ${slugs[i]}, ${`Stored model ${i}`}, 'OpenAI', 'openai', '1999-01-01', 128000)`;
  }
  await sql`INSERT INTO lb_snapshots (id, source_key, source_name, fetched_at, published_at, record_count, metadata)
    VALUES (${snapshot}, 'livebench-coding', 'LiveBench coding', '1999-01-02', '1999-01-01', 31, ${sql.json({ lastSeenAt: "1999-01-03T00:00:00.000Z" })})`;
  for (const [i, id] of ids.entries()) {
    await sql`INSERT INTO lb_scores (id, snapshot_id, model_id, configuration_key, configuration_label, selected_for_product, metric_key, raw_score, source_rank, source_model_name, metadata)
      VALUES (${createId()}, ${snapshot}, ${id}, 'stored-config', '来源默认配置', true, 'livebench-coding', 81.25, ${i + 1}, ${`upstream-${i}`}, ${sql.json({ configurationIdentity: "stored-config", categories: "Coding + Agentic Coding", "livebenchCategoryScore:Coding": 80, "livebenchCategoryScore:Agentic Coding": 82.5 })})`;
  }
  await sql`INSERT INTO lb_prices (model_id, kind, currency, input, output, cached_input, source_url, verified_on)
    VALUES (${ids[0]}, 'official', 'USD', 2, 10, 0.2, 'https://example.org/pricing', '1999-01-01')`;
  await storedRun(oldRun, "1999-01-02T15:59:59.999Z", 70, 7, false);
  await storedRun(liveRun, "1999-01-02T16:00:00.000Z", 80, 8, true);
  invalidateLeaderboard();

  const response = await app.inject("/api/site/leaderboard/boards/overall");
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["cache-control"], "public, max-age=120, s-maxage=300, stale-while-revalidate=600");
  const body = response.json();
  assert.deepEqual(Object.keys(body).sort(), ["board", "entries", "run", "tabs"]);
  assert.equal(body.run.id, liveRun);
  assert.equal(body.entries.length, 30);
  assert.deepEqual([body.entries[0].rank, body.entries[0].score, body.entries[0].confidence], [1, 80, "HIGH"]);
  assert.deepEqual(body.entries[0].price, { currency: "USD", input: 2, output: 10, cached: 0.2, inputCny: 16, outputCny: 80, cachedCny: 1.6, officialUrl: "https://example.org/pricing", verifiedOn: "1999-01-01" });
  assert.deepEqual(body.entries[0].model.brand, { src: "/model-providers/openai.svg", monogram: "O", raster: false });
  assert.deepEqual(body.tabs.map((t: { href: string }) => t.href), ["/leaderboard", "/leaderboard/category/coding", "/leaderboard/category/reasoning", "/leaderboard/category/knowledge", "/leaderboard/category/professional"]);
  assert.equal((await app.inject({ url: "/api/site/leaderboard/boards/overall", headers: { "if-none-match": response.headers.etag } })).statusCode, 304);

  for (const key of categoryKeys) {
    const response = await app.inject(`/api/site/leaderboard/boards/${key}`);
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().board.key, key);
    assert.equal(response.json().entries.length, 30);
    assert.equal(response.json().entries[0].score, 80);
  }
  const past = (await app.inject("/api/site/leaderboard/boards/overall?at=1999-01-02")).json();
  assert.equal(past.run.id, oldRun, "Beijing day ends immediately before the live run");
  assert.equal(past.entries[0].score, 70);
  assert.equal(past.entries[0].price.inputCny, 14);
  assert.equal((await app.inject("/api/site/leaderboard/boards/overall")).json().run.id, liveRun, "a historical read cannot replace the live cache");
  for (const url of ["/boards/aesthetics", "/boards/writing", `/models/${slugs[30]}`, "/models/missing", "/sources/missing"]) {
    assert.equal((await app.inject(`/api/site/leaderboard${url}`)).statusCode, 404);
  }
  for (const at of ["bad", "1999-02-30", "9999-01-01"]) assert.equal((await app.inject(`/api/site/leaderboard/boards/overall?at=${at}`)).statusCode, 400);

  const model = (await app.inject(`/api/site/leaderboard/models/${slugs[0]}`)).json();
  assert.equal(model.model.contextWindowTokens, 128000);
  assert.equal(model.overall.rank, 1);
  assert.deepEqual(model.categories.map((c: { rank: number }) => c.rank), [1, 1, 1, 1]);
  assert.equal(model.evidence[0].items[0].sourceModelName, "upstream-0");
  assert.deepEqual(model.evidence[0].items[0].components, [{ label: "Coding", display: "80.0%" }, { label: "Agentic Coding", display: "82.5%" }]);
  assert.equal(model.comparisons[0].model.slug, slugs[1]);
  assert.equal(model.comparisons[0].rows[0].mine, "81.3%");

  const sources = (await app.inject("/api/site/leaderboard/sources")).json();
  const coding = sources.groups.find((g: { key: string }) => g.key === "coding").sources.find((s: { key: string }) => s.key === "livebench-coding");
  assert.deepEqual([coding.saturated, coding.spreadPp, coding.effectiveBudget], [true, 2.5, 0.006]);
  const source = (await app.inject("/api/site/leaderboard/sources/livebench-coding")).json();
  assert.equal(source.rows.length, 30);
  assert.equal(source.rows[0].modelSlug, slugs[0]);
  assert.equal(source.syncedAt, "1999-01-03T00:00:00.000Z");
  assert.equal(source.source.attribution.includes("AIHOT"), false);
  const rules = (await app.inject("/api/site/leaderboard/rules")).json();
  assert.deepEqual(rules.anchors, [slugs[0]]);
  assert.deepEqual(rules.budgets, [{ key: "coding", name: "编程与设计", weight: 0.12, sources: ["LiveBench · 编程综合"] }]);

  const sent: unknown[] = [];
  await leaderboard.workerStarted!({ send: async (...args: unknown[]) => { sent.push(args); return null; } } as unknown as Parameters<NonNullable<typeof leaderboard.workerStarted>>[0]);
  assert.deepEqual(sent, [], "existing production runs need no first-round job");
  assert.match(llmsTxt(await loadLlmsAvailability()), /\[Model leaderboard\]\([^\n]+\/leaderboard\)/);
  const urls = (await loadDiscoveryEntries()).map((e) => e.loc);
  assert.ok(urls.includes(`/leaderboard/${slugs[0]}`));
  assert.equal(urls.includes(`/leaderboard/${slugs[30]}`), false);
  for (const group of SOURCE_GROUPS) for (const s of group.sources) assert.ok(urls.includes(`/leaderboard/sources/${s.key}`));
  const [stored] = await sql<{ summary: { sources: Array<{ saturated?: boolean }> } }[]>`SELECT summary FROM lb_runs WHERE id = ${oldRun}`;
  assert.equal(stored.summary.sources[0].saturated, undefined, "pre-v16 summaries stay unchanged");
});

test("every restored logo is served with its bytes, type and legacy cache lifetime", async () => {
  const { readdir, readFile } = await import("node:fs/promises");
  for (const dir of ["model-providers", "leaderboard-sources"]) {
    const folder = new URL(`../assets/${dir}/`, import.meta.url);
    for (const name of (await readdir(folder)).filter((name) => /\.(svg|png)$/.test(name))) {
      const response = await app.inject(`/${dir}/${name}`);
      assert.equal(response.statusCode, 200, name);
      assert.deepEqual(response.rawPayload, await readFile(new URL(name, folder)));
      assert.equal(response.headers["content-type"], name.endsWith(".svg") ? "image/svg+xml" : "image/png");
      assert.equal(response.headers["cache-control"], "public, max-age=604800");
      assert.equal((await app.inject({ url: `/${dir}/${name}`, headers: { "if-none-match": response.headers.etag } })).statusCode, 304);
    }
    for (const name of ["missing.svg", "NOTICE.md", "UPPER.svg", "bad.jpg", "%2e%2e%2fopenai.svg"]) assert.equal((await app.inject(`/${dir}/${name}`)).statusCode, 404);
  }
});

test("fetch settings feed the admin table and unchanged stale-source alerts", async () => {
  const at = "1999-01-05T00:00:00.000Z";
  await sql`INSERT INTO settings (key, value) VALUES ('leaderboard.fetch', ${sql.json({ at, sources: {
    good: { ok: true, at, lastOkAt: at, rows: 30, changed: false },
    stale: { ok: false, at, lastOkAt: "1999-01-03T00:00:00.000Z", error: "stored failure" },
    recent: { ok: false, at, lastOkAt: "1999-01-04T00:00:00.000Z" },
    never: { ok: false, at, lastOkAt: null },
  } })}) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`;
  const overview = await leaderboard.admin!.runs!() as { at: string; sources: Array<{ key: string }> };
  assert.equal(overview.at, at);
  assert.deepEqual(overview.sources.map((s) => s.key), ["never", "recent", "stale", "good"]);
  const alerts = await leaderboard.alerts!(Date.parse(at));
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].key, "leaderboard.fetch");
  assert.equal(alerts[0].level, "later");
  assert.match(alerts[0].detail!, /stale：stored failure/);
  assert.equal(alerts[0].detail!.includes("recent"), false);
});

test("built pages keep both language URLs, layout, history and the default share image", async () => {
  const web = await startWebServer(createServer(async (req, res) => {
    const response = await app.inject({ method: "GET", url: req.url!, headers: req.headers });
    res.writeHead(response.statusCode, response.headers);
    res.end(response.rawPayload);
  }), { COLLECT_ENABLED: "false", MODEL_CALLS_ENABLED: "false", FEISHU_INTERNAL_ENABLED: "false" });
  try {
    for (const path of ["/leaderboard", ...categoryKeys.map((key) => `/leaderboard/category/${key}`), "/leaderboard/sources", "/leaderboard/sources/livebench-coding", "/leaderboard/rules", `/leaderboard/${slugs[0]}`]) {
      for (const prefix of ["", "/zh"]) {
        const response = await fetch(web.origin + prefix + path);
        assert.equal(response.status, 200, prefix + path);
        const html = await response.text();
        assert.equal(html.includes("/og/pages/leaderboard.png"), false);
        assert.match(html, /\/og\/site\.png/);
        assert.ok(html.includes(`href="${prefix}/leaderboard"`), prefix + path);
        assert.equal(html.includes("${SITE.name}"), false);
        assert.equal(html.includes("AIHOT"), false);
      }
    }
    const history = await fetch(`${web.origin}/zh/leaderboard?at=1999-01-02`);
    assert.equal(history.status, 200);
    const html = await history.text();
    assert.match(html, /70\.0/);
    assert.match(html, /noindex/);
    const beforeFirst = await fetch(`${web.origin}/zh/leaderboard?at=1998-01-01`);
    assert.equal(beforeFirst.status, 200);
    assert.match(await beforeFirst.text(), /这一天还没有模型榜/);
    assert.equal((await fetch(`${web.origin}/leaderboard/category/overall`)).status, 404);
    assert.equal((await fetch(`${web.origin}/leaderboard/category/writing`, { redirect: "manual" })).status, 307);
    assert.equal((await fetch(`${web.origin}/leaderboard/methodology`, { redirect: "manual" })).status, 308);
    const tools = await fetch(`${web.origin}/zh/more`);
    assert.equal(tools.status, 200);
    const toolsHtml = await tools.text();
    assert.ok(toolsHtml.includes('href="/zh/leaderboard"'));
    assert.ok(toolsHtml.includes("模型榜"));
    assert.equal((await fetch(`${web.origin}/zh/leaderboard/category/missing`)).status, 404);
    assert.equal(web.logs().includes("TypeError"), false, web.logs());
  } finally { await web.stop(); }
});
