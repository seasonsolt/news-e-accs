// A day's 公众号 column 「AI 早报」 for the editor to paste by hand (newsletter/wechat-column.ts), with the
// comments the worker has written for it so far.
import { calendarDate } from "@aihot/contracts/time";
import { config } from "../config.ts";
import { WECHAT_MIN_ENTRIES, wechatColumn } from "../newsletter/wechat-column.ts";
import { wechatComments } from "../newsletter/wechat-comments.ts";
import { wechatArticle, type WechatArticle } from "../newsletter/wechat.ts";

export type WechatExport =
  | { date: string; status: "no_report" | "empty" }
  | { date: string; status: "not_ready"; reason: string }
  | { date: string; status: "ready"; minimum: number; article: WechatArticle };

export async function wechatExport(date?: string): Promise<WechatExport> {
  const key = date || calendarDate(Date.now(), config.reportTimeZone);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) throw Object.assign(new Error("date must be YYYY-MM-DD"), { statusCode: 400 });
  const column = await wechatColumn(key);
  if (column.status === "not_ready") return { date: key, status: "not_ready", reason: column.reason };
  if (column.status !== "ready") return { date: key, status: column.status };
  const article = wechatArticle(column.report, column.extra, await wechatComments(key));
  return { date: key, status: "ready", minimum: WECHAT_MIN_ENTRIES, article };
}
