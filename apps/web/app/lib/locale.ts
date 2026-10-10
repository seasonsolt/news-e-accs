/** UI language is part of the public URL; preferences never change a URL's response. */
export type Locale = "en" | "zh";
export const LANGUAGE_COOKIE = "eacc_language";

/** Normalize Router single-fetch addresses before interpreting a public page path. */
export function publicPath(pathname: string): string {
  const path = pathname.replace(/\.data$/, "").replace(/\/+$/, "") || "/";
  if (path === "/_" || path === "/zh/_") return "/";
  return path === "/zh" ? "/" : path.replace(/^\/zh(?=\/)/, "");
}
export function pathLocale(pathname: string): Locale {
  return /^\/zh(?:\/|\.data$|$)/.test(pathname) ? "zh" : "en";
}
export function requestLocale(request: Request): Locale {
  const pathname = new URL(request.url).pathname;
  return /^\/admin(?:\/|\.data$|$)/.test(pathname) ? "zh" : pathLocale(pathname);
}
export function htmlLanguage(locale: Locale): string { return locale === "zh" ? "zh-CN" : "en"; }

/** Only public HTML routes have an edition prefix. API, downloads, admin and assets do not. */
export function hasChineseRoute(pathname: string): boolean {
  const path = publicPath(pathname);
  return /^\/(?:$|all(?:\/search-busy)?$|search-busy$|items\/[^/]+(?:\/original)?$|hot$|story\/[^/]+$|daily(?:\/[^/]+)?$|weekly(?:\/[^/]+)?$|monthly(?:\/[^/]+)?$|topics(?:\/[^/]+(?:\/page\/\d+)?)?$|chronicle$|what-is-eacc$|eacc-vs-dacc$|eacc-glossary$|products$|about$|terms$|privacy$|changelog$|feedback$|subscribe$|more$|starred$|agent$)/.test(path);
}
export function localePath(to: string, locale: Locale): string {
  if (!to.startsWith("/") || to.startsWith("//")) return to;
  const split = to.search(/[?#]/);
  const pathname = split < 0 ? to : to.slice(0, split);
  const suffix = split < 0 ? "" : to.slice(split);
  if (!hasChineseRoute(pathname)) return to;
  const path = publicPath(pathname);
  return `${locale === "zh" ? path === "/" ? "/zh" : `/zh${path}` : path}${suffix}`;
}

/** Keep reading filters, drop Router internals and cursors tied to a particular language result. */
export function languageSwitchPath(pathname: string, search: string, hash: string, locale: Locale): string {
  const params = new URLSearchParams(search);
  for (const key of ["_routes", "_data", "lang", "cursor"]) params.delete(key);
  const query = params.toString();
  return localePath(`${publicPath(pathname)}${query ? `?${query}` : ""}${hash}`, locale);
}
