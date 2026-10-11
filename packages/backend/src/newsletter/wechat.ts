// The daily as a WeChat Official Account (公众号) article, pasted by an editor. The 公众号 editor keeps
// inline styles on section/p/span but drops <style>, classes, web fonts and links outside
// mp.weixin.qq.com, so the body carries no links: the article's one 「阅读原文」 link leads to the web
// edition, where every entry links to its source.
import { SITE } from "@aihot/site";
import type { ReportCitation, ReportDetail } from "@aihot/contracts/site";
import { editionPath } from "../publication/distribution.ts";
import { siteUrl } from "../publication/links.ts";
import { esc, issueSections } from "./mail.ts";

const C = { ink: "#2a1f16", ink3: "#62513f", ink4: "#6f5d48", line: "#ddd0b5", tint: "#f4ecdc", accent: "#955418" };
/** The editor's limits for an article's title and digest, in characters. */
export const WECHAT_TITLE_MAX = 64;
export const WECHAT_DIGEST_MAX = 120;

export interface WechatArticle {
  title: string;
  digest: string;
  /** For the article's 「阅读原文」 field. */
  readMoreUrl: string;
  html: string;
  text: string;
}

function clip(s: string, max: number): string {
  const chars = Array.from(s.trim());
  return chars.length <= max ? chars.join("") : `${chars.slice(0, max - 1).join("")}…`;
}

const monthDay = (key: string) => {
  const [, m, d] = key.split("-").map(Number) as [number, number, number];
  return `${m} 月 ${d} 日`;
};

function note(i: ReportCitation): string {
  return [
    `来源：${i.sourceName}`,
    ...(i.otherSources ? [`另有 ${i.otherSources} 家信源报道`] : []),
    ...(i.followUp ? [`${monthDay(i.followUp)}日报报道过此事`] : []),
  ].join(" · ");
}

const related = (i: ReportCitation) => (i.related ?? []).filter((r) => r.available).map((r) => r.title);

export function wechatArticle(report: ReportDetail): WechatArticle {
  const sections = issueSections(report);
  const flashes = report.flashes.filter((i) => i.available);
  const first = sections[0]?.items[0];
  const host = new URL(siteUrl("/")).host;
  const dateLine = `${monthDay(report.key)} · 第 ${report.issueNumber} 期`;
  const closing = "点击文末「阅读原文」，查看网页版日报和每条消息的原文出处。";
  const signature = `${SITE.name} 每天 08:00 更新 · ${host}`;

  // The lead is often the first entry's own summary; it is not repeated under that entry.
  const summary = (i: ReportCitation) => (i.summary && i.summary !== report.lead?.leadParagraph ? i.summary : null);

  let n = 0;
  const entries = (items: ReportCitation[]) => items.map((i) => {
    const rel = related(i);
    return [
      `<section style="padding:14px 0;border-bottom:1px solid ${C.line};">`,
      `<p style="margin:0;font-size:16px;font-weight:bold;line-height:1.6;color:${C.ink};">${++n}. ${esc(i.title)}</p>`,
      ...(summary(i) ? [`<p style="margin:6px 0 0;font-size:15px;line-height:1.75;color:${C.ink3};">${esc(summary(i)!)}</p>`] : []),
      ...(rel.length ? [`<p style="margin:6px 0 0;font-size:13px;line-height:1.7;color:${C.ink4};">相关：${esc(rel.join("；"))}</p>`] : []),
      `<p style="margin:6px 0 0;font-size:12px;line-height:1.6;color:${C.ink4};">${esc(note(i))}</p>`,
      `</section>`,
    ].join("\n");
  }).join("\n");
  const heading = (label: string) => `<p style="margin:28px 0 4px;padding-left:10px;border-left:4px solid ${C.accent};font-size:17px;font-weight:bold;line-height:1.4;color:${C.ink};">${esc(label)}</p>`;

  const html = [
    `<section style="font-size:16px;line-height:1.75;color:${C.ink};letter-spacing:0.5px;">`,
    `<p style="margin:0;font-size:13px;letter-spacing:2px;color:${C.accent};">${esc(dateLine)}</p>`,
    ...(report.lead ? [
      `<section style="margin:12px 0 4px;padding:14px 16px;background:${C.tint};border-radius:8px;">`,
      `<p style="margin:0;font-size:12px;letter-spacing:2px;color:${C.accent};">今日头条</p>`,
      `<p style="margin:4px 0 0;font-size:17px;font-weight:bold;line-height:1.5;color:${C.ink};">${esc(report.lead.title)}</p>`,
      `<p style="margin:8px 0 0;font-size:15px;line-height:1.75;color:${C.ink3};">${esc(report.lead.leadParagraph)}</p>`,
      `</section>`,
    ] : []),
    ...sections.map((s) => `${heading(s.label)}\n${entries(s.items)}`),
    ...(flashes.length ? [`${heading("快讯")}\n${entries(flashes)}`] : []),
    `<p style="margin:28px 0 0;font-size:13px;line-height:1.7;color:${C.ink4};text-align:center;">${esc(closing)}</p>`,
    `<p style="margin:4px 0 0;font-size:13px;line-height:1.7;color:${C.ink4};text-align:center;">${esc(signature)}</p>`,
    `</section>`,
  ].join("\n");

  const textEntries = (items: ReportCitation[], start: number) => items.flatMap((i, k) => {
    const rel = related(i);
    return [`${start + k}. ${i.title}`, ...(summary(i) ? [summary(i)!] : []), ...(rel.length ? [`相关：${rel.join("；")}`] : []), note(i), ""];
  });
  let m = 1;
  const text = [
    dateLine,
    "",
    ...(report.lead ? [`今日头条：${report.lead.title}`, report.lead.leadParagraph, ""] : []),
    ...sections.flatMap((s) => { const lines = [`【${s.label}】`, ...textEntries(s.items, m)]; m += s.items.length; return lines; }),
    ...(flashes.length ? ["【快讯】", ...textEntries(flashes, m)] : []),
    closing,
    signature,
  ].join("\n");

  return {
    title: clip(report.lead?.title ?? first?.title ?? `${SITE.name} 日报 · ${monthDay(report.key)}`, WECHAT_TITLE_MAX),
    digest: clip(report.lead?.leadParagraph ?? first?.summary ?? dateLine, WECHAT_DIGEST_MAX),
    readMoreUrl: siteUrl(editionPath(`/daily/${report.key}`, "zh")),
    html,
    text,
  };
}
