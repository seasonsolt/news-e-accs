import { tag } from "./setup.ts";
import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { randomUUID } from "node:crypto";
import { addDays, beijingDate, beijingDayEnd } from "@aihot/contracts/time";
import { FEATURES } from "@aihot/industry/features";
import { closeDb, sql } from "@aihot/backend/db";
import { stopBoss } from "@aihot/backend/jobs/queue";
import { pruneHotRankings } from "@aihot/backend/events/hot";
import { hotRankingAt, type HotEntry } from "@aihot/backend/events/hot-read";
import { invalidateLeaderboard, runView } from "@aihot/backend/leaderboard/read";
import { upsertMaterial } from "@aihot/backend/content/materials";
import { publishArticle } from "@aihot/backend/publication/publish";
import { buildApp } from "../apps/api/src/app.ts";

const T = tag();
const SOURCE = `time-machine-${T}`;
const today = beijingDate(Date.now());
const D = addDays(today, -2);
const past = addDays(D, -1);
const app = await buildApp();
const rankings: number[] = [];
const runs = [`tm-old-${T}`, `tm-new-${T}`];
const reportKeys = [addDays(D, -5), D, addDays(D, 1)];

before(async () => {
  await sql`INSERT INTO sources (id, name, kind, tier, participation_mode, next_fetch_at) VALUES (${SOURCE}, 'Time machine test', 'rss', 'T1', 'editorial', '2100-01-01')`;
});
after(async () => {
  await sql`DELETE FROM hot_rankings WHERE id = ANY(${rankings}::bigint[])`;
  await sql`DELETE FROM lb_runs WHERE id = ANY(${runs})`;
  await sql`DELETE FROM reports WHERE kind = 'daily' AND content->>'test' = ${T}`;
  invalidateLeaderboard();
  await app.close();
  await stopBoss();
  await closeDb();
});

async function ranking(date: string, time: string, published = true) {
  const entry: HotEntry = { rank: 1, storyId: 0, storyPublicId: randomUUID(), title: `Archive ${T} ${time}`, heat: 42, trend: "flat", trendPct: null, badges: [], participantCount: 0, sourceCount: 0, signalCount: 0, reportCount: 0, sourceNames: [], latestAt: `${date}T${time}:00+08:00`, firstReportAt: `${date}T${time}:00+08:00`, representativeItemId: null, representativeUrl: null, representativeSource: null, participants: [] };
  const [row] = await sql<{ id: number }[]>`INSERT INTO hot_rankings (computed_at, rule_version, entries, published) VALUES (${new Date(`${date}T${time}:00+08:00`)}, ${T}, ${sql.json([entry] as never)}, ${published}) RETURNING id`;
  rankings.push(row!.id);
  return row!.id;
}

async function get(url: string) {
  const res = await app.inject({ method: "GET", url });
  assert.equal(res.headers["set-cookie"], undefined);
  return res;
}

test("historical hot uses the last published ranking before Beijing day end", async () => {
  await ranking(past, "10:00");
  const last = await ranking(past, "23:00");
  await ranking(past, "23:30", false);
  await ranking(D, "09:00");
  assert.equal((await hotRankingAt(beijingDayEnd(past)))?.id, last);
  const res = await get(`/api/site/hot?at=${past}`);
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().entries[0].story.title, `Archive ${T} 23:00`);
  assert.equal(res.json().computedAt, `${past}T15:00:00.000Z`);
  assert.match(String(res.headers["cache-control"]), /s-maxage=86400/);
});

test("pruning keeps every recent ranking and only each old day's last published one", async () => {
  const old = addDays(today, -40);
  const recent = addDays(today, -5);
  const ids = [await ranking(old, "10:00"), await ranking(old, "20:00"), await ranking(old, "23:00")];
  const unpublished = await ranking(old, "23:30", false);
  const tie = await ranking(old, "23:00");
  const recentIds = [await ranking(recent, "10:00"), await ranking(recent, "23:00")];
  await pruneHotRankings(new Date());
  const rows = await sql<{ id: number }[]>`SELECT id FROM hot_rankings WHERE id = ANY(${[...ids, unpublished, tie, ...recentIds]}::bigint[]) ORDER BY id`;
  assert.deepEqual(rows.map((r) => r.id), [tie, ...recentIds]);
});

test("leaderboard picks an earlier published run without displacing live cache", { skip: !FEATURES.leaderboard }, async () => {
  const summary = { consensus: { input: [{ board: "overall", registry: {}, signals: [] }], boards: [] } };
  await sql`INSERT INTO lb_runs (id, methodology_version, generated_at, summary) VALUES (${runs[0]!}, 'test', ${new Date(`${past}T12:00:00+08:00`)}, ${sql.json(summary as never)}), (${runs[1]!}, 'test', ${new Date(`${D}T09:00:00+08:00`)}, ${sql.json(summary as never)})`;
  invalidateLeaderboard();
  assert.equal((await runView(beijingDayEnd(past))).info.id, runs[0]);
  const live = await runView();
  assert.equal((await runView(beijingDayEnd(D))).info.id, runs[1]);
  assert.equal((await runView()).info.id, live.info.id);
  assert.equal((await get(`/api/site/leaderboard/boards/overall?at=${past}`)).json().run.id, runs[0]);
  assert.equal((await get("/api/site/leaderboard/boards/overall?at=0001-01-01")).statusCode, 404);
});

test("historical timeline gates future releases, has no refresh and binds its cursor to the date", async () => {
  const ids: string[] = [];
  for (let i = 0; i < 3; i++) {
    const { articleId } = await upsertMaterial({ sourceId: SOURCE, url: `https://example.com/${T}/${i}`, title: `Time machine ${i}`, bodyText: "Test body", bodyStatus: "ok", via: "fetch", publishedAt: new Date(`${past}T12:00:00+08:00`) });
    await sql`INSERT INTO analyses (article_id, input_revision, origin, relevance, category, title_zh, summary_zh, score, selected) VALUES (${articleId}, 1, 'rule', 'pass', 'ai-models', ${`Archive item ${i}`}, 'Test summary', 90, true)`;
    await publishArticle(articleId, { releasedAt: new Date(`${past}T12:00:00+08:00`) });
    await sql`UPDATE publications SET visible_after = ${i === 2 ? new Date(`${D}T00:00:00+08:00`) : new Date(`${past}T12:00:00+08:00`)} WHERE article_id = ${articleId}`;
    ids.push(articleId);
  }
  const res = await get(`/api/site/timeline?at=${past}&limit=40`);
  assert.equal(res.statusCode, 200);
  const body = res.json();
  const found = body.cards.map((c: { item: { id: string } }) => c.item.id);
  assert.ok(found.includes(ids[0]) && found.includes(ids[1]));
  assert.ok(!found.includes(ids[2]));
  assert.equal(body.refreshAt, null);
  assert.equal(body.filters.at, past);
  const first = (await get(`/api/site/timeline?at=${past}&limit=1`)).json();
  assert.ok(first.nextCursor);
  assert.equal((await get(`/api/site/timeline?at=${D}&cursor=${encodeURIComponent(first.nextCursor)}`)).statusCode, 400);
  assert.equal((await get(`/api/site/timeline?at=${past}&cursor=${encodeURIComponent(first.nextCursor)}`)).statusCode, 200);
});

test("API rejects invalid/future days, while today is the live view", async () => {
  for (const path of ["/api/site/hot", "/api/site/timeline", ...(FEATURES.leaderboard ? ["/api/site/leaderboard/boards/overall", "/api/site/leaderboard/models/test"] : [])]) {
    for (const date of ["bad", "2026-02-30", addDays(today, 1)]) assert.equal((await get(`${path}?at=${date}`)).statusCode, 400, `${path} ${date}`);
  }
  const live = await get("/api/site/hot");
  const atToday = await get(`/api/site/hot?at=${today}`);
  assert.equal(atToday.statusCode, live.statusCode);
  assert.deepEqual(atToday.json(), live.json());
  const tl = (await get("/api/site/timeline")).json();
  const tlToday = (await get(`/api/site/timeline?at=${today}`)).json();
  delete tl.generatedAt;
  delete tlToday.generatedAt;
  assert.deepEqual(tlToday, tl);
});

test("report lookup returns the newest key not later than the selected day", async () => {
  for (const key of reportKeys) await sql`INSERT INTO reports (kind, key, window_start, window_end, content, generated_at, origin) VALUES ('daily', ${key}, ${new Date(`${key}T00:00:00+08:00`)}, ${beijingDayEnd(key)}, ${sql.json({ test: T, sections: [], flashes: [] })}, ${new Date(`${key}T08:00:00+08:00`)}, 'manual') ON CONFLICT (kind, key) DO NOTHING`;
  const res = await get(`/api/site/reports/daily/at/${D}`);
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().key, D);
  assert.equal((await get(`/api/site/reports/daily/at/${addDays(D, -1)}`)).json().key, reportKeys[0]);
});

test("chronicle data and bounds expose complete anonymous fields", async () => {
  const res = await get("/api/site/chronicle/bounds");
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.deepEqual(Object.keys(body).sort(), ["daily", "earliest", "feed", "hot", "kardashev", "leaderboard", "today"]);
  assert.ok(typeof body.kardashev === "number" && body.kardashev > 0.6 && body.kardashev < 0.8, String(body.kardashev));
  assert.equal(body.today, today);
  for (const key of ["earliest", "feed", "hot", "leaderboard", "daily"]) assert.ok(body[key] === null || /^\d{4}-\d{2}-\d{2}$/.test(body[key]));
  const chronicle = await get("/api/site/chronicle");
  assert.equal(chronicle.statusCode, 200);
  for (const key of ["eras", "milestones", "metrics"]) assert.ok(Array.isArray(chronicle.json()[key]));
});
