// The weekly readings (docs/plans/phase-two.md 9.1): page views by section, subscribers, and Search Console,
// one row a week (Monday to Sunday, the site's local dates) so a week can be set against the baseline.
import { addDays } from "@aihot/contracts/time";
import { config } from "../config.ts";
import { sql } from "../db.ts";
import { lastFullWeek, pageSection, type SectionReading } from "../operations/search-console.ts";

export interface WeeklyReading {
  /** Its Monday. */
  week: string;
  /** Its Sunday; the current week is partial. */
  end: string;
  partial: boolean;
  /** Days of the week with any page view recorded (counting began 2026-10-10). */
  days: number;
  views: number;
  sections: Record<string, number>;
  /** Confirmed at the week's end; unsubscribes in the mail provider are not synced back. */
  subscribers: number;
  signups: number;
  confirmations: number;
  confirmationsBySource: Array<{ source: string | null; count: number }>;
  search: { clicks: number; impressions: number; inspected: number; indexed: number; sections: Record<string, SectionReading> } | null;
}

export async function weeklyReadings(weeks = 12, now = new Date()) {
  const count = [4, 12, 26].includes(weeks) ? weeks : 12;
  const current = addDays(lastFullWeek(now).start, 7);
  const mondays = Array.from({ length: count }, (_, i) => addDays(current, -7 * i));
  const first = mondays.at(-1)!;
  const [views, subscribers, search, sources] = await Promise.all([
    sql<{ day: string; path: string; views: number }[]>`
      SELECT to_char(day, 'YYYY-MM-DD') AS day, path, views::int AS views FROM site_pageviews_daily WHERE day >= ${first}::date`,
    sql<{ week: string; subscribers: number; signups: number; confirmations: number }[]>`
      SELECT to_char(w.week, 'YYYY-MM-DD') AS week,
        (SELECT count(*)::int FROM newsletter_subscribers WHERE status = 'confirmed' AND confirmed_at < ((w.week + 7)::timestamp AT TIME ZONE 'Asia/Taipei')
          AND (unsubscribed_at IS NULL OR unsubscribed_at >= ((w.week + 7)::timestamp AT TIME ZONE 'Asia/Taipei'))) AS subscribers,
        (SELECT count(*)::int FROM newsletter_subscribers WHERE created_at >= (w.week::timestamp AT TIME ZONE 'Asia/Taipei') AND created_at < ((w.week + 7)::timestamp AT TIME ZONE 'Asia/Taipei')) AS signups,
        (SELECT count(*)::int FROM newsletter_subscribers WHERE confirmed_at >= (w.week::timestamp AT TIME ZONE 'Asia/Taipei') AND confirmed_at < ((w.week + 7)::timestamp AT TIME ZONE 'Asia/Taipei')) AS confirmations
      FROM unnest(${mondays}::date[]) AS w(week)`,
    sql<{ week: string; clicks: number; impressions: number; inspected: number; indexed: number; sections: Record<string, SectionReading> }[]>`
      SELECT to_char(week, 'YYYY-MM-DD') AS week, clicks, impressions, inspected, indexed, sections FROM search_console_weekly WHERE week >= ${first}::date`,
    sql<{ week: string; source: string | null; count: number }[]>`
      SELECT to_char(date_trunc('week', confirmed_at AT TIME ZONE 'Asia/Taipei'), 'YYYY-MM-DD') AS week,
        signup_source AS source, count(*)::int AS count
      FROM newsletter_subscribers WHERE confirmed_at >= (${first}::timestamp AT TIME ZONE 'Asia/Taipei')
      GROUP BY 1, signup_source`,
  ]);
  const rows: WeeklyReading[] = mondays.map((week) => {
    const end = addDays(week, 6);
    const own = views.filter((v) => v.day >= week && v.day <= end);
    const sections: Record<string, number> = {};
    for (const v of own) sections[pageSection(v.path)] = (sections[pageSection(v.path)] ?? 0) + v.views;
    const s = subscribers.find((x) => x.week === week)!;
    const sc = search.find((x) => x.week === week);
    return {
      week, end, partial: week === current,
      days: new Set(own.map((v) => v.day)).size,
      views: own.reduce((n, v) => n + v.views, 0),
      sections,
      subscribers: s.subscribers, signups: s.signups, confirmations: s.confirmations,
      confirmationsBySource: sources.filter((s) => s.week === week).map(({ source, count }) => ({ source, count })),
      search: sc ? { clicks: sc.clicks, impressions: sc.impressions, inspected: sc.inspected, indexed: sc.indexed, sections: sc.sections } : null,
    };
  });
  return { weeks: count, rows, searchConsole: { enabled: config.searchConsoleEnabled && Boolean(config.searchConsoleProperty) } };
}
