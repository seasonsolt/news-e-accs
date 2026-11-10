// First-party leaderboard DTOs (/api/site/leaderboard*). Not a public API.
import type { LeaderboardBoardKey } from "./taxonomy.ts";

/** HIGH 较充分 · MEDIUM 持续积累 · LOW 证据敏感. */
export type LbConfidence = "HIGH" | "MEDIUM" | "LOW";
export type LbSourceStatus = "ranked" | "cross_reference" | "observing" | "reference_only" | "awaiting";

export const LB_SOURCE_STATUS_LABELS: Record<LbSourceStatus, string> = {
  ranked: "参与排名",
  cross_reference: "交叉参考",
  observing: "观察中",
  reference_only: "仅供参考",
  awaiting: "等待成绩",
};

export const LB_CONFIDENCE_LABELS: Record<LbConfidence, string> = {
  HIGH: "较充分",
  MEDIUM: "持续积累",
  LOW: "证据敏感",
};

export interface LbBrand {
  /** Site-relative logo path, or null when only a monogram is available. */
  src: string | null;
  monogram: string;
  /** Raster marks get a light backing plate in dark mode. */
  raster: boolean;
}

export interface LbPrice {
  currency: "CNY" | "USD";
  /** Per million tokens in RMB (converted at the run's rate when the list price is USD). */
  inputCny: number | null;
  outputCny: number | null;
  cachedCny: number | null;
  /** List price in `currency`. */
  input: number | null;
  output: number | null;
  cached: number | null;
  officialUrl: string | null;
  verifiedOn: string | null;
}

export interface LbFx {
  rate: number;
  asOf: string;
  sourceName: string;
}

export interface LbRunInfo {
  id: string;
  methodologyVersion: string;
  generatedAt: string;
  fx: LbFx | null;
}

export interface LbStability {
  from: number;
  to: number;
  fixedFrom: number;
  fixedTo: number;
  scenarios: number;
  sensitive: boolean;
  incomplete: number;
  unavailable: number;
}

export interface LbModelRef {
  slug: string;
  name: string;
  provider: string | null;
  releasedAt: string | null;
  brand: LbBrand;
}

export interface LbBoardTab {
  key: LeaderboardBoardKey;
  name: string;
  href: string;
}

export interface LbBoardMeta {
  key: LeaderboardBoardKey;
  name: string;
  title: string;
  description: string;
  howToRead: string;
  sourceCount: number;
  operatorCount: number;
  modelCount: number;
}

export interface LbBoardEntry {
  rank: number;
  score: number;
  model: LbModelRef;
  sourceCount: number;
  coverage: number;
  confidence: LbConfidence;
  stability: LbStability | null;
  price: LbPrice | null;
}

export interface LbBoardResponse {
  run: LbRunInfo;
  board: LbBoardMeta;
  tabs: LbBoardTab[];
  entries: LbBoardEntry[];
}

export type LbScoreFormat = "percent" | "fraction" | "number";

export interface LbEvidenceItem {
  sourceKey: string;
  sourceName: string;
  /** The evaluator's mark. */
  brand: LbBrand | null;
  officialUrl: string | null;
  usage: string;
  display: string;
  /** e.g. "两项均分" for LiveBench pairs. */
  displayNote: string | null;
  sourceRank: number | null;
  sourceModelName: string | null;
  configurationLabel: string | null;
  selectionReason: string | null;
  upstreamAt: string | null;
  verifiedAt: string | null;
  measuredAt: string | null;
  carriedForward: boolean;
  components: Array<{ label: string; display: string }>;
  componentsNote: string | null;
}

export interface LbEvidenceGroup {
  key: string;
  name: string;
  items: LbEvidenceItem[];
}

export interface LbCategoryResult {
  key: LeaderboardBoardKey;
  name: string;
  rank: number | null;
  score: number | null;
  sourceCount: number;
  onBoard: boolean;
}

export interface LbComparisonRow {
  sourceKey: string;
  sourceName: string;
  officialUrl: string | null;
  mine: string;
  theirs: string;
  weight: number;
}

export interface LbComparison {
  model: LbModelRef;
  rank: number;
  net: number;
  sharedWeight: number;
  sharedCount: number;
  hasPage: boolean;
  rows: LbComparisonRow[];
}

export interface LbModelDetail {
  run: LbRunInfo;
  model: LbModelRef & { contextWindowTokens: number | null };
  price: LbPrice | null;
  overall: { rank: number | null; score: number | null; onBoard: boolean; confidence: LbConfidence | null; stability: LbStability | null };
  categories: LbCategoryResult[];
  metricCount: number;
  evidence: LbEvidenceGroup[];
  unmeasured: Array<{ key: string; name: string }>;
  comparisons: LbComparison[];
  /** Present when the model is on no public board of the latest run: `run` is then the last run that ranked it. */
  retired?: true;
}

export interface LbSourceSummary {
  key: string;
  name: string;
  operator: string;
  description: string;
  status: LbSourceStatus;
  brand: LbBrand | null;
  budget: number | null;
  /** What the budget counted at this run: lower than `budget` when saturated. */
  effectiveBudget: number | null;
  /** Top scores packed too close to separate models: the source counted at a reduced weight this run. */
  saturated: boolean;
  /** Points of 100 between its best and 10th-best score; null for ratings without a ceiling. */
  spreadPp: number | null;
}

export interface LbLineageStep {
  name: string;
  period: string;
  note: string;
  current?: boolean;
}

export interface LbSourceGroup {
  key: string;
  name: string;
  blurb: string;
  lineage: LbLineageStep[];
  sources: LbSourceSummary[];
}

export interface LbSourcesResponse {
  run: LbRunInfo;
  rankedCount: number;
  totalCount: number;
  groups: LbSourceGroup[];
}

export interface LbSourceRow {
  sourceRank: number | null;
  sourceModelName: string;
  provider: string | null;
  display: string;
  configurationLabel: string | null;
  modelSlug: string | null;
}

export interface LbSourceDetail {
  run: LbRunInfo;
  source: LbSourceSummary & {
    fullName: string;
    area: string | null;
    group: { key: string; name: string };
    officialUrl: string | null;
    what: string;
    usage: string;
    limits: string;
    license: string;
    attribution: string;
  };
  upstreamAt: string | null;
  syncedAt: string | null;
  collected: boolean;
  /** Only sources whose results are public on the site carry rows. */
  rows: LbSourceRow[];
  /** Rows are agent systems (one per configuration), not one representative per model. */
  systemRows: boolean;
  rowsNote: string | null;
}

/** Every model of the latest run that has an official price, cheapest input first. */
export interface LbPricingRow {
  model: LbModelRef;
  /** Overall board rank, when the model is on the board. */
  rank: number | null;
  hasPage: boolean;
  price: LbPrice;
  /** Per million tokens in USD (CNY list prices converted at the run's rate); null when not convertible. */
  usd: { input: number | null; output: number | null; cached: number | null };
}

export interface LbPricingResponse {
  run: LbRunInfo;
  /** The latest date any listed price was checked against its official page. */
  verifiedOn: string | null;
  rows: LbPricingRow[];
  /** Slugs of the models whose pairs have indexable comparison pages, best overall rank first. */
  featured: string[];
}

export interface LbCompareSide {
  row: LbPricingRow;
  contextWindowTokens: number | null;
  /** Rank on each public board, null when the model is not in its top. */
  boards: Array<{ key: LeaderboardBoardKey; name: string; href: string; rank: number | null }>;
  /** Its other indexable comparisons, without this one. */
  related: Array<{ pair: string; model: LbModelRef }>;
}

/** The models a story names (the story page's part), each with its overall rank and USD prices. */
export interface LbStoryModels {
  models: Array<{ model: LbModelRef; rank: number | null; usd: LbPricingRow["usd"] | null }>;
  /** The comparison page of the first two featured models it names. */
  compare: string | null;
}

export interface LbCompareResponse {
  run: LbRunInfo;
  /** The pair as the page's address: both slugs in alphabetical order, joined by "-vs-". */
  pair: string;
  /** Whether the page is indexable: both models are among the featured ones. */
  featured: boolean;
  sides: [LbCompareSide, LbCompareSide];
}

export interface LbFetchOverview {
  at: string;
  sources: Array<{ key: string; ok: boolean; at: string; lastOkAt: string | null; changed?: boolean; rows?: number; error?: string }>;
}
