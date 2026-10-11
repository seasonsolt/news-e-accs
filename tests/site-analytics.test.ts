import "./setup.ts";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { closeDb, sql } from "@aihot/backend/db";
import { siteAnalyticsOverview } from "@aihot/backend/admin/analytics";
import { normalizePagePath } from "@aihot/backend/site/analytics";
import { buildApp } from "../apps/api/src/app.ts";

const app = await buildApp();

after(async () => {
  await app.close();
  await sql`DELETE FROM site_pageviews_daily WHERE day = (now() AT TIME ZONE 'Asia/Taipei')::date AND path = '/about'`;
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
