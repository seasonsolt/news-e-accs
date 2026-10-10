// RSS feeds. GUID = article id (isPermaLink=false), <link> = the site's page, pubDate = source
// publication time. Summary feeds never carry content:encoded; full feeds inline bodies only for
// sources that explicitly allow redistribution. Titles come from the site's name and categories.
import { CATEGORY_LABELS, PUBLIC_API_CATEGORY_KEYS, type PublicApiCategoryKey } from "@aihot/contracts/taxonomy";
import { SITE, withSubject } from "@aihot/industry/site";
import { localizePublication } from "./content-language.ts";
import { loadItemDetail } from "./detail.ts";
import { bodyEditionReady, distributionCategory, editionPath, editionReady, type DistributionLanguage } from "./distribution.ts";
import { config } from "../config.ts";
import { sql } from "../db.ts";
import { escapeXml } from "../lib/text.ts";
import { proxyBodyImages } from "../media/imgproxy.ts";
import { loadReport, reportHeadline, reportIndex } from "./reports.ts";
import { textToHtml } from "../content/sanitize.ts";
import { categoryCondition, listedCondition, selectedCondition, xView, type ItemRow } from "./items.ts";
import { dailyUrl, itemUrl, siteUrl } from "./links.ts";

interface FeedMeta {
  id: string;
  path: string;
  title: string;
  description: string;
  homePath: string;
  pollHintMinutes: number;
}

const FEEDS: Record<"selected" | "selectedFull" | "all" | "daily", FeedMeta> = {
  selected: { id: "selected", path: "/feed/picks.xml", title: `${SITE.name} — 精选`, description: `最新 50 条 ${SITE.name} 精选摘要，保留标题、站内阅读与原文入口；需要阅读器内全文可改订 /feed/full.xml。`, homePath: "/", pollHintMinutes: 30 },
  selectedFull: { id: "selected-full", path: "/feed/full.xml", title: `${SITE.name} — 精选全文`, description: "与精选摘要相同的最新 50 条；仅对明确允许再分发的来源内联正文，其余仍提供摘要和阅读入口。", homePath: "/", pollHintMinutes: 30 },
  all: { id: "all", path: "/feed/all.xml", title: `${SITE.name} — 全部动态`, description: "最近 7 天公开动态，按真实发布时间倒序；不含未审内容、低相关条目和已合并的重复条目。", homePath: "/all", pollHintMinutes: 30 },
  daily: { id: "daily", path: "/feed/daily.xml", title: `${SITE.name} ${withSubject("日报")}`, description: `${SITE.name} 每天 08:00 北京时间发布的${withSubject("日报")}，保留最近 30 期。`, homePath: "/daily", pollHintMinutes: 30 },
};

/** RSS <author> needs an address; a no-reply one on the site's own domain. */
const AUTHOR = `noreply@${new URL(config.siteUrl).hostname}`;

function cdata(s: string): string {
  return `<![CDATA[${s.replace(/]]>/g, "]]]]><![CDATA[>").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")}]]>`;
}

function rfc822(d: Date): string {
  return d.toUTCString();
}

function channel(meta: { title: string; description: string; homePath: string; selfPath: string; ttl: number }, items: string[], lang: DistributionLanguage = "zh"): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>${escapeXml(meta.title)}</title>
    <link>${escapeXml(siteUrl(meta.homePath))}</link>
    <description>${escapeXml(meta.description)}</description>
    <language>${lang === "en" ? "en-US" : "zh-CN"}</language>
    <atom:link href="${escapeXml(siteUrl(meta.selfPath))}" rel="self" type="application/rss+xml" />
    <ttl>${meta.ttl}</ttl>
    <generator>${escapeXml(`${SITE.name} (${siteUrl("/agent")})`)}</generator>
${items.join("\n")}
  </channel>
</rss>
`;
}

type FeedRow = Pick<ItemRow, "id" | "title" | "summary" | "url" | "category" | "published_at" | "discovered_at" | "source_name"> &
  Partial<Pick<ItemRow, "channel" | "x_post" | "zh_text" | "quoted_zh" | "language" | "syndicate"> & {
    body_html: string | null; tr_html: string | null; tr_complete: boolean | null;
  }>;

/** Readers keep feed items for days: body images in full RSS are signed for a week, not a day. */
const FEED_IMAGE_SECONDS = 7 * 86400;

/**
 * The body a full feed carries, in Chinese when the page has it: an X post's translation (with the post
 * it quotes, translated too), else a complete Chinese translation of the article, else the original. It
 * ends with an attribution line (also a mark on copies taken from the feed).
 */
function fullContent(r: FeedRow, aihot: string): string | null {
  let html: string | null = null;
  const x = r.channel === "x" ? xView({ x_post: r.x_post ?? null, zh_text: r.zh_text ?? null, quoted_zh: r.quoted_zh ?? null }) : null;
  if (x?.text) {
    html = textToHtml(x.translation ?? x.text);
    if (x.quoted?.text) {
      html += `<blockquote><p>引用 @${escapeXml(x.quoted.handle)}：</p>${textToHtml(x.quoted.translation ?? x.quoted.text)}${x.quoted.url ? `<p><a href="${escapeXml(x.quoted.url)}">${escapeXml(x.quoted.url)}</a></p>` : ""}</blockquote>`;
    }
  } else if (r.body_html) {
    html = r.language !== "zh" && r.tr_html && r.tr_complete ? r.tr_html : r.body_html;
  }
  if (!html) return null;
  return `${proxyBodyImages(html, true, FEED_IMAGE_SECONDS)}<p>—— 本文由 ${escapeXml(SITE.name)} 聚合整理，完整版与更多动态见 <a href="${aihot}">${aihot}</a></p>`;
}

function itemXml(r: FeedRow, includeContent: boolean, lang?: DistributionLanguage, editionBody?: string | null): string {
  const aihot = lang ? siteUrl(editionPath(`/items/${r.id}`, lang)) : itemUrl(r.id);
  const summary = r.summary ?? "";
  const description = `<p>${escapeXml(summary)}</p>\n<p>🔗 <a href="${escapeXml(r.url)}">${lang === "en" ? "Read the source" : "阅读原文"}</a></p>\n<p>via ${escapeXml(SITE.name)} · <a href="${aihot}">${aihot}</a></p>`;
  const label = r.category ? (lang ? distributionCategory(r.category as PublicApiCategoryKey, lang) : CATEGORY_LABELS[r.category as PublicApiCategoryKey]) : undefined;
  const category = label ? `\n      <category>${escapeXml(label)}</category>` : "";
  let content = "";
  if (includeContent && r.syndicate) {
    const html = lang ? editionBody : fullContent(r, aihot);
    if (html) content = `\n      <content:encoded>${cdata(html)}</content:encoded>`;
  }
  const pub = r.published_at ?? r.discovered_at;
  return `    <item>
      <title>${cdata(r.title)}</title>
      <link>${aihot}</link>
      <description>${cdata(description)}</description>${content}${category}
      <pubDate>${rfc822(pub)}</pubDate>
      <guid isPermaLink="false">${escapeXml(r.id)}</guid>
      <author>${AUTHOR} (${escapeXml(r.source_name)})</author>
    </item>`;
}

export type ItemFeedKind = "selected" | "selected-full" | "all";

// Like the live feeds, items are the newest by their original publish time (the pubDate shown):
// 50 per feed; a category feed holds only its last 7 days (by original publish time).

export async function itemFeed(kind: ItemFeedKind, category: PublicApiCategoryKey | null, now = new Date(), lang?: DistributionLanguage): Promise<string> {
  const includeContent = kind === "selected-full";
  const scope = kind === "all"
    ? sql`${listedCondition(now)} AND p.eligible AND coalesce(p.published_at, p.discovered_at) > ${now}::timestamptz - interval '7 days'
        AND coalesce(p.published_at, p.discovered_at) <= ${now}`
    : sql`${selectedCondition(now)} ${categoryCondition(category, true)}
        ${category ? sql`AND coalesce(p.published_at, p.discovered_at) >= ${new Date(now.getTime() - 7 * 86400_000)}` : sql``}`;
  const rows = await sql<FeedRow[]>`
    WITH page AS MATERIALIZED (
      SELECT p.article_id FROM publications p WHERE ${scope}
      ORDER BY coalesce(p.published_at, p.discovered_at) DESC, p.article_id DESC LIMIT 50
    )
    SELECT p.article_id AS id, p.title, p.summary, p.url, p.category, p.published_at, p.discovered_at, s.name AS source_name
      ${includeContent ? sql`, p.channel, p.syndicate, a.language, a.x_post,
        CASE WHEN p.channel = 'x' THEN tr.body_text END AS zh_text, qt.text_zh AS quoted_zh,
        a.body_html, tr.body_html AS tr_html, tr.complete AS tr_complete` : sql``}
    FROM page JOIN publications p ON p.article_id = page.article_id JOIN sources s ON s.id = p.source_id
    ${includeContent ? sql`LEFT JOIN articles a ON a.id = p.article_id AND p.syndicate
      LEFT JOIN translations tr ON tr.article_id = p.article_id AND tr.lang = 'zh' AND tr.revision >= a.revision
      LEFT JOIN quote_translations qt ON p.channel = 'x' AND qt.tweet_id = substring(a.x_post->'quoted'->>'url' from '/status/([0-9]+)')` : sql``}
    ORDER BY coalesce(p.published_at, p.discovered_at) DESC, p.article_id DESC`;
  let meta: { title: string; description: string; homePath: string; selfPath: string; ttl: number };
  if (category) {
    const label = CATEGORY_LABELS[category] ?? category;
    meta = {
      title: includeContent ? `${SITE.name} — ${label}全文` : `${SITE.name} — ${label}`,
      description: includeContent
        ? `${SITE.name} 每日精选「${label}」分类全文源。仅对明确允许再分发的来源内联正文。`
        : `${SITE.name} 每日精选「${label}」分类摘要，按分类订阅、不被全量精选刷屏。`,
      homePath: "/",
      selfPath: includeContent ? `/feed/full/category/${category}.xml` : `/feed/category/${category}.xml`,
      ttl: 30,
    };
  } else {
    const m = FEEDS[kind === "selected" ? "selected" : kind === "selected-full" ? "selectedFull" : "all"];
    meta = { title: m.title, description: m.description, homePath: m.homePath, selfPath: m.path, ttl: m.pollHintMinutes };
  }
  if (!lang) {
    const editions = await localizePublication(rows.map(({ id, title, summary }) => ({ id, title, summary })), "zh");
    const legacy = rows.map((row, index) => ({ ...row, ...editions[index]! })).filter(row => editionReady(row, "zh", true));
    return channel(meta, legacy.map(row => itemXml(row, includeContent)));
  }
  const editions = await localizePublication(rows.map(({ id, title, summary }) => ({ id, title, summary })), lang);
  const localized = rows.map((row, index) => ({ ...row, ...editions[index]! }));
  const ready = localized.filter(row => editionReady(row, lang));
  const items = await Promise.all(ready.map(async row => {
    let body: string | null = null;
    if (includeContent && row.syndicate) {
      const detail = await loadItemDetail(row.id);
      if (detail.kind === "found") {
        const dto = await localizePublication(detail.detail, lang);
        if (bodyEditionReady(dto, lang)) {
          const html = lang === "zh" ? dto.body?.zh ?? dto.body?.original : dto.body?.original;
          if (html) body = `${proxyBodyImages(html, true, FEED_IMAGE_SECONDS)}<p>via ${escapeXml(SITE.name)} · <a href="${escapeXml(siteUrl(editionPath(`/items/${row.id}`, lang)))}">${escapeXml(SITE.name)}</a></p>`;
        }
      }
    }
    return itemXml(row, includeContent, lang, body);
  }));
  const name = category ? distributionCategory(category, lang) : lang === "en" ? (kind === "all" ? "All news" : includeContent ? "Picks with permitted full text" : "Editorial picks") : "精选";
  const selfPath = `/feed/v2${lang === "zh" ? "/zh" : ""}${meta.selfPath.slice(5)}`;
  return channel({ ...meta, title: `${SITE.name} — ${name}`, description: lang === "en" ? "Stored English editions of public AI news. Full text is included only when redistribution is permitted." : meta.description,
    homePath: editionPath(meta.homePath, lang), selfPath }, items, lang);
}

export async function dailyFeed(lang?: DistributionLanguage): Promise<string> {
  const index = await reportIndex("daily");
  const rows = index.rows.slice(0, 30);
  const m = FEEDS.daily;
  if (lang) {
    const items: string[] = [];
    for (const row of rows) {
      const source = await loadReport("daily", row.key);
      if (!source) continue;
      const report = await localizePublication(source, lang);
      if (!editionReady(report, lang)) continue;
      const url = siteUrl(editionPath(`/daily/${report.key}`, lang));
      const title = `${SITE.name} ${lang === "en" ? "Daily briefing" : "日报"} · ${report.key} — ${report.lead?.title ?? report.title}`;
      items.push(`    <item><title>${cdata(title)}</title><link>${escapeXml(url)}</link><description>${cdata(`<p>${escapeXml(report.lead?.leadParagraph ?? report.overview ?? "")}</p><p><a href="${escapeXml(url)}">${lang === "en" ? "Read the full briefing" : "阅读日报"}</a></p>`)}</description><pubDate>${rfc822(new Date(report.generatedAt))}</pubDate><guid isPermaLink="false">daily-${escapeXml(report.key)}-${lang}</guid><author>${AUTHOR} (${escapeXml(SITE.name)})</author></item>`);
    }
    return channel({ title: `${SITE.name} ${lang === "en" ? "Daily briefing" : "日报"}`, description: lang === "en" ? "Daily AI briefings in stored English editions." : m.description,
      homePath: editionPath(m.homePath, lang), selfPath: `/feed/v2${lang === "zh" ? "/zh" : ""}/daily.xml`, ttl: m.pollHintMinutes }, items, lang);
  }
  const gone = index.gone;
  const items = await Promise.all(rows.map(async (r) => {
    const source = await loadReport("daily", r.key);
    const report = source ? await localizePublication(source, "zh") : null;
    if (!report || !editionReady(report, "zh", true)) return null;
    const url = dailyUrl(r.key);
    const lead = report.lead?.title ?? reportHeadline(r.content, "daily", gone);
    const title = lead ? `${SITE.name} ${withSubject("日报")} · ${r.key} — ${lead}` : `${SITE.name} ${withSubject("日报")} · ${r.key}`;
    const description = `<p>${escapeXml(report.lead?.leadParagraph ?? lead ?? "")} — 点击查看完整日报</p>\n<p>via ${escapeXml(SITE.name)} · <a href="${url}">${url}</a></p>`;
    return `    <item>
      <title>${cdata(title)}</title>
      <link>${url}</link>
      <description>${cdata(description)}</description>
      <pubDate>${rfc822(r.generated_at)}</pubDate>
      <guid isPermaLink="false">daily-${escapeXml(r.key)}</guid>
      <author>${AUTHOR} (${escapeXml(SITE.name)})</author>
    </item>`;
  }));
  return channel({ title: m.title, description: m.description, homePath: m.homePath, selfPath: m.path, ttl: m.pollHintMinutes }, items.filter((item): item is string => item !== null));
}

export function isFeedCategory(v: string): v is PublicApiCategoryKey {
  return (PUBLIC_API_CATEGORY_KEYS as readonly string[]).includes(v);
}
