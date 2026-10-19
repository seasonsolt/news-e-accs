// API prices (lb_prices kind='official'). A new site starts from the dated file in seeds; each refresh
// fills in the models that have no price yet, then takes OpenRouter's public model list (no key) for every
// model of the latest run it lists. Models OpenRouter does not list keep their price.
// scripts/import-leaderboard-prices.ts rewrites them all from a newer file.
import { readFileSync } from "node:fs";
import path from "node:path";

import { sql } from "@aihot/backend/db";
import { guardedFetch } from "@aihot/backend/lib/http-fetch";
import { beijingDate } from "@aihot/contracts/time";
import { runView } from "./read.ts";

export const PRICE_FILE = path.resolve(import.meta.dirname, "../seeds/lb-official-prices-2026-09-26.json");
export const OPENROUTER_MODELS = "https://openrouter.ai/api/v1/models";

interface PriceFile {
  verifiedOn: string;
  /** slug → [currency, input, output, cached input, source url], per million tokens */
  prices: Record<string, [string, number | null, number | null, number | null, string]>;
}

export async function importOfficialPrices(opts: { file?: string; overwrite?: boolean } = {}): Promise<{ written: number; unknown: string[] }> {
  const seed = JSON.parse(readFileSync(opts.file ?? PRICE_FILE, "utf8")) as PriceFile;
  let written = 0;
  const unknown: string[] = [];
  for (const [slug, [currency, input, output, cached, url]] of Object.entries(seed.prices)) {
    const [model] = await sql<{ id: string }[]>`SELECT id FROM lb_models WHERE slug = ${slug}`;
    if (!model) {
      unknown.push(slug);
      continue;
    }
    const res = opts.overwrite
      ? await sql`INSERT INTO lb_prices (model_id, kind, currency, input, output, cached_input, source_url, verified_on)
                  VALUES (${model.id}, 'official', ${currency}, ${input}, ${output}, ${cached}, ${url}, ${seed.verifiedOn})
                  ON CONFLICT (model_id, kind) DO UPDATE SET currency = EXCLUDED.currency, input = EXCLUDED.input, output = EXCLUDED.output,
                    cached_input = EXCLUDED.cached_input, source_url = EXCLUDED.source_url, verified_on = EXCLUDED.verified_on, updated_at = now()`
      : await sql`INSERT INTO lb_prices (model_id, kind, currency, input, output, cached_input, source_url, verified_on)
                  VALUES (${model.id}, 'official', ${currency}, ${input}, ${output}, ${cached}, ${url}, ${seed.verifiedOn})
                  ON CONFLICT (model_id, kind) DO NOTHING`;
    written += res.count;
  }
  return { written, unknown };
}

/** OpenRouter's listing of a model: its id and USD prices per million tokens. */
export interface RouterPrice {
  id: string;
  input: number;
  output: number;
  cached: number | null;
}

const alnum = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** OpenRouter's standard listings (no batch or alias variants), keyed by the id's letters and digits without the vendor. */
export function routerIndex(body: unknown): Map<string, RouterPrice> {
  const data = (body as { data?: Array<{ id?: string; pricing?: Record<string, unknown> }> }).data;
  if (!Array.isArray(data) || data.length < 50) throw new Error("openrouter: unexpected model list");
  const perMillion = (v: unknown) => (typeof v === "string" && /^\d+(\.\d+)?(e-?\d+)?$/i.test(v) ? Math.round(Number(v) * 1e6 * 1e6) / 1e6 : null);
  const index = new Map<string, RouterPrice>();
  for (const m of data) {
    if (!m.id || m.id.startsWith("~") || m.id.includes(":") || !m.id.includes("/")) continue;
    const input = perMillion(m.pricing?.prompt);
    const output = perMillion(m.pricing?.completion);
    if (input === null || output === null || input <= 0 || output <= 0) continue;
    const key = alnum(m.id.slice(m.id.indexOf("/") + 1));
    if (!index.has(key)) index.set(key, { id: m.id, input, output, cached: perMillion(m.pricing?.input_cache_read) });
  }
  return index;
}

/** A leaderboard model's OpenRouter listing, matched on its slug or name. */
export function routerMatch(index: Map<string, RouterPrice>, model: { slug: string; name: string }): RouterPrice | null {
  return index.get(alnum(model.slug)) ?? index.get(alnum(model.name)) ?? null;
}

/** Takes OpenRouter's price for each model of the latest run it lists: an unchanged price is re-verified, a different one replaced. */
export async function refreshPrices(opts: { url?: string; today?: string } = {}): Promise<{ same: number; changed: number; added: number; notOnRouter: number }> {
  const res = await guardedFetch(opts.url ?? OPENROUTER_MODELS, { timeoutMs: 30_000, maxBytes: 16 * 1024 * 1024 });
  if (res.status !== 200) throw new Error(`openrouter HTTP ${res.status}`);
  const index = routerIndex(JSON.parse(res.text()));
  const today = opts.today ?? beijingDate(new Date());
  const view = await runView();
  const rows = await sql<{ model_id: string; currency: string; input: number | null; output: number | null; cached: number | null }[]>`
    SELECT model_id, currency, input, output, cached_input AS cached FROM lb_prices WHERE kind = 'official' AND model_id = ANY(${[...view.modelsById.keys()]})`;
  const current = new Map(rows.map((r) => [r.model_id, r]));
  const counts = { same: 0, changed: 0, added: 0, notOnRouter: 0 };
  await sql.begin(async (tx) => {
    for (const [id, m] of view.modelsById) {
      const router = routerMatch(index, m);
      if (!router) {
        counts.notOnRouter++;
        continue;
      }
      const url = `https://openrouter.ai/${router.id}`;
      const was = current.get(id);
      if (!was) {
        await tx`INSERT INTO lb_prices (model_id, kind, currency, input, output, cached_input, source_url, verified_on)
                 VALUES (${id}, 'official', 'USD', ${router.input}, ${router.output}, ${router.cached}, ${url}, ${today}) ON CONFLICT (model_id, kind) DO NOTHING`;
        counts.added++;
      } else if (was.currency === "USD" && was.input === router.input && was.output === router.output && was.cached === router.cached) {
        await tx`UPDATE lb_prices SET verified_on = ${today}, source_url = ${url}, updated_at = now()
                 WHERE model_id = ${id} AND kind = 'official' AND (verified_on IS DISTINCT FROM ${today} OR source_url IS DISTINCT FROM ${url})`;
        counts.same++;
      } else {
        await tx`UPDATE lb_prices SET currency = 'USD', input = ${router.input}, output = ${router.output}, cached_input = ${router.cached},
                   source_url = ${url}, verified_on = ${today}, updated_at = now() WHERE model_id = ${id} AND kind = 'official'`;
        counts.changed++;
      }
    }
  });
  return counts;
}
