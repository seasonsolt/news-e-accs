// The newsletter: signing up answers alike for known and unknown addresses and mails one confirmation
// per cooldown; confirming makes the address a subscribed contact in the segment, also after an
// unsubscribe; today's daily report is mailed as one broadcast, at most once a day, and a send in doubt
// is never repeated. Resend is a local stub; the NEWSLETTER_ENABLED valve is opened only here.
import { pointModels, Reply, stub, tag } from "./setup.ts";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { beijingDate, addDays } from "@aihot/contracts/time";
import { config } from "@aihot/backend/config";
import { closeDb, sql } from "@aihot/backend/db";
import { stopBoss } from "@aihot/backend/jobs/queue";
import { newsletterOverview } from "@aihot/backend/admin/newsletter";
import { confirm, NewsletterRejected, subscribe, subscribeLanguage } from "@aihot/backend/newsletter/subscribe";
import { loadReport } from "@aihot/backend/publication/reports";
import { localizePublication } from "@aihot/backend/publication/content-language";
import { publishArticle } from "@aihot/backend/publication/publish";
import { upsertMaterial } from "@aihot/backend/content/materials";
import { currentContent, saveTranslation } from "@aihot/backend/publication/content-language";
import { sendDailyIssue } from "@aihot/backend/newsletter/issue";
import { wechatArticle } from "@aihot/backend/newsletter/wechat";
import {
  findWechatIllustrations, pushWechatDraft, removeWechatIllustration, requestWechatIllustration, saveWechatEdits, uploadWechatIllustration, wechatCoverPng, wechatExport,
  wechatIllustrationJpeg, wechatIssues,
} from "@aihot/backend/admin/wechat";
import { drawWechatIllustration, findWechatIllustration } from "@aihot/backend/newsletter/wechat-illustrations";
import { resetWechatToken } from "@aihot/backend/providers/wechat-mp";
import sharp from "sharp";
import http from "node:http";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { commentWechatColumn } from "@aihot/backend/newsletter/wechat-comments";
import { topicWechatColumn, wechatTopics } from "@aihot/backend/newsletter/wechat-topics";

const T = tag();
const EMAIL = `Reader.${T}@Example.org`;
const TODAY = beijingDate(Date.now());

interface Hit { method: string; path: string; body: any; idempotencyKey: string | undefined }
interface StubContact { unsubscribed: boolean; segments: Set<string> }
const hits: Hit[] = [];
/** Contacts the stub knows, and what the next broadcast answers. */
const contacts = new Map<string, StubContact>();
let broadcastAnswer: () => unknown = () => ({ object: "broadcast", id: `bc-${T}` });
/** Segment id whose removal answers 500, so a move can be rolled back. */
let rejectSegmentDelete: string | null = null;

const resend = await stub((_n, req) => {
  const path = new URL(req.url, "http://stub").pathname;
  const body = req.body ? JSON.parse(req.body) : null;
  hits.push({ method: req.method, path, body, idempotencyKey: req.headers["idempotency-key"] as string | undefined });
  if (req.method === "POST" && path === "/emails") return { id: `em-${hits.length}` };
  const segment = /^\/contacts\/([^/]+)\/segments\/([^/]+)$/.exec(path);
  if (segment) {
    const email = decodeURIComponent(segment[1]!).toLowerCase();
    const id = decodeURIComponent(segment[2]!);
    const contact = contacts.get(email);
    if (req.method === "POST") {
      if (!contact) return new Reply(404, { name: "not_found", message: "Contact not found" });
      if (contact.segments.has(id)) return new Reply(409, { name: "conflict", message: "Contact already in segment" });
      contact.segments.add(id);
      return { id };
    }
    if (req.method === "DELETE") {
      if (rejectSegmentDelete === id) return new Reply(500, { name: "application_error", message: "try later" });
      if (!contact?.segments.has(id)) return new Reply(404, { name: "not_found", message: "Contact not in segment" });
      contact.segments.delete(id);
      return { id: "removed" };
    }
  }
  const contactPath = /^\/contacts\/([^/]+)$/.exec(path);
  if (contactPath) {
    const email = decodeURIComponent(contactPath[1]!).toLowerCase();
    const contact = contacts.get(email);
    if (req.method === "GET") return contact ? { object: "contact", id: "c1", email, unsubscribed: contact.unsubscribed } : new Reply(404, { name: "not_found", message: "Contact not found" });
    if (req.method === "PATCH") {
      if (!contact) return new Reply(404, { name: "not_found", message: "Contact not found" });
      if (body?.unsubscribed === false) contact.unsubscribed = false;
      return { object: "contact", id: "c1" };
    }
  }
  if (req.method === "POST" && path === "/contacts") {
    contacts.set(String(body.email).toLowerCase(), {
      unsubscribed: body.unsubscribed === true,
      segments: new Set((body.segments ?? []).map((item: { id: string }) => item.id)),
    });
    return { object: "contact", id: "c1" };
  }
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
  await sql`DELETE FROM wechat_comments WHERE report_key = ${TODAY}`;
  await sql`DELETE FROM wechat_issues WHERE report_key = ${TODAY}`;
  await sql`DELETE FROM wechat_illustrations WHERE report_key = ${TODAY}`;
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
  assert.match(mails[0]!.body.subject, /确认订阅/);
  assert.match(mails[0]!.body.html, /<html lang="zh-CN">/);
  assert.match(mails[0]!.body.html, /确认订阅/);
  assert.match(mails[0]!.body.html, new RegExp(`/zh/subscribe\\?token=${await tokenOf()}`), "the Chinese letter opens the Chinese confirm page");
  assert.ok(mails[0]!.idempotencyKey?.startsWith("newsletter-confirm:"));
  assert.match(mails[0]!.body.html, /拖到「主要」/, "the letter tells Gmail readers how to move it out of Promotions");
  assert.match(mails[0]!.body.text, /拖到「主要」/);
  assert.equal(hits.slice(before).some((h) => h.path.startsWith("/contacts")), false, "signing up does not touch the list");

  // Asking again in the same language answers the same and mails nothing more.
  assert.deepEqual(await subscribe({ email: EMAIL.toUpperCase(), language: "zh", ...visitor }), { ok: true });
  assert.equal(hits.slice(before).filter((h) => h.path === "/emails").length, 1);
  assert.equal((await sql`SELECT language, pending_language FROM newsletter_subscribers WHERE email = ${EMAIL.toLowerCase()}`)[0]!.language, "zh");
  assert.equal((await sql`SELECT pending_language FROM newsletter_subscribers WHERE email = ${EMAIL.toLowerCase()}`)[0]!.pending_language, null);
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

  const encoded = encodeURIComponent(EMAIL.toLowerCase());
  const first = since();
  assert.deepEqual(await confirm(token), { ok: true });
  const created = hits.slice(first).find((h) => h.method === "POST" && h.path === "/contacts");
  assert.deepEqual(created?.body, { email: EMAIL.toLowerCase(), unsubscribed: false, segments: [{ id: "seg-test" }] }, "a new contact is created in the segment");
  assert.deepEqual(hits.slice(first).map((h) => `${h.method} ${h.path}`), [
    `GET /contacts/${encoded}`,
    "POST /contacts",
    `DELETE /contacts/${encoded}/segments/seg-en-test`,
    `PATCH /contacts/${encoded}`,
  ], "unsubscribe is cleared only after the other edition is left");
  const [row] = await sql<{ status: string }[]>`SELECT status FROM newsletter_subscribers WHERE token = ${token}`;
  assert.equal(row?.status, "confirmed");

  // Later (say after an unsubscribe link): the contact is marked subscribed and kept in the segment.
  const again = since();
  assert.deepEqual(await confirm(token), { ok: true });
  const calls = hits.slice(again).map((h) => `${h.method} ${h.path}`);
  assert.deepEqual(calls, [
    `GET /contacts/${encoded}`,
    `POST /contacts/${encoded}/segments/seg-test`,
    `DELETE /contacts/${encoded}/segments/seg-en-test`,
    `PATCH /contacts/${encoded}`,
  ]);
  assert.deepEqual(hits.slice(again).find((h) => h.method === "PATCH")!.body, { unsubscribed: false });
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
  assert.match(broadcast.body.html, new RegExp(`/zh/daily/${TODAY}`));
  assert.match(broadcast.body.html, new RegExp(`/zh/items/nl-${T}-1`));
  assert.match(broadcast.body.html, /退订/);
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
  assert.equal(Array.from(long.title).length, 32, "the draft API takes titles of at most 32 characters");
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
    assert.equal(article.counts.daily, 3);
    assert.ok(article.counts.daily + article.counts.added <= 10, "no more than ten when enough qualify");
    const added = article.text.split("【今日速览】\n")[1]!.split("\n\n")[0]!.split("\n").slice(3);
    const ours = added.filter((line) => line.endsWith(` ${T}`)).map((line) => line.slice(3));
    assert.deepEqual(ours, [`补充 top ${T}`, `补充 pair-best ${T}`], "best scored first, one per event; the carried event, its other reports and those under the floor stay out");
    assert.equal(added.length, article.counts.added);
    assert.match(article.text, new RegExp(`补充 top ${T}\n补充摘要 top\n模型 · 来源：补充信源`), "an added report is labelled with its category");
  } finally {
    await sql`UPDATE reports SET content=${sql.json(saved!.content as any)},window_end=${saved!.window_end},revision=revision+1 WHERE kind='daily' AND key=${TODAY}`;
    await sql`DELETE FROM articles WHERE source_id=${source}`;
    for (const id of stories) { await sql`DELETE FROM facts WHERE story_id=${id}`; await sql`DELETE FROM stories WHERE id=${id}`; }
    await sql`DELETE FROM sources WHERE id=${source}`;
  }
});

test("the worker comments the column's entries in the editor's voice, keeping only comments grounded in the day's entries, and pays once per question", async () => {
  await sql`DELETE FROM wechat_comments WHERE report_key = ${TODAY}`;
  // An earlier issue whose comment the editor rewrote: the model is shown it as the voice to write in.
  const earlier = "1999-01-01";
  await sql`INSERT INTO wechat_issues (report_key, edits) VALUES (${earlier}, ${sql.json({ entries: { [`old-${T}`]: { title: "旧条目", comment: "毫无性价比，想不出买的理由" } } })})
    ON CONFLICT (report_key) DO UPDATE SET edits = EXCLUDED.edits`;
  const asked: string[] = [];
  const systems: string[] = [];
  const model = await stub((_hit, req) => {
    const messages = (JSON.parse(req.body) as { messages: Array<{ role: string; content: string }> }).messages;
    const user = messages.find((m) => m.role === "user")!.content;
    systems.push(messages.find((m) => m.role === "system")!.content);
    asked.push(user);
    const count = user.match(/^\d+\. /gm)!.length;
    const comments = Array.from({ length: count }, (_, k) => ({
      n: k + 1,
      comment: k === 0 ? "Nova-9 会把成本打到 99% 以下" : k === 1 ? "上线只是起点，落地速度比发布会更重要" : "这一步太关键了！",
    }));
    return { id: `wc-${T}`, choices: [{ message: { content: JSON.stringify({ comments }) } }], usage: { prompt_tokens: 1, completion_tokens: 1 } };
  });
  pointModels(model.url, ["deepseek-flash"]);
  try {
    const first = await commentWechatColumn(TODAY);
    assert.equal(first.status, "done");
    assert.equal(asked.length, 1);
    assert.match(asked[0]!, new RegExp(`^1\\. 头条 ${T}\n导语`), "the lead is commented as the column prints it");
    const exported = await wechatExport(TODAY);
    const { article } = exported as Extract<typeof exported, { status: "ready" }>;
    assert.equal(first.written, 1);
    assert.equal(article.counts.commented, 1);
    assert.doesNotMatch(article.text, /Nova-9|太关键/, "a name or figure its entry lacks, or shouting, is not printed");
    const second = article.text.split("\n\n").find((block) => block.startsWith("02 产品 B 上线\n"));
    assert.equal(second, "02 产品 B 上线\ne/acc 点评：上线只是起点，落地速度比发布会更重要\n产品 · 来源：媒体", "the comment follows its entry");
    assert.match(article.html, /e\/acc 点评<\/span>　上线只是起点/);

    assert.deepEqual(await commentWechatColumn(TODAY), { status: "done", written: 0 });
    assert.equal(asked.length, 2);
    assert.equal(asked[1], `1. 头条 ${T}\n导语 <b>不</b>是 HTML。`, "an entry whose comment was not kept is asked once more on its own");
    assert.deepEqual(await commentWechatColumn(TODAY), { status: "done", written: 0 });
    assert.equal(asked.length, 2, "the same question is not paid for twice");
    assert.equal((await commentWechatColumn("2000-01-01")).status, "no_report");
    assert.match(systems[0]!, /「旧条目」\n  点评：毫无性价比，想不出买的理由/, "the editor's rewrites are the examples");
  } finally {
    await sql`DELETE FROM wechat_issues WHERE report_key = ${earlier}`;
    await model.close();
  }
});

test("the worker groups the column under judged topics once and writes what a follow-up adds; the editor renames and moves them", async () => {
  const source = `wechat-topics-${T}`;
  const yesterday = addDays(TODAY, -1);
  const [report] = await sql<{ content: unknown }[]>`SELECT content FROM reports WHERE kind = 'daily' AND key = ${TODAY}`;
  const asked: string[] = [];
  const systems: string[] = [];
  const model = await stub((_hit, req) => {
    const messages = (JSON.parse(req.body) as { messages: Array<{ role: string; content: string }> }).messages;
    const user = messages.find((m) => m.role === "user")!.content;
    systems.push(messages.find((m) => m.role === "system")!.content);
    asked.push(user);
    const n = (title: string) => Number(new RegExp(`^(\\d+)\\. ${title}`, "m").exec(user)![1]);
    const answer = {
      topics: [
        { title: "头条和产品一起看", entries: [n(`头条 ${T}`), n("产品 B 上线")] },
        { title: "只有一条成不了主题", entries: [n("新版本发布")] },
        { title: "Nova-9 改写一切", entries: [n("新版本发布"), n(`头条 ${T}`)] },
      ],
      followups: [{ n: n("新版本发布"), text: "这次正式上线，之前只是预告" }, { n: n("产品 B 上线"), text: "不是跟进的条目不写" }],
    };
    return { id: `wt-${T}`, choices: [{ message: { content: JSON.stringify(answer) } }], usage: { prompt_tokens: 1, completion_tokens: 1 } };
  });
  pointModels(model.url, ["deepseek-flash"]);
  try {
    await sql`INSERT INTO sources (id, name, kind, tier, next_fetch_at) VALUES (${source}, 'Topics fixture', 'rss', 'T1', '2100-01-01')`;
    const [before, after] = await Promise.all(["preview", "release"].map((slug) => upsertMaterial({
      sourceId: source, url: `https://example.org/${slug}-${T}`, title: slug, language: "zh", bodyText: "正文。", bodyStatus: "ok", via: "fetch", publishedAt: new Date(),
    })));
    const [story] = await sql<{ id: number }[]>`INSERT INTO stories (public_id, title, summary, editorial_language) VALUES (${crypto.randomUUID()}, '新版本', '新版本', 'zh') RETURNING id`;
    for (const m of [before!, after!]) {
      await sql`INSERT INTO analyses (article_id, input_revision, origin, editorial_language, relevance, category, title, summary, score, selected)
        VALUES (${m.articleId}, 1, 'rule', 'zh', 'pass', 'ai-models', 'x', 'x', 90, true)`;
      await publishArticle(m.articleId, { releasedAt: new Date(Date.now() - 60_000) });
    }
    await sql`UPDATE publications SET story_id = ${story!.id} WHERE article_id IN (${before!.articleId}, ${after!.articleId})`;
    const cite = (itemId: string, title: string, extra = {}) => ({ itemId, title, summary: "摘要", sourceName: "Topics fixture", sourceUrl: "https://example.org/t", ...extra });
    await sql`INSERT INTO reports (kind, key, window_start, window_end, content, generated_at)
      VALUES ('daily', ${yesterday}, now() - interval '2 day', now() - interval '1 day',
        ${sql.json({ date: yesterday, lead: null, highlights: [], sections: [{ label: "模型", items: [cite(before!.articleId, "新版本预告")] }], flashes: [], metrics: {} })}, now())
      ON CONFLICT (kind, key) DO NOTHING`;
    const content = report!.content as { sections: Array<{ label: string; items: unknown[] }> };
    const sections = [...content.sections, { label: "模型", items: [cite(after!.articleId, "新版本发布", { followUp: yesterday })] }];
    await sql`UPDATE reports SET content = ${sql.json({ ...content, sections } as never)} WHERE kind = 'daily' AND key = ${TODAY}`;

    // An earlier issue whose heading the editor rewrote: the model is shown the pair.
    await sql`INSERT INTO wechat_topics (report_key, topics, followups, model) VALUES ('1999-01-02', ${sql.json([{ title: "融资规模跨越多个量级", entries: [] }])}, '{}', 'm')`;
    await sql`INSERT INTO wechat_issues (report_key, edits) VALUES ('1999-01-02', ${sql.json({ topicTitles: { 0: "钱还在往 AI 里涌" } })})`;
    assert.deepEqual(await topicWechatColumn(TODAY), { status: "done", topics: 1 }, "a one-entry topic and one naming what its entries do not are dropped");
    assert.match(systems[0]!, /- 融资规模跨越多个量级 → 钱还在往 AI 里涌/, "the editor's headings are the examples");
    assert.match(asked[0]!, /新版本发布\n（跟进：之前的早报报道过「新版本预告」）/, "the model is told what the earlier daily said");
    assert.deepEqual(await topicWechatColumn(TODAY), { status: "done" });
    assert.equal(asked.length, 1, "grouped once a day");
    const stored = await wechatTopics(TODAY);
    assert.deepEqual(Object.values(stored!.followups), ["这次正式上线，之前只是预告"], "only a follow-up gets a line");

    const grouped = await ready();
    assert.deepEqual(grouped.article.topics, [{ title: "头条和产品一起看", generated: "头条和产品一起看" }]);
    const text = grouped.article.text.split("【今日速览】")[1]!;
    assert.match(text, /【头条和产品一起看】\n\n01 头条[^\n]*\n[\s\S]*\n02 产品 B 上线[\s\S]*【其他消息】/, "a topic's entries under its heading, the others after");
    assert.match(text, new RegExp(`跟进 ${Number(yesterday.slice(5, 7))} 月 ${Number(yesterday.slice(8))} 日早报：这次正式上线，之前只是预告`));
    assert.match(grouped.article.html, /border-left:4px solid[^>]*>头条和产品一起看</);

    const second = grouped.article.entries.find((e) => e.title === "产品 B 上线")!;
    await saveWechatEdits(TODAY, { revision: grouped.revision, edits: { topicTitles: { 0: "改过的主题" }, topicOf: { [second.key]: -1 } } }, "editor@example.org");
    const moved = await ready();
    assert.equal(moved.article.topics[0]!.title, "改过的主题");
    assert.equal(moved.article.entries.find((e) => e.key === second.key)!.topic, null, "the editor took the entry out of its topic");
    assert.match(moved.article.text, /【改过的主题】\n\n01 头条[^\n]*\n[\s\S]*【其他消息】\n\n02/);
  } finally {
    await model.close();
    await sql`UPDATE reports SET content = ${sql.json(report!.content as never)} WHERE kind = 'daily' AND key = ${TODAY}`;
    await sql`DELETE FROM reports WHERE kind = 'daily' AND key = ${yesterday}`;
    await sql`DELETE FROM wechat_topics WHERE report_key IN (${TODAY}, '1999-01-02')`;
    await sql`DELETE FROM wechat_issues WHERE report_key IN (${TODAY}, '1999-01-02')`;
  }
});

test("the workbench's edits reorder, hide and rewrite entries over the generated column, one revision at a time", async () => {
  await sql`DELETE FROM wechat_issues WHERE report_key = ${TODAY}`;
  const ready = async () => {
    const exported = await wechatExport(TODAY);
    assert.equal(exported.status, "ready");
    return exported as Extract<typeof exported, { status: "ready" }>;
  };
  const generated = await ready();
  assert.equal(generated.revision, 0);
  const [lead, second] = generated.article.entries as [typeof generated.article.entries[0], typeof generated.article.entries[0]];
  assert.equal(lead.key, `nl-${T}-1`);

  const saved = await saveWechatEdits(TODAY, {
    revision: 0,
    edits: { title: "AI 早报｜改过的标题", theme: "ink", order: [second.key, lead.key], hidden: [], entries: { [lead.key]: { title: "改写的头条", comment: "编辑写的点评" }, [second.key]: { comment: "" } }, stray: 1 },
  }, "editor@example.org");
  assert.deepEqual(saved, { revision: 1 });
  const edited = await ready();
  assert.equal(edited.revision, 1);
  assert.equal(edited.article.title, "AI 早报｜改过的标题");
  assert.equal(edited.article.theme, "ink");
  assert.deepEqual(edited.article.entries.slice(0, 2).map((e) => e.key), [second.key, lead.key], "the editor's order");
  assert.match(edited.article.text, /【今日速览】\n01 产品 B 上线\n02 改写的头条/);
  assert.match(edited.article.text, /02 改写的头条\n导语 <b>不<\/b>是 HTML。\ne\/acc 点评：编辑写的点评/);
  assert.doesNotMatch(edited.article.text, /上线只是起点/, "an emptied comment removes the generated one");
  assert.equal(edited.article.entries[1]!.generated.title, `头条 ${T}`, "the generated text stays at hand");
  assert.match(edited.article.html, /color:#1f2328/, "the theme's colours");

  await assert.rejects(saveWechatEdits(TODAY, { revision: 0, edits: {} }, "other@example.org"), (e: { code?: string }) => e.code === "conflict", "a stale window cannot overwrite");
  await assert.rejects(saveWechatEdits(TODAY, { revision: 1, edits: { theme: "neon" } }, "editor@example.org"), (e: { statusCode?: number }) => e.statusCode === 400);
  assert.deepEqual(await saveWechatEdits(TODAY, { revision: 1, edits: { hidden: [second.key] } }, "editor@example.org"), { revision: 2 });
  const hidden = await ready();
  assert.ok(!hidden.article.text.includes("产品 B 上线"), "a hidden entry is not printed");
  assert.ok(hidden.article.entries.some((e) => e.key === second.key && e.hidden), "but the workbench still lists it");
  assert.equal(hidden.article.counts.daily, 1);

  const cover = await wechatCoverPng(TODAY);
  assert.ok(cover);
  assert.deepEqual(await sharp(cover).metadata().then((m) => [m.format, m.width, m.height]), ["png", 1175, 500], "a 2.35:1 cover");
  assert.notEqual(edited.coverUrl, generated.coverUrl, "the cover's address follows its content (theme, first entry)");
  assert.equal(await wechatCoverPng("2000-01-01"), null);

  const row = (await wechatIssues()).rows.find((r) => r.date === TODAY);
  assert.ok(row?.edited && row.updatedBy === "editor@example.org");
  const [logged] = await sql`SELECT action FROM audit_log WHERE subject = ${`wechat:${TODAY}`} ORDER BY id DESC LIMIT 1`;
  assert.equal(logged!.action, "wechat.edit");
});

test("pushing puts the issue into the 公众号's draft box, then updates that draft, and starts over once it is gone", async () => {
  const calls: Array<{ path: string; body: string }> = [];
  let drafts = 0;
  let gone = false;
  let refuse = false;
  const mp = await stub((_hit, req) => {
    const path = req.url.split("?")[0]!;
    calls.push({ path, body: req.body });
    if (refuse) return { errcode: 40164, errmsg: "invalid ip" };
    if (path === "/cgi-bin/stable_token") return { access_token: "tok", expires_in: 7200 };
    if (path === "/cgi-bin/material/add_material") return { media_id: "cover-1", url: "http://mmbiz/x" };
    if (path === "/cgi-bin/draft/add") return { media_id: `draft-${++drafts}` };
    if (path === "/cgi-bin/draft/update") return gone ? { errcode: 40007, errmsg: "invalid media_id" } : { errcode: 0, errmsg: "ok" };
    return new Reply(404, {});
  });
  await assert.rejects(pushWechatDraft(TODAY, "editor@example.org"), (e: { code?: string }) => e.code === "conflict", "the valve is closed by default");
  config.wechatDraftEnabled = true;
  await assert.rejects(pushWechatDraft(TODAY, "editor@example.org"), /WECHAT_APPID/, "and without the account's credentials");
  process.env.WECHAT_APPID = "wx-test";
  process.env.WECHAT_APPSECRET = "secret-test";
  process.env.WECHAT_API_BASE_URL = mp.url;
  resetWechatToken();
  try {
    const exported = await wechatExport(TODAY);
    assert.ok(exported.status === "ready" && exported.push.enabled && exported.push.configured && exported.push.pushedAt === null);

    assert.deepEqual(await pushWechatDraft(TODAY, "editor@example.org"), { action: "created", revision: exported.revision });
    assert.deepEqual(calls.map((c) => c.path), ["/cgi-bin/stable_token", "/cgi-bin/material/add_material", "/cgi-bin/draft/add"]);
    assert.match(calls[1]!.body, /Content-Type: image\/png/);
    const [article] = JSON.parse(calls[2]!.body).articles;
    assert.equal(article.title, exported.article.title);
    assert.equal(article.digest, exported.article.digest);
    assert.equal(article.content, exported.article.html);
    assert.equal(article.thumb_media_id, "cover-1");
    assert.equal(article.content_source_url, exported.article.readMoreUrl);
    assert.match(article.pic_crop_1_1, /^0_0_0\.\d+_1$/);

    calls.length = 0;
    assert.equal((await pushWechatDraft(TODAY, "editor@example.org")).action, "updated");
    assert.deepEqual(calls.map((c) => c.path), ["/cgi-bin/draft/update"], "the same cover and token, the same draft");
    assert.equal(JSON.parse(calls[0]!.body).media_id, "draft-1");

    gone = true;
    calls.length = 0;
    assert.equal((await pushWechatDraft(TODAY, "editor@example.org")).action, "recreated");
    assert.deepEqual(calls.map((c) => c.path), ["/cgi-bin/draft/update", "/cgi-bin/draft/add"]);
    const [row] = await sql`SELECT push FROM wechat_issues WHERE report_key = ${TODAY}`;
    assert.equal(row!.push.draftMediaId, "draft-2");
    assert.equal(row!.push.by, "editor@example.org");
    const pushed = await wechatExport(TODAY);
    assert.ok(pushed.status === "ready" && pushed.push.pushedAt && pushed.push.pushedRevision === exported.revision);
    assert.ok((await wechatIssues()).rows.find((r) => r.date === TODAY)?.pushedAt);
    const [logged] = await sql`SELECT action FROM audit_log WHERE subject = ${`wechat:${TODAY}`} ORDER BY id DESC LIMIT 1`;
    assert.equal(logged!.action, "wechat.push");

    refuse = true;
    resetWechatToken();
    await assert.rejects(pushWechatDraft(TODAY, "editor@example.org"), /IP 白名单/, "the account's refusal reads as its setup");
    const [kept] = await sql`SELECT push FROM wechat_issues WHERE report_key = ${TODAY}`;
    assert.equal(kept!.push.draftMediaId, "draft-2", "a failed push changes nothing");
  } finally {
    config.wechatDraftEnabled = false;
    delete process.env.WECHAT_APPID;
    delete process.env.WECHAT_APPSECRET;
    delete process.env.WECHAT_API_BASE_URL;
    resetWechatToken();
    await mp.close();
  }
});

/** A stand-in for the Codex CLI: copies a fixed picture into its working directory, or fails like a signed-out CLI. */
async function fakeCodex(dir: string) {
  const picture = path.join(dir, "drawn.png");
  await writeFile(picture, await sharp({ create: { width: 1600, height: 900, channels: 3, background: "#c08040" } }).png().toBuffer());
  const bin = path.join(dir, "codex");
  await writeFile(bin, `#!/bin/sh\nif [ -n "$FAKE_CODEX_FAIL" ]; then echo "not logged in" >&2; exit 1; fi\ncp "${picture}" ./illustration.png\n`);
  await chmod(bin, 0o755);
  return bin;
}

/** The job the workbench queued for `request`, taken off the queue as the worker takes it. */
const job = async (request: string) =>
  (await sql<{ data: Parameters<typeof drawWechatIllustration>[0] }[]>`
    DELETE FROM pgboss.job WHERE name = 'wechat.illustrate' AND data->>'request' = ${request} RETURNING data`)[0]!.data;

const ready = async () => {
  const exported = await wechatExport(TODAY);
  assert.equal(exported.status, "ready");
  return exported as Extract<typeof exported, { status: "ready" }>;
};

test("an entry's illustration is drawn by the worker's codex, kept until a new one is ready, uploaded instead or removed", async () => {
  await sql`DELETE FROM wechat_illustrations WHERE report_key = ${TODAY}`;
  const dataDir = config.dataDir;
  config.dataDir = await mkdtemp(path.join(tmpdir(), "wechat-illustrations-"));
  try {
    const entry = (await ready()).article.entries[0]!.key;
    assert.ok((await ready()).drawingUnavailable, "without CODEX_BIN nothing is drawn");
    await assert.rejects(requestWechatIllustration(TODAY, { entry }, "editor@example.org"), (e: { code?: string }) => e.code === "conflict");
    config.codexBin = await fakeCodex(config.dataDir);
    await assert.rejects(requestWechatIllustration(TODAY, { entry: "no-such-entry" }, "editor@example.org"), (e: { statusCode?: number }) => e.statusCode === 404);

    const asked = await requestWechatIllustration(TODAY, { entry, prompt: "  一座灯塔  " }, "editor@example.org");
    const queued = await ready();
    assert.equal(queued.drawingUnavailable, null);
    assert.deepEqual([queued.illustrations[entry]?.status, queued.illustrations[entry]?.prompt, queued.illustrations[entry]?.url], ["queued", "一座灯塔", null]);
    await assert.rejects(requestWechatIllustration(TODAY, { entry }, "editor@example.org"), /正在画/, "one drawing per entry at a time");

    assert.deepEqual(await drawWechatIllustration(await job(asked.request)), { status: "done" });
    const drawn = await ready();
    const url = drawn.illustrations[entry]!.url!;
    assert.match(url, new RegExp(`^/api/admin/wechat/${TODAY}/illustration\\.jpg\\?entry=`));
    assert.ok(drawn.article.html.includes(`<img src="${url.replaceAll("&", "&amp;")}"`), "the preview prints it under the entry's title");
    const jpeg = await wechatIllustrationJpeg(TODAY, entry);
    assert.deepEqual(await sharp(jpeg!).metadata().then((m) => [m.format, m.width, m.height]), ["jpeg", 1280, 720], "scaled for a phone, as JPEG");
    const [receipt] = await sql`SELECT r.status, r.purpose FROM receipts r JOIN wechat_illustrations w ON w.receipt_id = r.id WHERE w.report_key = ${TODAY} AND w.entry_key = ${entry}`;
    assert.deepEqual([receipt!.status, receipt!.purpose], ["completed", "wechat_illustration"], "a drawing is receipted");

    process.env.FAKE_CODEX_FAIL = "1";
    const again = await requestWechatIllustration(TODAY, { entry }, "editor@example.org");
    assert.deepEqual(await drawWechatIllustration(await job(again.request)), { status: "failed" });
    delete process.env.FAKE_CODEX_FAIL;
    const failed = (await ready()).illustrations[entry]!;
    assert.equal(failed.status, "failed");
    assert.match(failed.error!, /not logged in/, "the CLI's own words");
    assert.equal(failed.url, url, "the picture already there stays");

    const late = await requestWechatIllustration(TODAY, { entry }, "editor@example.org");
    const png = await sharp({ create: { width: 800, height: 450, channels: 3, background: "#204060" } }).png().toBuffer();
    assert.deepEqual(await uploadWechatIllustration(TODAY, { entry, image: png }, "editor@example.org"), { ok: true });
    assert.deepEqual(await drawWechatIllustration(await job(late.request)), { status: "superseded" }, "an upload replaces the drawing asked before it");
    const uploaded = (await ready()).illustrations[entry]!;
    assert.deepEqual([uploaded.status, uploaded.origin], ["done", "uploaded"]);
    assert.notEqual(uploaded.url, url);
    await assert.rejects(uploadWechatIllustration(TODAY, { entry, image: Buffer.from("not a picture") }, "editor@example.org"), (e: { statusCode?: number }) => e.statusCode === 400);
    process.env.FAKE_CODEX_FAIL = "1";
    await drawWechatIllustration(await job((await requestWechatIllustration(TODAY, { entry }, "editor@example.org")).request));
    delete process.env.FAKE_CODEX_FAIL;
    assert.deepEqual(Object.values((await ready()).illustrations[entry]!).slice(0, 2), ["failed", "uploaded"], "a failed drawing gives the uploaded picture its origin back");

    assert.deepEqual(await removeWechatIllustration(TODAY, entry, "editor@example.org"), { removed: true });
    const removed = await ready();
    assert.equal(removed.illustrations[entry], undefined);
    assert.doesNotMatch(removed.article.html, /<img/);
    assert.equal(await wechatIllustrationJpeg(TODAY, entry), null);
    const [logged] = await sql`SELECT action FROM audit_log WHERE subject = ${`wechat:${TODAY}`} ORDER BY id DESC LIMIT 1`;
    assert.equal(logged!.action, "wechat.illustration.remove");
  } finally {
    delete process.env.FAKE_CODEX_FAIL;
    await rm(config.dataDir, { recursive: true, force: true });
    config.dataDir = dataDir;
    config.codexBin = null;
  }
});

test("a push uploads each illustration to the 公众号 once and prints it from there", async () => {
  await sql`DELETE FROM wechat_illustrations WHERE report_key = ${TODAY}`;
  const dataDir = config.dataDir;
  config.dataDir = await mkdtemp(path.join(tmpdir(), "wechat-illustrations-"));
  const calls: Array<{ path: string; body: string }> = [];
  let pictures = 0;
  const mp = await stub((_hit, req) => {
    const at = req.url.split("?")[0]!;
    calls.push({ path: at, body: req.body });
    if (at === "/cgi-bin/stable_token") return { access_token: "tok", expires_in: 7200 };
    if (at === "/cgi-bin/material/add_material") return { media_id: "cover-1" };
    if (at === "/cgi-bin/media/uploadimg") return { url: `http://mmbiz.qpic.cn/pic-${++pictures}` };
    if (at === "/cgi-bin/draft/add") return { media_id: "draft-1" };
    if (at === "/cgi-bin/draft/update") return { errcode: 0, errmsg: "ok" };
    return new Reply(404, {});
  });
  config.wechatDraftEnabled = true;
  process.env.WECHAT_APPID = "wx-test";
  process.env.WECHAT_APPSECRET = "secret-test";
  process.env.WECHAT_API_BASE_URL = mp.url;
  resetWechatToken();
  try {
    const entry = (await ready()).article.entries[0]!.key;
    const png = (color: string) => sharp({ create: { width: 640, height: 360, channels: 3, background: color } }).png().toBuffer();
    await uploadWechatIllustration(TODAY, { entry, image: await png("#806040") }, "editor@example.org");
    await pushWechatDraft(TODAY, "editor@example.org");
    assert.equal(calls.filter((c) => c.path === "/cgi-bin/media/uploadimg").length, 1);
    assert.match(calls.find((c) => c.path === "/cgi-bin/media/uploadimg")!.body, /Content-Type: image\/jpeg/);
    const content = (body: string) => { const parsed = JSON.parse(body); return (parsed.articles[0] ?? parsed.articles).content as string; };
    const sent = content(calls.findLast((c) => c.path.startsWith("/cgi-bin/draft/"))!.body);
    assert.match(sent, /<img src="http:\/\/mmbiz\.qpic\.cn\/pic-1"/, "the body prints the 公众号's own address");
    assert.doesNotMatch(sent, /\/api\/admin\//, "never the workbench's");
    assert.equal((await ready()).push.imagesChanged, false);

    calls.length = 0;
    await pushWechatDraft(TODAY, "editor@example.org");
    assert.equal(calls.filter((c) => c.path === "/cgi-bin/media/uploadimg").length, 0, "an uploaded picture is not uploaded again");

    await uploadWechatIllustration(TODAY, { entry, image: await png("#204080") }, "editor@example.org");
    assert.equal((await ready()).push.imagesChanged, true, "a new picture makes the draft box stale");
  } finally {
    config.wechatDraftEnabled = false;
    delete process.env.WECHAT_APPID;
    delete process.env.WECHAT_APPSECRET;
    delete process.env.WECHAT_API_BASE_URL;
    resetWechatToken();
    await mp.close();
    await sql`DELETE FROM wechat_illustrations WHERE report_key = ${TODAY}`;
    await rm(config.dataDir, { recursive: true, force: true });
    config.dataDir = dataDir;
  }
});

/** A stand-in for the Codex CLI's web search: answers with the pages it "found", as `codex exec --json` does. */
async function fakeSearch(dir: string, pages: string[]) {
  const answer = JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: JSON.stringify({ pages }) } });
  const bin = path.join(dir, "codex-search");
  await writeFile(bin, `#!/bin/sh\ncat > /dev/null\necho '${answer}'\necho '{"type":"turn.completed","usage":{"input_tokens":1,"output_tokens":1}}'\n`);
  await chmod(bin, 0o755);
  return bin;
}

test("finding a picture takes the entry's own report's first sizeable one, then a page the web search turns up, credited either way", async () => {
  await sql`DELETE FROM wechat_illustrations WHERE report_key = ${TODAY}`;
  const dataDir = config.dataDir;
  config.dataDir = await mkdtemp(path.join(tmpdir(), "wechat-illustrations-"));
  const png = (width: number, height: number, background: string) => sharp({ create: { width, height, channels: 3, background } }).png().toBuffer();
  const files: Record<string, { type: string; body: Buffer | string }> = {
    "/icon.png": { type: "image/png", body: await png(96, 96, "#000000") },
    "/photo.png": { type: "image/png", body: await png(1200, 675, "#c08040") },
    "/web.png": { type: "image/png", body: await png(1000, 600, "#4080c0") },
    "/article": { type: "text/html", body: "<html><head><title>no preview</title></head></html>" },
  };
  const site = http.createServer((req, res) => {
    const file = files[new URL(req.url ?? "/", "http://site").pathname];
    res.writeHead(file ? 200 : 404, { "content-type": file?.type ?? "text/plain" });
    res.end(file?.body ?? "");
  });
  await new Promise<void>((resolve) => site.listen(0, "127.0.0.1", () => resolve()));
  const base = `http://127.0.0.1:${(site.address() as { port: number }).port}`;
  files["/news"] = { type: "text/html", body: `<html><head><meta property="og:image" content="/web.png"></head></html>` };
  const source = `wechat-find-${T}`;
  const modelCalls = config.modelCallsEnabled;
  const [report] = await sql<{ content: unknown }[]>`SELECT content FROM reports WHERE kind = 'daily' AND key = ${TODAY}`;
  try {
    await sql`INSERT INTO sources (id, name, kind, tier, next_fetch_at) VALUES (${source}, 'Find fixture', 'rss', 'T1', '2100-01-01')`;
    const material = await upsertMaterial({
      sourceId: source, url: `${base}/article`, title: "Picture fixture", language: "en", bodyText: "An article.", bodyStatus: "ok", via: "fetch", publishedAt: new Date(),
      media: [{ kind: "image", url: `${base}/icon.png` }, { kind: "image", url: `${base}/photo.png` }],
    });
    await sql`INSERT INTO analyses (article_id, input_revision, origin, editorial_language, relevance, category, title, summary, score, selected)
      VALUES (${material.articleId}, 1, 'rule', 'zh', 'pass', 'ai-models', '配图条目', '配图摘要', 90, true)`;
    await publishArticle(material.articleId, { releasedAt: new Date(Date.now() - 60_000) });
    const content = report!.content as { sections: Array<{ label: string; items: unknown[] }> };
    const sections = [...content.sections, { label: "模型", items: [{ itemId: material.articleId, title: "配图条目", summary: "配图摘要", sourceName: "Find fixture", sourceUrl: `${base}/article` }] }];
    await sql`UPDATE reports SET content = ${sql.json({ ...content, sections } as never)} WHERE kind = 'daily' AND key = ${TODAY}`;
    const entry = material.articleId;

    const asked = await requestWechatIllustration(TODAY, { entry, mode: "find" }, "editor@example.org");
    assert.equal((await ready()).illustrations[entry]!.origin, "source", "finding works without codex");
    assert.deepEqual(await findWechatIllustration(await job(asked.request)), { status: "done" });
    const own = (await ready()).illustrations[entry]!;
    assert.deepEqual([own.status, own.origin, own.credit], ["done", "source", `${base}/article`], "the report's first sizeable picture, credited to its page");
    assert.equal((await sharp((await wechatIllustrationJpeg(TODAY, entry))!).stats()).dominant.r > 150, true, "the photo, not the icon");
    assert.match((await ready()).article.html, /图源：127\.0\.0\.1/, "the article credits the picture's site");

    const again = await requestWechatIllustration(TODAY, { entry, mode: "find" }, "editor@example.org");
    assert.deepEqual(await findWechatIllustration(await job(again.request)), { status: "none" });
    const kept = (await ready()).illustrations[entry]!;
    assert.deepEqual([kept.status, kept.origin === "source", kept.url === own.url], ["failed", true, true], "without another picture and without codex, the one there stays");
    assert.match(kept.error!, /没开/);

    config.codexBin = await fakeSearch(config.dataDir, [`${base}/news`]);
    config.modelCallsEnabled = true;
    const searched = await requestWechatIllustration(TODAY, { entry, mode: "find" }, "editor@example.org");
    assert.deepEqual(await findWechatIllustration(await job(searched.request)), { status: "done" });
    const web = (await ready()).illustrations[entry]!;
    assert.deepEqual([web.origin, web.credit], ["web", `${base}/news`], "the preview picture of a page the search found");
    assert.notEqual(web.url, own.url);
    const [receipt] = await sql`SELECT r.status, r.purpose, r.service FROM receipts r JOIN wechat_illustrations w ON w.receipt_id = r.id WHERE w.report_key = ${TODAY} AND w.entry_key = ${entry}`;
    assert.deepEqual([receipt!.status, receipt!.purpose, receipt!.service], ["completed", "wechat_image_search", "codex-text"], "a search is receipted");

    assert.deepEqual(await findWechatIllustrations(TODAY, "editor@example.org"), { queued: (await ready()).article.entries.filter((e) => !e.hidden).length - 1 }, "every printed entry without a picture");
  } finally {
    await sql`UPDATE reports SET content = ${sql.json(report!.content as never)} WHERE kind = 'daily' AND key = ${TODAY}`;
    await sql`DELETE FROM wechat_illustrations WHERE report_key = ${TODAY}`;
    await new Promise<void>((resolve) => site.close(() => resolve()));
    await rm(config.dataDir, { recursive: true, force: true });
    config.dataDir = dataDir;
    config.codexBin = null;
    config.modelCallsEnabled = modelCalls;
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


test("new subscriptions default English, and a language change waits for the confirmation click", async () => {
  const email = `english-${T}@example.org`.toLowerCase();
  const visitorEn = { ip: "198.51.100.230", userAgent: `english-${T}` };
  assert.equal(subscribeLanguage(undefined), "en");
  assert.equal(subscribeLanguage("zh"), "zh");
  assert.throws(() => subscribeLanguage("fr"), (e: unknown) => e instanceof NewsletterRejected && e.status === 400);
  const before = since();
  await subscribe({ email, ...visitorEn });
  const [row] = await sql<{ token: string; language: string; pending_language: string | null; language_preference_known: boolean }[]>`
    SELECT token, language, pending_language, language_preference_known FROM newsletter_subscribers WHERE email = ${email}`;
  assert.equal(row!.language, "en");
  assert.equal(row!.pending_language, null);
  assert.equal(row!.language_preference_known, true);
  const mail = hits.slice(before).find(hit => hit.path === "/emails")!;
  assert.match(mail.body.html, /<html lang="en">/);
  assert.match(mail.body.subject, /Confirm your/);
  assert.match(mail.body.html, /Confirm subscription/);
  assert.match(mail.body.text, /Confirm your subscription/);
  assert.match(mail.body.html, new RegExp(`/subscribe\\?token=${row!.token}`));
  assert.doesNotMatch(mail.body.html, /\/zh\/subscribe/);
  assert.equal(hits.slice(before).some(hit => hit.path.startsWith("/contacts")), false);
  const switched = since();
  await subscribe({ email, language: "zh", ...visitorEn });
  assert.equal(hits.slice(switched).filter(hit => hit.path === "/emails").length, 1, "a language change sends a new confirmation inside the cooldown");
  assert.equal(hits.slice(switched).some(hit => hit.path.startsWith("/contacts")), false, "the list does not move until the link is opened");
  const [pending] = await sql<{ token: string; language: string; pending_language: string | null }[]>`
    SELECT token, language, pending_language FROM newsletter_subscribers WHERE email = ${email}`;
  assert.equal(pending!.language, "en", "the active language stays until confirm");
  assert.equal(pending!.pending_language, "zh");
  assert.notEqual(pending!.token, row!.token);
  const chinese = hits.slice(switched).find(hit => hit.path === "/emails")!;
  assert.match(chinese.body.html, /<html lang="zh-CN">/);
  assert.match(chinese.body.subject, /确认订阅/);
  assert.match(chinese.body.html, new RegExp(`/zh/subscribe\\?token=${pending!.token}`));
  await assert.rejects(confirm(row!.token), (e: unknown) => e instanceof NewsletterRejected && e.status === 404, "the retired letter cannot confirm");
  const first = since();
  await confirm(pending!.token);
  assert.deepEqual(hits.slice(first).find(hit => hit.path === "/contacts")!.body.segments, [{ id: "seg-test" }]);
  assert.deepEqual([...(contacts.get(email)?.segments ?? [])], ["seg-test"]);
  assert.equal((await sql`SELECT language, pending_language FROM newsletter_subscribers WHERE email = ${email}`)[0]!.language, "zh");
  const back = since();
  await subscribe({ email, language: "en", ...visitorEn });
  const [held] = await sql<{ token: string; language: string; pending_language: string | null }[]>`
    SELECT token, language, pending_language FROM newsletter_subscribers WHERE email = ${email}`;
  assert.equal(held!.language, "zh");
  assert.equal(held!.pending_language, "en");
  const requested = hits.slice(back);
  assert.equal(requested.some(hit => hit.path.startsWith("/contacts")), false, "a confirmed reader is not moved or re-subscribed before the click");
  const english = requested.find(hit => hit.path === "/emails")!;
  assert.match(english.body.subject, /Confirm your/);
  assert.doesNotMatch(english.body.html, /\/zh\/subscribe/);
  await confirm(held!.token);
  assert.deepEqual([...(contacts.get(email)?.segments ?? [])], ["seg-en-test"]);
  assert.equal((await sql`SELECT language, pending_language FROM newsletter_subscribers WHERE email = ${email}`)[0]!.language, "en");
  assert.equal((await sql`SELECT pending_language FROM newsletter_subscribers WHERE email = ${email}`)[0]!.pending_language, null);
});

test("a failed segment removal puts the contact back and leaves the stored language", async () => {
  const email = `rollback-${T}@example.org`.toLowerCase();
  await subscribe({ email, language: "zh", ip: "198.51.100.232", userAgent: `rollback-${T}` });
  const [row] = await sql<{ token: string }[]>`SELECT token FROM newsletter_subscribers WHERE email = ${email}`;
  await confirm(row!.token);
  assert.deepEqual([...(contacts.get(email)?.segments ?? [])], ["seg-test"]);
  await subscribe({ email, language: "en", ip: "198.51.100.232", userAgent: `rollback-${T}` });
  const [pending] = await sql<{ token: string }[]>`SELECT token FROM newsletter_subscribers WHERE email = ${email}`;
  rejectSegmentDelete = "seg-test";
  try {
    await assert.rejects(confirm(pending!.token), (e: unknown) => e instanceof NewsletterRejected && e.status === 503);
  } finally {
    rejectSegmentDelete = null;
  }
  assert.deepEqual([...(contacts.get(email)?.segments ?? [])], ["seg-test"], "the new segment is removed when the old one cannot be left");
  const [kept] = await sql<{ language: string; pending_language: string | null; status: string }[]>`
    SELECT language, pending_language, status FROM newsletter_subscribers WHERE email = ${email}`;
  assert.deepEqual([kept!.language, kept!.pending_language, kept!.status], ["zh", "en", "confirmed"]);
  await confirm(pending!.token);
  assert.deepEqual([...(contacts.get(email)?.segments ?? [])], ["seg-en-test"]);
  assert.equal((await sql`SELECT language, pending_language FROM newsletter_subscribers WHERE email = ${email}`)[0]!.language, "en");
});

test("English reports wait without claiming, then send the stored complete edition once", async () => {
  const before = since();
  const logs: string[] = [];
  const original = console.log;
  console.log = (...args: unknown[]) => { logs.push(args.map(String).join(" ")); };
  try {
    assert.deepEqual(await sendDailyIssue(TODAY, "en"), { status: "skipped", reason: "edition not ready" });
  } finally {
    console.log = original;
  }
  assert.match(logs.join("\n"), /newsletter edition skipped/);
  assert.match(logs.join("\n"), /"language":"en"/);
  assert.match(logs.join("\n"), /edition not ready/);
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
  assert.match(broadcast.body.html, new RegExp(`/daily/${TODAY}`));
  assert.doesNotMatch(broadcast.body.html, /\/zh\/daily/);
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


test("signing up again from an English page mails English and applies it when the link is opened", async () => {
  const email = `legacy-${T}@example.org`.toLowerCase();
  const token = "l".repeat(43);
  await sql`INSERT INTO newsletter_subscribers (email, token, language, language_preference_known)
    VALUES (${email}, ${token}, 'zh', false)`;
  const start = since();
  await subscribe({ email, language: "en", ip: "198.51.100.231", userAgent: `legacy-${T}` });
  const [row] = await sql<{ token: string; language: string; pending_language: string | null; language_preference_known: boolean }[]>`
    SELECT token, language, pending_language, language_preference_known FROM newsletter_subscribers WHERE email = ${email}`;
  assert.equal(row!.language, "zh");
  assert.equal(row!.pending_language, "en");
  assert.equal(row!.language_preference_known, false);
  assert.equal(hits.slice(start).some(hit => hit.path.startsWith("/contacts")), false);
  const mail = hits.slice(start).find(hit => hit.path === "/emails")!;
  assert.match(mail.body.html, /<html lang="en">/);
  assert.match(mail.body.subject, /Confirm your/);
  assert.match(mail.body.html, new RegExp(`/subscribe\\?token=${row!.token}`));
  assert.doesNotMatch(mail.body.html, /\/zh\/subscribe/);
  await confirm(row!.token);
  const [done] = await sql<{ language: string; pending_language: string | null; language_preference_known: boolean }[]>`
    SELECT language, pending_language, language_preference_known FROM newsletter_subscribers WHERE email = ${email}`;
  assert.equal(done!.language, "en");
  assert.equal(done!.pending_language, null);
  assert.equal(done!.language_preference_known, true);
  assert.deepEqual([...(contacts.get(email)?.segments ?? [])], ["seg-en-test"]);
});

test("an unsubscribed reader stays off the list until the new confirmation is opened", async () => {
  const email = `unsub-${T}@example.org`.toLowerCase();
  const token = "u".repeat(43);
  await sql`INSERT INTO newsletter_subscribers (email, token, status, language, language_preference_known, confirmed_at, unsubscribed_at)
    VALUES (${email}, ${token}, 'confirmed', 'zh', true, now(), now())`;
  contacts.set(email, { unsubscribed: true, segments: new Set(["seg-test"]) });
  const start = since();
  await subscribe({ email, language: "en", ip: "198.51.100.233", userAgent: `unsub-${T}` });
  assert.equal(hits.slice(start).some(hit => hit.path.startsWith("/contacts")), false);
  assert.equal(contacts.get(email)!.unsubscribed, true);
  const [pending] = await sql<{ token: string; language: string; pending_language: string | null; unsubscribed_at: Date | null }[]>`
    SELECT token, language, pending_language, unsubscribed_at FROM newsletter_subscribers WHERE email = ${email}`;
  assert.equal(pending!.language, "zh");
  assert.equal(pending!.pending_language, "en");
  assert.ok(pending!.unsubscribed_at);
  await confirm(pending!.token);
  const calls = hits.slice(start).filter(hit => hit.path.startsWith("/contacts"));
  const patchAt = calls.findIndex(hit => hit.method === "PATCH");
  const deleteAt = calls.findIndex(hit => hit.method === "DELETE" && hit.path.endsWith("/segments/seg-test"));
  assert.ok(deleteAt >= 0 && patchAt > deleteAt, "unsubscribe is cleared after the old segment is left");
  assert.equal(contacts.get(email)!.unsubscribed, false);
  assert.deepEqual([...(contacts.get(email)?.segments ?? [])], ["seg-en-test"]);
  const [done] = await sql<{ language: string; pending_language: string | null; unsubscribed_at: Date | null }[]>`
    SELECT language, pending_language, unsubscribed_at FROM newsletter_subscribers WHERE email = ${email}`;
  assert.equal(done!.language, "en");
  assert.equal(done!.pending_language, null);
  assert.equal(done!.unsubscribed_at, null);
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
