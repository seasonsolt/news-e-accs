// Page metadata from one place: title template, canonical address, OG images, robots; and list addresses,
// with the feed filters they carry. The site's name and wording come from site/site.ts; its address from
// SITE_URL.
import { contentLocale, hasBothEditions, type LanguageContent } from "./content-language.ts";
import { translate } from "./translate.ts";
import { hasChineseRoute, localePath, publicPath, htmlLanguage, type Locale } from "./locale.ts";
import type { MetaDescriptor } from "react-router";
import { REPORT_NAMES, reportDateLabel, type ReportDetail, type StoryDetail, type TimelineFilters } from "@aihot/contracts/site";
import { isCategoryKey, isChannelKey } from "@aihot/contracts/taxonomy";
import { SITE, subjectAfter, withSubject } from "@aihot/site";

/**
 * The site's address: SITE_URL while rendering on the server (what crawlers and share previews read),
 * the page's own origin in the browser.
 */
export function siteUrl(): string {
  if (typeof window !== "undefined") return window.location.origin;
  return (process.env.SITE_URL || SITE.defaultUrl).replace(/\/+$/, "");
}

const HOME_TITLE = SITE.homeTitle;
const SITE_DESCRIPTION = SITE.description;

export interface PageMetaInput {
  title?: string | null;
  /** Actual headline/summary language and edition availability, independent of the frame. */
  content?: LanguageContent | null;
  contentLocale?: Locale;
  alternates?: boolean;
  /** Use `title` verbatim as the document title (no " · <site>" suffix). */
  rawTitle?: boolean;
  description?: string | null;
  path: string;
  image?: string | null;
  noindex?: boolean;
  /** Only Google is asked not to index the page; other engines index it unless `noindex`. */
  googleNoindex?: boolean;
  nofollow?: boolean;
  type?: "website" | "article";
  /** When the page was first published. Emitted as article:published_time for article pages. */
  publishedTime?: string | null;
  /** When the page was last updated. Emitted as article:modified_time only when the page has one. */
  modifiedTime?: string | null;
  jsonLd?: Record<string, unknown> | Array<Record<string, unknown>>;
}

/**
 * A list's address from the parameters it applied (unset ones left out): a page's own address (canonical,
 * og:url), and the api list it reads. Tracking and unknown parameters (`?from=timeline`, `utm_*`) never
 * become part of it. The page caches keep one copy across such parameters, so the address in that copy
 * must not depend on them either.
 */
export function listPath(path: string, params: Record<string, string | number | null | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== null && v !== undefined && v !== "") sp.set(k, String(v));
  const qs = sp.toString();
  return qs ? `${path}?${qs}` : path;
}

/** The feed filters an address asks for; an unknown channel or category means none. */
export function readFilters(params: URLSearchParams): TimelineFilters {
  const channel = params.get("channel") ?? "all";
  const category = params.get("category");
  return {
    channel: isChannelKey(channel) ? channel : "all",
    category: category && isCategoryKey(category) ? category : null,
    tag: params.get("tag")?.trim() || null,
  };
}

/** Feed filters as list address parameters: the default channel and unset filters are left out. */
export function filterParams(f: TimelineFilters) {
  return { channel: f.channel === "all" ? null : f.channel, category: f.category, tag: f.tag };
}

/** Filter combinations are browsing views; the unfiltered feed and its archive pages remain indexable. */
export function hasFeedFilters(filters: TimelineFilters | undefined): boolean {
  return !!filters && (filters.channel !== "all" || !!filters.category || !!filters.tag);
}

/** "Title · Site". */
export function titled(title: string): string {
  return `${title} · ${SITE.name}`;
}

export function pageMeta(input: PageMetaInput, locale: Locale = "en"): MetaDescriptor[] {
  input = { ...input, title: input.title ? translate(locale, input.title) : input.title, description: input.description ? translate(locale, input.description) : input.description };
  const base = siteUrl();
  const title = input.title ? (input.rawTitle ? input.title : titled(input.title)) : translate(locale, HOME_TITLE);
  const description = input.description ?? (locale === "en" ? SITE.homeDescription : translate(locale, SITE_DESCRIPTION));
  const path = localePath(input.path, locale);
  const actualLocale = input.contentLocale ?? (input.content ? contentLocale(input.content, locale) : locale);
  // A frame showing the other edition's text (its own edition not written yet) is a copy of that
  // edition's page: the canonical names the page whose language the text is in.
  const copyOf = (input.content || input.contentLocale) && actualLocale && actualLocale !== locale ? actualLocale : null;
  const url = `${base}${copyOf ? localePath(input.path, copyOf) : path}`;
  const imagePath = input.image?.startsWith("/og/") ? `${input.image}${input.image.includes("?") ? "&" : "?"}lang=${actualLocale ?? locale}` : input.image;
  const image = imagePath ? (imagePath.startsWith("http") ? imagePath : `${base}${imagePath}`) : `${base}/og/site.png?lang=${locale}`;
  const tags: MetaDescriptor[] = [
    { title },
    { name: "description", content: description },
    { tagName: "link", rel: "canonical", href: url },
    { property: "og:site_name", content: SITE.name },
    { property: "og:type", content: input.type ?? "website" },
    ...(input.type === "article" && input.publishedTime ? [{ property: "article:published_time", content: input.publishedTime }] : []),
    ...(input.type === "article" && input.modifiedTime ? [{ property: "article:modified_time", content: input.modifiedTime }] : []),
    { property: "og:title", content: input.title ?? title },
    { property: "og:description", content: description },
    { property: "og:url", content: url },
    { property: "og:image", content: image },
    { property: "og:image:width", content: "1200" },
    { property: "og:image:height", content: "630" },
    ...(actualLocale ? [{ property: "og:locale", content: htmlLanguage(actualLocale).replace("-", "_") }] : []),
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: input.title ?? title },
    { name: "twitter:description", content: description },
    { name: "twitter:image", content: image },
  ];
  if (input.noindex) tags.push({ name: "robots", content: input.nofollow ? "noindex, nofollow" : "noindex, follow" });
  else {
    // Search results and Discover may show an indexable page's picture large, as they do for news sites.
    tags.push({ name: "robots", content: "max-image-preview:large" });
    if (input.googleNoindex) tags.push({ name: "googlebot", content: "noindex" });
  }
  const both = !copyOf && (input.alternates ?? (input.content ? hasBothEditions(input.content) : !/^\/(?:items|story|daily|weekly|monthly)(?:\/|$)/.test(publicPath(path.split("?")[0]!))));
  if (both && hasChineseRoute(path.split("?")[0]!)) {
    for (const [language, edition] of [["en", "en"], ["zh-CN", "zh"], ["x-default", "en"]] as const) {
      tags.push({ tagName: "link", rel: "alternate", hrefLang: language, href: `${base}${localePath(input.path, edition)}` });
    }
  }
  if (input.jsonLd) tags.push({ "script:ld+json": localizeStructuredData(input.jsonLd, copyOf ?? locale, base) });
  return tags;
}

function localizeStructuredData<T>(value: T, locale: Locale, base: string): T {
  if (Array.isArray(value)) return value.map((entry) => localizeStructuredData(entry, locale, base)) as T;
  // Site-wide nodes ("/#organization") are one entity in both editions; only page addresses take the edition.
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, key === "@id" && typeof entry === "string" && entry.startsWith(`${base}/#`) ? entry : localizeStructuredData(entry, locale, base)])) as T;
  return typeof value === "string" && value.startsWith(base + "/") ? base + localePath(value.slice(base.length), locale) as T : value;
}

export function organizationLd() {
  const base = siteUrl();
  const founder = SITE.organization.founder;
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${base}/#organization`,
    name: SITE.organization.name,
    url: base,
    logo: `${base}/icon.png`,
    ...(SITE.organization.sameAs.length ? { sameAs: SITE.organization.sameAs } : {}),
    ...(founder ? {
      founder: {
        "@type": "Person",
        name: founder.name,
        ...(founder.alternateName ? { alternateName: founder.alternateName } : {}),
        ...(founder.jobTitle ? { jobTitle: founder.jobTitle } : {}),
        ...(founder.description ? { description: founder.description } : {}),
        ...(founder.sameAs?.length ? { sameAs: founder.sameAs } : {}),
      },
    } : {}),
  };
}

/** The front page's WebSite entry, with the /all search as its search action. */
export function websiteLd(locale: Locale = "en") {
  const base = siteUrl();
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE.name,
    url: base,
    inLanguage: htmlLanguage(locale),
    potentialAction: { "@type": "SearchAction", target: { "@type": "EntryPoint", urlTemplate: `${base}/all?q={search_term_string}` }, "query-input": "required name=search_term_string" },
  };
}

export interface NewsArticleInput {
  path: string;
  headline: string;
  description?: string | null;
  /** The page's share image (1200×630), site-relative or absolute. */
  image: string;
  /** The dates the page shows; Google matches them against the visible ones. */
  datePublished: string | null;
  dateModified?: string | null;
  /** The language of the headline and summary (not of the interface). */
  inLanguage?: string;
  /** The report the page summarizes, when it summarizes one. */
  basedOn?: string | null;
  keywords?: string[];
}

/** A news page (an item's summary, an event): written and published by the site, citing its sources. */
export function newsArticleLd(input: NewsArticleInput) {
  const base = siteUrl();
  const url = `${base}${input.path}`;
  const site = { "@type": "Organization", name: SITE.organization.name, url: base };
  // A page is dated modified only when its source says so: the publication time is not an update time.
  const modified = input.dateModified;
  const language = input.inLanguage?.startsWith("zh") ? "zh" : input.inLanguage === "en" ? "en" : null;
  const image = input.image.startsWith("/og/") && language ? `${input.image}?lang=${language}` : input.image;
  return {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    url,
    headline: input.headline,
    ...(input.description ? { description: input.description } : {}),
    image: [image.startsWith("http") ? image : `${base}${image}`],
    ...(input.datePublished ? { datePublished: input.datePublished } : {}),
    ...(modified ? { dateModified: modified } : {}),
    ...(input.inLanguage ? { inLanguage: input.inLanguage } : {}),
    author: site,
    publisher: { ...site, logo: { "@type": "ImageObject", url: `${base}/icon.png` } },
    ...(input.basedOn ? { isBasedOn: input.basedOn } : {}),
    ...(input.keywords?.length ? { keywords: input.keywords.join(", ") } : {}),
  };
}

export function breadcrumbLd(items: Array<{ name: string; path: string }>) {
  const base = siteUrl();
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: `${base}${it.path}` })),
  };
}

const orgRef = () => ({ "@id": `${siteUrl()}/#organization` });

/**
 * The site as an article's author and publisher, spelled out: the id alone resolves only where the full
 * Organization node is on the same page (the home and about pages), so an article page would name no one.
 */
function siteOrganization() {
  const base = siteUrl();
  return { "@type": "Organization", "@id": `${base}/#organization`, name: SITE.organization.name, url: base, logo: { "@type": "ImageObject", url: `${base}/icon.png` } };
}

/**
 * The home page's machine description: the site, and the site as a dataset with its feeds and API.
 * Model-written content never names a person as its author.
 */
export function siteLd() {
  const base = siteUrl();
  return [
    organizationLd(),
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      "@id": `${base}/#website`,
      name: SITE.name,
      url: base,
      description: SITE_DESCRIPTION,
      inLanguage: SITE.locale,
      publisher: orgRef(),
    },
    {
      "@context": "https://schema.org",
      "@type": "Dataset",
      "@id": `${base}/#dataset`,
      name: `${SITE.name} — ${withSubject("行业动态数据集")}`,
      description: `${subjectAfter("持续更新的中文", "行业动态")}：每条附中文摘要、评分与原文出处，${subjectAfter("另有每日精选与", "日报")}，可通过 RSS 与公开 API 获取。`,
      url: base,
      inLanguage: SITE.locale,
      isAccessibleForFree: true,
      ...(SITE.since ? { temporalCoverage: `${SITE.since}/..` } : {}),
      keywords: SITE.keywords,
      creator: orgRef(),
      publisher: orgRef(),
      distribution: [
        { "@type": "DataDownload", name: "精选 RSS", encodingFormat: "application/rss+xml", contentUrl: `${base}/feed.xml` },
        { "@type": "DataDownload", name: "全部动态 RSS", encodingFormat: "application/rss+xml", contentUrl: `${base}/feed/all.xml` },
        { "@type": "DataDownload", name: `${withSubject("日报")} RSS`, encodingFormat: "application/rss+xml", contentUrl: `${base}/feed/daily.xml` },
        { "@type": "DataDownload", name: `${withSubject("周报")} RSS`, encodingFormat: "application/rss+xml", contentUrl: `${base}/feed/weekly.xml` },
        { "@type": "DataDownload", name: `${withSubject("月报")} RSS`, encodingFormat: "application/rss+xml", contentUrl: `${base}/feed/monthly.xml` },
        { "@type": "DataDownload", name: "公开 API v1", encodingFormat: "application/json", contentUrl: `${base}/api/v1/items` },
        { "@type": "DataDownload", name: "OpenAPI", encodingFormat: "application/json", contentUrl: `${base}/openapi-v1.json` },
      ],
    },
  ];
}

/**
 * A list's entries by their visible titles. No entry URLs: item pages are mostly noindex, and a
 * list item must point at an indexable page; the list itself is the signal.
 */
export function itemListLd(path: string, name: string, titles: string[]) {
  const names = titles.slice(0, 30);
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `${SITE.name} · ${name}`,
    url: `${siteUrl()}${path}`,
    numberOfItems: names.length,
    itemListElement: names.map((n, i) => ({ "@type": "ListItem", position: i + 1, name: n })),
  };
}

/** An item page: the site's reading of a third-party report, based on (not claiming) the original. */
export function articleLd(input: { path: string; headline: string; description?: string | null; publishedAt?: string | null; modifiedAt?: string | null; image?: string | null; basedOn?: string | null; section?: string[] }) {
  const base = siteUrl();
  const url = `${base}${input.path}`;
  const description = input.description?.trim();
  return {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    "@id": `${url}#article`,
    isPartOf: { "@id": `${base}/#website` },
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    url,
    headline: input.headline.slice(0, 110),
    ...(description ? { description: description.slice(0, 300) } : {}),
    inLanguage: SITE.locale,
    ...(input.publishedAt ? { datePublished: input.publishedAt } : {}),
    ...(input.modifiedAt ? { dateModified: input.modifiedAt } : {}),
    ...(input.image ? { image: new URL(input.image, base).href } : {}),
    ...(input.section?.length ? { articleSection: input.section } : {}),
    isAccessibleForFree: true,
    author: siteOrganization(),
    publisher: siteOrganization(),
    ...(input.basedOn ? { isBasedOn: input.basedOn } : {}),
  };
}

/** An archive whose entries are indexable pages of their own (report issues). */
export function archiveLd(path: string, name: string, entries: Array<{ path: string; name: string }>) {
  const base = siteUrl();
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name,
    url: `${base}${path}`,
    numberOfItems: entries.length,
    itemListOrder: "https://schema.org/ItemListOrderDescending",
    itemListElement: entries.map((e, i) => ({ "@type": "ListItem", position: i + 1, name: e.name, url: `${base}${e.path}` })),
  };
}

/** An issue's Chinese date and actual editorial lead, falling back only to a still-public visible highlight. */
export function reportTitle(report: ReportDetail): string {
  // Without a lead, the first highlight the issue carries as an entry heads it; the reports a thin daily's
  // highlights were filled with are not its news.
  const entries = new Set(report.sections.flatMap((s) => s.items.map((i) => i.itemId)));
  const lead = report.lead?.title.trim() || report.highlights.find((item) => item.available && entries.has(item.itemId))?.title.trim();
  const name = `${withSubject(REPORT_NAMES[report.kind])}｜${reportDateLabel(report.kind, report.key)}`;
  return lead ? `${name}：${lead}` : name;
}

/**
 * What an issue says, for search results. A daily by its own headlines: its lead's paragraph is that article's
 * own description, and two pages that read alike compete for one result. A weekly or monthly by its lead or
 * overview. Null when the issue has neither. The English edition dates it by its key.
 */
export function reportDescription(r: ReportDetail, locale: Locale = "zh"): string | null {
  const en = locale === "en";
  const date = en ? r.key : reportDateLabel(r.kind, r.key);
  if (r.kind === "daily") {
    const titles = [...new Set([r.lead?.title, ...r.highlights.filter((h) => h.available).map((h) => h.title)]
      .map((t) => t?.trim()).filter((t): t is string => !!t))];
    if (titles.length) {
      // As many as a result shows in full (about 150 characters).
      let text = titles[0]!;
      for (const t of titles.slice(1)) {
        if (text.length + t.length > 120) break;
        text += en ? `; ${t}` : `；${t}`;
      }
      const end = /[。！？.!?]$/.test(text) ? "" : en ? "." : "。";
      return en ? `${date} ${withSubject("news")}: ${text}${end}` : `${date} ${withSubject("新闻")}：${text}${end}`;
    }
  }
  const lead = r.lead?.leadParagraph ?? (r.overview ? clipText(r.overview, 150) : null);
  if (!lead) return null;
  return en ? `${date}: ${lead}` : `${date} ${withSubject("资讯")}：${lead}`;
}

/** One report issue: an editorial round-up by the site (no personal byline), sections as its sections. */
export function reportLd(r: ReportDetail, path: string, description: string) {
  return articleLd({
    path,
    headline: reportTitle(r),
    description,
    publishedAt: r.generatedAt,
    image: `/og/reports/${r.kind}/${r.key}.png`,
    section: r.sections.map((s) => s.label),
  });
}

/**
 * A meta description cut on a sentence or word boundary.
 * A hard character cut used to split a token: "llm-gemini 0.35" became "llm-gemini 0".
 */
export function clipText(text: string, max = 160): string {
  const flat = text.replace(/\s+/g, " ").trim();
  const chars = [...flat];
  if (chars.length <= max) return flat;
  const floor = Math.min(max, Math.max(40, Math.floor(max * 0.5)));
  let sentence = -1;
  for (let i = floor; i < max && i < chars.length; i++) {
    if (!isSentenceEnd(chars, i)) continue;
    let end = i + 1;
    while (end < chars.length && end <= max && /["”')\]]/u.test(chars[end]!)) end += 1;
    if (end <= max) sentence = end;
  }
  if (sentence > 0) return chars.slice(0, sentence).join("").trim();
  let word = -1;
  for (let i = floor; i < max && i < chars.length; i++) if (isWordBreak(chars[i]!)) word = i;
  if (word > 0) return `${chars.slice(0, word).join("").trimEnd()}…`;
  // No break in the window: back out of a Latin word or number that continues past the cut.
  let end = max;
  if (isTokenChar(chars[max - 1] ?? "") && isTokenChar(chars[max] ?? "")) {
    while (end > floor && isTokenChar(chars[end - 1] ?? "")) end -= 1;
    while (end > floor && isWordBreak(chars[end - 1] ?? "")) end -= 1;
    if (end >= floor && end < max) return `${chars.slice(0, end).join("").trimEnd()}…`;
  }
  return `${chars.slice(0, max).join("").trimEnd()}…`;
}

function isWordBreak(ch: string): boolean {
  return ch === " " || ch === "，" || ch === "," || ch === "、" || ch === "；" || ch === ";";
}

function isTokenChar(ch: string): boolean {
  return /[A-Za-z0-9._-]/.test(ch);
}

/** A period between digits is a decimal point, not the end of a sentence. */
function isSentenceEnd(chars: string[], index: number): boolean {
  const ch = chars[index]!;
  if (!"。！？.!?".includes(ch)) return false;
  const next = chars[index + 1];
  if (ch === "." && /\d/.test(chars[index - 1] ?? "") && (next === undefined || /\d/.test(next))) return false;
  return next === undefined || /[\s"”')\]]/u.test(next);
}

/** Earliest coverage and the latest of the newest report and a current digest. */
export function storyTimes(story: Pick<StoryDetail, "firstReportAt" | "latestAt" | "digest" | "digestUpdatedAt">): { published: string | null; modified: string | null } {
  const modified = [story.latestAt, story.digest ? story.digestUpdatedAt : null]
    .filter((at): at is string => !!at).sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? null;
  return { published: story.firstReportAt, modified };
}

function storySourceUrls(story: StoryDetail): string[] {
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const report of [...story.timeline, ...story.officialReports, ...story.developments.map((d) => d.representative)]) {
    const url = report.originalUrl?.trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    urls.push(url);
  }
  return urls;
}

/**
 * The event as one news article: dated from its earliest coverage to its latest update, published by
 * the site, and citing the original reports. The collection listing stays beside it.
 */
export function storyArticleLd(story: StoryDetail, inLanguage?: string) {
  const times = storyTimes(story);
  const sources = storySourceUrls(story);
  const article = newsArticleLd({
    path: `/story/${story.publicId}`,
    headline: story.title,
    description: story.digest ?? story.summary ?? story.excerpt?.text,
    image: `/og/stories/${story.publicId}.png`,
    datePublished: times.published,
    dateModified: times.modified,
    inLanguage,
  });
  return {
    ...article,
    publisher: { "@id": `${siteUrl()}/#organization` },
    ...(sources.length ? { citation: sources, isBasedOn: sources } : {}),
  };
}

/** The event page collects public reports; their publication times do not date the collection itself. */
export function storyLd(story: StoryDetail) {
  const base = siteUrl();
  const url = `${base}/story/${story.publicId}`;
  const description = story.digest ?? story.summary ?? story.excerpt?.text;
  const updated = storyTimes(story).modified;
  const reports = [...story.timeline].sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": `${url}#collection`,
    url,
    name: story.title,
    ...(description ? { description } : {}),
    inLanguage: SITE.locale,
    isPartOf: { "@id": `${base}/#website` },
    publisher: siteOrganization(),
    ...(updated ? { dateModified: updated } : {}),
    ...(reports.length ? {
      mainEntity: {
        "@type": "ItemList",
        name: "报道时间线",
        itemListOrder: "https://schema.org/ItemListOrderDescending",
        numberOfItems: reports.length,
        itemListElement: reports.map((report, index) => ({ "@type": "ListItem", position: index + 1, name: report.title })),
      },
    } : {}),
  };
}

/** A topic page: the collection, when a report last reached it, and the lists its parts show. */
export function topicLd(input: {
  path: string;
  name: string;
  description: string;
  dateModified: string | null;
  lists: Array<{ name: string; entries: Array<{ title: string; href: string | null }> }>;
}) {
  const base = siteUrl();
  const url = `${base}${input.path}`;
  // Entries name their event page when they have one (event pages are indexable, most article pages are not).
  const lists = input.lists.filter((l) => l.entries.length > 0).map((l) => ({
    "@type": "ItemList",
    name: `${input.name} · ${l.name}`,
    numberOfItems: l.entries.length,
    itemListElement: l.entries.map((e, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: e.title,
      ...(e.href?.startsWith("/story/") ? { url: `${base}${e.href}` } : {}),
    })),
  }));
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": `${url}#collection`,
    url,
    name: input.name,
    description: input.description,
    inLanguage: SITE.locale,
    isPartOf: { "@id": `${base}/#website` },
    ...(input.dateModified ? { dateModified: input.dateModified } : {}),
    ...(lists.length > 0 ? { mainEntity: lists.length === 1 ? lists[0] : lists } : {}),
  };
}
