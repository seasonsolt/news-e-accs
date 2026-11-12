// The daily issue: once today's daily report exists, it is mailed to the confirmed contacts as one
// broadcast. A row in newsletter_sends is claimed before the provider is called, so retries, restarts
// and regenerated reports never mail a day twice; a send that ends in doubt is left 'unknown' for a
// person to check in Resend rather than resent.
import type { ReportDetail } from "@aihot/contracts/site";
import { calendarDate } from "@aihot/contracts/time";
import { config } from "../config.ts";
import { sql } from "../db.ts";
import { localizePublication } from "../publication/content-language.ts";
import { editionReady, type DistributionLanguage } from "../publication/distribution.ts";
import { loadReport } from "../publication/reports.ts";
import { ResendError, resendConfigured, sendBroadcast } from "../providers/resend.ts";
import { dailyIssueMail, issueSections } from "./mail.ts";
import { letterFeatures, letterReading } from "./reading.ts";

export type IssueOutcome =
  | { status: "disabled" | "not_configured" | "no_report" | "no_subscribers" | "already" }
  | { status: "skipped"; reason: string }
  | { status: "sent"; broadcastId: string }
  | { status: "failed" | "unknown"; error: string };

/** Why a localized report cannot be distributed in the language yet, or null once it and every shown citation are. */
export function editionGap(report: ReportDetail, language: DistributionLanguage): string | null {
  if (!editionReady(report, language, true)) return "edition not ready";
  const citations = issueSections(report).flatMap(section => section.items);
  if (citations.some(item => 'contentLanguage' in item && !editionReady(item, language, true))) return "citation edition not ready";
  return null;
}

export async function sendDailyIssue(date = calendarDate(Date.now(), config.reportTimeZone), language: DistributionLanguage = "zh"): Promise<IssueOutcome> {
  if (!config.newsletterEnabled) return { status: "disabled" };
  if (!resendConfigured(language)) return { status: "not_configured" };
  // Only today's issue: a report composed late for an earlier day is not news by mail.
  if (date !== calendarDate(Date.now(), config.reportTimeZone)) return { status: "skipped", reason: "not today" };
  const source = await loadReport("daily", date);
  if (!source) return { status: "no_report" };
  // A legacy broadcast covered the shared list. Never re-mail its date in either language.
  const [legacy] = await sql`SELECT 1 FROM newsletter_sends WHERE report_key = ${date}`;
  if (legacy) return { status: "already" };
  const report = await localizePublication(source, language);
  const gap = editionGap(report, language);
  // A missing edition is not replaced with the other language. The day stays unclaimed and the next
  // check (every 10 minutes through the morning) tries again. Skipping is logged so a quiet English
  // morning is visible.
  if (gap) {
    console.log(JSON.stringify({ level: "info", msg: "newsletter edition skipped", date, language, reason: gap }));
    return { status: "skipped", reason: gap };
  }
  // Nobody to mail yet: leave the day unclaimed, so a reader who confirms later this morning still gets it.
  const [{ n }] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM newsletter_subscribers WHERE status = 'confirmed' AND unsubscribed_at IS NULL AND language = ${language}`;
  if (n === 0) return { status: "no_subscribers" };
  // Before the claim: a day that is claimed is never tried again.
  const reading = await letterReading(language);
  const features = await letterFeatures(language);

  const [claimed] = await sql`INSERT INTO newsletter_language_sends (report_key, language, status) VALUES (${date}, ${language}, 'sending') ON CONFLICT (report_key, language) DO NOTHING RETURNING report_key`;
  if (!claimed) return { status: "already" };
  if (issueSections(report).length === 0) {
    console.log(JSON.stringify({ level: "info", msg: "newsletter edition skipped", date, language, reason: "empty report" }));
    await sql`UPDATE newsletter_language_sends SET status = 'skipped', response = 'empty report' WHERE report_key = ${date} AND language = ${language}`;
    return { status: "skipped", reason: "empty report" };
  }
  try {
    const mail = dailyIssueMail(report, language, reading, features);
    const broadcastId = await sendBroadcast({ name: `daily ${date} ${language}`, ...mail }, language);
    await sql`UPDATE newsletter_language_sends SET status = 'sent', broadcast_id = ${broadcastId}, sent_at = now() WHERE report_key = ${date} AND language = ${language}`;
    return { status: "sent", broadcastId };
  } catch (error) {
    // A refusal (4xx) was certainly not sent; anything else may have been.
    const refused = error instanceof ResendError && error.status !== null && !error.retryable;
    const status = refused ? "failed" : "unknown";
    const message = String(error).slice(0, 500);
    await sql`UPDATE newsletter_language_sends SET status = ${status}, response = ${message} WHERE report_key = ${date} AND language = ${language}`;
    return { status, error: message };
  }
}

/** Each language has its own claim; one missing edition/segment does not block the other. */
export async function sendDailyIssues(date = calendarDate(Date.now(), config.reportTimeZone)) {
  return { en: await sendDailyIssue(date, "en"), zh: await sendDailyIssue(date, "zh") };
}
