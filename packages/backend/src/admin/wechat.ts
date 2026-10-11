// The 公众号 workbench: a day's column 「AI 早报」 (newsletter/wechat-column.ts) with the comments the worker
// has written for it and the editor's changes (wechat_issues), the changes themselves, and the recent issues.
import { calendarDate } from "@aihot/contracts/time";
import { audit, Conflict } from "../audit.ts";
import { config } from "../config.ts";
import { sql } from "../db.ts";
import { WECHAT_MIN_ENTRIES, wechatColumn } from "../newsletter/wechat-column.ts";
import { wechatComments } from "../newsletter/wechat-comments.ts";
import { isWechatTheme, wechatArticle, WECHAT_DIGEST_MAX, WECHAT_THEMES, WECHAT_TITLE_MAX, type WechatArticle, type WechatEdits } from "../newsletter/wechat.ts";

export type WechatExport =
  | { date: string; status: "no_report" | "empty" }
  | { date: string; status: "not_ready"; reason: string }
  | {
      date: string; status: "ready"; minimum: number; revision: number; edits: WechatEdits; article: WechatArticle;
      limits: { title: number; digest: number }; themes: Array<{ key: string; label: string }>;
    };

export interface WechatIssueRow { date: string; issueNumber: number; edited: boolean; updatedAt: string | null; updatedBy: string | null; comments: number }

const THEMES = Object.entries(WECHAT_THEMES).map(([key, t]) => ({ key, label: t.label }));
/** Longest text an editor may keep in one field; the column is a digest, not an essay. */
const FIELD_MAX = 2000;

function dateKey(date: string | undefined): string {
  const key = date || calendarDate(Date.now(), config.reportTimeZone);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) throw Object.assign(new Error("date must be YYYY-MM-DD"), { statusCode: 400 });
  return key;
}

async function stored(key: string): Promise<{ edits: WechatEdits; revision: number }> {
  const [row] = await sql<{ edits: WechatEdits; revision: number }[]>`SELECT edits, revision FROM wechat_issues WHERE report_key = ${key}`;
  return row ?? { edits: {}, revision: 0 };
}

export async function wechatExport(date?: string): Promise<WechatExport> {
  const key = dateKey(date);
  const column = await wechatColumn(key);
  if (column.status === "not_ready") return { date: key, status: "not_ready", reason: column.reason };
  if (column.status !== "ready") return { date: key, status: column.status };
  const { edits, revision } = await stored(key);
  const article = wechatArticle(column.report, column.extra, await wechatComments(key), edits);
  return {
    date: key, status: "ready", minimum: WECHAT_MIN_ENTRIES, revision, edits, article,
    limits: { title: WECHAT_TITLE_MAX, digest: WECHAT_DIGEST_MAX }, themes: THEMES,
  };
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

/** The latest dailies, newest first, with whether the workbench changed them and how many comments they have. */
export async function wechatIssues(limit = 30): Promise<{ rows: WechatIssueRow[] }> {
  const rows = await sql<WechatIssueRow[]>`
    SELECT r.key AS date, (row_number() OVER (ORDER BY r.key))::int AS "issueNumber", (w.report_key IS NOT NULL AND w.edits <> '{}'::jsonb) AS edited,
           w.updated_at AS "updatedAt", w.updated_by AS "updatedBy",
           (SELECT count(*)::int FROM wechat_comments c WHERE c.report_key = r.key) AS comments
    FROM reports r LEFT JOIN wechat_issues w ON w.report_key = r.key
    WHERE r.kind = 'daily' ORDER BY r.key DESC LIMIT ${Math.min(Math.max(limit, 1), 100)}`;
  return { rows };
}
