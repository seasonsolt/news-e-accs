// The site's one-line comment on each entry of the 公众号 column 「AI 早报」 (industry/prompts/wechat-comment.md),
// written by the worker once the day's column is ready and kept per day and entry; the export prints the
// ones it finds. One model call comments every entry still without one, in the voice of the comments the
// editor rewrote in the workbench lately (given as examples). A comment that runs long, shouts, or names
// a figure or Latin name none of the day's entries names is not kept: its entry is asked once more on
// its own with the others still missing, and the same question is never paid for twice (its receipt).
import { z } from "zod";
import { calendarDate } from "@aihot/contracts/time";
import { config } from "../config.ts";
import { sql } from "../db.ts";
import { modelFor } from "../editorial/models.ts";
import { promptText, promptVersion } from "../editorial/prompts.ts";
import { sha256, stableJson } from "../lib/ids.ts";
import { chatJson } from "../providers/llm.ts";
import { completeReceipt } from "../providers/receipts.ts";
import { grounded } from "../reports/compose.ts";
import { wechatColumn } from "./wechat-column.ts";
import { wechatEntries } from "./wechat.ts";

type Entry = ReturnType<typeof wechatEntries>[number];

const VERSION = promptVersion("wechat-comment");
/** The prompt asks for 20–60 characters; anything past this is no longer a comment. */
const COMMENT_MAX = 90;
/** How many of the editor's rewrites the model is shown. */
const EXAMPLES = 12;
const CommentsSchema = z.object({ comments: z.array(z.object({ n: z.number().int(), comment: z.string() })) });

export async function wechatComments(key: string): Promise<Map<string, string>> {
  const rows = await sql<{ item_id: string; comment: string }[]>`SELECT item_id, comment FROM wechat_comments WHERE report_key = ${key}`;
  return new Map(rows.map((r) => [r.item_id, r.comment]));
}

/** The comments the editor wrote over the generated ones, newest first, with the entries' titles. */
async function editorComments(): Promise<string> {
  const rows = await sql<{ title: string; comment: string }[]>`
    SELECT coalesce(nullif(btrim(e.value->>'title'), ''), p.title) AS title, btrim(e.value->>'comment') AS comment
    FROM wechat_issues i CROSS JOIN LATERAL jsonb_each(i.edits->'entries') e
    LEFT JOIN publications p ON p.article_id = e.key
    LEFT JOIN wechat_comments c ON c.report_key = i.report_key AND c.item_id = e.key
    WHERE nullif(btrim(e.value->>'comment'), '') IS NOT NULL AND btrim(e.value->>'comment') IS DISTINCT FROM c.comment
      AND coalesce(nullif(btrim(e.value->>'title'), ''), p.title) IS NOT NULL
    ORDER BY i.report_key DESC, e.key LIMIT ${EXAMPLES}`;
  return rows.length ? rows.map((r) => `- 「${r.title}」\n  点评：${r.comment}`).join("\n") : "（还没有）";
}

/** `day`: every entry of the column, whose names a comment may bring in. */
function usable(comment: string, day: string): string | null {
  const text = comment.trim();
  if (!text || Array.from(text).length > COMMENT_MAX || /[!！]/.test(text)) return null;
  return grounded(text, day) ? text : null;
}

/** Comments the day's column (today on the report calendar unless `date`); nothing while it is not ready. */
export async function commentWechatColumn(date?: string): Promise<{ status: string; written?: number }> {
  if (!config.modelCallsEnabled) return { status: "disabled" };
  const key = date ?? calendarDate(Date.now(), config.reportTimeZone);
  const column = await wechatColumn(key);
  if (column.status !== "ready") return { status: column.status };
  const have = await wechatComments(key);
  const entries = wechatEntries(column.report, column.extra);
  const day = entries.map((e) => `${e.title}\n${e.body ?? ""}`).join("\n");
  const missing = entries
    .filter((e): e is Entry & { itemId: string } => e.itemId !== null && !have.has(e.itemId));
  if (!missing.length) return { status: "done", written: 0 };
  const model = await modelFor("wechat");
  const res = await chatJson({
    model, purpose: "wechat_comment", promptVersion: VERSION,
    subject: `wechat:${key}@${sha256(stableJson(missing.map((e) => [e.itemId, e.title, e.body])))}`,
    system: promptText("wechat-comment", { examples: await editorComments() }),
    user: missing.map((e, k) => `${k + 1}. ${e.title}\n${e.body ?? ""}`.trim()).join("\n\n"),
    schema: CommentsSchema, temperature: 0.7, maxTokens: 2000,
  });
  const written = await sql.begin(async (tx) => {
    let count = 0;
    for (const { n, comment } of res.data.comments) {
      const entry = missing[n - 1];
      const text = entry && usable(comment, day);
      if (!entry || !text) continue;
      const inserted = await tx`INSERT INTO wechat_comments (report_key, item_id, comment, model, receipt_id)
        VALUES (${key}, ${entry.itemId}, ${text}, ${model}, ${res.receiptId}) ON CONFLICT DO NOTHING`;
      count += inserted.count;
    }
    await completeReceipt(tx, res.receiptId);
    return count;
  });
  return { status: "done", written };
}
