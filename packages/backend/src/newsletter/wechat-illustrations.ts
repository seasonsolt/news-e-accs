// A picture under an entry of the 公众号 column 「AI 早报」, one per day and entry (wechat_illustrations).
// The workbench asks the worker to find one or to draw one (admin/wechat.ts), or the editor uploads one.
// Finding takes the first sizeable picture of the entry's own report or of another report of its event,
// then the preview picture (og:image) of those reports' pages, then that of pages a web search by the
// Codex CLI turns up; a found picture keeps its page as its credit. Drawing uses the Codex CLI's image
// tool (providers/codex.ts). Files are objects under wechat-illustrations/ (lib/objects.ts). Each ask or
// upload is a new `request`: work that finishes after a newer ask is not shown, and the picture already
// there stays until the new one is ready.
import { z } from "zod";
import { config } from "../config.ts";
import { sql } from "../db.ts";
import { promptText } from "../editorial/prompts.ts";
import { guardedFetch } from "../lib/http-fetch.ts";
import { isNonArticleImage } from "../lib/image-url.ts";
import { getObject } from "../lib/objects.ts";
import { previewPicture } from "../media/previews.ts";
import { logError } from "../lib/log-error.ts";
import { codexConfigured, codexImage, codexText, saveJpeg } from "../providers/codex.ts";
import { BudgetExceededError, completeReceipt, paidRequest, ReceiptBusyError, ReceiptUnknownError } from "../providers/receipts.ts";

/** The pictures' folder in the object store (lib/objects.ts). */
export const ILLUSTRATIONS = "wechat-illustrations";

export interface IllustrationRow {
  entryKey: string;
  /** "drawing" while the worker finds or draws it. */
  status: "queued" | "drawing" | "done" | "failed";
  /**
   * Where the picture came from: "source", the entry's reports, "web", a web search. While a find or a
   * drawing is under way, what was asked ("source" or "drawn"); a failed one gives the picture there its own back.
   */
  origin: "drawn" | "uploaded" | "source" | "web";
  prompt: string | null;
  request: string;
  file: string | null;
  error: string | null;
  /** The page a found picture is from. */
  credit: string | null;
  wechatUrl: string | null;
  requestedBy: string | null;
  updatedAt: string;
}

/** The day's pictures by entry key. */
export async function wechatIllustrations(key: string): Promise<Map<string, IllustrationRow>> {
  const rows = await sql<IllustrationRow[]>`
    SELECT entry_key AS "entryKey", status, origin, prompt, request, file, error, credit, wechat_url AS "wechatUrl", requested_by AS "requestedBy", updated_at AS "updatedAt"
    FROM wechat_illustrations WHERE report_key = ${key}`;
  return new Map(rows.map((r) => [r.entryKey, r]));
}

/** The entry's picture as JPEG bytes; null without one. */
export async function illustrationJpeg(key: string, entry: string): Promise<Buffer | null> {
  const [row] = await sql<{ file: string | null }[]>`SELECT file FROM wechat_illustrations WHERE report_key = ${key} AND entry_key = ${entry}`;
  // Names are written here as <hash>.jpg; anything else is not read.
  if (!row?.file || !/^[0-9a-f]{32}\.jpg$/.test(row.file)) return null;
  return getObject(`${ILLUSTRATIONS}/${row.file}`);
}

/** Why the worker cannot draw (or search the web) here, or null when it can. */
export function drawingUnavailable(): string | null {
  if (!codexConfigured()) return "没有配置 CODEX_BIN，不能 AI 绘图和搜网页找图，只能从原文找或上传。";
  if (!config.modelCallsEnabled) return "模型调用没有打开（MODEL_CALLS_ENABLED），不能 AI 绘图和搜网页找图，只能从原文找或上传。";
  return null;
}

/** What the drawing is of: the editor's words, else the entry itself. */
export const illustrationSubject = (entry: { title: string; body: string | null }, prompt: string | null) =>
  prompt?.trim() || `${entry.title}\n${entry.body ?? ""}`.trim();

function failure(error: unknown): string {
  if (error instanceof BudgetExceededError) return "codex 的预算用完了，稍后再试，或在后台「设置 → 预算」里调高。";
  if (error instanceof ReceiptBusyError) return "同一张图正在画，等它画完。";
  // Each ask is a request of its own, so asking again draws anew.
  if (error instanceof ReceiptUnknownError) return "画图中断了（超时或 worker 重启），没有拿到图，可以重画。";
  return String(error instanceof Error ? error.message : error).slice(0, 600);
}

/** The worker's job: draws the picture `request` asked for, unless a newer ask or upload replaced it. */
type Job = { date: string; entry: string; request: string; subject: string; kept: string | null };

/** A failed find or drawing: the error, and the picture already there keeps its origin. */
const failed = (job: Job, error: string) => sql`
  status = 'failed', error = ${error}, updated_at = now(), origin = CASE WHEN file IS NULL THEN origin ELSE coalesce(${job.kept}, origin) END`;

export async function drawWechatIllustration(job: Job): Promise<{ status: string }> {
  const mine = sql`report_key = ${job.date} AND entry_key = ${job.entry} AND request = ${job.request}`;
  const unavailable = drawingUnavailable();
  if (unavailable) {
    await sql`UPDATE wechat_illustrations SET ${failed(job, unavailable)} WHERE ${mine} AND status IN ('queued', 'drawing')`;
    return { status: "disabled" };
  }
  const claimed = await sql`UPDATE wechat_illustrations SET status = 'drawing', updated_at = now() WHERE ${mine} AND status IN ('queued', 'drawing') RETURNING 1`;
  if (!claimed.length) return { status: "superseded" };
  try {
    const drawn = await codexImage({
      instruction: promptText("wechat-illustration", { subject: job.subject }), folder: ILLUSTRATIONS,
      purpose: "wechat_illustration", subject: `wechat:${job.date}:${job.entry}`.slice(0, 200), attemptTag: job.request,
    });
    const kept = await sql.begin(async (tx) => {
      const updated = await tx`
        UPDATE wechat_illustrations SET status = 'done', origin = 'drawn', file = ${drawn.file}, credit = NULL, wechat_url = NULL, error = NULL, receipt_id = ${drawn.receiptId}, updated_at = now()
        WHERE ${mine}`;
      await completeReceipt(tx, drawn.receiptId);
      return updated.count > 0;
    });
    return { status: kept ? "done" : "superseded" };
  } catch (error) {
    console.error("[wechat.illustrate]", logError(error));
    await sql`UPDATE wechat_illustrations SET ${failed(job, failure(error))} WHERE ${mine}`;
    return { status: "failed" };
  }
}

/** Narrower or flatter than this is an icon, a logo strip or a banner, not a picture for the column. */
const MIN_WIDTH = 480;
const MIN_HEIGHT = 240;
const MAX_RATIO = 3;
const MIN_RATIO = 0.5;
/** Candidates tried before giving up on a step; each is one download. */
const TRIES = 6;
const PagesSchema = z.object({ pages: z.array(z.string()) });

/** The pictures the entry's own report carries, then those of the other reports of its event (first-hand first), and their pages. */
async function reportPictures(itemId: string): Promise<{ pictures: Array<{ url: string; page: string }>; pages: string[] }> {
  const rows = await sql<{ page: string; pictures: Array<{ url?: unknown; width?: unknown }> }[]>`
    SELECT a.url AS page,
      coalesce(a.x_post->'media', '[]'::jsonb) || coalesce(a.x_post->'quoted'->'media', '[]'::jsonb) || coalesce(a.media, '[]'::jsonb) AS pictures
    FROM publications p JOIN articles a ON a.id = p.article_id
    WHERE p.article_id = ${itemId} OR p.story_id = (SELECT story_id FROM publications WHERE article_id = ${itemId})
    ORDER BY (p.article_id = ${itemId}) DESC, p.first_party DESC, coalesce(p.score, 0) DESC, p.article_id
    LIMIT 6`;
  const pictures = rows.flatMap((r) => (Array.isArray(r.pictures) ? r.pictures : [])
    .filter((m: { kind?: unknown; url?: unknown; width?: unknown }) => m?.kind === "image" && typeof m.url === "string" && !(typeof m.width === "number" && m.width < MIN_WIDTH))
    .map((m) => ({ url: m.url as string, page: r.page })));
  return { pictures, pages: rows.map((r) => r.page) };
}

/** The page's own preview picture (og:image, twitter:image); null without one or when the page cannot be read. */
/** The picture at `url` when it is one the column can print (big enough, not a strip or an icon); null otherwise. */
export async function usablePicture(url: string): Promise<Buffer | null> {
  if (isNonArticleImage(url)) return null;
  try {
    const res = await guardedFetch(url, { timeoutMs: 20_000, maxBytes: 16 * 1024 * 1024, headers: { accept: "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8" } });
    if (res.status !== 200) return null;
    const { default: sharp } = await import("sharp");
    const meta = await sharp(res.body, { limitInputPixels: 64_000_000 }).metadata();
    const width = meta.width ?? 0;
    const height = meta.pageHeight ?? meta.height ?? 0;
    if (meta.format === "svg" || width < MIN_WIDTH || height < MIN_HEIGHT || width / height > MAX_RATIO || width / height < MIN_RATIO) return null;
    return res.body;
  } catch {
    return null;
  }
}

/** The first usable picture among `candidates` that is not the one already shown, saved; null without one. */
async function firstUsable(candidates: Array<{ url: string; page: string }>, current: string | null): Promise<{ file: string; page: string } | null> {
  const seen = new Set<string>();
  for (const c of candidates) {
    if (seen.has(c.url) || seen.size >= TRIES) continue;
    seen.add(c.url);
    const picture = await usablePicture(c.url);
    if (!picture) continue;
    const saved = await saveJpeg(picture, ILLUSTRATIONS);
    if (saved.file !== current) return { file: saved.file, page: c.page };
  }
  return null;
}

/** Each page's preview picture, in order. */
export async function previews(pages: string[]): Promise<Array<{ url: string; page: string }>> {
  const found = await Promise.all(pages.slice(0, TRIES).map(async (page) => ({ url: await previewPicture(page), page })));
  return found.flatMap((f) => (f.url ? [{ url: f.url, page: f.page }] : []));
}

/** Pages about `subject` a live web search turns up, most relevant first; the receipt is completed by the caller. */
async function searchPages(subject: string, job: { date: string; entry: string; request: string }): Promise<{ pages: string[]; receiptId: number }> {
  const prompt = promptText("wechat-image-search", { subject });
  const receipt = await paidRequest(
    { service: "codex-text", model: null, purpose: "wechat_image_search", subject: `wechat:${job.date}:${job.entry}`.slice(0, 200), identity: { prompt }, attemptTag: job.request, requestSummary: { chars: prompt.length } },
    async () => ({ response: { text: (await codexText({ prompt, timeoutMs: 5 * 60_000, webSearch: true })).text } }),
  );
  const text = String((receipt.response as { text?: unknown } | null)?.text ?? "");
  const json = text.match(/\{[\s\S]*\}/)?.[0];
  let pages: string[] = [];
  try {
    pages = json ? PagesSchema.parse(JSON.parse(json)).pages : [];
  } catch {
    // An answer that is not the asked JSON found nothing usable.
  }
  return { pages: pages.filter((p) => /^https?:\/\//.test(p)), receiptId: receipt.receiptId };
}

/**
 * The worker's job: finds a picture for the entry (see the top of this file), unless a newer ask or upload
 * replaced the request. Without one the entry keeps the picture it has and the editor is told to draw or
 * upload one.
 */
export async function findWechatIllustration(job: Job): Promise<{ status: string }> {
  const mine = sql`report_key = ${job.date} AND entry_key = ${job.entry} AND request = ${job.request}`;
  const [claimed] = await sql<{ file: string | null }[]>`
    UPDATE wechat_illustrations SET status = 'drawing', updated_at = now() WHERE ${mine} AND status IN ('queued', 'drawing') RETURNING file`;
  if (!claimed) return { status: "superseded" };
  try {
    let found: { file: string; page: string; origin: "source" | "web" } | null = null;
    let receiptId: number | null = null;
    // An entry added by title alone has no report to take a picture from.
    if (!job.entry.startsWith("title:")) {
      const own = await reportPictures(job.entry);
      const picture = await firstUsable(own.pictures, claimed.file) ?? await firstUsable(await previews(own.pages), claimed.file);
      if (picture) found = { ...picture, origin: "source" };
    }
    if (!found && !drawingUnavailable()) {
      const searched = await searchPages(job.subject, job);
      receiptId = searched.receiptId;
      const picture = await firstUsable(await previews(searched.pages), claimed.file);
      if (picture) found = { ...picture, origin: "web" };
    }
    const kept = await sql.begin(async (tx) => {
      const updated = found
        ? await tx`
          UPDATE wechat_illustrations SET status = 'done', origin = ${found.origin}, file = ${found.file}, credit = ${found.page}, wechat_url = NULL, error = NULL,
            receipt_id = ${receiptId}, updated_at = now()
          WHERE ${mine}`
        : await tx`
          UPDATE wechat_illustrations SET receipt_id = ${receiptId},
            ${failed(job, drawingUnavailable() ? "原文里没有合适的图；搜网页要用 codex，这里没开，可以上传一张。" : "原文和网上都没找到合适的图，可以用 AI 绘图或上传一张。")}
          WHERE ${mine}`;
      if (receiptId !== null) await completeReceipt(tx, receiptId);
      return updated.count > 0;
    });
    return { status: !kept ? "superseded" : found ? "done" : "none" };
  } catch (error) {
    console.error("[wechat.illustrate]", logError(error));
    await sql`UPDATE wechat_illustrations SET ${failed(job, failure(error))} WHERE ${mine}`;
    return { status: "failed" };
  }
}
