// The entries of a day's 公众号 column 「AI 早报」: the daily's Chinese edition, only once it and every
// entry it shows are in Chinese. The column carries at least
// WECHAT_MIN_ENTRIES entries; when the daily has fewer, the window's other public reports follow it,
// best scored first, from those the pipeline judged worth the selected write-up (SELECTION.understandFloor),
// one per event and none of an event this or the past week's dailies carried.
import type { ReportDetail } from "@aihot/contracts/site";
import { addDays } from "@aihot/contracts/time";
import { SELECTION } from "@aihot/industry/selection";
import { CATEGORIES } from "@aihot/industry/taxonomy";
import { sql } from "../db.ts";
import { localizePublication } from "../publication/content-language.ts";
import { editionReady } from "../publication/distribution.ts";
import { fetchItemsByIds, toItemSummary } from "../publication/items.ts";
import { loadReport } from "../publication/reports.ts";
import { listedCondition } from "../publication/scope.ts";
import { editionGap } from "./issue.ts";
import { issueSections } from "./mail.ts";
import type { WechatEntry } from "./wechat.ts";

export const WECHAT_MIN_ENTRIES = 10;
/** How far back a carried event keeps its later reports out of the column (the daily's own memory). */
const MEMORY_DAYS = 7;

export type WechatColumn =
  | { status: "no_report" | "empty" }
  | { status: "not_ready"; reason: string }
  | { status: "ready"; report: ReportDetail; extra: WechatEntry[] };

/** An added entry's label: its category's short name, close to how the Chinese daily names its sections. */
const LABEL = new Map(CATEGORIES.map((c) => [c.key as string, c.label]));

function shown(report: ReportDetail): number {
  return issueSections(report).reduce((n, s) => n + s.items.length, 0) + report.flashes.filter((i) => i.available).length;
}

/** The window's next-best public reports in Chinese, one per event, none of an event a recent daily carried. */
async function additions(report: ReportDetail, wanted: number): Promise<WechatEntry[]> {
  if (wanted <= 0) return [];
  const carried = await sql<{ id: string }[]>`
    SELECT DISTINCT cited.value #>> '{}' AS id
    FROM reports r, jsonb_path_query(r.content, '$.**.itemId') AS cited(value)
    WHERE r.kind = 'daily' AND r.key BETWEEN ${addDays(report.key, -MEMORY_DAYS)} AND ${report.key}`;
  const ids = carried.map((r) => r.id);
  const rows = await sql<{ id: string }[]>`
    SELECT p.article_id AS id FROM publications p JOIN sources s ON s.id = p.source_id
    WHERE ${listedCondition(new Date())} AND s.participation_mode = 'editorial' AND NOT p.backfill
      AND p.timeline_at >= ${new Date(report.windowStart)} AND p.timeline_at < ${new Date(report.windowEnd)}
      AND p.score >= ${SELECTION.understandFloor}
      AND NOT p.article_id = ANY(${ids}::text[])
      AND (p.story_id IS NULL OR p.story_id NOT IN (
        SELECT story_id FROM publications WHERE article_id = ANY(${ids}::text[]) AND story_id IS NOT NULL))
    ORDER BY p.score DESC, p.timeline_at DESC, p.article_id
    LIMIT ${wanted * 4}`;
  const found = await fetchItemsByIds(rows.map((r) => r.id));
  const items = await localizePublication(rows.flatMap((r) => (found.has(r.id) ? [toItemSummary(found.get(r.id)!)] : [])), "zh");
  const events = new Set<string>();
  const out: WechatEntry[] = [];
  for (const item of items) {
    if (out.length === wanted) break;
    if (!editionReady(item, "zh", true)) continue;
    if (item.story && events.has(item.story.publicId)) continue;
    if (item.story) events.add(item.story.publicId);
    out.push({
      itemId: item.id, title: item.title, summary: item.summary, sourceName: item.source.name, sourceUrl: item.links.original,
      sourceIconUrl: null, firstParty: false, publishedAt: item.publishedAt, available: true,
      section: LABEL.get(item.category ?? "") ?? LABEL.get("industry") ?? "行业",
    });
  }
  return out;
}

export async function wechatColumn(key: string): Promise<WechatColumn> {
  const source = await loadReport("daily", key);
  if (!source) return { status: "no_report" };
  const report = await localizePublication(source, "zh");
  const gap = editionGap(report, "zh");
  if (gap) return { status: "not_ready", reason: gap };
  const extra = await additions(report, WECHAT_MIN_ENTRIES - shown(report));
  if (shown(report) + extra.length === 0) return { status: "empty" };
  return { status: "ready", report, extra };
}
