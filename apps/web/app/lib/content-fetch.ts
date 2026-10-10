import { pathLocale, requestLocale, type Locale } from "./locale.ts";

export function contentUrl(path: string, request?: Request, edition?: Locale): string {
  const locale = edition ?? (request ? requestLocale(request) : typeof window !== "undefined" ? pathLocale(window.location.pathname) : "en");
  const url = new URL(path, "http://local");
  if (url.pathname.startsWith("/api/site/")) url.searchParams.set("lang", locale);
  return /^https?:/.test(path) ? url.href : `${url.pathname}${url.search}${url.hash}`;
}
export function contentFetch(input: string, init?: RequestInit): Promise<Response> {
  return fetch(contentUrl(input), init);
}
