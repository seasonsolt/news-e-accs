import { describePublicationTime } from "../sources/dates.ts";
// The writing side of the analysis: the prefilter's and the content understanding's inputs, the
// title/summary prompts for everything else, the output parsing and the deterministic guards. The
// wording lives in the industry pack (industry/prompts/); a failed guard falls back without a repair call.
import { IDENTITY_CONTEXT_ALIASES, IDENTITY_LEXICON, PUBLISHER_DOMAINS } from "@aihot/industry/taxonomy";
import { stripTagMarkup, isChineseText as looksZh } from "../lib/text.ts";
export { isChineseText as looksZh } from "../lib/text.ts";
import { onlyXArticleLink } from "../sources/x.ts";
import type { AnalyzeInputArticle } from "./input.ts";
import { promptText } from "./prompts.ts";

export const PREFILTER_SYSTEM = promptText("prefilter");
export const UNDERSTAND_SYSTEM = promptText("understand");

/** A body longer than this is cut (whole bodies are sent; a few run past the context). */
export const MAX_BODY_CHARS = 60_000;
const capBody = (s: string) => (s.length > MAX_BODY_CHARS ? s.slice(0, MAX_BODY_CHARS) : s);

// Text helpers

export function clampText(s: string, maxChars: number): string {
  const codepoints = Array.from(s);
  return codepoints.length <= maxChars ? s : codepoints.slice(0, maxChars).join("") + "…";
}

/** Short tweet: under 100 characters of Chinese, under 500 of other text. */
export function isShortTweet(text: string): boolean {
  if (!text) return false;
  const cjk = (text.match(/[一-鿿]/g) || []).length;
  return text.length < (cjk > text.length * 0.3 ? 100 : 500);
}

/** HTML, URLs (whose /2025/ paths models took for years) and entities out of article text. */
export function cleanArticleTextForLLM(s: string): string {
  if (!s) return "";
  return stripTagMarkup(s.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " "))
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Deterministic prose guard; quoted original-language text may remain verbatim. */
export function looksEnglish(text: string): boolean {
  const prose = text.replace(/https?:\/\/\S+/g, " ").replace(/"[^"\n]*"|“[^”\n]*”/g, " ");
  return /[A-Za-z]{2}/.test(prose) && !/[一-鿿぀-ヿ가-힯Ѐ-ӿ]/.test(prose);
}

// The material as the prefilter and the content understanding read it

/** The post is an X Article's link whose article could not be fetched. */
const unfetchedXArticle = (a: AnalyzeInputArticle) => !!a.xPost && a.bodyStatus !== "ok" && onlyXArticleLink(String(a.xPost.text ?? ""));

function materialQuality(a: AnalyzeInputArticle): string {
  if (a.xPost) return "完整正文（来自 RSS / API 自带的 content 字段）";
  if (a.bodyText) return a.source.fetchesBody ? "完整正文（抓自原始网页）" : "完整正文（来自 RSS / API 自带的 content 字段）";
  if (a.excerpt) return "仅摘要（feed 未提供完整正文）";
  if (a.bodyStatus === "unconfirmed") return "抓取失败，仅标题可用";
  return "无有效文本";
}

/** The material as the prefilter and the content understanding read it. */
export function renderContext(a: AnalyzeInputArticle, opts: { annotateQuoted?: boolean } = {}): string {
  const lines: string[] = [];
  lines.push(`【来源】${a.source.name}（${a.source.kind}，tier=${a.source.tier || "未分级"}）`);
  if (a.source.tags?.length) lines.push(`【来源标签】${a.source.tags.join(", ")}`);
  const name = a.xPost?.authorName || a.author;
  const handle = a.xPost?.handle;
  if (name || handle) lines.push(`【作者】${[name, handle ? `@${handle}` : null].filter(Boolean).join(" · ")}`);
  if (a.publishedAt) lines.push(`【发布时间】${describePublicationTime(a.publishedAt, a.publicationTime)}`);
  const media = (a.xPost?.media ?? a.media ?? []) as Array<{ kind?: string }>;
  const images = media.filter((m) => m.kind === "image").length;
  const videos = media.filter((m) => m.kind === "video").length;
  const mediaParts = [images ? `${images} 张图` : null, videos ? `${videos} 个视频` : null, unfetchedXArticle(a) ? "含 X 长文链接（正文未抓到）" : null].filter(Boolean);
  if (mediaParts.length) lines.push(`【媒体】${mediaParts.join(" · ")}`);
  lines.push(`【原文链接】${a.url}`);
  lines.push(`【标题】${a.title}`);
  const quoted = a.xPost?.quoted?.text ? a.xPost.quoted : null;
  if (quoted) {
    const label = quoted.handle ? `@${quoted.handle}` : "原推";
    if (opts.annotateQuoted) {
      lines.push(`【引用 ${label}】（以下是作者转发/引用的**他人**内容，不是作者本人的产出）`);
      lines.push(String(quoted.text));
    } else {
      lines.push(`【引用 ${label}】${quoted.text}`);
    }
  }
  lines.push("");
  lines.push(opts.annotateQuoted && quoted ? "【正文（作者自己的内容）】" : "【正文】");
  lines.push(capBody(a.xPost ? String(a.xPost.text ?? a.title) : (a.bodyText ?? a.excerpt ?? "(无正文)")));
  lines.push("");
  lines.push(`【材料质量】${materialQuality(a)}`);
  return lines.join("\n");
}

/** The prefilter's user message: the context as a JSON string (the prompt was tuned on this form). */
export const prefilterUser = (a: AnalyzeInputArticle) => JSON.stringify(renderContext(a));

/** No text beyond the title: no body, feed excerpt, post or quoted text. */
export function missingEvidence(a: AnalyzeInputArticle): boolean {
  return !a.bodyText?.trim() && !a.excerpt?.trim() && !String(a.xPost?.text ?? "").trim() && !String(a.xPost?.quoted?.text ?? "").trim();
}

export const understandUser = (a: AnalyzeInputArticle) =>
  ["Read the original material directly and return all six fields in the system schema. Write reader-facing prose in US English.", renderContext(a, { annotateQuoted: true })].join("\n\n");

// Identity context and guard

const lexiconName = (id: string) => IDENTITY_LEXICON.find((e) => e.id === id)?.name ?? null;

/** Known companies the texts name, by the pack's identity lexicon (each text on its own). */
export function matchEntityIds(texts: Array<string | null | undefined>): string[] {
  const list = texts.filter((t): t is string => typeof t === "string" && t.trim().length > 0);
  return IDENTITY_LEXICON.filter((e) => e.patterns.some((p) => list.some((t) => p.test(t)))).map((e) => e.id);
}

/** A translation may rejoin a name (GPT 5.5 → GPT-5.5): the input counts in both spellings. */
const surfaceVariants = (texts: Array<string | undefined>) => {
  const exact = texts.filter((t): t is string => typeof t === "string" && t.trim().length > 0);
  return [...exact, ...exact.map((t) => t.replace(/\b(gpt|glm)\s+(?=[o\d])/gi, "$1-"))];
};

function publisherEntityId(url?: string): string | null {
  let host: string;
  try {
    host = new URL(url ?? "").hostname.toLowerCase();
  } catch {
    return null;
  }
  return PUBLISHER_DOMAINS.find((e) => e.domains.some((d) => host === d || host.endsWith(`.${d}`)))?.entityId ?? null;
}

export interface TranslateInput {
  title: string;
  text: string;
  sourceKind: string;
  sourceName?: string;
  documentUrl?: string;
  sourceOwnerEntityId?: string | null;
  /** The main post of a tweet (not the quoted one), for the short/long decision. */
  mainText?: string;
  quotedText?: string;
  quotedAuthor?: string;
  publishedAt?: Date;
  publicationTime?: string | null;
}

export function translateInputOf(a: AnalyzeInputArticle): TranslateInput {
  const isX = a.source.kind === "x_search" || !!a.xPost;
  const mainText = isX ? String(a.xPost?.text ?? a.title) : undefined;
  return {
    title: a.title,
    text: isX ? (mainText ?? "") : (a.bodyText ?? a.excerpt ?? ""),
    sourceKind: isX ? "x_search" : a.source.kind,
    sourceName: a.source.name,
    documentUrl: a.url,
    sourceOwnerEntityId: a.source.ownerEntityId ?? null,
    mainText,
    quotedText: a.xPost?.quoted?.text ? String(a.xPost.quoted.text) : undefined,
    quotedAuthor: a.xPost?.quoted?.handle ? String(a.xPost.quoted.handle) : undefined,
    publishedAt: a.publishedAt ?? undefined,
    publicationTime: a.publicationTime,
  };
}

function identityContext(input: TranslateInput) {
  const publisher = publisherEntityId(input.documentUrl);
  const owner = input.sourceOwnerEntityId && lexiconName(input.sourceOwnerEntityId) ? input.sourceOwnerEntityId : null;
  const texts = [input.title, input.text, input.mainText, input.quotedText, input.sourceName];
  const allowed = new Set(matchEntityIds(surfaceVariants(texts)));
  const joined = texts.filter(Boolean).join("\n");
  for (const alias of IDENTITY_CONTEXT_ALIASES) if (alias.pattern.test(joined)) allowed.add(alias.entityId);
  if (publisher) allowed.add(publisher);
  if (owner) allowed.add(owner);
  return { allowed: [...allowed].sort(), publisher, owner };
}

function identityPrompt(input: TranslateInput): string {
  const ctx = identityContext(input);
  const facts: string[] = [];
  if (ctx.publisher) facts.push(`文档发布域主体=${lexiconName(ctx.publisher) ?? ctx.publisher}`);
  if (ctx.owner) facts.push(`来源账号主体=${lexiconName(ctx.owner) ?? ctx.owner}`);
  return promptText("identity-context", { facts: facts.length > 0 ? facts.join("；") : "未识别到明确发布主体" });
}

export interface IdentityGuard {
  outcome: "pass" | "fallback";
  unsupportedTitleEntityIds: string[];
  unsupportedSummaryEntityIds: string[];
}

/**
 * A model only words the copy; it cannot introduce a company the input does not name. A title that
 * does falls back to the original English title (or nothing), a summary that does is dropped.
 */
export function enforceIdentity(input: TranslateInput, copy: { title: string; summary: string }) {
  const allowed = new Set(identityContext(input).allowed);
  const unsupportedTitleEntityIds = matchEntityIds([copy.title]).filter((id) => !allowed.has(id));
  const unsupportedSummaryEntityIds = matchEntityIds([copy.summary]).filter((id) => !allowed.has(id));
  return {
    title: unsupportedTitleEntityIds.length ? (looksEnglish(input.title) ? input.title : "") : copy.title,
    summary: unsupportedSummaryEntityIds.length ? "" : copy.summary,
    identityGuard: {
      outcome: unsupportedTitleEntityIds.length || unsupportedSummaryEntityIds.length ? "fallback" : "pass",
      unsupportedTitleEntityIds,
      unsupportedSummaryEntityIds,
    } as IdentityGuard,
  };
}

// Answer-first summary length

export function compactAnswerFirstSummary(summary: string, maxChars = 800): string {
  const text = summary.trim().replace(/\s*\n+\s*/g, " ");
  if (text.length <= maxChars) return text;
  const sentences = text.match(/[\s\S]+?(?:[。！？!?]|\.(?=\s|$)|$)/gu) ?? [text];
  let result = "";
  for (const sentence of sentences) {
    if ((result + sentence).length > maxChars) break;
    result += sentence;
    if (result.length >= 80) break;
  }
  // Whole sentences, even a short one, read better than half of the next.
  if (result) return result.trim();
  // The first sentence alone is too long: cut at a clause boundary, never inside a name, number or enumeration.
  const clauses = text.match(/[^，；,;]+[，；,;]?/gu) ?? [text];
  for (const clause of clauses) {
    if ((result + clause).length + 1 > maxChars) break;
    result += clause;
    if (result.length >= 80) break;
  }
  return result.length >= 50 ? `${result.replace(/[，；：、,;:]$/u, "")}.` : text;
}

function answerFirstSummaryLengthOk(summary: string): boolean {
  return summary.trim().length <= 800 && summary.trim().split(/\s+/).length <= 120;
}

export const isShortTweetInput = (input: TranslateInput) => input.sourceKind === "x_search" && isShortTweet(input.mainText || input.title);

/** The length rule (compacted without another call) and the identity guard, for any writing model. */
export function finalizeCopy(input: TranslateInput, copy: { title: string; summary: string }) {
  let summary = copy.summary;
  if (!isShortTweetInput(input) && summary && !answerFirstSummaryLengthOk(summary)) summary = compactAnswerFirstSummary(summary);
  return enforceIdentity(input, { title: looksEnglish(copy.title) ? copy.title : "", summary: looksEnglish(summary) ? summary : "" });
}

// Title/summary prompts for items the content understanding does not write

const sourceName = (name?: string) => name?.trim() || "（未注明）";

function anchorDate(d: Date | undefined): string {
  if (!d || Number.isNaN(d.getTime())) return "未注明";
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

export function buildArticlePrompt(input: TranslateInput): string {
  return promptText("summarize-article", {
    publishedDate: input.publicationTime?.length === 10 ? input.publicationTime : anchorDate(input.publishedAt),
    today: anchorDate(new Date()),
    sourceName: sourceName(input.sourceName),
    identity: identityPrompt(input),
    title: input.title,
    body: input.text ? clampText(cleanArticleTextForLLM(input.text), 6000) : promptText("summarize-article-empty"),
  });
}

/** The quoted post's block, appended after a blank line when there is one. */
function quotedBlock(input: TranslateInput, name: string): string {
  if (!input.quotedText) return "";
  return `\n\n${promptText(name, { quotedLabel: input.quotedAuthor ? `@${input.quotedAuthor}` : "引用推文", quotedText: clampText(input.quotedText, 1500) })}`;
}

export function buildShortTweetPrompt(input: TranslateInput): string {
  const post = clampText(input.mainText || input.text || input.title, 4000);
  return promptText("summarize-short-post", { sourceName: sourceName(input.sourceName), identity: identityPrompt(input), post }) + quotedBlock(input, "summarize-short-post-quoted");
}

export function buildLongTweetPrompt(input: TranslateInput): string {
  const post = clampText(input.mainText || input.text || input.title, 4000);
  return promptText("summarize-long-post", { sourceName: sourceName(input.sourceName), identity: identityPrompt(input), post }) + quotedBlock(input, "summarize-long-post-quoted");
}

/** Prompt lines a model sometimes repeats after its answer (来源：…, 【已核验身份上下文】…, 原始标题：…). */
const ECHO_LINE = /^(Source:|Original title:|Publication date:|来源[:：]|【已核验身份上下文】|这些事实只用于防止|原始标题[:：]|【时间锚点】)/;

/** The answer without prompt lines repeated at its end. */
export function stripEcho(text: string): string {
  const lines = text.split("\n");
  while (lines.length && (lines[lines.length - 1]!.trim() === "" || ECHO_LINE.test(lines[lines.length - 1]!.trim()))) lines.pop();
  return lines.join("\n").trim();
}

/** `title:` / `summary:` / `body:` lines, with fallbacks for answers that drop the labels. */
export function parseWritingOutput(text: string): { title: string; summary: string; body: string } {
  let title = "";
  let summary = "";
  let body = "";
  let titleLine = -1;
  let summaryLine = -1;
  let bodyLine = -1;
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const t = lines[i]!.trim();
    const titleMatch = t.match(/^title\s*[:：]\s*(.*)$/);
    if (titleMatch) { title = titleMatch[1]!.trim(); titleLine = i; continue; }
    const summaryMatch = t.match(/^summary\s*[:：]\s*(.*)$/);
    if (summaryMatch) { summary = summaryMatch[1]!.trim(); summaryLine = i; continue; }
    const bodyMatch = t.match(/^body\s*[:：]\s*(.*)$/);
    if (bodyMatch) { body = bodyMatch[1]!.trim(); bodyLine = i; continue; }
  }
  // A title without a labelled summary or body: the lines after it are the summary.
  if (title && !summary && bodyLine < 0 && titleLine >= 0) {
    const rest = lines.slice(titleLine + 1).map((l) => l.trim()).filter(Boolean);
    if (rest.length) summary = rest.join("\n");
  }
  // A summary split over lines: join the unlabelled lines after it.
  if (summaryLine >= 0) {
    const more: string[] = [];
    for (let i = summaryLine + 1; i < lines.length; i += 1) {
      const t = lines[i]!.trim();
      if (!t) continue;
      if (/^(title|summary|body)\s*[:：]/.test(t)) break;
      more.push(t);
    }
    const parts = [summary, ...more].filter(Boolean);
    if (parts.length) summary = parts.join("\n");
  }
  // A body over lines keeps its paragraph breaks.
  if (bodyLine >= 0) {
    const more: string[] = [];
    for (let i = bodyLine + 1; i < lines.length; i += 1) {
      if (/^(title|summary|body)\s*[:：]/.test(lines[i]!.trim())) break;
      more.push(lines[i]!);
    }
    while (more.length && more[more.length - 1]!.trim() === "") more.pop();
    const parts = body ? [body, ...more] : more;
    if (parts.length) body = parts.join("\n");
  }
  if (!title && !summary && !body) {
    const rest = text.trim().split(/\r?\n/).filter(Boolean);
    if (rest.length >= 2) {
      title = rest[0]!.trim();
      summary = rest.slice(1).join("\n").trim();
    } else if (rest.length === 1) {
      title = rest[0]!.trim();
    }
  }
  return { title, summary: stripEcho(summary), body: stripEcho(body) };
}
