// Pushed X posts land as the collector's own candidates, on the account's existing source.
// X_PUSH_ONLY stops the paid search without making a source that is still being pushed look down.
import "./setup.ts";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { closeDb, sql } from "@aihot/backend/db";
import { IngestError, ingestItems } from "@aihot/backend/ingest/items";
import { QUEUES, stopBoss } from "@aihot/backend/jobs/queue";
import { upsertMaterial } from "@aihot/backend/content/materials";
import type { SdTweet } from "@aihot/backend/providers/socialdata";
import { collectSource, collectXShard, scheduleDueSources } from "@aihot/backend/sources/collect";
import { tweetToCandidate } from "@aihot/backend/sources/x";
import { tag } from "./setup.ts";

const T = tag();
let seq = 0;
const tweetId = () => `${Date.now()}${String(++seq).padStart(4, "0")}`.slice(0, 18);

after(async () => {
  delete process.env.X_PUSH_ONLY;
  await stopBoss();
  await closeDb();
});

async function xAccount(handle: string, opts: { id?: string; mode?: string; enabled?: boolean; health?: string; failing?: number; due?: boolean; cursor?: boolean } = {}) {
  const id = opts.id ?? `xin-${handle.toLowerCase()}-${T}`;
  await sql`
    INSERT INTO sources (id, name, kind, config, tier, participation_mode, interval_minutes, enabled, health, fail_count, last_ok_at, next_fetch_at, cursor)
    VALUES (${id}, ${`${handle} · X`}, 'x_search', ${sql.json({ query: `from:${handle} -filter:replies`, searchType: "Latest" })},
      'T1_5', ${opts.mode ?? "editorial"}, 60, ${opts.enabled ?? true}, ${opts.health ?? "ok"}, ${opts.failing ?? 0},
      ${new Date("2026-01-01T00:00:00Z")}, ${opts.due ? new Date(Date.now() - 2 * 3600_000) : new Date("2100-01-01T00:00:00Z")},
      ${opts.cursor ? sql.json({ initializedAt: "2026-01-01T00:00:00.000Z", lastTweetId: "1000" }) : null})`;
  return id;
}

function post(id: string, handle: string, text: string, extra: Record<string, unknown> = {}) {
  return {
    url: `https://twitter.com/${handle}/status/${id}`,
    publishedAt: "2026-10-14T01:23:45.000Z",
    x: {
      tweetId: id, handle, authorName: `${handle} Name`, text, lang: "en", createdAt: "2026-10-14T01:23:45.000Z",
      avatarUrl: `https://pbs.twimg.com/profile_images/${handle}_normal.jpg`,
      counts: { like: 11, retweet: 4, reply: 2, views: 90 },
      ...extra,
    },
  };
}

function nativeOf(id: string, handle: string, text: string, extra: Partial<SdTweet> = {}) {
  return tweetToCandidate({
    id_str: id, tweet_created_at: "2026-10-14T01:23:45.000Z", full_text: text, lang: "en",
    user: { name: `${handle} Name`, screen_name: handle, profile_image_url_https: `https://pbs.twimg.com/profile_images/${handle}_normal.jpg` },
    favorite_count: 11, retweet_count: 4, reply_count: 2, views_count: 90,
    ...extra,
  });
}

const lagging = (id: string) => sql<{ id: string }[]>`
  SELECT id FROM sources WHERE id = ${id} AND enabled AND kind NOT IN ('mp_account', 'external')
    AND (health = 'failing' OR next_fetch_at < now() - interval '30 minutes' OR last_ok_at < now() - make_interval(mins => greatest(interval_minutes * 6, 360)))`;

test("a pushed post matches the collector candidate and keeps the account's source", async () => {
  const handle = "OpenAI";
  const sourceId = await xAccount(handle, { health: "failing", failing: 4, due: true });
  const hot = await xAccount(handle, { id: `a-hot-${T}`, mode: "hot_signal" });
  const id = tweetId();
  const text = "Hello from the test";
  const native = nativeOf(id, handle, text, {
    extended_entities: { media: [{ type: "photo", media_url_https: "https://pbs.twimg.com/media/pic.jpg", original_info: { width: 1200, height: 675 } }] },
    quoted_status: {
      id_str: tweetId(), tweet_created_at: "2026-10-14T01:00:00.000Z", full_text: "Quoted text",
      user: { name: "Anthropic", screen_name: "AnthropicAI" },
      extended_entities: { media: [{ type: "video", media_url_https: "https://pbs.twimg.com/media/vid.jpg", original_info: { width: 640, height: 360 } }] },
    },
  });
  const quoted = native.xPost!.quoted!;
  const quotedId = /status\/(\d+)/.exec(quoted.url)![1]!;
  const result = await ingestItems({
    sourceId: `not-created-${T}`,
    items: [{
      url: `https://twitter.com/${handle}/status/${id}`,
      x: {
        tweetId: id, handle: handle.toLowerCase(), authorName: `${handle} Name`, text, lang: "en",
        createdAt: "2026-10-14T01:23:45.000Z",
        avatarUrl: `https://pbs.twimg.com/profile_images/${handle}_normal.jpg`,
        media: [{ type: "photo", url: "https://pbs.twimg.com/media/pic.jpg", width: 1200, height: 675 }],
        quoted: { tweetId: quotedId, handle: "AnthropicAI", authorName: "Anthropic", text: "Quoted text", media: [{ type: "video", url: "https://pbs.twimg.com/media/vid.jpg", width: 640, height: 360 }] },
        counts: { like: 11, retweet: 4, reply: 2, views: 90 },
      },
    }],
  });
  assert.equal(result.created, 1);
  assert.deepEqual(result.unmatched, []);
  const [row] = await sql<{
    source_id: string; identity_key: string; url: string; title: string; author: string; language: string;
    body_text: string; body_status: string; x_post: unknown; media: unknown; raw: unknown; tier: string; participation_mode: string;
  }[]>`
    SELECT a.source_id, a.identity_key, a.url, a.title, a.author, a.language, a.body_text, a.body_status, a.x_post, a.media, a.raw,
           s.tier, s.participation_mode
    FROM articles a JOIN sources s ON s.id = a.source_id WHERE a.identity_key = ${`x:${id}`}`;
  assert.equal(row!.source_id, sourceId);
  assert.notEqual(row!.source_id, hot);
  assert.equal(row!.tier, "T1_5");
  assert.equal(row!.participation_mode, "editorial");
  assert.equal(row!.identity_key, native.identityKey);
  assert.equal(row!.url, `https://x.com/${handle.toLowerCase()}/status/${id}`);
  assert.equal(row!.title, native.title);
  assert.equal(row!.author, handle.toLowerCase());
  assert.equal(row!.language, "en");
  assert.equal(row!.body_text, native.bodyText);
  assert.equal(row!.body_status, "ok");
  assert.equal((row!.x_post as { avatarUrl: string }).avatarUrl, "https://pbs.twimg.com/profile_images/OpenAI_bigger.jpg");
  assert.deepEqual(row!.x_post, { ...native.xPost, handle: handle.toLowerCase() });
  assert.deepEqual(row!.media, native.media);
  assert.deepEqual(row!.raw, { favorite: 11, retweet: 4, reply: 2, views: 90 });
  const [health] = await sql<{ health: string; fail_count: number; overdue: boolean }[]>`
    SELECT health, fail_count, next_fetch_at < now() - interval '30 minutes' AS overdue FROM sources WHERE id = ${sourceId}`;
  assert.deepEqual({ health: health!.health, fail_count: health!.fail_count, overdue: health!.overdue }, { health: "ok", fail_count: 0, overdue: false });
  assert.equal((await lagging(sourceId)).length, 0);
  const [run] = await sql<{ status: string; found_count: number; new_count: number }[]>`
    SELECT status, found_count, new_count FROM fetch_runs WHERE source_id = ${sourceId}`;
  assert.deepEqual(run, { status: "ok", found_count: 1, new_count: 1 });
  const [article] = await sql<{ id: string }[]>`SELECT id FROM articles WHERE identity_key = ${`x:${id}`}`;
  assert.deepEqual((await sql<{ name: string }[]>`SELECT name FROM pgboss.job WHERE data->>'articleId' = ${article!.id}`).map((j) => j.name), [QUEUES.analyze]);
  assert.equal((await sql`SELECT 1 FROM sources WHERE id = ${`not-created-${T}`}`).length, 0, "an unused sourceId is not created");

  const again = await ingestItems({ items: [post(id, handle.toLowerCase(), text)] });
  assert.equal(again.created, 0);
  assert.equal((await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM articles WHERE identity_key = ${`x:${id}`}`)[0]!.n, 1);
});

test("the same identity dedups a post the collector already stored", async () => {
  const sourceId = await xAccount("Dedup");
  const id = tweetId();
  const native = nativeOf(id, "Dedup", "Already collected");
  await upsertMaterial({ ...native, sourceId, via: "fetch" });
  const result = await ingestItems({ items: [post(id, "Dedup", "Already collected")] });
  assert.equal(result.created, 0);
  const rows = await sql<{ source_id: string }[]>`SELECT source_id FROM articles WHERE identity_key = ${`x:${id}`}`;
  assert.deepEqual(rows.map((r) => r.source_id), [sourceId]);
});

test("a pushed X Article is stored with the post and is not fetched again", async () => {
  const sourceId = await xAccount("Article");
  const id = tweetId();
  const link = "https://x.com/i/article/12345";
  const result = await ingestItems({
    items: [post(id, "Article", link, { article: { title: "A model release", text: "World Labs is joining AMD." } })],
  });
  assert.equal(result.created, 1);
  const [row] = await sql<{ id: string; title: string; body_text: string; body_status: string; x_article: { title: string; text: string } }[]>`
    SELECT id, title, body_text, body_status, x_article FROM articles WHERE source_id = ${sourceId}`;
  assert.equal(row!.title, "A model release");
  assert.equal(row!.body_status, "ok");
  assert.equal(row!.body_text, `${link}\n\n# A model release\n\nWorld Labs is joining AMD.`);
  assert.deepEqual(row!.x_article, { title: "A model release", text: "World Labs is joining AMD." });
  assert.deepEqual((await sql<{ name: string }[]>`SELECT name FROM pgboss.job WHERE data->>'articleId' = ${row!.id}`).map((j) => j.name), [QUEUES.analyze]);
});

test("an article link without text stays pending while SocialData search is on, and unconfirmed once it is off", async () => {
  await xAccount("Bare");
  const pending = tweetId();
  await ingestItems({ items: [post(pending, "Bare", "https://x.com/i/article/77")] });
  const [first] = await sql<{ id: string; body_status: string }[]>`SELECT id, body_status FROM articles WHERE identity_key = ${`x:${pending}`}`;
  assert.equal(first!.body_status, "pending");
  assert.deepEqual((await sql<{ name: string }[]>`SELECT name FROM pgboss.job WHERE data->>'articleId' = ${first!.id}`).map((j) => j.name), [QUEUES.extractBody]);

  process.env.X_PUSH_ONLY = "true";
  try {
    const quiet = tweetId();
    await ingestItems({ items: [post(quiet, "Bare", "https://x.com/i/article/88")] });
    const [second] = await sql<{ id: string; body_status: string }[]>`SELECT id, body_status FROM articles WHERE identity_key = ${`x:${quiet}`}`;
    assert.equal(second!.body_status, "unconfirmed");
    assert.deepEqual((await sql<{ name: string }[]>`SELECT name FROM pgboss.job WHERE data->>'articleId' = ${second!.id}`).map((j) => j.name), [QUEUES.analyze]);
    assert.equal((await sql`SELECT 1 FROM receipts WHERE service = 'socialdata'`).length, 0);
  } finally {
    delete process.env.X_PUSH_ONLY;
  }
});

test("unknown handles and bad posts are reported, and a paused account is left untouched", async () => {
  const pausedAt = new Date("2026-09-01T00:00:00Z");
  const paused = await xAccount("Paused", { enabled: false });
  await sql`UPDATE sources SET last_ok_at = ${pausedAt}, health = 'paused' WHERE id = ${paused}`;
  const id = tweetId();
  const result = await ingestItems({
    sourceId: `ghost-bin-${T}`,
    items: [
      post(id, "Nobody", "no such account"),
      { x: { tweetId: "not-a-tweet", handle: "OpenAI", authorName: "OpenAI", text: "bad" } },
      post(tweetId(), "Paused", "ignored while paused"),
    ],
  });
  assert.equal(result.created, 0);
  assert.equal(result.rejected, 1);
  assert.deepEqual(result.unmatched, ["Nobody", "Paused"]);
  assert.equal((await sql`SELECT 1 FROM articles WHERE identity_key = ${`x:${id}`}`).length, 0);
  assert.equal((await sql`SELECT 1 FROM sources WHERE id = ${`ghost-bin-${T}`}`).length, 0);
  const [source] = await sql<{ last_ok_at: Date; health: string }[]>`SELECT last_ok_at, health FROM sources WHERE id = ${paused}`;
  assert.equal(source!.last_ok_at.toISOString(), pausedAt.toISOString());
  assert.equal(source!.health, "paused");
});

test("a check with no new posts keeps the account from looking overdue", async () => {
  const quiet = await xAccount("Quiet", { health: "failing", failing: 3, due: true });
  assert.equal((await lagging(quiet)).length, 1);
  const result = await ingestItems({ checkedHandles: ["@Quiet", "missing-handle"] });
  assert.deepEqual(result, { ok: true, created: 0, rejected: 0, unmatched: ["missing-handle"] });
  assert.equal((await lagging(quiet)).length, 0);
  const [run] = await sql<{ status: string; found_count: number; new_count: number }[]>`
    SELECT status, found_count, new_count FROM fetch_runs WHERE source_id = ${quiet}`;
  assert.deepEqual(run, { status: "ok", found_count: 0, new_count: 0 });
});

test("a generic report is unchanged, and a mixed report keeps each item on its own source", async () => {
  const external = `ext-${T}`;
  assert.deepEqual(
    await ingestItems({ sourceId: external, sourceName: "My crawler", items: [{ title: "A link", url: `https://example.com/${T}/post` }] }),
    { ok: true, created: 1 },
  );
  const [made] = await sql<{ kind: string; tier: string; participation_mode: string }[]>`
    SELECT kind, tier, participation_mode FROM sources WHERE id = ${external}`;
  assert.deepEqual(made, { kind: "external", tier: "T2", participation_mode: "isolated" });

  const account = await xAccount("Mixed");
  const id = tweetId();
  const mixed = await ingestItems({
    sourceId: external,
    items: [
      { title: "Another link", url: `https://example.com/${T}/other` },
      post(id, "Mixed", "from the account"),
    ],
  });
  assert.equal(mixed.created, 2);
  assert.deepEqual(mixed.rejected, 0);
  const [xRow] = await sql<{ source_id: string }[]>`SELECT source_id FROM articles WHERE identity_key = ${`x:${id}`}`;
  const [link] = await sql<{ source_id: string }[]>`SELECT source_id FROM articles WHERE url = ${`https://example.com/${T}/other`}`;
  assert.equal(xRow!.source_id, account);
  assert.equal(link!.source_id, external);
});

test("too many items are refused, and a paused generic source rejects the whole report", async () => {
  await assert.rejects(
    ingestItems({ sourceId: `cap-${T}`, items: Array.from({ length: 51 }, (_, i) => ({ title: "t", url: `https://example.com/${T}/cap/${i}` })) }),
    (error: unknown) => error instanceof IngestError && error.status === 413,
  );
  await assert.rejects(
    ingestItems({ checkedHandles: Array.from({ length: 101 }, (_, i) => `h${i}`) }),
    (error: unknown) => error instanceof IngestError && error.status === 413,
  );
  const paused = `paused-ext-${T}`;
  const account = await xAccount("Kept");
  await sql`
    INSERT INTO sources (id, name, kind, config, tier, participation_mode, enabled, health)
    VALUES (${paused}, 'Paused', 'external', '{}'::jsonb, 'T2', 'editorial', false, 'paused')`;
  const id = tweetId();
  await assert.rejects(
    ingestItems({ sourceId: paused, items: [{ title: "No", url: `https://example.com/${T}/no` }, post(id, "Kept", "not stored")] }),
    (error: unknown) => error instanceof IngestError && error.status === 409,
  );
  assert.equal((await sql`SELECT 1 FROM articles WHERE source_id = ${account} OR url = ${`https://example.com/${T}/no`}`).length, 0);
});

test("X_PUSH_ONLY leaves RSS collection running and does not call SocialData", async () => {
  const rss = `rss-${T}`;
  const account = await xAccount("Skipped", { due: true, cursor: true });
  await sql`
    INSERT INTO sources (id, name, kind, config, participation_mode, enabled, next_fetch_at)
    VALUES (${rss}, 'Feed', 'rss', ${sql.json({ feedUrl: "https://example.com/feed.xml" })}, 'editorial', true, now() - interval '1 minute')`;
  process.env.X_PUSH_ONLY = "true";
  try {
    const scheduled = await scheduleDueSources();
    assert.equal(scheduled.shards, 0);
    const jobs = await sql<{ name: string; data: { sourceId?: string; sourceIds?: string[] } }[]>`
      SELECT name, data FROM pgboss.job
      WHERE name IN (${QUEUES.fetchSource}, ${QUEUES.fetchXShard})
        AND (data->>'sourceId' IN (${rss}, ${account}) OR data->'sourceIds' ? ${account})`;
    assert.deepEqual(jobs.map((j) => j.data.sourceId), [rss]);
    const [stillDue] = await sql<{ overdue: boolean }[]>`SELECT next_fetch_at < now() AS overdue FROM sources WHERE id = ${account}`;
    assert.equal(stillDue!.overdue, true, "skipping the search does not pretend the account was fetched");
    assert.equal((await collectSource(account, { force: true })).status, "skipped");
    assert.equal((await collectXShard(`editorial:${T}`, [account])).status, "skipped");
    assert.equal((await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM fetch_runs WHERE source_id = ${account}`)[0]!.n, 0);
    assert.equal((await sql`SELECT 1 FROM receipts WHERE service = 'socialdata'`).length, 0);
  } finally {
    delete process.env.X_PUSH_ONLY;
  }
});
