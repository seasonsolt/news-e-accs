import { routeOf } from "./route.mjs";

// Session and Access cookies must not read or fill the shared cache: the key is only the URL.
const PRIVATE_COOKIES = new Set(["aihot_admin", "aihot_oauth_state", "CF_Authorization"]);

function hasPrivateCookie(header) {
  if (!header) return false;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    const name = (eq === -1 ? part : part.slice(0, eq)).trim();
    if (PRIVATE_COOKIES.has(name)) return true;
  }
  return false;
}

/** Public news pages, Router data and /og images. APIs, admin, starred, feedback and session cookies do not. */
export function isCacheEligible(request) {
  if ((request.method !== "GET" && request.method !== "HEAD") || request.headers.has("authorization")) return false;
  if (hasPrivateCookie(request.headers.get("cookie"))) return false;
  const { pathname } = new URL(request.url);
  if (routeOf(pathname) !== "news") return false;
  if (pathname.startsWith("/og/")) return true;
  // Apply the page exclusions to Router data too, including /admin.data and /zh/admin/runs.data.
  const page = pathname.endsWith(".data") ? pathname.slice(0, -5) : pathname;
  if (["/admin", "/zh/admin", "/api", "/starred", "/zh/starred", "/feedback", "/zh/feedback", "/feed", "/sitemaps", "/assets", "/media", "/.well-known"]
    .some((prefix) => page === prefix || page.startsWith(`${prefix}/`))) return false;
  if (page.startsWith("/rss") || page === "/atom.xml" || page === "/__manifest" || page.startsWith("/contact")) return false;
  return true;
}

/**
 * Require an explicit public shared TTL. A response that sets a cookie, or is private, no-store
 * or no-cache, is never written.
 */
export function isCacheable(response) {
  if (response.status !== 200 || response.headers.has("set-cookie")) return false;
  const directives = (response.headers.get("cache-control") ?? "").split(",").map((part) => part.trim().toLowerCase());
  const shared = directives.filter((part) => /^s-maxage(?:\s*=|$)/.test(part));
  const age = shared.length === 1 ? /^s-maxage\s*=\s*(?:"(\d+)"|(\d+))$/.exec(shared[0]) : null;
  const ttl = Number(age?.[1] ?? age?.[2] ?? 0);
  const vary = response.headers.get("vary");
  return directives.includes("public") &&
    !directives.some((part) => /^(private|no-store|no-cache)(?:\s*=|$)/.test(part)) &&
    Number.isFinite(ttl) && ttl > 0 &&
    (vary === null || vary.split(",").every((part) => part.trim().toLowerCase() === "accept-encoding"));
}
