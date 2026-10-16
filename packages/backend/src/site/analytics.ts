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

/** Allowlisted interaction names. Anything else is dropped and never stored. */
export const SITE_EVENTS = [
  "star_add", "star_remove", "first_star", "subscribe_click", "subscribe_submit", "outbound_click", "share_click", "starred_export", "starred_import",
  "enter_3d", "click_star",
] as const;
export type SiteEvent = (typeof SITE_EVENTS)[number];

const SITE_EVENT_SET = new Set<string>(SITE_EVENTS);
const ITEM_TARGET = new Set<SiteEvent>(["star_add", "star_remove"]);
const EMPTY_TARGET = new Set<SiteEvent>(["first_star", "subscribe_click", "subscribe_submit", "share_click", "starred_export", "starred_import", "enter_3d"]);
/** A chronicle milestone id. Not a publication, so it is checked as an id and capped per day. */
const MILESTONE_TARGET = new Set<SiteEvent>(["click_star"]);
const STAR_CLICKS_PER_DAY = 400;
const ITEM_ID = /^[a-zA-Z0-9_-]{1,80}$/;
const HOSTNAME = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const IPV4 = /^(?:\d{1,3}\.){3}\d{1,3}$/;
/** New source domains accepted per day. The endpoint is public, so this bounds how many rows a script can add. */
const DOMAINS_PER_DAY = 500;

/**
 * A source link becomes its host only: no path, query, user or address.
 * Empty is a click whose host could not be read. Anything else is rejected.
 */
export function normalizeSourceDomain(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed === "") return "";
  if (trimmed.length > 300) return null;
  let host = trimmed;
  if (/[:/?#@\s]/.test(trimmed)) {
    try {
      const url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`);
      if (url.username || url.password) return null;
      if (url.protocol !== "http:" && url.protocol !== "https:") return null;
      host = url.hostname;
    } catch {
      return null;
    }
  }
  host = host.toLowerCase().replace(/\.$/, "").replace(/^www\./, "");
  if (!host || host.length > 253 || host.includes(":") || IPV4.test(host)) return null;
  if (!HOSTNAME.test(host)) {
    try {
      host = new URL(`https://${host}`).hostname.toLowerCase().replace(/\.$/, "").replace(/^www\./, "");
    } catch {
      return null;
    }
  }
  if (!HOSTNAME.test(host) || host.includes(":") || IPV4.test(host)) return null;
  return host;
}

/** Reduce a public event body to an allowlisted name and a safe target, or reject it. */
export function normalizeSiteEvent(body: unknown): { event: SiteEvent; target: string } | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const event = (body as { event?: unknown }).event;
  const raw = (body as { target?: unknown }).target;
  if (typeof event !== "string" || !SITE_EVENT_SET.has(event)) return null;
  if (raw !== undefined && raw !== null && typeof raw !== "string") return null;
  if (typeof raw === "string" && raw.length > 300) return null;
  const target = typeof raw === "string" ? raw : "";
  const name = event as SiteEvent;
  if (EMPTY_TARGET.has(name)) return target === "" ? { event: name, target: "" } : null;
  if (ITEM_TARGET.has(name) || MILESTONE_TARGET.has(name)) return ITEM_ID.test(target) ? { event: name, target } : null;
  const domain = normalizeSourceDomain(target);
  return domain === null ? null : { event: "outbound_click", target: domain };
}

/**
 * Adds one to today's counter. Stars count only for published items, and outbound clicks start a new
 * domain row only while today has fewer than DOMAINS_PER_DAY of them, so made-up targets cannot grow the table.
 * Milestone stars in the chronicle voyage are capped the same way: a real pass touches a few hundred ids.
 */
export async function recordSiteEvent(event: SiteEvent, target: string): Promise<void> {
  const guard = ITEM_TARGET.has(event)
    ? sql`EXISTS (SELECT 1 FROM publications WHERE article_id = ${target})`
    : event === "outbound_click" && target !== ""
      ? sql`(EXISTS (SELECT 1 FROM site_events_daily WHERE day = today.day AND event = 'outbound_click' AND target = ${target})
          OR (SELECT count(*) FROM site_events_daily WHERE day = today.day AND event = 'outbound_click') < ${DOMAINS_PER_DAY})`
      : event === "click_star"
        ? sql`(EXISTS (SELECT 1 FROM site_events_daily WHERE day = today.day AND event = 'click_star' AND target = ${target})
            OR (SELECT count(*) FROM site_events_daily WHERE day = today.day AND event = 'click_star') < ${STAR_CLICKS_PER_DAY})`
        : sql`true`;
  await sql`
    INSERT INTO site_events_daily (day, event, target, count)
    SELECT today.day, ${event}, ${target}, 1
    FROM (SELECT (now() AT TIME ZONE 'Asia/Taipei')::date AS day) AS today
    WHERE ${guard}
    ON CONFLICT (day, event, target) DO UPDATE
      SET count = site_events_daily.count + 1, updated_at = now()`;
}
