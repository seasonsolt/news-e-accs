// The 视频号 edition of 「AI 早报」: a 60–90 second vertical video of the day's first printed entries, one
// spoken paragraph each. 视频号 has no API to publish a video, and the server has neither the voice
// model nor the cycles to render one, so the work is split: the workbench asks for a voice-over script
// (admin/wechat.ts), the worker writes it here with the model (industry/prompts/wechat-video.md) and the
// editor may rewrite it, then scripts/wechat-video.ts on the editor's Mac reads it (videoSpec, through
// the WECHAT_VIDEO_TOKEN route), speaks it with the local voice model, renders the frames
// (media/wechat-video-frames.ts) and cuts the mp4 that the editor uploads by hand. The opening, closing
// and caption are written by rule; only the entries' paragraphs are the model's.
import { z } from "zod";
import { config } from "../config.ts";
import { sql } from "../db.ts";
import { modelFor } from "../editorial/models.ts";
import { promptText, promptVersion } from "../editorial/prompts.ts";
import { sha256, stableJson } from "../lib/ids.ts";
import { logError } from "../lib/log-error.ts";
import { chatJson } from "../providers/llm.ts";
import { BudgetExceededError, completeReceipt, ReceiptBusyError, ReceiptUnknownError } from "../providers/receipts.ts";
import { grounded } from "../reports/compose.ts";
import { wechatColumn } from "./wechat-column.ts";
import { wechatComments } from "./wechat-comments.ts";
import { WECHAT_COLUMN, wechatArticle, type ColumnEntry, type WechatArticle, type WechatEdits, type WechatTheme } from "./wechat.ts";

/** Entries a video speaks: about ten seconds each keeps it under a minute and a half. */
export const VIDEO_ENTRIES = 6;
/** The prompt asks for 30–60 characters; anything past this does not fit its ten seconds. */
const NARRATION_MAX = 90;
/** Longest an editor may make one spoken paragraph, and the caption (视频号 takes 1,000 characters). */
export const VIDEO_LINE_MAX = 300;
export const VIDEO_CAPTION_MAX = 1000;
const HASHTAGS = ["#AI", "#人工智能", "#AI早报", "#科技新闻"];

const VERSION = promptVersion("wechat-video");
const SegmentsSchema = z.object({ segments: z.array(z.object({ n: z.number().int(), narration: z.string() })) });

export interface WechatVideoScript {
  opening: string;
  /** In speaking order, by the column's entry key. */
  segments: Array<{ key: string; narration: string }>;
  closing: string;
  caption: string;
}

export interface WechatVideoRow {
  status: "queued" | "writing" | "done" | "failed";
  request: string;
  script: WechatVideoScript | null;
  error: string | null;
  requestedBy: string | null;
  editedBy: string | null;
  updatedAt: string;
}

/** What the Mac renders: the script joined with the entries as the column prints them now. */
export interface WechatVideoSpec {
  date: string;
  issueNumber: number;
  theme: WechatTheme;
  opening: string;
  closing: string;
  caption: string;
  segments: Array<{ key: string; number: number; section: string; sourceName: string; title: string; narration: string; hasImage: boolean }>;
}

export async function wechatVideo(key: string): Promise<WechatVideoRow | null> {
  const [row] = await sql<WechatVideoRow[]>`
    SELECT status, request, script, error, requested_by AS "requestedBy", edited_by AS "editedBy", updated_at AS "updatedAt"
    FROM wechat_videos WHERE report_key = ${key}`;
  return row ?? null;
}

/** Why the worker cannot write a script here, or null when it can. */
export function scriptingUnavailable(): string | null {
  return config.modelCallsEnabled ? null : "模型调用没有打开（MODEL_CALLS_ENABLED），不能生成口播稿。";
}

/** The day's column as printed: the generated entries with the comments and the workbench's edits. */
export async function printedIssue(key: string): Promise<{ article: WechatArticle; issueNumber: number } | null> {
  const column = await wechatColumn(key);
  if (column.status !== "ready") return null;
  const [comments, [row]] = await Promise.all([
    wechatComments(key),
    sql<{ edits: WechatEdits }[]>`SELECT edits FROM wechat_issues WHERE report_key = ${key}`,
  ]);
  return { article: wechatArticle(column.report, column.extra, comments, row?.edits ?? {}), issueNumber: column.report.issueNumber };
}

const spoken = (article: WechatArticle) => article.entries.filter((e) => !e.hidden).slice(0, VIDEO_ENTRIES);

const monthDay = (key: string) => {
  const [, m, d] = key.split("-").map(Number) as [number, number, number];
  return `${m} 月 ${d} 日`;
};

function clip(s: string, max: number): string {
  const chars = Array.from(s.trim());
  return chars.length <= max ? chars.join("") : `${chars.slice(0, max - 1).join("")}…`;
}

/** The script's parts written by rule, for the entries the video speaks. */
export function ruledParts(key: string, article: WechatArticle, entries: ColumnEntry[]): Omit<WechatVideoScript, "segments"> {
  const headlines = entries.map((e, k) => `${String(k + 1).padStart(2, "0")} ${e.title}`);
  return {
    opening: `早上好，这里是 ${WECHAT_COLUMN}。${monthDay(key)}，${entries.length} 条值得关注的 AI 新闻。`,
    closing: "每条消息的原文出处，在视频下方的完整早报里。明天早上见。",
    caption: clip([`${WECHAT_COLUMN}｜${monthDay(key)}`, ...headlines, "", `完整早报：${article.readMoreUrl}`, "", HASHTAGS.join(" ")].join("\n"), VIDEO_CAPTION_MAX),
  };
}

/** A paragraph that reads aloud in about ten seconds and names nothing its entry does not; else null. */
function usable(narration: string | undefined, entry: ColumnEntry): string | null {
  const text = narration?.replace(/\s+/g, " ").trim();
  if (!text || Array.from(text).length > NARRATION_MAX || /[!！]/.test(text)) return null;
  return grounded(text, `${entry.title}\n${entry.body ?? ""}\n${entry.comment ?? ""}`) ? text : null;
}

/** An entry without a usable paragraph is read as its title, and its comment when it has one. */
const fallback = (entry: ColumnEntry) => [entry.title, entry.comment].filter(Boolean).map((s) => s!.replace(/[。.]$/, "")).join("。") + "。";

function failure(error: unknown): string {
  if (error instanceof BudgetExceededError) return "模型预算用完了，稍后再试，或在后台「设置 → 预算」里调高。";
  if (error instanceof ReceiptBusyError) return "同一份口播稿正在写，等它写完。";
  if (error instanceof ReceiptUnknownError) return "写稿中断了（超时或 worker 重启），可以重新生成。";
  return String(error instanceof Error ? error.message : error).slice(0, 600);
}

/** The worker's job: writes the script `request` asked for, unless a newer ask replaced it. */
export async function writeWechatVideoScript(job: { date: string; request: string }): Promise<{ status: string }> {
  const mine = sql`report_key = ${job.date} AND request = ${job.request}`;
  const unavailable = scriptingUnavailable();
  if (unavailable) {
    await sql`UPDATE wechat_videos SET status = 'failed', error = ${unavailable}, updated_at = now() WHERE ${mine} AND status IN ('queued', 'writing')`;
    return { status: "disabled" };
  }
  const claimed = await sql`UPDATE wechat_videos SET status = 'writing', updated_at = now() WHERE ${mine} AND status IN ('queued', 'writing') RETURNING 1`;
  if (!claimed.length) return { status: "superseded" };
  try {
    const issue = await printedIssue(job.date);
    const entries = issue ? spoken(issue.article) : [];
    if (!issue || !entries.length) throw new Error("这一天没有可以做视频的早报。");
    const model = await modelFor("wechat");
    const res = await chatJson({
      model, purpose: "wechat_video", promptVersion: VERSION, attemptTag: job.request,
      subject: `wechat-video:${job.date}@${sha256(stableJson(entries.map((e) => [e.key, e.title, e.body, e.comment])))}`,
      system: promptText("wechat-video"),
      user: entries.map((e, k) => [`${k + 1}. ${e.title}`, e.body ?? "", e.comment ? `点评：${e.comment}` : ""].filter(Boolean).join("\n")).join("\n\n"),
      schema: SegmentsSchema, temperature: 0.6, maxTokens: 2000,
    });
    const written = new Map(res.data.segments.map((s) => [s.n, s.narration]));
    const script: WechatVideoScript = {
      ...ruledParts(job.date, issue.article, entries),
      segments: entries.map((e, k) => ({ key: e.key, narration: usable(written.get(k + 1), e) ?? fallback(e) })),
    };
    const kept = await sql.begin(async (tx) => {
      const updated = await tx`
        UPDATE wechat_videos SET status = 'done', script = ${tx.json(script as never)}, error = NULL, model = ${model}, receipt_id = ${res.receiptId},
          edited_by = NULL, updated_at = now()
        WHERE ${mine}`;
      await completeReceipt(tx, res.receiptId);
      return updated.count > 0;
    });
    return { status: kept ? "done" : "superseded" };
  } catch (error) {
    console.error("[wechat.video]", logError(error));
    await sql`UPDATE wechat_videos SET status = 'failed', error = ${failure(error)}, updated_at = now() WHERE ${mine}`;
    return { status: "failed" };
  }
}

/**
 * What scripts/wechat-video.ts renders for the day: the stored script over the entries as the column
 * prints them now (edited titles, current order of the script). A paragraph whose entry is gone or
 * hidden since is left out. Null without a finished script.
 */
export async function videoSpec(key: string): Promise<WechatVideoSpec | null> {
  const [row, issue, pictures] = await Promise.all([
    wechatVideo(key), printedIssue(key),
    sql<{ entry_key: string }[]>`SELECT entry_key FROM wechat_illustrations WHERE report_key = ${key} AND file IS NOT NULL`,
  ]);
  if (!row?.script || !issue) return null;
  const shown = new Map(issue.article.entries.filter((e) => !e.hidden).map((e) => [e.key, e]));
  const withImage = new Set(pictures.map((p) => p.entry_key));
  const segments = row.script.segments.flatMap((s) => {
    const entry = shown.get(s.key);
    return entry && s.narration.trim() ? [{ key: s.key, section: entry.section, sourceName: entry.sourceName, title: entry.title, narration: s.narration.trim(), hasImage: withImage.has(s.key) }] : [];
  });
  return {
    date: key, issueNumber: issue.issueNumber, theme: issue.article.theme,
    opening: row.script.opening, closing: row.script.closing, caption: row.script.caption,
    segments: segments.map((s, k) => ({ ...s, number: k + 1 })),
  };
}
