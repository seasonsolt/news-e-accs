// Newsletter sign-up with double opt-in. Subscribing answers the same whether or not the address was
// known (so the form cannot be used to test addresses) and mails a confirmation link; the link opens a
// page that confirms by script (a POST), so mail scanners that only fetch links cannot confirm on a
// reader's behalf.
// Abuse control: the feedback form's source hash and bans, a per-source limit, one letter per address
// per cooldown, and a daily ceiling below the provider's free allowance.
import { randomBytes } from "node:crypto";
import { config } from "../config.ts";
import { sql } from "../db.ts";
import { feedbackSourceHash } from "../operations/feedback.ts";
import { siteUrl } from "../publication/links.ts";
import { ResendError, resendConfigured, sendEmail, subscribeContact } from "../providers/resend.ts";
import { confirmationMail } from "./mail.ts";

export class NewsletterRejected extends Error {
  readonly status: number;
  readonly code: string;
  readonly retryAfter?: number;
  constructor(status: number, code: string, message: string, retryAfter?: number) {
    super(message);
    this.status = status;
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

/** A second letter to the same address waits this long (a reader who lost the first can ask again). */
const RESEND_COOLDOWN_MS = 10 * 60_000;
/** Confirmation letters per rolling day; Resend's free plan allows 100 one-off letters a day. */
const DAILY_LETTERS = 90;

const recent = new Map<string, number[]>();
function rateLimit(source: string, perMinute = 5): void {
  const now = Date.now();
  const list = (recent.get(source) ?? []).filter((t) => now - t < 60_000);
  if (list.length >= perMinute) throw new NewsletterRejected(429, "rate_limited", "操作太频繁，请稍后再试。", 60);
  list.push(now);
  recent.set(source, list);
  if (recent.size > 5000) for (const [k, v] of recent) if (v.every((t) => now - t > 60_000)) recent.delete(k);
}

function assertOpen(): void {
  if (!config.newsletterEnabled || !resendConfigured()) throw new NewsletterRejected(503, "unavailable", "订阅暂未开放，请稍后再来。", 3600);
}

export function normalizeEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  return email.length <= 200 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

export const confirmUrl = (token: string): string => siteUrl(`/subscribe?token=${token}`);

export async function subscribe(input: { email: string; ip: string; userAgent: string }): Promise<{ ok: true }> {
  const email = normalizeEmail(input.email);
  if (!email) throw new NewsletterRejected(400, "invalid_request", "邮箱格式不正确。");
  assertOpen();
  const source = feedbackSourceHash(input.ip, input.userAgent);
  const [banned] = await sql`SELECT 1 FROM feedback_bans WHERE source_hash = ${source}`;
  if (banned) throw new NewsletterRejected(403, "forbidden", "暂时无法订阅。");
  rateLimit(source);

  const [row] = await sql<{ id: string; token: string; confirm_sent_at: Date | null }[]>`
    INSERT INTO newsletter_subscribers (email, token, source_hash)
    VALUES (${email}, ${randomBytes(32).toString("base64url")}, ${source})
    ON CONFLICT (email) DO UPDATE SET updated_at = now()
    RETURNING id, token, confirm_sent_at`;
  if (row!.confirm_sent_at && Date.now() - row!.confirm_sent_at.getTime() < RESEND_COOLDOWN_MS) return { ok: true };
  const [{ n }] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM newsletter_subscribers WHERE confirm_sent_at > now() - interval '1 day'`;
  if (n >= DAILY_LETTERS) throw new NewsletterRejected(429, "rate_limited", "今天订阅的人太多了，请明天再试。", 3600);

  const mail = confirmationMail(confirmUrl(row!.token));
  try {
    // One letter per address per cooldown window, even if two requests race past the check above.
    await sendEmail({ to: email, ...mail, idempotencyKey: `newsletter-confirm:${row!.id}:${Math.floor(Date.now() / RESEND_COOLDOWN_MS)}` });
  } catch (error) {
    console.error(JSON.stringify({ level: "error", msg: "newsletter confirmation failed", error: String(error).slice(0, 300) }));
    throw new NewsletterRejected(503, "temporarily_unavailable", "确认邮件暂时发不出去，请稍后再试。", error instanceof ResendError && error.retryable ? 60 : 3600);
  }
  await sql`UPDATE newsletter_subscribers SET confirm_sent_at = now(), updated_at = now() WHERE id = ${row!.id}`;
  return { ok: true };
}

export async function confirm(token: string): Promise<{ ok: true }> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new NewsletterRejected(404, "not_found", "确认链接无效，请重新订阅。");
  assertOpen();
  const [row] = await sql<{ id: string; email: string }[]>`SELECT id, email FROM newsletter_subscribers WHERE token = ${token}`;
  if (!row) throw new NewsletterRejected(404, "not_found", "确认链接无效，请重新订阅。");
  try {
    await subscribeContact(row.email);
  } catch (error) {
    console.error(JSON.stringify({ level: "error", msg: "newsletter confirm failed", error: String(error).slice(0, 300) }));
    throw new NewsletterRejected(503, "temporarily_unavailable", "暂时无法完成确认，请稍后再点一次。", 60);
  }
  await sql`UPDATE newsletter_subscribers SET status = 'confirmed', confirmed_at = coalesce(confirmed_at, now()), updated_at = now() WHERE id = ${row.id}`;
  return { ok: true };
}
