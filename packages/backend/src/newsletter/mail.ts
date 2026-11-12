import { distributionUrl } from "@aihot/contracts/distribution";
// The newsletter's letters: the subscription confirmation and the daily issue. Mail clients ignore most
// stylesheets and web fonts, so this is inline-styled table markup in the site's night deck: soot, brass and
// one plate. The letter is dark in every client's theme, so clients have nothing to invert. Display faces load
// where a client allows them; elsewhere the stacks fall back and the masthead still carries the wordmark
// (tools/make-mail-plates.ts). Every letter has a plain-text twin.
import { SITE, EDITION_TIMES } from "@aihot/site";
import type { ReportCitation, ReportDetail } from "@aihot/contracts/site";
import { editionPath, editionReady, type DistributionLanguage } from "../publication/distribution.ts";
import { dailyUrl, siteUrl } from "../publication/links.ts";
import type { LetterFeature } from "../modules.ts";
import type { LetterReading } from "./reading.ts";

/** Solid colours: rgba text and fills blend differently from client to client. */
const C = {
  page: "#120e0a", panel: "#1a1510", bright: "#fff7e8", ink: "#f4ecdc", body: "#dccfb6", dim: "#b3a489", faint: "#a08f74",
  line: "#2c2318", rule: "#5a4320", edge: "#7a5a1c", brass: "#d9a441", brassHi: "#f0d28a", heat: "#ff8a3c", onBrass: "#2a1f16",
  band: "#2a241c", bandNow: "#4a3919",
};
// Font stacks go inside style="…" attributes, so their names are single-quoted.
const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Hiragino Sans GB','Microsoft YaHei',sans-serif";
const MONO = "ui-monospace,SFMono-Regular,Menlo,Consolas,monospace";
const NUMERAL = "'Big Shoulders Display','Arial Narrow',Arial,sans-serif";
const DISPLAY = {
  en: "font-family:'Instrument Serif',Georgia,'Times New Roman',serif;font-style:italic;font-weight:400;",
  zh: "font-family:'Songti SC','STSong','Noto Serif SC',Georgia,serif;font-weight:700;",
};
/** Resend replaces this with the reader's own one-click unsubscribe link in broadcasts. */
const UNSUBSCRIBE = "{{{RESEND_UNSUBSCRIBE_URL}}}";
/** The reading's axis on a phone, the narrowest it gets: an epoch's name is printed only if it fits there. */
const AXIS_WIDTH = 350;

const PLATES = { daily: "/media/art/mail-daily.jpg", confirm: "/media/art/mail-confirm.jpg" };

export interface Mail {
  subject: string;
  html: string;
  text: string;
}

export function esc(s: string): string {
  return s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

const host = () => new URL(siteUrl("/")).host;

// Two blocks: a client that refuses @font-face may drop its whole block, and the phone rules must survive it.
const HEAD = `<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark">
<style>@font-face{font-family:'Instrument Serif';font-style:italic;font-weight:400;src:url('${siteUrl("/media/fonts/InstrumentSerif-Italic.woff2")}') format('woff2');}@font-face{font-family:'Big Shoulders Display';font-weight:800;src:url('${siteUrl("/media/fonts/BigShouldersDisplay-800-numerals.woff2")}') format('woff2');}</style>
<style>:root{color-scheme:dark;supported-color-schemes:dark;}
@media (max-width:620px){.pad{padding-left:20px!important;padding-right:20px!important;}.lead{font-size:28px!important;}.stack{display:block!important;width:auto!important;padding:0 0 8px!important;}.wide{display:block!important;text-align:center!important;}}</style>`;

export interface Letter {
  inner: string;
  footer: string;
  language: DistributionLanguage;
  plate: keyof typeof PLATES;
  /** The line inboxes show after the subject. */
  preheader: string;
}

export function frame({ inner, footer, language, plate, preheader }: Letter): string {
  return `<!doctype html><html lang="${language === "en" ? "en" : "zh-CN"}"><head>${HEAD}</head>
<body style="margin:0;padding:0;background:${C.page};">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${C.page};">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${C.page}" style="background:${C.page};"><tr><td align="center" style="padding:0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${C.page}" style="max-width:600px;background:${C.page};">
<tr><td bgcolor="${C.page}" style="padding:0;line-height:0;"><img src="${esc(siteUrl(PLATES[plate]))}" width="600" height="280" alt="${esc(SITE.name)}" style="display:block;width:100%;max-width:600px;height:auto;border:0;font-family:${SANS};font-size:24px;line-height:1.2;color:${C.brass};"></td></tr>
${inner}
<tr><td class="pad" style="padding:24px 32px 40px;font-family:${SANS};font-size:12px;line-height:1.7;color:${C.faint};">${footer}</td></tr>
</table>
</td></tr></table></body></html>`;
}

export function button(href: string, label: string): string {
  return `<a class="wide" href="${esc(href)}" style="display:inline-block;padding:14px 28px;border-radius:999px;background:${C.brass};color:${C.onBrass};font-family:${SANS};font-size:15px;font-weight:600;line-height:1.2;text-decoration:none;">${esc(label)}</a>`;
}

/** The letter's opening: the mono line over the display headline. */
export function masthead(kicker: string, title: string, language: DistributionLanguage): string {
  const size = language === "en" ? "font-size:34px;line-height:1.14;letter-spacing:-.01em;" : "font-size:30px;line-height:1.36;letter-spacing:.01em;";
  return `<tr><td class="pad" style="padding:20px 32px 0;">
<div style="font-family:${MONO};font-size:12px;line-height:1.7;letter-spacing:.08em;color:${C.heat};">${esc(kicker)}</div>
<h1 class="lead" style="margin:14px 0 0;${DISPLAY[language]}${size}color:${C.bright};">${esc(title)}</h1></td></tr>`;
}

/** A framed note the reader should not miss. */
export function notice(label: string, text: string): string {
  return `<tr><td class="pad" style="padding:28px 32px 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${C.panel}" style="background:${C.panel};border:1px solid ${C.edge};border-radius:10px;"><tr><td style="padding:14px 16px;">
<div style="font-family:${MONO};font-size:12px;letter-spacing:.08em;color:${C.brass};">${esc(label)}</div>
<div style="margin-top:6px;font-family:${SANS};font-size:14px;line-height:1.65;color:${C.body};">${esc(text)}</div></td></tr></table></td></tr>`;
}

/**
 * Gmail files newsletters under Promotions; a reader who drags one to Primary (and keeps the choice)
 * gets every later issue there. Other mailboxes have no such tab, so the hint names Gmail.
 */
const GMAIL_HINT = { en: "Using Gmail? If an issue lands in Promotions or Spam, move it to Primary and apply that choice to future messages.", zh: "用 Gmail 的话：日报如果出现在「推广」或「垃圾邮件」里，把它拖到「主要」，再选「以后都这样处理」，每天早上就会出现在收件箱最前面。" };

const CONFIRM = {
  en: {
    subject: `Confirm your ${SITE.name} daily briefing subscription`,
    kicker: `${SITE.subject} DAILY · ONE LAST STEP`,
    title: "The curve moves every day. Confirm, and we’ll tell you where it went.",
    intro: `Someone (hopefully you) signed up for the ${SITE.name} daily briefing: a concise guide to the AI news worth your time.`,
    action: "Confirm subscription →",
    instruction: "Confirm your subscription with the link below.",
    ignore: "If you did not request this, ignore this email; you will not receive the briefing.",
    facts: [["WHEN", `Every day, ${EDITION_TIMES.daily} Beijing time`], ["WHAT", "The day’s picks, each linked to its source"], ["LEAVING", "One click, at the foot of every issue"]],
    fallback: "If the button does not work, open this link:",
    privacy: `Sent by ${host()}. Your email address is stored and delivery is handled by Resend in the United States, solely for the newsletter.`,
  },
  zh: {
    subject: `确认订阅 ${SITE.name} 日报`,
    kicker: `${SITE.subject} 日报 · 最后一步`,
    title: "曲线每天都在走。确认之后，我们告诉你它走到了哪里。",
    intro: `有人（希望是你）用这个邮箱订阅了 ${SITE.name} 日报：每天早上一封，AI 圈值得看的几件事。`,
    action: "确认订阅 →",
    instruction: "打开下面的链接确认订阅。",
    ignore: "不是你本人操作的话，忽略这封邮件就好，我们不会再给你发信。",
    facts: [["时间", `每天 ${EDITION_TIMES.daily}（北京时间）`], ["内容", "当天精选，每条附原始来源"], ["退订", "每封信底部，一键退订"]],
    fallback: "按钮点不开的话，把这个链接复制到浏览器打开：",
    privacy: `这封邮件来自 ${host()}。邮箱地址由美国的邮件服务商 Resend 保存和投递，只用于发送日报。`,
  },
};

export function confirmationMail(confirmUrl: string, language: DistributionLanguage = "en"): Mail {
  const t = CONFIRM[language];
  const facts = t.facts.map(([label, value]) => `<td class="stack" width="33%" valign="top" style="padding-right:12px;font-family:${SANS};"><div style="font-family:${MONO};font-size:12px;letter-spacing:.08em;color:${C.brass};">${esc(label!)}</div><div style="margin-top:6px;font-size:14px;line-height:1.5;color:${C.body};">${esc(value!)}</div></td>`).join("");
  const inner = `${masthead(t.kicker, t.title, language)}
<tr><td class="pad" style="padding:18px 32px 0;font-family:${SANS};font-size:16px;line-height:1.72;color:${C.body};">${esc(t.intro)}</td></tr>
<tr><td class="pad" style="padding:24px 32px 0;">${button(confirmUrl, t.action)}</td></tr>
<tr><td class="pad" style="padding:18px 32px 0;font-family:${SANS};font-size:14px;line-height:1.65;color:${C.dim};">${esc(t.ignore)}</td></tr>
<tr><td class="pad" style="padding:28px 32px 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${C.line};border-bottom:1px solid ${C.line};"><tr><td height="18" colspan="3" style="font-size:0;line-height:0;">&nbsp;</td></tr><tr>${facts}</tr><tr><td height="18" colspan="3" style="font-size:0;line-height:0;">&nbsp;</td></tr></table></td></tr>
<tr><td class="pad" style="padding:24px 32px 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${C.panel}" style="background:${C.panel};border:1px solid ${C.line};border-radius:10px;"><tr><td style="padding:14px 16px;font-family:${SANS};font-size:13px;line-height:1.65;color:${C.dim};">${esc(GMAIL_HINT[language])}</td></tr></table></td></tr>`;
  const footer = `${esc(t.fallback)}<br><a href="${esc(confirmUrl)}" style="color:${C.brass};word-break:break-all;">${esc(confirmUrl)}</a><br><br>${esc(t.privacy)}`;
  return {
    subject: t.subject,
    html: frame({ inner, footer, language, plate: "confirm", preheader: t.intro }),
    text: [t.intro, `${t.instruction}${language === "en" ? " " : ""}${t.ignore}`, confirmUrl, GMAIL_HINT[language], t.privacy].join("\n\n"),
  };
}

/** The items an issue shows: every available citation of the report, in its sections' order. */
export function issueSections(report: ReportDetail): Array<{ label: string; items: ReportCitation[] }> {
  return report.sections
    .map((s) => ({ label: s.label, items: s.items.filter((i) => i.available) }))
    .filter((s) => s.items.length > 0);
}

function citationUrl(i: ReportCitation, language: DistributionLanguage): string {
  return i.itemId ? distributionUrl(siteUrl(editionPath(`/items/${i.itemId}`, language)), "newsletter") : i.sourceUrl;
}

const ISSUE = {
  en: {
    daily: `${SITE.subject} DAILY`, issue: (n: number) => `ISSUE ${n}`, minutes: (n: number) => `${n} MIN`,
    index: (n: number) => `TODAY IN ${n}`, figures: [(n: number) => (n === 1 ? "1 source" : `${n} sources`), (n: number) => `${n} first-party`], lead: "Lead", briefs: "BRIEFS",
    forward: ["Useful? Pass it to a colleague.", "Forward this email as it is. To get it every morning, they can subscribe at"], more: (n: number) => (n === 1 ? "+1 source" : `+${n} sources`), firstParty: "First-party",
    story: "Read the story →", full: "Read the full briefing →", online: "Read online", unsubscribe: "Unsubscribe",
    footer: `You received this email because you subscribed to ${SITE.name} at ${host()}.`,
    reading: "TODAY’S READING · THE AGENT ERA", now: "NOW", span: "BIG BANG → NOW → FORECASTS · LOG TIME", tagline: ["The arrival is not a date.", "It is a curve."], log: "Every day we log how far the curve has reached.", explore: "Explore the Acceleration →",
  },
  zh: {
    daily: `${SITE.subject} 日报`, issue: (n: number) => `第 ${n} 期`, minutes: (n: number) => `约 ${n} 分钟`,
    index: (n: number) => `今天这 ${n} 件`, figures: [(n: number) => `${n} 家信源`, (n: number) => `${n} 件一手`], lead: "头条", briefs: "快讯",
    forward: ["有用的话，转给一位同事", "直接转发这封信就行。他们想每天收到，可以在这里订阅："], more: (n: number) => `另有 ${n} 家信源报道`, firstParty: "一手",
    story: "阅读全文 →", full: "在网页上阅读全文 →", online: "网页版", unsubscribe: "退订",
    footer: `你收到这封邮件，是因为在 ${host()} 订阅了 ${SITE.name} 日报。`,
    reading: "今日读数 · 智能体时代", now: "现在", span: "大爆炸 → 现在 → 预测 · 对数时间", tagline: ["降临不是一个日期，", "而是一条曲线。"], log: "我们每天记下这条曲线走到了哪里。", explore: "走进加速史 →",
  },
};

function kicker(report: ReportDetail, language: DistributionLanguage): string {
  const t = ISSUE[language];
  const weekday = new Intl.DateTimeFormat(language === "en" ? "en-US" : "zh-CN", { timeZone: "UTC", weekday: language === "en" ? "long" : "short" }).format(new Date(`${report.key}T00:00:00Z`));
  return [t.daily, report.key, language === "en" ? weekday.toUpperCase() : weekday, ...(report.issueNumber ? [t.issue(report.issueNumber)] : []), ...(report.readingMinutes ? [t.minutes(report.readingMinutes)] : [])].join(" · ");
}

/**
 * Under the lead: every event of the issue as one numbered list to scan, the lead first among them, with
 * the issue's figures beside its heading.
 */
function indexRow(report: ReportDetail, language: DistributionLanguage): string {
  const t = ISSUE[language];
  const seen = new Set<string>();
  const items = issueSections(report).flatMap((s) => s.items).filter((i) => {
    const key = i.itemId ?? i.title;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (items.length < 2) return "";
  const { sourcesCount, firstPartyEvents } = report.metrics;
  const figures = [sourcesCount ? t.figures[0]!(sourcesCount) : "", firstPartyEvents ? t.figures[1]!(firstPartyEvents) : ""].filter(Boolean).join(" · ");
  const rows = items.map((i, n) => `<tr><td width="30" valign="top" align="right" style="padding:9px 12px 9px 0;border-bottom:1px solid ${C.line};font-family:${NUMERAL};font-size:18px;font-weight:800;line-height:1.3;color:${C.brass};">${n + 1}</td><td valign="top" style="padding:9px 0;border-bottom:1px solid ${C.line};font-family:${SANS};font-size:14.5px;line-height:1.55;"><a href="${esc(citationUrl(i, language))}" style="color:${C.ink};text-decoration:none;">${esc(i.title)}</a>${i.itemId === report.leadItemId ? `&nbsp;&nbsp;<span style="font-size:12px;color:${C.brass};white-space:nowrap;">${esc(t.lead)}</span>` : ""}</td></tr>`).join("");
  return `<tr><td class="pad" style="padding:14px 32px 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr><td style="padding-bottom:10px;border-bottom:1px solid ${C.rule};font-family:${MONO};font-size:12px;letter-spacing:.1em;color:${C.brass};">${esc(t.index(items.length))}</td><td align="right" style="padding-bottom:10px;border-bottom:1px solid ${C.rule};font-family:${SANS};font-size:12px;color:${C.faint};">${esc(figures)}</td></tr>
<tr><td colspan="2"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table></td></tr></table></td></tr>`;
}

/** Before the reading panel: an invitation to forward the letter, with the address a colleague signs up at. */
function forwardRow(language: DistributionLanguage): string {
  const t = ISSUE[language];
  const page = siteUrl(editionPath("/subscribe", language));
  return `<tr><td class="pad" style="padding:0 32px 32px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${C.panel}" style="background:${C.panel};border:1px solid ${C.edge};border-radius:10px;"><tr><td style="padding:16px 18px;">
<div style="${DISPLAY[language]}font-size:19px;line-height:1.45;color:${C.bright};">${esc(t.forward[0]!)}</div>
<div style="margin-top:6px;font-family:${SANS};font-size:14px;line-height:1.7;color:${C.body};">${esc(t.forward[1]!)} <a href="${esc(distributionUrl(page, "newsletter"))}" style="color:${C.brassHi};text-decoration:none;">${esc(page.replace(/^https?:\/\//, ""))}</a></div></td></tr></table></td></tr>`;
}

function sectionHead(number: number, label: string): string {
  return `<div style="padding-bottom:12px;border-bottom:1px solid ${C.rule};font-family:${MONO};font-size:12px;letter-spacing:.1em;color:${C.brass};">${String(number).padStart(2, "0")}&nbsp;&nbsp;${esc(label)}</div>`;
}

function storyRow(i: ReportCitation, language: DistributionLanguage): string {
  const t = ISSUE[language];
  const meta = [
    esc(i.sourceName),
    ...(i.otherSources ? [`<span style="color:${C.dim};">${esc(t.more(i.otherSources))}</span>`] : []),
    ...(i.firstParty ? [`<span style="padding:1px 7px;border:1px solid ${C.edge};border-radius:999px;font-size:11px;color:${C.brass};white-space:nowrap;">${esc(t.firstParty)}</span>`] : []),
  ].join("&nbsp;&nbsp;");
  return `<div style="padding:18px 0;border-bottom:1px solid ${C.line};font-family:${SANS};">
<div style="font-family:${MONO};font-size:12px;line-height:1.6;letter-spacing:.02em;color:${C.faint};">${meta}</div>
<a href="${esc(citationUrl(i, language))}" style="display:block;margin-top:8px;font-size:18px;font-weight:600;line-height:1.4;color:${C.ink};text-decoration:none;">${esc(i.title)}</a>
${i.summary ? `<div style="margin-top:8px;font-size:15px;line-height:1.7;color:${C.dim};">${esc(i.summary)}</div>` : ""}</div>`;
}

function briefRow(i: ReportCitation, language: DistributionLanguage): string {
  return `<div style="padding:12px 0;border-bottom:1px solid ${C.line};font-family:${SANS};"><a href="${esc(citationUrl(i, language))}" style="font-size:15px;font-weight:500;line-height:1.5;color:${C.body};text-decoration:none;">${esc(i.title)}</a><div style="margin-top:3px;font-family:${MONO};font-size:12px;color:${C.faint};">${esc(i.sourceName)}</div></div>`;
}

/** The front page's axis as table cells: the epochs at their widths, the current one cut at the needle. */
function axisRows(reading: LetterReading, language: DistributionLanguage): string {
  const { epochs, u } = reading.axis;
  const pct = (share: number) => `${(share * 100).toFixed(2)}%`;
  const cell = (share: number, label: string, fill: string, ink: string, edge: boolean) => {
    // Only a label that fits is printed: the words would push the cell off its share of the axis.
    const fits = share * AXIS_WIDTH >= label.length * 7.5 + 16;
    return `<td width="${pct(share)}" height="30" bgcolor="${fill}" style="${edge ? `border-left:2px solid ${C.panel};` : ""}padding:0 0 0 7px;font-family:${SANS};font-size:12px;color:${ink};white-space:nowrap;overflow:hidden;">${fits ? esc(label) : "&nbsp;"}</td>`;
  };
  const cells = epochs.flatMap((e, i) => {
    const share = e.to - e.from;
    if (u < e.from || u >= e.to) return [cell(share, e.forecast ? "" : e.title, C.band, C.dim, i > 0)];
    return [cell(u - e.from, e.title, C.bandNow, C.bright, i > 0), `<td width="2" bgcolor="${C.brassHi}" style="font-size:0;line-height:0;">&nbsp;</td>`, `<td width="${pct(e.to - u)}" bgcolor="${C.bandNow}" style="font-size:0;line-height:0;">&nbsp;</td>`];
  }).join("");
  const pill = `<span style="padding:0 8px;border-radius:999px;background:${C.brass};font-family:${MONO};font-size:11px;font-weight:600;line-height:1.6;letter-spacing:.1em;color:${C.onBrass};">${esc(ISSUE[language].now)}</span>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td width="${pct(u)}" align="right" style="padding-bottom:6px;white-space:nowrap;">${pill}</td><td>&nbsp;</td></tr></table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed;border-radius:6px;"><tr>${cells}</tr></table>`;
}

function costFigures(cost: NonNullable<LetterReading["cost"]>, language: DistributionLanguage) {
  const ratio = cost.ratio >= 10 ? cost.ratio.toFixed(0) : cost.ratio.toFixed(1);
  const halving = cost.halvingMonths.toFixed(1);
  const [year, month] = cost.since.split("-").map(Number) as [number, number];
  if (language === "zh") return { ratio, line: `${cost.reference} 级智能自 ${year} 年便宜了 ${ratio} 倍，每 ${halving} 个月减半` };
  const name = new Date(Date.UTC(year, month - 1)).toLocaleDateString("en", { month: "long", timeZone: "UTC" });
  return { ratio, line: `cheaper ${cost.reference}-level intelligence since ${name} ${year}, halving every ${halving} months` };
}

function readingPanel(reading: LetterReading, language: DistributionLanguage): string {
  const t = ISSUE[language];
  const home = siteUrl(editionPath("/", language));
  const pill = reading.kardashev === null ? "" : `<a href="${esc(home)}" style="padding:5px 12px;border:1px solid ${C.edge};border-radius:999px;font-family:${MONO};font-size:12px;color:${C.ink};text-decoration:none;white-space:nowrap;">K = ${reading.kardashev.toFixed(3)}</a>`;
  const cost = reading.cost && costFigures(reading.cost, language);
  const costRow = cost ? `<tr><td style="padding-top:18px;"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td class="stack" valign="bottom" style="padding-right:16px;font-family:${NUMERAL};font-size:60px;font-weight:800;line-height:.9;color:${C.brassHi};">${esc(cost.ratio)}×</td><td class="stack" valign="bottom" style="font-family:${SANS};font-size:14px;line-height:1.5;color:${C.body};">${esc(cost.line)}</td></tr></table></td></tr>` : "";
  return `<tr><td class="pad" bgcolor="${C.panel}" style="padding:26px 32px 28px;border-top:1px solid ${C.edge};background:${C.panel};"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="font-family:${MONO};font-size:12px;line-height:1.6;letter-spacing:.1em;color:${C.brass};">${esc(t.reading)}</td><td align="right">${pill}</td></tr></table></td></tr>
${costRow}
<tr><td style="padding-top:26px;">${axisRows(reading, language)}</td></tr>
<tr><td style="padding-top:14px;font-family:${MONO};font-size:11px;letter-spacing:.14em;color:${C.faint};">${esc(t.span)}</td></tr>
<tr><td style="padding-top:22px;${DISPLAY[language]}font-size:25px;line-height:1.3;color:${C.bright};">${t.tagline.map(esc).join("<br>")}</td></tr>
<tr><td style="padding-top:8px;font-family:${SANS};font-size:14px;line-height:1.6;color:${C.dim};">${esc(t.log)} <a href="${esc(siteUrl(editionPath("/chronicle", language)))}" style="color:${C.brassHi};text-decoration:none;">${esc(t.explore)}</a></td></tr>
</table></td></tr>`;
}

/** What the letter lists under the lead: the lead itself is told at the top, so it is not told twice. */
function letterSections(report: ReportDetail) {
  const lead = report.lead ? report.leadItemId : null;
  return issueSections(report).map((s) => ({ ...s, items: s.items.filter((i) => !lead || i.itemId !== lead) })).filter((s) => s.items.length > 0);
}

/** Briefs have no edition check of their own: one still untranslated is left out, not mailed in the other language. */
function letterBriefs(report: ReportDetail, language: DistributionLanguage): ReportCitation[] {
  return report.flashes.filter((i) => i.available && (!("contentLanguage" in i) || editionReady(i, language, true)));
}

/** A module's piece (a new essay), told under the lead. */
function featureRow(f: LetterFeature): string {
  return `<tr><td class="pad" style="padding:28px 32px 0;"><div style="padding:20px 22px;border:1px solid ${C.edge};border-radius:8px;font-family:${SANS};">
<div style="font-family:${MONO};font-size:12px;letter-spacing:.1em;color:${C.brass};">${esc(f.kicker.toUpperCase())}</div>
<a href="${esc(f.url)}" style="display:block;margin-top:8px;font-size:20px;font-weight:600;line-height:1.35;color:${C.ink};text-decoration:none;">${esc(f.title)}</a>
<div style="margin-top:8px;font-size:15px;line-height:1.7;color:${C.dim};">${esc(f.dek)}</div></div></td></tr>`;
}

export function dailyIssueMail(report: ReportDetail, language: DistributionLanguage = "en", reading: LetterReading | null = null, features: LetterFeature[] = []): Mail {
  const t = ISSUE[language];
  const sections = letterSections(report);
  const briefs = letterBriefs(report, language);
  const leadItem = report.leadItemId ? issueSections(report).flatMap((s) => s.items).find((i) => i.itemId === report.leadItemId) : undefined;
  const headline = report.lead?.title ?? sections[0]?.items[0]?.title ?? (language === "en" ? "Today's briefing" : "今日要闻");
  const web = distributionUrl(language === "en" ? dailyUrl(report.key) : siteUrl(editionPath(`/daily/${report.key}`, "zh")), "newsletter");

  const leadBody = report.lead ? `<tr><td class="pad" style="padding:16px 32px 0;font-family:${SANS};font-size:16px;line-height:1.72;color:${C.body};">${esc(report.lead.leadParagraph)}</td></tr>
<tr><td class="pad" style="padding:6px 32px 8px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="font-family:${MONO};font-size:12px;letter-spacing:.04em;color:${C.faint};">${esc(leadItem?.sourceName ?? "")}</td><td align="right"><a href="${esc(leadItem ? citationUrl(leadItem, language) : web)}" style="display:inline-block;padding:13px 0;font-family:${SANS};font-size:14px;line-height:18px;color:${C.brassHi};text-decoration:none;">${esc(t.story)}</a></td></tr></table></td></tr>` : "";
  const sectionHtml = sections.map((s, i) => `<tr><td class="pad" style="padding:32px 32px 0;">${sectionHead(i + 1, language === "en" ? s.label.toUpperCase() : s.label)}${s.items.map((item) => storyRow(item, language)).join("")}</td></tr>`).join("");
  const briefHtml = briefs.length ? `<tr><td class="pad" style="padding:32px 32px 0;">${sectionHead(sections.length + 1, t.briefs)}${briefs.map((item) => briefRow(item, language)).join("")}</td></tr>` : "";
  const inner = `${masthead(kicker(report, language), headline, language)}${leadBody}${features.map(featureRow).join("")}${indexRow(report, language)}${sectionHtml}${briefHtml}
<tr><td class="pad" align="center" style="padding:32px 32px 36px;">${button(web, t.full)}</td></tr>${forwardRow(language)}${reading ? readingPanel(reading, language) : ""}`;
  const footer = `${esc(GMAIL_HINT[language])}<br><br>${esc(t.footer)} <a href="${UNSUBSCRIBE}" style="color:${C.faint};">${esc(t.unsubscribe)}</a>`;

  const date = language === "en"
    ? new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "long", day: "numeric", year: "numeric" }).format(new Date(`${report.key}T00:00:00Z`))
    : (([, m, d]) => `${m}月${d}日`)(report.key.split("-").map(Number));
  const name = language === "en" ? `${SITE.name} Daily briefing` : `${SITE.name} 日报`;
  const cost = reading?.cost ? costFigures(reading.cost, language) : null;
  const text = [
    `${name} · ${date}`,
    "",
    ...(report.lead ? [report.lead.title, report.lead.leadParagraph, ""] : []),
    ...features.flatMap((f) => [`${f.kicker}: ${f.title}`, f.dek, f.url, ""]),
    ...sections.flatMap((s) => [language === "en" ? s.label : `【${s.label}】`, ...s.items.flatMap((i) => [`· ${i.title}`, ...(i.summary ? [`  ${i.summary}`] : []), `  ${i.sourceName} ${citationUrl(i, language)}`]), ""]),
    ...(briefs.length ? [t.briefs, ...briefs.map((i) => `· ${i.title}  ${i.sourceName} ${citationUrl(i, language)}`), ""] : []),
    ...(cost ? [language === "en" ? `${cost.ratio}× ${cost.line}` : cost.line, ""] : []),
    `${t.online}: ${web}`,
    `${t.forward[0]} ${t.forward[1]}${language === "en" ? " " : ""}${distributionUrl(siteUrl(editionPath("/subscribe", language)), "newsletter")}`,
    GMAIL_HINT[language],
    `${t.unsubscribe}: ${UNSUBSCRIBE}`,
  ].join("\n");
  const subject = language === "en" ? `${name} · ${date}: ${headline}` : `${name} · ${date}：${headline}`;
  return { subject, html: frame({ inner, footer, language, plate: "daily", preheader: report.lead?.leadParagraph.slice(0, 140) ?? headline }), text };
}
