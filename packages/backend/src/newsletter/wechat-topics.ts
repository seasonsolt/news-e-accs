// The topics of a day's 公众号 column 「AI 早报」 (industry/prompts/wechat-topics.md): entries about the same
// move grouped under a heading that is a judgment, and for each entry an earlier daily carried, one line
// on what is new since. Written by the worker once the day's column is ready, in one model call over
// every entry, and kept per day (wechat_topics); the editor renames topics and moves entries between them
// in the workbench (WechatEdits), and the headings the editor rewrote lately are the model's examples. A
// heading or line naming a figure or Latin name its entries do not name is not kept, and a topic left
// with fewer than two entries is dropped.
import { z } from "zod";
import { calendarDate } from "@aihot/contracts/time";
import { config } from "../config.ts";
import { sql } from "../db.ts";
import { modelFor } from "../editorial/models.ts";
import { promptText, promptVersion } from "../editorial/prompts.ts";
import { sha256, stableJson } from "../lib/ids.ts";
import { chatJson } from "../providers/llm.ts";
import { completeReceipt } from "../providers/receipts.ts";
import { localizePublication } from "../publication/content-language.ts";
import { loadReport } from "../publication/reports.ts";
import { grounded } from "../reports/compose.ts";
import { wechatColumn } from "./wechat-column.ts";
import { entryKey, wechatEntries, type WechatTopics } from "./wechat.ts";

type Entry = ReturnType<typeof wechatEntries>[number];

const VERSION = promptVersion("wechat-topics");
const TOPICS_MAX = 4;
/** How many of the editor's renamed headings the model is shown. */
const EXAMPLES = 12;
const TITLE_MAX = 24;
const FOLLOWUP_MAX = 60;
const TopicsSchema = z.object({
  topics: z.array(z.object({ title: z.string(), entries: z.array(z.number().int()) })),
  followups: z.array(z.object({ n: z.number().int(), text: z.string() })),
});

export async function wechatTopics(key: string): Promise<WechatTopics | null> {
  const [row] = await sql<WechatTopics[]>`SELECT topics, followups FROM wechat_topics WHERE report_key = ${key}`;
  return row ?? null;
}

/** The headings the editor rewrote over the generated ones, newest first, as "generated → editor's". */
async function editorHeadings(): Promise<string> {
  const rows = await sql<{ generated: string; title: string }[]>`
    SELECT t.topics -> (k.key::int) ->> 'title' AS generated, btrim(k.value) AS title
    FROM wechat_issues i JOIN wechat_topics t ON t.report_key = i.report_key
    CROSS JOIN LATERAL jsonb_each_text(coalesce(i.edits->'topicTitles', '{}'::jsonb)) k
    WHERE k.key ~ '^[0-9]+$' AND nullif(btrim(k.value), '') IS NOT NULL
      AND btrim(k.value) IS DISTINCT FROM t.topics -> (k.key::int) ->> 'title'
    ORDER BY i.report_key DESC, k.key LIMIT ${EXAMPLES}`;
  return rows.length ? rows.map((r) => `- ${r.generated ?? "（无）"} → ${r.title}`).join("\n") : "（还没有）";
}

const text = (e: Entry) => `${e.title}\n${e.body ?? ""}`;
const one = (value: string, max: number, corpus: string) => {
  const t = value.trim();
  return t && Array.from(t).length <= max && !/[!！]/.test(t) && grounded(t, corpus) ? t : null;
};

/** The title an earlier daily gave the event each follow-up continues, by entry key. */
async function earlierTitles(entries: Entry[]): Promise<Map<string, string>> {
  const following = entries.filter((e): e is Entry & { itemId: string; followUp: string } => !!e.itemId && !!e.followUp);
  if (!following.length) return new Map();
  const earlier = (await Promise.all([...new Set(following.map((e) => e.followUp))].map(async (date) => {
    const report = await loadReport("daily", date);
    return report ? wechatEntries(await localizePublication(report, "zh"), []).flatMap((e) => (e.itemId ? [{ date, itemId: e.itemId, title: e.title }] : [])) : [];
  }))).flat();
  const stories = new Map((await sql<{ article_id: string; story_id: number }[]>`
    SELECT article_id, story_id FROM publications
    WHERE article_id = ANY(${[...following, ...earlier].map((e) => e.itemId)}::text[]) AND story_id IS NOT NULL`).map((r) => [r.article_id, r.story_id]));
  const out = new Map<string, string>();
  for (const e of following) {
    const story = stories.get(e.itemId);
    const before = earlier.find((b) => b.date === e.followUp && story !== undefined && stories.get(b.itemId) === story);
    if (before) out.set(entryKey(e), before.title);
  }
  return out;
}

/** Groups the day's column (today on the report calendar unless `date`) once; nothing while it is not ready. */
export async function topicWechatColumn(date?: string): Promise<{ status: string; topics?: number }> {
  if (!config.modelCallsEnabled) return { status: "disabled" };
  const key = date ?? calendarDate(Date.now(), config.reportTimeZone);
  if (await wechatTopics(key)) return { status: "done" };
  const column = await wechatColumn(key);
  if (column.status !== "ready") return { status: column.status };
  const entries = wechatEntries(column.report, column.extra);
  const earlier = await earlierTitles(entries);
  const lines = entries.map((e, k) => {
    const before = earlier.get(entryKey(e));
    return `${k + 1}. ${e.title}${before ? `\n（跟进：之前的早报报道过「${before}」）` : ""}\n${e.body ?? ""}`.trim();
  });
  const model = await modelFor("wechat");
  const res = await chatJson({
    model, purpose: "wechat_topics", promptVersion: VERSION,
    subject: `wechat-topics:${key}@${sha256(stableJson(lines))}`,
    system: promptText("wechat-topics", { examples: await editorHeadings() }), user: lines.join("\n\n"),
    schema: TopicsSchema, temperature: 0.5, maxTokens: 2000,
  });
  const used = new Set<number>();
  const topics: WechatTopics["topics"] = [];
  for (const t of res.data.topics) {
    if (topics.length === TOPICS_MAX) break;
    const members = [...new Set(t.entries)].filter((n) => n >= 1 && n <= entries.length && !used.has(n));
    const title = one(t.title, TITLE_MAX, members.map((n) => text(entries[n - 1]!)).join("\n"));
    if (members.length < 2 || !title) continue;
    members.forEach((n) => used.add(n));
    topics.push({ title, entries: members.map((n) => entryKey(entries[n - 1]!)) });
  }
  const followups: WechatTopics["followups"] = {};
  for (const f of res.data.followups) {
    const entry = entries[f.n - 1];
    const before = entry && earlier.get(entryKey(entry));
    const line = before && one(f.text, FOLLOWUP_MAX, `${text(entry)}\n${before}`);
    if (line) followups[entryKey(entry)] = line;
  }
  await sql.begin(async (tx) => {
    await tx`INSERT INTO wechat_topics (report_key, topics, followups, model, receipt_id)
      VALUES (${key}, ${tx.json(topics as never)}, ${tx.json(followups as never)}, ${model}, ${res.receiptId}) ON CONFLICT DO NOTHING`;
    await completeReceipt(tx, res.receiptId);
  });
  return { status: "done", topics: topics.length };
}
