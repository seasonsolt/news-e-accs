import { sql } from "../db.ts";
import { SITE_EVENTS } from "../site/analytics.ts";

export async function siteAnalyticsOverview(days = 30) {
  const windowDays = [7, 30, 90].includes(days) ? days : 30;
  const daily = await sql<{ day: string; views: number }[]>`
    WITH bounds AS (
      SELECT (now() AT TIME ZONE 'Asia/Taipei')::date - ${windowDays - 1}::int AS start_day,
             (now() AT TIME ZONE 'Asia/Taipei')::date AS end_day
    ), dates AS (
      SELECT (bounds.start_day + series.n)::date AS day
      FROM bounds CROSS JOIN LATERAL generate_series(0, ${windowDays - 1}::int) AS series(n)
    ), counts AS (
      SELECT day, sum(views)::bigint AS views
      FROM site_pageviews_daily CROSS JOIN bounds
      WHERE day >= bounds.start_day AND day <= bounds.end_day
      GROUP BY day
    )
    SELECT to_char(dates.day, 'YYYY-MM-DD') AS day, coalesce(counts.views, 0)::bigint AS views
    FROM dates LEFT JOIN counts USING (day)
    ORDER BY dates.day`;
  const [totals] = await sql<{ views: number; paths: number }[]>`
    SELECT coalesce(sum(views), 0)::bigint AS views, count(DISTINCT path)::int AS paths
    FROM site_pageviews_daily
    WHERE day >= (now() AT TIME ZONE 'Asia/Taipei')::date - ${windowDays - 1}::int
      AND day <= (now() AT TIME ZONE 'Asia/Taipei')::date`;
  const pages = await sql<{ path: string; views: number }[]>`
    SELECT path, sum(views)::bigint AS views
    FROM site_pageviews_daily
    WHERE day >= (now() AT TIME ZONE 'Asia/Taipei')::date - ${windowDays - 1}::int
      AND day <= (now() AT TIME ZONE 'Asia/Taipei')::date
    GROUP BY path
    ORDER BY views DESC, path
    LIMIT 50`;
  const eventRows = await sql<{ day: string; event: string; count: number }[]>`
    SELECT to_char(day, 'YYYY-MM-DD') AS day, event, sum(count)::bigint AS count
    FROM site_events_daily
    WHERE day >= (now() AT TIME ZONE 'Asia/Taipei')::date - ${windowDays - 1}::int
      AND day <= (now() AT TIME ZONE 'Asia/Taipei')::date
      AND event = ANY(${[...SITE_EVENTS]}::text[])
    GROUP BY day, event`;
  const countsByDay = new Map<string, Map<string, number>>();
  for (const row of eventRows) {
    let slot = countsByDay.get(row.day);
    if (!slot) countsByDay.set(row.day, slot = new Map());
    slot.set(row.event, row.count);
  }
  const engagementDaily = daily.map((row) => ({
    day: row.day,
    counts: Object.fromEntries(SITE_EVENTS.map((event) => [event, countsByDay.get(row.day)?.get(event) ?? 0])),
  }));
  const [firstStar] = await sql<{ devices: number }[]>`
    SELECT coalesce(sum(count), 0)::bigint AS devices
    FROM site_events_daily
    WHERE event = 'first_star'`;
  const topStarred = await sql<{ id: string; title: string | null; net: number }[]>`
    SELECT e.target AS id,
           (coalesce(sum(e.count) FILTER (WHERE e.event = 'star_add'), 0)
            - coalesce(sum(e.count) FILTER (WHERE e.event = 'star_remove'), 0))::bigint AS net,
           p.title
    FROM site_events_daily e
    LEFT JOIN publications p ON p.article_id = e.target
    WHERE e.day >= (now() AT TIME ZONE 'Asia/Taipei')::date - ${windowDays - 1}::int
      AND e.day <= (now() AT TIME ZONE 'Asia/Taipei')::date
      AND e.event IN ('star_add', 'star_remove')
    GROUP BY e.target, p.title
    HAVING coalesce(sum(e.count) FILTER (WHERE e.event = 'star_add'), 0)
         - coalesce(sum(e.count) FILTER (WHERE e.event = 'star_remove'), 0) > 0
    ORDER BY net DESC, e.target
    LIMIT 20`;
  return {
    days: windowDays,
    totals: totals!,
    daily,
    pages,
    engagement: {
      totals: SITE_EVENTS.map((event) => ({
        event,
        count: engagementDaily.reduce((sum, row) => sum + (row.counts[event] ?? 0), 0),
      })),
      daily: engagementDaily,
      firstStarDevices: firstStar?.devices ?? 0,
      topStarred,
    },
  };
}
