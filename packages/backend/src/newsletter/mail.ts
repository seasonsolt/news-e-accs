// The newsletter's two letters: the subscription confirmation and the daily issue. Mail clients ignore
// stylesheets and web fonts, so this is inline-styled table markup in the site's parchment palette.
// Every letter has a plain-text twin.
import { SITE } from "@aihot/industry/site";
import type { ReportCitation, ReportDetail } from "@aihot/contracts/site";
import { dailyUrl, itemUrl, siteUrl } from "../publication/links.ts";

const C = { page: "#f4ecdc", card: "#fbf7ee", ink: "#2a1f16", ink3: "#62513f", ink4: "#6f5d48", line: "#ddd0b5", accent: "#955418" };
// Font stacks go inside style="…" attributes, so their names are single-quoted.
const SANS = "-apple-system,BlinkMacSystemFont,'PingFang SC','Hiragino Sans GB','Microsoft YaHei',sans-serif";
const SERIF = "Georgia,'Songti SC','STSong',serif";
/** Resend replaces this with the reader's own one-click unsubscribe link in broadcasts. */
const UNSUBSCRIBE = "{{{RESEND_UNSUBSCRIBE_URL}}}";

export interface Mail {
  subject: string;
  html: string;
  text: string;
}

export function esc(s: string): string {
  return s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function frame(inner: string, footer: string): string {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${C.page};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.page};"><tr><td align="center" style="padding:28px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:${C.card};border:1px solid ${C.line};border-radius:14px;overflow:hidden;">
<tr><td style="padding:0;line-height:0;"><img src="${esc(siteUrl("/media/art/subscribe-email.jpg"))}" width="600" alt="" style="display:block;width:100%;max-width:600px;height:auto;border:0;border-radius:14px 14px 0 0;"></td></tr>
<tr><td style="padding:22px 28px 8px;font-family:${SERIF};font-style:italic;font-size:34px;line-height:1;color:${C.ink};">${esc(SITE.name)}</td></tr>
${inner}
</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;"><tr><td style="padding:18px 28px;font-family:${SANS};font-size:12px;line-height:1.7;color:${C.ink4};text-align:center;">${footer}</td></tr></table>
</td></tr></table></body></html>`;
}

function button(href: string, label: string): string {
  return `<a href="${esc(href)}" style="display:inline-block;padding:12px 26px;border-radius:999px;background:${C.accent};color:#ffffff;font-family:${SANS};font-size:15px;font-weight:600;text-decoration:none;">${esc(label)}</a>`;
}

/**
 * Gmail files newsletters under Promotions; a reader who drags one to Primary (and keeps the choice)
 * gets every later issue there. Other mailboxes have no such tab, so the hint names Gmail.
 */
export const GMAIL_HINT = "用 Gmail 的话：日报如果出现在「推广」或「垃圾邮件」里，把它拖到「主要」，再选「以后都这样处理」，每天早上就会出现在收件箱最前面。";

export function confirmationMail(confirmUrl: string): Mail {
  const host = new URL(siteUrl("/")).host;
  const inner = `<tr><td style="padding:12px 28px 4px;font-family:${SANS};font-size:16px;line-height:1.75;color:${C.ink};">
<p style="margin:0 0 14px;">你好！</p>
<p style="margin:0 0 14px;">有人（希望是你）用这个邮箱订阅了 ${esc(SITE.name)} 日报：每天早上 8 点，一封 AI 圈值得看的几件事。</p>
<p style="margin:0 0 22px;">点下面的按钮确认订阅。不是你本人操作的话，忽略这封邮件就好，我们不会再给你发信。</p>
</td></tr>
<tr><td style="padding:0 28px 26px;">${button(confirmUrl, "确认订阅")}</td></tr>
<tr><td style="padding:0 28px 26px;font-family:${SANS};font-size:13px;line-height:1.7;color:${C.ink4};">按钮点不开的话，把这个链接复制到浏览器打开：<br><a href="${esc(confirmUrl)}" style="color:${C.accent};word-break:break-all;">${esc(confirmUrl)}</a></td></tr>
<tr><td style="padding:0 28px 26px;"><div style="padding:12px 14px;border-radius:10px;background:${C.page};border:1px solid ${C.line};font-family:${SANS};font-size:13px;line-height:1.7;color:${C.ink3};">${esc(GMAIL_HINT)}</div></td></tr>`;
  const footer = `这封邮件来自 ${esc(host)}。邮箱地址由美国的邮件服务商 Resend 保存和投递，只用于发送日报。`;
  return {
    subject: `确认订阅 ${SITE.name} 日报`,
    html: frame(inner, footer),
    text: [
      "你好！",
      "",
      `有人（希望是你）用这个邮箱订阅了 ${SITE.name} 日报：每天早上 8 点，一封 AI 圈值得看的几件事。`,
      "打开下面的链接确认订阅。不是你本人操作的话，忽略这封邮件就好，我们不会再给你发信。",
      "",
      confirmUrl,
      "",
      GMAIL_HINT,
      "",
      `—— ${host}。邮箱地址由美国的邮件服务商 Resend 保存和投递，只用于发送日报。`,
    ].join("\n"),
  };
}

/** The items an issue shows: every available citation of the report, in its sections' order. */
export function issueSections(report: ReportDetail): Array<{ label: string; items: ReportCitation[] }> {
  return report.sections
    .map((s) => ({ label: s.label, items: s.items.filter((i) => i.available) }))
    .filter((s) => s.items.length > 0);
}

function citationUrl(i: ReportCitation): string {
  return i.itemId ? itemUrl(i.itemId) : i.sourceUrl;
}

export function dailyIssueMail(report: ReportDetail): Mail {
  const sections = issueSections(report);
  const [, m, d] = report.key.split("-").map(Number) as [number, number, number];
  const headline = report.lead?.title ?? sections[0]?.items[0]?.title ?? "今日要闻";
  const web = dailyUrl(report.key);
  const leadHtml = report.lead
    ? `<tr><td style="padding:10px 28px 4px;font-family:${SANS};">
<div style="font-size:12px;letter-spacing:2px;color:${C.accent};">${m} 月 ${d} 日 · 日报</div>
<div style="margin-top:8px;font-size:22px;font-weight:700;line-height:1.4;color:${C.ink};">${esc(report.lead.title)}</div>
<div style="margin-top:10px;font-size:15px;line-height:1.8;color:${C.ink3};">${esc(report.lead.leadParagraph)}</div></td></tr>`
    : `<tr><td style="padding:10px 28px 4px;font-family:${SANS};font-size:12px;letter-spacing:2px;color:${C.accent};">${m} 月 ${d} 日 · 日报</td></tr>`;
  const sectionHtml = sections
    .map((s) => {
      const items = s.items
        .map((i) => `<tr><td style="padding:12px 0;border-top:1px solid ${C.line};font-family:${SANS};">
<a href="${esc(citationUrl(i))}" style="font-size:16px;font-weight:600;line-height:1.5;color:${C.ink};text-decoration:none;">${esc(i.title)}</a>
${i.summary ? `<div style="margin-top:6px;font-size:14px;line-height:1.75;color:${C.ink3};">${esc(i.summary)}</div>` : ""}
<div style="margin-top:6px;font-size:12px;color:${C.ink4};">${esc(i.sourceName)}</div></td></tr>`)
        .join("");
      return `<tr><td style="padding:22px 28px 0;"><div style="font-family:${SANS};font-size:13px;font-weight:700;color:${C.accent};padding-bottom:4px;">${esc(s.label)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${items}</table></td></tr>`;
    })
    .join("");
  const inner = `${leadHtml}${sectionHtml}<tr><td style="padding:24px 28px 30px;">${button(web, "在网页上阅读全文")}</td></tr>`;
  const footer = `用 Gmail？日报在「推广」里的话，拖到「主要」就能每天第一眼看到。<br>你收到这封邮件，是因为在 ${esc(new URL(siteUrl("/")).host)} 订阅了 ${esc(SITE.name)} 日报。<br><a href="${UNSUBSCRIBE}" style="color:${C.ink4};">退订</a>`;
  const text = [
    `${SITE.name} 日报 · ${m} 月 ${d} 日`,
    "",
    ...(report.lead ? [report.lead.title, report.lead.leadParagraph, ""] : []),
    ...sections.flatMap((s) => [`【${s.label}】`, ...s.items.flatMap((i) => [`· ${i.title}`, ...(i.summary ? [`  ${i.summary}`] : []), `  ${i.sourceName} ${citationUrl(i)}`]), ""]),
    `网页版：${web}`,
    "用 Gmail？日报在「推广」里的话，拖到「主要」就能每天第一眼看到。",
    `退订：${UNSUBSCRIBE}`,
  ].join("\n");
  return { subject: `${SITE.name} 日报 · ${m}月${d}日：${headline}`, html: frame(inner, footer), text };
}
