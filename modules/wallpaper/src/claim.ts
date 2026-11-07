import { sql } from "@aihot/backend/db";
import { checkSubscribeRequest, checkDailyLetters, normalizeEmail, NewsletterRejected, RESEND_COOLDOWN_MS, subscribe, subscribeLanguage } from "@aihot/backend/newsletter/subscribe";
import { sendEmail } from "@aihot/backend/providers/resend";
import { button, esc, frame, masthead, notice } from "@aihot/backend/newsletter/mail";
import { siteUrl } from "@aihot/backend/publication/links";
import { issueKey } from "./keys.ts";

export async function claimToken(token: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new NewsletterRejected(404, "not_found", "Invalid confirmation token.");
  const [s] = await sql`SELECT id FROM newsletter_subscribers WHERE token = ${token} AND status = 'confirmed' AND unsubscribed_at IS NULL`;
  if (!s) throw new NewsletterRejected(404, "not_found", "Invalid confirmation token.");
  return issueKey(s.id);
}
export async function claimEmail(raw: string, lang: unknown, ip: string, userAgent: string) {
  const email = normalizeEmail(raw);
  if (!email) throw new NewsletterRejected(400, "invalid_request", "Invalid email address.");
  const language = subscribeLanguage(lang);
  const [subscriber] = await sql<{ id: number; token: string }[]>`SELECT id, token FROM newsletter_subscribers WHERE email = ${email} AND status = 'confirmed' AND unsubscribed_at IS NULL`;
  if (!subscriber) return subscribe({ email, language, source: "wallpaper", ip, userAgent });
  await checkSubscribeRequest(ip, userAgent, language);
  // The letter carries the subscription token, not a key: only opening it rotates the key, so someone who
  // merely knows the address cannot break the reader's daily automation.
  await sql.begin(async (tx) => {
    await tx`SELECT id FROM newsletter_subscribers WHERE id = ${subscriber.id} FOR UPDATE`;
    const [previous] = await tx<{ link_sent_at: Date | null }[]>`SELECT link_sent_at FROM wallpaper_keys WHERE subscriber_id = ${subscriber.id}`;
    if (previous?.link_sent_at && Date.now() - previous.link_sent_at.getTime() < RESEND_COOLDOWN_MS) return;
    const [{ n }] = await tx<{ n: number }[]>`SELECT count(*)::int AS n FROM wallpaper_keys WHERE link_sent_at > now() - interval '1 day'`;
    await checkDailyLetters(n);
    if (!previous) await issueKey(subscriber.id, tx);
    const [{ sent }] = await tx<{ sent: Date }[]>`UPDATE wallpaper_keys SET link_sent_at = now(), updated_at = now()
      WHERE subscriber_id = ${subscriber.id} RETURNING link_sent_at AS sent`;
    const url = siteUrl(`${language === "zh" ? "/zh" : ""}/products/wallpaper#token=${subscriber.token}`);
    const title = language === "zh" ? "你的壁纸链接" : "Your wallpaper link";
    const warning = language === "zh" ? "打开这封信里的链接会换一条新的专属链接，旧链接随即失效。请不要转发。" : "Opening this link issues a new personal link and retires the old one. Do not forward this letter.";
    const open = language === "zh" ? "打开你的壁纸链接 →" : "Open your wallpaper link →";
    const kicker = language === "zh" ? "4K 壁纸 · 专属链接" : "4K WALLPAPERS · PERSONAL LINK";
    const before = language === "zh" ? "打开之前" : "BEFORE YOU OPEN IT";
    const sentBy = language === "zh" ? `这封邮件来自 ${new URL(siteUrl("/")).host}，因为这个邮箱申请了壁纸链接。` : `Sent by ${new URL(siteUrl("/")).host} because this address asked for its wallpaper link.`;
    const html = frame({ inner: `${masthead(kicker, title, language)}<tr><td class="pad" style="padding:22px 32px 0;">${button(url, open)}</td></tr>${notice(before, warning)}`, footer: esc(sentBy), language, plate: "daily", preheader: warning });
    await sendEmail({ idempotencyKey: `wallpaper-link:${subscriber.id}:${sent.getTime()}`, to: email, subject: title, html, text: `${title}\n\n${url}\n\n${warning}` });
  });
  return { ok: true };
}
