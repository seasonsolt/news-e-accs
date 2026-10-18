// Share images only need public title/summary metadata. Keep the same page visibility rule without
// loading bodies, translations, related stories or signed media that never appear on these cards.
import { beijingDate } from '@aihot/contracts/time';
import type { CategoryKey } from '@aihot/contracts/taxonomy';
import { ITEM_COPY, withSubject } from '@aihot/site';
import type { OgCard } from '../media/cards.ts';
import { localizePublication } from './content-language.ts';
import { distributionCategory, editionReady, type DistributionLanguage } from './distribution.ts';
import { sql } from '../db.ts';
import { HEADER_SOURCE_LANGUAGE } from './items.ts';
import { loadStoryProse } from './stories.ts';
import { latestHotRanking } from './hot.ts';
import { storyReportCondition } from './scope.ts';
import { hasItemPage, publicSourceName } from './rules.ts';

export async function loadItemShare(id: string, lang: DistributionLanguage = "en") {
  const [row] = await sql<{
    id: string; title: string; summary: string | null; category: CategoryKey | null; selected: boolean;
    editorial_language: "en" | "zh"; header_source_language: string; score: number | null; timeline_at: Date; source_name: string; source_mode: string; visibility: string;
  }[]>`SELECT p.article_id AS id, p.editorial_language, ${HEADER_SOURCE_LANGUAGE} AS header_source_language, p.title, p.summary, p.category, p.selected, p.score, p.timeline_at,
      s.name AS source_name, s.participation_mode AS source_mode, p.visibility
    FROM publications p JOIN sources s ON s.id = p.source_id JOIN articles a ON a.id=p.article_id
    LEFT JOIN analyses an ON an.id=p.analysis_id WHERE p.article_id = ${id}`;
  if (!row || !hasItemPage({ visibility: row.visibility, sourceMode: row.source_mode })) return null;
  const summaryOnly = row.visibility === 'summary-only';
  const dto = await localizePublication({ editorialLanguage: row.editorial_language,
    contentLanguage: { requested: lang, status: "original", sourceLanguage: row.header_source_language, language: row.header_source_language }, id: row.id, title: row.title, summary: row.summary,
    category: summaryOnly ? null : row.category, selected: !summaryOnly && row.selected,
    score: summaryOnly || row.score === null ? null : Math.round(Number(row.score)), timelineAt: row.timeline_at.toISOString(),
    source: { name: publicSourceName(row.source_name) } }, lang);
  return editionReady(dto, lang) ? dto : null;
}

/** The article card used by both HTTP responses and preparation before publishing a link. */
export async function loadItemOgCard(id: string, lang: DistributionLanguage = "en"): Promise<OgCard | null> {
  const item = await loadItemShare(id, lang);
  if (!item) return null;
  return {
    kicker: item.category ? distributionCategory(item.category, lang) : lang === "en" ? "AI news" : withSubject("动态"),
    title: item.title,
    subtitle: item.summary,
    meta: `${item.source.name} · ${beijingDate(item.timelineAt)}`,
    badge: item.selected && item.score !== null && ITEM_COPY.showScore ? { value: String(Math.round(item.score)), label: lang === "en" ? "Editorial score" : "精选评分" } : null,
  };
}

/** Event card metadata: canonical edition identity, counts and rank, without heat/related/topic/module details. */
export async function loadStoryOgCard(storyId: number, lang: DistributionLanguage = "en"): Promise<OgCard | null> {
  const source = await loadStoryProse(storyId);
  if (!source) return null;
  const story = await localizePublication(source, lang);
  if (!editionReady(story, lang)) return null;
  const [[counts], ranking] = await Promise.all([
    sql<{ sources: number; reports: number }[]>`
      SELECT count(DISTINCT p.source_id)::int AS sources, count(DISTINCT p.article_id)::int AS reports
      FROM facts f JOIN fact_articles fa ON fa.fact_id = f.id JOIN publications p ON p.article_id = fa.article_id
      JOIN sources s ON s.id = p.source_id
      WHERE f.story_id = ${storyId} AND ${storyReportCondition(new Date())}`,
    latestHotRanking(),
  ]);
  const rank = ranking?.entries.find((e) => e.storyId === storyId)?.rank ?? null;
  return {
    kicker: lang === "en" ? (rank ? `Hot topic #${rank}` : "Story") : (rank ? `热点第 ${rank} · 事件` : "事件"),
    title: story.title,
    subtitle: story.latest ?? story.digest,
    meta: lang === "en" ? `${counts!.sources} sources · ${counts!.reports} reports` : `${counts!.sources} 个来源 · ${counts!.reports} 篇报道`,
    accent: rank ? "hot" : "teal",
  };
}
