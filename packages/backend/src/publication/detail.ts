// Item detail and Markdown export, both behind the same visibility and licence rules.
import type { ItemDetail, OutlineEntry, SiteItemDetail, StoryRef } from "@aihot/contracts/site";
import { SITE } from "@aihot/site";
import { bodyToMarkdown } from "../content/markdown.ts";
import { sql } from "../db.ts";
import { stripTagMarkup } from "../lib/text.ts";
import { proxyBodyImages } from "../media/imgproxy.ts";
import { sha256 } from "../lib/ids.ts";
import { textToHtml } from "../content/sanitize.ts";
import { isChineseBody, ITEM_COLUMNS, ITEM_FROM, seatHolders, showsPost, toItemSummary, xView, type ItemRow } from "./items.ts";
import { evidenceCondition, listedCondition } from "./scope.ts";
import { hasItemPage } from "./rules.ts";
import { targetLanguageProse } from "./content-source.ts";
import { localizePublication } from "./content-language.ts";
import { bodyEditionReady, editionPath, editionReady, EditionUnavailableError, type DistributionLanguage } from "./distribution.ts";
import { siteUrl } from "./links.ts";
import { topicLinks, topicMembership } from "./topics.ts";

interface DetailRow extends ItemRow {
  body_html: string | null;
  body_text: string | null;
  body_status: string;
  tr_html: string | null;
  tr_complete: boolean | null;
  topics: string[];
}

/** `detail` is the canonical article (exports read it); `item` is what a page of the requested body language shows. */
export type DetailResult =
  | { kind: "found"; detail: ItemDetail; item: SiteItemDetail; row: DetailRow }
  | { kind: "not_found" };

/** Adds stable ids to h2–h4 and returns the outline. */
export function withOutline(html: string): { html: string; outline: OutlineEntry[] } {
  const outline: OutlineEntry[] = [];
  let n = 0;
  const out = html.replace(/<h([2-4])(?: id="sec-\d+")?>([\s\S]*?)<\/h\1>/gi, (_m, level: string, inner: string) => {
    n += 1;
    const id = `sec-${n}`;
    const text = stripTagMarkup(inner, "").trim();
    if (text) outline.push({ id, text: text.slice(0, 80), level: Number(level) });
    return `<h${level} id="${id}">${inner}</h${level}>`;
  });
  return { html: out, outline };
}

async function loadRow(id: string): Promise<DetailRow | null> {
  const [row] = await sql<DetailRow[]>`
    SELECT ${ITEM_COLUMNS}, a.body_html, a.body_text, a.body_status, tr.body_html AS tr_html, tr.complete AS tr_complete,
      ${topicMembership()} AS topics
    ${ITEM_FROM}
    WHERE p.article_id = ${id}`;
  return row ?? null;
}

/**
 * Public detail (rules.hasItemPage): items the lists leave out (low relevance, merged duplicates, no
 * summary yet) keep a noindex page; withdrawn and hot_signal items are a 404. `language` picks the body
 * `item` carries ("zh": the Chinese text or translation when there is one, "original"); `detail` has both.
 */
export async function loadItemDetail(id: string, language: "zh" | "original" = "zh", now = new Date()): Promise<DetailResult> {
  const row = await loadRow(id);
  if (!row || !hasItemPage({ visibility: row.visibility, sourceMode: row.source_mode })) return { kind: "not_found" };

  const summary = toItemSummary(row);
  const post = showsPost(row) ? xView(row, false, true) : null;
  if (row.visibility === "summary-only") {
    const detail: ItemDetail = {
      ...summary,
      selected: false,
      score: null,
      category: null,
      story: null,
      reason: null,
      tags: [],
      x: null,
      readingMode: "summary-only",
      author: null,
      language: row.language,
      body: null,
      outline: [],
      relatedStories: [],
      topics: [],
      indexable: false,
      markdownAvailable: false,
      group: null,
    };
    return { kind: "found", detail, item: siteItemDetail(detail, language === "original"), row };
  }

  const related = await sql<StoryRef[]>`
    SELECT DISTINCT st.public_id::text AS "publicId", st.title
    FROM fact_articles fa JOIN facts f ON f.id = fa.fact_id JOIN stories st ON st.id = f.story_id
    WHERE fa.article_id = ${id} AND fa.role <> 'mention' AND st.merged_into IS NULL
    ORDER BY "publicId" LIMIT 6`;

  let body: ItemDetail["body"] = null;
  let outline: OutlineEntry[] = [];
  if (showsPost(row)) {
    const text = String(row.x_post?.text ?? row.body_text ?? "");
    if (post?.translation || text.trim()) {
      body = {
        zh: post?.translation ? textToHtml(post.translation) : null,
        original: text.trim() ? textToHtml(text) : null,
        zhKind: post?.translation ? "translation" : null,
        complete: true,
      };
    }
  } else if (row.body_mode === "full" && row.body_html) {
    const isZh = isChineseBody(row);
    const original = proxyBodyImages(row.body_html);
    const zh = isZh ? original : row.tr_html ? proxyBodyImages(row.tr_html) : null;
    const primary = withOutline(zh ?? original);
    outline = primary.outline;
    body = {
      zh: zh ? primary.html : null,
      original: zh && !isZh ? withOutline(original).html : isZh ? null : primary.html,
      zhKind: isZh ? "original" : zh ? "translation" : null,
      complete: isZh ? true : row.tr_complete ?? false,
    };
  }

  let group: ItemDetail["group"] = null;
  if (row.fact_id) {
    const [g] = await sql<{ public_id: string; reports: number; sources: number }[]>`
      SELECT f.public_id, count(p.article_id) AS reports, count(DISTINCT p.source_id) AS sources
      FROM facts f JOIN fact_articles fa ON fa.fact_id = f.id JOIN publications p ON p.article_id = fa.article_id
      WHERE f.id = ${row.fact_id} AND ${evidenceCondition()} AND ${listedCondition(now)}
      GROUP BY f.public_id`;
    if (g) {
      group = {
        factId: g.public_id,
        reportCount: Number(g.reports),
        additionalSourceCount: Math.max(0, Number(g.sources) - 1),
      };
    }
  }

  // The reason goes with the seat; a report yielding it points to the one holding it.
  const sameEvent = (await seatHolders([row], now)).get(row.id) ?? null;
  const detail: ItemDetail = {
    ...summary,
    x: post,
    ...(sameEvent ? { reason: null, sameEvent } : {}),
    readingMode: "full",
    author: row.author,
    language: row.language,
    body,
    outline,
    relatedStories: related,
    topics: topicLinks(row.topics),
    indexable: row.indexable,
    markdownAvailable: markdownAvailable(row),
    group,
  };
  return { kind: "found", detail, item: siteItemDetail(detail, language === "original"), row };
}

/**
 * Same predicate for the export button and the export route: a public page with something to export
 * (a summary, the post where pages show it, or a full-text body).
 */
export function markdownAvailable(row: {
  visibility: string; source_mode: string; summary: string | null; body_mode: string; body_html?: string | null; channel: string; x_post: Record<string, any> | null;
}): boolean {
  if (row.visibility !== "public" || !hasItemPage({ visibility: row.visibility, sourceMode: row.source_mode })) return false;
  return !!row.summary || (showsPost(row) && (!!row.x_post?.text || !!row.x_post?.media?.length || !!row.x_post?.quoted?.text)) || (row.body_mode === "full" && !!row.body_html);
}

export async function exportMarkdown(id: string, lang: DistributionLanguage = "en"): Promise<{ filename: string; body: string } | null> {
  const found = await loadItemDetail(id);
  if (found.kind !== "found" || !markdownAvailable(found.row)) return null;
  const detail = await localizePublication(found.detail, lang);
  if (!editionReady(detail, lang)) throw new EditionUnavailableError();
  const en = lang === "en";
  const lines = [`# ${detail.title}`, "", `- ${en ? "Edition" : "语言"}: ${lang}`];
  if (detail.originalTitle) lines.push(`- ${en ? "Original title" : "原标题"}: ${detail.originalTitle}`);
  lines.push(`- ${en ? "Source" : "来源"}: ${detail.source.name}`);
  // Without a reliable date from the original, the time it was collected says so.
  lines.push(detail.publishedAt ? `- ${en ? "Published" : "发布时间"}: ${detail.publishedAt}` : `- ${en ? "Collected" : "收录时间"}: ${detail.discoveredAt}`);
  lines.push(`- ${SITE.name}: ${siteUrl(editionPath(`/items/${id}`, lang))}`);
  lines.push(`- ${en ? "Original" : "原文"}: ${detail.links.original}`, "");
  if (detail.summary) lines.push(en ? "## Summary" : "## 摘要", "", detail.summary, "");
  if (detail.selected && detail.reason) lines.push(en ? "## Why it matters" : "## 推荐理由", "", detail.reason, "");
  const ready = bodyEditionReady(detail, lang);
  const html = lang === "zh" ? detail.body?.zh ?? detail.body?.original : detail.body?.original;
  if (ready && html) lines.push(en ? "## Body" : "## 正文", "", bodyToMarkdown(html, found.row.url), "");
  else if (detail.x?.text && detail.language === lang) lines.push(en ? "## Original post" : "## 原文帖子", "", detail.x.text, "");
  else if (detail.body || detail.x) lines.push(en ? "The requested body edition is not ready. Read the original at the source link above." : "所选语言的正文版本尚未就绪，请通过上方原文链接阅读。", "");
  for (const media of detail.x?.media ?? []) {
    const url = media.url.startsWith("/") ? siteUrl(media.url) : media.url;
    lines.push(media.kind === "image" ? `![${media.alt ?? ""}](${url})` : `[${en ? "Video" : "视频"}](${url})`, "");
  }
  const quoted = detail.x?.quoted;
  if (quoted?.text) {
    const originalLanguage = found.row.x_post?.quoted?.language ?? "unknown";
    const quoteId = /\/status\/(\d+)/.exec(quoted.url)?.[1];
    const [storedQuote] = lang === "zh" && quoteId
      ? await sql<{ text_hash: string; text_zh: string }[]>`SELECT text_hash,text_zh FROM quote_translations WHERE tweet_id=${quoteId}` : [];
    const translated = storedQuote?.text_hash === sha256(quoted.text) && targetLanguageProse(storedQuote.text_zh, "zh") ? storedQuote.text_zh : null;
    lines.push(en ? "## Quoted post" : "## 引用帖子", "", `${en ? "Quoted from" : "引用自"} @${quoted.handle || quoted.authorName}`, "");
    if (!translated && originalLanguage !== lang) lines.push(en
      ? `The requested quote edition is unavailable. Original quoted evidence follows (language: ${originalLanguage}).`
      : `所选语言的引用版本尚未就绪。以下为原始引用（语言：${originalLanguage}）。`, "");
    lines.push(...(translated ?? quoted.text).split("\n").map(line => `> ${line}`), "");
    if (quoted.url) lines.push(`${en ? "Quoted source" : "引用原文"}: ${quoted.url}`, "");
  }
  return { filename: `${SITE.mcpPrefix}-${id}-${lang}.md`, body: lines.join("\n").replace(/\n{3,}/g, "\n\n") };
}

/** Site reading projection: default text remains SSR, a second language has its own readable URL. */
export function siteItemDetail(detail: ItemDetail, original = false): SiteItemDetail {
  const hasTranslation = !!detail.body?.zh && detail.body.zhKind === "translation" && !!detail.body.original;
  const bodyLanguage = original && detail.body?.original ? "original" : detail.body?.zh ? "zh" : "original";
  const selectedHtml = bodyLanguage === "zh" ? detail.body?.zh : detail.body?.original;
  const { text: _text, translation: _translation, ...x } = detail.x ?? {} as NonNullable<ItemDetail["x"]>;
  return { ...detail, x: detail.x ? x : null, hasTranslation, bodyLanguage,
    body: detail.body ? { ...detail.body, zh: bodyLanguage === "zh" ? detail.body.zh : null, original: bodyLanguage === "original" ? detail.body.original : null } : null,
    outline: selectedHtml ? withOutline(selectedHtml).outline : [],
  };
}
