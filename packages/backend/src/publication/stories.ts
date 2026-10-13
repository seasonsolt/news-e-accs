// Stories (events) and the hot ranking through the public read layer. The website sees heat values;
// v1 and MCP only see ranks and counts.
import type { HeatPoint, HotResponse, StoryDetail, StoryReportView } from "@aihot/contracts/site";
import { SITE } from "@aihot/site";
import { HEADER_SOURCE_LANGUAGE } from "./items.ts";
import { serverModules } from "../modules.ts";
import { sql } from "../db.ts";
import { cachedByKey, SHARED_ONLY } from "../lib/cache.ts";
import { proxiedImage, proxiedImageSet } from "../media/imgproxy.ts";
import { behindSources, currentSignals, heatSeries, sourceClocks, type HotRanking } from "../events/hot.ts";
import { relatedEvidence, RELATED_MIN_REPORTS } from "../events/related.ts";
import { pickRepresentative, REPRESENTATIVE_COLUMNS, type RepresentativeIdentity } from "./representative.ts";
import { compositeCondition, evidenceCondition, listedCondition, storyReportCondition } from "./scope.ts";
import { publicSourceName } from "./rules.ts";
import { hotRankingAt, latestHotRanking, rankingExtras } from "./hot.ts";
export { loadHotStrip } from "./hot.ts";
import { storyTexts, type StoryText } from "./story-text.ts";
import { topicsOfStory } from "./topics.ts";
import { itemUrl, storyUrl, v1StoryApiUrl, v1StoryUrl } from "./links.ts";

export type StoryLookup = { kind: "found"; storyId: number; publicId: string } | { kind: "merged"; target: string } | { kind: "not_found" };

function storyStatusFor(latestAt: Date | null, now: number): "active" | "watching" | "settled" {
  if (!latestAt) return "settled";
  const age = now - latestAt.getTime();
  if (age < 24 * 3600 * 1000) return "active";
  if (age < 72 * 3600 * 1000) return "watching";
  return "settled";
}

export async function resolveStory(publicId: string): Promise<StoryLookup> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(publicId)) return { kind: "not_found" };
  const [s] = await sql<{ id: number; merged_into: number | null }[]>`SELECT id, merged_into FROM stories WHERE public_id = ${publicId}`;
  let targetId: number | null = s ? (s.merged_into ?? null) : null;
  if (!s) {
    const [alias] = await sql<{ story_id: number }[]>`SELECT story_id FROM story_aliases WHERE public_id = ${publicId}`;
    if (!alias) return { kind: "not_found" };
    targetId = alias.story_id;
  }
  if (targetId) {
    // Follow merge chains to the surviving story.
    for (let i = 0; i < 10; i++) {
      const rows: Array<{ id: number; public_id: string; merged_into: number | null }> = await sql`SELECT id, public_id::text, merged_into FROM stories WHERE id = ${targetId}`;
      const t = rows[0];
      if (!t) return { kind: "not_found" };
      if (!t.merged_into) return { kind: "merged", target: t.public_id };
      targetId = t.merged_into;
    }
    return { kind: "not_found" };
  }
  return { kind: "found", storyId: s!.id, publicId };
}

interface ReportRow extends RepresentativeIdentity {
  role: string;
  body_mode: "full" | "summary";
  score: number | null;
  timeline_at: Date;
  id: string;
  title: string;
  summary: string | null;
  url: string;
  selected: boolean;
  at: Date;
  source_id: string;
  source_name: string;
  first_party: boolean;
  header_source_language: string;
  fact_id: number;
}

/**
 * Every report linked to the story's facts that has a public page (rules.hasItemPage: editorial source,
 * summarised or not), mentions included (an article's other events). New grouping only links
 * pool-eligible articles; imported hot stories also carry reports the pool leaves out. hot_signal
 * material only adds heat and is not listed.
 */
async function storyReports(storyIds: number[], now: Date): Promise<Array<ReportRow & { story_id: number }>> {
  return sql<Array<ReportRow & { story_id: number }>>`
    SELECT DISTINCT ON (f.story_id, p.article_id) f.story_id, p.article_id AS id, p.title, p.summary, p.url, p.selected,
      coalesce(p.published_at, p.discovered_at) AS at, s.id AS source_id, s.name AS source_name,
      (s.tier = 'T1') AS first_party, f.id AS fact_id, ${HEADER_SOURCE_LANGUAGE} AS header_source_language,
      CASE WHEN ${compositeCondition()} THEN 'mention' ELSE fa.role END AS role, p.body_mode, p.score, p.timeline_at, ${REPRESENTATIVE_COLUMNS}
    FROM facts f JOIN fact_articles fa ON fa.fact_id = f.id JOIN publications p ON p.article_id = fa.article_id
    JOIN sources s ON s.id = p.source_id
    JOIN articles a ON a.id = p.article_id LEFT JOIN analyses an ON an.id = p.analysis_id
    WHERE f.story_id = ANY(${storyIds}::bigint[]) AND ${storyReportCondition(now)}
    ORDER BY f.story_id, p.article_id, (fa.role = 'primary') DESC, (fa.role <> 'mention') DESC, f.id`;
}

function reportView(r: ReportRow): StoryReportView {
  return {
    id: r.id,
    title: r.title,
    summary: r.summary,
    source: { name: publicSourceName(r.source_name), firstParty: r.first_party },
    publishedAt: r.at.toISOString(),
    selected: r.selected,
  };
}

/** The story's reports newest first, its developments, and its latest and first non-mention reports. */
async function storyContent(storyId: number, now: Date) {
  return (await storyContents([storyId], now)).get(storyId) ?? null;
}

/**
 * storyContent for several stories with one read of each kind, so a page that names many stories
 * (the hot list, a timeline) pays for its queries once rather than once per story. Stories without
 * public reports are absent from the result.
 */
async function storyContents(storyIds: number[], now: Date) {
  const contents = new Map<number, NonNullable<ReturnType<typeof contentOf>>>();
  if (storyIds.length === 0) return contents;
  const stories = await sql<{ id: number; editorial_language: "en" | "zh"; public_id: string; title: string; summary_language: string }[]>`
    SELECT id, editorial_language, public_id::text, title, coalesce(frame->>'summaryLanguage', editorial_language) AS summary_language
    FROM stories WHERE id = ANY(${storyIds}::bigint[])`;
  if (stories.length === 0) return contents;
  const ids = stories.map((s) => s.id);
  const [reportRows, factRows] = await Promise.all([
    storyReports(ids, now),
    sql<{ id: number; story_id: number; public_id: string; title: string; editorial_language: "en" | "zh" }[]>`
      SELECT id, story_id, public_id, title, editorial_language FROM facts WHERE story_id = ANY(${ids}::bigint[])`,
  ]);
  const reportsOf = groupBy(reportRows, (r) => r.story_id);
  const factsOf = groupBy(factRows, (f) => f.story_id);
  const withReports = stories.filter((s) => reportsOf.get(s.id)?.some((r) => r.role !== "mention"));
  const texts = await storyTexts(withReports.map((s) => s.id), now);
  for (const s of withReports) {
    const content = contentOf(s, reportsOf.get(s.id)!, factsOf.get(s.id) ?? [], texts.get(s.id)!);
    if (content) contents.set(s.id, content);
  }
  return contents;
}

function groupBy<T>(rows: readonly T[], key: (row: T) => number): Map<number, T[]> {
  const groups = new Map<number, T[]>();
  for (const row of rows) {
    const group = groups.get(key(row));
    if (group) group.push(row);
    else groups.set(key(row), [row]);
  }
  return groups;
}

function contentOf(
  s: { editorial_language: "en" | "zh"; public_id: string; title: string; summary_language: string },
  reports: ReportRow[],
  facts: Array<{ id: number; public_id: string; title: string; editorial_language: "en" | "zh" }>,
  text: StoryText,
) {
  reports.sort((a, b) => b.at.getTime() - a.at.getTime() || a.id.localeCompare(b.id));

  const primaryReports = reports.filter((r) => r.role !== "mention");
  const byFact = new Map<number, ReportRow[]>();
  for (const r of primaryReports) byFact.set(r.fact_id, [...(byFact.get(r.fact_id) ?? []), r]);
  const developments = facts
    .filter((f) => byFact.has(f.id))
    .map((f) => {
      const members = byFact.get(f.id)!;
      const selected = members.filter((r) => r.selected);
      const rep = pickRepresentative(selected.length ? selected : members);
      const first = members.reduce((m, r) => (r.at < m ? r.at : m), members[0]!.at);
      return { factId: f.public_id, editorialLanguage: f.editorial_language, title: f.title, firstReportAt: first.toISOString(), reportCount: members.length, representative: rep };
    })
    .sort((a, b) => Date.parse(b.firstReportAt) - Date.parse(a.firstReportAt));

  const latestReport = primaryReports[0];
  if (!latestReport) return null;
  const firstReportAt = primaryReports[primaryReports.length - 1]!.at;
  // Historical stories without listed evidence retain their latest readable report.
  const latest = text.latest ?? latestReport;
  const origin = developments[developments.length - 1]?.representative;
  // Without a digest or a summary of its own, the story opens with its first development's representative report.
  const excerpt = !text.digest && !text.summary && origin?.summary ? origin : null;

  // A converted digest does not convert historical summaries, fact titles or the latest title. Keep their
  // provenance in the canonical edition identity so a stored edition can repair the remaining prose.
  const languages = new Set([
    s.editorial_language, ...(text.summary ? [s.summary_language] : []),
    ...developments.map((d) => d.editorialLanguage), ...(excerpt ? [excerpt.header_source_language] : []),
    reports.find((r) => r.id === latest.id)?.header_source_language ?? "unknown",
  ]);
  const sourceLanguage = languages.size === 1 ? s.editorial_language : "unknown";
  return { s, reports, primaryReports, developments, latestReport, firstReportAt, text, latest, excerpt, sourceLanguage };
}

/** Only the prose that identifies an edition; uses the same reports, facts and evidence as story detail. */
export async function loadStoryProse(storyId: number, now = new Date()) {
  const content = await storyContent(storyId, now);
  return content ? proseOf(content) : null;
}

/** loadStoryProse for several stories at once; stories without public reports are absent. */
export async function loadStoriesProse(storyIds: number[], now = new Date()) {
  const contents = await storyContents(storyIds, now);
  return new Map([...contents].map(([id, content]) => [id, proseOf(content)]));
}

function proseOf({ s, developments, text, latest, excerpt, sourceLanguage }: NonNullable<ReturnType<typeof contentOf>>) {
  return {
    publicId: s.public_id, editorialLanguage: s.editorial_language,
    contentLanguage: { requested: s.editorial_language, status: "original" as const, sourceLanguage, language: sourceLanguage },
    title: s.title, summary: text.summary, digest: text.digest, latest: latest.title,
    excerpt: excerpt ? { text: excerpt.summary!, sourceName: publicSourceName(excerpt.source_name) } : null,
    developments: developments.map((d) => ({ title: d.title })),
  };
}

async function relatedStories(storyId: number, now: Date) {
  return sql<{ public_id: string; title: string; relation: "storyline" | "related" }[]>`
    SELECT st.public_id::text, st.title, l.relation FROM story_links l JOIN stories st ON st.id = l.other_id
    LEFT JOIN LATERAL (
      SELECT count(*) FILTER (WHERE valid) AS reports, bool_and(valid) AS unchanged
      FROM ${relatedEvidence(sql`l.story_id`, sql`l.other_id`, now)} evidence
    ) support ON l.relation = 'related'
    WHERE l.story_id = ${storyId} AND st.merged_into IS NULL
      AND (l.relation <> 'related' OR support.unchanged IS NOT FALSE OR support.reports >= ${RELATED_MIN_REPORTS})
      AND EXISTS (
      SELECT 1 FROM facts f JOIN fact_articles fa ON fa.fact_id = f.id JOIN publications p ON p.article_id = fa.article_id
      JOIN sources s ON s.id = p.source_id
      WHERE f.story_id = st.id AND ${evidenceCondition()} AND ${storyReportCondition(now)}
    ) ORDER BY st.latest_at DESC NULLS LAST, st.id DESC LIMIT 8`;
}

export async function loadStoryDetail(storyId: number, now = new Date()): Promise<StoryDetail | null> {
  const content = await storyContent(storyId, now);
  if (!content) return null;
  const { s, reports, developments, firstReportAt, text, latest, excerpt, sourceLanguage } = content;
  const [why] = await sql<{ p48: number; p6: number; r24: number }[]>`
    WITH cs AS (SELECT * FROM ${currentSignals()} c WHERE story_id = ${storyId} AND observed_at <= ${now})
    SELECT count(DISTINCT participant_key) FILTER (WHERE observed_at > ${now}::timestamptz - interval '48 hours') AS p48,
           count(DISTINCT participant_key) FILTER (WHERE observed_at > ${now}::timestamptz - interval '6 hours'
             AND participant_key NOT IN (SELECT participant_key FROM cs x WHERE x.observed_at <= ${now}::timestamptz - interval '6 hours')) AS p6,
           count(*) FILTER (WHERE kind = 'editorial' AND observed_at > ${now}::timestamptz - interval '24 hours') AS r24
    FROM cs`;
  const ranking = await latestHotRanking();
  const entry = ranking?.entries.find((e) => e.storyId === storyId) ?? null;
  // Only hours observed in full are drawn (the chart leaves a gap otherwise), over one comparable group.
  const heat = await heatSeries(storyId, now);
  // Complete when none of the sources behind the last 48 hours' participants is behind on collection.
  const behind = behindSources(await sourceClocks(), now.getTime(), true);
  const [partial] = behind.length
    ? await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM ${currentSignals()} cs WHERE story_id = ${storyId} AND source_id = ANY(${behind}::text[])
                                  AND observed_at > ${now}::timestamptz - interval '48 hours' AND observed_at <= ${now}`
    : [{ n: 0 }];
  const [related, topics] = await Promise.all([relatedStories(storyId, now), topicsOfStory(storyId, now)]);
  const latestAt = latest.at;
  const modules = Object.fromEntries(await Promise.all(serverModules().filter((m) => m.storyPage).map(async (m) => [m.name, await m.storyPage!(storyId)])));
  return {
    modules,
    editorialLanguage: s.editorial_language,
    contentLanguage: { requested: s.editorial_language, status: "original", sourceLanguage, language: sourceLanguage },
    publicId: s.public_id,
    title: s.title,
    status: storyStatusFor(latestAt, now.getTime()),
    reportCount: reports.length,
    sourceCount: new Set(reports.map((r) => r.source_id)).size,
    firstReportAt: firstReportAt.toISOString(),
    latestAt: latestAt.toISOString(),
    digest: text.digest,
    digestUpdatedAt: text.digestUpdatedAt?.toISOString() ?? null,
    summary: text.summary,
    excerpt: excerpt ? { text: excerpt.summary!, sourceName: publicSourceName(excerpt.source_name) } : null,
    latest: latest.title,
    latestReport: { id: latest.id },
    whyHot: {
      participants48h: Number(why?.p48 ?? 0),
      newParticipants6h: Number(why?.p6 ?? 0),
      recentReports24h: Number(why?.r24 ?? 0),
      observationComplete: !partial?.n,
      rank: entry?.rank ?? null,
    },
    developments: developments.map((d) => ({ ...d, representative: reportView(d.representative) })),
    officialReports: reports.filter((r) => r.role !== "mention" && r.first_party).slice(0, 12).map(reportView),
    timeline: reports.slice(0, 100).map(reportView),
    heat: heat.map((h): HeatPoint => ({ hour: h.hour.toISOString(), heat: Number(h.heat), participants: h.participants })),
    related: related.map((r) => ({ publicId: r.public_id, title: r.title, relation: r.relation })),
    topics,
  };
}

const SPARK_HOURS = 24;

/** Hourly heat of the ranked stories over the day before the ranking, one slot per hour. */
async function sparklines(storyIds: number[], at: Date): Promise<Map<number, Array<number | null>>> {
  const end = Math.floor(at.getTime() / 3600000) * 3600000;
  const start = end - SPARK_HOURS * 3600000;
  const rows = storyIds.length
    ? await sql<{ story_id: number; hour: Date; heat: string }[]>`
        SELECT story_id, hour, heat FROM story_heat_hourly
        WHERE story_id = ANY(${storyIds}::bigint[]) AND complete AND hour >= ${new Date(start)} AND hour <= ${new Date(end)}`
    : [];
  const out = new Map<number, Array<number | null>>(storyIds.map((id) => [id, Array.from({ length: SPARK_HOURS + 1 }, () => null)]));
  for (const r of rows) {
    const slot = Math.round((r.hour.getTime() - start) / 3600000);
    const line = out.get(Number(r.story_id));
    if (line && slot >= 0 && slot <= SPARK_HOURS) line[slot] = Number(r.heat);
  }
  return out;
}

// Shared by concurrent readers of a ranking, but read again each time: a cover's visibility and licence
// follow publication changes.
const hotCovers = cachedByKey((ranking: HotRanking) => String(ranking.id), (ranking: HotRanking) => queryHotCovers(ranking), { ...SHARED_ONLY, maxKeys: 4 });

/** A picture per story from its public full-text reports, the representative first, wide enough for a card. */
async function queryHotCovers({ entries }: HotRanking, at = new Date()) {
  const ids = entries.map((e) => e.storyId);
  const reps = entries.map((e) => e.representativeItemId).filter((id): id is string => !!id);
  const rows = await sql<{ story_id: number; m: { url: string; width?: number; height?: number } }[]>`
    SELECT DISTINCT ON (p.story_id) p.story_id, img.m
    FROM publications p JOIN articles a ON a.id = p.article_id
    CROSS JOIN LATERAL (
      SELECT m FROM jsonb_array_elements(coalesce(a.media, '[]'::jsonb)) m
      WHERE m->>'kind' = 'image' AND coalesce((m->>'width')::numeric, 800) >= 480 LIMIT 1
    ) img
    WHERE p.story_id = ANY(${ids}::bigint[]) AND ${listedCondition(at)} AND p.body_mode <> 'summary'
    ORDER BY p.story_id, (p.article_id::text = ANY(${reps}::text[])) DESC, p.first_party DESC, p.selected DESC, coalesce(p.score, 0) DESC, p.article_id`;
  const covers = new Map(rows.map((c) => [Number(c.story_id), { url: c.m.url, width: typeof c.m.width === "number" ? c.m.width : null, height: typeof c.m.height === "number" ? c.m.height : null }]));
  return covers;
}

/** The hot list; `asOf` (the time machine) reads the last ranking computed by then instead of the latest. */
export async function loadHot(asOf: Date | null = null): Promise<HotResponse> {
  const ranking = asOf ? await hotRankingAt(asOf) : await latestHotRanking();
  if (!ranking) return { computedAt: null, windowHours: 48, entries: [] };
  const at = new Date(ranking.computedAt);
  const [sparks, covers, extras] = await Promise.all([
    sparklines(
      ranking.entries.map((e) => e.storyId),
      at,
    ),
    // A past ranking shows the pictures of reports released by then, and is not kept.
    asOf ? queryHotCovers(ranking, at) : hotCovers(ranking),
    rankingExtras(ranking),
  ]);
  return {
    computedAt: ranking.computedAt,
    windowHours: 48,
    entries: ranking.entries.map((e) => {
      const picture = covers.get(e.storyId);
      const coverUrl = picture ? proxiedImage(picture.url, "full") : null;
      const text = extras.text(e);
      // The card clips its text to a few lines; complete public words belong to the event page.
      const summary = text.summary ? Array.from(text.summary) : null;
      return {
        rank: e.rank,
        story: { publicId: e.storyPublicId, title: e.title },
        heat: e.heat,
        trend: e.trend,
        trendPct: e.trendPct,
        badges: e.badges,
        participantCount: e.participantCount,
        sourceCount: e.sourceCount,
        sourceNames: [...new Set(e.sourceNames.map(publicSourceName))],
        participants: extras.participants(e),
        spark: sparks.get(e.storyId) ?? [],
        summary: summary && summary.length > 480 ? summary.slice(0, 480).join('') + '…' : text.summary,
        latest: text.latest,
        cover: picture && coverUrl ? { url: coverUrl, srcSet: proxiedImageSet(picture.url, "hero") ?? undefined, width: picture.width, height: picture.height } : null,
      };
    }),
  };
}

// v1 shapes (ranks and counts only; no heat values)

export async function v1HotTopics() {
  const ranking = await latestHotRanking();
  const items = (ranking?.entries ?? []).map((e) => {
    const links = {
      aihot: e.representativeItemId ? itemUrl(e.representativeItemId) : storyUrl(e.storyPublicId),
      original: e.representativeUrl ?? storyUrl(e.storyPublicId),
      story: v1StoryUrl(e.storyPublicId),
    };
    return {
      rank: e.rank,
      id: e.representativeItemId ?? e.storyPublicId,
      title: e.title,
      source: { name: e.representativeSource ?? e.sourceNames[0] ?? SITE.name },
      links,
      sourceCount: e.sourceCount,
      signalCount: e.signalCount,
      participantCount: e.participantCount,
      sourceNames: e.sourceNames,
      latestAt: new Date(e.latestAt).toISOString(),
    };
  });
  return { schemaVersion: 1 as const, count: items.length, items };
}

export async function v1Story(storyId: number) {
  const now = new Date();
  const content = await storyContent(storyId, now);
  if (!content) return null;
  // The latest development and digest follow the same evidence as the website.
  const { s, reports, firstReportAt, text, latest } = content;
  const latestAt = latest.at;
  const neighbors = (await relatedStories(storyId, now)).map((r) => {
    const links = { aihot: storyUrl(r.public_id), api: v1StoryApiUrl(r.public_id) };
    return { publicId: r.public_id, title: r.title, relation: r.relation, links };
  });
  return {
    schemaVersion: 1 as const,
    story: {
      publicId: s.public_id,
      title: s.title,
      status: storyStatusFor(latestAt, now.getTime()) === "settled" ? ("settled" as const) : ("active" as const),
      sourceCount: new Set(reports.map((r) => r.source_id)).size,
      reportCount: reports.length,
      firstReportAt: firstReportAt.toISOString(),
      latestAt: latestAt.toISOString(),
      latest: latest.title,
      digest: text.digest,
      digestUpdatedAt: text.digestUpdatedAt?.toISOString() ?? null,
      links: { aihot: storyUrl(s.public_id) },
      reports: reports.slice(0, 50).map((r) => ({
        id: r.id,
        title: r.title,
        summary: r.summary,
        source: { name: publicSourceName(r.source_name), firstParty: r.first_party },
        publishedAt: r.at.toISOString(),
        links: { aihot: itemUrl(r.id), original: r.url },
      })),
      storyline: neighbors.filter((n) => n.relation === "storyline"),
      related: neighbors.filter((n) => n.relation === "related"),
    },
  };
}
