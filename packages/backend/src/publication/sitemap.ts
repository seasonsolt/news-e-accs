// Sitemap from the same public metadata as pages. Process and HTTP caches share one five-minute
// deadline; a saved copy may bridge a restart only for the remainder of that original lifetime.
import { mkdir, readFile, stat, utimes, writeFile } from "node:fs/promises";
import path from "node:path";
import { FEATURES } from "@aihot/industry/features";
import { ABOUT, ACCESS, AGENT, POLICY, SITE } from "@aihot/site";
import { MODULES } from "@aihot/site/modules";
import { config, REPO_ROOT } from "../config.ts";
import { sha256, stableJson } from "../lib/ids.ts";
import { loadChangelog } from "../site/meta.ts";
import { latestHotRanking } from "./hot.ts";
import { ITEM_FROM } from "./items.ts";
import { sql } from "../db.ts";
import { shared } from "../lib/cache.ts";
import { escapeXml } from "../lib/text.ts";
import { siteUrl } from "./links.ts";
import { evidenceCondition, listedCondition, selectedCondition, storyReportCondition } from "./scope.ts";
import { topicDiscovery } from "./topics.ts";
import { serverModules, type SitemapEntry } from "../modules.ts";

/** One sitemap file stays under Google's 50,000 URL cap and about 5 MB, so a proxy can cache it. */
const PART_URLS = 45_000;
const PART_BYTES = 4_500_000;
const TTL_MS = 5 * 60 * 1000;
const CACHE_FILE = path.join(config.dataDir, "sitemap-last.json");

interface SitemapDocument { files: Record<string, string>; expiresAt: number }

let lastGood: SitemapDocument | null = null;

/** A story's Google News fields while the page is under two days old (news sitemap rules). */
type Entry = SitemapEntry & { news?: { title: string; language: string; publishedAt: Date } };

const NEWS_WINDOW_MS = 48 * 60 * 60 * 1000;
const MAX_NEWS = 1000;

/**
 * Pages whose Chinese edition the web always offers as an alternate (apps/web/app/lib/seo.ts). Items,
 * stories and reports, including the latest-report pages, offer it only once both editions are ready,
 * so the page's own hreflang leads to them instead.
 */
const CHINESE_PAGES = new Set(["/", "/all", "/hot", "/topics", "/agent", "/about", "/changelog", "/chronicle", "/daily/archive", "/what-is-eacc", "/eacc-vs-dacc", "/eacc-vs-ea", "/eacc-glossary"]);
function hasChineseMirror(loc: string): boolean {
  return CHINESE_PAGES.has(loc) || /^\/topics\/[^/]+$/.test(loc)
    || MODULES.some((m) => m.localizedPaths?.some((pattern) => pattern.test(loc)));
}

/**
 * One inventory for XML discovery and change notifications. A sitemap bounds its advertised history;
 * notifications read the complete inventory, so crossing that display limit is never a withdrawal.
 * Collection pages have content identities, not invented modification dates: a removed member can
 * change a page without leaving a reliable timestamp on its surviving members.
 */
export async function loadDiscoveryEntries(at = new Date(), limits?: { stories: number; urls: number }): Promise<Entry[]> {
  const entries: Entry[] = [];
  const [activity] = limits ? [] : await sql<{ selected: string | null; listed: string | null }[]>`
    SELECT md5(string_agg(p.article_id || ':' || p.revision::text, ',' ORDER BY p.timeline_at DESC, p.article_id)
             FILTER (WHERE ${selectedCondition(at)})) AS selected,
           md5(string_agg(p.article_id || ':' || p.revision::text, ',' ORDER BY p.timeline_at DESC, p.article_id)
             FILTER (WHERE ${listedCondition(at)})) AS listed
    FROM publications p WHERE ${listedCondition(at)}`;
  const reports = await sql<{ kind: string; key: string; t: Date | null; revision: string }[]>`
    SELECT r.kind, r.key,
      CASE WHEN citations.revision IS NULL THEN greatest(r.updated_at, r.generated_at) END AS t,
      md5(concat_ws('|', r.revision::text, r.updated_at::text, citations.revision)) AS revision
    FROM reports r LEFT JOIN LATERAL (
      SELECT md5(string_agg(p.article_id || ':' || p.revision::text || ':' || (${listedCondition(at)})::text,
          ',' ORDER BY p.article_id)) AS revision
      FROM publications p WHERE p.article_id IN (
        SELECT value #>> '{}' FROM jsonb_path_query(r.content, '$.**.itemId') AS cited(value))
    ) citations ON true ORDER BY r.kind, r.key DESC`;
  const reportRevision = (kind: string) => sha256(stableJson(reports.filter((r) => r.kind === kind)));
  const topics = await topicDiscovery(at, !limits);
  entries.push(
    { loc: "/", revision: activity?.selected ?? "", changefreq: "hourly", priority: 1 },
    { loc: "/all", revision: activity?.listed ?? "", changefreq: "hourly", priority: 0.9 },
    { loc: "/daily", revision: reportRevision("daily"), changefreq: "daily", priority: 0.9 },
    { loc: "/hot", revision: limits ? undefined : sha256(stableJson((await latestHotRanking())?.entries ?? [])), changefreq: "hourly", priority: 0.9 },
    { loc: "/daily/archive", revision: reportRevision("daily"), changefreq: "daily", priority: 0.7 },
    { loc: "/weekly", revision: reportRevision("weekly"), changefreq: "weekly", priority: 0.7 },
    { loc: "/monthly", revision: reportRevision("monthly"), changefreq: "monthly", priority: 0.6 },
    { loc: "/topics", revision: sha256(stableJson(topics)), changefreq: "daily", priority: 0.7 },
    ...serverModules().flatMap(m => m.sitemap?.pages ?? []),
    { loc: "/agent", revision: sha256(stableJson([SITE, ACCESS, AGENT])), changefreq: "weekly", priority: 0.7 },
    { loc: "/about", revision: sha256(stableJson(ABOUT)), changefreq: "monthly", priority: 0.5 },
    // The rules and privacy pages are written in Chinese only: their Chinese page is the canonical one.
    { loc: "/zh/terms", revision: sha256(stableJson([POLICY.terms, await readFile(path.join(REPO_ROOT, "site/pages/terms.md"), "utf8")])), changefreq: "monthly", priority: 0.4 },
    { loc: "/zh/privacy", revision: sha256(stableJson([POLICY.privacy, await readFile(path.join(REPO_ROOT, "site/pages/privacy.md"), "utf8")])), changefreq: "monthly", priority: 0.4 },
    { loc: "/changelog", revision: sha256(stableJson(loadChangelog())), changefreq: "weekly", priority: 0.5 },
  );
  if (FEATURES.timeMachine) entries.push({ loc: "/chronicle", changefreq: "weekly", priority: 0.5 });
  if (FEATURES.eaccConcepts) for (const loc of ["/what-is-eacc", "/eacc-vs-dacc", "/eacc-vs-ea", "/eacc-glossary"]) entries.push({ loc, changefreq: "monthly", priority: 0.7 });
  for (const r of reports) entries.push({ loc: `/${r.kind}/${r.key}`, lastmod: r.t, revision: r.revision, changefreq: "monthly", priority: 0.6 });
  // Later topic pages stay indexable and linked from the first one; discovery lists only that first
  // page, so the inventory does not grow with every twenty reports.
  for (const t of topics) if (t.indexable) entries.push({ loc: `/topics/${t.slug}`, revision: t.revision, changefreq: "daily", priority: 0.6 });
  // A story needs listed evidence of its own. Its identity follows current readable reports as well
  // as the digest, so a correction or regrouping is visible even when latest_at does not advance.
  // Dated by creation or the last digest rewrite: a new report that leaves the digest alone goes
  // undated, so lastmod can lag a change but never claims one that did not happen.
  const stories = await sql<{ public_id: string; revision: string; title: string; editorial_language: string; created_at: Date; t: Date }[]>`
    SELECT st.public_id::text, greatest(st.created_at, st.digest_updated_at) AS t, md5(concat_ws('|', st.title, st.summary, st.digest, st.digest_updated_at::text,
      st.version::text, members.revision)) AS revision, st.title, st.editorial_language, st.created_at
    FROM stories st JOIN LATERAL (
      SELECT md5(string_agg(concat_ws(':', p.article_id, p.revision::text, fa.role, f.updated_at::text, s.name),
        ',' ORDER BY p.article_id, f.id)) AS revision
      FROM facts f JOIN fact_articles fa ON fa.fact_id = f.id JOIN publications p ON p.article_id = fa.article_id
      JOIN sources s ON s.id = p.source_id
      WHERE f.story_id = st.id AND ${storyReportCondition(at)}
    ) members ON true
    WHERE st.merged_into IS NULL AND EXISTS (
      SELECT 1 FROM facts f JOIN fact_articles fa ON fa.fact_id = f.id JOIN publications p ON p.article_id = fa.article_id
      WHERE f.story_id = st.id AND ${evidenceCondition()} AND ${listedCondition(at)})
    ORDER BY st.latest_at DESC NULLS LAST, st.id DESC ${limits ? sql`LIMIT ${limits.stories}` : sql``}`;
  let news = 0;
  for (const s of stories) {
    // A news entry names the page's own creation, never its reports' publication times, and only a
    // native English story has an English headline of its own.
    const fresh = s.editorial_language === "en" && at.getTime() - s.created_at.getTime() < NEWS_WINDOW_MS && news++ < MAX_NEWS;
    entries.push({
      loc: `/story/${s.public_id}`, lastmod: s.t, revision: s.revision, changefreq: "daily", priority: 0.5,
      ...(fresh ? { news: { title: s.title, language: "en", publishedAt: s.created_at } } : {}),
    });
  }
  for (const m of serverModules()) if (m.sitemap?.entries) entries.push(...(await m.sitemap.entries()));
  entries.push(...entries.filter((e) => hasChineseMirror(e.loc)).map((e) => ({ ...e, loc: e.loc === "/" ? "/zh" : `/zh${e.loc}` })));
  // Material/translation timestamps can also record a retry or a state repair, so they never date a
  // page. An item is dated by when an editor admitted it for indexing: that tells search engines
  // which pages are new, and later edits only make lastmod lag.
  const items = await sql<{ id: string; revision: string; t: Date | null }[]>`
    SELECT p.article_id AS id, p.seo_indexed_at AS t,
      md5(concat_ws('|', p.revision::text, a.content_hash, tr.title, tr.body_html, tr.body_text, tr.complete::text, qt.text_zh,
        s.name, s.icon_url, st.public_id::text, st.title)) AS revision
    ${ITEM_FROM}
    WHERE ${storyReportCondition(at)} AND p.indexable
    ORDER BY p.timeline_at DESC, p.article_id DESC ${limits ? sql`LIMIT ${Math.max(0, limits.urls - entries.length)}` : sql``}`;
  for (const it of items) entries.push({ loc: `/items/${it.id}`, lastmod: it.t, revision: it.revision, changefreq: "monthly", priority: 0.5 });
  return limits ? entries.slice(0, limits.urls) : entries;
}

const URLSET_HEAD = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">\n`;
const URLSET_TAIL = `\n</urlset>\n`;

function englishPath(loc: string): string {
  return loc === "/zh" ? "/" : loc.replace(/^\/zh(?=\/)/, "");
}

function renderUrl(entry: Entry, paired: boolean): string {
  const parts = [`<loc>${escapeXml(siteUrl(entry.loc))}</loc>`];
  if (entry.lastmod) parts.push(`<lastmod>${entry.lastmod.toISOString()}</lastmod>`);
  if (entry.changefreq) parts.push(`<changefreq>${entry.changefreq}</changefreq>`);
  if (entry.priority !== undefined) parts.push(`<priority>${entry.priority}</priority>`);
  // Extension elements follow the core ones (sitemaps.org schema). Both editions name each other,
  // as the pages' own hreflang links do.
  if (paired) {
    const english = englishPath(entry.loc);
    for (const [language, loc] of [["en", english], ["zh-CN", english === "/" ? "/zh" : `/zh${english}`], ["x-default", english]] as const) {
      parts.push(`<xhtml:link rel="alternate" hreflang="${language}" href="${escapeXml(siteUrl(loc))}"/>`);
    }
  }
  if (entry.news) {
    parts.push(`<news:news>\n<news:publication><news:name>${escapeXml(SITE.name)}</news:name><news:language>${entry.news.language}</news:language></news:publication>\n`
      + `<news:publication_date>${entry.news.publishedAt.toISOString()}</news:publication_date>\n<news:title>${escapeXml(entry.news.title)}</news:title>\n</news:news>`);
  }
  return `<url>\n${parts.join("\n")}\n</url>`;
}

function packBlocks(blocks: string[], limits: { urls: number; bytes: number }): string[][] {
  const parts: string[][] = [];
  let current: string[] = [];
  let bytes = URLSET_HEAD.length + URLSET_TAIL.length;
  for (const block of blocks) {
    const next = block.length + 1;
    if (current.length > 0 && (current.length >= limits.urls || bytes + next > limits.bytes)) {
      parts.push(current);
      current = [];
      bytes = URLSET_HEAD.length + URLSET_TAIL.length;
    }
    current.push(block);
    bytes += next;
  }
  if (current.length) parts.push(current);
  return parts.length ? parts : [[]];
}

/** `/sitemap.xml` is the urlset while it fits, and a sitemap index once it must be split. */
export function packSitemap(entries: Entry[], limits: { urls: number; bytes: number } = { urls: PART_URLS, bytes: PART_BYTES }): Record<string, string> {
  const locs = new Set(entries.map((entry) => entry.loc));
  const paired = (loc: string) => {
    const english = englishPath(loc);
    const chinese = english === "/" ? "/zh" : `/zh${english}`;
    return locs.has(english) && locs.has(chinese);
  };
  const blocks = entries.map((entry) => renderUrl(entry, paired(entry.loc)));
  const parts = packBlocks(blocks, limits);
  const urlset = (blocksInPart: string[]) => `${URLSET_HEAD}${blocksInPart.join("\n")}${URLSET_TAIL}`;
  if (parts.length === 1) return { "/sitemap.xml": urlset(parts[0]!) };
  const files: Record<string, string> = {};
  const index: string[] = [];
  parts.forEach((part, i) => {
    const path = `/sitemaps/sitemap-${i + 1}.xml`;
    files[path] = urlset(part);
    index.push(`<sitemap>\n<loc>${escapeXml(siteUrl(path))}</loc>\n</sitemap>`);
  });
  files["/sitemap.xml"] = `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${index.join("\n")}\n</sitemapindex>\n`;
  return files;
}

const rebuilding = shared<void, SitemapDocument>(() => "sitemap", refreshSitemap);

export function loadSitemap(): Promise<SitemapDocument> {
  if (lastGood && lastGood.expiresAt > Date.now()) return Promise.resolve(lastGood);
  return rebuilding();
}

function documentFromCache(text: string, mtimeMs: number): SitemapDocument | null {
  if (mtimeMs + TTL_MS <= Date.now()) return null;
  try {
    const files = JSON.parse(text) as Record<string, string>;
    if (!files["/sitemap.xml"]) return null;
    return { files, expiresAt: mtimeMs + TTL_MS };
  } catch {
    return null;
  }
}

async function refreshSitemap(): Promise<SitemapDocument> {
  try {
    const at = Date.now();
    const files = packSitemap(await loadDiscoveryEntries(new Date(at), { stories: 500, urls: PART_URLS }));
    lastGood = { files, expiresAt: at + TTL_MS };
    await mkdir(path.dirname(CACHE_FILE), { recursive: true });
    // The file's timestamp preserves the same deadline when another process loads it after restart.
    await writeFile(CACHE_FILE, JSON.stringify(files)).then(() => utimes(CACHE_FILE, new Date(at), new Date(at))).catch(() => {});
    return lastGood;
  } catch (error) {
    if (lastGood && lastGood.expiresAt > Date.now()) return lastGood;
    const saved = await Promise.all([readFile(CACHE_FILE, "utf8"), stat(CACHE_FILE)]).catch(() => null);
    const restored = saved ? documentFromCache(saved[0], saved[1].mtimeMs) : null;
    if (restored) return (lastGood = restored);
    throw error;
  }
}
