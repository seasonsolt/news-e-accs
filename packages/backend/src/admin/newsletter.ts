import { sql } from "../db.ts";

const PAGE_SIZE = 50;

export async function newsletterOverview(days = 30, page = 1) {
  const windowDays = [7, 30, 90].includes(days) ? days : 30;
  const currentPage = Math.max(1, Math.floor(page));
  const offset = (currentPage - 1) * PAGE_SIZE;

  const [totals] = await sql<{ total: number; confirmed: number; pending: number; unsubscribed: number }[]>`
    SELECT count(*)::int AS total,
           count(*) FILTER (WHERE status = 'confirmed' AND unsubscribed_at IS NULL)::int AS confirmed,
           count(*) FILTER (WHERE status = 'confirmed' AND unsubscribed_at IS NOT NULL)::int AS unsubscribed,
           count(*) FILTER (WHERE status = 'pending')::int AS pending
    FROM newsletter_subscribers`;
  const daily = await sql<{ day: string; signups: number; confirmations: number }[]>`
    WITH bounds AS (
      SELECT (now() AT TIME ZONE 'Asia/Taipei')::date - ${windowDays - 1}::int AS start_day,
             (now() AT TIME ZONE 'Asia/Taipei')::date AS end_day
    ), days AS (
      SELECT (bounds.start_day + series.n)::date AS day
      FROM bounds CROSS JOIN LATERAL generate_series(0, ${windowDays - 1}::int) AS series(n)
    ), signups AS (
      SELECT (s.created_at AT TIME ZONE 'Asia/Taipei')::date AS day, count(*)::int AS n
      FROM newsletter_subscribers s CROSS JOIN bounds b
      WHERE s.created_at >= (b.start_day::timestamp AT TIME ZONE 'Asia/Taipei')
        AND s.created_at < ((b.end_day + 1)::timestamp AT TIME ZONE 'Asia/Taipei')
      GROUP BY 1
    ), confirmations AS (
      SELECT (s.confirmed_at AT TIME ZONE 'Asia/Taipei')::date AS day, count(*)::int AS n
      FROM newsletter_subscribers s CROSS JOIN bounds b
      WHERE s.status = 'confirmed' AND s.confirmed_at IS NOT NULL
        AND s.confirmed_at >= (b.start_day::timestamp AT TIME ZONE 'Asia/Taipei')
        AND s.confirmed_at < ((b.end_day + 1)::timestamp AT TIME ZONE 'Asia/Taipei')
      GROUP BY 1
    )
    SELECT to_char(days.day, 'YYYY-MM-DD') AS day,
           coalesce(signups.n, 0)::int AS signups,
           coalesce(confirmations.n, 0)::int AS confirmations
    FROM days
    LEFT JOIN signups USING (day)
    LEFT JOIN confirmations USING (day)
    ORDER BY days.day`;
  const rows = await sql<{
    id: number;
    email: string;
    status: "pending" | "confirmed";
    created_at: Date;
    confirm_sent_at: Date | null;
    confirmed_at: Date | null;
    unsubscribed_at: Date | null;
  }[]>`
    SELECT id, email, status, created_at, confirm_sent_at, confirmed_at, unsubscribed_at
    FROM newsletter_subscribers
    ORDER BY created_at DESC, id DESC
    LIMIT ${PAGE_SIZE} OFFSET ${offset}`;

  return { days: windowDays, page: currentPage, pageSize: PAGE_SIZE, totalRows: totals!.total, totals: totals!, daily, rows };
}
