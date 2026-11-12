// What readers, feeds, the sitemap, llms.txt and the daily letter see of the essays: only live
// publications (essay_publications), never the desk's working copy. Readers never trigger a model.
import { sql } from "@aihot/backend/db";
import { siteUrl } from "@aihot/backend/publication/links";
import type { LetterFeature, SitemapEntry } from "@aihot/backend/modules";
import { MANIFESTO_AUTHOR } from "@aihot/industry/manifesto";
import { SITE } from "@aihot/site";
import { ESSAY_MEDIA, ESSAYS_PATH, essayFeedPath, essayPath, type EssayLanguage, type PublicEssay, type PublicEssayList, type PublicEssaySummary } from "../contracts.ts";
import type { PublishedCover, PublishedEdition } from "./store.ts";

interface LiveRow {
  slug: string;
  editions: Record<EssayLanguage, PublishedEdition>;
  cover: PublishedCover;
  first_published_at: Date;
  published_at: Date;
}

const AUTHOR_PATH = "/about";

function summary(row: LiveRow, language: EssayLanguage): PublicEssaySummary {
  const e = row.editions[language];
  return {
    slug: row.slug, path: essayPath(row.slug, language), title: e.title, dek: e.dek,
    cover: { src: `${ESSAY_MEDIA}/${row.cover.file}`, width: row.cover.width, height: row.cover.height, alt: row.cover.alt[language], credit: row.cover.credit },
    publishedAt: row.first_published_at.toISOString(), modifiedAt: row.published_at.toISOString(),
  };
}

async function liveRows(limit = 200): Promise<LiveRow[]> {
  return sql<LiveRow[]>`SELECT slug, editions, cover, first_published_at, published_at FROM essay_publications WHERE status = 'live'
    ORDER BY first_published_at DESC, id DESC LIMIT ${limit}`;
}

export async function essayList(language: EssayLanguage, limit = 200): Promise<PublicEssayList> {
  return { essays: (await liveRows(limit)).map((r) => summary(r, language)) };
}

export type EssayLookup = { kind: "found"; essay: PublicEssay } | { kind: "withdrawn" } | { kind: "not_found" };

export async function essayBySlug(slug: string, language: EssayLanguage): Promise<EssayLookup> {
  const [row] = await sql<(LiveRow & { status: string })[]>`
    SELECT slug, status, editions, cover, first_published_at, published_at FROM essay_publications WHERE slug = ${slug}
    ORDER BY status = 'live' DESC, id DESC LIMIT 1`;
  if (!row) return { kind: "not_found" };
  if (row.status !== "live") {
    // A superseded version stands only beside a live one; without one the essay was taken down.
    return { kind: "withdrawn" };
  }
  const e = row.editions[language];
  return {
    kind: "found",
    essay: {
      ...summary(row, language), language, description: e.description, html: e.html, wordCount: e.wordCount,
      author: { name: MANIFESTO_AUTHOR, path: AUTHOR_PATH }, card: `${ESSAY_MEDIA}/${row.cover.card}`,
      alternate: essayPath(row.slug, language === "en" ? "zh" : "en"),
    },
  };
}

/** Whether a live essay prints this picture: only those are public. */
export async function essayFileIsPublic(file: string): Promise<boolean> {
  const [row] = await sql`SELECT 1 FROM essay_publications WHERE status = 'live' AND ${file} = ANY(files) LIMIT 1`;
  return !!row;
}

const xml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

export async function essayFeed(language: EssayLanguage): Promise<string> {
  const rows = await liveRows(50);
  const zh = language === "zh";
  const title = zh ? `${SITE.name} 长文` : `${SITE.name} Essays`;
  const items = rows.map((r) => {
    const e = r.editions[language];
    const link = siteUrl(essayPath(r.slug, language));
    return `    <item>
      <title>${xml(e.title)}</title>
      <link>${xml(link)}</link>
      <guid isPermaLink="true">${xml(link)}</guid>
      <pubDate>${r.first_published_at.toUTCString()}</pubDate>
      <dc:creator>${xml(MANIFESTO_AUTHOR)}</dc:creator>
      <description>${xml(e.dek)}</description>
      <content:encoded><![CDATA[${absolute(e.html).replaceAll("]]>", "]]]]><![CDATA[>")}]]></content:encoded>
    </item>`;
  }).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>${xml(title)}</title>
    <link>${xml(siteUrl(zh ? `/zh${ESSAYS_PATH}` : ESSAYS_PATH))}</link>
    <atom:link href="${xml(siteUrl(essayFeedPath(language)))}" rel="self" type="application/rss+xml"/>
    <description>${xml(zh ? `${MANIFESTO_AUTHOR} 的署名长文：根据作者笔记由 AI 起草，作者修改并审定。` : `Signed essays by ${MANIFESTO_AUTHOR}, drafted with AI from the author's notes and edited by the author.`)}</description>
    <language>${zh ? "zh-CN" : "en"}</language>
    <ttl>360</ttl>
${items}
  </channel>
</rss>
`;
}

/** Site-relative addresses in the HTML made absolute, for readers outside the site. */
function absolute(html: string): string {
  return html.replace(/(src|href)="\/(?!\/)/g, (_m, attr: string) => `${attr}="${siteUrl("/")}`);
}

/** The sitemap's essays: the index changes with each publication; an essay with its latest publication. */
export async function essaySitemapEntries(): Promise<SitemapEntry[]> {
  const rows = await liveRows(1000);
  if (!rows.length) return [];
  const latest = rows.reduce((t, r) => (r.published_at > t ? r.published_at : t), rows[0]!.published_at);
  return [
    { loc: ESSAYS_PATH, lastmod: latest, changefreq: "weekly", priority: 0.8, revision: rows.map((r) => `${r.slug}:${r.published_at.getTime()}`).join(",") },
    ...rows.map((r) => ({ loc: essayPath(r.slug, "en"), lastmod: r.published_at, changefreq: "monthly", priority: 0.8, revision: String(r.published_at.getTime()) })),
  ];
}

export async function essayLlmsLines(): Promise<string[]> {
  const rows = await liveRows(20);
  return [
    `- [Essays](${siteUrl(ESSAYS_PATH)}): signed long-form essays by ${MANIFESTO_AUTHOR}; RSS at ${siteUrl(essayFeedPath("en"))}`,
    ...rows.map((r) => `- [${r.editions.en.title}](${siteUrl(essayPath(r.slug, "en"))}): ${r.editions.en.dek}`),
  ];
}

/** Essays first published after `since`, for the daily letter in `language`. */
export async function essaysSince(since: Date, language: EssayLanguage): Promise<LetterFeature[]> {
  // A republished essay keeps its first date, so it is told once.
  const rows = await sql<LiveRow[]>`SELECT slug, editions, cover, first_published_at, published_at FROM essay_publications
    WHERE status = 'live' AND first_published_at > ${since} ORDER BY first_published_at LIMIT 3`;
  return rows.map((r) => ({ kicker: language === "zh" ? "新长文" : "New essay", title: r.editions[language].title, dek: r.editions[language].dek,
    url: siteUrl(essayPath(r.slug, language)) }));
}
