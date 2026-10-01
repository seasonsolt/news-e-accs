// The newsletter: signing up answers alike for known and unknown addresses and mails one confirmation
// per cooldown; confirming makes the address a subscribed contact in the segment, also after an
// unsubscribe; today's daily report is mailed as one broadcast, at most once a day, and a send in doubt
// is never repeated. Resend is a local stub; the NEWSLETTER_ENABLED valve is opened only here.
import { Reply, stub, tag } from "./setup.ts";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { beijingDate, addDays } from "@aihot/contracts/time";
import { config } from "@aihot/backend/config";
import { closeDb, sql } from "@aihot/backend/db";
import { stopBoss } from "@aihot/backend/jobs/queue";
import { confirm, NewsletterRejected, subscribe } from "@aihot/backend/newsletter/subscribe";
import { sendDailyIssue } from "@aihot/backend/newsletter/issue";

const T = tag();
const EMAIL = `Reader.${T}@Example.org`;
const TODAY = beijingDate(Date.now());

interface Hit { method: string; path: string; body: any; idempotencyKey: string | undefined }
const hits: Hit[] = [];
/** Contacts the stub knows, and what the next broadcast answers. */
const contacts = new Set<string>();
let broadcastAnswer: () => unknown = () => ({ object: "broadcast", id: `bc-${T}` });

const resend = await stub((_n, req) => {
  const path = new URL(req.url, "http://stub").pathname;
  const body = req.body ? JSON.parse(req.body) : null;
  hits.push({ method: req.method, path, body, idempotencyKey: req.headers["idempotency-key"] as string | undefined });
  if (req.method === "POST" && path === "/emails") return { id: `em-${hits.length}` };
  const contact = /^\/contacts\/([^/]+)$/.exec(path);
  if (req.method === "PATCH" && contact) return contacts.has(decodeURIComponent(contact[1]!)) ? { object: "contact", id: "c1" } : new Reply(404, { name: "not_found", message: "Contact not found" });
  if (req.method === "POST" && path === "/contacts") {
    contacts.add(body.email);
    return { object: "contact", id: "c1" };
  }
  if (req.method === "POST" && /^\/contacts\/[^/]+\/segments\//.test(path)) return new Reply(409, { name: "conflict", message: "Contact already in segment" });
  if (req.method === "POST" && path === "/broadcasts") return broadcastAnswer();
  return new Reply(404, { name: "not_found", message: "unknown endpoint" });
});
process.env.RESEND_BASE_URL = resend.url;
process.env.RESEND_API_KEY = "re_test_key";
process.env.RESEND_SEGMENT_ID = "seg-test";
config.allowPrivateNetworkFetch = true;
config.newsletterEnabled = true;

const visitor = { ip: `198.51.100.${Math.floor(Math.random() * 200) + 1}`, userAgent: `newsletter-test-${T} Chrome` };
const since = () => hits.length;
const tokenOf = async () => (await sql<{ token: string }[]>`SELECT token FROM newsletter_subscribers WHERE email = ${EMAIL.toLowerCase()}`)[0]!.token;

before(async () => {
  await sql`DELETE FROM newsletter_sends WHERE report_key = ${TODAY}`;
  await sql`DELETE FROM reports WHERE kind = 'daily' AND key = ${TODAY}`;
  const content = {
    date: TODAY,
    lead: { title: `头条 ${T}`, leadParagraph: "导语 <b>不</b>是 HTML。" },
    highlights: [],
    sections: [
      { label: "模型", items: [{ itemId: `nl-${T}-1`, title: "模型 A 发布", summary: "摘要一", sourceName: "官方博客", sourceUrl: "https://example.org/a" }] },
      { label: "产品", items: [{ itemId: `nl-${T}-2`, title: "产品 B 上线", summary: null, sourceName: "媒体", sourceUrl: "https://example.org/b" }] },
    ],
    flashes: [],
    metrics: {},
  };
  await sql`INSERT INTO reports (kind, key, window_start, window_end, content, generated_at)
            VALUES ('daily', ${TODAY}, now() - interval '1 day', now(), ${sql.json(content)}, now())`;
});

after(async () => {
  await sql`DELETE FROM newsletter_sends WHERE report_key = ${TODAY}`;
  await sql`DELETE FROM reports WHERE kind = 'daily' AND key = ${TODAY}`;
  await sql`DELETE FROM newsletter_subscribers WHERE email = ${EMAIL.toLowerCase()}`;
  await resend.close();
  await stopBoss();
  await closeDb();
});

test("a malformed address is refused, and nothing is mailed while the valve is closed", async () => {
  const before = since();
  await assert.rejects(subscribe({ email: "not-an-address", ...visitor }), (e: unknown) => e instanceof NewsletterRejected && e.status === 400);
  config.newsletterEnabled = false;
  try {
    await assert.rejects(subscribe({ email: EMAIL, ...visitor }), (e: unknown) => e instanceof NewsletterRejected && e.status === 503);
    assert.deepEqual(await sendDailyIssue(TODAY), { status: "disabled" });
  } finally {
    config.newsletterEnabled = true;
  }
  assert.equal(since(), before, "no call reached the provider");
});

test("signing up stores the address pending and mails one confirmation per cooldown", async () => {
  const before = since();
  assert.deepEqual(await subscribe({ email: EMAIL, ...visitor }), { ok: true });
  const [row] = await sql<{ status: string; confirm_sent_at: Date | null }[]>`SELECT status, confirm_sent_at FROM newsletter_subscribers WHERE email = ${EMAIL.toLowerCase()}`;
  assert.equal(row?.status, "pending", "stored lower-cased and pending");
  assert.ok(row?.confirm_sent_at);
  const mails = hits.slice(before).filter((h) => h.path === "/emails");
  assert.equal(mails.length, 1);
  assert.deepEqual(mails[0]!.body.to, [EMAIL.toLowerCase()]);
  assert.match(mails[0]!.body.html, new RegExp(`/subscribe\\?token=${await tokenOf()}`), "the letter links the confirm page with the token");
  assert.ok(mails[0]!.idempotencyKey?.startsWith("newsletter-confirm:"));

  // Asking again at once answers the same and mails nothing more.
  assert.deepEqual(await subscribe({ email: EMAIL.toUpperCase(), ...visitor }), { ok: true });
  assert.equal(hits.slice(before).filter((h) => h.path === "/emails").length, 1);
});

test("with no confirmed reader yet, the day is not claimed", async () => {
  const before = since();
  assert.deepEqual(await sendDailyIssue(TODAY), { status: "no_subscribers" });
  const rows = await sql`SELECT 1 FROM newsletter_sends WHERE report_key = ${TODAY}`;
  assert.equal(rows.length, 0, "a reader confirming later the same morning still gets the issue");
  assert.equal(since(), before, "the provider was not called");
});

test("confirming subscribes the contact in the segment, and confirming again re-subscribes", async () => {
  await assert.rejects(confirm("x".repeat(43)), (e: unknown) => e instanceof NewsletterRejected && e.status === 404);
  const token = await tokenOf();

  const first = since();
  assert.deepEqual(await confirm(token), { ok: true });
  const created = hits.slice(first).find((h) => h.method === "POST" && h.path === "/contacts");
  assert.deepEqual(created?.body, { email: EMAIL.toLowerCase(), unsubscribed: false, segments: [{ id: "seg-test" }] }, "a new contact is created in the segment");
  const [row] = await sql<{ status: string }[]>`SELECT status FROM newsletter_subscribers WHERE token = ${token}`;
  assert.equal(row?.status, "confirmed");

  // Later (say after an unsubscribe link): the contact is marked subscribed and kept in the segment.
  const again = since();
  assert.deepEqual(await confirm(token), { ok: true });
  const calls = hits.slice(again).map((h) => `${h.method} ${h.path}`);
  assert.deepEqual(calls, [`PATCH /contacts/${encodeURIComponent(EMAIL.toLowerCase())}`, `POST /contacts/${encodeURIComponent(EMAIL.toLowerCase())}/segments/seg-test`]);
  assert.deepEqual(hits[again]!.body, { unsubscribed: false });
});

test("today's report goes out as one broadcast, once", async () => {
  assert.deepEqual(await sendDailyIssue(addDays(TODAY, -1)), { status: "skipped", reason: "not today" }, "an earlier day is not mailed");

  const before = since();
  const sent = await sendDailyIssue(TODAY);
  assert.deepEqual(sent, { status: "sent", broadcastId: `bc-${T}` });
  const broadcast = hits.slice(before).find((h) => h.path === "/broadcasts")!;
  assert.equal(broadcast.body.segment_id, "seg-test");
  assert.equal(broadcast.body.send, true);
  assert.match(broadcast.body.subject, new RegExp(`头条 ${T}`));
  assert.match(broadcast.body.html, /\{\{\{RESEND_UNSUBSCRIBE_URL\}\}\}/, "every issue carries the unsubscribe link");
  assert.match(broadcast.body.html, /导语 &lt;b&gt;不&lt;\/b&gt;是 HTML。/, "report text is escaped");
  assert.match(broadcast.body.html, new RegExp(`/items/nl-${T}-1`));
  assert.match(broadcast.body.text, /【产品】/);
  for (const attr of broadcast.body.html.match(/style="[^"]*"/g) ?? []) assert.match(attr, /;"$|[a-z0-9)%]"$/, `style attribute cut short: ${attr.slice(0, 80)}`);
  assert.ok(!/style="[^"]*"[A-Za-z]/.test(broadcast.body.html), "no quote inside a style attribute ends it early");

  assert.deepEqual(await sendDailyIssue(TODAY), { status: "already" });
  assert.equal(hits.slice(before).filter((h) => h.path === "/broadcasts").length, 1, "the day is mailed once");
});

test("a broadcast in doubt is left unknown and not sent again", async () => {
  await sql`DELETE FROM newsletter_sends WHERE report_key = ${TODAY}`;
  broadcastAnswer = () => new Reply(503, { name: "application_error", message: "try later" });
  try {
    const outcome = await sendDailyIssue(TODAY);
    assert.equal(outcome.status, "unknown");
    const [row] = await sql<{ status: string }[]>`SELECT status FROM newsletter_sends WHERE report_key = ${TODAY}`;
    assert.equal(row?.status, "unknown");
    const before = since();
    assert.deepEqual(await sendDailyIssue(TODAY), { status: "already" });
    assert.equal(since(), before, "no second attempt");
  } finally {
    broadcastAnswer = () => ({ object: "broadcast", id: `bc-${T}` });
  }
});
