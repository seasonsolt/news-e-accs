// The 视频号 edition of 「AI 早报」: a 60–90 second vertical video of the day's first printed entries, one
// spoken paragraph each. 视频号 has no API to publish a video, and the server has neither the voice
// model nor the cycles to render one, so the work is split: the workbench asks for a voice-over script
// (admin/wechat.ts), the worker writes it here with the model (industry/prompts/wechat-video.md), reads
// that draft aloud once (industry/prompts/wechat-video-read.md) and the editor may rewrite it, then
// scripts/wechat-video.ts on the editor's Mac reads it (videoSpec, through the WECHAT_VIDEO_TOKEN route),
// speaks it with the local voice model, renders the frames (media/wechat-video-frames.ts) and cuts the
// mp4 that the editor uploads by hand. The closing and the caption are written by rule. The opening is
// one sentence from the day's first entry; the ruled greeting is used when that sentence does not hold.
import { z } from "zod";
import { stripMarkup } from "@aihot/industry/speech";
import { PLAIN_TERMS } from "@aihot/industry/taxonomy";
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
/** The prompt asks for one sentence of at most 40 characters; a little past that still fits the opening. */
const OPENING_MAX = 48;
/** Longest an editor may make one spoken paragraph, and the caption (视频号 takes 1,000 characters). */
export const VIDEO_LINE_MAX = 300;
export const VIDEO_CAPTION_MAX = 1000;
const HASHTAGS = ["#AI", "#人工智能", "#AI早报", "#科技新闻"];

const DRAFT_VERSION = promptVersion("wechat-video");
const READ_VERSION = promptVersion("wechat-video-read");
const ScriptSchema = z.object({
  opening: z.string().optional(),
  segments: z.array(z.object({ n: z.number().int(), narration: z.string() })),
});

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

type SpokenEntry = Pick<ColumnEntry, "title" | "body" | "comment">;

const corpusOf = (entry: SpokenEntry) => `${entry.title}\n${entry.body ?? ""}\n${entry.comment ?? ""}`;

/**
 * Bigrams that show up in a greeting and say nothing about the lead. An opening has to share a name
 * or some other two characters with the lead, so “早上好” cannot replace the hook.
 */
const LEAD_STOP = new Set(["今天", "这个", "一个", "我们", "他们", "已经", "可以", "没有", "不是", "就是", "还是", "因为", "所以", "如果", "不过", "另外", "同时", "目前", "这里", "早上", "大家", "值得", "关注", "新闻"]);

const PLAIN_CITE = new Set(PLAIN_TERMS);

function citesLead(shown: string, lead: string): boolean {
  const known = lead.toLowerCase();
  const latin = shown.match(/[A-Za-z][A-Za-z0-9.+-]*/g) ?? [];
  // A short or generic token such as AI does not make a greeting into a hook, and it has to be its own word.
  if (latin.some((word) => {
    const token = word.toLowerCase().replace(/[.+-]+$/, "");
    if (token.length < 3 || PLAIN_CITE.has(token)) return false;
    return new RegExp(`(?<![a-z0-9])${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![a-z0-9])`).test(known);
  })) return true;
  for (const run of shown.match(/\p{Script=Han}{2,}/gu) ?? []) {
    for (let i = 0; i < run.length - 1; i++) {
      const bi = run.slice(i, i + 2);
      if (!LEAD_STOP.has(bi) && lead.includes(bi)) return true;
    }
  }
  return false;
}

/** One sentence, no shout, and it names something the lead names. The stored line may keep pause and stress marks. */
export function acceptedOpening(opening: string | undefined, lead: SpokenEntry): string | null {
  const text = opening?.replace(/\s+/g, " ").trim();
  if (!text) return null;
  const shown = stripMarkup(text);
  const body = shown.replace(/。+$/u, "");
  if (!body || Array.from(shown).length > OPENING_MAX || /[!！]/.test(shown) || /[。！？!?；;]/.test(body)) return null;
  if (body === lead.title.replace(/[。！？\s]+$/u, "")) return null;
  const corpus = corpusOf(lead);
  if (!citesLead(shown, corpus) || !grounded(shown, corpus)) return null;
  return /。$/.test(text) ? text : `${text}。`;
}

/**
 * A paragraph that reads aloud in about ten seconds and names nothing its entry does not.
 * Pause (`[[停]]`) and stress (`**词**`) marks stay in the stored line; they are not part of its length.
 * Null when the line is empty, too long, a shout, or ungrounded.
 */
export function acceptedNarration(narration: string | undefined, entry: SpokenEntry): string | null {
  const text = narration?.replace(/\s+/g, " ").trim();
  if (!text) return null;
  const shown = stripMarkup(text);
  if (!shown || Array.from(shown).length > NARRATION_MAX || /[!！]/.test(shown)) return null;
  return grounded(shown, corpusOf(entry)) ? text : null;
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
    const source = entries.map((e, k) => [`${k + 1}. ${e.title}`, e.body ?? "", e.comment ? `点评：${e.comment}` : ""].filter(Boolean).join("\n")).join("\n\n");
    const fingerprint = sha256(stableJson(entries.map((e) => [e.key, e.title, e.body, e.comment])));
    const draft = await chatJson({
      model, purpose: "wechat_video", promptVersion: DRAFT_VERSION, attemptTag: job.request,
      subject: `wechat-video:${job.date}@${fingerprint}`,
      system: promptText("wechat-video"), user: source,
      schema: ScriptSchema, temperature: 0.6, maxTokens: 2200,
    });
    // A second pass reads the draft aloud. A failure here keeps the draft; the greeting and the titles
    // are still there when a line does not hold.
    let read: { data: z.infer<typeof ScriptSchema>; receiptId: number } | null = null;
    try {
      read = await chatJson({
        model, purpose: "wechat_video", promptVersion: READ_VERSION, attemptTag: job.request,
        subject: `wechat-video-read:${job.date}@${fingerprint}`,
        system: promptText("wechat-video-read"),
        user: `条目：\n${source}\n\n草稿：\n${JSON.stringify({ opening: draft.data.opening ?? "", segments: draft.data.segments })}`,
        schema: ScriptSchema, temperature: 0.3, maxTokens: 2200,
      });
    } catch (error) {
      console.error("[wechat.video] read-aloud", logError(error));
    }
    const ruled = ruledParts(job.date, issue.article, entries);
    const lead = entries[0]!;
    const draftLines = new Map(draft.data.segments.map((s) => [s.n, s.narration]));
    const readLines = new Map(read?.data.segments.map((s) => [s.n, s.narration]) ?? []);
    const script: WechatVideoScript = {
      ...ruled,
      opening: acceptedOpening(read?.data.opening, lead) ?? acceptedOpening(draft.data.opening, lead) ?? ruled.opening,
      segments: entries.map((e, k) => ({ key: e.key, narration: acceptedNarration(readLines.get(k + 1), e) ?? acceptedNarration(draftLines.get(k + 1), e) ?? fallback(e) })),
    };
    const receiptIds = [draft.receiptId, ...(read && read.receiptId !== draft.receiptId ? [read.receiptId] : [])];
    const kept = await sql.begin(async (tx) => {
      const updated = await tx`
        UPDATE wechat_videos SET status = 'done', script = ${tx.json(script as never)}, error = NULL, model = ${model}, receipt_id = ${receiptIds.at(-1)!},
          edited_by = NULL, updated_at = now()
        WHERE ${mine}`;
      for (const id of receiptIds) await completeReceipt(tx, id);
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
