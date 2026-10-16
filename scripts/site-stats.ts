// Prints the site's own page views and interaction counts, the same summary as the admin statistics page,
// without signing in to the admin. Run on the server through deploy/update.sh --stats, or locally:
//   node --env-file=.env scripts/site-stats.ts [7|30|90]
import { siteAnalyticsOverview } from "@aihot/backend/admin/analytics";
import { closeDb } from "@aihot/backend/db";

type Overview = Awaited<ReturnType<typeof siteAnalyticsOverview>>;

function formatSiteStats(o: Overview): string {
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
  return lines.join("\n");
}

if (import.meta.main) {
  try {
    console.log(formatSiteStats(await siteAnalyticsOverview(Number(process.argv[2]) || 30)));
  } finally {
    await closeDb();
  }
}
