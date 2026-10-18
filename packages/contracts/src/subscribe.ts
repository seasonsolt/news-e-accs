// Anonymous newsletter funnel. Counts are keyed by an allowlisted source, locale and, for failures,
// a reason. The target never carries an address.

export const SUBSCRIBE_SOURCES = [
  "home_overlay", "home_button", "subscribe_page", "daily_inline", "item_inline", "chronicle_inline", "sticky_mobile", "story_inline", "concept",
] as const;
export type SubscribeSource = (typeof SUBSCRIBE_SOURCES)[number];

export function subscribeSource(value: unknown): SubscribeSource | null {
  return typeof value === "string" && (SUBSCRIBE_SOURCES as readonly string[]).includes(value) ? value as SubscribeSource : null;
}

export interface SubscribeConfirmation {
  ok: true;
  first: boolean;
  language: SubscribeLocale;
  source: SubscribeSource | null;
}

export const SUBSCRIBE_FUNNEL_EVENTS = [
  "subscribe_view", "subscribe_submit", "subscribe_success", "subscribe_error", "subscribe_confirmed", "subscribe_dismiss",
] as const;
export type SubscribeFunnelEvent = (typeof SUBSCRIBE_FUNNEL_EVENTS)[number];

/** Failure classes only. `cap` is the daily confirmation-letter ceiling; `503` is a mail or service failure. */
export const SUBSCRIBE_ERROR_REASONS = ["cap", "503", "rate", "invalid", "forbidden", "network"] as const;
export type SubscribeErrorReason = (typeof SUBSCRIBE_ERROR_REASONS)[number];

export const SUBSCRIBE_LOCALES = ["zh", "en"] as const;
export type SubscribeLocale = (typeof SUBSCRIBE_LOCALES)[number];

const SOURCE = new Set<string>(SUBSCRIBE_SOURCES);
const REASON = new Set<string>(SUBSCRIBE_ERROR_REASONS);
const LOCALE = new Set<string>(SUBSCRIBE_LOCALES);

export interface SubscribeTarget {
  source: SubscribeSource;
  locale: SubscribeLocale;
  reason: SubscribeErrorReason | "";
}

/** `source:locale`, or `source:locale:reason` for subscribe_error. Anything else is rejected. */
export function subscribeEventTarget(event: SubscribeFunnelEvent, part: SubscribeTarget): string | null {
  if (!SOURCE.has(part.source) || !LOCALE.has(part.locale)) return null;
  if (event === "subscribe_error") return REASON.has(part.reason) ? `${part.source}:${part.locale}:${part.reason}` : null;
  return part.reason === "" ? `${part.source}:${part.locale}` : null;
}

export function parseSubscribeTarget(event: string, target: string): SubscribeTarget | null {
  if (!(SUBSCRIBE_FUNNEL_EVENTS as readonly string[]).includes(event)) return null;
  const parts = target.split(":");
  if (parts.length < 2 || parts.length > 3) return null;
  const [source, locale, reason] = parts;
  if (!source || !SOURCE.has(source) || !locale || !LOCALE.has(locale)) return null;
  const name = event as SubscribeFunnelEvent;
  if (name === "subscribe_error") {
    if (parts.length !== 3 || !reason || !REASON.has(reason)) return null;
    return { source: source as SubscribeSource, locale: locale as SubscribeLocale, reason: reason as SubscribeErrorReason };
  }
  if (parts.length !== 2) return null;
  return { source: source as SubscribeSource, locale: locale as SubscribeLocale, reason: "" };
}

/**
 * Maps a subscribe or confirm failure to a reason the funnel may store.
 * A 429 that asks the reader to wait an hour is the daily letter cap; a shorter 429 is the per-minute limit.
 */
export function subscribeErrorReason(status: number, problem?: { retryAfter?: unknown } | null): SubscribeErrorReason {
  const retry = typeof problem?.retryAfter === "number" ? problem.retryAfter : Number(problem?.retryAfter);
  if (status === 429 && Number.isFinite(retry) && retry >= 3600) return "cap";
  if (status === 429) return "rate";
  if (status === 400 || status === 404) return "invalid";
  if (status === 403) return "forbidden";
  if (status === 0) return "network";
  return "503";
}
