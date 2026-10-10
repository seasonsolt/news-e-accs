// Vals AI Finance Agent (v2): the benchmark page's BenchmarkView island either carries the data in its
// Astro props (each value serialised as [type, value]) or, since October 2026, names a same-site JSON
// file holding it (benchmarkViewUrl, content-hashed). The overall task gives each model's accuracy
// with its standard error.
// The run setting is the reported reasoning (or compute) effort; bare numbers are run settings here.
import { guardedFetch } from "@aihot/backend/lib/http-fetch";
import { configurationOf } from "../configuration.ts";
import type { Fetcher, ParsedRow } from "../types.ts";

const PAGE = "https://www.vals.ai/benchmarks/fabv2";
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

interface Result {
  accuracy: number | null;
  stderr: number | null;
  latency: number | null;
  cost_per_test: number | null;
  reasoning_effort: string | number | null;
  compute_effort: string | number | null;
  provider: string | null;
  harness: string | null;
}

interface View {
  metadata: { benchmark_id: string; version: string; updated: string | null; total_models: number | null; models: string[] };
  tasks: { overall: Record<string, Result> };
}

function unescapeAttribute(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|quot|amp|lt|gt|apos);/gi, (_, e: string) => {
    if (e[0] === "#") return String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : Number(e.slice(1)));
    return ({ quot: '"', amp: "&", lt: "<", gt: ">", apos: "'" } as Record<string, string>)[e.toLowerCase()]!;
  });
}

/** Astro's serialised props: [0, value] (objects recurse), [1, array], [3, date], [11, ±Infinity]. */
function revive(v: unknown): unknown {
  if (!Array.isArray(v) || v.length !== 2 || typeof v[0] !== "number") return v;
  const [type, value] = v as [number, unknown];
  if (type === 0 && value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, x]) => [k, revive(x)]));
  if (type === 1) return (value as unknown[]).map(revive);
  if (type === 11) return value === 1 ? Infinity : -Infinity;
  return value;
}

/** Where the page keeps its benchmark data: inline in the island's props, or in a JSON file it names. */
export function benchmarkView(html: string): { view: View } | { url: string } {
  for (const m of html.matchAll(/<astro-island\b([^>]*)>/g)) {
    const attrs = m[1]!;
    if (!/component-url="[^"]*BenchmarkView[^"]*"/.test(attrs)) continue;
    const props = /\sprops="([^"]*)"/.exec(attrs);
    if (!props) break;
    const parsed = revive([0, JSON.parse(unescapeAttribute(props[1]!))]) as Record<string, unknown>;
    if (parsed.benchmarkView) return { view: parsed.benchmarkView as View };
    if (typeof parsed.benchmarkViewUrl === "string") {
      const url = new URL(parsed.benchmarkViewUrl, PAGE);
      // Only the benchmark site itself is trusted to hold its data.
      if (url.origin !== new URL(PAGE).origin) throw new Error(`vals: benchmark data on another site (${url.origin})`);
      return { url: url.href };
    }
    break;
  }
  throw new Error("vals: benchmark data not found on the page");
}

function assertView(v: unknown): View {
  const view = v as Partial<View> | null;
  if (!view?.metadata || !view.tasks?.overall || typeof view.tasks.overall !== "object") throw new Error("vals: benchmark data lacks metadata or tasks.overall");
  return view as View;
}

export const vals: Fetcher = {
  sourceKeys: ["vals-finance-agent"],
  async fetch() {
    const res = await guardedFetch(PAGE, { timeoutMs: 60_000, maxBytes: 32 * 1024 * 1024 });
    if (res.status !== 200) throw new Error(`vals HTTP ${res.status}`);
    const found = benchmarkView(res.text());
    let view: View;
    if ("view" in found) view = assertView(found.view);
    else {
      const data = await guardedFetch(found.url, { timeoutMs: 60_000, maxBytes: 32 * 1024 * 1024 });
      if (data.status !== 200) throw new Error(`vals data HTTP ${data.status}`);
      view = assertView(JSON.parse(data.text()));
    }
    const overall = view.tasks.overall;
    const published = view.metadata.updated;
    const publishedAt = published ? `${published}T00:00:00.000Z` : null;
    const rows: ParsedRow[] = [];
    for (const [name, r] of Object.entries(overall)) {
      if (r.accuracy == null || !Number.isFinite(r.accuracy)) continue;
      const effort = r.reasoning_effort ?? r.compute_effort;
      const configuration = configurationOf(effort == null ? [] : [String(effort)], { numericTokens: true });
      const model = name.split("/").pop()!;
      rows.push({
        sourceModelName: name,
        keyName: slug(name),
        baseName: model.replace(/[-_](thinking|reasoning)$/i, "").replace(/_/g, "-"),
        organization: r.provider,
        configuration,
        metricKey: "vals-finance-agent",
        metricName: "Vals Finance Agent",
        rawScore: r.accuracy,
        lowerBound: r.stderr == null ? null : r.accuracy - r.stderr,
        upperBound: r.stderr == null ? null : r.accuracy + r.stderr,
        sourcePublishedAt: publishedAt,
        metadata: {
          unit: "percent",
          harness: r.harness,
          standardError: r.stderr,
          standardErrorUnit: "percentage-points",
          standardErrorDefinition: "reported-standard-error-of-mean",
          costPerTestUsd: r.cost_per_test,
          latencySeconds: r.latency,
          reasoningEffort: effort,
          metricDirection: "HIGHER",
        },
      });
    }
    return [{
      sourceKey: "vals-finance-agent",
      sourceName: "Vals Finance Agent",
      sourceUrl: PAGE,
      license: "官方公开结果；公开再展示保留官方署名，完整再分发授权仍以 Vals 条款为准",
      attributionUrl: PAGE,
      publishedAt,
      rows,
      metadata: {
        valsTask: slug(view.metadata.benchmark_id),
        benchmarkVersion: view.metadata.version,
        upstreamPublishedAt: published,
        upstreamModelCount: view.metadata.total_models,
        sourceOperator: "Vals AI",
        sourceFamily: "professional-work",
        metricCount: 1,
      },
    }];
  },
};
