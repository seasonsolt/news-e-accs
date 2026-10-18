// The daily official price check. For the models of the latest published run, read each vendor pricing
// page once (a model reads the listed models' prices, each backed by a verbatim passage), compare with
// lb_prices and with OpenRouter's public list, and write by the rule in price-sources.ts `decide`. Models
// on the public boards without a price get one from their vendor's page when OpenRouter agrees. Every
// reading is kept in lb_price_checks; held and unread prices are reported by the module's alert.
import { sql } from "@aihot/backend/db";
import { config } from "@aihot/backend/config";
import { modelFor } from "@aihot/backend/editorial/models";
import { promptText, promptVersion } from "@aihot/backend/editorial/prompts";
import { guardedFetch } from "@aihot/backend/lib/http-fetch";
import { chatJson } from "@aihot/backend/providers/llm";
import { completeReceipt } from "@aihot/backend/providers/receipts";
import { beijingDate } from "@aihot/contracts/time";
import { runView } from "./read.ts";
import {
  PROVIDER_PAGES, PageReading, backedPrice, decide, excerpt, pageText, routerIndex, routerMatch,
  type ModelReading, type Price, type RouterPrice,
} from "./price-sources.ts";

export const OPENROUTER_MODELS = "https://openrouter.ai/api/v1/models";

interface Target {
  id: string;
  slug: string;
  name: string;
  current: Price | null;
  router: RouterPrice | null;
}

type Outcome = "same" | "changed" | "added" | "held" | "unread";
export type PriceCheckResult = { skipped: string } | { pages: number; router: boolean; outcomes: Record<Outcome, number>; unmatched: number };

async function fetchPage(url: string): Promise<string> {
  // Pages that follow the visitor's location (Google's) answer in English.
  const res = await guardedFetch(url, { timeoutMs: 30_000, maxBytes: 8 * 1024 * 1024, headers: { "accept-language": "en-US,en;q=0.9" } });
  if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

async function readRouter(url: string): Promise<Map<string, RouterPrice> | null> {
  try {
    const res = await guardedFetch(url, { timeoutMs: 30_000, maxBytes: 16 * 1024 * 1024 });
    if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
    return routerIndex(JSON.parse(res.text()));
  } catch (e) {
    console.warn(`[leaderboard.prices] openrouter: ${(e as Error).message}`);
    return null;
  }
}

/**
 * The models to read, by pricing page: the latest run's priced models at their own source, and the
 * public boards' models without a price at their vendor's page. Prices are read fresh, not from the
 * cached run view.
 */
async function targets(router: Map<string, RouterPrice> | null, pages: Record<string, string>): Promise<{ byPage: Map<string, Target[]>; unmatched: number }> {
  const view = await runView();
  const rows = await sql<{ model_id: string; currency: Price["currency"]; input: number | null; output: number | null; cached: number | null; url: string | null }[]>`
    SELECT model_id, currency, input, output, cached_input AS cached, source_url AS url FROM lb_prices
    WHERE kind = 'official' AND model_id = ANY(${[...view.modelsById.keys()]})`;
  const priced = new Map(rows.map((r) => [r.model_id, r]));
  const byPage = new Map<string, Target[]>();
  const add = (url: string, t: Target) => byPage.set(url, [...(byPage.get(url) ?? []), t]);
  let unmatched = 0;
  for (const [id, m] of view.modelsById) {
    const p = priced.get(id);
    if (p) {
      if (p.url && p.input !== null && p.output !== null) {
        add(p.url, { id, slug: m.slug, name: m.name, current: { currency: p.currency, input: p.input, output: p.output, cached: p.cached }, router: router ? routerMatch(router, m) : null });
      }
      continue;
    }
    if (!view.pageSlugs.has(m.slug)) continue;
    const match = router ? routerMatch(router, m) : null;
    const page = match ? pages[match.id.slice(0, match.id.indexOf("/"))] : undefined;
    if (!match || !page) unmatched++;
    else add(page, { id, slug: m.slug, name: m.name, current: null, router: match });
  }
  return { byPage, unmatched };
}

async function readPage(url: string, models: Target[], today: string): Promise<{ text: string; readings: Map<string, ModelReading>; receiptId: number }> {
  const text = pageText(await fetchPage(url));
  if (!text) throw new Error("no text on the page");
  const names = models.flatMap((m) => [m.name, m.slug, ...(m.router ? [m.router.id.slice(m.router.id.indexOf("/") + 1)] : [])]);
  const response = await chatJson({
    model: await modelFor("priceCheck"), purpose: "price_check", subject: `price-page:${url}`, attemptTag: today,
    promptVersion: promptVersion("price-extract"), system: promptText("price-extract", { today }),
    user: JSON.stringify({ page: url, models: models.map((m) => ({ slug: m.slug, name: m.name })), text: excerpt(text, names) }),
    schema: PageReading, temperature: 0, maxTokens: 400 + 400 * models.length,
  });
  return { text, readings: new Map(response.data.models.map((r) => [r.slug, r])), receiptId: response.receiptId };
}

const priceJson = (p: Price | null) => (p ? sql.json({ ...p } as never) : null);

export async function checkPrices(opts: { today?: string; routerUrl?: string; pages?: Record<string, string> } = {}): Promise<PriceCheckResult> {
  if (!config.modelCallsEnabled) return { skipped: "model calls disabled (MODEL_CALLS_ENABLED)" };
  const today = opts.today ?? beijingDate(new Date());
  const router = await readRouter(opts.routerUrl ?? OPENROUTER_MODELS);
  const { byPage, unmatched } = await targets(router, opts.pages ?? PROVIDER_PAGES);
  const outcomes: Record<Outcome, number> = { same: 0, changed: 0, added: 0, held: 0, unread: 0 };

  for (const [url, models] of byPage) {
    let page: Awaited<ReturnType<typeof readPage>> | null = null;
    let failure = "";
    try { page = await readPage(url, models, today); }
    catch (e) { failure = (e as Error).message.slice(0, 300); }

    await sql.begin(async (tx) => {
      if (page) await completeReceipt(tx, page.receiptId);
      for (const m of models) {
        const reading = page?.readings.get(m.slug);
        const backed = page ? backedPrice(reading, page.text) : { problem: failure };
        const routerJson = m.router ? tx.json({ ...m.router } as never) : null;
        let outcome: Outcome = "unread";
        let price: Price | null = null;
        if ("price" in backed) {
          price = backed.price;
          const [prev] = await tx<{ outcome: string; currency: Price["currency"] | null; input: number | null; output: number | null; cached: number | null }[]>`
            SELECT outcome, currency, input::float8 AS input, output::float8 AS output, cached_input::float8 AS cached FROM lb_price_checks
            WHERE model_id = ${m.id} AND checked_on < ${today} ORDER BY checked_on DESC LIMIT 1`;
          const prevPrice = prev?.currency && prev.input !== null && prev.output !== null ? { currency: prev.currency, input: prev.input, output: prev.output, cached: prev.cached } : null;
          outcome = decide(price, m.current, m.router, prev ? { outcome: prev.outcome, price: prevPrice } : null);
        }
        if (outcome === "same") {
          await tx`UPDATE lb_prices SET since = coalesce(since, verified_on), verified_on = ${today}, updated_at = now()
                   WHERE model_id = ${m.id} AND kind = 'official' AND verified_on IS DISTINCT FROM ${today}`;
        } else if (outcome === "changed") {
          await tx`UPDATE lb_prices SET currency = ${price!.currency}, input = ${price!.input}, output = ${price!.output}, cached_input = ${price!.cached},
                     since = ${today}, verified_on = ${today}, updated_at = now() WHERE model_id = ${m.id} AND kind = 'official'`;
        } else if (outcome === "added") {
          await tx`INSERT INTO lb_prices (model_id, kind, currency, input, output, cached_input, source_url, verified_on, since)
                   VALUES (${m.id}, 'official', ${price!.currency}, ${price!.input}, ${price!.output}, ${price!.cached}, ${url}, ${today}, ${today})
                   ON CONFLICT (model_id, kind) DO NOTHING`;
        }
        const note = "problem" in backed ? backed.problem : outcome === "held" ? (m.current ? "differs from the current price; not confirmed by OpenRouter or a previous day" : "OpenRouter lists a different price") : null;
        // A price written earlier the same day stays recorded as its change (the indices read it as history).
        await tx`INSERT INTO lb_price_checks (model_id, checked_on, outcome, source_url, currency, input, output, cached_input, quote, openrouter, previous, note)
                 VALUES (${m.id}, ${today}, ${outcome}, ${url}, ${price?.currency ?? null}, ${price?.input ?? null}, ${price?.output ?? null}, ${price?.cached ?? null},
                   ${reading?.quote?.slice(0, 1500) ?? null}, ${routerJson}, ${outcome === "changed" ? priceJson(m.current) : null}, ${note})
                 ON CONFLICT (model_id, checked_on) DO UPDATE SET outcome = EXCLUDED.outcome, source_url = EXCLUDED.source_url, currency = EXCLUDED.currency,
                   input = EXCLUDED.input, output = EXCLUDED.output, cached_input = EXCLUDED.cached_input, quote = EXCLUDED.quote, openrouter = EXCLUDED.openrouter,
                   previous = EXCLUDED.previous, note = EXCLUDED.note, created_at = now()
                 WHERE lb_price_checks.outcome NOT IN ('changed', 'added')`;
        outcomes[outcome]++;
      }
    });
  }
  return { pages: byPage.size, router: router !== null, outcomes, unmatched };
}

/** Today's held and unread readings, for the module alert. */
export async function priceProblems(today: string): Promise<Array<{ slug: string; outcome: string; note: string | null; url: string }>> {
  return sql`
    SELECT m.slug, c.outcome, c.note, c.source_url AS url FROM lb_price_checks c JOIN lb_models m ON m.id = c.model_id
    WHERE c.checked_on = (SELECT max(checked_on) FROM lb_price_checks) AND c.checked_on >= ${today}::date - 1 AND c.outcome IN ('held', 'unread')
    ORDER BY c.outcome, m.slug`;
}
