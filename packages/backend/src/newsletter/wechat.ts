// The daily as the 公众号 column 「AI 早报」, pasted by an editor. The 公众号 editor keeps inline styles
// on section/p/span but drops <style>, classes, web fonts and links outside mp.weixin.qq.com, so the
// body carries no links: the article's one 「阅读原文」 link leads to the web edition, where every
// entry links to its source. Laid out like the digest accounts readers know: headlines in the title,
// a greeting and an at-a-glance list, then numbered entries, each with the site's one-line comment once
// the worker has written it (wechat-comments.ts), and a closing that invites comments.
import type { ReportCitation, ReportDetail } from "@aihot/contracts/site";
import { SITE } from "@aihot/site";
import { editionPath } from "../publication/distribution.ts";
import { siteUrl } from "../publication/links.ts";
import { esc, issueSections } from "./mail.ts";

export const WECHAT_COLUMN = "AI 早报";
const COMMENT_LABEL = `${SITE.name} 点评`;
const C = { ink: "#2a1f16", ink3: "#62513f", ink4: "#8a7862", line: "#e6dcc8", tint: "#f7f1e5", accent: "#955418" };
/** The editor's limits for an article's title and digest, in characters. */
export const WECHAT_TITLE_MAX = 64;
export const WECHAT_DIGEST_MAX = 120;
/** Chinese reading speed for the greeting's estimate, in characters a minute. */
const CHARS_PER_MINUTE = 400;

/** One numbered entry: a citation and the section it is filed under. */
export type WechatEntry = ReportCitation & { section: string };

export interface WechatArticle {
  title: string;
  digest: string;
  /** For the article's 「阅读原文」 field. */
  readMoreUrl: string;
  html: string;
  text: string;
  /** Entries from the daily itself, those added after them, and how many of all carry a comment. */
  entries: { daily: number; added: number; commented: number };
}

const length = (s: string) => Array.from(s).length;

function clip(s: string, max: number): string {
  const chars = Array.from(s.trim());
  return chars.length <= max ? chars.join("") : `${chars.slice(0, max - 1).join("")}…`;
}

const monthDay = (key: string) => {
  const [, m, d] = key.split("-").map(Number) as [number, number, number];
  return `${m} 月 ${d} 日`;
};

const two = (n: number) => String(n).padStart(2, "0");

/**
 * The column's title: as many of the first headlines as fit after the column name, so the article
 * list shows what the day holds. The lead alone is clipped when even it does not fit. An export
 * always has at least one entry.
 */
function packTitle(headlines: string[]): string {
  const prefix = `${WECHAT_COLUMN}｜`;
  let title = "";
  for (const h of headlines) {
    const next = title ? `${title}；${h}` : h;
    if (length(prefix + next) > WECHAT_TITLE_MAX) break;
    title = next;
  }
  return title ? prefix + title : clip(prefix + headlines[0]!, WECHAT_TITLE_MAX);
}

/** A numbered entry as the column prints it. */
export type ColumnEntry = WechatEntry & { body: string | null };

/**
 * The daily's entries in reading order, the lead first (its body is the lead paragraph), then `extra`.
 * Each entry keeps its section as a label; the column numbers entries instead of grouping them.
 */
export function wechatEntries(report: ReportDetail, extra: WechatEntry[]): ColumnEntry[] {
  const daily: WechatEntry[] = [
    ...issueSections(report).flatMap((s) => s.items.map((i) => ({ ...i, section: s.label }))),
    ...report.flashes.filter((i) => i.available).map((i) => ({ ...i, section: "快讯" })),
  ];
  const lead = report.lead && (daily.find((e) => e.itemId !== null && e.itemId === report.leadItemId) ?? daily[0]);
  const rest = daily.filter((e) => e !== lead);
  return [
    ...(lead ? [{ ...lead, title: report.lead!.title, body: report.lead!.leadParagraph }] : []),
    ...[...rest, ...extra].map((e) => ({ ...e, body: e.summary })),
  ];
}

function note(e: WechatEntry): string {
  return [
    e.section,
    `来源：${e.sourceName}`,
    ...(e.otherSources ? [`另有 ${e.otherSources} 家信源报道`] : []),
    ...(e.followUp ? [`${monthDay(e.followUp)}早报报道过此事`] : []),
  ].join(" · ");
}

const related = (e: ReportCitation) => (e.related ?? []).filter((r) => r.available).map((r) => r.title);

/** `comments` by item id; an entry without one is printed without. */
export function wechatArticle(report: ReportDetail, extra: WechatEntry[] = [], comments: ReadonlyMap<string, string> = new Map()): WechatArticle {
  const entries = wechatEntries(report, extra);
  const commentOf = (e: ColumnEntry) => (e.itemId ? comments.get(e.itemId) : undefined);
  const host = new URL(siteUrl("/")).host;
  const headerLine = `${WECHAT_COLUMN} · ${monthDay(report.key)} · 第 ${report.issueNumber} 期`;
  const readable = entries.reduce((n, e) => n + length(e.title) + length(e.body ?? "") + length(commentOf(e) ?? ""), 0);
  const greeting = `早上好，今天 ${entries.length} 条 AI 新闻，约 ${Math.max(1, Math.round(readable / CHARS_PER_MINUTE))} 分钟读完。`;
  const invite = "你最关注今天哪一条？欢迎在评论区聊聊。";
  const closing = "点击文末「阅读原文」，查看网页版早报和每条消息的原文出处。";
  const signature = `${WECHAT_COLUMN}每天 08:00 更新 · ${host}`;

  const divider = `<p style="margin:28px 0;text-align:center;font-size:12px;letter-spacing:6px;color:${C.ink4};">· · ·</p>`;
  const glance = entries.map((e, k) =>
    `<p style="margin:${k ? 6 : 0}px 0 0;font-size:15px;line-height:1.6;color:${C.ink};"><span style="color:${C.accent};font-weight:bold;">${two(k + 1)}</span>　${esc(e.title)}</p>`).join("\n");
  const body = entries.map((e, k) => {
    const rel = related(e);
    const comment = commentOf(e);
    return [
      `<section style="margin:${k ? 32 : 0}px 0 0;">`,
      `<p style="margin:0;font-size:26px;font-weight:bold;line-height:1.2;color:${C.accent};">${two(k + 1)}</p>`,
      `<p style="margin:6px 0 0;font-size:17px;font-weight:bold;line-height:1.55;color:${C.ink};">${esc(e.title)}</p>`,
      ...(e.body ? [`<p style="margin:10px 0 0;font-size:15px;line-height:1.8;color:${C.ink3};">${esc(e.body)}</p>`] : []),
      ...(rel.length ? [`<p style="margin:8px 0 0;font-size:14px;line-height:1.7;color:${C.ink3};">相关：${esc(rel.join("；"))}</p>`] : []),
      ...(comment ? [`<p style="margin:12px 0 0;padding:8px 12px;background:${C.tint};border-left:3px solid ${C.accent};font-size:14px;line-height:1.7;color:${C.ink};"><span style="font-weight:bold;color:${C.accent};">${esc(COMMENT_LABEL)}</span>　${esc(comment)}</p>`] : []),
      `<p style="margin:8px 0 0;font-size:12px;line-height:1.6;color:${C.ink4};">${esc(note(e))}</p>`,
      `</section>`,
    ].join("\n");
  }).join("\n");

  const html = [
    `<section style="font-size:16px;line-height:1.75;color:${C.ink};letter-spacing:0.5px;">`,
    `<p style="margin:0;font-size:13px;letter-spacing:2px;color:${C.accent};">${esc(headerLine)}</p>`,
    `<p style="margin:12px 0 0;font-size:16px;line-height:1.75;color:${C.ink};">${esc(greeting)}</p>`,
    `<section style="margin:16px 0 0;padding:16px;background:${C.tint};border-radius:8px;">`,
    `<p style="margin:0 0 10px;font-size:14px;font-weight:bold;letter-spacing:2px;color:${C.accent};">今日速览</p>`,
    glance,
    `</section>`,
    divider,
    body,
    divider,
    `<p style="margin:0;font-size:15px;line-height:1.75;color:${C.ink};text-align:center;">${esc(invite)}</p>`,
    `<p style="margin:12px 0 0;font-size:13px;line-height:1.7;color:${C.ink4};text-align:center;">${esc(closing)}</p>`,
    `<p style="margin:4px 0 0;font-size:13px;line-height:1.7;color:${C.ink4};text-align:center;">${esc(signature)}</p>`,
    `</section>`,
  ].join("\n");

  const text = [
    headerLine,
    "",
    greeting,
    "",
    "【今日速览】",
    ...entries.map((e, k) => `${two(k + 1)} ${e.title}`),
    "",
    ...entries.flatMap((e, k) => {
      const rel = related(e);
      const comment = commentOf(e);
      return [`${two(k + 1)} ${e.title}`, ...(e.body ? [e.body] : []), ...(rel.length ? [`相关：${rel.join("；")}`] : []), ...(comment ? [`${COMMENT_LABEL}：${comment}`] : []), note(e), ""];
    }),
    invite,
    closing,
    signature,
  ].join("\n");

  return {
    title: packTitle(entries.map((e) => e.title)),
    digest: clip(entries[0]?.body ?? greeting, WECHAT_DIGEST_MAX),
    readMoreUrl: siteUrl(editionPath(`/daily/${report.key}`, "zh")),
    html,
    text,
    entries: { daily: entries.length - extra.length, added: extra.length, commented: entries.filter((e) => commentOf(e)).length },
  };
}
