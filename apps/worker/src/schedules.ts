// Cron-style schedules (the engine's and then the site's modules'). Reports and the daily newsletter run on
// the configured report calendar (REPORT_TIME_ZONE); every other job runs on Asia/Shanghai. Each run is
// recorded in job_runs; missed slots run once.
import type { PgBoss } from "pg-boss";
import { EDITION_TIMES } from "@aihot/site";
import { config } from "@aihot/backend/config";
import { ensureQueue, recordRun } from "@aihot/backend/jobs/queue";
import { runsHere } from "@aihot/backend/jobs/roles";
import { serverModules, type Scheduled } from "@aihot/backend/modules";
import { sweepUnprocessed } from "@aihot/backend/jobs/content";
import { translateContentPending } from "@aihot/backend/editorial/content-translate";
import { translatePending } from "@aihot/backend/editorial/translate";
import { adaptIntervals, scheduleDueSources } from "@aihot/backend/sources/collect";
import { scheduleMpReconcile } from "@aihot/backend/sources/mp";
import { followXRenames } from "@aihot/backend/sources/x-renames";
import { dajialaConfigured } from "@aihot/backend/providers/dajiala";
import { refreshSourceIcons } from "@aihot/backend/sources/icons";
import { findPreviews } from "@aihot/backend/media/previews";
import { computeHotRanking, snapshotHeat } from "@aihot/backend/events/hot";
import { linkRelatedStories } from "@aihot/backend/events/consolidate";
import { composeDueReports } from "@aihot/backend/reports/compose";
import { dailyRetention } from "@aihot/backend/operations/retention";
import { submitIndexNow } from "@aihot/backend/operations/indexnow";
import { readSearchConsoleWeek } from "@aihot/backend/operations/search-console";
import { submitBaiduPush } from "@aihot/backend/operations/baidu-push";
import { checkAlerts, sendDigest } from "@aihot/backend/operations/alerts";
import { recoverStaleWork } from "@aihot/backend/operations/recover";
import { forwardPendingFeedback } from "@aihot/backend/operations/feedback";
import { backupConfigured, runBackup } from "@aihot/backend/operations/backup";
import { sourceHealthWeekly } from "@aihot/backend/operations/reports";
import { sendDailyIssues } from "@aihot/backend/newsletter/issue";
import { syncUnsubscribes } from "@aihot/backend/newsletter/unsubscribes";
import { commentWechatColumn } from "@aihot/backend/newsletter/wechat-comments";
import { topicWechatColumn } from "@aihot/backend/newsletter/wechat-topics";

/** A schedule, optionally on its own calendar (the report calendar); the default is Asia/Shanghai. */
type EngineScheduled = Scheduled & { timeZone?: string };

const collecting = process.env.COLLECT_ENABLED === "true";

// The newsletter looks for the day's daily from its edition time (EDITION_TIMES, the report calendar's wall clock) for five hours.
const dailyHour = Number(EDITION_TIMES.daily.slice(0, 2));

export const ENGINE_SCHEDULES: EngineScheduled[] = [
  { name: "content.sweep", cron: "*/5 * * * *", run: sweepUnprocessed },
  // The other language's edition of what readers see now (hot strip, ranking, first feed page, newest daily);
  // once a day the whole site, for edits to older entries (model calls; off with MODEL_CALLS_ENABLED=false).
  { name: "content.localize", cron: "*/5 * * * *", run: () => translateContentPending(), runsOn: "models" },
  { name: "content.localize-sweep", cron: "40 4 * * *", missed: "once", run: () => translateContentPending(50, true), runsOn: "models" },
  { name: "content.translate", cron: "*/5 * * * *", run: () => translatePending(), runsOn: "models" },
  { name: "hot.rank", cron: "*/5 * * * *", run: () => computeHotRanking() },
  { name: "hot.snapshot", cron: "2 * * * *", run: () => snapshotHeat() },
  { name: "stories.links", cron: "12 * * * *", run: linkRelatedStories },
  // Every issue that is due and not written yet, each from its edition time (site/site.ts EDITION_TIMES,
  // read as wall time on the report calendar) at the next half hour; a missed or failed one at the next run.
  { name: "reports.compose", timeZone: config.reportTimeZone, cron: "0,30 * * * *", missed: "once", run: () => composeDueReports() },
  // Mails today's daily report as soon as it exists (claimed once per day; off unless NEWSLETTER_ENABLED).
  { name: "newsletter.daily", timeZone: config.reportTimeZone, cron: `*/10 ${dailyHour}-${Math.min(23, dailyHour + 4)} * * *`, run: () => sendDailyIssues() },
  // Unsubscribes made through an issue's link, read back from Resend (only with NEWSLETTER_ENABLED).
  { name: "newsletter.unsubscribes", cron: "20 5 * * *", missed: "once", run: () => syncUnsubscribes(), when: () => config.newsletterEnabled },
  // The site's comment on each entry of today's 公众号 column, once its Chinese edition is ready (model calls).
  { name: "wechat.comment", timeZone: config.reportTimeZone, cron: `5-55/10 ${dailyHour}-${Math.min(23, dailyHour + 4)} * * *`, run: () => commentWechatColumn(), runsOn: "models" },
  // The column's topics and follow-up lines, once a day as soon as its Chinese edition is ready (model calls).
  { name: "wechat.topics", timeZone: config.reportTimeZone, cron: `5-55/10 ${dailyHour}-${Math.min(23, dailyHour + 4)} * * *`, run: () => topicWechatColumn(), runsOn: "models" },
  // The deletions the privacy notice promises, once their retention periods are over.
  { name: "ops.retention", cron: "30 3 * * *", missed: "once", run: () => dailyRetention() },
  // IndexNow for added, changed and removed discovery URLs (off unless INDEXNOW_SUBMIT_ENABLED).
  { name: "seo.indexnow", cron: "50 * * * *", missed: "once", run: () => submitIndexNow() },
  // Last week's Search Console reading, once its days are final (only with SEARCH_CONSOLE_ENABLED).
  { name: "seo.search-console", cron: "0 10 * * 3", missed: "once", run: () => readSearchConsoleWeek(), when: () => config.searchConsoleEnabled },
  // Baidu's push for URLs new since the last run, within its daily quota (off unless BAIDU_PUSH_ENABLED).
  { name: "seo.baidu-push", cron: "55 * * * *", missed: "once", run: () => submitBaiduPush() },
  // Work a stopped process left half way becomes visible, and unknown paid requests get their one
  // automatic release; ops.alerts runs in parallel and sees the result by its next run at the latest.
  { name: "ops.recover", cron: "*/10 * * * *", run: () => recoverStaleWork() },
  { name: "ops.alerts", cron: "*/10 * * * *", run: () => checkAlerts() },
  // One message with other follow-ups and their actual impact (nothing when there are none).
  { name: "ops.digest", cron: "0 9 * * *", missed: "once", run: () => sendDigest() },
  // Feedback that did not reach the internal Feishu chat when it was sent (off with FEISHU_INTERNAL_ENABLED).
  { name: "feedback.forward", cron: "*/10 * * * *", run: () => forwardPendingFeedback() },
  ...(backupConfigured() ? [{ name: "ops.backup", cron: "10 4 * * *", missed: "once" as const, run: () => runBackup() }] : []),
  { name: "reports.source-health", cron: "0 9 * * 1", missed: "once", run: () => sourceHealthWeekly() },
  ...(collecting
    ? [
        { name: "sources.schedule", cron: "* * * * *", run: () => scheduleDueSources() },
        { name: "sources.adapt-intervals", cron: "20 4 * * *", run: adaptIntervals },
        // X accounts quiet for a day: a renamed one is followed to its new handle (SocialData, paid per lookup).
        { name: "sources.x-renames", cron: "50 4 * * *", missed: "once" as const, run: () => followXRenames() },
        // Icons are read from the sources' own sites, so they stop with collection.
        { name: "sources.icons", cron: "40 4 * * *", missed: "once" as const, run: () => refreshSourceIcons() },
        // Share pictures of recent public reports, read from their original pages.
        { name: "media.previews", cron: "*/10 * * * *", run: () => findPreviews() },
      ]
    : []),
  // WeChat official accounts through Dajiala (paid), each once per its interval; only with its key.
  ...(collecting && dajialaConfigured() ? [{ name: "sources.mp-reconcile", cron: "*/15 * * * *", run: () => scheduleMpReconcile() }] : []),
];

export async function registerSchedules(boss: PgBoss) {
  const known: EngineScheduled[] = [...ENGINE_SCHEDULES, ...serverModules().flatMap((m) => m.schedules ?? [])];
  const schedules = known.filter((s) => runsHere(s.runsOn) && (s.when?.() ?? true));
  for (const s of schedules) {
    const queue = `cron.${s.name}`;
    await ensureQueue(queue, { policy: "singleton", retryLimit: 1, expireInSeconds: 3600 });
    await boss.schedule(queue, s.cron, {}, { tz: s.timeZone ?? "Asia/Shanghai", missed: s.missed ?? "skip" });
    // Schedules fire at minute boundaries; a 15 s pickup keeps them on time with a third of the polling.
    await boss.work(queue, { pollingIntervalSeconds: 15 }, async () => recordRun(s.name, s.run));
  }
  // Retired or disabled timers must leave no queued work behind, including queues an earlier release
  // already unscheduled (reports.daily, reports.weekly, reports.monthly, reports.catch-up and stories.status
  // are retired this way). pg-boss deletes the queue's jobs and schedules; job_runs retains its audit.
  // With the work split (jobs/roles.ts) a worker removes only its own role's disabled timers, and retired
  // ones only where core work runs, so neither removes the other's.
  const current = new Set(schedules.map((s) => `cron.${s.name}`));
  const roleOf = new Map(known.map((s) => [`cron.${s.name}`, s.runsOn]));
  for (const old of await boss.getQueues()) {
    if (!old.name.startsWith("cron.") || current.has(old.name)) continue;
    if (roleOf.has(old.name) ? runsHere(roleOf.get(old.name)) : runsHere("core")) await boss.deleteQueue(old.name);
  }
}
