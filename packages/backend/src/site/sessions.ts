// Reader sessions for the admin's growth dashboard (docs/analytics.md). A visitor is a hash of the day's salt, the
// address and the user agent; the salt is random, lives one Taipei day and is then deleted, so a hash groups one
// day's views and can never be recomputed or joined to another day. No cookie or lasting identifier is used:
// returning readers and cohorts come from the dates the browser itself keeps (first and previous visit).
import { createHash, randomBytes } from "node:crypto";
import { addDays, beijingDate } from "@aihot/contracts/time";
import { sql } from "../db.ts";
import { normalizeSourceDomain } from "./analytics.ts";

/** A session ends after this long without a view or interaction. */
export const SESSION_GAP_MS = 30 * 60_000;
/** One page's visible time counts up to this much; a tab left open on a wall screen should not dominate. */
const MAX_ENGAGED_MS = 30 * 60_000;

let salt: { day: string; value: Buffer } | null = null;

/** Today's salt, created on first use. Earlier days' salts are deleted at that moment. */
async function daySalt(day: string): Promise<Buffer> {
  if (salt?.day === day) return salt.value;
  await sql`INSERT INTO site_salts (day, salt) VALUES (${day}, ${randomBytes(32)}) ON CONFLICT (day) DO NOTHING`;
  const [row] = await sql<{ salt: Buffer }[]>`SELECT salt FROM site_salts WHERE day = ${day}`;
  await sql`DELETE FROM site_salts WHERE day < ${day}`;
  salt = { day, value: row!.salt };
  return row!.salt;
}

export async function visitorHash(day: string, ip: string, userAgent: string): Promise<string> {
  const value = await daySalt(day);
  return createHash("sha256").update(value).update(ip).update("\0").update(userAgent).digest("hex").slice(0, 32);
}

export interface Agent { browser: string; os: string; device: "mobile" | "tablet" | "desktop" }

/** Coarse browser, system and device class. touch: the page reported a touch screen (iPads claim to be Macs). */
export function describeAgent(ua: string, touch = false): Agent {
  const browser = /Edg(?:e|A|iOS)?\//.test(ua) ? "Edge"
    : /OPR\/|Opera/.test(ua) ? "Opera"
    : /SamsungBrowser\//.test(ua) ? "Samsung"
    : /MicroMessenger\//.test(ua) ? "WeChat"
    : /FxiOS\/|Firefox\//.test(ua) ? "Firefox"
    : /CriOS\/|Chrome\//.test(ua) ? "Chrome"
    : /Safari\//.test(ua) ? "Safari"
    : "Other";
  const ipad = /iPad/.test(ua) || (/Macintosh/.test(ua) && touch);
  const os = /iPhone|iPod/.test(ua) || ipad ? "iOS"
    : /Android/.test(ua) ? "Android"
    : /CrOS/.test(ua) ? "ChromeOS"
    : /Mac OS X|Macintosh/.test(ua) ? "macOS"
    : /Windows/.test(ua) ? "Windows"
    : /Linux/.test(ua) ? "Linux"
    : "Other";
  const device = ipad || /Tablet/.test(ua) || (/Android/.test(ua) && !/Mobile/.test(ua)) ? "tablet"
    : /Mobile|iPhone|iPod|Android/.test(ua) ? "mobile"
    : "desktop";
  return { browser, os, device };
}

export const CHANNELS = ["direct", "search", "ai", "social", "email", "referral", "share", "paid"] as const;
export type Channel = (typeof CHANNELS)[number];

// Hosts by kind. A host matches itself and its subdomains; google.<any TLD> is search unless listed under AI.
const AI_HOSTS = ["chatgpt.com", "chat.openai.com", "openai.com", "perplexity.ai", "claude.ai", "gemini.google.com", "bard.google.com",
  "copilot.microsoft.com", "poe.com", "you.com", "phind.com", "kimi.com", "kimi.moonshot.cn", "deepseek.com", "doubao.com",
  "yuanbao.tencent.com", "grok.com", "meta.ai", "chat.mistral.ai", "metaso.cn", "tongyi.aliyun.com", "qianwen.com"];
const SEARCH_HOSTS = ["bing.com", "duckduckgo.com", "baidu.com", "yandex.ru", "yandex.com", "search.yahoo.com", "sogou.com", "so.com",
  "naver.com", "ecosia.org", "search.brave.com", "startpage.com", "qwant.com", "kagi.com", "sm.cn", "seznam.cz"];
const SOCIAL_HOSTS = ["t.co", "x.com", "twitter.com", "reddit.com", "news.ycombinator.com", "linkedin.com", "lnkd.in", "facebook.com",
  "instagram.com", "threads.net", "threads.com", "bsky.app", "mastodon.social", "weibo.com", "weibo.cn", "t.cn", "zhihu.com",
  "xiaohongshu.com", "douban.com", "bilibili.com", "youtube.com", "t.me", "discord.com", "v2ex.com", "okjike.com", "lobste.rs",
  "telegram.org", "tiktok.com", "douyin.com"];
const EMAIL_HOSTS = ["mail.google.com", "outlook.live.com", "outlook.office.com", "outlook.office365.com", "mail.qq.com", "exmail.qq.com",
  "mail.163.com", "mail.126.com", "mail.yahoo.com", "mail.proton.me", "app.fastmail.com", "mail.aol.com"];
// Bare names that utm_source often carries instead of a host ("twitter", "chatgpt").
const SOURCE_NAMES: Record<string, Channel> = {
  google: "search", bing: "search", baidu: "search", duckduckgo: "search",
  chatgpt: "ai", openai: "ai", perplexity: "ai", claude: "ai", gemini: "ai", copilot: "ai", deepseek: "ai", kimi: "ai", doubao: "ai",
  twitter: "social", x: "social", reddit: "social", hackernews: "social", hn: "social", linkedin: "social", facebook: "social",
  weibo: "social", zhihu: "social", xiaohongshu: "social", telegram: "social", youtube: "social", bilibili: "social", jike: "social",
  newsletter: "email", email: "email",
};
const PAID_MEDIUMS = new Set(["cpc", "ppc", "paid", "paidsearch", "paid_search", "paidsocial", "paid_social", "display", "ads", "cpm"]);
const EMAIL_MEDIUMS = new Set(["email", "e-mail", "newsletter", "mail"]);

const within = (host: string, list: string[]) => list.some((d) => host === d || host.endsWith(`.${d}`));

function hostChannel(host: string): Channel | null {
  if (!host) return null;
  if (within(host, AI_HOSTS)) return "ai";
  if (within(host, EMAIL_HOSTS)) return "email";
  if (/(^|\.)google(\.[a-z]{2,3}){1,2}$/.test(host) || within(host, SEARCH_HOSTS)) return "search";
  if (within(host, SOCIAL_HOSTS)) return "social";
  return null;
}

/** Where a session came from: its campaign tags first, then the referring site, then a shared link's marker. */
export function classifyChannel(input: { referrer: string; utmSource: string; utmMedium: string; via: string | null }): Channel {
  const medium = input.utmMedium.toLowerCase();
  if (input.via === "newsletter" || EMAIL_MEDIUMS.has(medium)) return "email";
  if (PAID_MEDIUMS.has(medium)) return "paid";
  const fromReferrer = hostChannel(input.referrer);
  if (fromReferrer) return fromReferrer;
  if (input.referrer) return "referral";
  const source = input.utmSource.toLowerCase();
  const sourceHost = normalizeSourceDomain(source);
  const fromSource = (sourceHost && hostChannel(sourceHost)) || SOURCE_NAMES[source];
  if (fromSource) return fromSource;
  if (input.via === "share") return "share";
  return source ? "referral" : "direct";
}

const TAG = /^[\p{L}\p{N} ._+:/-]{1,80}$/u;
/** A campaign tag as written, if it is short plain text; anything that could hold an address or token is dropped. */
export function cleanTag(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const value = raw.trim();
  return TAG.test(value) && !/\d{6,}/.test(value) ? value : "";
}

/** A browser-kept date, if it is a real date no later than today and not before the site's analytics began. */
export function cleanDay(raw: unknown, today: string): string | null {
  if (typeof raw !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  if (Number.isNaN(Date.parse(`${raw}T00:00:00Z`)) || raw > today || raw < "2026-01-01") return null;
  return raw;
}

export interface ViewInput {
  ip: string;
  userAgent: string;
  /** The page's own path and the route it was counted under (normalizePagePath). */
  path: string;
  route: string;
  /** A full page load, which alone carries where the reader came from. */
  load: boolean;
  referrer: unknown;
  utm: { source?: unknown; medium?: unknown; campaign?: unknown } | null;
  via: string | null;
  touch: boolean;
  country: string;
  language: unknown;
  firstSeen: unknown;
  prevSeen: unknown;
  now?: Date;
}

interface Origin { channel: Channel; referrer: string; utm_source: string; utm_medium: string; utm_campaign: string }

/**
 * Adds a page view to the visitor's open session, or starts one. A full load that arrives from somewhere else
 * (another site or other campaign tags) than the open session's starts a new session, as a new visit would.
 */
export async function recordSessionView(input: ViewInput): Promise<void> {
  const now = input.now ?? new Date();
  const day = beijingDate(now);
  const visitor = await visitorHash(day, input.ip, input.userAgent);
  const referrerHost = input.load && typeof input.referrer === "string" ? normalizeSourceDomain(input.referrer) ?? "" : "";
  const utm = input.load ? input.utm : null;
  const origin: Origin = {
    referrer: referrerHost,
    utm_source: cleanTag(utm?.source),
    utm_medium: cleanTag(utm?.medium),
    utm_campaign: cleanTag(utm?.campaign),
    channel: "direct",
  };
  origin.channel = classifyChannel({ referrer: origin.referrer, utmSource: origin.utm_source, utmMedium: origin.utm_medium, via: input.load ? input.via : null });
  const external = Boolean(origin.referrer || origin.utm_source || origin.utm_medium || origin.utm_campaign);
  const agent = describeAgent(input.userAgent, input.touch);
  // The primary language subtag only ("zh" of "zh-CN").
  const tag = typeof input.language === "string" ? input.language.split("-")[0]! : "";
  const language = /^[a-z]{2,3}$/i.test(tag) ? tag.toLowerCase() : "";
  const first = cleanDay(input.firstSeen, day) ?? day;
  const prevRaw = cleanDay(input.prevSeen, addDays(day, -1));
  const prev = prevRaw && prevRaw >= first ? prevRaw : null;
  await sql.begin(async (tx) => {
    // Two beacons from one visitor at once would otherwise both start a session.
    await tx`SELECT pg_advisory_xact_lock(hashtext(${visitor}))`;
    const [open] = await tx<({ id: string } & Origin)[]>`
      SELECT id, channel, referrer, utm_source, utm_medium, utm_campaign FROM site_sessions
      WHERE day = ${day} AND visitor = ${visitor} AND last_at > ${new Date(now.getTime() - SESSION_GAP_MS)}
      ORDER BY last_at DESC LIMIT 1`;
    const sameOrigin = open && (!external || (open.referrer === origin.referrer && open.utm_source === origin.utm_source
      && open.utm_medium === origin.utm_medium && open.utm_campaign === origin.utm_campaign));
    let id: string;
    if (open && sameOrigin) {
      id = open.id;
      await tx`UPDATE site_sessions SET views = views + 1, last_at = ${now}, exit = ${input.route} WHERE id = ${id}`;
    } else {
      const [row] = await tx<{ id: string }[]>`
        INSERT INTO site_sessions (day, visitor, started_at, last_at, views, landing, landing_page, exit, channel, referrer,
          utm_source, utm_medium, utm_campaign, browser, os, device, country, language, first_seen, prev_seen)
        VALUES (${day}, ${visitor}, ${now}, ${now}, 1, ${input.route}, ${input.path}, ${input.route}, ${origin.channel}, ${origin.referrer},
          ${origin.utm_source}, ${origin.utm_medium}, ${origin.utm_campaign}, ${agent.browser}, ${agent.os}, ${agent.device},
          ${input.country}, ${language}, ${first}, ${prev})
        RETURNING id`;
      id = row!.id;
    }
    await tx`
      INSERT INTO site_hits (session_id, seq, at, kind, route, path)
      SELECT ${id}, coalesce(max(seq), 0) + 1, ${now}, 'view', ${input.route}, ${input.path} FROM site_hits WHERE session_id = ${id}`;
  });
}

/** Adds a page's visible time to its latest view in the visitor's current session. */
export async function recordSessionEngagement(input: { ip: string; userAgent: string; path: string; ms: number; now?: Date }): Promise<void> {
  const ms = Math.min(MAX_ENGAGED_MS, Math.max(0, Math.round(input.ms)));
  if (!ms) return;
  const now = input.now ?? new Date();
  const day = beijingDate(now);
  const visitor = await visitorHash(day, input.ip, input.userAgent);
  await sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(hashtext(${visitor}))`;
    // The page may have stayed open past the session gap; the view it belongs to is still the latest one.
    const [hit] = await tx<{ session_id: string; seq: number }[]>`
      SELECT h.session_id, h.seq FROM site_hits h JOIN site_sessions s ON s.id = h.session_id
      WHERE s.day = ${day} AND s.visitor = ${visitor} AND h.kind = 'view' AND h.path = ${input.path}
        AND h.at > ${new Date(now.getTime() - MAX_ENGAGED_MS - SESSION_GAP_MS)}
      ORDER BY h.at DESC LIMIT 1`;
    if (!hit) return;
    await tx`UPDATE site_hits SET engaged_ms = least(engaged_ms + ${ms}, ${MAX_ENGAGED_MS}) WHERE session_id = ${hit.session_id} AND seq = ${hit.seq}`;
    await tx`UPDATE site_sessions SET engaged_ms = engaged_ms + ${ms}, last_at = greatest(last_at, ${now}) WHERE id = ${hit.session_id}`;
  });
}

/** Adds an interaction to the visitor's open session. Without one (no page view counted) it is only counted daily. */
export async function recordSessionEvent(input: { ip: string; userAgent: string; event: string; target: string; now?: Date }): Promise<void> {
  const now = input.now ?? new Date();
  const day = beijingDate(now);
  const visitor = await visitorHash(day, input.ip, input.userAgent);
  await sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(hashtext(${visitor}))`;
    const [open] = await tx<{ id: string; exit: string }[]>`
      SELECT id, exit FROM site_sessions
      WHERE day = ${day} AND visitor = ${visitor} AND last_at > ${new Date(now.getTime() - SESSION_GAP_MS)}
      ORDER BY last_at DESC LIMIT 1`;
    if (!open) return;
    await tx`
      INSERT INTO site_hits (session_id, seq, at, kind, route, target)
      SELECT ${open.id}, coalesce(max(seq), 0) + 1, ${now}, ${input.event}, ${open.exit}, ${input.target} FROM site_hits WHERE session_id = ${open.id}`;
    await tx`UPDATE site_sessions SET last_at = ${now} WHERE id = ${open.id}`;
  });
}

export const FILTER_REASONS = ["agent", "reloads", "automation", "owner"] as const;
export type FilterReason = (typeof FILTER_REASONS)[number];

/** Counts a page view left out as automated or the site owner's, by reason, in the daily counters. */
export async function recordFilteredView(reason: FilterReason): Promise<void> {
  await sql`
    INSERT INTO site_events_daily (day, event, target, count)
    VALUES ((now() AT TIME ZONE 'Asia/Taipei')::date, 'view_filtered', ${reason}, 1)
    ON CONFLICT (day, event, target) DO UPDATE SET count = site_events_daily.count + 1, updated_at = now()`;
}
