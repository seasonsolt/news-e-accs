// The daily issue: once today's daily report exists, it is mailed to the confirmed contacts as one
// broadcast. A row in newsletter_sends is claimed before the provider is called, so retries, restarts
// and regenerated reports never mail a day twice; a send that ends in doubt is left 'unknown' for a
// person to check in Resend rather than resent.
import { beijingDate } from "@aihot/contracts/time";
import { config } from "../config.ts";
import { sql } from "../db.ts";
import { loadReport } from "../publication/reports.ts";
import { ResendError, resendConfigured, sendBroadcast } from "../providers/resend.ts";
import { dailyIssueMail, issueSections } from "./mail.ts";

export type IssueOutcome =
  | { status: "disabled" | "not_configured" | "no_report" | "already" }
  | { status: "skipped"; reason: string }
  | { status: "sent"; broadcastId: string }
  | { status: "failed" | "unknown"; error: string };

export async function sendDailyIssue(date = beijingDate(Date.now())): Promise<IssueOutcome> {
  if (!config.newsletterEnabled) return { status: "disabled" };
  if (!resendConfigured()) return { status: "not_configured" };
  // Only today's issue: a report composed late for an earlier day is not news by mail.
  if (date !== beijingDate(Date.now())) return { status: "skipped", reason: "not today" };
  const report = await loadReport("daily", date);
  if (!report) return { status: "no_report" };

  const [claimed] = await sql`INSERT INTO newsletter_sends (report_key, status) VALUES (${date}, 'sending') ON CONFLICT (report_key) DO NOTHING RETURNING report_key`;
  if (!claimed) return { status: "already" };
  if (issueSections(report).length === 0) {
    await sql`UPDATE newsletter_sends SET status = 'skipped', response = 'empty report' WHERE report_key = ${date}`;
    return { status: "skipped", reason: "empty report" };
  }
  try {
    const mail = dailyIssueMail(report);
    const broadcastId = await sendBroadcast({ name: `daily ${date}`, ...mail });
    await sql`UPDATE newsletter_sends SET status = 'sent', broadcast_id = ${broadcastId}, sent_at = now() WHERE report_key = ${date}`;
    return { status: "sent", broadcastId };
  } catch (error) {
    // A refusal (4xx) was certainly not sent; anything else may have been.
    const refused = error instanceof ResendError && error.status !== null && !error.retryable;
    const status = refused ? "failed" : "unknown";
    const message = String(error).slice(0, 500);
    await sql`UPDATE newsletter_sends SET status = ${status}, response = ${message} WHERE report_key = ${date}`;
    return { status, error: message };
  }
}
