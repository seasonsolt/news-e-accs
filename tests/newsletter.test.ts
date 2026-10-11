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
import { newsletterOverview } from "@aihot/backend/admin/newsletter";
import { confirm, NewsletterRejected, subscribe } from "@aihot/backend/newsletter/subscribe";
import { loadReport } from "@aihot/backend/publication/reports";
import { localizePublication } from "@aihot/backend/publication/content-language";
import { publishArticle } from "@aihot/backend/publication/publish";
import { upsertMaterial } from "@aihot/backend/content/materials";
import { currentContent, saveTranslation } from "@aihot/backend/publication/content-language";
import { sendDailyIssue } from "@aihot/backend/newsletter/issue";
import { wechatArticle } from "@aihot/backend/newsletter/wechat";
import { wechatExport } from "@aihot/backend/admin/wechat";

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
process.env.RESEND_SEGMENT_ID_EN = "seg-en-test";
config.allowPrivateNetworkFetch = true;
config.newsletterEnabled = true;

const visitor = { ip: `198.51.100.${Math.floor(Math.random() * 200) + 1}`, userAgent: `newsletter-test-${T} Chrome` };
const since = () => hits.length;
const tokenOf = async () => (await sql<{ token: string }[]>`SELECT token FROM newsletter_subscribers WHERE email = ${EMAIL.toLowerCase()}`)[0]!.token;

before(async () => {
  await sql`DELETE FROM newsletter_sends WHERE report_key = ${TODAY}`;
  await sql`DELETE FROM newsletter_language_sends WHERE report_key = ${TODAY}`;
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
  await sql`DELETE FROM newsletter_language_sends WHERE report_key = ${TODAY}`;
  await sql`DELETE FROM reports WHERE kind = 'daily' AND key = ${TODAY}`;
  await sql`DELETE FROM newsletter_subscribers WHERE email LIKE ${`%${T.toLowerCase()}%`}`;
  await sql`DELETE FROM content_translations WHERE kind = 'report' AND content_id = ${`daily:${TODAY}`}`;
  await resend.close();
  await stopBoss();
  await closeDb();
});

test("a malformed address is refused, and nothing is mailed while the valve is closed", async () => {
  const before = since();
  await assert.rejects(subscribe({ email: "not-an-address", ...visitor }), (e: unknown) => e instanceof NewsletterRejected && e.status === 400);
  config.newsletterEnabled = false;
  try {
    await assert.rejects(subscribe({ email: EMAIL, language: "zh", ...visitor }), (e: unknown) => e instanceof NewsletterRejected && e.status === 503);
    assert.deepEqual(await sendDailyIssue(TODAY), { status: "disabled" });
  } finally {
    config.newsletterEnabled = true;
  }
  assert.equal(since(), before, "no call reached the provider");
});

test("signing up stores the address pending and mails one confirmation per cooldown", async () => {
  const before = since();
  assert.deepEqual(await subscribe({ email: EMAIL, language: "zh", ...visitor }), { ok: true });
  const [row] = await sql<{ status: string; confirm_sent_at: Date | null }[]>`SELECT status, confirm_sent_at FROM newsletter_subscribers WHERE email = ${EMAIL.toLowerCase()}`;
  const [preference] = await sql`SELECT language, language_preference_known FROM newsletter_subscribers WHERE email = ${EMAIL.toLowerCase()}`;
  assert.equal(preference!.language, "zh");
  assert.equal(preference!.language_preference_known, true);
  assert.equal(row?.status, "pending", "stored lower-cased and pending");
  assert.ok(row?.confirm_sent_at);
  const mails = hits.slice(before).filter((h) => h.path === "/emails");
  assert.equal(mails.length, 1);
  assert.deepEqual(mails[0]!.body.to, [EMAIL.toLowerCase()]);
  assert.match(mails[0]!.body.html, new RegExp(`/subscribe\\?token=${await tokenOf()}`), "the letter links the confirm page with the token");
  assert.ok(mails[0]!.idempotencyKey?.startsWith("newsletter-confirm:"));
  assert.match(mails[0]!.body.html, /拖到「主要」/, "the letter tells Gmail readers how to move it out of Promotions");
  assert.match(mails[0]!.body.text, /拖到「主要」/);

  // Asking again at once answers the same and mails nothing more.
  assert.deepEqual(await subscribe({ email: EMAIL.toUpperCase(), language: "en", ...visitor }), { ok: true });
  assert.equal(hits.slice(before).filter((h) => h.path === "/emails").length, 1);
});

test("with no confirmed reader yet, the day is not claimed", async () => {
  const before = since();
  assert.deepEqual(await sendDailyIssue(TODAY), { status: "no_subscribers" });
  const rows = await sql`SELECT 1 FROM newsletter_language_sends WHERE report_key = ${TODAY}`;
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

test("the admin newsletter overview summarizes and lists subscription records", async () => {
  const overview = await newsletterOverview(7);
  assert.equal(overview.days, 7);
  assert.equal(overview.daily.length, 7);
  assert.ok(overview.totals.total >= 1);
  assert.ok(overview.totals.confirmed >= 1);
  assert.ok(overview.rows.some((row) => row.email === EMAIL.toLowerCase() && row.status === "confirmed"));
  const today = overview.daily.find((row) => row.day === TODAY);
  assert.ok(today && today.signups >= 1 && today.confirmations >= 1);
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
  assert.match(broadcast.body.html, /拖到「主要」/, "every issue repeats the Primary-tab hint");
  for (const attr of broadcast.body.html.match(/style="[^"]*"/g) ?? []) assert.match(attr, /;"$|[a-z0-9)%]"$/, `style attribute cut short: ${attr.slice(0, 80)}`);
  assert.ok(!/style="[^"]*"[A-Za-z]/.test(broadcast.body.html), "no quote inside a style attribute ends it early");

  assert.deepEqual(await sendDailyIssue(TODAY), { status: "already" });
  assert.equal(hits.slice(before).filter((h) => h.path === "/broadcasts").length, 1, "the day is mailed once");
});

test("the 公众号 export is the Chinese edition as 「AI 早报」, without links, within the editor's limits", async () => {
  const exported = await wechatExport(TODAY);
  assert.equal(exported.status, "ready");
  const { article, minimum } = exported as Extract<typeof exported, { status: "ready" }>;
  assert.equal(minimum, 10);
  assert.ok(article.title.startsWith(`AI 早报｜头条 ${T}；产品 B 上线`), "the title packs the first headlines after the column name");
  assert.equal(article.digest, "导语 <b>不</b>是 HTML。", "the digest field is plain text");
  assert.ok(article.readMoreUrl.endsWith(`/zh/daily/${TODAY}`));
  assert.match(article.html, /导语 &lt;b&gt;不&lt;\/b&gt;是 HTML。/, "report text is escaped");
  assert.doesNotMatch(article.html, /<a\b|href=|class=|<style|<img/, "the editor drops links, classes, stylesheets and outside images");
  for (const attr of article.html.match(/style="[^"]*"/g) ?? []) assert.match(attr, /;"$|[a-z0-9)%]"$/, `style attribute cut short: ${attr.slice(0, 80)}`);
  assert.match(article.text, new RegExp(`【今日速览】\n01 头条 ${T}\n02 产品 B 上线`), "the at-a-glance list opens with the lead");
  assert.match(article.text, new RegExp(`01 头条 ${T}\n导语 <b>不</b>是 HTML。\n模型 · 来源：官方博客`), "the lead takes the first entry's place with its paragraph");
  assert.match(article.text, /02 产品 B 上线\n产品 · 来源：媒体/, "numbering runs across sections, each entry labelled with its own");
  assert.equal(article.html.split("摘要一").length - 1, 0, "the lead paragraph stands in for the lead entry's summary");

  const report = await localizePublication((await loadReport("daily", TODAY))!, "zh");
  const long = wechatArticle({ ...report, lead: { title: "长".repeat(80), leadParagraph: "段".repeat(200) } });
  assert.equal(Array.from(long.title).length, 64);
  assert.equal(Array.from(long.digest).length, 120);
  assert.ok(long.title.endsWith("…"));

  assert.deepEqual(await wechatExport("2000-01-01"), { date: "2000-01-01", status: "no_report" });
  await assert.rejects(wechatExport("10/11"), (error: { statusCode?: number }) => error.statusCode === 400);
});

test("a short daily is filled to ten from the window's best scored reports, one per event, none of a carried event", async () => {
  const source = `newsletter-wechat-${T}`;
  const stories: number[] = [];
  const [saved] = await sql<{ content: unknown; window_end: Date }[]>`SELECT content, window_end FROM reports WHERE kind = 'daily' AND key = ${TODAY}`;
  try {
    await sql`INSERT INTO sources(id,name,kind,tier,next_fetch_at) VALUES(${source},'补充信源','rss','T1','2100-01-01')`;
    const story = async () => {
      const [row] = await sql<{ id: number }[]>`INSERT INTO stories(public_id,title,summary,editorial_language) VALUES(${crypto.randomUUID()},'事件','事件摘要','zh') RETURNING id`;
      stories.push(row!.id);
      return row!.id;
    };
    const report = async (key: string, score: number, storyId?: number) => {
      const material = await upsertMaterial({ sourceId: source, url: `https://example.org/wechat-${T}-${key}`, title: key, language: 'zh', bodyText: '正文。', bodyStatus: 'ok', via: 'fetch', publishedAt: new Date(Date.now() - 3_600_000) });
      await sql`INSERT INTO analyses(article_id,input_revision,origin,editorial_language,relevance,category,title,summary,score,selected)
        VALUES(${material.articleId},1,'rule','zh','pass','ai-models',${`补充 ${key} ${T}`},${`补充摘要 ${key}`},${score},false)`;
      if (storyId) {
        const [fact] = await sql<{ id: number }[]>`INSERT INTO facts(public_id,story_id,title) VALUES(${`wechat-${T}-${key}`},${storyId},'事实') RETURNING id`;
        await sql`INSERT INTO fact_articles(fact_id,article_id,role) VALUES(${fact!.id},${material.articleId},'report')`;
      }
      await publishArticle(material.articleId, { releasedAt: new Date(Date.now() - 60_000) });
      return material.articleId;
    };
    const carriedStory = await story(), pairedStory = await story();
    const carried = await report("carried", 99, carriedStory);
    await report("same-event", 99, carriedStory);
    await report("top", 99.5);
    await report("pair-best", 99.4, pairedStory);
    await report("pair-other", 99.3, pairedStory);
    await report("low", 40);
    const content = { ...(saved!.content as Record<string, any>) };
    content.sections = [...content.sections, { label: "模型", items: [{ itemId: carried, title: "已报道的事件", summary: "日报里的条目", sourceName: "补充信源", sourceUrl: "https://example.org/carried" }] }];
    await sql`UPDATE reports SET content=${sql.json(content)},window_end=now(),revision=revision+1 WHERE kind='daily' AND key=${TODAY}`;

    const exported = await wechatExport(TODAY);
    assert.equal(exported.status, "ready");
    const { article } = exported as Extract<typeof exported, { status: "ready" }>;
    assert.equal(article.entries.daily, 3);
    assert.ok(article.entries.daily + article.entries.added <= 10, "no more than ten when enough qualify");
    const added = article.text.split("【今日速览】\n")[1]!.split("\n\n")[0]!.split("\n").slice(3);
    const ours = added.filter((line) => line.endsWith(` ${T}`)).map((line) => line.slice(3));
    assert.deepEqual(ours, [`补充 top ${T}`, `补充 pair-best ${T}`], "best scored first, one per event; the carried event, its other reports and those under the floor stay out");
    assert.equal(added.length, article.entries.added);
    assert.match(article.text, new RegExp(`补充 top ${T}\n补充摘要 top\n模型 · 来源：补充信源`), "an added report is labelled with its category");
  } finally {
    await sql`UPDATE reports SET content=${sql.json(saved!.content as any)},window_end=${saved!.window_end},revision=revision+1 WHERE kind='daily' AND key=${TODAY}`;
    await sql`DELETE FROM articles WHERE source_id=${source}`;
    for (const id of stories) { await sql`DELETE FROM facts WHERE story_id=${id}`; await sql`DELETE FROM stories WHERE id=${id}`; }
    await sql`DELETE FROM sources WHERE id=${source}`;
  }
});

test("a broadcast in doubt is left unknown and not sent again", async () => {
  await sql`DELETE FROM newsletter_sends WHERE report_key = ${TODAY}`;
  await sql`DELETE FROM newsletter_language_sends WHERE report_key = ${TODAY}`;
  broadcastAnswer = () => new Reply(503, { name: "application_error", message: "try later" });
  try {
    const outcome = await sendDailyIssue(TODAY);
    assert.equal(outcome.status, "unknown");
    const [row] = await sql<{ status: string }[]>`SELECT status FROM newsletter_language_sends WHERE report_key = ${TODAY}`;
    assert.equal(row?.status, "unknown");
    const before = since();
    assert.deepEqual(await sendDailyIssue(TODAY), { status: "already" });
    assert.equal(since(), before, "no second attempt");
  } finally {
    broadcastAnswer = () => ({ object: "broadcast", id: `bc-${T}` });
  }
});


test("new subscriptions default English, confirm into its distinct segment, and keep stored preference on resend", async () => {
  const email = `english-${T}@example.org`.toLowerCase();
  const visitorEn = { ip: "198.51.100.230", userAgent: `english-${T}` };
  const before = since();
  await subscribe({ email, ...visitorEn });
  const [row] = await sql`SELECT token, language, language_preference_known FROM newsletter_subscribers WHERE email = ${email}`;
  assert.equal(row!.language, "en");
  assert.equal(row!.language_preference_known, true);
  const mail = hits.slice(before).find(hit => hit.path === "/emails")!;
  assert.match(mail.body.html, /<html lang="en">/);
  assert.match(mail.body.subject, /Confirm your/);
  assert.match(mail.body.text, /Confirm your subscription/);
  await subscribe({ email, language: "zh", ...visitorEn });
  assert.equal(hits.slice(before).filter(hit => hit.path === "/emails").length, 1, "opposite-language retry shares the stored cooldown");
  const first = since();
  await confirm(row!.token);
  assert.deepEqual(hits.slice(first).find(hit => hit.path === "/contacts")!.body.segments, [{ id: "seg-en-test" }]);
  await confirm(row!.token);
  assert.equal((await sql`SELECT language FROM newsletter_subscribers WHERE email = ${email}`)[0]!.language, "en");
});

test("English reports wait without claiming, then send the stored complete edition once", async () => {
  const before = since();
  assert.deepEqual(await sendDailyIssue(TODAY, "en"), { status: "skipped", reason: "edition not ready" });
  assert.equal((await sql`SELECT 1 FROM newsletter_language_sends WHERE report_key = ${TODAY} AND language = 'en'`).length, 0);
  assert.equal(since(), before);
  const entry = await currentContent("report", `daily:${TODAY}`);
  assert.ok(entry);
  entry.translations = Object.fromEntries(entry.segments.map(segment => [segment.key,
    segment.key.endsWith("label") ? "Models and products" : segment.key.endsWith("title") ? "A new AI release" : "Today's important developments."]));
  await saveTranslation(entry, "offline-agent", "newsletter-test", [], true);
  const start = since();
  assert.equal((await sendDailyIssue(TODAY, "en")).status, "sent");
  const broadcast = hits.slice(start).find(hit => hit.path === "/broadcasts")!;
  assert.equal(broadcast.body.segment_id, "seg-en-test");
  assert.match(broadcast.body.html, /<html lang="en">/);
  assert.match(broadcast.body.subject, /Daily briefing/);
  assert.match(broadcast.body.text, /Today's important developments/);
  assert.match(broadcast.body.html, /Unsubscribe/);
  assert.doesNotMatch(broadcast.body.text, /头条|导语|模型|产品/);
  assert.deepEqual(await sendDailyIssue(TODAY, "en"), { status: "already" });
  assert.equal(hits.slice(start).filter(hit => hit.path === "/broadcasts").length, 1);
});

test("legacy wildcard claims block either language, and missing/equal English segments fail closed", async () => {
  await sql`INSERT INTO newsletter_sends (report_key, status) VALUES (${TODAY}, 'unknown')`;
  const before = since();
  assert.deepEqual(await sendDailyIssue(TODAY, "en"), { status: "already" });
  assert.deepEqual(await sendDailyIssue(TODAY, "zh"), { status: "already" });
  delete process.env.RESEND_SEGMENT_ID_EN;
  assert.deepEqual(await sendDailyIssue(TODAY, "en"), { status: "not_configured" });
  process.env.RESEND_SEGMENT_ID_EN = "seg-test";
  assert.deepEqual(await sendDailyIssue(TODAY, "en"), { status: "not_configured" });
  process.env.RESEND_SEGMENT_ID_EN = "seg-en-test";
  assert.equal(since(), before);
});


test("legacy subscriber language is retained without inventing a known preference", async () => {
  const email = `legacy-${T}@example.org`.toLowerCase();
  const token = 'l'.repeat(43);
  await sql`INSERT INTO newsletter_subscribers (email, token, language, language_preference_known)
    VALUES (${email}, ${token}, 'zh', false)`;
  const start = since();
  await subscribe({ email, language: "en", ip: "198.51.100.231", userAgent: `legacy-${T}` });
  const [row] = await sql`SELECT language, language_preference_known FROM newsletter_subscribers WHERE email = ${email}`;
  assert.equal(row!.language, "zh");
  assert.equal(row!.language_preference_known, false);
  const mail = hits.slice(start).find(hit => hit.path === "/emails")!;
  assert.match(mail.body.html, /<html lang="zh-CN">/);
  assert.match(mail.body.html, /\/zh\/subscribe\?token=/);
});


test("native English report sends immediately and Chinese waits for its matching edition", async () => {
  await sql`DELETE FROM newsletter_sends WHERE report_key=${TODAY}`;
  await sql`DELETE FROM newsletter_language_sends WHERE report_key=${TODAY}`;
  await sql`DELETE FROM content_translations WHERE kind='report' AND content_id=${`daily:${TODAY}`}`;
  const content = { title: 'Native English daily', reportTimeZone: 'Asia/Shanghai', lead: { title: 'Native release', leadParagraph: 'A native English briefing.' },
    sections: [{ label: 'Models', items: [{ itemId: `native-nl-${T}`, title: 'Native model release', summary: 'Original English summary.', sourceName: 'Fixture', sourceUrl: 'https://example.org/native-nl' }] }], flashes: [], highlights: [], metrics: {} };
  await sql`UPDATE reports SET editorial_language='en',content=${sql.json(content)},revision=revision+1 WHERE kind='daily' AND key=${TODAY}`;
  const start = since();
  assert.equal((await sendDailyIssue(TODAY, 'en')).status, 'sent');
  assert.match(hits.slice(start).find(hit => hit.path === '/broadcasts')!.body.text, /Native model release/);
  assert.deepEqual(await sendDailyIssue(TODAY, 'zh'), { status: 'skipped', reason: 'edition not ready' });
  assert.deepEqual(await wechatExport(TODAY), { date: TODAY, status: 'not_ready', reason: 'edition not ready' }, 'the 公众号 export waits for the Chinese edition too');
  assert.equal((await sql`SELECT 1 FROM newsletter_language_sends WHERE report_key=${TODAY} AND language='zh'`).length, 0);
  const entry = await currentContent('report', `daily:${TODAY}`, 'zh'); assert.ok(entry);
  await saveTranslation({ ...entry, translations: Object.fromEntries(entry.segments.map(segment => [segment.key, '匹配的中文日报'])) }, 'offline-agent', 'integration-fixture', [], true);
  assert.equal((await sendDailyIssue(TODAY, 'zh')).status, 'sent');
  assert.match(hits.at(-1)!.body.text, /匹配的中文日报/);
  assert.doesNotMatch(hits.at(-1)!.body.text, /Native model release/);
  assert.deepEqual(await sendDailyIssue(TODAY, 'en'), { status: 'already' });
});


test('grouped-story report snapshot citations send in both languages without comparing current story prose', async () => {
  const source = `newsletter-grouped-${T}`, publicId = crypto.randomUUID();
  let storyId: number | undefined;
  try {
    await sql`INSERT INTO sources(id,name,kind,tier,next_fetch_at) VALUES(${source},'Grouped fixture','rss','T1','2100-01-01')`;
    const material = await upsertMaterial({ sourceId: source, url: `https://example.org/grouped-mail-${T}`, title: 'Source release', language: 'en', bodyText: 'A grouped article.', bodyStatus: 'ok', via: 'fetch', publishedAt: new Date() });
    await sql`INSERT INTO analyses(article_id,input_revision,origin,editorial_language,relevance,category,title,summary,score,selected)
      VALUES(${material.articleId},1,'rule','en','pass','ai-models','Current English article title','Current English article summary.',90,true)`;
    const [story] = await sql<{id:number}[]>`INSERT INTO stories(public_id,title,summary,editorial_language) VALUES(${publicId},'当前中文事件标题','当前中文事件摘要','zh') RETURNING id`;
    storyId = story!.id;
    const [fact] = await sql<{id:number}[]>`INSERT INTO facts(public_id,story_id,title) VALUES(${`grouped-mail-fact-${T}`},${storyId},'中文事实') RETURNING id`;
    await sql`INSERT INTO fact_articles(fact_id,article_id,role) VALUES(${fact!.id},${material.articleId},'report')`;
    await publishArticle(material.articleId,{releasedAt:new Date(Date.now()-60000)});
    await sql`DELETE FROM newsletter_sends WHERE report_key=${TODAY}`;
    await sql`DELETE FROM newsletter_language_sends WHERE report_key=${TODAY}`;
    await sql`DELETE FROM content_translations WHERE content_id=${`daily:${TODAY}`}`;
    const citation = { itemId:material.articleId, storyPublicId:publicId, title:'Edited snapshot citation title', summary:'Edited snapshot citation summary.', sourceName:'Grouped fixture',sourceUrl:'https://example.org/grouped-mail' };
    const content = { title:'Grouped English daily',lead:{title:'Grouped releases',leadParagraph:'A complete English report.'},sections:[{label:'Models',items:[citation]}],flashes:[{...citation,title:'Snapshot flash title'}],highlights:[material.articleId],metrics:{} };
    await sql`UPDATE reports SET editorial_language='en',content=${sql.json(content)},revision=revision+1 WHERE kind='daily' AND key=${TODAY}`;
    const report = await loadReport('daily',TODAY); assert.ok(report);
    const native = await localizePublication(report,'en');
    assert.equal(native.sections[0]!.items[0]!.title,citation.title);
    assert.equal((native.sections[0]!.items[0] as any).contentLanguage.language,'en');
    assert.equal((native.flashes[0] as any).contentLanguage.language,'en');
    assert.equal((await sendDailyIssue(TODAY,'en')).status,'sent');
    assert.match(hits.at(-1)!.body.text,/Edited snapshot citation title/);
    assert.doesNotMatch(hits.at(-1)!.body.text,/当前中文|Current English article title/);
    assert.deepEqual(await sendDailyIssue(TODAY,'zh'),{status:'skipped',reason:'edition not ready'});
    const entry = await currentContent('report',`daily:${TODAY}`,'zh'); assert.ok(entry);
    await saveTranslation({...entry,translations:Object.fromEntries(entry.segments.map(segment=>[segment.key,'已验证的中文快照引用']))},'offline-agent','fixture',[],true);
    const chinese = await localizePublication(report,'zh');
    assert.equal((chinese.sections[0]!.items[0] as any).contentLanguage.language,'zh');
    assert.equal((await sendDailyIssue(TODAY,'zh')).status,'sent');
    assert.match(hits.at(-1)!.body.text,/已验证的中文快照引用/);
    assert.doesNotMatch(hits.at(-1)!.body.text,/Edited snapshot citation title|当前中文事件/);
    await sql`UPDATE publications SET visibility='withdrawn' WHERE article_id=${material.articleId}`;
    const withdrawn = await loadReport('daily',TODAY); assert.ok(withdrawn);
    assert.equal(withdrawn.sections[0]!.items[0]!.available,false);
    assert.equal(withdrawn.sections[0]!.items[0]!.summary,null);
  } finally {
    await sql`DELETE FROM articles WHERE source_id=${source}`;
    if(storyId) { await sql`DELETE FROM facts WHERE story_id=${storyId}`; await sql`DELETE FROM stories WHERE id=${storyId}`; }
    await sql`DELETE FROM sources WHERE id=${source}`;
  }
});
