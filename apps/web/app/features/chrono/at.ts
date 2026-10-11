import { publicPath } from "../../lib/locale.ts";
// The time machine's place in the URL: `?at=YYYY-MM-DD` (a Beijing day) puts the whole site on that
// day. It lives in the address, never in a cookie, so a slice is server-rendered, shareable and
// cached as its own page (tests/cache.test.ts keeps public pages cookie-free).
import { FEATURES } from "@aihot/industry/features";
import { MODULES } from "@aihot/site/modules";
import { useLocation } from "react-router";
import { addDays, beijingDate, isValidDate } from "@aihot/contracts/time";
import { yearToDate, type TimeMachineBounds } from "@aihot/contracts/chronicle";
import { timeParam } from "./format.ts";

/** `at` from a query string: null for the live site (absent, invalid, today or later, feature off). */
export function parseAt(search: string | URLSearchParams, today = beijingDate(Date.now())): string | null {
  if (!FEATURES.timeMachine) return null;
  const raw = (typeof search === "string" ? new URLSearchParams(search) : search).get("at");
  if (!raw || !isValidDate(raw) || raw >= today) return null;
  return raw;
}

/** `at` of a loader's request. */
export function requestAt(request: Request): string | null {
  return parseAt(new URL(request.url).searchParams);
}

export function useAt(): string | null {
  return parseAt(useLocation().search);
}

/** Pages whose content follows the time machine; the rest show the present beneath its bar. */
export function followsTime(pathname: string): boolean {
  pathname = publicPath(pathname);
  return MODULES.some((m) => m.timePaths?.some((pattern) => pattern.test(pathname))) || pathname === "/" || pathname === "/hot" || /^\/(daily|weekly|monthly)(\/|$)/.test(pathname);
}

/** `to` with `at` set (or removed when null), keeping its other parameters and hash. */
export function withAt(to: string, at: string | null): string {
  const hashAt = to.indexOf("#");
  const hash = hashAt >= 0 ? to.slice(hashAt) : "";
  const rest = hashAt >= 0 ? to.slice(0, hashAt) : to;
  const [path, query = ""] = rest.split("?") as [string, string?];
  const sp = new URLSearchParams(query);
  if (at) sp.set("at", at);
  else sp.delete("at");
  const qs = sp.toString();
  return `${path}${qs ? `?${qs}` : ""}${hash}`;
}

/** A front-page needle lands on recorded days; deep history and forecasts stay on the front page's readouts. */
export function frontPageTarget(t: number, now: number, bounds?: Pick<TimeMachineBounds, "today" | "earliest"> | null): string {
  if (t === now) return withAt("/", null);
  const date = yearToDate(t);
  if (bounds && date) {
    if (date === bounds.today) return withAt("/", null);
    if (bounds.earliest && date >= bounds.earliest && date < bounds.today) return withAt("/", date);
  }
  return `/?t=${timeParam(t, now)}`;
}

/** The day `days` away from `at` (or from today), or null once that reaches today: back to the present. */
export function stepAt(at: string | null, days: number, today = beijingDate(Date.now())): string | null {
  const next = addDays(at ?? today, days);
  return next >= today ? null : next;
}

/** "2026年9月1日 周二". */
export function atLabel(at: string): string {
  const [y, m, d] = at.split("-").map(Number) as [number, number, number];
  const weekday = "日一二三四五六"[new Date(`${at}T00:00:00Z`).getUTCDay()];
  return `${y}年${m}月${d}日 周${weekday}`;
}
