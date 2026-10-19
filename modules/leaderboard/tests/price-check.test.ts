// The daily official price check against local stand-ins for the vendor pages, OpenRouter and the model:
// an unchanged price is re-verified, a new one is written only when OpenRouter or a second day confirms
// it, a reading not backed by a verbatim passage is never written, and a model without a price gets one
// only when OpenRouter agrees.
import { stub, pointModels } from "../../../tests/setup.ts";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, test } from "node:test";
import { createId } from "@paralleldrive/cuid2";
import { closeDb, sql } from "@aihot/backend/db";
import { config } from "@aihot/backend/config";
import { installModules } from "@aihot/backend/modules";
import { checkPrices, priceProblems } from "../backend/price-check.ts";
import { backedPrice, decide, excerpt, pageText, routerIndex, routerMatch, type ModelReading, type Price } from "../backend/price-sources.ts";
import { invalidateLeaderboard, loadPricing } from "../backend/read.ts";
import { LEADERBOARD_PUBLIC_BOARDS } from "../taxonomy.ts";

process.env.COLLECT_ENABLED = "true";
process.env.PRICE_CHECK_MODEL = "deepseek-flash";
const { default: leaderboard } = await import("../server.ts");
installModules([leaderboard]);
config.allowPrivateNetworkFetch = true;

const reading = (r: Partial<ModelReading>): ModelReading => ({ slug: "m", found: true, currency: "USD", per: 1_000_000, input: null, output: null, cached: null, quote: null, ...r });
const usd = (input: number, output: number, cached: number | null = null): Price => ({ currency: "USD", input, output, cached });

test("page text keeps table rows readable and drops scripts", () => {
  const text = pageText("<html><head><title>x</title></head><body><script>var p = 9</script><h2>Alpha 1</h2><table><tr><th>Input</th><th>Output</th></tr><tr><td>$2.00</td><td>$10</td></tr></table></body></html>");
  assert.equal(text, "Alpha 1\nInput | Output |\n$2.00 | $10 |");
  const long = `${"filler ".repeat(5000)}Alpha 1 costs $2${" more".repeat(5000)}`;
  const part = excerpt(long, ["alpha 1"]);
  assert.ok(part.length < long.length && part.includes("Alpha 1 costs $2"));
});

test("a reading counts only with a verbatim quote that states every number", () => {
  const text = "Alpha 1 | Input 0, 75 $ per 1M | Output $3.750 | Cache 1,000 per 1K";
  assert.deepEqual(backedPrice(reading({ input: 0.75, output: 3.75, quote: "Input 0, 75 $ per 1M | Output $3.750" }), text), { price: usd(0.75, 3.75) });
  assert.deepEqual(backedPrice(reading({ per: 1000, input: 1000, output: 1000, quote: "Cache 1,000 per 1K" }), text), { price: usd(1_000_000, 1_000_000) });
  assert.deepEqual(backedPrice(reading({ input: 0.75, output: 4, quote: "Input 0, 75 $ per 1M | Output $3.750" }), text), { problem: "4 not in the quote" });
  assert.deepEqual(backedPrice(reading({ input: 0.75, output: 3.75, quote: "Input $0.75 | Output $3.75" }), text), { problem: "quote not on the page" });
  assert.deepEqual(backedPrice(reading({ input: 0.75, output: 3.75, quote: "Alpha 1 | Input 0, 75 $\n...\nOutput $3.750" }), text), { price: usd(0.75, 3.75) }, "parts left out with ...");
  assert.deepEqual(backedPrice(reading({ input: 0.75, output: 3.75, quote: "Output $3.750 … Input 0, 75 $" }), text), { problem: "quote not on the page" }, "the parts in page order");
  assert.deepEqual(backedPrice(reading({ input: 0.75, output: 3.75, quote: " ... " }), text), { problem: "quote not on the page" });
  assert.deepEqual(backedPrice(reading({ input: 1, output: 2, per: 1e9, quote: "Alpha 1" }), text), { problem: "incomplete reading" });
  assert.deepEqual(backedPrice(reading({ found: false }), text), { problem: "not found on the page" });
});

test("OpenRouter's standard listing matches a model by slug or name", () => {
  const data = [
    { id: "anthropic/claude-opus-5.5", pricing: { prompt: "0.000004", completion: "0.00002", input_cache_read: "0.0000002" } },
    { id: "anthropic/claude-opus-5.5:batch", pricing: { prompt: "0.000002", completion: "0.00001" } },
    { id: "~anthropic/claude-opus-latest", pricing: { prompt: "0.000001", completion: "0.000001" } },
    { id: "qwen/qwen3.8-max", pricing: { prompt: "0.000002", completion: "0.000006" } },
    ...Array.from({ length: 60 }, (_, i) => ({ id: `filler/m-${i}`, pricing: { prompt: "0", completion: "0" } })),
  ];
  const index = routerIndex({ data });
  assert.deepEqual(routerMatch(index, { slug: "claude-opus-5-5", name: "Claude Opus 5.5" }), { id: "anthropic/claude-opus-5.5", input: 4, output: 20, cached: 0.2 });
  assert.equal(routerMatch(index, { slug: "qwen-3-8-max-x", name: "Qwen3.8 Max" })?.id, "qwen/qwen3.8-max");
  assert.equal(routerMatch(index, { slug: "claude-opus-latest", name: "x" }), null);
  assert.throws(() => routerIndex({ data: data.slice(0, 3) }), /unexpected/);
});

test("a new price needs OpenRouter or a second day; a missing one needs OpenRouter", () => {
  const router = { id: "v/m", input: 3, output: 15.1, cached: null };
  assert.equal(decide(usd(2, 10), usd(2, 10, 0.2), null, null), "same");
  assert.equal(decide(usd(3, 15), usd(2, 10), router, null), "changed");
  assert.equal(decide(usd(3, 15), usd(2, 10), { ...router, output: 16 }, null), "held");
  assert.equal(decide(usd(3, 15), usd(2, 10), null, { outcome: "held", price: usd(3, 15) }), "changed");
  assert.equal(decide(usd(3, 15), usd(2, 10), null, { outcome: "held", price: usd(3, 14) }), "held");
  assert.equal(decide(usd(3, 15), usd(2, 10), null, { outcome: "unread", price: null }), "held");
  assert.equal(decide({ ...usd(3, 15), currency: "CNY" }, null, router, null), "held");
  assert.equal(decide(usd(3, 15), null, router, null), "added");
  assert.equal(decide(usd(3, 15), null, null, { outcome: "held", price: usd(3, 15) }), "held");
});

// The live run: eight models on the public boards; the vendor serves its main pricing page, an older
// model page (/old) that lists none of them, and OpenRouter's list.
const models = ["alpha-1", "beta-2", "gamma-3", "delta-4", "eps-5", "zeta-6", "eta-7", "theta-8"].map((slug) => ({ slug, id: createId() }));
const [alpha, beta, gamma, delta, eps, zeta, eta, theta] = models;
let pageHtml = "";
let thetaListed = false;
const vendor = createServer((req, res) => {
  if (req.url === "/models") {
    const listed = { "alpha-1": ["0.000002", "0.00001"], "beta-2": ["0.000003", "0.000015"], "eps-5": ["0.000001", "0.000002"], "zeta-6": ["0.000005", "0.000005"], "eta-7": ["0.000002", "0.000002"] };
    const data = [...Object.entries(listed).map(([slug, [prompt, completion]]) => ({ id: `vendor/${slug}`, pricing: { prompt, completion } })),
      ...Array.from({ length: 60 }, (_, i) => ({ id: `filler/m-${i}`, pricing: { prompt: "0.000001", completion: "0.000001" } }))];
    res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ data }));
  } else if (req.url === "/old") res.writeHead(200, { "content-type": "text/html" }).end("<p>Older models</p>");
  else res.writeHead(req.url === "/pricing" ? 200 : 404, { "content-type": "text/html" }).end(pageHtml);
});
await new Promise<void>((resolve) => vendor.listen(0, "127.0.0.1", () => resolve()));
const base = `http://127.0.0.1:${(vendor.address() as { port: number }).port}`;

// The model reads what the page says (nothing on /old); for delta it quotes a passage that is not on the page.
const asked: Array<{ page: string; models: string[] }> = [];
const provider = await stub((_hit, req) => {
  const user = JSON.parse(JSON.parse(req.body).messages.at(-1).content) as { page: string; models: Array<{ slug: string }> };
  asked.push({ page: user.page, models: user.models.map((m) => m.slug).sort() });
  const rows: Record<string, Partial<ModelReading>> = {
    "alpha-1": { input: 2, output: 10, cached: 0.2, quote: "Alpha 1 | $2.00 | $10.00 | $0.20" },
    "beta-2": { input: 3, output: 15, quote: "Beta 2 | $3 | $15" },
    "gamma-3": { input: 0.8, output: 4, quote: "Gamma 3 | $0.8 | $4" },
    "delta-4": { input: 12, output: 36, quote: "Delta 4 | ¥12 | ¥36" },
    "eps-5": { input: 1, output: 2, quote: "Eps 5 | $1 | $2" },
    "zeta-6": { input: 4, output: 4, quote: "Zeta 6 | $4 | $4" },
    "eta-7": { input: 2, output: 2, quote: "Eta 7 | $2 | $2" },
    ...(thetaListed ? { "theta-8": { input: 5, output: 5, quote: "Theta 8 | $5 | $5" } } : {}),
  };
  const read = (slug: string) => (user.page.endsWith("/pricing") && rows[slug] ? reading({ slug, ...rows[slug] }) : reading({ slug, found: false }));
  const content = { models: user.models.map((m) => read(m.slug)) };
  return { choices: [{ message: { content: JSON.stringify(content) } }], usage: { prompt_tokens: 100, completion_tokens: 50 } };
});
pointModels(provider.url, ["deepseek-flash"]);
after(async () => { await provider.close(); await new Promise((resolve) => vendor.close(resolve)); installModules([]); await closeDb(); });

async function fixture() {
  for (const m of models) {
    await sql`INSERT INTO lb_models (id, slug, name, provider, released_at) VALUES (${m.id}, ${m.slug}, ${m.slug.replace("-", " ")}, 'Vendor', '2026-01-01T00:00+08:00')`;
  }
  const input = (board: string) => ({ board, registry: {}, signals: [], anchors: [] });
  await sql`INSERT INTO lb_runs (id, methodology_version, generated_at, source_snapshot_ids, summary, status, origin)
    VALUES ('price-run', 'test', now(), '{}', ${sql.json({ consensus: { input: LEADERBOARD_PUBLIC_BOARDS.map(input), boards: [] } })}, 'published', 'imported')`;
  for (const [i, m] of models.entries()) {
    for (const board of LEADERBOARD_PUBLIC_BOARDS) await sql`INSERT INTO lb_rankings (run_id, board, model_id, rank, score, coverage, metric_count, detail) VALUES ('price-run', ${board}, ${m.id}, ${i + 1}, ${10 - i}, 0.8, 1, '{}')`;
  }
  await sql`INSERT INTO lb_prices (model_id, kind, currency, input, output, cached_input, source_url, verified_on) VALUES
    (${alpha.id}, 'official', 'USD', 2, 10, 0.2, ${`${base}/pricing`}, '2026-09-26'),
    (${beta.id}, 'official', 'USD', 4, 20, 0.4, ${`${base}/pricing`}, '2026-09-26'),
    (${gamma.id}, 'official', 'USD', 1, 5, null, ${`${base}/pricing`}, '2026-09-26'),
    (${delta.id}, 'official', 'CNY', 12, 36, null, ${`${base}/pricing`}, '2026-09-26'),
    (${eta.id}, 'official', 'USD', 2, 2, null, ${`${base}/old`}, '2026-09-26'),
    (${theta.id}, 'official', 'USD', 5, 5, null, ${`${base}/old`}, '2026-09-26')`;
  invalidateLeaderboard();
}

const prices = async () => Object.fromEntries((await sql<{ slug: string; p: string }[]>`
  SELECT m.slug, concat_ws(' ', p.currency, p.input::float8, p.output::float8, p.cached_input::float8, to_char(p.verified_on, 'MM-DD'), to_char(p.since, 'MM-DD')) AS p
  FROM lb_prices p JOIN lb_models m ON m.id = p.model_id WHERE p.kind = 'official' AND m.slug = ANY(${models.map((m) => m.slug)})`).map((r) => [r.slug, r.p]));
const sourceOf = async (id: string) => (await sql<{ url: string }[]>`SELECT source_url AS url FROM lb_prices WHERE model_id = ${id}`)[0]!.url;
const unlisted = async () => (await sql<{ slug: string; on: string }[]>`
  SELECT m.slug, to_char(p.unlisted_on, 'MM-DD') AS on FROM lb_prices p JOIN lb_models m ON m.id = p.model_id WHERE p.unlisted_on IS NOT NULL`).map((r) => `${r.slug} ${r.on}`);
const checks = async (day: string) => Object.fromEntries((await sql<{ slug: string; outcome: string }[]>`
  SELECT m.slug, c.outcome FROM lb_price_checks c JOIN lb_models m ON m.id = c.model_id WHERE c.checked_on = ${day}`).map((r) => [r.slug, r.outcome]));

test("the daily check re-verifies, writes confirmed changes and new prices, and holds the rest", async () => {
  await fixture();
  const table = (rows: string[]) => `<table>${rows.map((row) => `<tr>${row.split(" | ").map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("")}</table>`;
  const listedRows = ["Alpha 1 | $2.00 | $10.00 | $0.20", "Beta 2 | $3 | $15", "Gamma 3 | $0.8 | $4", "Eps 5 | $1 | $2", "Zeta 6 | $4 | $4", "Eta 7 | $2 | $2"];
  pageHtml = table(listedRows);
  const options = { routerUrl: `${base}/models`, pages: { vendor: `${base}/pricing` } };

  config.modelCallsEnabled = false;
  assert.deepEqual(await checkPrices({ ...options, today: "2026-10-01" }), { skipped: "model calls disabled (MODEL_CALLS_ENABLED)" });
  config.modelCallsEnabled = true;

  const day1 = await checkPrices({ ...options, today: "2026-10-01" });
  assert.deepEqual(day1, { pages: 3, router: true, outcomes: { same: 2, changed: 1, added: 1, held: 2, unread: 2 }, unmatched: 0 });
  assert.deepEqual(asked, [
    { page: `${base}/pricing`, models: ["alpha-1", "beta-2", "delta-4", "eps-5", "gamma-3", "zeta-6"] },
    { page: `${base}/old`, models: ["eta-7", "theta-8"] },
    { page: `${base}/pricing`, models: ["eta-7", "theta-8"] },
  ], "one call per page; the models /old does not list are looked for on the vendor's page (eta by OpenRouter's id, theta by host)");
  assert.deepEqual(await checks("2026-10-01"), { "alpha-1": "same", "beta-2": "changed", "gamma-3": "held", "delta-4": "unread", "eps-5": "added", "zeta-6": "held", "eta-7": "same", "theta-8": "unread" });
  assert.equal(await sourceOf(eta.id), `${base}/pricing`, "found on the vendor's page, which becomes its source");
  assert.equal(await sourceOf(theta.id), `${base}/old`);
  assert.deepEqual(await prices(), {
    "alpha-1": "USD 2 10 0.2 10-01 09-26",
    "beta-2": "USD 3 15 10-01 10-01",
    "gamma-3": "USD 1 5 09-26",
    "delta-4": "CNY 12 36 09-26",
    "eps-5": "USD 1 2 10-01 10-01",
    "eta-7": "USD 2 2 10-01 09-26",
    "theta-8": "USD 5 5 09-26",
  });
  const [betaCheck] = await sql<{ previous: unknown; openrouter: unknown; quote: string }[]>`SELECT previous, openrouter, quote FROM lb_price_checks WHERE model_id = ${beta.id}`;
  assert.deepEqual(betaCheck, { previous: usd(4, 20, 0.4), openrouter: { id: "vendor/beta-2", input: 3, output: 15, cached: null }, quote: "Beta 2 | $3 | $15" });
  assert.deepEqual((await priceProblems("2026-10-01")).map((p) => [p.slug, p.outcome, p.note]), [
    ["gamma-3", "held", "differs from the current price; not confirmed by OpenRouter or a previous day"],
    ["zeta-6", "held", "OpenRouter lists a different price"],
    ["delta-4", "unread", "quote not on the page"],
    ["theta-8", "unread", "not found on the page"],
  ]);
  const findings = await leaderboard.alerts!(Date.parse("2026-10-01T12:00:00+08:00"));
  assert.equal(findings[0]?.key, "leaderboard.prices");
  assert.match(findings[0]!.title, /4 个/);

  // The second day reads gamma's new price again: confirmed. A missing price is never confirmed by days.
  const day2 = await checkPrices({ ...options, today: "2026-10-02" });
  assert.deepEqual((day2 as { outcomes: unknown }).outcomes, { same: 4, changed: 1, added: 0, held: 1, unread: 2 });
  assert.deepEqual(await checks("2026-10-02"), { "alpha-1": "same", "beta-2": "same", "gamma-3": "changed", "delta-4": "unread", "eps-5": "same", "zeta-6": "held", "eta-7": "same", "theta-8": "unread" });
  assert.equal((await prices())["gamma-3"], "USD 0.8 4 10-02 10-02");

  // A second run the same day keeps the change on record (the indices read it as history).
  await checkPrices({ ...options, today: "2026-10-02" });
  assert.equal((await checks("2026-10-02"))["gamma-3"], "changed");
  assert.equal((await priceProblems("2026-10-05")).length, 0, "problems older than a day are not reported");

  // A failing page leaves every price as it was and records why; it does not count towards "no longer
  // listed", but theta's own page has not listed it for a third day: marked, and left out of the alert.
  pageHtml = "";
  const day3 = await checkPrices({ routerUrl: `${base}/missing`, pages: options.pages, today: "2026-10-03" });
  assert.deepEqual(day3, { pages: 3, router: false, outcomes: { same: 0, changed: 0, added: 0, held: 0, unread: 7 }, unmatched: 1 });
  assert.equal((await prices())["alpha-1"], "USD 2 10 0.2 10-02 09-26");
  assert.deepEqual(await unlisted(), ["theta-8 10-03"]);
  assert.ok(!(await priceProblems("2026-10-03")).some((p) => p.slug === "theta-8"));
  invalidateLeaderboard();
  const rows = new Map((await loadPricing("en")).rows.map((r) => [r.model.slug, r.price]));
  assert.equal(rows.get("theta-8")?.unlistedOn, "2026-10-03");
  assert.ok(!("unlistedOn" in rows.get("alpha-1")!), "only marked prices carry the field");

  // Found again on the vendor's page: the mark clears and the page becomes its source.
  thetaListed = true;
  pageHtml = table([...listedRows, "Theta 8 | $5 | $5"]);
  await checkPrices({ ...options, today: "2026-10-04" });
  assert.equal((await checks("2026-10-04"))["theta-8"], "same");
  assert.deepEqual(await unlisted(), []);
  assert.equal(await sourceOf(theta.id), `${base}/pricing`);
});
