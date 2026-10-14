// An X post pushed through /api/ingest/items, stored as the same candidate the SocialData collector
// writes (identity x:<tweetId>, the xPost block, engagement counts). The account is the enabled
// x_search source whose query reads that handle, so tier and participation stay with the account.
import { sql } from "../db.ts";
import type { MediaItem } from "../content/materials.ts";
import {
  candidateFromXPost, linksXArticle, withPushedArticle, xPostFromFields, xPushOnly, type XCounts,
} from "../sources/x.ts";
import type { Candidate } from "../sources/types.ts";

const HANDLE = /^[A-Za-z0-9_]{1,15}$/;
const TWEET_ID = /^\d{1,20}$/;
const LANG = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/;
const STATUS_URL = /^https:\/\/(?:www\.)?(?:x|twitter)\.com\/[A-Za-z0-9_]{1,15}\/status\/(\d{1,20})\/?(?:[?#].*)?$/i;
const TEXT_MAX = 50_000;
const ARTICLE_MAX = 200_000;
const MEDIA_MAX = 10;

export interface ParsedXPost {
  /** Handle as sent, without a leading @. Lookup is case-insensitive. */
  handle: string;
  candidate: Candidate;
}

export function xHandle(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const handle = value.trim().replace(/^@/, "");
  return HANDLE.test(handle) ? handle : null;
}

function httpsUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const url = value.trim();
  if (!url || url.length > 2000) return null;
  try {
    return new URL(url).protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

function count(value: unknown): number | null | "bad" {
  if (value === undefined || value === null) return null;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 1_000_000_000_000) return "bad";
  return value;
}

function dimension(value: unknown): number | null | "bad" {
  if (value === undefined || value === null) return null;
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0 || value > 20_000) return "bad";
  return value;
}

function mediaList(value: unknown): MediaItem[] | null {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > MEDIA_MAX) return null;
  const out: MediaItem[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") return null;
    const m = entry as Record<string, unknown>;
    const kind = m.kind === "image" || m.kind === "video" ? m.kind
      : m.type === "photo" ? "image"
      : m.type === "video" || m.type === "animated_gif" ? "video"
      : null;
    const url = httpsUrl(m.url);
    const width = dimension(m.width);
    const height = dimension(m.height);
    if (!kind || !url || width === "bad" || height === "bad") return null;
    let poster: string | null;
    if (m.poster === undefined || m.poster === null) poster = kind === "video" ? url : null;
    else {
      const parsed = httpsUrl(m.poster);
      if (!parsed) return null;
      poster = parsed;
    }
    const item: MediaItem = { kind, url, width, height, poster };
    if (m.alt !== undefined && m.alt !== null) {
      if (typeof m.alt !== "string" || m.alt.length > 500) return null;
      item.alt = m.alt;
    }
    out.push(item);
  }
  return out;
}

function quotedPost(value: unknown): { authorName: string; handle: string; text: string; url: string; media: MediaItem[] } | null | undefined {
  if (value === undefined || value === null) return null;
  if (typeof value !== "object" || Array.isArray(value)) return undefined;
  const q = value as Record<string, unknown>;
  const handle = xHandle(q.handle);
  const authorName = typeof q.authorName === "string" ? q.authorName.trim() : "";
  const text = typeof q.text === "string" ? q.text.trim() : null;
  const tweetId = q.tweetId === undefined || q.tweetId === null ? "" : typeof q.tweetId === "string" ? q.tweetId.trim() : "bad";
  const url = q.url === undefined || q.url === null ? null : httpsUrl(q.url);
  const media = mediaList(q.media);
  if (!handle || !authorName || authorName.length > 200 || text === null || text.length > TEXT_MAX || !media || tweetId === "bad") return undefined;
  if (tweetId && !TWEET_ID.test(tweetId)) return undefined;
  if ((q.url != null && !url) || (url && tweetId && STATUS_URL.exec(url)?.[1] !== tweetId)) return undefined;
  const canonical = tweetId ? `https://x.com/${handle}/status/${tweetId}` : null;
  if (!url && !canonical) return undefined;
  return { authorName, handle, text, url: canonical ?? url!, media };
}

function countsOf(value: unknown): XCounts | null {
  if (value === undefined || value === null) return { favorite: null, retweet: null, reply: null, views: null };
  if (typeof value !== "object") return null;
  const c = value as Record<string, unknown>;
  const like = count(c.like !== undefined ? c.like : c.favorite);
  const retweet = count(c.retweet);
  const reply = count(c.reply);
  const views = count(c.views);
  if (like === "bad" || retweet === "bad" || reply === "bad" || views === "bad") return null;
  return { favorite: like, retweet, reply, views };
}

function timeOf(value: unknown): Date | null | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

/** A well-formed X post, or null when the payload cannot be stored without dropping fields. */
export function parseXItem(item: { url?: unknown; publishedAt?: unknown; x?: unknown }): ParsedXPost | null {
  if (!item.x || typeof item.x !== "object" || Array.isArray(item.x)) return null;
  const x = item.x as Record<string, unknown>;
  const tweetId = typeof x.tweetId === "string" ? x.tweetId.trim() : "";
  const handle = xHandle(x.handle);
  const authorName = typeof x.authorName === "string" ? x.authorName.trim() : "";
  const text = typeof x.text === "string" ? x.text.trim() : null;
  if (!TWEET_ID.test(tweetId) || !handle || !authorName || authorName.length > 200 || text === null || text.length > TEXT_MAX) return null;
  if (typeof item.url === "string" && item.url.trim() && STATUS_URL.exec(item.url.trim())?.[1] !== tweetId) return null;

  const lang = x.lang === undefined || x.lang === null ? null : typeof x.lang === "string" && LANG.test(x.lang) ? x.lang : "bad";
  const replyTo = x.replyTo === undefined || x.replyTo === null ? null : typeof x.replyTo === "string" && TWEET_ID.test(x.replyTo) ? x.replyTo : "bad";
  const avatar = x.avatarUrl === undefined || x.avatarUrl === null ? null : httpsUrl(x.avatarUrl);
  if (lang === "bad" || replyTo === "bad" || (x.avatarUrl != null && !avatar)) return null;
  const media = mediaList(x.media);
  const counts = countsOf(x.counts);
  const quoted = quotedPost(x.quoted);
  if (!media || !counts || quoted === undefined) return null;

  const created = timeOf(x.createdAt ?? x.created_at);
  const published = created === undefined ? timeOf(item.publishedAt) : created;
  if (published === null) return null;

  let candidate = candidateFromXPost(xPostFromFields({
    tweetId, handle, authorName, avatarUrl: avatar, text, lang, replyTo, media, quoted,
  }), published ?? null, counts, { reply: true });

  if (x.article != null) {
    if (typeof x.article !== "object" || Array.isArray(x.article)) return null;
    const article = x.article as Record<string, unknown>;
    const articleText = typeof article.text === "string" ? article.text.trim() : "";
    const articleTitle = article.title === undefined || article.title === null ? "" : typeof article.title === "string" ? article.title.trim() : null;
    if (!articleText || articleText.length > ARTICLE_MAX || articleTitle === null || articleTitle.length > 500) return null;
    candidate = withPushedArticle(candidate, { title: articleTitle, text: articleText });
  } else if (candidate.bodyStatus === "pending" && linksXArticle(text) && xPushOnly()) {
    // The paid article lookup is off with the search. Leave the post unconfirmed instead of calling SocialData.
    candidate = { ...candidate, bodyStatus: "unconfirmed" };
  }
  return { handle, candidate };
}

export interface XSourceMatch {
  id: string;
  participation_mode: string;
}

/** Enabled x_search sources keyed by lower-case handle. Editorial wins over a signal that reads the same account. */
export async function xSourcesByHandle(handles: string[]): Promise<Map<string, XSourceMatch>> {
  const wanted = [...new Set(handles.map((h) => xHandle(h)?.toLowerCase()).filter((h): h is string => !!h))];
  if (!wanted.length) return new Map();
  const rows = await sql<{ id: string; handle: string | null; participation_mode: string }[]>`
    SELECT id, substring(lower(config->>'query') from 'from:([a-z0-9_]{1,15})') AS handle, participation_mode
    FROM sources
    WHERE enabled AND kind = 'x_search'
      AND substring(lower(config->>'query') from 'from:([a-z0-9_]{1,15})') = ANY(${wanted})`;
  const rank = (mode: string) => mode === "editorial" ? 0 : mode === "hot_signal" ? 1 : 2;
  const best = new Map<string, XSourceMatch & { rank: number }>();
  for (const row of rows) {
    if (!row.handle) continue;
    const next = { id: row.id, participation_mode: row.participation_mode, rank: rank(row.participation_mode) };
    const prev = best.get(row.handle);
    if (!prev || next.rank < prev.rank || (next.rank === prev.rank && row.id < prev.id)) best.set(row.handle, next);
  }
  return new Map([...best].map(([handle, source]) => [handle, { id: source.id, participation_mode: source.participation_mode }]));
}
