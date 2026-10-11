// A day's daily report as a 公众号 article for the editor to paste by hand: the Chinese edition only,
// and only once it and every entry it shows are in Chinese.
import { calendarDate } from "@aihot/contracts/time";
import { config } from "../config.ts";
import { localizePublication } from "../publication/content-language.ts";
import { loadReport } from "../publication/reports.ts";
import { editionGap } from "../newsletter/issue.ts";
import { issueSections } from "../newsletter/mail.ts";
import { wechatArticle, type WechatArticle } from "../newsletter/wechat.ts";

export type WechatExport =
  | { date: string; status: "no_report" | "empty" }
  | { date: string; status: "not_ready"; reason: string }
  | { date: string; status: "ready"; article: WechatArticle };

export async function wechatExport(date?: string): Promise<WechatExport> {
  const key = date || calendarDate(Date.now(), config.reportTimeZone);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) throw Object.assign(new Error("date must be YYYY-MM-DD"), { statusCode: 400 });
  const source = await loadReport("daily", key);
  if (!source) return { date: key, status: "no_report" };
  const report = await localizePublication(source, "zh");
  const gap = editionGap(report, "zh");
  if (gap) return { date: key, status: "not_ready", reason: gap };
  if (issueSections(report).length === 0) return { date: key, status: "empty" };
  return { date: key, status: "ready", article: wechatArticle(report) };
}
