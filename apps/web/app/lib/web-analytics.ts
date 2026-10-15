/** Cloudflare Web Analytics beacon. The token is public; the script reports to cloudflareinsights.com. */
export const WEB_ANALYTICS_SRC = "https://static.cloudflareinsights.com/beacon.min.js";

/** Attribute value for `data-cf-beacon`. Kept to the token so the tag matches Cloudflare's snippet. */
export function webAnalyticsAttribute(token: string): string {
  return JSON.stringify({ token });
}

export function isAdminPath(pathname: string): boolean {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}
