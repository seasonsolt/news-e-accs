import { sql } from "../db.ts";

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
  return { days: windowDays, totals: totals!, daily, pages };
}
