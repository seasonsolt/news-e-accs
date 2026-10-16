import "./setup.ts";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { closeDb, sql } from "@aihot/backend/db";
import { siteAnalyticsOverview } from "@aihot/backend/admin/analytics";
import { normalizeSiteEvent, normalizeSourceDomain, recordSiteEvent } from "@aihot/backend/site/analytics";
import { buildApp } from "../apps/api/src/app.ts";
import { tag } from "./setup.ts";

const app = await buildApp();
const id = `ev${tag()}`;
const source = `src${tag()}`;
const domain = `${id}.example`;
const missing = `missing${tag()}`;
const at = new Date("2026-01-01T00:00:00Z");

after(async () => {
  await app.close();
  // Rows with an empty target are shared counters, so this file owns those event names in the test database.
  await sql`DELETE FROM site_events_daily WHERE target IN (${id}, ${domain}, ${missing}) OR target LIKE ${`%.${id}.example`}
    OR target LIKE ${`%${id}%`}
    OR (target = '' AND event IN ('share_click', 'first_star', 'enter_3d'))`;
  await sql`DELETE FROM publications WHERE article_id = ${id}`;
  await sql`DELETE FROM articles WHERE id = ${id}`;
  await sql`DELETE FROM sources WHERE id = ${source}`;
  await closeDb();
});

test("interaction targets are reduced to an allowlisted event and a safe value", () => {
  assert.deepEqual(normalizeSiteEvent({ event: "star_add", target: id }), { event: "star_add", target: id });
  assert.equal(normalizeSiteEvent({ event: "star_add", target: "bad id" }), null);
  assert.equal(normalizeSiteEvent({ event: "star_add", target: "" }), null);
  assert.equal(normalizeSiteEvent({ event: "star_add", target: "x".repeat(81) }), null);
  assert.deepEqual(normalizeSiteEvent({ event: "first_star" }), { event: "first_star", target: "" });
  assert.deepEqual(normalizeSiteEvent({ event: "subscribe_submit" }), { event: "subscribe_submit", target: "" });
  assert.equal(normalizeSiteEvent({ event: "first_star", target: id }), null);
  assert.equal(normalizeSiteEvent({ event: "subscribe_click", target: "user@example.com" }), null);
  assert.equal(normalizeSiteEvent({ event: "not_an_event" }), null);
  assert.equal(normalizeSiteEvent({ event: "share_click", target: "x".repeat(301) }), null);
  assert.deepEqual(normalizeSiteEvent({ event: "enter_3d" }), { event: "enter_3d", target: "" });
  assert.equal(normalizeSiteEvent({ event: "enter_3d", target: id }), null);
  assert.deepEqual(normalizeSiteEvent({ event: "click_star", target: "big-bang" }), { event: "click_star", target: "big-bang" });
  assert.equal(normalizeSiteEvent({ event: "click_star", target: "" }), null);
  assert.equal(normalizeSiteEvent({ event: "click_star", target: "bad id" }), null);
  assert.equal(normalizeSiteEvent(null), null);
  assert.equal(normalizeSourceDomain(`https://user:secret@www.${domain}/path?token=1`), null);
  assert.equal(normalizeSourceDomain(`https://www.${domain}/items/${id}?email=a@b.c`), domain);
  assert.equal(normalizeSourceDomain(`WWW.${domain}.`), domain);
  assert.equal(normalizeSourceDomain(""), "");
  assert.equal(normalizeSourceDomain("http://192.168.1.1/a"), null);
  assert.equal(normalizeSourceDomain("192.168.1.1"), null);
});

test("daily interaction counts are anonymous, uncached, and visible only in the admin summary", async () => {
  await sql`DELETE FROM site_events_daily WHERE target IN (${id}, ${domain}) OR event IN ('share_click', 'first_star', 'enter_3d') OR (event = 'click_star' AND target = ${id})`;
  await sql`INSERT INTO sources (id, name, kind, tier) VALUES (${source}, ${source}, 'rss', 'T1')`;
  await sql`INSERT INTO articles (id, source_id, identity_key, url, title, discovered_at, timeline_at)
    VALUES (${id}, ${source}, ${id}, ${`https://${domain}/${id}`}, '互动示例', ${at}, ${at})`;
  await sql`INSERT INTO publications (article_id, source_id, title, url, discovered_at, timeline_at, sort_at, channel)
    VALUES (${id}, ${source}, '互动示例', ${`https://${domain}/${id}`}, ${at}, ${at}, ${at}, 'news')`;
  await sql`INSERT INTO site_events_daily (day, event, target, count)
    VALUES (((now() AT TIME ZONE 'Asia/Taipei')::date - 40), 'first_star', '', 3)`;

  const added = await app.inject({ method: "POST", url: "/api/site/events", payload: { event: "star_add", target: id } });
  const again = await app.inject({ method: "POST", url: "/api/site/events", payload: { event: "star_add", target: id } });
  const shared = await app.inject({
    method: "POST",
    url: "/api/site/events",
    payload: { event: "share_click" },
  });
  const outbound = await app.inject({
    method: "POST",
    url: "/api/site/events",
    payload: { event: "outbound_click", target: `https://www.${domain}/private/path?token=secret` },
  });
  const unpublished = await app.inject({ method: "POST", url: "/api/site/events", payload: { event: "star_add", target: missing } });
  const removed = await app.inject({ method: "POST", url: "/api/site/events", payload: { event: "star_remove", target: id } });
  const unknown = await app.inject({ method: "POST", url: "/api/site/events", payload: { event: "page_view", target: "/secret" } });
  const address = await app.inject({ method: "POST", url: "/api/site/events", payload: { event: "outbound_click", target: "http://10.1.2.3/a" } });
  const entered = await app.inject({ method: "POST", url: "/api/site/events", payload: { event: "enter_3d" } });
  const star = await app.inject({ method: "POST", url: "/api/site/events", payload: { event: "click_star", target: id } });
  const badStar = await app.inject({ method: "POST", url: "/api/site/events", payload: { event: "click_star", target: "bad id" } });
  const admin = await app.inject({ method: "GET", url: "/api/admin/analytics?days=7" });

  for (const res of [added, again, shared, outbound, unpublished, removed, unknown, address, entered, star, badStar]) {
    assert.equal(res.statusCode, 204);
    assert.equal(res.headers["cache-control"], "private, no-store");
    assert.equal(res.headers["cdn-cache-control"], "no-store");
  }
  assert.equal(admin.statusCode, 401, "analytics summaries require the existing admin session");

  const [stored] = await sql<{ target: string; count: number }[]>`
    SELECT target, count FROM site_events_daily
    WHERE day = (now() AT TIME ZONE 'Asia/Taipei')::date AND event = 'outbound_click' AND target = ${domain}`;
  assert.equal(stored?.count, 1);
  assert.equal(stored?.target, domain);
  const [leaked] = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM site_events_daily
    WHERE target LIKE '%token%' OR target LIKE '%10.1.2.3%' OR target = ${missing} OR event = 'page_view'`;
  assert.equal(leaked?.n, 0);

  const summary = await siteAnalyticsOverview(7);
  const stars = summary.engagement.totals.find((row) => row.event === "star_add");
  const removes = summary.engagement.totals.find((row) => row.event === "star_remove");
  const shares = summary.engagement.totals.find((row) => row.event === "share_click");
  const today = summary.engagement.daily.at(-1);
  const top = summary.engagement.topStarred.find((row) => row.id === id);
  assert.equal(summary.engagement.daily.length, 7);
  assert.equal(summary.engagement.totals.length, 11);
  assert.equal(stars?.count, 2);
  assert.equal(summary.engagement.totals.find((row) => row.event === "enter_3d")?.count, 1);
  assert.equal(summary.engagement.totals.find((row) => row.event === "click_star")?.count, 1);
  assert.equal(removes?.count, 1);
  assert.equal(shares?.count, 1);
  assert.equal(today?.counts.star_add, 2);
  assert.equal(summary.engagement.firstStarDevices, 3);
  assert.equal(top?.net, 1);
  assert.equal(top?.title, "互动示例");
});

test("made-up source domains cannot add more than a day's quota of rows", async () => {
  const today = sql`(now() AT TIME ZONE 'Asia/Taipei')::date`;
  const filler = Array.from({ length: 500 }, (_, i) => `f${i}.${id}.example`);
  await sql`DELETE FROM site_events_daily WHERE day = ${today} AND event = 'outbound_click'`;
  await sql`INSERT INTO site_events_daily (day, event, target, count)
    SELECT ${today}, 'outbound_click', t, 1 FROM unnest(${filler}::text[]) AS t`;

  await recordSiteEvent("outbound_click", `new.${id}.example`);
  await recordSiteEvent("outbound_click", filler[0]!);
  await recordSiteEvent("outbound_click", "");

  const rows = await sql<{ target: string; count: number }[]>`
    SELECT target, count FROM site_events_daily
    WHERE day = ${today} AND event = 'outbound_click' AND target IN (${`new.${id}.example`}, ${filler[0]!}, '')`;
  assert.deepEqual(Object.fromEntries(rows.map((r) => [r.target, r.count])), { [filler[0]!]: 2, "": 1 });
  await sql`DELETE FROM site_events_daily WHERE day = ${today} AND event = 'outbound_click' AND target = ''`;
});

test("made-up milestone ids cannot add more than a day's quota of voyage star clicks", async () => {
  const today = sql`(now() AT TIME ZONE 'Asia/Taipei')::date`;
  const filler = Array.from({ length: 400 }, (_, i) => `c${i.toString(36)}${id}`);
  await sql`DELETE FROM site_events_daily WHERE day = ${today} AND event = 'click_star' AND target LIKE ${`%${id}%`}`;
  await sql`INSERT INTO site_events_daily (day, event, target, count)
    SELECT ${today}, 'click_star', t, 1 FROM unnest(${filler}::text[]) AS t`;

  await recordSiteEvent("click_star", `n${id}`);
  await recordSiteEvent("click_star", filler[0]!);

  const rows = await sql<{ target: string; count: number }[]>`
    SELECT target, count FROM site_events_daily
    WHERE day = ${today} AND event = 'click_star' AND target IN (${`n${id}`}, ${filler[0]!})`;
  assert.deepEqual(Object.fromEntries(rows.map((r) => [r.target, r.count])), { [filler[0]!]: 2 });
  await sql`DELETE FROM site_events_daily WHERE day = ${today} AND event = 'click_star' AND target LIKE ${`%${id}%`}`;
});
