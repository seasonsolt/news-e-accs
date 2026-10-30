// Article previews: the share picture (og:image) an original page declares, shown with its report on
// cards and the article page like any link preview. Each recent public article is looked up once; a
// picture another article of the same source also declares is the site's default, not this article's.
import * as cheerio from "cheerio";
import { sql } from "../db.ts";
import { guardedFetch } from "../lib/http-fetch.ts";
import { isNonArticleImage } from "../lib/image-url.ts";
import { enqueue, QUEUES } from "../jobs/queue.ts";
import { listedCondition } from "../publication/scope.ts";

/** Stored in articles.preview; `url` is null when the page declares no usable picture. */
export interface ArticlePreview { url: string | null; width?: number; height?: number; shared?: boolean; checkedAt: string }

const MIN_WIDTH = 600;
const MIN_HEIGHT = 300;
const MAX_RATIO = 3;
const MIN_RATIO = 0.5;
const BATCH = 40;
const RECENT_DAYS = 14;

/** The share picture a page declares (og:image, else twitter:image), as an absolute http(s) address. */
export async function previewPicture(page: string): Promise<string | null> {
  try {
    const res = await guardedFetch(page, { timeoutMs: 15_000, maxBytes: 4 * 1024 * 1024, headers: { accept: "text/html,application/xhtml+xml" } });
    if (res.status !== 200 || !/html/i.test(res.headers.get("content-type") ?? "")) return null;
    const $ = cheerio.load(res.text());
    const src = ["meta[property='og:image:secure_url']", "meta[property='og:image']", "meta[name='og:image']", "meta[name='twitter:image']", "meta[name='twitter:image:src']", "meta[property='twitter:image']"]
      .map((q) => $(q).attr("content")?.trim()).find(Boolean);
    if (!src) return null;
    const url = new URL(src, res.url);
    return /^https?:$/.test(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

/** The picture's size when it can lead a card (big enough, not a strip, a tall poster or an icon). */
async function pictureSize(url: string): Promise<{ width: number; height: number } | null> {
  if (isNonArticleImage(url)) return null;
  try {
    const res = await guardedFetch(url, { timeoutMs: 20_000, maxBytes: 16 * 1024 * 1024, headers: { accept: "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8" } });
    if (res.status !== 200) return null;
    const { default: sharp } = await import("sharp");
    const meta = await sharp(res.body, { limitInputPixels: 64_000_000 }).metadata();
    const width = meta.width ?? 0;
    const height = meta.pageHeight ?? meta.height ?? 0;
    if (meta.format === "svg" || width < MIN_WIDTH || height < MIN_HEIGHT || width / height > MAX_RATIO || width / height < MIN_RATIO) return null;
    return { width, height };
  } catch {
    return null;
  }
}

/** Looks the picture up and stores it; true when the article now has a picture of its own. */
async function lookUp(article: { id: string; source_id: string; url: string }): Promise<boolean> {
  const checkedAt = new Date().toISOString();
  const url = await previewPicture(article.url);
  const size = url ? await pictureSize(url) : null;
  if (!url || !size) {
    await sql`UPDATE articles SET preview = ${sql.json({ url: null, checkedAt })} WHERE id = ${article.id}`;
    return false;
  }
  // A site's default picture: mark every article of the source that declares it, this one included.
  const others = await sql`
    UPDATE articles SET preview = preview || '{"shared": true}'::jsonb
    WHERE source_id = ${article.source_id} AND id <> ${article.id} AND preview->>'url' = ${url}
    RETURNING id`;
  const preview: ArticlePreview = { url, ...size, ...(others.length ? { shared: true } : {}), checkedAt };
  await sql`UPDATE articles SET preview = ${sql.json(preview as never)} WHERE id = ${article.id}`;
  return !preview.shared;
}

/** Looks up a web report's preview if it has not been yet, so a newly selected item leads with it at once. */
export async function previewArticle(articleId: string): Promise<void> {
  const [row] = await sql<{ id: string; source_id: string; url: string }[]>`
    SELECT a.id, a.source_id, p.url
    FROM publications p JOIN articles a ON a.id = p.article_id
    WHERE a.id = ${articleId} AND p.channel <> 'x' AND a.preview IS NULL`;
  if (row) await lookUp(row);
}

/** Looks up the previews of recent public web reports not yet looked up, selected ones first. */
export async function findPreviews(limit = BATCH): Promise<{ checked: number }> {
  const rows = await sql<{ id: string; source_id: string; url: string; selected: boolean }[]>`
    SELECT a.id, a.source_id, p.url, p.selected
    FROM publications p JOIN articles a ON a.id = p.article_id
    WHERE p.channel <> 'x' AND a.preview IS NULL AND ${listedCondition(new Date())}
      AND p.discovered_at > now() - make_interval(days => ${RECENT_DAYS})
    ORDER BY p.selected DESC, p.discovered_at DESC
    LIMIT ${limit}`;
  for (const row of rows) {
    // A selected item's renditions were prepared before its picture was known; prepare them again.
    if ((await lookUp(row)) && row.selected) await enqueue(QUEUES.prepareMedia, { articleId: row.id });
  }
  return { checked: rows.length };
}
