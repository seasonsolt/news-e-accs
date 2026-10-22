import "./setup.ts";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { closeDb, sql } from "@aihot/backend/db";
import { siteAnalyticsOverview } from "@aihot/backend/admin/analytics";
import { normalizePagePath, readerFilter } from "@aihot/backend/site/analytics";
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
