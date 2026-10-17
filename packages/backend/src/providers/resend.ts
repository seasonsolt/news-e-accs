// Resend (newsletter mail): one-off letters (subscription confirmations) and broadcasts to a segment of
// confirmed contacts (the daily issue). Resend's free tier carries this list, so calls are not receipted
// like paid providers; idempotency is the caller's claim row plus Resend's Idempotency-Key.
import { credential } from "../config.ts";
import type { DistributionLanguage } from "../publication/distribution.ts";
import { guardedFetch } from "../lib/http-fetch.ts";

export class ResendError extends Error {
  readonly status: number | null;
  /** Whether the same call may succeed later (rate limit, outage, timeout). */
  readonly retryable: boolean;
  constructor(message: string, status: number | null, retryable: boolean) {
    super(message);
    this.status = status;
    this.retryable = retryable;
  }
}

function base(): string {
  return (credential("integrations", "RESEND_BASE_URL") ?? "https://api.resend.com").replace(/\/$/, "");
}

/** Sender shown to readers; its domain must be verified in Resend. */
export function newsletterFrom(): string {
  return credential("integrations", "NEWSLETTER_FROM") ?? "e/acc Daily <daily@e-acc.ai>";
}

/** Whether the credentials the newsletter needs are present (the NEWSLETTER_ENABLED valve is separate). */
export function newsletterSegment(language: DistributionLanguage = "zh"): string | null {
  const segment = credential("integrations", language === "en" ? "RESEND_SEGMENT_ID_EN" : "RESEND_SEGMENT_ID");
  // Sharing a segment would send both editions to the same readers.
  const other = credential("integrations", language === "en" ? "RESEND_SEGMENT_ID" : "RESEND_SEGMENT_ID_EN");
  return segment && segment !== other ? segment : null;
}

export function resendConfigured(language: DistributionLanguage = "zh"): boolean {
  return !!credential("integrations", "RESEND_API_KEY") && !!newsletterSegment(language);
}

async function call(method: string, path: string, body?: unknown, idempotencyKey?: string): Promise<{ status: number; json: any }> {
  const key = credential("integrations", "RESEND_API_KEY");
  if (!key) throw new ResendError("RESEND_API_KEY is not configured", null, false);
  const headers: Record<string, string> = { authorization: `Bearer ${key}`, accept: "application/json" };
  if (body !== undefined) headers["content-type"] = "application/json";
  if (idempotencyKey) headers["idempotency-key"] = idempotencyKey;
  let res;
  try {
    res = await guardedFetch(`${base()}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), timeoutMs: 20_000, maxBytes: 1024 * 1024, route: "direct" });
  } catch (error) {
    throw new ResendError(`resend ${method} ${path}: ${String(error).slice(0, 200)}`, null, true);
  }
  let json: any = null;
  try {
    json = JSON.parse(res.text() || "null");
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

function fail(what: string, r: { status: number; json: any }): never {
  const message = `resend ${what}: HTTP ${r.status} ${String(r.json?.message ?? "").slice(0, 200)}`;
  throw new ResendError(message, r.status, r.status === 429 || r.status >= 500);
}

export async function sendEmail(mail: { to: string; subject: string; html: string; text: string; idempotencyKey: string }): Promise<string> {
  const r = await call("POST", "/emails", { from: newsletterFrom(), to: [mail.to], subject: mail.subject, html: mail.html, text: mail.text }, mail.idempotencyKey);
  if (r.status !== 200 && r.status !== 201) fail("send email", r);
  return String(r.json?.id ?? "");
}

function segmentId(language: DistributionLanguage): string {
  const segment = newsletterSegment(language);
  if (!segment) throw new ResendError("Distinct newsletter segment is not configured", null, false);
  return segment;
}

/**
 * Adds the address to this edition's segment. A missing contact is created already subscribed,
 * because it has never been on a list. An existing contact is left unsubscribed if it was: clearing
 * that flag is a separate step, after the segment membership is the one we want.
 */
export async function addContactToSegment(email: string, language: DistributionLanguage): Promise<void> {
  const segment = segmentId(language);
  const path = `/contacts/${encodeURIComponent(email)}`;
  const existing = await call("GET", path);
  if (existing.status === 404) {
    const created = await call("POST", "/contacts", { email, unsubscribed: false, segments: [{ id: segment }] });
    if (created.status !== 200 && created.status !== 201) fail("create contact", created);
    return;
  }
  if (existing.status !== 200) fail("get contact", existing);
  const joined = await call("POST", `${path}/segments/${encodeURIComponent(segment)}`);
  // A contact already in the segment is answered as a conflict; that is the state we want.
  if (joined.status !== 200 && joined.status !== 201 && joined.status !== 409) fail("add contact to segment", joined);
}

/** Takes the address out of this edition's segment. Not being a member (404) is already the result we want. */
export async function removeContactFromSegment(email: string, language: DistributionLanguage): Promise<void> {
  const segment = newsletterSegment(language);
  if (!segment) return;
  const removed = await call("DELETE", `/contacts/${encodeURIComponent(email)}/segments/${encodeURIComponent(segment)}`);
  if (removed.status === 200 || removed.status === 204 || removed.status === 404) return;
  fail("remove contact from segment", removed);
}

/** Clears the contact-wide unsubscribe flag. Call only after segment membership is already correct. */
export async function clearContactUnsubscribe(email: string): Promise<void> {
  const updated = await call("PATCH", `/contacts/${encodeURIComponent(email)}`, { unsubscribed: false });
  if (updated.status !== 200) fail("update contact", updated);
}

/**
 * Puts the address on this edition's segment and takes it off the other. The unsubscribe flag is
 * not touched. If leaving the old segment fails, the new membership is removed and the error is
 * rethrown, so a failed move does not leave the address on both lists.
 */
export async function assignEdition(email: string, language: DistributionLanguage): Promise<void> {
  const other: DistributionLanguage = language === "en" ? "zh" : "en";
  await addContactToSegment(email, language);
  try {
    await removeContactFromSegment(email, other);
  } catch (error) {
    try {
      await removeContactFromSegment(email, language);
    } catch (undo) {
      console.error(JSON.stringify({ level: "error", msg: "newsletter segment rollback failed", language, error: String(undo).slice(0, 300) }));
    }
    throw error;
  }
}

/**
 * Every contact with whether it is unsubscribed, a hundred a page. Unsubscribing is per contact in
 * Resend, through any issue's link, so it covers both editions' segments.
 */
export async function listContacts(): Promise<Array<{ email: string; unsubscribed: boolean }>> {
  const contacts: Array<{ email: string; unsubscribed: boolean }> = [];
  for (let after: string | null = null; ;) {
    const r = await call("GET", `/contacts?limit=100${after ? `&after=${encodeURIComponent(after)}` : ""}`);
    if (r.status !== 200) fail("list contacts", r);
    const page = (r.json?.data ?? []) as Array<{ id: string; email: string; unsubscribed: boolean }>;
    for (const c of page) contacts.push({ email: c.email.toLowerCase(), unsubscribed: c.unsubscribed === true });
    if (!r.json?.has_more || page.length === 0) return contacts;
    after = page.at(-1)!.id;
  }
}

/** Creates and sends a broadcast to every subscribed contact in the segment; returns its id. */
export async function sendBroadcast(issue: { name: string; subject: string; html: string; text: string }, language: DistributionLanguage = "zh"): Promise<string> {
  const segment = newsletterSegment(language);
  if (!segment) throw new ResendError("Distinct newsletter segment is not configured", null, false);
  const r = await call("POST", "/broadcasts", { segment_id: segment, from: newsletterFrom(), subject: issue.subject, html: issue.html, text: issue.text, name: issue.name, send: true });
  if (r.status !== 200 && r.status !== 201) fail("send broadcast", r);
  return String(r.json?.id ?? "");
}
