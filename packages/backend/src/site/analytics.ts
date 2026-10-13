import type { ModulePage } from "@aihot/contracts/modules";
import { MODULES } from "@aihot/site/modules";
import { sql } from "../db.ts";

const STATIC_PATHS = new Set([
  "/", "/all", "/hot", "/daily", "/daily/archive", "/weekly", "/monthly", "/topics", "/chronicle",
  "/what-is-eacc", "/eacc-vs-dacc", "/eacc-glossary", "/products", "/about", "/terms", "/privacy",
  "/changelog", "/feedback", "/subscribe", "/more", "/starred", "/agent",
  "/leaderboard", "/leaderboard/sources", "/leaderboard/rules",
]);

/** Keep analytics at route level: dynamic IDs, query strings and unknown paths never enter the table. */
export function normalizePagePath(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length > 240 || !raw.startsWith("/") || raw.startsWith("//") || /[?#\\]/.test(raw)) return null;
  // The Chinese edition mirrors every public route under /zh; it is counted as its own path.
  if (raw === "/zh") return "/zh";
  if (raw.startsWith("/zh/")) {
    const route = englishPagePath(raw.slice(3));
    return route && route !== "/" ? `/zh${route}` : null;
  }
  return englishPagePath(raw);
}

// The modules' own pages, by their route pattern ("index/cost-of-intelligence", "guides/:slug"); the
// English ones, since /zh is counted by stripping it. Pages without a parameter are matched first.
const MODULE_PAGES = MODULES.flatMap((m) => (m.pages ?? []).flatMap((p): ModulePage[] => ("layout" in p ? p.pages : [p])))
  .map((p) => p.path)
  .filter((p) => !p.startsWith("zh/"))
  .sort((a, b) => Number(a.includes(":")) - Number(b.includes(":")))
  .map((p) => ({ path: `/${p}`, match: new RegExp(`^/${p.split("/").map((part) => (part.startsWith(":") ? "[^/]+" : part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))).join("/")}$`) }));

function englishPagePath(raw: string): string | null {
  if (STATIC_PATHS.has(raw)) return raw;
  if (/^\/items\/[^/]+\/original$/.test(raw)) return "/items/:id/original";
  if (/^\/items\/[^/]+$/.test(raw)) return "/items/:id";
  if (/^\/story\/[^/]+$/.test(raw)) return "/story/:id";
  if (/^\/(daily|weekly|monthly)\/[^/]+$/.test(raw)) return raw.startsWith("/daily/") ? "/daily/:issue" : raw.startsWith("/weekly/") ? "/weekly/:issue" : "/monthly/:issue";
  if (/^\/topics\/[^/]+\/page\/\d+$/.test(raw)) return "/topics/:slug/page/:page";
  if (/^\/topics\/[^/]+$/.test(raw)) return "/topics/:slug";
  if (/^\/leaderboard\/category\/[^/]+$/.test(raw)) return "/leaderboard/category/:key";
  if (/^\/leaderboard\/sources\/[^/]+$/.test(raw)) return "/leaderboard/sources/:key";
  if (/^\/leaderboard\/[^/]+$/.test(raw)) return "/leaderboard/:model";
  return MODULE_PAGES.find((p) => p.match.test(raw))?.path ?? null;
}

export async function recordPageView(path: string): Promise<void> {
  await sql`
    INSERT INTO site_pageviews_daily (day, path, views)
    VALUES ((now() AT TIME ZONE 'Asia/Taipei')::date, ${path}, 1)
    ON CONFLICT (day, path) DO UPDATE SET views = site_pageviews_daily.views + 1, updated_at = now()`;
}
