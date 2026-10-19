import "../../../tests/setup.ts";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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
import chineseResponses from "./fixtures/leaderboard-zh.json" with { type: "json" };
import { REASONS } from "../backend/fetch/configuration.ts";
import { BUDGETS } from "../backend/method/v16.ts";

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
  // Timestamps carry the site's offset, so the baselines below hold whatever the server's TimeZone is.
  for (const [i, id] of ids.entries()) {
    await sql`INSERT INTO lb_models (id, slug, name, provider, provider_slug, released_at, context_window_tokens)
      VALUES (${id}, ${slugs[i]}, ${`Stored model ${i}`}, 'OpenAI', 'openai', '1999-01-01T00:00+08:00', 128000)`;
  }
  await sql`INSERT INTO lb_snapshots (id, source_key, source_name, fetched_at, published_at, record_count, metadata)
    VALUES (${snapshot}, 'livebench-coding', 'LiveBench coding', '1999-01-02T00:00+08:00', '1999-01-01T00:00+08:00', 31, ${sql.json({ lastSeenAt: "1999-01-03T00:00:00.000Z" })})`;
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

// These fields contain proper nouns from lb_models or the upstream model name stored in lb_scores.
const PROPER_NOUN_FIELDS = new Set([
  "entries[].model.name", "entries[].model.provider", "entries[].model.brand.monogram",
  "model.name", "model.provider", "model.brand.monogram",
  "comparisons[].model.name", "comparisons[].model.provider", "comparisons[].model.brand.monogram",
  "evidence[].items[].sourceModelName", "rows[].sourceModelName", "rows[].provider",
]);

function assertEnglish(value: unknown, path = "") {
  if (typeof value === "string") {
    if (!PROPER_NOUN_FIELDS.has(path.replace(/\[\d+\]/g, "[]"))) assert.doesNotMatch(value, /[㐀-鿿＀-￯]/, path);
  } else if (Array.isArray(value)) {
    value.forEach((entry, i) => assertEnglish(entry, `${path}[${i}]`));
  } else if (value && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) assertEnglish(entry, path ? `${path}.${key}` : key);
  }
}

function withoutText(value: unknown): unknown {
  if (typeof value === "string") return "";
  if (Array.isArray(value)) return value.map(withoutText);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, withoutText(entry)]));
  return value;
}

test("all API editions keep Chinese bytes and isolate English text and validators", async () => {
  for (const [path, hash] of Object.entries(chineseResponses)) {
    const url = `/api/site/leaderboard${path}`;
    const en = await app.inject(`${url}?lang=en`);
    const zh = await app.inject(`${url}?lang=zh`);
    const original = await app.inject(url);
    assert.equal(en.statusCode, 200, path);
    assert.equal(zh.statusCode, 200, path);
    assert.equal(original.body, zh.body, `${path}: default remains Chinese`);
    assert.equal(createHash("sha256").update(zh.body.replaceAll(liveRun, "live-run")).digest("hex"), hash, `${path}: bytes captured before localization changed`);
    assertEnglish(en.json());
    assert.deepEqual(withoutText(en.json()), withoutText(zh.json()), `${path}: only text changes`);
    assert.equal(en.headers["cache-control"], zh.headers["cache-control"], path);
    assert.notEqual(en.headers.etag, zh.headers.etag, path);
    assert.equal((await app.inject({ url: `${url}?lang=en`, headers: { "if-none-match": en.headers.etag } })).statusCode, 304, path);
    assert.equal((await app.inject({ url: `${url}?lang=zh`, headers: { "if-none-match": en.headers.etag } })).statusCode, 200, path);
    assert.equal((await app.inject({ url: `${url}?lang=en`, headers: { "if-none-match": zh.headers.etag } })).statusCode, 200, path);
  }
  for (const path of ["/boards/overall", `/models/${slugs[0]}`, "/sources", "/sources/livebench-coding", "/rules"]) {
    for (const query of ["lang=fr", "lang=en&lang=zh", "lang=en&lang=en"]) {
      assert.equal((await app.inject(`/api/site/leaderboard${path}?${query}`)).statusCode, 400, `${path}?${query}`);
    }
  }
  const past = await app.inject("/api/site/leaderboard/boards/overall?lang=en&at=1999-01-02");
  assertEnglish(past.json());
  assert.equal(past.json().run.id, oldRun);
  assert.equal(past.json().entries[0].score, 70);
  assert.equal((await app.inject("/api/site/leaderboard/boards/overall?lang=zh")).json().run.fx.sourceName, "欧洲央行", "English historical reads do not mutate the shared run cache");
});

test("stored prose translates on reads while model names and persisted rows stay unchanged", async () => {
  const [run] = await sql<{ summary: any }[]>`SELECT summary FROM lb_runs WHERE id = ${liveRun}`;
  try {
    await sql`UPDATE lb_models SET name = '存储模型', provider = '模型机构' WHERE id = ${ids[0]}`;
    await sql`UPDATE lb_scores SET configuration_label = 'High 推理 · 自适应 · 64k · Codex 1.2', selection_reason = ${REASONS.firstParty}, source_model_name = '上游模型' WHERE snapshot_id = ${snapshot} AND model_id = ${ids[0]}`;
    await sql`UPDATE lb_runs SET summary = ${sql.json({ ...run.summary, budgets: BUDGETS })} WHERE id = ${liveRun}`;
    invalidateLeaderboard();
    const model = (await app.inject(`/api/site/leaderboard/models/${slugs[0]}?lang=en`)).json();
    assertEnglish(model);
    assert.deepEqual([model.model.name, model.model.provider, model.evidence[0].items[0].sourceModelName], ["存储模型", "模型机构", "上游模型"]);
    assert.equal(model.evidence[0].items[0].configurationLabel, "High reasoning · Adaptive · 64k · Codex 1.2");
    const zh = (await app.inject(`/api/site/leaderboard/models/${slugs[0]}?lang=zh`)).json();
    assert.equal(zh.evidence[0].items[0].configurationLabel, "High 推理 · 自适应 · 64k · Codex 1.2");
    assert.equal(zh.evidence[0].items[0].selectionReason, REASONS.firstParty);
    const source = (await app.inject("/api/site/leaderboard/sources/livebench-coding?lang=en")).json();
    assertEnglish(source);
    assert.deepEqual([source.rows[0].sourceModelName, source.rows[0].provider], ["上游模型", "模型机构"]);
    assertEnglish((await app.inject("/api/site/leaderboard/rules?lang=en")).json());
    const [score] = await sql<{ configuration_label: string; selection_reason: string }[]>`SELECT configuration_label, selection_reason FROM lb_scores WHERE snapshot_id = ${snapshot} AND model_id = ${ids[0]}`;
    assert.deepEqual(score, { configuration_label: "High 推理 · 自适应 · 64k · Codex 1.2", selection_reason: REASONS.firstParty });
    const [stored] = await sql<{ summary: any }[]>`SELECT summary FROM lb_runs WHERE id = ${liveRun}`;
    assert.equal(stored.summary.fxQuote.sourceName, "欧洲央行");
    assert.equal(stored.summary.budgets[0].name, "综合评测");
  } finally {
    await sql`UPDATE lb_models SET name = 'Stored model 0', provider = 'OpenAI' WHERE id = ${ids[0]}`;
    await sql`UPDATE lb_scores SET configuration_label = '来源默认配置', selection_reason = NULL, source_model_name = 'upstream-0' WHERE snapshot_id = ${snapshot} AND model_id = ${ids[0]}`;
    await sql`UPDATE lb_runs SET summary = ${sql.json(run.summary)} WHERE id = ${liveRun}`;
    invalidateLeaderboard();
  }
});

// Extra official prices for the pricing tests, removed again so the other responses keep their bytes.
async function withPricedModels(fn: () => Promise<void>) {
  await sql`INSERT INTO lb_prices (model_id, kind, currency, input, output, cached_input, source_url, verified_on) VALUES
    (${ids[1]}, 'official', 'CNY', 8, 16, null, 'https://example.org/cny', '1999-01-05'),
    (${ids[30]}, 'official', 'USD', 1, 20, 0.1, 'https://example.org/unranked', '1999-01-01'),
    (${ids[2]}, 'official', 'USD', null, 1, null, null, null)`;
  invalidateLeaderboard();
  try {
    await fn();
  } finally {
    await sql`DELETE FROM lb_prices WHERE kind = 'official' AND model_id = ANY(${[ids[1], ids[30], ids[2]]})`;
    invalidateLeaderboard();
  }
}

test("pricing lists every priced model in USD, cheapest input first, with page and rank", async () => {
  await withPricedModels(async () => {
    const response = await app.inject("/api/site/leaderboard/pricing?lang=en");
    assert.equal(response.statusCode, 200);
    assert.equal(response.headers["cache-control"], "public, max-age=120, s-maxage=300, stale-while-revalidate=600");
    const body = response.json();
    assert.deepEqual(Object.keys(body).sort(), ["featured", "rows", "run", "verifiedOn"]);
    assert.deepEqual(body.featured, [slugs[0], slugs[1]], "ranked models with USD prices, best rank first");
    assert.equal(body.run.id, liveRun);
    assert.equal(body.run.fx.sourceName, "European Central Bank");
    assert.equal(body.verifiedOn, "1999-01-05");
    assert.deepEqual(body.rows.map((r: { model: { slug: string } }) => r.model.slug), [slugs[1], slugs[30], slugs[0], slugs[2]]);
    const [cny, unranked, usd, unpriced] = body.rows;
    assert.deepEqual(cny.usd, { input: 1, output: 2, cached: null }, "CNY converts at the run's rate of 8");
    assert.deepEqual([cny.price.currency, cny.price.input, cny.price.inputCny], ["CNY", 8, 8]);
    assert.deepEqual([cny.rank, cny.hasPage], [2, true]);
    assert.deepEqual([unranked.rank, unranked.hasPage, unranked.usd.output], [null, false, 20]);
    assert.deepEqual([usd.rank, usd.hasPage, usd.usd], [1, true, { input: 2, output: 10, cached: 0.2 }]);
    assert.deepEqual(unpriced.usd, { input: null, output: 1, cached: null });
    assert.equal(cny.model.brand.src, "/model-providers/openai.svg");
    const zh = await app.inject("/api/site/leaderboard/pricing?lang=zh");
    assert.equal(zh.json().run.fx.sourceName, "欧洲央行");
    assert.equal((await app.inject("/api/site/leaderboard/pricing")).body, zh.body, "default remains Chinese");
    assert.notEqual(zh.headers.etag, response.headers.etag);
    assert.equal((await app.inject({ url: "/api/site/leaderboard/pricing?lang=en", headers: { "if-none-match": response.headers.etag } })).statusCode, 304);
    for (const query of ["lang=fr", "lang=en&lang=zh"]) assert.equal((await app.inject(`/api/site/leaderboard/pricing?${query}`)).statusCode, 400, query);
  });
  assert.deepEqual((await app.inject("/api/site/leaderboard/pricing")).json().rows.map((r: { model: { slug: string } }) => r.model.slug), [slugs[0]]);
});

test("two priced models compare under one address; only the featured pairs are listed", async () => {
  await withPricedModels(async () => {
    const pair = `${slugs[0]}-vs-${slugs[1]}`;
    const response = await app.inject(`/api/site/leaderboard/pricing/compare/${pair}?lang=en`);
    assert.equal(response.statusCode, 200);
    assert.equal(response.headers["cache-control"], "public, max-age=120, s-maxage=300, stale-while-revalidate=600");
    const body = response.json();
    assert.deepEqual([body.pair, body.featured], [pair, true]);
    const [a, b] = body.sides;
    assert.deepEqual([a.row.model.slug, b.row.model.slug], [slugs[0], slugs[1]]);
    assert.deepEqual([a.row.usd, b.row.usd], [{ input: 2, output: 10, cached: 0.2 }, { input: 1, output: 2, cached: null }]);
    assert.deepEqual(a.boards.map((x: { key: string; rank: number | null }) => [x.key, x.rank]).slice(0, 1), [["overall", 1]]);
    assert.ok(a.boards.every((x: { name: string; href: string }) => x.name && x.href.startsWith("/leaderboard")));
    assert.deepEqual(a.related.map((r: { pair: string }) => r.pair), [pair], "its other featured pairs");
    assert.equal((await app.inject(`/api/site/leaderboard/pricing/compare/${slugs[1]}-vs-${slugs[0]}`)).json().pair, pair, "either order names the same pair");
    const unfeatured = (await app.inject(`/api/site/leaderboard/pricing/compare/${slugs[0]}-vs-${slugs[30]}`)).json();
    assert.deepEqual([unfeatured.featured, unfeatured.sides[1].related], [false, []]);
    for (const missing of [`${slugs[0]}-vs-${slugs[2]}`, `${slugs[0]}-vs-${slugs[0]}`, `${slugs[0]}-vs-nope`, slugs[0]]) {
      assert.equal((await app.inject(`/api/site/leaderboard/pricing/compare/${missing}`)).statusCode, 404, missing);
    }
    const urls = (await loadDiscoveryEntries()).map((e) => e.loc);
    assert.deepEqual(urls.filter((u) => u.includes("/pricing/compare/")), [`/pricing/compare/${pair}`, `/zh/pricing/compare/${pair}`]);
  });
});

test("a story page names the leaderboard models its story mentions", async () => {
  const { storyModels } = await import("../backend/mentions.ts");
  await withPricedModels(async () => {
    const [story] = await sql<{ id: number }[]>`INSERT INTO stories (public_id, title, digest) VALUES (gen_random_uuid(), 'Stored model 1 beats Stored model 0', 'Also Stored model 30, which has no page.') RETURNING id`;
    const [quiet] = await sql<{ id: number }[]>`INSERT INTO stories (public_id, title) VALUES (gen_random_uuid(), 'Nothing about models') RETURNING id`;
    try {
      const part = await storyModels(story!.id);
      assert.deepEqual(part!.models.map((m) => [m.model.slug, m.rank, m.usd?.input]), [[slugs[1], 2, 1], [slugs[0], 1, 2]], "by first mention; only models with a page");
      assert.equal(part!.compare, `${slugs[0]}-vs-${slugs[1]}`);
      assert.equal(await storyModels(quiet!.id), null);
    } finally {
      await sql`DELETE FROM stories WHERE id = ANY(${[story!.id, quiet!.id]})`;
    }
  });
});

test("pricing is discoverable and the retired Pages addresses redirect", async () => {
  const { followsTime } = await import(new URL("../../../apps/web/app/features/chrono/at.ts", import.meta.url).href);
  const { localePath } = await import(new URL("../../../apps/web/app/lib/locale.ts", import.meta.url).href);
  const urls = (await loadDiscoveryEntries()).map((e) => e.loc);
  for (const loc of ["/pricing", "/zh/pricing"]) assert.equal(urls.filter((u) => u === loc).length, 1, loc);
  assert.match(llmsTxt(await loadLlmsAvailability()), /\[LLM API pricing\]\([^\n]+\/pricing\)/);
  assert.equal(followsTime("/pricing"), false);
  assert.equal(localePath("/pricing#calculator", "zh"), "/zh/pricing#calculator");
  assert.deepEqual(resolveRedirect("/calculator", "?x=1"), { status: 301, location: "/pricing#calculator", headers: {} });
  assert.deepEqual(resolveRedirect("/zh/calculator", ""), { status: 301, location: "/zh/pricing#calculator", headers: {} });
  assert.deepEqual(resolveRedirect("/benchmark", ""), { status: 301, location: "/leaderboard/category/coding", headers: {} });
  assert.equal(resolveRedirect("/pricing", ""), null);
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
    for (const path of ["/leaderboard", ...categoryKeys.map((key) => `/leaderboard/category/${key}`), "/leaderboard/sources", "/leaderboard/sources/livebench-coding", "/leaderboard/rules", `/leaderboard/${slugs[0]}`, "/pricing"]) {
      for (const prefix of ["", "/zh"]) {
        const response = await fetch(web.origin + prefix + path);
        assert.equal(response.status, 200, prefix + path);
        const html = await response.text();
        assert.equal(html.includes("/og/pages/leaderboard.png"), false);
        assert.match(html, /\/og\/site\.png/);
        assert.ok(html.includes(`href="${prefix}/leaderboard"`), prefix + path);
        assert.equal(html.includes("${SITE.name}"), false);
        assert.equal(html.includes("AIHOT"), false);
        assert.equal(response.headers.get("cache-control"), `public, max-age=300, s-maxage=${path === "/leaderboard/sources" || path.startsWith("/leaderboard/sources/") ? 300 : 600}, must-revalidate`);
        assert.match(response.headers.get("x-accel-expires")!, /^@\d+$/);
        assert.doesNotMatch(response.headers.get("vary") ?? "", /(?:Cookie|Accept-Language)/i);
        assert.ok(html.includes(`rel="canonical" href="${web.origin}${prefix}${path}"`), prefix + path);
        assert.ok(html.includes(`hrefLang="en" href="${web.origin}${path}"`), prefix + path);
        assert.ok(html.includes(`hrefLang="zh-CN" href="${web.origin}/zh${path}"`), prefix + path);
        assert.match(html, prefix ? /property="og:locale" content="zh_CN"/ : /property="og:locale" content="en"/);
        if (!prefix) {
          const remaining = [...new Set(html.replaceAll("中文", "").match(/[㐀-鿿＀-￯]+/g) ?? [])];
          assert.deepEqual(remaining, [], `${path}: English HTML has untranslated text`);
          assert.match(html, /property="og:title" content="[^"㐀-鿿＀-￯]+"/);
          assert.match(html, /name="twitter:title" content="[^"㐀-鿿＀-￯]+"/);
        }
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

    await withPricedModels(async () => {
      for (const prefix of ["", "/zh"]) {
        const response = await fetch(`${web.origin}${prefix}/pricing`);
        assert.equal(response.status, 200, prefix);
        const html = await response.text();
        const title = prefix ? "大模型 API 价格对比 2026：全部模型" : "LLM API Pricing Comparison 2026 — All Models";
        assert.ok(html.includes(`<title>${title}</title>`), prefix);
        assert.match(html, prefix ? /对比 4 个大模型[^"]+1999-01-05/ : /name="description" content="Compare API prices for 4 LLMs[^"]+OpenRouter[^"]+1999-01-05/);
        for (const i of [0, 1, 2, 30]) assert.ok(html.includes(`>Stored model ${i}<`), `${prefix} row ${i}`);
        assert.ok(html.includes(`href="${prefix}/leaderboard/${slugs[1]}"`), "a model with a page links to it");
        assert.equal(html.includes(`/leaderboard/${slugs[30]}"`), false, "a model without a page is not linked");
        assert.ok(html.includes("https://example.org/cny"));
        assert.ok(html.includes(prefix ? "标价 ¥8" : "List ¥8"), "CNY rows keep their list price");
        assert.ok(html.includes('id="calculator"'), prefix);
        const calculator = html.slice(html.indexOf('id="calculator"'));
        // Default preset, 1K in / 500 out, 1,000 requests: cheapest first, server-rendered.
        const order = [1, 0, 30, 2].map((i) => calculator.indexOf(`>Stored model ${i}<`));
        assert.ok(order.every((at, k) => at > 0 && (k === 0 || at > order[k - 1]!)), `${prefix} calculator rows are cheapest first: ${order}`);
        for (const cost of ["$0.002", "$2", "$0.007", "$7", "$0.011", "$11"]) assert.ok(calculator.includes(`>${cost}<`), `${prefix} ${cost}`);
        const ld = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].flatMap((m) => [JSON.parse(m[1]!)].flat());
        const dataset = ld.find((x: { "@type"?: string }) => x["@type"] === "Dataset");
        assert.ok(dataset, prefix);
        for (const field of ["name", "description", "url", "dateModified"]) assert.ok(typeof dataset[field] === "string" && dataset[field].length > 0, `${prefix} Dataset.${field}`);
        assert.equal(dataset.name, title);
        assert.equal(dataset.url, `${web.origin}${prefix}/pricing`);
        assert.equal(dataset.dateModified, "1999-01-05");
        assert.equal(dataset.isAccessibleForFree, true);
        assert.equal(dataset.creator["@type"], "Organization");
        for (const field of ["name", "url"]) assert.ok(typeof dataset.creator[field] === "string" && dataset.creator[field].length > 0, `${prefix} creator.${field}`);
        const crumbs = ld.find((x: { "@type"?: string }) => x["@type"] === "BreadcrumbList");
        assert.deepEqual(crumbs.itemListElement.map((c: { item: string }) => c.item), [`${web.origin}${prefix}/leaderboard`, `${web.origin}${prefix}/pricing`]);
        for (const c of crumbs.itemListElement) assert.ok(c.name.length > 0);
        const pair = `${slugs[0]}-vs-${slugs[1]}`;
        assert.ok(html.includes(`href="${prefix}/pricing/compare/${pair}"`), `${prefix} the pricing page links its popular comparisons`);

        const reversed = await fetch(`${web.origin}${prefix}/pricing/compare/${slugs[1]}-vs-${slugs[0]}`, { redirect: "manual" });
        assert.deepEqual([reversed.status, reversed.headers.get("location")], [301, `${prefix}/pricing/compare/${pair}`], prefix);
        const compare = await fetch(`${web.origin}${prefix}/pricing/compare/${pair}`);
        assert.equal(compare.status, 200, prefix);
        const page = await compare.text();
        const compareTitle = prefix ? "Stored model 0 与 Stored model 1 API 价格对比 2026：每次调用成本" : "Stored model 0 vs Stored model 1 API Pricing 2026: Cost per Request Compared";
        assert.ok(page.includes(`<title>${compareTitle}</title>`), prefix);
        assert.equal(page.includes('name="robots"'), false, `${prefix} a featured pair is indexable`);
        assert.ok(page.includes(`rel="canonical" href="${web.origin}${prefix}/pricing/compare/${pair}"`), prefix);
        // Chat message, 1K in / 500 out: model 0 at $2/$10 costs $0.007, model 1 at $1/$2 costs $0.002.
        assert.ok(page.includes(prefix ? "Stored model 1 每次 $0.002，Stored model 0 每次 $0.007，前者便宜约 3.5 倍" : "Stored model 1 costs $0.002 per request and Stored model 0 costs $0.007: about 3.5× cheaper"), prefix);
        assert.ok(page.includes(prefix ? "Stored model 1 便宜 3.5 倍" : "Stored model 1 is 3.5× cheaper"), prefix);
        assert.ok(page.includes(prefix ? "标价 ¥8" : "List ¥8"), `${prefix} the CNY side keeps its list price`);
        assert.ok(page.includes(`href="${prefix}/leaderboard/${slugs[0]}"`) && page.includes(`href="${prefix}/pricing#calculator"`), prefix);
        const compareLd = [...page.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].flatMap((m) => [JSON.parse(m[1]!)].flat());
        const compareCrumbs = compareLd.find((x: { "@type"?: string }) => x["@type"] === "BreadcrumbList");
        assert.deepEqual(compareCrumbs.itemListElement.map((c: { item: string }) => c.item), [`${web.origin}${prefix}/leaderboard`, `${web.origin}${prefix}/pricing`, `${web.origin}${prefix}/pricing/compare/${pair}`]);
        for (const c of compareCrumbs.itemListElement) assert.ok(c.name.length > 0);
        const unfeatured = await (await fetch(`${web.origin}${prefix}/pricing/compare/${slugs[0]}-vs-${slugs[30]}`)).text();
        assert.ok(unfeatured.includes('name="robots" content="noindex, follow"'), `${prefix} other pairs are not indexed`);
        assert.equal((await fetch(`${web.origin}${prefix}/pricing/compare/${slugs[0]}-vs-nope`)).status, 404, prefix);
      }
    });

    for (const [path, location] of [["/calculator", "/pricing#calculator"], ["/zh/calculator", "/zh/pricing#calculator"], ["/benchmark", "/leaderboard/category/coding"]]) {
      const response = await fetch(web.origin + path, { redirect: "manual" });
      assert.deepEqual([response.status, response.headers.get("location")], [301, location], path);
    }
    // Retired Pages leaf URLs: give two models the mapped slugs, one with a page (rank 1) and one without (rank 31).
    try {
      await sql`UPDATE lb_models SET slug = 'kimi-k-3' WHERE id = ${ids[0]}`;
      await sql`UPDATE lb_models SET slug = 'grok-4-6' WHERE id = ${ids[30]}`;
      invalidateLeaderboard();
      for (const prefix of ["", "/zh"]) {
        for (const [legacy, location] of [["kimi-k3", "/leaderboard/kimi-k-3"], ["grok-4-6", "/pricing"], ["gemini-2-5-flash", "/pricing"], ["gpt-5-5", "/pricing"]]) {
          const response = await fetch(`${web.origin}${prefix}/pricing/${legacy}`, { redirect: "manual" });
          assert.deepEqual([response.status, response.headers.get("location")], [301, prefix + location], prefix + legacy);
        }
        assert.equal((await fetch(`${web.origin}${prefix}/pricing/not-a-model`, { redirect: "manual" })).status, 404, prefix);
      }
    } finally {
      await sql`UPDATE lb_models SET slug = ${slugs[0]} WHERE id = ${ids[0]}`;
      await sql`UPDATE lb_models SET slug = ${slugs[30]} WHERE id = ${ids[30]}`;
      invalidateLeaderboard();
    }
    assert.equal(web.logs().includes("TypeError"), false, web.logs());
  } finally { await web.stop(); }
});
