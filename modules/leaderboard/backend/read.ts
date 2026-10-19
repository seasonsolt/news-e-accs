// Leaderboard read layer: every leaderboard page reads the latest published run through here.
// Page reads never compute rankings; they only format what the run stored.
import { SITE } from "@aihot/site";
import { LEADERBOARD_PUBLIC_BOARDS, type LeaderboardBoardKey } from "@aihot/leaderboard/taxonomy";
import type {
  LbBoardEntry,
  LbBoardResponse,
  LbCompareResponse,
  LbCompareSide,
  LbComparison,
  LbConfidence,
  LbEvidenceGroup,
  LbEvidenceItem,
  LbModelDetail,
  LbModelRef,
  LbPrice,
  LbPricingResponse,
  LbPricingRow,
  LbRunInfo,
  LbSourceDetail,
  LbSourceRow,
  LbSourcesResponse,
  LbSourceSummary,
  LbStability,
  LbStoryModels,
} from "@aihot/leaderboard/contracts";
import { sql } from "@aihot/backend/db";
import {
  boardCopy,
  BOARD_LIMIT,
  formatScore,
  modelBrand,
  registrySource,
  scoreFormat,
  sourceGroups,
  SOURCE_GROUPS,
  sourceBrand,
  sourceKeyOfUnit,
  type LeaderboardLanguage,
} from "./registry.ts";
import { budgetName, configurationLabel, rowsNote, runInfo, selectionReason, usageLabel } from "../i18n/read.ts";

interface ModelRow {
  id: string;
  slug: string;
  name: string;
  provider: string | null;
  provider_slug: string | null;
  released_at: Date | null;
  context_window_tokens: number | null;
}

interface RankingRow {
  model_id: string;
  rank: number;
  score: number;
  coverage: number | null;
  confidence: string | null;
  metric_count: number | null;
  detail: { stability?: LbStability; sourceCount?: number; operatorCount?: number } | null;
}

interface SignalRow {
  score: number;
  modelSlug: string;
  lowerBound: number | null;
  upperBound: number | null;
  configuration: string;
}

interface RegistryEntry {
  family: string;
  weight: number;
  operator: string;
  protocol: string;
  direction: string;
  interval_sd: number | null;
}

interface EvidenceMeta {
  unit: string;
  operator: string;
  snapshotId: string;
  verifiedAt: string | null;
  evaluatedAt: string | null;
  publishedAt: string | null;
  configuration: string;
  carriedForward: boolean;
}

interface ComparisonRaw {
  net: number;
  slug: string;
  shared: number;
  directCount: number;
}

interface BoardView {
  key: string;
  entries: Array<RankingRow & { slug: string }>;
  bySlug: Map<string, RankingRow & { slug: string }>;
  registry: Record<string, RegistryEntry>;
  signals: Map<string, Map<string, SignalRow>>;
  comparisons: Record<string, ComparisonRaw[]>;
  sourceCount: number;
  operatorCount: number;
  modelCount: number;
}

interface RunView {
  info: LbRunInfo;
  snapshotIds: string[];
  models: Map<string, ModelRow>;
  modelsById: Map<string, ModelRow>;
  prices: Map<string, LbPrice>;
  boards: Map<string, BoardView>;
  pageSlugs: Set<string>;
  evidence: Record<string, EvidenceMeta>;
  sourceWeights: Map<string, number>;
  /** Runs before v16 recorded no saturation: absent means not saturated. */
  sourceSaturation: Map<string, { saturated: boolean; spreadPp: number | null; effectiveWeight: number }>;
  budgets: Array<{ key: string; name: string; weight: number }>;
  anchors: string[];
}

export class NoLeaderboardRun extends Error {}

// Cached runs stay language-neutral; reader copy is applied to each response without mutating them.
let cached: { view: RunView; checkedAt: number; pricesAt: string } | null = null;
let loading: Promise<RunView> | null = null;

/** The latest published run, or (the time machine) the one in effect at `asOf`. */
async function latestRunId(asOf: Date | null = null): Promise<string | null> {
  const [row] = await sql<{ id: string }[]>`
    SELECT id FROM lb_runs WHERE status = 'published' ${asOf ? sql`AND generated_at <= ${asOf}` : sql``}
    ORDER BY generated_at DESC, created_at DESC LIMIT 1`;
  return row?.id ?? null;
}

/** When a price last changed: the price refresh writes them whether or not a run is published. */
async function pricesChangedAt(): Promise<string> {
  const [row] = await sql<{ at: Date | null }[]>`SELECT max(updated_at) AS at FROM lb_prices WHERE kind = 'official'`;
  return row?.at?.toISOString() ?? "";
}

// Past runs never change (their prices are the current ones, reloaded with the live run): a few are kept by id.
const pastViews = new Map<string, Promise<RunView>>();

/** The latest published run, re-checked at most once a minute; `asOf` reads the run in effect then. */
export async function runView(asOf: Date | null = null): Promise<RunView> {
  if (asOf) {
    const id = await latestRunId(asOf);
    if (!id) throw new NoLeaderboardRun(`no published leaderboard run by ${asOf.toISOString()}`);
    if (cached?.view.info.id === id) return cached.view;
    let view = pastViews.get(id);
    if (!view) {
      if (pastViews.size >= 8) pastViews.delete(pastViews.keys().next().value!);
      view = buildRunView(id);
      view.catch(() => pastViews.delete(id));
      pastViews.set(id, view);
    }
    return view;
  }
  if (cached && Date.now() - cached.checkedAt < 60_000) return cached.view;
  loading ??= refreshRunView().finally(() => { loading = null; });
  return loading;
}

async function refreshRunView(): Promise<RunView> {
  const [id, pricesAt] = await Promise.all([latestRunId(), pricesChangedAt()]);
  if (!id) throw new NoLeaderboardRun("no published leaderboard run");
  if (cached && cached.view.info.id === id && cached.pricesAt === pricesAt) {
    cached.checkedAt = Date.now();
    return cached.view;
  }
  if (cached && cached.pricesAt !== pricesAt) pastViews.clear();
  const view = await buildRunView(id);
  cached = { view, checkedAt: Date.now(), pricesAt };
  return view;
}

async function buildRunView(runId: string): Promise<RunView> {
  const [run] = await sql<{ id: string; methodology_version: string; generated_at: Date; source_snapshot_ids: string[]; summary: any }[]>`
    SELECT id, methodology_version, generated_at, source_snapshot_ids, summary FROM lb_runs WHERE id = ${runId}`;
  if (!run) throw new NoLeaderboardRun(runId);
  const summary = run.summary ?? {};
  const consensus = summary.consensus ?? {};
  const fxQuote = summary.fxQuote as { asOf: string; rate: number; sourceName: string } | undefined;
  const info: LbRunInfo = {
    id: run.id,
    methodologyVersion: run.methodology_version,
    generatedAt: run.generated_at.toISOString(),
    fx: fxQuote ? { rate: Number(fxQuote.rate), asOf: fxQuote.asOf, sourceName: fxQuote.sourceName } : null,
  };

  const rankingRows = await sql<Array<RankingRow & { board: string }>>`
    SELECT board, model_id, rank, score, coverage, confidence, metric_count, detail FROM lb_rankings WHERE run_id = ${runId} ORDER BY board, rank`;
  const modelIds = [...new Set(rankingRows.map((r) => r.model_id))];
  const modelRows = await sql<ModelRow[]>`
    SELECT id, slug, name, provider, provider_slug, released_at, context_window_tokens FROM lb_models WHERE id = ANY(${modelIds})`;
  const modelsById = new Map(modelRows.map((m) => [m.id, m]));
  const models = new Map(modelRows.map((m) => [m.slug, m]));

  const inputs = new Map<string, any>((consensus.input ?? []).map((i: any) => [i.board, i]));
  const outputs = new Map<string, any>((consensus.boards ?? []).map((b: any) => [b.board, b]));
  const boards = new Map<string, BoardView>();
  for (const [key, input] of inputs) {
    const entries = rankingRows
      .filter((r) => r.board === key)
      .map((r) => ({ ...r, slug: modelsById.get(r.model_id)?.slug ?? "" }))
      .filter((r) => r.slug);
    const registry = (input.registry ?? {}) as Record<string, RegistryEntry>;
    const signals = new Map<string, Map<string, SignalRow>>();
    for (const s of input.signals ?? []) signals.set(s.key, new Map((s.rows as SignalRow[]).map((row) => [row.modelSlug, row])));
    const active = Object.entries(registry).filter(([, r]) => r.weight > 0);
    const output = outputs.get(key) ?? {};
    boards.set(key, {
      key,
      entries,
      bySlug: new Map(entries.map((e) => [e.slug, e])),
      registry,
      signals,
      comparisons: output.comparisons ?? {},
      sourceCount: new Set(active.map(([unit]) => sourceKeyOfUnit(unit))).size,
      operatorCount: new Set(active.map(([, r]) => r.operator)).size,
      modelCount: entries.length,
    });
  }

  const pageSlugs = new Set<string>();
  for (const key of LEADERBOARD_PUBLIC_BOARDS) {
    for (const e of boards.get(key)?.entries ?? []) if (e.rank <= BOARD_LIMIT) pageSlugs.add(e.slug);
  }

  const priceRows = await sql<{ model_id: string; currency: "CNY" | "USD"; input: number | null; output: number | null; cached_input: number | null; source_url: string | null; verified_on: Date | null }[]>`
    SELECT model_id, currency, input, output, cached_input, source_url, verified_on FROM lb_prices WHERE kind = 'official' AND model_id = ANY(${modelIds})`;
  const rate = info.fx?.rate ?? null;
  const toCny = (v: number | null, currency: string) => (v == null ? null : currency === "CNY" ? v : rate ? v * rate : null);
  const prices = new Map<string, LbPrice>(
    priceRows.map((p) => [
      p.model_id,
      {
        currency: p.currency,
        input: p.input,
        output: p.output,
        cached: p.cached_input,
        inputCny: toCny(p.input, p.currency),
        outputCny: toCny(p.output, p.currency),
        cachedCny: toCny(p.cached_input, p.currency),
        officialUrl: p.source_url,
        verifiedOn: p.verified_on ? p.verified_on.toISOString().slice(0, 10) : null,
      },
    ]),
  );

  const sourceWeights = new Map<string, number>();
  const sourceSaturation = new Map<string, { saturated: boolean; spreadPp: number | null; effectiveWeight: number }>();
  for (const s of summary.sources ?? []) {
    sourceWeights.set(s.key, Number(s.weight));
    sourceSaturation.set(s.key, { saturated: s.saturated === true, spreadPp: typeof s.spreadPp === "number" ? s.spreadPp : null, effectiveWeight: Number(s.effectiveWeight ?? s.weight) });
  }

  return {
    info,
    snapshotIds: run.source_snapshot_ids ?? [],
    models,
    modelsById,
    prices,
    boards,
    pageSlugs,
    evidence: consensus.evidence ?? {},
    sourceWeights,
    sourceSaturation,
    budgets: summary.budgets ?? [],
    anchors: inputs.get("overall")?.anchors ?? [],
  };
}

/** Clears the in-memory run so the next read reloads (after a new run is published). */
export function invalidateLeaderboard() {
  cached = null;
  pastViews.clear();
}

function confidenceOf(entry: RankingRow): LbConfidence {
  // Reproduces the published labels: sensitive rankings are low confidence; otherwise broad coverage is high.
  if (entry.detail?.stability?.sensitive) return "LOW";
  return (entry.coverage ?? 0) >= 0.7 ? "HIGH" : "MEDIUM";
}

function modelRef(view: RunView, m: ModelRow): LbModelRef {
  return {
    slug: m.slug,
    name: m.name,
    provider: m.provider === "其他" ? null : m.provider,
    releasedAt: m.released_at ? m.released_at.toISOString().slice(0, 10) : null,
    brand: modelBrand(m.slug, m.provider_slug, m.provider, m.name),
  };
}

function boardTabs(lang: LeaderboardLanguage) {
  return LEADERBOARD_PUBLIC_BOARDS.map((key) => ({
    key,
    name: boardCopy(key, lang).name,
    href: key === "overall" ? "/leaderboard" : `/leaderboard/category/${key}`,
  }));
}

export async function loadBoard(key: LeaderboardBoardKey, asOf: Date | null = null, lang: LeaderboardLanguage = "zh"): Promise<LbBoardResponse | null> {
  const view = await runView(asOf);
  const board = view.boards.get(key);
  if (!board) return null;
  const entries: LbBoardEntry[] = board.entries
    .filter((e) => e.rank <= BOARD_LIMIT)
    .map((e) => {
      const m = view.modelsById.get(e.model_id)!;
      return {
        rank: e.rank,
        score: e.score,
        model: modelRef(view, m),
        sourceCount: e.detail?.sourceCount ?? e.metric_count ?? 0,
        coverage: e.coverage ?? 0,
        confidence: confidenceOf(e),
        stability: e.detail?.stability ?? null,
        price: view.prices.get(m.id) ?? null,
      };
    });
  const copy = boardCopy(key, lang);
  return {
    run: runInfo(view.info, lang),
    board: { ...copy, sourceCount: board.sourceCount, operatorCount: board.operatorCount, modelCount: board.modelCount },
    tabs: boardTabs(lang),
    entries,
  };
}

function signalFormat(unit: string, board: BoardView) {
  const rows = board.signals.get(unit);
  const sample = rows ? rows.values().next().value?.score : null;
  return scoreFormat(sourceKeyOfUnit(unit), sample ?? null);
}

interface ScoreDetailRow {
  snapshot_id: string;
  source_rank: number | null;
  source_model_name: string | null;
  configuration_label: string | null;
  selection_reason: string | null;
  metadata: Record<string, unknown>;
}

export async function loadModel(slug: string, asOf: Date | null = null, lang: LeaderboardLanguage = "zh"): Promise<LbModelDetail | null> {
  const view = await runView(asOf);
  if (!view.pageSlugs.has(slug)) return null;
  const m = view.models.get(slug);
  if (!m) return null;
  const overall = view.boards.get("overall");
  const overallEntry = overall?.bySlug.get(slug) ?? null;

  const categories = LEADERBOARD_PUBLIC_BOARDS.filter((k) => k !== "overall").map((key) => {
    const e = view.boards.get(key)?.bySlug.get(slug);
    return {
      key,
      name: boardCopy(key, lang).name,
      rank: e?.rank ?? null,
      score: e?.score ?? null,
      sourceCount: e?.detail?.sourceCount ?? e?.metric_count ?? 0,
      onBoard: !!e && e.rank <= BOARD_LIMIT,
    };
  });

  // Evidence: every scored unit of the overall board this model has, grouped like the sources page.
  const units = overall ? Object.entries(overall.registry).filter(([unit, r]) => r.weight > 0 && overall.signals.get(unit)?.has(slug)) : [];
  const metas = units.map(([unit]) => view.evidence[`${unit}:${slug}`]).filter((e): e is EvidenceMeta => !!e);
  const details = metas.length
    ? await sql<ScoreDetailRow[]>`
        SELECT snapshot_id, source_rank, source_model_name, configuration_label, selection_reason, metadata
        FROM lb_scores WHERE model_id = ${m.id} AND snapshot_id = ANY(${[...new Set(metas.map((e) => e.snapshotId))]})`
    : [];
  const detailFor = (meta: EvidenceMeta | undefined) =>
    meta ? details.find((d) => d.snapshot_id === meta.snapshotId && d.metadata.configurationIdentity === meta.configuration) ?? null : null;

  const itemsBySource = new Map<string, LbEvidenceItem>();
  for (const [unit] of units) {
    const sourceKey = sourceKeyOfUnit(unit);
    const reg = registrySource(sourceKey, lang);
    const signal = overall!.signals.get(unit)!.get(slug)!;
    const meta = view.evidence[`${unit}:${slug}`];
    const detail = detailFor(meta);
    const format = signalFormat(unit, overall!);
    // LiveBench pairs keep their published order ("Language + IF").
    const order = String(detail?.metadata.categories ?? "").split(" + ");
    const components = Object.entries(detail?.metadata ?? {})
      .filter(([k]) => k.startsWith("livebenchCategoryScore:"))
      .map(([k, v]) => ({ label: k.slice("livebenchCategoryScore:".length), display: formatScore(Number(v), "percent") }))
      .sort((a, b) => order.indexOf(a.label) - order.indexOf(b.label));
    itemsBySource.set(sourceKey, {
      sourceKey,
      sourceName: reg?.source.name ?? sourceKey,
      brand: reg ? sourceBrand(reg.source) : null,
      officialUrl: reg?.source.officialUrl ?? null,
      usage: usageLabel(reg?.source.status, lang),
      display: formatScore(signal.score, format),
      displayNote: reg?.source.components?.label ?? null,
      sourceRank: detail?.source_rank ?? null,
      sourceModelName: detail?.source_model_name ?? null,
      configurationLabel: configurationLabel(detail?.configuration_label ?? null, lang),
      selectionReason: selectionReason(detail?.selection_reason ?? null, lang),
      upstreamAt: meta?.publishedAt ?? null,
      verifiedAt: meta?.verifiedAt ?? null,
      measuredAt: meta?.evaluatedAt ?? null,
      carriedForward: meta?.carriedForward ?? false,
      components,
      componentsNote: components.length ? reg?.source.components?.note ?? null : null,
    });
  }
  const evidence: LbEvidenceGroup[] = sourceGroups(lang).map((g) => ({
    key: g.key,
    name: g.name,
    items: g.sources.map((s) => itemsBySource.get(s.key)).filter((i): i is LbEvidenceItem => !!i),
  })).filter((g) => g.items.length > 0);
  const scoredSources = new Set(overall ? Object.entries(overall.registry).filter(([, r]) => r.weight > 0).map(([u]) => sourceKeyOfUnit(u)) : []);
  const unmeasured = [...scoredSources]
    .filter((k) => !itemsBySource.has(k))
    .map((k) => ({ key: k, name: registrySource(k, lang)?.source.name ?? k }));

  return {
    run: runInfo(view.info, lang),
    model: { ...modelRef(view, m), contextWindowTokens: m.context_window_tokens },
    price: view.prices.get(m.id) ?? null,
    overall: {
      rank: overallEntry?.rank ?? null,
      score: overallEntry?.score ?? null,
      onBoard: !!overallEntry && overallEntry.rank <= BOARD_LIMIT,
      confidence: overallEntry ? confidenceOf(overallEntry) : null,
      stability: overallEntry?.detail?.stability ?? null,
    },
    categories,
    metricCount: itemsBySource.size,
    evidence,
    unmeasured,
    comparisons: overall && overallEntry ? nearbyComparisons(view, overall, slug, overallEntry.rank, lang) : [],
  };
}

function nearbyComparisons(view: RunView, board: BoardView, slug: string, rank: number, lang: LeaderboardLanguage): LbComparison[] {
  const raw = board.comparisons[slug] ?? [];
  const ranked = raw
    .map((c) => ({ c, other: board.bySlug.get(c.slug) }))
    .filter((x): x is { c: ComparisonRaw; other: RankingRow & { slug: string } } => !!x.other)
    .sort((a, b) => Math.abs(a.other.rank - rank) - Math.abs(b.other.rank - rank) || a.other.rank - b.other.rank)
    .slice(0, 5);
  return ranked.map(({ c, other }) => {
    const om = view.modelsById.get(other.model_id)!;
    const rows = Object.entries(board.registry)
      .filter(([unit, r]) => r.weight > 0 && board.signals.get(unit)?.has(slug) && board.signals.get(unit)?.has(c.slug))
      .map(([unit, r]) => {
        const rowsOf = board.signals.get(unit)!;
        const format = signalFormat(unit, board);
        const sourceKey = sourceKeyOfUnit(unit);
        const reg = registrySource(sourceKey, lang);
        return {
          sourceKey,
          sourceName: reg?.source.name ?? sourceKey,
          officialUrl: reg?.source.officialUrl ?? null,
          mine: formatScore(rowsOf.get(slug)!.score, format),
          theirs: formatScore(rowsOf.get(c.slug)!.score, format),
          weight: r.weight,
        };
      });
    const order = new Map(SOURCE_GROUPS.flatMap((g) => g.sources.map((s) => s.key)).map((k, i) => [k, i]));
    rows.sort((a, b) => (order.get(a.sourceKey) ?? 999) - (order.get(b.sourceKey) ?? 999));
    return {
      model: modelRef(view, om),
      rank: other.rank,
      net: c.net,
      sharedWeight: c.shared,
      sharedCount: rows.length,
      hasPage: view.pageSlugs.has(c.slug),
      rows,
    };
  });
}

function sourceSummary(view: RunView, key: string, lang: LeaderboardLanguage): LbSourceSummary | null {
  const reg = registrySource(key, lang);
  if (!reg) return null;
  const s = reg.source;
  const counts = s.status === "ranked" || s.status === "awaiting";
  return {
    key: s.key,
    name: s.name,
    operator: s.operator,
    description: s.description,
    status: s.status,
    brand: sourceBrand(s),
    budget: counts ? view.sourceWeights.get(s.key) ?? null : null,
    effectiveBudget: counts ? view.sourceSaturation.get(s.key)?.effectiveWeight ?? null : null,
    saturated: view.sourceSaturation.get(s.key)?.saturated ?? false,
    spreadPp: view.sourceSaturation.get(s.key)?.spreadPp ?? null,
  };
}

export async function loadSources(lang: LeaderboardLanguage = "zh"): Promise<LbSourcesResponse> {
  const view = await runView();
  const groups = sourceGroups(lang).map((g) => ({
    key: g.key,
    name: g.name,
    blurb: g.blurb,
    lineage: g.lineage ?? [],
    sources: g.sources.map((s) => sourceSummary(view, s.key, lang)!),
  }));
  const all = groups.flatMap((g) => g.sources);
  return { run: runInfo(view.info, lang), rankedCount: all.filter((s) => s.status === "ranked").length, totalCount: all.length, groups };
}

const PUBLIC_ROW_STATUSES = new Set(["ranked", "cross_reference", "reference_only"]);

export async function loadSource(key: string, lang: LeaderboardLanguage = "zh"): Promise<LbSourceDetail | null> {
  const reg = registrySource(key, lang);
  if (!reg) return null;
  const view = await runView();
  const summary = sourceSummary(view, key, lang)!;
  const s = reg.source;

  const snapshots = await sql<{ id: string; published_at: Date | null; fetched_at: Date; metadata: Record<string, unknown> }[]>`
    SELECT id, published_at, fetched_at, metadata FROM lb_snapshots WHERE source_key = ${key}
    ORDER BY (id = ANY(${view.snapshotIds})) DESC, fetched_at DESC LIMIT 1`;
  const snapshot = snapshots[0] ?? null;
  const showRows = !!snapshot && PUBLIC_ROW_STATUSES.has(s.status);

  let rows: LbSourceRow[] = [];
  if (showRows) {
    const scoreRows = await sql<{ source_rank: number | null; source_model_name: string | null; raw_score: number | null; configuration_label: string | null; model_id: string; slug: string; name: string; provider: string | null; metadata: Record<string, unknown> }[]>`
      SELECT c.source_rank, c.source_model_name, c.raw_score, c.configuration_label, c.model_id, m.slug, m.name, m.provider, c.metadata
      FROM lb_scores c JOIN lb_models m ON m.id = c.model_id
      WHERE c.snapshot_id = ${snapshot.id} ${s.allRows ? sql`` : sql`AND c.selected_for_product`}
      ORDER BY c.source_rank NULLS LAST, c.raw_score DESC NULLS LAST
      LIMIT ${BOARD_LIMIT}`;
    const sample = scoreRows.find((r) => r.raw_score != null)?.raw_score ?? null;
    const format = scoreFormat(key, sample);
    rows = scoreRows.map((r) => ({
      sourceRank: r.source_rank,
      sourceModelName: r.source_model_name ?? r.name,
      provider: r.provider === "其他" ? null : r.provider,
      display: formatScore(r.raw_score, format),
      configurationLabel: configurationLabel(r.configuration_label, lang),
      modelSlug: view.pageSlugs.has(r.slug) ? r.slug : null,
    }));
  }
  const lastSeen = typeof snapshot?.metadata.lastSeenAt === "string" ? snapshot.metadata.lastSeenAt : null;
  return {
    run: runInfo(view.info, lang),
    source: {
      ...summary,
      fullName: s.fullName ?? s.name,
      area: s.area ?? null,
      group: { key: reg.group.key, name: reg.group.name },
      officialUrl: s.officialUrl,
      what: s.what,
      usage: s.usage,
      limits: s.limits,
      license: s.license,
      attribution: s.attribution?.replaceAll("{{siteName}}", SITE.name) ?? (lang === "en"
        ? `Results are published by ${s.operator}. Raw scores and the ${SITE.name} consensus index use different scales and cannot be added directly.`
        : `成绩由 ${s.operator} 发布，原始分数与 ${SITE.name} 共识分使用不同尺度，不能直接相加。`),
    },
    upstreamAt: showRows ? snapshot.published_at?.toISOString() ?? null : null,
    syncedAt: showRows ? lastSeen ?? snapshot.fetched_at.toISOString() : null,
    collected: showRows,
    rows,
    systemRows: !!s.allRows,
    rowsNote: showRows ? rowsNote(!!s.allRows, lang) : null,
  };
}

export interface LbRulesData {
  run: LbRunInfo;
  budgets: Array<{ key: string; name: string; weight: number; sources: string[] }>;
  anchors: string[];
}

/** Budget table and anchors for the rules page, straight from the run. */
export async function loadRulesData(lang: LeaderboardLanguage = "zh"): Promise<LbRulesData> {
  const view = await runView();
  const run = await sql<{ summary: any }[]>`SELECT summary FROM lb_runs WHERE id = ${view.info.id}`;
  const sources = (run[0]?.summary?.sources ?? []) as Array<{ key: string; evidenceBudgetKey: string }>;
  const order = SOURCE_GROUPS.flatMap((g) => g.sources.map((s) => s.key));
  const budgets = view.budgets.map((b) => ({
    ...b,
    name: budgetName(b.key, b.name, lang),
    sources: sources
      .filter((s) => s.evidenceBudgetKey === b.key)
      .sort((a, c) => order.indexOf(a.key) - order.indexOf(c.key))
      .map((s) => registrySource(s.key, lang)?.source.name ?? s.key),
  }));
  return { run: runInfo(view.info, lang), budgets, anchors: view.anchors };
}

function pricingRow(view: RunView, m: ModelRow, price: LbPrice): LbPricingRow {
  const rate = view.info.fx?.rate ?? null;
  const toUsd = (v: number | null) => (v == null ? null : price.currency === "USD" ? v : rate ? v / rate : null);
  const entry = view.boards.get("overall")?.bySlug.get(m.slug);
  return {
    model: modelRef(view, m),
    rank: entry && entry.rank <= BOARD_LIMIT ? entry.rank : null,
    hasPage: view.pageSlugs.has(m.slug),
    price,
    usd: { input: toUsd(price.input), output: toUsd(price.output), cached: toUsd(price.cached) },
  };
}

/** Official prices of every model in the latest run, in USD per million tokens, cheapest input first. */
export async function loadPricing(lang: LeaderboardLanguage = "zh"): Promise<LbPricingResponse> {
  const view = await runView();
  const rows: LbPricingRow[] = [];
  for (const [modelId, price] of view.prices) {
    const m = view.modelsById.get(modelId);
    if (m) rows.push(pricingRow(view, m, price));
  }
  const ascending = (a: number | null, b: number | null) => (a === b ? 0 : a === null ? 1 : b === null ? -1 : a - b);
  rows.sort((a, b) => ascending(a.usd.input, b.usd.input) || ascending(a.usd.output, b.usd.output) || a.model.name.localeCompare(b.model.name, "en"));
  const verified = rows.map((r) => r.price.verifiedOn).filter((d): d is string => !!d).sort();
  return { run: runInfo(view.info, lang), verifiedOn: verified.at(-1) ?? null, rows, featured: featuredSlugs(view) };
}

/** How many of the overall board's best priced models get indexable comparison pages with each other. */
export const COMPARE_TOP = 15;

/** A priced model's row, when both its input and output convert to USD. */
function comparable(view: RunView, slug: string): { m: ModelRow; row: LbPricingRow } | null {
  const m = view.models.get(slug);
  const price = m && view.prices.get(m.id);
  if (!m || !price) return null;
  const row = pricingRow(view, m, price);
  return row.usd.input !== null && row.usd.output !== null ? { m, row } : null;
}

export function featuredSlugs(view: RunView): string[] {
  return (view.boards.get("overall")?.entries ?? [])
    .filter((e) => e.rank <= BOARD_LIMIT && comparable(view, e.slug))
    .slice(0, COMPARE_TOP)
    .map((e) => e.slug);
}

/** The models with a page in the latest run, with their overall rank and USD prices when priced. */
export async function pageModels(): Promise<{ view: RunView; models: LbStoryModels["models"] }> {
  const view = await runView();
  const models = [...view.pageSlugs].flatMap((slug) => {
    const m = view.models.get(slug);
    if (!m) return [];
    const price = view.prices.get(m.id);
    const row = price ? pricingRow(view, m, price) : null;
    const entry = view.boards.get("overall")?.bySlug.get(slug);
    return [{ model: modelRef(view, m), rank: entry && entry.rank <= BOARD_LIMIT ? entry.rank : null, usd: row?.usd ?? null }];
  });
  return { view, models };
}

export const comparePair = (a: string, b: string) => [a, b].sort().join("-vs-");

/** Every indexable comparison page, for the sitemap. */
export async function comparePairs(): Promise<string[]> {
  const featured = featuredSlugs(await runView());
  return featured.flatMap((a, i) => featured.slice(i + 1).map((b) => comparePair(a, b)));
}

/** Two priced models side by side; `pair` may name them in either order. Null unless both have USD prices. */
export async function loadComparison(pair: string, lang: LeaderboardLanguage = "zh"): Promise<LbCompareResponse | null> {
  const view = await runView();
  // A slug may itself contain "-vs-": try each split.
  let found: [NonNullable<ReturnType<typeof comparable>>, NonNullable<ReturnType<typeof comparable>>] | null = null;
  for (let at = pair.indexOf("-vs-"); at > 0 && !found; at = pair.indexOf("-vs-", at + 1)) {
    const a = comparable(view, pair.slice(0, at));
    const b = comparable(view, pair.slice(at + 4));
    if (a && b && a.m.slug !== b.m.slug) found = [a, b];
  }
  if (!found) return null;
  found.sort((x, y) => (x.m.slug < y.m.slug ? -1 : 1));
  const featured = featuredSlugs(view);
  const tabs = boardTabs(lang);
  const side = ({ m, row }: (typeof found)[number], other: string): LbCompareSide => ({
    row,
    contextWindowTokens: m.context_window_tokens,
    boards: tabs.map((t) => {
      const e = view.boards.get(t.key)?.bySlug.get(m.slug);
      return { ...t, rank: e && e.rank <= BOARD_LIMIT ? e.rank : null };
    }),
    related: featured.includes(m.slug)
      ? featured.filter((s) => s !== m.slug && s !== other).map((s) => ({ pair: comparePair(m.slug, s), model: modelRef(view, view.models.get(s)!) }))
      : [],
  });
  return {
    run: runInfo(view.info, lang),
    pair: comparePair(found[0].m.slug, found[1].m.slug),
    featured: featured.includes(found[0].m.slug) && featured.includes(found[1].m.slug),
    sides: [side(found[0], found[1].m.slug), side(found[1], found[0].m.slug)],
  };
}

/** Public leaderboard URLs for the sitemap. */
export async function leaderboardUrls(): Promise<string[]> {
  try {
    const view = await runView();
    return [
      "/leaderboard",
      ...LEADERBOARD_PUBLIC_BOARDS.filter((k) => k !== "overall").map((k) => `/leaderboard/category/${k}`),
      "/leaderboard/sources",
      "/leaderboard/rules",
      ...SOURCE_GROUPS.flatMap((g) => g.sources.map((s) => `/leaderboard/sources/${s.key}`)),
      ...[...view.pageSlugs].map((slug) => `/leaderboard/${slug}`),
    ];
  } catch {
    return [];
  }
}
