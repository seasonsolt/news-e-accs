import { sql } from "../db.ts";

const STATIC_PATHS = new Set([
  "/", "/all", "/hot", "/daily", "/daily/archive", "/weekly", "/monthly", "/topics", "/chronicle",
  "/what-is-eacc", "/eacc-vs-dacc", "/eacc-glossary", "/products", "/about", "/terms", "/privacy",
  "/changelog", "/feedback", "/subscribe", "/more", "/starred", "/agent",
]);

/** Keep analytics at route level: dynamic IDs, query strings and unknown paths never enter the table. */
export function normalizePagePath(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length > 240 || !raw.startsWith("/") || raw.startsWith("//") || /[?#\\]/.test(raw)) return null;
  if (STATIC_PATHS.has(raw)) return raw;
  if (/^\/items\/[^/]+\/original$/.test(raw)) return "/items/:id/original";
  if (/^\/items\/[^/]+$/.test(raw)) return "/items/:id";
  if (/^\/story\/[^/]+$/.test(raw)) return "/story/:id";
  if (/^\/(daily|weekly|monthly)\/[^/]+$/.test(raw)) return raw.startsWith("/daily/") ? "/daily/:issue" : raw.startsWith("/weekly/") ? "/weekly/:issue" : "/monthly/:issue";
  if (/^\/topics\/[^/]+\/page\/\d+$/.test(raw)) return "/topics/:slug/page/:page";
  if (/^\/topics\/[^/]+$/.test(raw)) return "/topics/:slug";
  return null;
}

export async function recordPageView(path: string): Promise<void> {
  await sql`
    INSERT INTO site_pageviews_daily (day, path, views)
    VALUES ((now() AT TIME ZONE 'Asia/Taipei')::date, ${path}, 1)
    ON CONFLICT (day, path) DO UPDATE SET views = site_pageviews_daily.views + 1, updated_at = now()`;
}
