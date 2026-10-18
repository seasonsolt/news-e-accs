import "./setup.ts";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { closeDb, sql } from "@aihot/backend/db";
import { siteAnalyticsOverview } from "@aihot/backend/admin/analytics";
import { subscribeErrorReason, subscribeEventTarget } from "@aihot/contracts/subscribe";
import { subscribeFunnel } from "@aihot/backend/admin/analytics";
import { SITE_EVENTS, normalizeSiteEvent, normalizeSourceDomain, recordSiteEvent } from "@aihot/backend/site/analytics";
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
    OR (target = '' AND event IN ('share_click', 'first_star'))`;
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
  assert.equal(normalizeSiteEvent({ event: "subscribe_submit" }), null);
  assert.deepEqual(normalizeSiteEvent({ event: "subscribe_submit", target: "daily_inline:zh" }), { event: "subscribe_submit", target: "daily_inline:zh" });
  assert.equal(normalizeSiteEvent({ event: "subscribe_submit", target: "user@example.com" }), null);
  assert.equal(normalizeSiteEvent({ event: "subscribe_view", target: "not_a_source:zh" }), null);
  assert.equal(normalizeSiteEvent({ event: "subscribe_view", target: "daily_inline:zh:cap" }), null);
  assert.equal(normalizeSiteEvent({ event: "subscribe_error", target: "daily_inline:zh" }), null);
  assert.deepEqual(normalizeSiteEvent({ event: "subscribe_error", target: "item_inline:en:503" }), { event: "subscribe_error", target: "item_inline:en:503" });
  assert.equal(normalizeSiteEvent({ event: "subscribe_error", target: "item_inline:en:user@example.com" }), null);
  assert.equal(normalizeSiteEvent({ event: "first_star", target: id }), null);
  assert.equal(normalizeSiteEvent({ event: "subscribe_click", target: "user@example.com" }), null);
  assert.equal(subscribeErrorReason(429, { retryAfter: 3600 }), "cap");
  assert.equal(subscribeErrorReason(429, { retryAfter: 60 }), "rate");
  assert.equal(subscribeErrorReason(503, {}), "503");
  assert.equal(subscribeErrorReason(0), "network");
  assert.equal(subscribeEventTarget("subscribe_error", { source: "daily_inline", locale: "zh", reason: "" }), null);
  assert.equal(normalizeSiteEvent({ event: "not_an_event" }), null);
  assert.equal(normalizeSiteEvent({ event: "share_click", target: "x".repeat(301) }), null);
  assert.equal(normalizeSiteEvent(null), null);
  assert.equal(normalizeSourceDomain(`https://user:secret@www.${domain}/path?token=1`), null);
  assert.equal(normalizeSourceDomain(`https://www.${domain}/items/${id}?email=a@b.c`), domain);
  assert.equal(normalizeSourceDomain(`WWW.${domain}.`), domain);
  assert.equal(normalizeSourceDomain(""), "");
  assert.equal(normalizeSourceDomain("http://192.168.1.1/a"), null);
  assert.equal(normalizeSourceDomain("192.168.1.1"), null);
});

test("daily interaction counts are anonymous, uncached, and visible only in the admin summary", async () => {
  await sql`DELETE FROM site_events_daily WHERE target IN (${id}, ${domain}) OR event IN ('share_click', 'first_star')`;
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
  const admin = await app.inject({ method: "GET", url: "/api/admin/analytics?days=7" });

  for (const res of [added, again, shared, outbound, unpublished, removed, unknown, address]) {
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
  assert.equal(summary.engagement.totals.length, SITE_EVENTS.length);
  assert.equal(stars?.count, 2);
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

test("the subscribe funnel counts source, locale and failure reason, and never an address", async () => {
  const events = ["subscribe_view", "subscribe_submit", "subscribe_success", "subscribe_error", "subscribe_confirmed", "subscribe_dismiss"];
  const targets = ["daily_inline:zh", "item_inline:en", "home_overlay:zh", "sticky_mobile:en", "daily_inline:zh:cap", "item_inline:en:503", "user@example.com"];
  const today = sql`(now() AT TIME ZONE 'Asia/Taipei')::date`;
  await sql`DELETE FROM site_events_daily WHERE event = ANY(${events}::text[]) AND target = ANY(${targets}::text[])`;
  try {
    const accepted = await app.inject({ method: "POST", url: "/api/site/events", payload: { event: "subscribe_view", target: "daily_inline:zh" } });
    const again = await app.inject({ method: "POST", url: "/api/site/events", payload: { event: "subscribe_view", target: "daily_inline:zh" } });
    const submitted = await app.inject({ method: "POST", url: "/api/site/events", payload: { event: "subscribe_submit", target: "daily_inline:zh" } });
    const ok = await app.inject({ method: "POST", url: "/api/site/events", payload: { event: "subscribe_success", target: "daily_inline:zh" } });
    const cap = await app.inject({ method: "POST", url: "/api/site/events", payload: { event: "subscribe_error", target: "daily_inline:zh:cap" } });
    const down = await app.inject({ method: "POST", url: "/api/site/events", payload: { event: "subscribe_error", target: "item_inline:en:503" } });
    const address = await app.inject({ method: "POST", url: "/api/site/events", payload: { event: "subscribe_submit", target: "user@example.com" } });
    const bare = await app.inject({ method: "POST", url: "/api/site/events", payload: { event: "subscribe_submit" } });
    const admin = await app.inject({ method: "GET", url: "/api/admin/analytics/subscribe?days=7" });
    for (const res of [accepted, again, submitted, ok, cap, down, address, bare]) assert.equal(res.statusCode, 204);
    assert.equal(admin.statusCode, 401, "the funnel uses the same admin session as the other statistics");

    await sql`INSERT INTO site_events_daily (day, event, target, count) VALUES (${today}, 'subscribe_submit', 'user@example.com', 4)`;
    const funnel = await subscribeFunnel(7);
    const text = JSON.stringify(funnel);
    assert.equal(text.includes("@"), false);
    assert.equal(text.includes("example.com"), false);
    const view = funnel.totals.find((row) => row.event === "subscribe_view" && row.source === "daily_inline" && row.locale === "zh");
    const submit = funnel.totals.find((row) => row.event === "subscribe_submit" && row.source === "daily_inline" && row.locale === "zh");
    const success = funnel.totals.find((row) => row.event === "subscribe_success" && row.source === "daily_inline");
    const capped = funnel.totals.find((row) => row.event === "subscribe_error" && row.reason === "cap");
    const failed = funnel.totals.find((row) => row.event === "subscribe_error" && row.reason === "503");
    assert.equal(funnel.days, 7);
    assert.equal(funnel.daily.length, 7);
    assert.equal(view?.count, 2);
    assert.equal(view?.reason, "");
    assert.equal(submit?.count, 1);
    assert.equal(success?.count, 1);
    assert.equal(capped?.source, "daily_inline");
    assert.equal(capped?.locale, "zh");
    assert.equal(failed?.source, "item_inline");
    assert.equal(failed?.locale, "en");
    const todayRow = funnel.daily.at(-1);
    assert.equal(todayRow?.counts.find((row) => row.event === "subscribe_view")?.count, 2);
  } finally {
    await sql`DELETE FROM site_events_daily WHERE event = ANY(${events}::text[]) AND target = ANY(${targets}::text[])`;
  }
});


test("event collection starts at its first recorded day, outside the selected window too", async () => {
  await sql`DELETE FROM site_events_daily WHERE event IN ('share_click', 'subscribe_confirmed')`;
  await sql`INSERT INTO site_events_daily (day, event, target, count) VALUES
    ((now() AT TIME ZONE 'Asia/Taipei')::date - 2, 'share_click', '', 1),
    ((now() AT TIME ZONE 'Asia/Taipei')::date - 40, 'subscribe_confirmed', 'concept:en', 1)`;
  const summary = await siteAnalyticsOverview(7);
  assert.equal(summary.engagement.daily[0]!.counts.share_click, null);
  assert.equal(summary.engagement.daily.at(-1)!.counts.share_click, 0);
  assert.equal(summary.engagement.firstDays.share_click, summary.engagement.daily.at(-3)!.day);
  const funnel = await subscribeFunnel(7);
  assert.ok(funnel.firstDays.subscribe_confirmed! < funnel.daily[0]!.day);
});
