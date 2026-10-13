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
  globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === "https://oauth2.googleapis.com/token") {
      const assertion = new URLSearchParams(String(init!.body)).get("assertion")!;
      const [header, claims, signature] = assertion.split(".");
      assert.ok(createVerify("RSA-SHA256").update(`${header}.${claims}`).verify(publicKey, signature!, "base64url"), "the assertion is signed with the service account's key");
      const claim = JSON.parse(Buffer.from(claims!, "base64url").toString());
      assert.equal(claim.iss, "reader@project.iam.gserviceaccount.com");
      assert.equal(claim.scope, "https://www.googleapis.com/auth/webmasters.readonly");
      return Response.json({ access_token: "synthetic-token" });
    }
    assert.equal((init!.headers as Record<string, string>).authorization, "Bearer synthetic-token");
    const body = JSON.parse(String(init!.body));
    if (url === "https://www.googleapis.com/webmasters/v3/sites/sc-domain%3Aexample.test/searchAnalytics/query") {
      assert.deepEqual([body.startDate, body.endDate], [week.start, week.end]);
      if (!body.dimensions) return Response.json({ rows: [{ clicks: 12, impressions: 340 }] });
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
    return Response.json({ inspectionResult: { indexStatusResult: { verdict: inspected.length === 1 ? "PASS" : "NEUTRAL" } } });
  }) as typeof fetch;

  const result = await readSearchConsoleWeek(now);
  assert.deepEqual({ ...result, urls: undefined }, { status: "read", week: week.start, clicks: 12, impressions: 340, inspected: 2, indexed: 1, urls: undefined, stopped: 429 });
  const [row] = await sql<{ property: string; sections: Record<string, { clicks: number; impressions: number; inspected: number; indexed: number }> }[]>`
    SELECT property, sections FROM search_console_weekly WHERE week = ${week.start}::date`;
  assert.equal(row!.property, "sc-domain:example.test");
  assert.deepEqual([row!.sections.story!.clicks, row!.sections.story!.impressions], [7, 160], "/zh/story counts with /story");
  assert.deepEqual([row!.sections.daily!.clicks, row!.sections.daily!.impressions], [5, 180]);
  const sections = Object.values(row!.sections);
  assert.deepEqual([sections.reduce((n, s) => n + s.inspected, 0), sections.reduce((n, s) => n + s.indexed, 0)], [2, 1]);
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

  assert.equal((await app.inject("/api/admin/metrics")).statusCode, 401, "the readings are for the admin only");
});
