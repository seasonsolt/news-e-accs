// Readers unsubscribe through the link in an issue, which Resend handles; once a day the worker reads
// Resend's contacts back so subscriber counts leave them out. The day it was first seen stands in for
// the unsubscribe's own time, which Resend does not report.
import { config, credential } from "../config.ts";
import { sql } from "../db.ts";
import { listContacts } from "../providers/resend.ts";

export async function syncUnsubscribes() {
  if (!config.newsletterEnabled || !credential("integrations", "RESEND_API_KEY")) return { status: "disabled" as const };
  const contacts = await listContacts();
  const out = contacts.filter((c) => c.unsubscribed).map((c) => c.email);
  const back = contacts.filter((c) => !c.unsubscribed).map((c) => c.email);
  const left = await sql`
    UPDATE newsletter_subscribers SET unsubscribed_at = now(), updated_at = now()
    WHERE email = ANY(${out}::text[]) AND status = 'confirmed' AND unsubscribed_at IS NULL`;
  const returned = await sql`
    UPDATE newsletter_subscribers SET unsubscribed_at = NULL, updated_at = now()
    WHERE email = ANY(${back}::text[]) AND unsubscribed_at IS NOT NULL`;
  return { status: "synced" as const, contacts: contacts.length, unsubscribed: left.count, resubscribed: returned.count };
}
