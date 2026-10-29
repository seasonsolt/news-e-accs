import "./setup.ts";
import assert from "node:assert/strict";
import { createVerify, generateKeyPairSync } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { addDays } from "@aihot/contracts/time";
import { weeklyReadings } from "@aihot/backend/admin/metrics";
import { config } from "@aihot/backend/config";
import { closeDb, sql } from "@aihot/backend/db";
import { lastFullWeek, pageSection, readSearchConsoleWeek } from "@aihot/backend/operations/search-console";
import { normalizeSiteEvent } from "@aihot/backend/site/analytics";
import { buildApp } from "../apps/api/src/app.ts";

const app = await buildApp();
const now = new Date();
const week = lastFullWeek(now);
const email = "weekly-readings@example.test";
const realFetch = globalThis.fetch;

after(async () => {
  globalThis.fetch = realFetch;
  Object.assign(config, { searchConsoleEnabled: false, searchConsoleProperty: null });
  delete process.env.SEARCH_CONSOLE_KEY_FILE;
  await sql`DELETE FROM search_console_weekly WHERE week = ${week.start}::date`;
  await sql`DELETE FROM site_pageviews_daily WHERE day BETWEEN ${week.start}::date AND ${week.end}::date AND path IN ('/story/:id', '/zh/daily/:issue')`;
  await sql`DELETE FROM newsletter_subscribers WHERE email = ${email}`;
  await app.close();
  await closeDb();
});

test("sections and weeks: the first part of the address, Monday to Sunday before this week", () => {
  assert.equal(pageSection("/story/:id"), "story");
  assert.equal(pageSection("/zh/daily/:issue"), "daily", "the Chinese edition counts with the English page");
  assert.equal(pageSection("/zh"), "home");
  assert.equal(pageSection("/"), "home");
  assert.deepEqual(lastFullWeek(new Date("2026-10-14T02:00:00Z")), { start: "2026-10-05", end: "2026-10-11" }, "a Wednesday");
  assert.deepEqual(lastFullWeek(new Date("2026-10-11T17:00:00Z")), { start: "2026-10-05", end: "2026-10-11" }, "Monday 01:00 in Beijing");
  assert.deepEqual(lastFullWeek(new Date("2026-10-11T15:00:00Z")), { start: "2026-09-28", end: "2026-10-04" }, "Sunday 23:00 in Beijing");
});

test("Search Console is read only when switched on, with a signed service-account token", async () => {
  assert.deepEqual(await readSearchConsoleWeek(now), { status: "disabled" });

  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const keyFile = path.join(mkdtempSync(path.join(tmpdir(), "search-console-")), "key.json");
  writeFileSync(keyFile, JSON.stringify({ client_email: "reader@project.iam.gserviceaccount.com", private_key: privateKey.export({ type: "pkcs8", format: "pem" }) }));
  process.env.SEARCH_CONSOLE_KEY_FILE = keyFile;
  Object.assign(config, { searchConsoleEnabled: true, searchConsoleProperty: "sc-domain:example.test" });

  const inspected: string[] = [];
  let tokens = 0;
  const realNow = Date.now;
  globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === "https://oauth2.googleapis.com/token") {
      const assertion = new URLSearchParams(String(init!.body)).get("assertion")!;
      const [header, claims, signature] = assertion.split(".");
      assert.ok(createVerify("RSA-SHA256").update(`${header}.${claims}`).verify(publicKey, signature!, "base64url"), "the assertion is signed with the service account's key");
      const claim = JSON.parse(Buffer.from(claims!, "base64url").toString());
      assert.equal(claim.iss, "reader@project.iam.gserviceaccount.com");
      assert.equal(claim.scope, "https://www.googleapis.com/auth/webmasters.readonly");
      tokens += 1;
      return Response.json({ access_token: "synthetic-token" });
    }
    assert.equal((init!.headers as Record<string, string>).authorization, "Bearer synthetic-token");
    const body = JSON.parse(String(init!.body));
    if (url === "https://www.googleapis.com/webmasters/v3/sites/sc-domain%3Aexample.test/searchAnalytics/query") {
      assert.deepEqual([body.startDate, body.endDate], [week.start, week.end]);
      // As if the run had gone on for most of an hour: the next call signs a new access token first.
      if (!body.dimensions) Date.now = () => realNow() + 50 * 60_000;
      if (!body.dimensions) return Response.json({ rows: [{ clicks: 12, impressions: 340 }] });
      if (body.dimensions.includes("query")) {
        assert.deepEqual(body.dimensions, ["page", "query"]);
        assert.equal(body.dataState, "final");
        return Response.json({ rows: [{ keys: ["https://example.test/story/a", "model release"], clicks: 3, impressions: 80, ctr: 0.0375, position: 8.2 }] });
      }
      return Response.json({ rows: [
        { keys: ["https://example.test/story/a"], clicks: 5, impressions: 100 },
        { keys: ["https://example.test/zh/story/b"], clicks: 2, impressions: 60 },
        { keys: ["https://example.test/daily/2026-10-05"], clicks: 5, impressions: 180 },
      ] });
    }
    assert.equal(url, "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect");
    assert.equal(body.siteUrl, "sc-domain:example.test");
    // The third inspection runs into the daily quota: the count stops where it is and is still kept.
    if (inspected.length === 2) return new Response("quota", { status: 429 });
    inspected.push(new URL(body.inspectionUrl).pathname);
    return Response.json({ inspectionResult: { indexStatusResult: inspected.length === 1
      ? { verdict: "PASS", coverageState: "Submitted and indexed" }
      : { verdict: "NEUTRAL", coverageState: "Crawled - currently not indexed" } } });
  }) as typeof fetch;

  const result = await readSearchConsoleWeek(now).finally(() => { Date.now = realNow; });
  assert.equal(tokens, 2, "a long run renews its access token");
  assert.deepEqual({ ...result, urls: undefined }, { status: "read", week: week.start, clicks: 12, impressions: 340, inspected: 2, indexed: 1, urls: undefined, stopped: 429 });
  const [row] = await sql<{ property: string; sections: Record<string, { clicks: number; impressions: number; inspected: number; indexed: number; reasons?: Record<string, number> }> }[]>`
    SELECT property, sections FROM search_console_weekly WHERE week = ${week.start}::date`;
  assert.equal(row!.property, "sc-domain:example.test");
  assert.deepEqual([row!.sections.story!.clicks, row!.sections.story!.impressions], [7, 160], "/zh/story counts with /story");
  assert.deepEqual([row!.sections.daily!.clicks, row!.sections.daily!.impressions], [5, 180]);
  const sections = Object.values(row!.sections);
  assert.deepEqual([sections.reduce((n, s) => n + s.inspected, 0), sections.reduce((n, s) => n + s.indexed, 0)], [2, 1]);
  assert.deepEqual(sections.flatMap((s) => Object.entries(s.reasons ?? {})), [["Crawled - currently not indexed", 1]], "a page not indexed is counted under Google's reason");
});

test("the weekly readings put views by section, subscribers and Search Console on one row a week", async () => {
  await sql`INSERT INTO site_pageviews_daily (day, path, views) VALUES
    (${week.start}::date, '/story/:id', 30), (${addDays(week.start, 2)}::date, '/story/:id', 10), (${week.end}::date, '/zh/daily/:issue', 4)
    ON CONFLICT (day, path) DO UPDATE SET views = EXCLUDED.views`;
  await sql`INSERT INTO newsletter_subscribers (email, status, token, confirmed_at, created_at)
    VALUES (${email}, 'confirmed', 'weekly-readings-token', ${`${addDays(week.start, 1)}T12:00:00+08:00`}, ${`${addDays(week.start, 1)}T11:00:00+08:00`})`;

  const readings = await weeklyReadings(4, now);
  assert.equal(readings.rows.length, 4);
  assert.equal(readings.rows[0]!.partial, true, "the current week comes first and is still going");
  const last = readings.rows[1]!;
  assert.deepEqual([last.week, last.end, last.partial], [week.start, week.end, false]);
  assert.ok(last.views >= 44 && (last.sections.story ?? 0) >= 40 && (last.sections.daily ?? 0) >= 4);
  assert.ok(last.days >= 3);
  assert.ok(last.confirmations >= 1 && last.signups >= 1 && last.subscribers >= 1);
  assert.ok(readings.rows[2]!.subscribers < last.subscribers || readings.rows[2]!.subscribers === last.subscribers - last.confirmations, "subscribers are counted at each week's end");
  assert.deepEqual([last.search?.clicks, last.search?.impressions, last.search?.inspected, last.search?.indexed], [12, 340, 2, 1]);
  assert.equal(readings.rows[2]!.search, null);
  assert.deepEqual(last.search?.pageQueries, { property: "sc-domain:example.test", rows: [{ page: "https://example.test/story/a", query: "model release", clicks: 3, impressions: 80, ctr: 0.0375, position: 8.2 }], limitReached: false });
  await sql`UPDATE search_console_weekly SET page_queries = NULL WHERE week = ${week.start}::date`;
  assert.equal((await weeklyReadings(4, now)).rows[1]!.search?.pageQueries, null, "old weeks stay unknown, not zero");

  assert.ok(last.confirmationsBySource.some((s) => s.source === null && s.count >= 1));
  await sql`UPDATE newsletter_subscribers SET signup_source = 'concept', signup_channel = 'share', unsubscribed_at = now() WHERE email = ${email}`;
  const afterUnsubscribe = (await weeklyReadings(4, now)).rows[1]!;
  assert.equal(afterUnsubscribe.confirmations, last.confirmations);
  assert.equal(afterUnsubscribe.distribution.find((c) => c.channel === "share")?.confirmations, 1);
  assert.ok(afterUnsubscribe.confirmationsBySource.some((s) => s.source === "concept" && s.count >= 1));

  assert.equal((await app.inject("/api/admin/metrics")).statusCode, 401, "the readings are for the admin only");
});

test("a failed page-query read keeps the week and any earlier snapshot", async () => {
  const snapshot = { property: "sc-domain:example.test", rows: [], limitReached: false };
  await sql`UPDATE search_console_weekly SET page_queries = ${sql.json(snapshot)} WHERE week = ${week.start}::date`;
  globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
    if (String(input) === "https://oauth2.googleapis.com/token") return Response.json({ access_token: "synthetic-token" });
    const body = JSON.parse(String(init!.body));
    if (body.inspectionUrl) return new Response("quota", { status: 429 });
    if (body.dimensions?.includes("query")) return new Response("busy", { status: 503 });
    return Response.json({ rows: body.dimensions ? [{ keys: ["https://example.test/story/a"], clicks: 1, impressions: 20 }] : [{ clicks: 21, impressions: 400 }] });
  }) as typeof fetch;
  const result = await readSearchConsoleWeek(now);
  assert.equal(result.status, "read");
  assert.match((result as { queriesError?: string }).queriesError ?? "", /page queries: HTTP 503/);
  const [row] = await sql<{ clicks: number; page_queries: unknown }[]>`SELECT clicks, page_queries FROM search_console_weekly WHERE week = ${week.start}::date`;
  assert.equal(row!.clicks, 21, "the week's totals are still written");
  assert.deepEqual(row!.page_queries, snapshot, "a failed rerun does not erase the earlier snapshot");
});

test("a failed inspection skips that URL and keeps the week; Google failing many ends the count", async () => {
  const answer = (inspection: (n: number) => Response) => {
    let calls = 0;
    globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
      if (String(input) === "https://oauth2.googleapis.com/token") return Response.json({ access_token: "synthetic-token" });
      const body = JSON.parse(String(init!.body));
      if (body.inspectionUrl) return inspection(++calls);
      return Response.json({ rows: body.dimensions ? [{ keys: ["https://example.test/story/a"], clicks: 1, impressions: 20 }] : [{ clicks: 33, impressions: 500 }] });
    }) as typeof fetch;
  };
  // One inspection fails, the next succeeds, then the quota runs out.
  answer((n) => n === 1 ? new Response("internal", { status: 500 })
    : n === 2 ? Response.json({ inspectionResult: { indexStatusResult: { verdict: "PASS" } } })
    : new Response("quota", { status: 429 }));
  const flaky = await readSearchConsoleWeek(now);
  assert.deepEqual([flaky.status, (flaky as { inspected?: number }).inspected, (flaky as { inspectionFailures?: number }).inspectionFailures, (flaky as { stopped?: unknown }).stopped], ["read", 1, 1, 429]);
  const [row] = await sql<{ clicks: number; inspected: number }[]>`SELECT clicks, inspected FROM search_console_weekly WHERE week = ${week.start}::date`;
  assert.deepEqual([row!.clicks, row!.inspected], [33, 1], "the week's figures are written");

  answer(() => new Response("internal", { status: 500 }));
  const down = await readSearchConsoleWeek(now) as { status: string; stopped?: unknown; inspectionFailures?: number };
  assert.deepEqual([down.status, down.stopped], ["read", "failures"]);
  assert.ok(down.inspectionFailures! >= 20 && down.inspectionFailures! < 25, "the lanes already waiting finish, no new inspection starts");
});

test("the readings carry query detail only for the newest detailed week and the week before it", async () => {
  const row = (query: string, impressions: number) => ({ page: "https://example.test/story/a", query, clicks: 1, impressions, ctr: 0.01, position: 5 });
  const snapshot = (...rows: ReturnType<typeof row>[]) => ({ property: "sc-domain:example.test", rows, limitReached: false });
  const [before, older] = [addDays(week.start, -7), addDays(week.start, -14)];
  await sql`UPDATE search_console_weekly SET page_queries = ${sql.json(snapshot(row("model release", 80)))} WHERE week = ${week.start}::date`;
  for (const [day, value] of [[before, snapshot(row("model release", 50), row("unrelated", 10))], [older, snapshot(row("model release", 40))]] as const) {
    await sql`INSERT INTO search_console_weekly (week, property, clicks, impressions, inspected, indexed, sections, page_queries)
      VALUES (${day}::date, 'sc-domain:example.test', 0, 0, 0, 0, '{}', ${sql.json(value)})`;
  }
  try {
    const [, latest, previous, oldest] = (await weeklyReadings(4, now)).rows;
    assert.deepEqual(latest!.search?.pageQueries?.rows.map((r) => r.query), ["model release"]);
    assert.deepEqual(previous!.search?.pageQueries?.rows.map((r) => [r.query, r.impressions]), [["model release", 50]], "the week before keeps only the shown candidates");
    assert.ok(oldest!.search, "an older week keeps its totals");
    assert.equal(oldest!.search!.pageQueries, null, "an older week's detail is not loaded");
  } finally {
    await sql`DELETE FROM search_console_weekly WHERE week IN (${before}::date, ${older}::date)`;
  }
});

test("distribution counters reject arbitrary channels and identifiers", () => {
  assert.deepEqual(normalizeSiteEvent({ event: "distribution_read", target: "share" }), { event: "distribution_read", target: "share" });
  for (const target of ["", "reader@example.com", "https://example.test", "unknown"]) assert.equal(normalizeSiteEvent({ event: "distribution_visit", target }), null);
});
