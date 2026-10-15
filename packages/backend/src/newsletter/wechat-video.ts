// The 视频号 edition of 「AI 早报」: a one-minute vertical video of the day's first printed entries: the
// first told at length as the day's lead, the rest as one-line quick hits, and a wry last word on any of
// the day's entries. 视频号 has no API to publish a video, and the server has neither the voice
// model nor the cycles to render one, so the work is split: the workbench asks for a voice-over script
// (admin/wechat.ts), the worker writes it here with the model (industry/prompts/wechat-video.md) and the
// editor may rewrite it, then scripts/wechat-video.ts on the editor's Mac reads it (videoSpec, through
// the WECHAT_VIDEO_TOKEN route), speaks it with the local voice model, animates it with HyperFrames
// (scripts/wechat-video-composition.ts) and cuts the mp4 that the editor uploads by hand. The opening,
// closing and caption are written by rule; the entries' paragraphs and the last word are the model's.
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

/** Entries a video speaks: the lead (about 25 seconds) and five quick hits (about 4 seconds each). */
export const VIDEO_ENTRIES = 6;
/**
 * The prompt asks for 80–110 characters for the lead, 15–30 for a quick hit, 20–40 for the last word and
 * up to 12 for a point shown on the lead's card; past these they do not fit their time or their line.
 */
const LEAD_MAX = 140;
const BRIEF_MAX = 40;
const EGG_MAX = 60;
const POINT_MAX = 14;
/** Points the lead's card shows, at most. */
export const VIDEO_POINTS = 3;
/** Longest an editor may make one spoken paragraph or a point, and the caption (视频号 takes 1,000 characters). */
export const VIDEO_LINE_MAX = 300;
export const VIDEO_POINT_MAX = 20;
export const VIDEO_CAPTION_MAX = 1000;
const HASHTAGS = ["#AI", "#人工智能", "#AI早报", "#科技新闻"];

const VERSION = promptVersion("wechat-video");
const ScriptSchema = z.object({
  segments: z.array(z.object({ n: z.number().int(), narration: z.string(), points: z.array(z.string()).optional() })),
  egg: z.object({ n: z.number().int(), line: z.string() }).nullable().optional(),
});
/** What the closing joke is introduced with. */
const EGG_LEAD_IN = "最后来个彩蛋。";

export interface WechatVideoScript {
  opening: string;
  /** In speaking order, by the column's entry key: the lead (with the points its card shows), then the quick hits. */
  segments: Array<{ key: string; narration: string; points?: string[] }>;
  /** The last word, on any entry the column prints; null when none fits. Scripts written before it have none. */
  egg?: { key: string; narration: string } | null;
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
  /** The site's host, said on the closing card. */
  site: string;
  opening: string;
  closing: string;
  caption: string;
  segments: Array<{ key: string; number: number; section: string; sourceName: string; title: string; narration: string; points: string[]; hasImage: boolean }>;
  egg: { key: string; section: string; sourceName: string; title: string; narration: string; hasImage: boolean } | null;
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

const printed = (article: WechatArticle) => article.entries.filter((e) => !e.hidden);

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
  const plan = entries.length > 1 ? `今天重点说一件事，再快速过 ${entries.length - 1} 条消息。` : "今天说一件事。";
  return {
    opening: `早上好，这里是 ${WECHAT_COLUMN}。${monthDay(key)}，${plan}`,
    closing: "每条消息的原文出处，在视频下方的完整早报里。明天早上见。",
    caption: clip([`${WECHAT_COLUMN}｜${monthDay(key)}`, ...headlines, "", `完整早报：${article.readMoreUrl}`, "", HASHTAGS.join(" ")].join("\n"), VIDEO_CAPTION_MAX),
  };
}

/** Text that fits `max` characters and names nothing its entry does not; else null. */
function usable(text: string | undefined, entry: ColumnEntry, max: number): string | null {
  const clean = text?.replace(/\s+/g, " ").trim();
  if (!clean || Array.from(clean).length > max || /[!！]/.test(clean)) return null;
  return grounded(clean, `${entry.title}\n${entry.body ?? ""}\n${entry.comment ?? ""}`) ? clean : null;
}

/** A lead without a usable paragraph is read as its title and its comment; a quick hit as its title. */
const fallback = (entry: ColumnEntry, lead: boolean) =>
  (lead ? [entry.title, entry.comment] : [entry.title]).filter(Boolean).map((s) => s!.replace(/[。.]$/, "")).join("。") + "。";

/** What the model is shown of an entry: its title, the start of its text and the comment. */
const brief = (e: ColumnEntry, n: number) => [`${n}. ${e.title}`, clip(e.body ?? "", 400), e.comment ? `点评：${e.comment}` : ""].filter(Boolean).join("\n");

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
    const all = issue ? printed(issue.article) : [];
    const entries = all.slice(0, VIDEO_ENTRIES);
    if (!issue || !entries.length) throw new Error("这一天没有可以做视频的早报。");
    const others = all.slice(VIDEO_ENTRIES);
    const model = await modelFor("wechat");
    const res = await chatJson({
      model, purpose: "wechat_video", promptVersion: VERSION, attemptTag: job.request,
      subject: `wechat-video:${job.date}@${sha256(stableJson(all.map((e) => [e.key, e.title, e.body, e.comment])))}`,
      system: promptText("wechat-video"),
      user: [
        `视频里的条目（1 是重点，其余是快讯）：\n\n${entries.map((e, k) => brief(e, k + 1)).join("\n\n")}`,
        others.length ? `彩蛋候选：\n\n${others.map((e, k) => brief(e, VIDEO_ENTRIES + k + 1)).join("\n\n")}` : "",
      ].filter(Boolean).join("\n\n"),
      schema: ScriptSchema, temperature: 0.6, maxTokens: 2000,
    });
    const written = new Map(res.data.segments.map((s) => [s.n, s]));
    const lead = written.get(1);
    const eggEntry = res.data.egg ? all[res.data.egg.n - 1] : undefined;
    const joke = eggEntry && usable(res.data.egg!.line, eggEntry, EGG_MAX);
    const script: WechatVideoScript = {
      ...ruledParts(job.date, issue.article, entries),
      segments: entries.map((e, k) => k === 0
        ? {
            key: e.key, narration: usable(lead?.narration, e, LEAD_MAX) ?? fallback(e, true),
            points: (lead?.points ?? []).flatMap((p) => usable(p.replace(/[。.]$/, ""), e, POINT_MAX) ?? []).slice(0, VIDEO_POINTS),
          }
        : { key: e.key, narration: usable(written.get(k + 1)?.narration, e, BRIEF_MAX) ?? fallback(e, false) }),
      egg: eggEntry && joke ? { key: eggEntry.key, narration: EGG_LEAD_IN + joke } : null,
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
 * prints them now (edited titles, current order of the script). A paragraph or last word whose entry is
 * gone or hidden since is left out. Null without a finished script.
 */
export async function videoSpec(key: string): Promise<WechatVideoSpec | null> {
  const [row, issue, pictures] = await Promise.all([
    wechatVideo(key), printedIssue(key),
    sql<{ entry_key: string }[]>`SELECT entry_key FROM wechat_illustrations WHERE report_key = ${key} AND file IS NOT NULL`,
  ]);
  if (!row?.script || !issue) return null;
  const shown = new Map(printed(issue.article).map((e) => [e.key, e]));
  const withImage = new Set(pictures.map((p) => p.entry_key));
  const card = (key: string, narration: string) => {
    const entry = shown.get(key);
    return entry && narration.trim()
      ? { key, section: entry.section, sourceName: entry.sourceName, title: entry.title, narration: narration.trim(), hasImage: withImage.has(key) }
      : null;
  };
  const segments = row.script.segments.flatMap((s, k) => {
    const c = card(s.key, s.narration);
    return c ? [{ ...c, points: k === 0 ? (s.points ?? []).filter((p) => p.trim()) : [] }] : [];
  });
  return {
    date: key, issueNumber: issue.issueNumber, theme: issue.article.theme, site: new URL(issue.article.readMoreUrl).host,
    opening: row.script.opening, closing: row.script.closing, caption: row.script.caption,
    segments: segments.map((s, k) => ({ ...s, number: k + 1 })),
    egg: row.script.egg ? card(row.script.egg.key, row.script.egg.narration) : null,
  };
}
