// Prints the site's own page views and interaction counts, the same summary as the admin statistics page,
// without signing in to the admin. Run on the server through deploy/update.sh --stats, or locally:
//   node --env-file=.env scripts/site-stats.ts [7|30|90]
import { siteAnalyticsOverview, subscribeFunnel } from "@aihot/backend/admin/analytics";
import { closeDb } from "@aihot/backend/db";

type Overview = Awaited<ReturnType<typeof siteAnalyticsOverview>>;
type Funnel = Awaited<ReturnType<typeof subscribeFunnel>>;

const FUNNEL_COLUMNS = ["subscribe_view", "subscribe_submit", "subscribe_success", "subscribe_error", "subscribe_confirmed", "subscribe_dismiss"] as const;

function formatSiteStats(o: Overview, funnel: Funnel): string {
  const lines = [`Site statistics, last ${o.days} days (Asia/Taipei dates)`, `page views ${o.totals.views} on ${o.totals.paths} routes`, ""];
  lines.push("day         views  " + o.engagement.totals.map((t) => t.event).join(" "));
  for (const [i, row] of o.daily.entries()) {
    const counts = o.engagement.daily[i]!.counts;
    lines.push(`${row.day}  ${String(row.views).padStart(5)}  ${o.engagement.totals.map((t) => String(counts[t.event] ?? 0).padStart(t.event.length)).join(" ")}`);
  }
  lines.push("", "totals: " + o.engagement.totals.map((t) => `${t.event} ${t.count}`).join(", "));
  lines.push(`devices that ever starred: ${o.engagement.firstStarDevices}`);
  lines.push("", "top routes:", ...o.pages.slice(0, 20).map((p) => `  ${String(p.views).padStart(6)}  ${p.path}`));
  lines.push("", "most starred (net):", ...(o.engagement.topStarred.length
    ? o.engagement.topStarred.map((s) => `  ${String(s.net).padStart(4)}  ${s.id}  ${s.title ?? ""}`)
    : ["  none"]));
  lines.push("", ...formatSubscribeFunnel(funnel));
  return lines.join("\n");
}

function formatSubscribeFunnel(funnel: Funnel): string[] {
  const lines = [`subscribe funnel, last ${funnel.days} days (source, locale; no addresses)`];
  const slots = new Map<string, Record<string, number>>();
  for (const row of funnel.totals) {
    const key = `${row.source} ${row.locale}`;
    const slot = slots.get(key) ?? {};
    slot[row.event] = (slot[row.event] ?? 0) + row.count;
    slots.set(key, slot);
  }
  if (slots.size === 0) {
    lines.push("  none");
    return lines;
  }
  lines.push("source            locale  " + FUNNEL_COLUMNS.map((event) => event.replace("subscribe_", "")).join(" "));
  for (const [key, slot] of [...slots.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const [source, locale] = key.split(" ");
    lines.push(`${source!.padEnd(17)} ${locale}  ${FUNNEL_COLUMNS.map((event) => String(slot[event] ?? 0).padStart(event.replace("subscribe_", "").length)).join(" ")}`);
  }
  const errors = funnel.totals.filter((row) => row.event === "subscribe_error" && row.count > 0);
  if (errors.length) lines.push("errors: " + errors.map((row) => `${row.source} ${row.locale} ${row.reason} ${row.count}`).join(", "));
  return lines;
}

/** The page-view summary and the subscribe funnel both keep 7, 30 or 90 and treat anything else as 30. */
function statsWindow(days: number): number {
  return days === 7 || days === 30 || days === 90 ? days : 30;
}

if (import.meta.main) {
  try {
    const days = statsWindow(Number(process.argv[2]) || 30);
    console.log(formatSiteStats(await siteAnalyticsOverview(days), await subscribeFunnel(days)));
  } finally {
    await closeDb();
  }
}
