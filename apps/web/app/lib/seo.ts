import { contentLocale, hasBothEditions, type LanguageContent } from "./content-language";
import { translate } from "./translate";
import { hasChineseRoute, localePath, publicPath, htmlLanguage, type Locale } from "./locale";
// Page metadata from one place: title template, canonical address, OG images, robots. The site's name
// and wording come from the industry pack (industry/site.ts); its address from SITE_URL.
import type { MetaDescriptor } from "react-router";
import { SITE } from "@aihot/industry/site";

/**
 * The site's address: SITE_URL while rendering on the server (what crawlers and share previews read),
 * the page's own origin in the browser.
 */
export function siteUrl(): string {
  if (typeof window !== "undefined") return window.location.origin;
  return (process.env.SITE_URL || SITE.defaultUrl).replace(/\/+$/, "");
}

export const HOME_TITLE = SITE.homeTitle;
export const SITE_DESCRIPTION = SITE.description;

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
  nofollow?: boolean;
  type?: "website" | "article";
  jsonLd?: Record<string, unknown> | Array<Record<string, unknown>>;
}

/**
 * A list page's own address (canonical, og:url) from the filters it applied: tracking and unknown
 * parameters (`?from=timeline`, `utm_*`) never become part of it. The page caches keep one copy across
 * such parameters, so the address in that copy must not depend on them either.
 */
export function listPath(path: string, params: Record<string, string | number | null | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== null && v !== undefined && v !== "") sp.set(k, String(v));
  const qs = sp.toString();
  return qs ? `${path}?${qs}` : path;
}

/** "Title · Site". */
export function titled(title: string): string {
  return `${title} · ${SITE.name}`;
}

export function pageMeta(input: PageMetaInput, locale: Locale = "en"): MetaDescriptor[] {
  input = { ...input, title: input.title ? translate(locale, input.title) : input.title, description: input.description ? translate(locale, input.description) : input.description };
  const base = siteUrl();
  const title = input.title ? (input.rawTitle ? input.title : titled(input.title)) : (locale === "en" ? "e/acc — AI daily news & trending stories" : translate(locale, HOME_TITLE));
  const description = input.description ?? (locale === "en" ? "AI news, selected stories and daily briefings from e/acc. Reports are grouped into events, with original source links." : translate(locale, SITE_DESCRIPTION));
  const path = localePath(input.path, locale);
  const url = `${base}${path}`;
  const actualLocale = input.contentLocale ?? (input.content ? contentLocale(input.content, locale) : locale);
  const imagePath = input.image?.startsWith("/og/") ? `${input.image}${input.image.includes("?") ? "&" : "?"}lang=${actualLocale ?? locale}` : input.image;
  const image = imagePath ? (imagePath.startsWith("http") ? imagePath : `${base}${imagePath}`) : `${base}/og/site.png?lang=${locale}`;
  const tags: MetaDescriptor[] = [
    { title },
    { name: "description", content: description },
    { tagName: "link", rel: "canonical", href: url },
    { property: "og:site_name", content: SITE.name },
    { property: "og:type", content: input.type ?? "website" },
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
  const both = input.alternates ?? (input.content ? hasBothEditions(input.content) : !/^\/(?:items|story|daily|weekly|monthly)(?:\/|$)/.test(publicPath(path.split("?")[0]!)));
  if (both && hasChineseRoute(path.split("?")[0]!)) {
    for (const [language, edition] of [["en", "en"], ["zh-CN", "zh"], ["x-default", "en"]] as const) {
      tags.push({ tagName: "link", rel: "alternate", hrefLang: language, href: `${base}${localePath(input.path, edition)}` });
    }
  }
  if (input.jsonLd) tags.push({ "script:ld+json": localizeStructuredData(input.jsonLd, locale, base) });
  return tags;
}

function localizeStructuredData<T>(value: T, locale: Locale, base: string): T {
  if (Array.isArray(value)) return value.map((entry) => localizeStructuredData(entry, locale, base)) as T;
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, localizeStructuredData(entry, locale, base)])) as T;
  return typeof value === "string" && value.startsWith(base + "/") ? base + localePath(value.slice(base.length), locale) as T : value;
}

export function organizationLd() {
  const base = siteUrl();
  const founder = SITE.organization.founder;
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE.organization.name,
    url: base,
    logo: `${base}/icon.png`,
    ...(founder ? { founder: { "@type": "Person", name: founder.name, ...(founder.description ? { description: founder.description } : {}), ...(founder.url ? { sameAs: [founder.url] } : {}) } } : {}),
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
  const modified = input.dateModified ?? input.datePublished;
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
