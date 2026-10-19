// What the daily price check reads and how it decides, without the database or the network: the text of
// a vendor pricing page, OpenRouter's public model list as a second source, the check that a model's
// reading is backed by a verbatim passage of the page, and the rule for when a new price is written.
import * as cheerio from "cheerio";
import { z } from "zod";

export interface Price {
  currency: "USD" | "CNY";
  /** Per million tokens. */
  input: number;
  output: number;
  cached: number | null;
}

/** OpenRouter's listing of a model: its id and USD prices per million tokens. */
export interface RouterPrice {
  id: string;
  input: number;
  output: number;
  cached: number | null;
}

/** The official pricing page of each vendor, by OpenRouter's id prefix, for models that have no price yet. */
export const PROVIDER_PAGES: Record<string, string> = {
  anthropic: "https://platform.claude.com/docs/en/about-claude/pricing",
  openai: "https://developers.openai.com/api/docs/pricing",
  google: "https://ai.google.dev/gemini-api/docs/pricing",
  deepseek: "https://api-docs.deepseek.com/quick_start/pricing/",
  "x-ai": "https://docs.x.ai/developers/pricing",
  "z-ai": "https://docs.z.ai/guides/overview/pricing",
  qwen: "https://www.alibabacloud.com/help/en/model-studio/model-pricing",
  moonshotai: "https://platform.moonshot.ai/docs/pricing/chat",
  meta: "https://dev.meta.ai/docs/pricing-rate-limits/",
};

/** The readable text of a page, table cells separated by " | " and blocks by line breaks. */
export function pageText(html: string): string {
  const $ = cheerio.load(html);
  $("script, style, noscript, svg, template, head").remove();
  $("td, th").append(" | ");
  $("tr, p, li, h1, h2, h3, h4, h5, h6, div, br, section, article").append("\n");
  return $("body").text().replace(/[ \t ]+/g, " ").replace(/ *\n[\s|]*\n+/g, "\n").replace(/ +\n/g, "\n").trim();
}

const PAGE_BUDGET = 24_000;

/**
 * The parts of a page the model reads: all of a short page; of a long one, the stretches after each
 * mention of a listed model (a pricing table follows its model's heading), up to the budget; with no
 * mention, its beginning.
 */
export function excerpt(text: string, names: string[]): string {
  if (text.length <= PAGE_BUDGET) return text;
  const lower = text.toLowerCase();
  const spans: Array<[number, number]> = [];
  // A name is also looked for with its spaces as hyphens or removed (Qwen3.8 Max, qwen3.8-max).
  const forms = names.flatMap((n) => [n, n.replace(/ /g, "-"), n.replace(/ /g, "")]).map((n) => n.toLowerCase());
  for (const name of new Set(forms.filter((n) => n.length >= 3))) {
    for (let at = lower.indexOf(name); at >= 0; at = lower.indexOf(name, at + name.length)) spans.push([Math.max(0, at - 300), Math.min(text.length, at + 2500)]);
  }
  spans.sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const span of spans) {
    const last = merged.at(-1);
    if (last && span[0] <= last[1]) last[1] = Math.max(last[1], span[1]);
    else merged.push([...span]);
  }
  if (!merged.length) return text.slice(0, PAGE_BUDGET);
  let out = "";
  for (const [from, to] of merged) {
    if (out.length >= PAGE_BUDGET) break;
    out += `${out ? "\n…\n" : ""}${text.slice(from, Math.min(to, from + PAGE_BUDGET - out.length))}`;
  }
  return out;
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

export const PageReading = z.object({
  models: z.array(z.object({
    slug: z.string(),
    found: z.boolean(),
    currency: z.enum(["USD", "CNY"]).nullable(),
    per: z.number().nullable(),
    input: z.number().nullable(),
    output: z.number().nullable(),
    cached: z.number().nullable(),
    quote: z.string().nullable(),
  })),
});
export type ModelReading = z.infer<typeof PageReading>["models"][number];

/** The page was read and does not list the model (not: the page could not be read). */
export const NOT_FOUND = "not found on the page";

const squash = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

/** The quote occurs on the page; one that skips text with "..." or "…" occurs as those parts, in order. */
function onPage(text: string, quote: string): boolean {
  const page = squash(text);
  let from = 0;
  for (const part of quote.split(/\.\.\.|…/).map(squash).filter(Boolean)) {
    const at = page.indexOf(part, from);
    if (at < 0) return false;
    from = at + part.length;
  }
  return from > 0;
}
const PER = new Set([1, 1000, 1_000_000]);

/** The numbers a passage writes, read with a comma as either a decimal or a thousands separator (0,75 · 1,000). */
function numbersIn(quote: string): number[] {
  const out: number[] = [];
  for (const token of quote.replace(/(\d),\s+(\d)/g, "$1,$2").match(/\d+(?:[.,]\d+)*/g) ?? []) {
    out.push(Number(token.replace(/,/g, "")));
    if (/^\d+,\d+$/.test(token)) out.push(Number(token.replace(",", ".")));
  }
  return out;
}

/**
 * The model's price per million tokens, if its reading is backed by the page: the quote occurs in the
 * page text and every number appears in it. Otherwise the reason it is not.
 */
export function backedPrice(reading: ModelReading | undefined, text: string): { price: Price } | { problem: string } {
  if (!reading?.found) return { problem: NOT_FOUND };
  const { currency, per, input, output, cached, quote } = reading;
  if (!currency || per === null || !PER.has(per) || input === null || output === null) return { problem: "incomplete reading" };
  if (!quote || quote.length > 1500 || !onPage(text, quote)) return { problem: "quote not on the page" };
  const stated = numbersIn(quote);
  for (const n of [input, output, cached]) {
    if (n !== null && (!(n >= 0) || !stated.some((s) => Math.abs(s - n) < 1e-9))) return { problem: `${n} not in the quote` };
  }
  const scale = (n: number) => Math.round(n * (1_000_000 / per) * 1e6) / 1e6;
  return { price: { currency, input: scale(input), output: scale(output), cached: cached === null ? null : scale(cached) } };
}

const close = (a: number, b: number) => Math.abs(a - b) <= 0.01 * Math.max(Math.abs(a), Math.abs(b)) + 1e-9;

/** The page and OpenRouter list the same USD price, within 1%. */
export function routerAgrees(price: Price, router: RouterPrice | null): boolean {
  if (!router || price.currency !== "USD") return false;
  return close(price.input, router.input) && close(price.output, router.output)
    && (price.cached === null || router.cached === null || close(price.cached, router.cached));
}

/** The page states the current price: the cached price counts only when the page gives one. */
export function samePrice(page: Price, current: Price): boolean {
  return page.currency === current.currency && page.input === current.input && page.output === current.output
    && (page.cached === null || page.cached === current.cached);
}

/**
 * What to do with a model's reading. An unchanged price is confirmed. A new one is written when
 * OpenRouter lists the same price, or when the previous day's check read the same new price;
 * otherwise it is held and reported. A model with no price gets one only when OpenRouter agrees.
 */
export function decide(page: Price, current: Price | null, router: RouterPrice | null, previous: { outcome: string; price: Price | null } | null):
  "same" | "changed" | "added" | "held" {
  if (!current) return routerAgrees(page, router) ? "added" : "held";
  if (samePrice(page, current)) return "same";
  if (routerAgrees(page, router)) return "changed";
  const p = previous?.outcome === "held" ? previous.price : null;
  const confirmed = p !== null && p.currency === page.currency && p.input === page.input && p.output === page.output && p.cached === page.cached;
  return confirmed ? "changed" : "held";
}
