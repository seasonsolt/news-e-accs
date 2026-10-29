import "./setup.ts";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { closeDb, sql } from "@aihot/backend/db";
import { siteAnalyticsOverview } from "@aihot/backend/admin/analytics";
import { funnelCounts, growthFunnel, growthJourneys, growthOverview, growthRange, growthRetention, parseFunnel } from "@aihot/backend/admin/growth";
import { normalizePagePath, readerFilter } from "@aihot/backend/site/analytics";
import { classifyChannel, cleanTag, describeAgent, recordSessionEngagement, recordSessionEvent, recordSessionView } from "@aihot/backend/site/sessions";
import { beijingDate } from "@aihot/contracts/time";
import { buildApp } from "../apps/api/src/app.ts";

const app = await buildApp();

after(async () => {
  await app.close();
  await sql`DELETE FROM site_pageviews_daily WHERE day = (now() AT TIME ZONE 'Asia/Taipei')::date AND path IN ('/about', '/eacc-glossary')`;
  await closeDb();
});

test("page views are reduced to known route patterns", () => {
  assert.equal(normalizePagePath("/about"), "/about");
  assert.equal(normalizePagePath("/items/abc123"), "/items/:id");
  assert.equal(normalizePagePath("/topics/ai/page/2"), "/topics/:slug/page/:page");
  assert.equal(normalizePagePath("/items/abc123?email=private@example.com"), null);
  assert.equal(normalizePagePath("/admin/settings"), null);
  assert.equal(normalizePagePath("/unregistered"), null);
});

test("the Chinese edition is counted under its own /zh routes", () => {
  assert.equal(normalizePagePath("/zh"), "/zh");
  assert.equal(normalizePagePath("/zh/hot"), "/zh/hot");
  assert.equal(normalizePagePath("/zh/items/abc123"), "/zh/items/:id");
  assert.equal(normalizePagePath("/zh/leaderboard/gpt-5-4"), "/zh/leaderboard/:model");
  assert.equal(normalizePagePath("/zh/"), null);
  assert.equal(normalizePagePath("/zh/zh/hot"), null);
  assert.equal(normalizePagePath("/zh/admin/settings"), null);
  assert.equal(normalizePagePath("/zh/unregistered"), null);
});

test("daily page views are counted anonymously and appear in the admin summary", async () => {
  await sql`DELETE FROM site_pageviews_daily WHERE day = (now() AT TIME ZONE 'Asia/Taipei')::date AND path = '/about'`;
  const accepted = await app.inject({ method: "POST", url: "/api/site/analytics", payload: { event: "page_view", path: "/about" } });
  const rejected = await app.inject({ method: "POST", url: "/api/site/analytics", payload: { event: "page_view", path: "/items/a?token=private" } });
  const admin = await app.inject({ method: "GET", url: "/api/admin/analytics?days=7" });
  assert.equal(accepted.statusCode, 204);
  assert.equal(rejected.statusCode, 204);
  assert.equal(admin.statusCode, 401, "analytics summaries require the existing admin session");

  const summary = await siteAnalyticsOverview(7);
  const page = summary.pages.find((row) => row.path === "/about");
  const today = summary.daily.at(-1);
  assert.equal(summary.days, 7);
  assert.equal(summary.daily.length, 7);
  assert.equal(page?.views, 1);
  assert.ok(today && today.views >= 1);
});

const CRAWLER = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36";
const READER = "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1";

test("a browser's full loads beyond fifteen a day count only with in-app navigations alongside them", () => {
  const readers = readerFilter(() => Date.parse("2026-10-22T04:00:00Z"));
  const loads = Array.from({ length: 20 }, () => readers.view(CRAWLER, "load"));
  assert.deepEqual(loads.map((ok, i) => ok || i), [...Array(15).fill(true), 15, 16, 17, 18, 19], "the first fifteen count, the rest do not");
  assert.equal(readers.event(CRAWLER), false, "a browser past the line has its interactions dropped too");
  assert.equal(readers.view(CRAWLER, "nav"), true, "an in-app navigation always counts");

  // One navigation covers ten further loads: 15 + 10, and the 26th needs another navigation.
  const reader = readerFilter(() => Date.parse("2026-10-22T04:00:00Z"));
  for (let i = 0; i < 15; i++) reader.view(READER, "load");
  assert.equal(reader.view(READER, "nav"), true);
  const more = Array.from({ length: 11 }, () => reader.view(READER, "load"));
  assert.deepEqual(more, [...Array(10).fill(true), false]);
  assert.equal(reader.event(READER), false);
  assert.equal(reader.view(READER, "nav"), true);
  assert.equal(reader.event(READER), true, "a second navigation brings the browser back under the line");
});

test("crawlers that name themselves and requests without a user agent are never counted", () => {
  const readers = readerFilter();
  const bytespider = "Mozilla/5.0 (Linux; Android 5.0) AppleWebKit/537.36 (KHTML, like Gecko) Mobile Safari/537.36 (compatible; Bytespider; spider-feedback@bytedance.com)";
  assert.equal(readers.view(bytespider, "load"), false);
  assert.equal(readers.event(bytespider), false);
  assert.equal(readers.view("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/146.0.0.0 Safari/537.36", "nav"), false);
  assert.equal(readers.view("", "load"), false);
  assert.equal(readers.event(""), false);
  assert.equal(readers.view(READER, "load"), true);
  assert.equal(readers.event(READER), true, "an interaction from a browser with no views yet counts");
});

test("the limit starts over each Taipei day", () => {
  let now = Date.parse("2026-10-22T15:59:00Z");
  const readers = readerFilter(() => now);
  for (let i = 0; i < 15; i++) readers.view(CRAWLER, "load");
  assert.equal(readers.view(CRAWLER, "load"), false);
  now = Date.parse("2026-10-22T16:00:00Z");
  assert.equal(readers.event(CRAWLER), true);
  assert.equal(readers.view(CRAWLER, "load"), true);
});

test("the view endpoint leaves a crawler's reloads out of the daily count", async () => {
  await sql`DELETE FROM site_pageviews_daily WHERE day = (now() AT TIME ZONE 'Asia/Taipei')::date AND path = '/eacc-glossary'`;
  const crawler = { "user-agent": CRAWLER };
  for (let i = 0; i < 20; i++) {
    const res = await app.inject({ method: "POST", url: "/api/site/analytics", headers: crawler, payload: { event: "page_view", path: "/eacc-glossary" } });
    assert.equal(res.statusCode, 204);
  }
  await app.inject({ method: "POST", url: "/api/site/analytics", headers: { "user-agent": READER }, payload: { event: "page_view", path: "/eacc-glossary" } });
  await app.inject({ method: "POST", url: "/api/site/analytics", headers: { "user-agent": READER }, payload: { event: "page_view", path: "/eacc-glossary", nav: true } });
  const [row] = await sql<{ views: string }[]>`SELECT views FROM site_pageviews_daily
    WHERE day = (now() AT TIME ZONE 'Asia/Taipei')::date AND path = '/eacc-glossary'`;
  assert.equal(Number(row?.views), 17, "fifteen of the crawler's loads and both of the reader's views");
});

test("a session's channel comes from its campaign tags, then the referring site, then a shared link's marker", () => {
  const c = (referrer: string, utmSource = "", utmMedium = "", via: string | null = null) => classifyChannel({ referrer, utmSource, utmMedium, via });
  assert.equal(c(""), "direct");
  assert.equal(c("google.com"), "search");
  assert.equal(c("google.co.uk"), "search");
  assert.equal(c("gemini.google.com"), "ai", "Gemini is an assistant, not Google search");
  assert.equal(c("chatgpt.com"), "ai");
  assert.equal(c("", "chatgpt.com"), "ai", "ChatGPT often sends no referrer, only utm_source");
  assert.equal(c("t.co"), "social");
  assert.equal(c("old.reddit.com"), "social");
  assert.equal(c("mail.google.com"), "email");
  assert.equal(c("x.com", "", "", "newsletter"), "email", "the newsletter marker wins over where the link was opened");
  assert.equal(c("google.com", "google", "cpc"), "paid");
  assert.equal(c("someblog.example"), "referral");
  assert.equal(c("", "", "", "share"), "share");
  assert.equal(c("", "partner-site"), "referral");
});

test("user agents are reduced to a browser, a system and a device class", () => {
  assert.deepEqual(describeAgent(READER), { browser: "Safari", os: "iOS", device: "mobile" });
  assert.deepEqual(describeAgent(CRAWLER), { browser: "Chrome", os: "macOS", device: "desktop" });
  assert.deepEqual(describeAgent(CRAWLER, true), { browser: "Chrome", os: "iOS", device: "tablet" }, "an iPad asks for the desktop site but has a touch screen");
  assert.deepEqual(describeAgent("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36 EdgA/141.0"), { browser: "Edge", os: "Android", device: "mobile" });
});

test("campaign tags are kept only as short plain text", () => {
  assert.equal(cleanTag(" launch-week "), "launch-week");
  assert.equal(cleanTag("reader@example.com"), "", "an address is never stored");
  assert.equal(cleanTag("token1234567"), "", "long digit runs look like identifiers");
  assert.equal(cleanTag("x".repeat(81)), "");
  assert.equal(cleanTag(42), "");
});

test("funnel steps are matched in order within a session", () => {
  const steps = parseFunnel("view:*,view:/subscribe,event:subscribe_submit");
  assert.equal(steps.length, 3);
  assert.deepEqual(parseFunnel("view:nope"), parseFunnel(undefined), "too few valid steps fall back to the default funnel");
  const counts = funnelCounts([
    [{ kind: "view", route: "/" }, { kind: "view", route: "/subscribe" }, { kind: "subscribe_submit", route: "/subscribe" }],
    [{ kind: "subscribe_submit", route: "/" }, { kind: "view", route: "/subscribe" }],
    [{ kind: "view", route: "/hot" }],
  ], steps);
  assert.deepEqual(counts, [3, 1, 1], "a submit before reaching the subscribe page does not count");
});

test("a named or custom range has a previous span of the same length", () => {
  assert.deepEqual(growthRange({}, "2026-10-28"), { range: "7d", from: "2026-10-22", to: "2026-10-28", days: 7, previous: { from: "2026-10-15", to: "2026-10-21" } });
  assert.equal(growthRange({ range: "yesterday" }, "2026-10-28").from, "2026-10-27");
  assert.deepEqual(growthRange({ range: "custom", from: "2026-10-01", to: "2026-10-10" }, "2026-10-28").previous, { from: "2026-09-21", to: "2026-09-30" });
  assert.equal(growthRange({ range: "custom", from: "2026-10-10", to: "2026-10-01" }, "2026-10-28").range, "7d", "a reversed span falls back");
  assert.equal(growthRange({ range: "custom", from: "2026-10-01", to: "2026-11-30" }, "2026-10-28").range, "7d", "a span into the future falls back");
});

test("views build sessions per visitor, with source, visible time and interactions, and no lasting identifier", async () => {
  await sql`TRUNCATE site_sessions CASCADE`;
  await sql`DELETE FROM site_events_daily WHERE event = 'view_filtered'`;
  const today = beijingDate(new Date());
  const phone = { "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1", "x-real-ip": "203.0.113.7" };
  const laptop = { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36", "x-real-ip": "198.51.100.9" };
  const view = (headers: Record<string, string>, payload: Record<string, unknown>) => app.inject({ method: "POST", url: "/api/site/analytics", headers, payload: { event: "page_view", ...payload } });

  // A new reader from Google search lands on a story, reads on, stays a while and subscribes.
  await view(phone, { path: "/story/abc", ref: "https://www.google.com/search?q=private", utm: { source: "google" }, lang: "zh-CN", first: today });
  await view(phone, { path: "/subscribe", nav: true, first: today });
  await app.inject({ method: "POST", url: "/api/site/analytics", headers: phone, payload: { event: "page_leave", path: "/subscribe", ms: 42_000 } });
  await app.inject({ method: "POST", url: "/api/site/events", headers: phone, payload: { event: "subscribe_submit", target: "subscribe_page:zh" } });
  // A returning reader comes straight to the front page and leaves.
  await view(laptop, { path: "/", first: "2026-09-01", prev: "2026-10-01" });
  // The same phone later opens a link from X: a new visit, though within the gap.
  await view(phone, { path: "/hot", ref: "https://t.co/xyz", first: today });
  // Left out: the owner's browser and an automated one.
  await view({ ...laptop, "x-real-ip": "198.51.100.10" }, { path: "/", own: true });
  await view({ ...laptop, "x-real-ip": "198.51.100.11" }, { path: "/", wd: true });

  const sessions = await sql<{ visitor: string; channel: string; referrer: string; landing: string; landing_page: string; exit: string; views: number; engaged_ms: number; device: string; language: string }[]>`
    SELECT visitor, channel, referrer, landing, landing_page, exit, views, engaged_ms, device, language FROM site_sessions ORDER BY id`;
  assert.equal(sessions.length, 3);
  const [search, direct, social] = sessions;
  assert.deepEqual({ ...search, visitor: undefined }, { visitor: undefined, channel: "search", referrer: "google.com", landing: "/story/:id", landing_page: "/story/abc", exit: "/subscribe", views: 2, engaged_ms: 42000, device: "mobile", language: "zh" });
  assert.equal(direct!.channel, "direct");
  assert.equal(social!.channel, "social");
  assert.equal(social!.visitor, search!.visitor, "one visitor, two visits");
  assert.notEqual(direct!.visitor, search!.visitor);
  assert.match(search!.visitor, /^[0-9a-f]{32}$/, "a hash, not the address or user agent");
  const [salts] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM site_salts`;
  assert.equal(salts!.n, 1, "only today's salt exists");
  const hits = await sql<{ kind: string; route: string; engaged_ms: number }[]>`
    SELECT h.kind, h.route, h.engaged_ms FROM site_hits h JOIN site_sessions s ON s.id = h.session_id WHERE s.landing = '/story/:id' ORDER BY h.seq`;
  assert.deepEqual(hits.map((h) => [h.kind, h.route, h.engaged_ms]), [["view", "/story/:id", 0], ["view", "/subscribe", 42000], ["subscribe_submit", "/subscribe", 0]]);

  const overview = await growthOverview({ range: "today", goal: "subscribe_submit" });
  assert.equal(overview.totals.visitors, 2);
  assert.equal(overview.totals.newVisitors, 1);
  assert.equal(overview.totals.sessions, 3);
  assert.equal(overview.totals.views, 4);
  assert.equal(overview.totals.bounces, 2);
  assert.equal(overview.totals.conversions, 1);
  assert.equal(overview.totals.engagedSessions, 1);
  assert.deepEqual(overview.filtered.filter((f) => f.count), [{ reason: "automation", count: 1 }, { reason: "owner", count: 1 }]);
  assert.deepEqual(overview.breakdowns.channel.map((r) => [r.key, r.sessions]).sort(), [["direct", 1], ["search", 1], ["social", 1]]);
  assert.equal(overview.live.visitors, 2);

  const narrowed = await growthOverview({ range: "today", channel: "search", goal: "subscribe_submit" });
  assert.equal(narrowed.totals.sessions, 1);
  assert.equal(narrowed.totals.conversions, 1);
  const viewedHot = await growthOverview({ range: "today", page: "/hot" });
  assert.equal(viewedHot.totals.sessions, 1);

  const funnel = await growthFunnel({ range: "today", steps: "view:*,view:/subscribe,event:subscribe_submit" });
  assert.deepEqual(funnel.steps.map((s) => s.sessions), [3, 1, 1]);
  const journeys = await growthJourneys({ range: "today" });
  assert.deepEqual(journeys.journeys.find((j) => j.path.length === 2)?.path, ["/story/:id", "/subscribe"]);
  const retention = await growthRetention({});
  const cohort = retention.cohorts.at(-1)!;
  assert.equal(cohort.weeks[0], 1, "the new reader is this week's cohort; the returning one belongs to an earlier week");
});

test("a finished direct desktop visit of one page, never visible and without action, is left out and counted by reason", async () => {
  await sql`TRUNCATE site_sessions CASCADE`;
  await sql`DELETE FROM site_events_daily WHERE event = 'view_filtered'`;
  const then = new Date(Date.now() - 45 * 60_000);
  const day = beijingDate(then);
  const ua = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
  const open = (ip: string, at = then, more: { userAgent?: string; referrer?: string } = {}) => recordSessionView({ ip, userAgent: more.userAgent ?? ua,
    path: "/items/abc", route: "/items/:id", load: true, referrer: more.referrer ?? "", utm: null,
    via: null, touch: false, country: "CN", language: "zh", firstSeen: day, prevSeen: null, now: at });
  // A scripted browser opens a page, the subscribe box reports itself, and nothing else ever happens.
  await open("192.0.2.1");
  await recordSessionEvent({ ip: "192.0.2.1", userAgent: ua, event: "subscribe_view", target: "item_inline:zh", now: then });
  // Readers: one saw the page for five seconds, one opened the original, one is reading right now.
  await open("192.0.2.2");
  await recordSessionEngagement({ ip: "192.0.2.2", userAgent: ua, path: "/items/abc", ms: 5_000, now: then });
  await open("192.0.2.3");
  await recordSessionEvent({ ip: "192.0.2.3", userAgent: ua, event: "outbound_click", target: "item", now: then });
  await open("192.0.2.4", new Date());
  // No visible time reported, but sent by a search, or on a phone that may close before it reports: still readers.
  await open("192.0.2.5", then, { referrer: "https://www.google.com/" });
  await open("192.0.2.6", then, { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1" });

  const today = beijingDate(new Date());
  const overview = await growthOverview({ range: "custom", from: day, to: today });
  assert.equal(overview.totals.sessions, 5, "a page still open is not judged before it reports");
  assert.deepEqual(overview.filtered.filter((f) => f.count), [{ reason: "unseen", count: 1 }]);
  assert.equal((await growthJourneys({ range: "custom", from: day, to: today })).journeys.reduce((n, j) => n + j.sessions, 0), 5);
});

test("growth summaries need the admin session", async () => {
  for (const url of ["/api/admin/growth", "/api/admin/growth/funnel", "/api/admin/growth/retention", "/api/admin/growth/journeys"]) {
    assert.equal((await app.inject({ method: "GET", url })).statusCode, 401, url);
  }
});
