// Whether this process should emit the Cloudflare Web Analytics beacon. The token is public, but
// development, tests and a machine pointed at itself must not report into the production property.
import { SITE } from "@aihot/site";

function localSite(): boolean {
  const siteUrl = process.env.SITE_URL;
  if (!siteUrl) return false;
  try {
    const host = new URL(siteUrl).hostname.toLowerCase();
    return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]";
  } catch {
    return true;
  }
}

/**
 * Token for a production document, or null when the beacon stays out.
 * `CF_WEB_ANALYTICS_TOKEN` overrides `SITE.webAnalyticsToken`, including an empty value that turns it off.
 */
export function webAnalyticsToken(): string | null {
  if (process.env.NODE_ENV !== "production" || localSite()) return null;
  const fromEnv = process.env.CF_WEB_ANALYTICS_TOKEN;
  const token = (fromEnv !== undefined ? fromEnv : SITE.webAnalyticsToken).trim();
  return token || null;
}
