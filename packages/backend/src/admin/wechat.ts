// The 公众号 workbench: a day's column 「AI 早报」 (newsletter/wechat-column.ts) with the comments the worker
// has written for it and the editor's changes (wechat_issues), the changes themselves, its cover, the
// entries' illustrations (newsletter/wechat-illustrations.ts), putting it into the 公众号's draft box
// (providers/wechat-mp.ts), the 视频号 edition's voice-over script (newsletter/wechat-video.ts), and the
// recent issues.
import { createHash, randomUUID } from "node:crypto";
import { calendarDate } from "@aihot/contracts/time";
import { audit, Conflict } from "../audit.ts";
import { config } from "../config.ts";
import { sql } from "../db.ts";
import { enqueue, QUEUES } from "../jobs/queue.ts";
import { renderWechatCover, WECHAT_COVER_SQUARE, WECHAT_COVER_WIDE, wechatCoverEtag, type WechatCover } from "../media/wechat-cover.ts";
import { WECHAT_MIN_ENTRIES, wechatColumn } from "../newsletter/wechat-column.ts";
import { wechatComments } from "../newsletter/wechat-comments.ts";
import { drawingUnavailable, illustrationDir, illustrationJpeg, illustrationSubject, wechatIllustrations, type IllustrationRow } from "../newsletter/wechat-illustrations.ts";
import { scriptingUnavailable, VIDEO_CAPTION_MAX, VIDEO_ENTRIES, VIDEO_LINE_MAX, wechatVideo, type WechatVideoRow, type WechatVideoScript } from "../newsletter/wechat-video.ts";
import { saveJpeg } from "../providers/codex.ts";
import { addWechatDraft, updateWechatDraft, uploadWechatArticleImage, uploadWechatImage, WechatApiError, wechatConfigured, type WechatDraftArticle } from "../providers/wechat-mp.ts";
import { SITE } from "@aihot/site";
import { isWechatTheme, wechatArticle, WECHAT_DIGEST_MAX, WECHAT_THEMES, WECHAT_TITLE_MAX, type WechatArticle, type WechatEdits } from "../newsletter/wechat.ts";

export type WechatExport =
  | { date: string; status: "no_report" | "empty" }
  | { date: string; status: "not_ready"; reason: string }
  | {
      date: string; status: "ready"; minimum: number; revision: number; edits: WechatEdits; article: WechatArticle;
      limits: { title: number; digest: number }; themes: Array<{ key: string; label: string }>;
      /** The cover's address; it changes with the cover's content. */
      coverUrl: string;
      /** Whether drafts can be pushed from here, and the last push of this issue; `imagesChanged`: an illustration changed since. */
      push: { enabled: boolean; configured: boolean; pushedAt: string | null; pushedRevision: number | null; pushedBy: string | null; imagesChanged: boolean };
      /** The entries' illustrations by entry key, and why the worker cannot draw here (null when it can). */
      illustrations: Record<string, WechatIllustration>;
      drawingUnavailable: string | null;
      /** The 视频号 edition's script, why the worker cannot write one here (null when it can), and how many entries it speaks. */
      video: Omit<WechatVideoRow, "request"> | null;
      videoUnavailable: string | null;
      videoEntries: number;
    };

export interface WechatIllustration {
  status: IllustrationRow["status"];
  origin: IllustrationRow["origin"];
  prompt: string | null;
  error: string | null;
  /** The picture the article prints now (kept while a new one is drawn); null before the first. */
  url: string | null;
  requestedBy: string | null;
  updatedAt: string;
}

export interface WechatIssueRow {
  date: string; issueNumber: number; edited: boolean; updatedAt: string | null; updatedBy: string | null; comments: number; pushedAt: string | null;
}

interface Stored {
  edits: WechatEdits;
  revision: number;
  push: Pushed | null;
}

/** The issue's last push into the draft box; `images`, the fingerprint of the illustrations it carried. */
interface Pushed { draftMediaId: string; coverMediaId: string; coverEtag: string; at: string; revision: number; by: string; images?: string }

const THEMES = Object.entries(WECHAT_THEMES).map(([key, t]) => ({ key, label: t.label }));
/** Longest text an editor may keep in one field; the column is a digest, not an essay. */
const FIELD_MAX = 2000;
/** Longest description of what to draw. */
const PROMPT_MAX = 500;

function dateKey(date: string | undefined): string {
  const key = date || calendarDate(Date.now(), config.reportTimeZone);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) throw Object.assign(new Error("date must be YYYY-MM-DD"), { statusCode: 400 });
  return key;
}

const NONE: Stored = { edits: {}, revision: 0, push: null };

async function stored(key: string): Promise<Stored> {
  const [row] = await sql<Stored[]>`
    SELECT edits, revision, push FROM wechat_issues WHERE report_key = ${key}`;
  return row ?? NONE;
}

/** Where the workbench loads an illustration from; the file name in it changes with the picture. */
const illustrationUrl = (key: string, entry: string, file: string) =>
  `/api/admin/wechat/${key}/illustration.jpg?entry=${encodeURIComponent(entry)}&v=${file.slice(0, 12)}`;

async function issue(key: string) {
  const column = await wechatColumn(key);
  if (column.status !== "ready") return column;
  const [row, comments, illustrations, video] = await Promise.all([stored(key), wechatComments(key), wechatIllustrations(key), wechatVideo(key)]);
  const { edits, revision } = row;
  /** The article with the illustrations printed from `images` (entry key to address). */
  const render = (images: ReadonlyMap<string, string>) => wechatArticle(column.report, column.extra, comments, edits, images);
  const files = new Map([...illustrations].flatMap(([entry, r]) => (r.file ? [[entry, r.file] as const] : [])));
  const article = render(new Map([...files].map(([entry, file]) => [entry, illustrationUrl(key, entry, file)])));
  // The cover leads with the first entry printed, so reordering the issue changes it.
  const cover: WechatCover = { date: key, issueNumber: column.report.issueNumber, headline: article.entries.find((e) => !e.hidden)?.title ?? "", theme: article.theme };
  const shown = article.entries.filter((e) => !e.hidden && files.has(e.key)).map((e) => `${e.key}=${files.get(e.key)}`);
  const imagesEtag = createHash("sha256").update(shown.join("\n")).digest("hex").slice(0, 16);
  return { status: "ready" as const, edits, revision, article, cover, row, illustrations, render, imagesEtag, video };
}

export async function wechatExport(date?: string): Promise<WechatExport> {
  const key = dateKey(date);
  const found = await issue(key);
  if (found.status === "not_ready") return { date: key, status: "not_ready", reason: found.reason };
  if (found.status !== "ready") return { date: key, status: found.status };
  return {
    date: key, status: "ready", minimum: WECHAT_MIN_ENTRIES, revision: found.revision, edits: found.edits, article: found.article,
    limits: { title: WECHAT_TITLE_MAX, digest: WECHAT_DIGEST_MAX }, themes: THEMES,
    coverUrl: `/api/admin/wechat/${key}/cover.png?v=${wechatCoverEtag(found.cover)}`,
    push: {
      enabled: config.wechatDraftEnabled, configured: wechatConfigured(),
      pushedAt: found.row.push?.at ?? null, pushedRevision: found.row.push?.revision ?? null, pushedBy: found.row.push?.by ?? null,
      imagesChanged: !!found.row.push && (found.row.push.images ?? EMPTY_IMAGES) !== found.imagesEtag,
    },
    illustrations: Object.fromEntries([...found.illustrations].map(([entry, r]) => [entry, {
      status: r.status, origin: r.origin, prompt: r.prompt, error: r.error, url: r.file ? illustrationUrl(key, entry, r.file) : null,
      requestedBy: r.requestedBy, updatedAt: r.updatedAt,
    }])),
    drawingUnavailable: drawingUnavailable(),
    video: found.video && { status: found.video.status, script: found.video.script, error: found.video.error, requestedBy: found.video.requestedBy, editedBy: found.video.editedBy, updatedAt: found.video.updatedAt },
    videoUnavailable: scriptingUnavailable(),
    videoEntries: VIDEO_ENTRIES,
  };
}

/** The fingerprint of an issue printed without illustrations (and of pushes made before they existed). */
const EMPTY_IMAGES = createHash("sha256").update("").digest("hex").slice(0, 16);

/** The issue's cover as PNG bytes; null when the day has no column to cover. */
export async function wechatCoverPng(date: string): Promise<Buffer | null> {
  const found = await issue(dateKey(date));
  return found.status === "ready" ? (await renderWechatCover(found.cover)).png : null;
}

const bad = (message: string) => Object.assign(new Error(message), { statusCode: 400 });

function text(value: unknown, name: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || Array.from(value).length > FIELD_MAX) throw bad(`${name} must be text of at most ${FIELD_MAX} characters`);
  return value;
}

function keys(value: unknown, name: string): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 200 || !value.every((k) => typeof k === "string")) throw bad(`${name} must be a list of entry keys`);
  return [...new Set(value as string[])];
}

/** The edits as the workbench sent them, checked field by field; unknown fields are dropped. */
export function checkEdits(input: unknown): WechatEdits {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw bad("edits must be an object");
  const e = input as Record<string, unknown>;
  if (e.theme !== undefined && !isWechatTheme(e.theme)) throw bad("unknown theme");
  const entries: NonNullable<WechatEdits["entries"]> = {};
  if (e.entries !== undefined) {
    if (!e.entries || typeof e.entries !== "object" || Array.isArray(e.entries) || Object.keys(e.entries).length > 200) throw bad("entries must be an object by entry key");
    for (const [k, v] of Object.entries(e.entries as Record<string, Record<string, unknown>>)) {
      if (!v || typeof v !== "object") throw bad("an entry edit must be an object");
      const one = { title: text(v.title, "title"), body: text(v.body, "body"), comment: text(v.comment, "comment") };
      const kept = Object.fromEntries(Object.entries(one).filter(([, x]) => x !== undefined));
      if (Object.keys(kept).length) entries[k] = kept;
    }
  }
  const out: WechatEdits = {
    title: text(e.title, "title"), digest: text(e.digest, "digest"), theme: e.theme as WechatEdits["theme"],
    order: keys(e.order, "order"), hidden: keys(e.hidden, "hidden"), entries: Object.keys(entries).length ? entries : undefined,
  };
  return Object.fromEntries(Object.entries(out).filter(([, x]) => x !== undefined)) as WechatEdits;
}

/** Replaces the issue's edits when `revision` is still the stored one; the next revision is returned. */
export async function saveWechatEdits(date: string, input: { revision?: unknown; edits?: unknown }, actor: string): Promise<{ revision: number }> {
  const key = dateKey(date);
  const edits = checkEdits(input.edits);
  if (!Number.isInteger(input.revision)) throw bad("revision is required");
  return sql.begin(async (tx) => {
    const [before] = await tx<{ edits: WechatEdits; revision: number }[]>`SELECT edits, revision FROM wechat_issues WHERE report_key = ${key} FOR UPDATE`;
    if ((before?.revision ?? 0) !== input.revision) throw new Conflict("这一期在别处改过了，请刷新后再改。");
    const [row] = await tx<{ revision: number }[]>`
      INSERT INTO wechat_issues (report_key, edits, revision, updated_at, updated_by) VALUES (${key}, ${tx.json(edits as never)}, 1, now(), ${actor})
      ON CONFLICT (report_key) DO UPDATE SET edits = EXCLUDED.edits, revision = wechat_issues.revision + 1, updated_at = now(), updated_by = EXCLUDED.updated_by
      RETURNING revision`;
    await audit(actor, "wechat.edit", `wechat:${key}`, null, before?.edits ?? null, edits, { db: tx });
    return { revision: row!.revision };
  });
}

/** The printed or hidden entry `entry` of the day's column; 404 when there is none. */
async function columnEntry(key: string, entry: unknown) {
  if (typeof entry !== "string" || !entry) throw bad("entry is required");
  const found = await issue(key);
  if (found.status !== "ready") throw new Conflict("这一天没有可以配图的早报。");
  const one = found.article.entries.find((e) => e.key === entry);
  if (!one) throw Object.assign(new Error("no such entry in this issue"), { statusCode: 404 });
  return { found, entry: one };
}

/** A drawing still under way; one that has not moved for this long was lost with its worker. */
const DRAWING_STALE_MS = 15 * 60_000;

/**
 * Asks the worker to draw the entry's illustration, of `prompt` or else of the entry itself. The picture
 * already there stays until the new one is ready. One drawing per entry at a time.
 */
export async function requestWechatIllustration(date: string, input: { entry?: unknown; prompt?: unknown }, actor: string): Promise<{ request: string }> {
  const key = dateKey(date);
  const unavailable = drawingUnavailable();
  if (unavailable) throw new Conflict(unavailable);
  const { entry } = await columnEntry(key, input.entry);
  const raw = input.prompt === undefined || input.prompt === null ? "" : input.prompt;
  if (typeof raw !== "string" || Array.from(raw).length > PROMPT_MAX) throw bad(`prompt must be text of at most ${PROMPT_MAX} characters`);
  const prompt = raw.trim() || null;
  const request = randomUUID();
  await sql.begin(async (tx) => {
    const [before] = await tx<{ status: string; prompt: string | null; updated_at: Date }[]>`
      SELECT status, prompt, updated_at FROM wechat_illustrations WHERE report_key = ${key} AND entry_key = ${entry.key} FOR UPDATE`;
    if (before && (before.status === "queued" || before.status === "drawing") && Date.now() - before.updated_at.getTime() < DRAWING_STALE_MS) {
      throw new Conflict("这一条正在画，等它画完再重画。");
    }
    await tx`
      INSERT INTO wechat_illustrations (report_key, entry_key, status, origin, prompt, request, requested_by)
      VALUES (${key}, ${entry.key}, 'queued', 'drawn', ${prompt}, ${request}, ${actor})
      ON CONFLICT (report_key, entry_key) DO UPDATE SET status = 'queued', prompt = EXCLUDED.prompt, request = EXCLUDED.request,
        error = NULL, requested_by = EXCLUDED.requested_by, updated_at = now()`;
    await enqueue(QUEUES.illustrate, { date: key, entry: entry.key, request, subject: illustrationSubject(entry, prompt) }, {}, tx);
    await audit(actor, "wechat.illustrate", `wechat:${key}`, null, before ? { entry: entry.key, prompt: before.prompt } : null, { entry: entry.key, prompt }, { db: tx });
  });
  return { request };
}

/** Puts the editor's own picture under the entry, in place of any drawn one (a drawing under way is dropped). */
export async function uploadWechatIllustration(date: string, input: { entry?: unknown; image: Buffer }, actor: string): Promise<{ ok: true }> {
  const key = dateKey(date);
  const { entry } = await columnEntry(key, input.entry);
  let saved;
  try {
    saved = await saveJpeg(input.image, illustrationDir());
  } catch {
    throw bad("这张图片读不出来，换一张 PNG、JPEG 或 WebP。");
  }
  await sql.begin(async (tx) => {
    await tx`
      INSERT INTO wechat_illustrations (report_key, entry_key, status, origin, request, file, requested_by)
      VALUES (${key}, ${entry.key}, 'done', 'uploaded', ${randomUUID()}, ${saved.file}, ${actor})
      ON CONFLICT (report_key, entry_key) DO UPDATE SET status = 'done', origin = 'uploaded', prompt = NULL, request = EXCLUDED.request,
        file = EXCLUDED.file, error = NULL, receipt_id = NULL, wechat_url = NULL, requested_by = EXCLUDED.requested_by, updated_at = now()`;
    await audit(actor, "wechat.illustration.upload", `wechat:${key}`, null, null, { entry: entry.key, file: saved.file }, { db: tx });
  });
  return { ok: true };
}

/** Takes the entry's illustration out of the article; a drawing under way is dropped. */
export async function removeWechatIllustration(date: string, entry: unknown, actor: string): Promise<{ removed: boolean }> {
  const key = dateKey(date);
  if (typeof entry !== "string" || !entry) throw bad("entry is required");
  return sql.begin(async (tx) => {
    const [gone] = await tx<{ file: string | null; origin: string }[]>`
      DELETE FROM wechat_illustrations WHERE report_key = ${key} AND entry_key = ${entry} RETURNING file, origin`;
    if (gone) await audit(actor, "wechat.illustration.remove", `wechat:${key}`, null, { entry, ...gone }, null, { db: tx });
    return { removed: !!gone };
  });
}

/** The entry's illustration as JPEG bytes; null without one. */
export function wechatIllustrationJpeg(date: string, entry: string): Promise<Buffer | null> {
  return illustrationJpeg(dateKey(date), entry);
}

/** The latest dailies, newest first, with whether the workbench changed them and how many comments they have. */
export async function wechatIssues(limit = 30): Promise<{ rows: WechatIssueRow[] }> {
  const rows = await sql<WechatIssueRow[]>`
    SELECT r.key AS date, (row_number() OVER (ORDER BY r.key))::int AS "issueNumber", (w.report_key IS NOT NULL AND w.edits <> '{}'::jsonb) AS edited,
           w.updated_at AS "updatedAt", w.updated_by AS "updatedBy",
           (SELECT count(*)::int FROM wechat_comments c WHERE c.report_key = r.key) AS comments, w.push->>'at' AS "pushedAt"
    FROM reports r LEFT JOIN wechat_issues w ON w.report_key = r.key
    WHERE r.kind = 'daily' ORDER BY r.key DESC LIMIT ${Math.min(Math.max(limit, 1), 100)}`;
  return { rows };
}

/** A script still being written; one that has not moved for this long was lost with its worker. */
const SCRIPTING_STALE_MS = 10 * 60_000;

/** Asks the worker for a new voice-over script of the issue as it stands; it replaces the stored one when ready. */
export async function requestWechatVideoScript(date: string, actor: string): Promise<{ request: string }> {
  const key = dateKey(date);
  const unavailable = scriptingUnavailable();
  if (unavailable) throw new Conflict(unavailable);
  const found = await issue(key);
  if (found.status !== "ready") throw new Conflict("这一天没有可以做视频的早报。");
  const request = randomUUID();
  await sql.begin(async (tx) => {
    const [before] = await tx<{ status: string; updated_at: Date }[]>`SELECT status, updated_at FROM wechat_videos WHERE report_key = ${key} FOR UPDATE`;
    if (before && (before.status === "queued" || before.status === "writing") && Date.now() - before.updated_at.getTime() < SCRIPTING_STALE_MS) {
      throw new Conflict("口播稿正在写，等它写完再重写。");
    }
    await tx`
      INSERT INTO wechat_videos (report_key, status, request, requested_by) VALUES (${key}, 'queued', ${request}, ${actor})
      ON CONFLICT (report_key) DO UPDATE SET status = 'queued', request = EXCLUDED.request, error = NULL, requested_by = EXCLUDED.requested_by, updated_at = now()`;
    await enqueue(QUEUES.videoScript, { date: key, request }, {}, tx);
    await audit(actor, "wechat.video.request", `wechat:${key}`, null, null, { request }, { db: tx });
  });
  return { request };
}

function line(value: unknown, name: string, max: number): string {
  if (typeof value !== "string" || Array.from(value).length > max) throw bad(`${name} must be text of at most ${max} characters`);
  return value;
}

/** Replaces the finished script's words with the editor's; its paragraphs stay those of the same entries. */
export async function saveWechatVideoScript(date: string, input: { script?: unknown }, actor: string): Promise<{ ok: true }> {
  const key = dateKey(date);
  const s = input.script as Record<string, unknown> | undefined;
  if (!s || typeof s !== "object" || !Array.isArray(s.segments)) throw bad("script must be an object with segments");
  return sql.begin(async (tx) => {
    const [before] = await tx<{ status: string; script: WechatVideoScript | null }[]>`SELECT status, script FROM wechat_videos WHERE report_key = ${key} FOR UPDATE`;
    // A failed rewrite keeps the script before it, which stays editable; one under way would replace the edits.
    if (!before?.script || before.status === "queued" || before.status === "writing") throw new Conflict("口播稿还没写好，等它写完再改。");
    const given = new Map((s.segments as Array<Record<string, unknown>>).map((x) => [x?.key, x?.narration]));
    const script: WechatVideoScript = {
      opening: line(s.opening, "opening", VIDEO_LINE_MAX),
      segments: before.script.segments.map((x) => ({ key: x.key, narration: given.has(x.key) ? line(given.get(x.key), "narration", VIDEO_LINE_MAX) : x.narration })),
      closing: line(s.closing, "closing", VIDEO_LINE_MAX),
      caption: line(s.caption, "caption", VIDEO_CAPTION_MAX),
    };
    await tx`UPDATE wechat_videos SET script = ${tx.json(script as never)}, edited_by = ${actor}, updated_at = now() WHERE report_key = ${key}`;
    await audit(actor, "wechat.video.edit", `wechat:${key}`, null, before.script, script, { db: tx });
    return { ok: true as const };
  });
}

/** The draft API's own limit on an article's body, in characters. */
const CONTENT_MAX = 20_000;

/**
 * Puts the issue as it stands into the 公众号's draft box: a new draft the first time, the same draft
 * afterwards, and a new one again once that draft is gone (published or deleted in the backend). The
 * cover is uploaded again only when it changed.
 */
export async function pushWechatDraft(date: string, actor: string): Promise<{ action: "created" | "updated" | "recreated"; revision: number }> {
  const key = dateKey(date);
  if (!config.wechatDraftEnabled) throw new Conflict("推送草稿没有打开（WECHAT_DRAFT_ENABLED）。");
  if (!wechatConfigured()) throw new Conflict("没有配置公众号的 WECHAT_APPID 和 WECHAT_APPSECRET。");
  const found = await issue(key);
  if (found.status !== "ready") throw new Conflict("这一天没有可以推送的早报。");
  const { cover, row, revision, illustrations } = found;
  if (Array.from(found.article.title).length > WECHAT_TITLE_MAX) throw bad(`标题超过 ${WECHAT_TITLE_MAX} 字，公众号不收，请先改短。`);
  if (Array.from(found.article.digest).length > WECHAT_DIGEST_MAX) throw bad(`摘要超过 ${WECHAT_DIGEST_MAX} 字，请先改短。`);
  const etag = wechatCoverEtag(cover);
  let coverId: string;
  let mediaId = row.push?.draftMediaId ?? null;
  let action: "created" | "updated" | "recreated" = "created";
  try {
    coverId = row.push?.coverEtag === etag
      ? row.push.coverMediaId
      : await uploadWechatImage((await renderWechatCover(cover)).png, `ai-zaobao-${key}.png`);
    // The body prints its pictures from the 公众号's own addresses; each picture is uploaded once.
    const images = new Map<string, string>();
    for (const e of found.article.entries) {
      const picture = illustrations.get(e.key);
      if (e.hidden || !picture?.file) continue;
      let url = picture.wechatUrl;
      if (!url) {
        const jpeg = await wechatIllustrationJpeg(key, e.key);
        if (!jpeg) continue;
        url = await uploadWechatArticleImage(jpeg, picture.file);
        await sql`UPDATE wechat_illustrations SET wechat_url = ${url} WHERE report_key = ${key} AND entry_key = ${e.key} AND file = ${picture.file}`;
      }
      images.set(e.key, url);
    }
    const article = found.render(images);
    if (Array.from(article.html).length > CONTENT_MAX) throw bad("正文太长，公众号不收；隐藏几条再推。");
    const draft: WechatDraftArticle = {
      title: article.title, author: SITE.name.slice(0, 16), digest: article.digest, content: article.html,
      content_source_url: article.readMoreUrl, thumb_media_id: coverId, need_open_comment: 1, only_fans_can_comment: 0,
      pic_crop_235_1: WECHAT_COVER_WIDE, pic_crop_1_1: WECHAT_COVER_SQUARE,
    };
    if (mediaId) action = (await updateWechatDraft(mediaId, draft)) ? "updated" : "recreated";
    if (action !== "updated") mediaId = await addWechatDraft(draft);
  } catch (error) {
    // The account's refusals are the editor's to fix (allowlist, permissions), shown as they are.
    if (error instanceof WechatApiError) throw new Conflict(error.message);
    throw error;
  }
  const push: Pushed = { draftMediaId: mediaId!, coverMediaId: coverId, coverEtag: etag, at: new Date().toISOString(), revision, by: actor, images: found.imagesEtag };
  await sql.begin(async (tx) => {
    await tx`
      INSERT INTO wechat_issues (report_key, push) VALUES (${key}, ${tx.json(push as never)})
      ON CONFLICT (report_key) DO UPDATE SET push = EXCLUDED.push`;
    await audit(actor, "wechat.push", `wechat:${key}`, null, row.push, push, { db: tx });
  });
  return { action, revision };
}
