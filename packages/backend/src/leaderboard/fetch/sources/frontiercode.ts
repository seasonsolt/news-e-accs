// FrontierCode 1.1 (Cognition): would the maintainer merge this PR? Tasks written by the open-source
// maintainers of each repository, graded by tests, rubrics and verifiers; runs that consult
// solution-bearing sources are zeroed. Each model runs in its own maker's harness (codex,
// claude-code, devin …) at each published reasoning effort; the main subset (100 tasks) is scored.
// As with DeepSWE, the highest reasoning tier run represents the base model.
import { guardedFetch } from "../../../lib/http-fetch.ts";
import { configurationOf, scaffolded } from "../configuration.ts";
import { competitionRanks } from "../rank.ts";
import type { FetchResult, Fetcher, ParsedRow } from "../types.ts";

const URL_ = "https://cognition.com/data/frontiercode-leaderboard/data.json";
const REVISION = "v1_1";
const SUBSET = "main";
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

interface Run {
  correct: number | null;
  new_score: number | null;
  tokens: number | null;
  cost: number | null;
  duration_min?: number | null;
  flagged_rate?: number | null;
}

interface Revision {
  models: string[];
  harness: Record<string, string>;
  efforts: Record<string, string[]>;
  subsets: Record<string, number>;
  data: Record<string, Record<string, Record<string, Run>>>;
}

/** The scored rows of one published revision (exported for tests). */
export function parseFrontierCode(doc: Record<string, Revision>): FetchResult {
  const rev = doc[REVISION];
  if (!rev?.data) throw new Error(`frontiercode: revision ${REVISION} missing`);
  const runs: Array<{ model: string; effort: string; harness: string; run: Run }> = [];
  for (const model of rev.models) {
    const harness = rev.harness[model] ?? "unknown";
    for (const effort of rev.efforts[model] ?? []) {
      const run = rev.data[model]?.[effort]?.[SUBSET];
      if (run && typeof run.new_score === "number") runs.push({ model, effort, harness, run });
    }
  }
  const rank = competitionRanks(runs.map((r) => r.run.new_score!));
  const taskCount = rev.subsets[SUBSET] ?? null;
  const rows: ParsedRow[] = runs.map(({ model, effort, harness, run }, i) => {
    const systemId = `frontiercode-1.1:${harness}`;
    const configuration = scaffolded(
      configurationOf(effort !== "none" ? [effort] : []),
      [`harness-${slug(harness)}`, `systemid-${slug(systemId)}`],
      [harness, systemId],
    );
    return {
      sourceModelName: model,
      baseName: model,
      organization: null,
      configuration,
      metricKey: "frontiercode",
      metricName: "FrontierCode 1.1",
      rawScore: run.new_score!,
      lowerBound: null,
      upperBound: null,
      sourceRank: rank[i],
      sampleSize: taskCount,
      metadata: {
        harness,
        reasoningEffort: effort,
        systemId,
        subset: SUBSET,
        taskCount,
        correct: run.correct,
        meanCostUsd: run.cost,
        meanTokens: run.tokens,
        meanDurationMin: run.duration_min ?? null,
        flaggedRate: run.flagged_rate ?? null,
        metricDirection: "HIGHER",
      },
    };
  });
  return {
    sourceKey: "frontiercode",
    sourceName: "FrontierCode 1.1",
    sourceUrl: URL_,
    license: "官方公开结构化结果；按原样引用并链接 Cognition 原页",
    attributionUrl: "https://cognition.com/frontiercode",
    publishedAt: null,
    rows,
    metadata: { benchmarkVersion: "1.1", subset: SUBSET, comparisonSubject: "NATIVE_HARNESS_SYSTEM", upstreamTaskCount: taskCount, sourceOperator: "Cognition", sourceFamily: "software-engineering", metricCount: 1 },
  };
}

export const frontiercode: Fetcher = {
  sourceKeys: ["frontiercode"],
  async fetch() {
    const res = await guardedFetch(URL_, { timeoutMs: 30_000, maxBytes: 8 * 1024 * 1024 });
    if (res.status !== 200) throw new Error(`frontiercode HTTP ${res.status}`);
    return [parseFrontierCode(JSON.parse(res.text()) as Record<string, Revision>)];
  },
};
