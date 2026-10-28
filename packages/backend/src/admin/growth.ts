// The admin's growth dashboard (docs/analytics.md): readers, sessions and where they came from, read from the
// sessions the collector keeps (site/sessions.ts). Every number here is about counted readers only; the views
// left out as automated are reported beside them, by reason.
import { addDays, beijingDate } from "@aihot/contracts/time";
import { sql } from "../db.ts";
import { SITE_EVENTS } from "../site/analytics.ts";
import { CHANNELS, FILTER_REASONS } from "../site/sessions.ts";

/** Session columns a breakdown or filter may name. */
const COLUMNS = {
  channel: "channel", referrer: "referrer", utm_source: "utm_source", utm_medium: "utm_medium", utm_campaign: "utm_campaign",
  landing: "landing", landing_page: "landing_page", exit: "exit", browser: "browser", os: "os", device: "device",
  country: "country", language: "language",
} as const;
export type Dimension = keyof typeof COLUMNS | "visitor_type" | "page";
export const DIMENSIONS = [...Object.keys(COLUMNS), "visitor_type", "page"] as Dimension[];
export type Filters = Partial<Record<Dimension, string>>;

const RANGES = { today: 1, yesterday: 1, "7d": 7, "28d": 28, "90d": 90 } as const;
const MAX_DAYS = 366;

export interface Range { range: string; from: string; to: string; days: number; previous: { from: string; to: string } }

/** The dates a request asks for: a named range ending today (yesterday ends yesterday) or from–to, at most a year. */
export function growthRange(q: Record<string, string | undefined>, today = beijingDate(new Date())): Range {
  let range = q.range ?? "7d";
  let from: string;
  let to: string;
  const valid = (d: string | undefined): d is string => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`));
  if (range === "custom" && valid(q.from) && valid(q.to) && q.from <= q.to && q.to <= today && addDays(q.from, MAX_DAYS - 1) >= q.to) {
    from = q.from;
    to = q.to;
  } else {
    if (!(range in RANGES)) range = "7d";
    to = range === "yesterday" ? addDays(today, -1) : today;
    from = addDays(to, -(RANGES[range as keyof typeof RANGES] - 1));
  }
  const days = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
  return { range, from, to, days, previous: { from: addDays(from, -days), to: addDays(from, -1) } };
}

/** The filters a request names, each one value; unknown dimensions are ignored. */
export function growthFilters(q: Record<string, string | undefined>): Filters {
  const filters: Filters = {};
  for (const d of DIMENSIONS) {
    const value = q[d];
    if (typeof value === "string" && value.length <= 300) filters[d] = value;
  }
  return filters;
}

/** The sessions in a date span that match the filters, as a condition on site_sessions s. */
function scope(from: string, to: string, filters: Filters) {
  let where = sql`s.day BETWEEN ${from}::date AND ${to}::date`;
  for (const [d, value] of Object.entries(filters) as Array<[Dimension, string]>) {
    if (d === "visitor_type") where = sql`${where} AND ${value === "new" ? sql`s.first_seen = s.day` : sql`s.first_seen < s.day`}`;
    else if (d === "page") where = sql`${where} AND EXISTS (SELECT 1 FROM site_hits p WHERE p.session_id = s.id AND p.kind = 'view' AND p.route = ${value})`;
    else where = sql`${where} AND s.${sql(COLUMNS[d])} = ${value}`;
  }
  return where;
}

const converted = (goal: string) => sql`EXISTS (SELECT 1 FROM site_hits g WHERE g.session_id = s.id AND g.kind = ${goal})`;
/** A session that read two pages, stayed ten seconds or reached the goal. */
const engaged = (goal: string) => sql`(s.views >= 2 OR s.engaged_ms >= 10000 OR ${converted(goal)})`;
/**
 * Unique readers over a span: a browser counts on its first day in the span, which is a day whose previous visit
 * (the browser's own record) falls before the span. A browser without storage counts once a day.
 */
const firstInSpan = (from: string) => sql`(s.prev_seen IS NULL OR s.prev_seen < ${from}::date)`;

export interface Totals {
  visitors: number;
  newVisitors: number;
  sessions: number;
  views: number;
  bounces: number;
  engagedSessions: number;
  engagedMs: number;
  durationMs: number;
  conversions: number;
}

async function totals(from: string, to: string, filters: Filters, goal: string): Promise<Totals> {
  const [row] = await sql<Totals[]>`
    WITH s AS (
      SELECT s.*, ${converted(goal)} AS converted, ${engaged(goal)} AS engaged,
        row_number() OVER (PARTITION BY s.day, s.visitor ORDER BY s.started_at) = 1 AS first_of_day
      FROM site_sessions s WHERE ${scope(from, to, filters)}
    )
    SELECT
      count(*) FILTER (WHERE s.first_of_day AND ${firstInSpan(from)})::int AS visitors,
      count(*) FILTER (WHERE s.first_of_day AND s.first_seen = s.day)::int AS "newVisitors",
      count(*)::int AS sessions,
      coalesce(sum(s.views), 0)::int AS views,
      count(*) FILTER (WHERE s.views = 1)::int AS bounces,
      count(*) FILTER (WHERE s.engaged)::int AS "engagedSessions",
      coalesce(sum(s.engaged_ms), 0)::float8 AS "engagedMs",
      coalesce(sum(extract(epoch FROM s.last_at - s.started_at) * 1000), 0)::float8 AS "durationMs",
      count(*) FILTER (WHERE s.converted)::int AS conversions
    FROM s`;
  return row!;
}

export interface SeriesPoint { bucket: string; visitors: number; sessions: number; views: number; bounces: number }

/** By day, or by hour for a single day. Visitors are counted per bucket. */
async function series(range: { from: string; to: string }, filters: Filters, hourly: boolean): Promise<SeriesPoint[]> {
  const bucket = hourly ? sql`to_char(s.started_at AT TIME ZONE 'Asia/Taipei', 'HH24')` : sql`to_char(s.day, 'YYYY-MM-DD')`;
  const rows = await sql<SeriesPoint[]>`
    SELECT ${bucket} AS bucket, count(DISTINCT s.visitor)::int AS visitors, count(*)::int AS sessions,
      coalesce(sum(s.views), 0)::int AS views, count(*) FILTER (WHERE s.views = 1)::int AS bounces
    FROM site_sessions s WHERE ${scope(range.from, range.to, filters)} GROUP BY 1`;
  const buckets = hourly
    ? Array.from({ length: 24 }, (_, h) => String(h).padStart(2, "0"))
    : Array.from({ length: Math.round((Date.parse(`${range.to}T00:00:00Z`) - Date.parse(`${range.from}T00:00:00Z`)) / 86_400_000) + 1 }, (_, i) => addDays(range.from, i));
  return buckets.map((b) => rows.find((r) => r.bucket === b) ?? { bucket: b, visitors: 0, sessions: 0, views: 0, bounces: 0 });
}

export interface BreakdownRow { key: string; visitors: number; sessions: number; views: number; bounces: number; engagedMs: number; conversions: number }

async function breakdown(d: Exclude<Dimension, "page">, from: string, to: string, filters: Filters, goal: string, limit: number): Promise<BreakdownRow[]> {
  const key = d === "visitor_type" ? sql`CASE WHEN s.first_seen = s.day THEN 'new' ELSE 'returning' END` : sql`s.${sql(COLUMNS[d])}`;
  return sql<BreakdownRow[]>`
    WITH s AS (
      SELECT s.*, row_number() OVER (PARTITION BY s.day, s.visitor ORDER BY s.started_at) = 1 AS first_of_day, ${converted(goal)} AS converted
      FROM site_sessions s WHERE ${scope(from, to, filters)}
    )
    SELECT ${key} AS key,
      count(*) FILTER (WHERE s.first_of_day AND ${firstInSpan(from)})::int AS visitors,
      count(*)::int AS sessions, coalesce(sum(s.views), 0)::int AS views,
      count(*) FILTER (WHERE s.views = 1)::int AS bounces,
      coalesce(avg(s.engaged_ms), 0)::float8 AS "engagedMs",
      count(*) FILTER (WHERE s.converted)::int AS conversions
    FROM s GROUP BY 1 ORDER BY sessions DESC, views DESC, 1 LIMIT ${limit}`;
}

export interface PageRow { key: string; views: number; sessions: number; entries: number; exits: number; engagedMs: number }

/** Pages by route, or by their own path (a single story or item). */
async function pages(by: "route" | "path", from: string, to: string, filters: Filters, limit: number): Promise<PageRow[]> {
  return sql<PageRow[]>`
    WITH v AS (
      SELECT h.*, row_number() OVER (PARTITION BY h.session_id ORDER BY h.seq) AS n, count(*) OVER (PARTITION BY h.session_id) AS total
      FROM site_hits h JOIN site_sessions s ON s.id = h.session_id
      WHERE ${scope(from, to, filters)} AND h.kind = 'view'
    )
    SELECT v.${sql(by)} AS key, count(*)::int AS views, count(DISTINCT v.session_id)::int AS sessions,
      count(*) FILTER (WHERE v.n = 1)::int AS entries, count(*) FILTER (WHERE v.n = v.total)::int AS exits,
      coalesce(avg(v.engaged_ms) FILTER (WHERE v.engaged_ms > 0), 0)::float8 AS "engagedMs"
    FROM v GROUP BY 1 ORDER BY views DESC, 1 LIMIT ${limit}`;
}

async function events(from: string, to: string, filters: Filters) {
  return sql<{ key: string; count: number; sessions: number }[]>`
    SELECT h.kind AS key, count(*)::int AS count, count(DISTINCT h.session_id)::int AS sessions
    FROM site_hits h JOIN site_sessions s ON s.id = h.session_id
    WHERE ${scope(from, to, filters)} AND h.kind <> 'view'
    GROUP BY 1 ORDER BY count DESC, 1`;
}

/** Views left out of the counts, by reason, from the daily counters (filters do not apply). */
async function filtered(from: string, to: string) {
  const rows = await sql<{ reason: string; count: number }[]>`
    SELECT target AS reason, sum(count)::int AS count FROM site_events_daily
    WHERE event = 'view_filtered' AND day BETWEEN ${from}::date AND ${to}::date GROUP BY 1`;
  return FILTER_REASONS.map((reason) => ({ reason, count: rows.find((r) => r.reason === reason)?.count ?? 0 }));
}

/** Readers active in the last five minutes and views by minute over the last thirty. */
async function live() {
  const [now] = await sql<{ visitors: number; sessions: number }[]>`
    SELECT count(DISTINCT visitor)::int AS visitors, count(*)::int AS sessions FROM site_sessions WHERE last_at > now() - interval '5 minutes'`;
  const pagesNow = await sql<{ key: string; sessions: number }[]>`
    SELECT exit AS key, count(*)::int AS sessions FROM site_sessions WHERE last_at > now() - interval '5 minutes' GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT 5`;
  const minutes = await sql<{ minute: number; views: number }[]>`
    SELECT floor(extract(epoch FROM now() - h.at) / 60)::int AS minute, count(*)::int AS views
    FROM site_hits h JOIN site_sessions s ON s.id = h.session_id
    WHERE s.last_at > now() - interval '30 minutes' AND h.at > now() - interval '30 minutes' AND h.kind = 'view' GROUP BY 1`;
  return { visitors: now!.visitors, sessions: now!.sessions, pages: pagesNow, views: Array.from({ length: 30 }, (_, i) => minutes.find((m) => m.minute === 29 - i)?.views ?? 0) };
}

/** When collection began, so the page can say which spans are complete. */
async function firstDay(): Promise<string | null> {
  const [row] = await sql<{ day: string | null }[]>`SELECT to_char(min(day), 'YYYY-MM-DD') AS day FROM site_sessions`;
  return row?.day ?? null;
}

const BREAKDOWNS: Array<Exclude<Dimension, "page">> = ["channel", "referrer", "utm_source", "utm_medium", "utm_campaign", "landing", "landing_page", "exit",
  "browser", "os", "device", "country", "language", "visitor_type"];

export const GOALS = SITE_EVENTS;
const goalOf = (raw: string | undefined) => (GOALS as readonly string[]).includes(raw ?? "") ? raw! : "subscribe_success";

export async function growthOverview(q: Record<string, string | undefined>, today?: string) {
  const range = growthRange(q, today);
  const filters = growthFilters(q);
  const goal = goalOf(q.goal);
  const hourly = range.days === 1;
  const [current, previous, now, then, byDimension, routes, paths, eventRows, bots, liveNow, since] = await Promise.all([
    totals(range.from, range.to, filters, goal),
    totals(range.previous.from, range.previous.to, filters, goal),
    series(range, filters, hourly),
    series(range.previous, filters, hourly),
    Promise.all(BREAKDOWNS.map(async (d) => [d, await breakdown(d, range.from, range.to, filters, goal, 50)] as const)),
    pages("route", range.from, range.to, filters, 50),
    pages("path", range.from, range.to, filters, 50),
    events(range.from, range.to, filters),
    filtered(range.from, range.to),
    live(),
    firstDay(),
  ]);
  return {
    range, filters, goal, goals: GOALS, channels: CHANNELS, since, hourly,
    totals: current, previous,
    series: now, previousSeries: then,
    breakdowns: { ...Object.fromEntries(byDimension), page: routes, page_path: paths } as Record<Exclude<Dimension, "page">, BreakdownRow[]> & { page: PageRow[]; page_path: PageRow[] },
    events: eventRows,
    filtered: bots,
    live: liveNow,
  };
}

export interface FunnelStep { kind: "view" | "event"; value: string }

/** Steps written as view:<route> (view:* for any page) or event:<name>, comma separated, two to eight of them. */
export function parseFunnel(raw: string | undefined): FunnelStep[] {
  const steps = (raw ?? "").split(",").map((part) => {
    const [kind, ...rest] = part.trim().split(":");
    const value = rest.join(":");
    if (kind === "view" && (value === "*" || value.startsWith("/"))) return { kind: "view" as const, value };
    if (kind === "event" && (SITE_EVENTS as readonly string[]).includes(value)) return { kind: "event" as const, value };
    return null;
  }).filter((s): s is FunnelStep => s !== null).slice(0, 8);
  return steps.length >= 2 ? steps : DEFAULT_FUNNEL;
}

export const DEFAULT_FUNNEL: FunnelStep[] = [
  { kind: "view", value: "*" }, { kind: "view", value: "*" },
  { kind: "event", value: "subscribe_view" }, { kind: "event", value: "subscribe_submit" }, { kind: "event", value: "subscribe_success" },
];

/** How many sessions reached each step, in order within the session. */
export function funnelCounts(sessions: Iterable<Array<{ kind: string; route: string }>>, steps: FunnelStep[]): number[] {
  const counts = steps.map(() => 0);
  for (const hits of sessions) {
    let reached = 0;
    for (const hit of hits) {
      if (reached === steps.length) break;
      const step = steps[reached]!;
      const match = step.kind === "view" ? hit.kind === "view" && (step.value === "*" || hit.route === step.value) : hit.kind === step.value;
      if (match) reached++;
    }
    for (let i = 0; i < reached; i++) counts[i]!++;
  }
  return counts;
}

export async function growthFunnel(q: Record<string, string | undefined>, today?: string) {
  const range = growthRange(q, today);
  const filters = growthFilters(q);
  const steps = parseFunnel(q.steps);
  const eventKinds = steps.filter((s) => s.kind === "event").map((s) => s.value);
  const rows = await sql<{ session_id: string; kind: string; route: string }[]>`
    SELECT h.session_id, h.kind, h.route FROM site_hits h JOIN site_sessions s ON s.id = h.session_id
    WHERE ${scope(range.from, range.to, filters)} AND (h.kind = 'view' OR h.kind = ANY(${eventKinds}::text[]))
    ORDER BY h.session_id, h.seq`;
  const bySession = new Map<string, Array<{ kind: string; route: string }>>();
  for (const r of rows) {
    let hits = bySession.get(r.session_id);
    if (!hits) bySession.set(r.session_id, hits = []);
    hits.push(r);
  }
  const counts = funnelCounts(bySession.values(), steps);
  const routes = await sql<{ route: string }[]>`
    SELECT DISTINCT h.route FROM site_hits h JOIN site_sessions s ON s.id = h.session_id
    WHERE s.day BETWEEN ${range.from}::date AND ${range.to}::date AND h.kind = 'view' ORDER BY 1`;
  return { range, filters, steps: steps.map((s, i) => ({ ...s, sessions: counts[i]! })), events: SITE_EVENTS, routes: routes.map((r) => r.route) };
}

/**
 * Weekly cohorts by the week of a browser's first visit (its own record), and how many of them read again in each
 * later week. A browser counts once a week: on the first day of that week it visited.
 */
export async function growthRetention(q: Record<string, string | undefined>, today = beijingDate(new Date())) {
  const weeks = Math.min(Math.max(Number(q.weeks) || 8, 4), 26);
  const monday = addDays(today, -((new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7));
  const start = addDays(monday, -7 * (weeks - 1));
  const filters = growthFilters(q);
  const rows = await sql<{ cohort: string; week: string; readers: number }[]>`
    WITH v AS (
      SELECT s.day, date_trunc('week', s.day)::date AS week, min(s.first_seen) AS first_seen, min(s.prev_seen) AS prev_seen
      FROM site_sessions s WHERE ${scope(start, today, filters)} GROUP BY s.day, s.visitor
    )
    SELECT to_char(date_trunc('week', first_seen)::date, 'YYYY-MM-DD') AS cohort, to_char(week, 'YYYY-MM-DD') AS week, count(*)::int AS readers
    FROM v WHERE first_seen >= ${start}::date AND (prev_seen IS NULL OR prev_seen < week)
    GROUP BY 1, 2`;
  const mondays = Array.from({ length: weeks }, (_, i) => addDays(start, 7 * i));
  const cohorts = mondays.map((cohort) => {
    const later = mondays.filter((w) => w >= cohort);
    return { cohort, weeks: later.map((week) => rows.find((r) => r.cohort === cohort && r.week === week)?.readers ?? 0) };
  });
  return { weeks, start, filters, since: await firstDay(), cohorts };
}

/** The most common sequences of the first pages read in a session (routes, up to four). */
export async function growthJourneys(q: Record<string, string | undefined>, today?: string) {
  const range = growthRange(q, today);
  const filters = growthFilters(q);
  const depth = Math.min(Math.max(Number(q.depth) || 4, 2), 6);
  const rows = await sql<{ path: string[]; sessions: number }[]>`
    WITH j AS (
      SELECT (array_agg(h.route ORDER BY h.seq))[1:${depth}] AS path
      FROM site_hits h JOIN site_sessions s ON s.id = h.session_id
      WHERE ${scope(range.from, range.to, filters)} AND h.kind = 'view' GROUP BY h.session_id
    )
    SELECT path, count(*)::int AS sessions FROM j GROUP BY path ORDER BY sessions DESC, array_to_string(path, ' ') LIMIT 40`;
  return { range, filters, depth, journeys: rows };
}
