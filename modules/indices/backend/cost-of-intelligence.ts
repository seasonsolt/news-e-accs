// The cost-of-intelligence index (docs/plans/cost-of-intelligence.md): for each GPQA Diamond threshold,
// the cheapest first-party API price at which a model at or above it could be bought on each date.
// Computed on read from the leaderboard's Epoch snapshot and official prices plus the dated price
// history in seeds/; nothing is stored.
import { readFileSync } from "node:fs";
import path from "node:path";
import { sql } from "@aihot/backend/db";
import { cached } from "@aihot/backend/lib/cache";
import { beijingDate } from "@aihot/contracts/time";
import type { CoiPoint, CoiTier, CostOfIntelligence } from "../contracts.ts";

export const PRICE_HISTORY_FILE = path.resolve(import.meta.dirname, "../seeds/price-history.json");

export const TIERS = [
  { key: "gpqa-35", threshold: 0.35, reference: "GPT-4" },
  { key: "gpqa-50", threshold: 0.5, reference: "GPT-4o · Claude 3.5 Sonnet" },
  { key: "gpqa-75", threshold: 0.75, reference: "o1" },
  { key: "gpqa-90", threshold: 0.9, reference: "GPT-5.2 · Gemini 3 Pro" },
] as const;

export interface PriceEntry {
  slug: string;
  from: string;
  currency: "USD" | "CNY";
  input: number;
  output: number;
  source: string | null;
  verified: boolean;
}

export interface ScoredModel {
  slug: string;
  name: string;
  provider: string | null;
  releasedOn: string | null;
  score: number;
}

/** The current official price (lb_prices), in effect since `since` (or, if it predates the daily check, by the day it was verified). */
export interface CurrentPrice extends Omit<PriceEntry, "from" | "verified"> {
  since: string | null;
}

/** A price change the leaderboard's daily check wrote (lb_price_checks), with the price it replaced. */
export interface CheckedChange {
  slug: string;
  on: string;
  price: Omit<PriceEntry, "slug" | "from" | "verified">;
  previous: { currency: "USD" | "CNY"; input: number; output: number } | null;
}

export interface CoiInput {
  today: string;
  models: ScoredModel[];
  history: PriceEntry[];
  current: CurrentPrice[];
  /** CNY per USD; CNY prices are left out without it. */
  usdCny: number | null;
}

export function readPriceHistory(file = PRICE_HISTORY_FILE): PriceEntry[] {
  const raw = JSON.parse(readFileSync(file, "utf8")) as { prices: PriceEntry[] };
  return raw.prices;
}

/**
 * The dated history with the daily check's changes added. A model with no dated price before its first
 * change also gets the price that change replaced, from its release.
 */
export function withCheckedChanges(history: PriceEntry[], changes: CheckedChange[], releasedOn: Map<string, string | null>): PriceEntry[] {
  const out = [...history];
  for (const c of [...changes].sort((a, b) => a.on.localeCompare(b.on))) {
    const released = releasedOn.get(c.slug);
    const earlier = out.some((p) => p.slug === c.slug && p.from < c.on);
    if (!earlier && c.previous && released && released < c.on) out.push({ slug: c.slug, from: released, ...c.previous, source: c.price.source, verified: true });
    out.push({ slug: c.slug, from: c.on, ...c.price, verified: true });
  }
  return out;
}

const blended = (input: number, output: number) => (3 * input + output) / 4;

/**
 * A model's prices by the date each took effect. The dated history comes first; a current price that
 * differs from its last entry took effect by the day it was verified. A model with no history has had
 * its current price since release.
 */
function timeline(model: ScoredModel, history: PriceEntry[], current: CurrentPrice | undefined): PriceEntry[] {
  const own = history.filter((p) => p.slug === model.slug).sort((a, b) => a.from.localeCompare(b.from));
  if (!current) return own;
  const last = own.at(-1);
  if (!last) return model.releasedOn ? [{ ...current, from: model.releasedOn, verified: true }] : [];
  const changed = last.currency !== current.currency || last.input !== current.input || last.output !== current.output;
  if (changed && current.since && current.since > last.from) own.push({ ...current, from: current.since, verified: true });
  return own;
}

export function computeCostOfIntelligence(input: CoiInput): Omit<CostOfIntelligence, "fx" | "gpqa"> {
  const usd = (currency: string, amount: number) => (currency === "CNY" ? (input.usdCny ? amount / input.usdCny : null) : amount);
  const currentBySlug = new Map(input.current.map((p) => [p.slug, p]));
  const priced = input.models
    .map((model) => ({
      model,
      prices: timeline(model, input.history, currentBySlug.get(model.slug))
        .filter((p) => p.from <= input.today)
        .flatMap((p) => {
          const price = usd(p.currency, blended(p.input, p.output));
          return price === null ? [] : [{ ...p, price }];
        }),
    }))
    .filter((m) => m.prices.length > 0);
  const dates = [...new Set(priced.flatMap((m) => m.prices.map((p) => p.from)))].sort();

  const tiers: CoiTier[] = TIERS.map((tier) => {
    const eligible = priced.filter((m) => m.model.score >= tier.threshold);
    const points: CoiPoint[] = [];
    for (const date of dates) {
      // A tie keeps the model already on the line, so a launch at the same price is not a step.
      const last = points.at(-1);
      let best: { model: ScoredModel; price: PriceEntry & { price: number } } | null = null;
      for (const m of eligible) {
        const price = m.prices.findLast((p) => p.from <= date);
        if (!price) continue;
        const tie = best && price.price === best.price.price;
        if (!best || price.price < best.price.price || (tie && (m.model.slug === last?.model.slug || (best.model.slug !== last?.model.slug && m.model.slug < best.model.slug)))) best = { model: m.model, price };
      }
      if (!best || (last && last.model.slug === best.model.slug && last.price === best.price.price)) continue;
      points.push({
        date,
        price: best.price.price,
        model: { slug: best.model.slug, name: best.model.name, provider: best.model.provider },
        score: best.model.score,
        currency: best.price.currency,
        input: best.price.input,
        output: best.price.output,
        source: best.price.source,
        verified: best.price.verified,
      });
    }
    const first = points[0];
    const now = points.at(-1);
    return {
      key: tier.key,
      threshold: tier.threshold,
      reference: tier.reference,
      points,
      ratio: first && now && points.length > 1 ? first.price / now.price : null,
      halvingMonths: halvingMonths(points, input.today),
    };
  });
  return { asOf: input.today, tiers, modelCount: priced.length };
}

/**
 * Months for the line to halve: a least-squares fit of log2(price) on months, with the step line read on
 * the first day of every month from its first point to today. Null under three samples or when the fit
 * does not fall.
 */
export function halvingMonths(points: readonly Pick<CoiPoint, "date" | "price">[], today: string): number | null {
  if (points.length < 2) return null;
  const samples: Array<[number, number]> = [];
  let [year, month] = points[0]!.date.split("-").map(Number) as [number, number];
  for (let i = 0; ; i++) {
    const day = `${year}-${String(month).padStart(2, "0")}-01`;
    if (day > today) break;
    const point = points.findLast((p) => p.date <= day);
    if (point) samples.push([i, Math.log2(point.price)]);
    month += 1;
    if (month > 12) [year, month] = [year + 1, 1];
  }
  if (samples.length < 3) return null;
  const n = samples.length;
  const mx = samples.reduce((s, [x]) => s + x, 0) / n;
  const my = samples.reduce((s, [, y]) => s + y, 0) / n;
  const sxx = samples.reduce((s, [x]) => s + (x - mx) ** 2, 0);
  const slope = samples.reduce((s, [x, y]) => s + (x - mx) * (y - my), 0) / sxx;
  return slope < 0 ? -1 / slope : null;
}

async function load(): Promise<CostOfIntelligence> {
  const [snapshot] = await sql<{ id: string; fetched_at: Date; attribution_url: string | null; license: string | null }[]>`
    SELECT id, fetched_at, attribution_url, license FROM lb_snapshots WHERE source_key = 'epoch-gpqa' ORDER BY fetched_at DESC LIMIT 1`;
  const models = snapshot
    ? await sql<ScoredModel[]>`
        SELECT m.slug, m.name, m.provider, to_char(m.released_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS "releasedOn", max(s.raw_score) AS score
        FROM lb_scores s JOIN lb_models m ON m.id = s.model_id
        WHERE s.snapshot_id = ${snapshot.id} AND s.raw_score IS NOT NULL
        GROUP BY m.id`
    : [];
  const current = await sql<CurrentPrice[]>`
    SELECT m.slug, p.currency, p.input::float8 AS input, p.output::float8 AS output, p.source_url AS source, to_char(coalesce(p.since, p.verified_on), 'YYYY-MM-DD') AS since
    FROM lb_prices p JOIN lb_models m ON m.id = p.model_id
    WHERE p.kind = 'official' AND p.input IS NOT NULL AND p.output IS NOT NULL`;
  const [fx] = await sql<{ rate: number; as_of: string }[]>`
    SELECT rate::float8 AS rate, to_char(as_of, 'YYYY-MM-DD') AS as_of FROM fx_rates WHERE pair = 'USD/CNY' ORDER BY as_of DESC LIMIT 1`;
  const changes = await sql<CheckedChange[]>`
    SELECT m.slug, to_char(c.checked_on, 'YYYY-MM-DD') AS on,
      json_build_object('currency', c.currency, 'input', c.input::float8, 'output', c.output::float8, 'source', c.source_url) AS price,
      CASE WHEN c.previous ? 'input' AND c.previous ? 'output' THEN jsonb_build_object('currency', c.previous->'currency', 'input', c.previous->'input', 'output', c.previous->'output') END AS previous
    FROM lb_price_checks c JOIN lb_models m ON m.id = c.model_id
    WHERE c.outcome = 'changed' AND c.input IS NOT NULL AND c.output IS NOT NULL`;
  const history = withCheckedChanges(readPriceHistory(), changes, new Map(models.map((m) => [m.slug, m.releasedOn])));
  const result = computeCostOfIntelligence({ today: beijingDate(new Date()), models, history, current, usdCny: fx?.rate ?? null });
  return {
    ...result,
    fx: fx ? { rate: fx.rate, asOf: fx.as_of } : null,
    gpqa: { fetchedAt: snapshot?.fetched_at.toISOString() ?? "", url: snapshot?.attribution_url ?? null, license: snapshot?.license ?? null },
  };
}

const index = cached(load, { freshMs: 10 * 60_000, maxStaleMs: 24 * 3600_000 });

export function loadCostOfIntelligence(): Promise<CostOfIntelligence> {
  return index.get();
}

const csvCell = (value: unknown) => {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

/** Every tier's steps as CSV, one row per step with the price's source. */
export function costOfIntelligenceCsv(data: CostOfIntelligence): string {
  const rows: unknown[][] = [["tier", "gpqa_threshold", "date", "blended_usd_per_mtok", "model", "provider", "gpqa", "currency", "input_per_mtok", "output_per_mtok", "verified", "source"]];
  for (const tier of data.tiers) {
    for (const p of tier.points) {
      rows.push([tier.key, tier.threshold, p.date, p.price.toFixed(4), p.model.name, p.model.provider, p.score.toFixed(4), p.currency, p.input, p.output, p.verified, p.source]);
    }
  }
  return rows.map((row) => row.map(csvCell).join(",")).join("\n") + "\n";
}
