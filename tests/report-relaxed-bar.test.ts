import { editionAt, tag } from "./setup.ts";
// A quiet window's daily lowers the selection bar step by step until it has six events; it takes only
// reports that missed on their score, and a busy window takes none. Its lead is news, not a how-to or an
// opinion, and equally important events never rank by their random ids (2026-11-15: three fill-ins tied
// and a media repost of a three-day-old how-to led on its id).
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { closeDb, sql } from "@aihot/backend/db";
import { upsertMaterial } from "@aihot/backend/content/materials";
import { stopBoss } from "@aihot/backend/jobs/queue";
import { publishArticle } from "@aihot/backend/publication/publish";
import { arrangeDaily, dailyEdition } from "@aihot/backend/reports/edition";

const T = tag();
const SOURCE = { T1: `test-relaxed-t1-${T}`, T2: `test-relaxed-t2-${T}`, EXCLUDE_MP: `test-relaxed-mp-${T}` };
/** A company's X account usually liked 100 times, and one usually liked 10 times. */
const X_LIKED = `test-relaxed-x-liked-${T}`;
const X_QUIET = `test-relaxed-x-quiet-${T}`;

before(async () => {
  for (const [tier, id] of Object.entries(SOURCE)) {
    await sql`INSERT INTO sources (id, name, kind, tier, participation_mode, next_fetch_at)
              VALUES (${id}, ${`Relaxed bar ${tier}`}, 'rss', ${tier}, 'editorial', '2100-01-01')`;
  }
  for (const id of [X_LIKED, X_QUIET]) {
    await sql`INSERT INTO sources (id, name, kind, tier, participation_mode, owner_entity_id, next_fetch_at)
              VALUES (${id}, ${`Relaxed ${id}`}, 'x_search', 'T1_5', 'editorial', 'openai', '2100-01-01')`;
  }
});
after(async () => {
  await stopBoss();
  await closeDb();
});

async function report(date: string, label: string, tier: keyof typeof SOURCE, score: number, opts: { selected?: boolean; addsValue?: boolean; category?: string; secondsBefore?: number; sourceId?: string; likes?: number; factId?: number } = {}): Promise<string> {
  const at = editionAt("daily", date, -(opts.secondsBefore ?? 120));
  const { articleId } = await upsertMaterial({
    sourceId: opts.sourceId ?? SOURCE[tier], url: `https://example.com/relaxed-${T}-${date}-${label}`, title: `Relaxed ${label}`,
    bodyText: `Relaxed ${label} body`, bodyStatus: "ok", publishedAt: at, discoveredAt: at, via: "fetch",
    ...(opts.likes === undefined ? {} : { raw: { favorite: opts.likes, retweet: 0, views: 0 } }),
  });
  await sql`INSERT INTO analyses (article_id, input_revision, origin, relevance, category, title, summary, editorial_language, score, selected)
            VALUES (${articleId}, 1, 'rule', 'pass', ${opts.category ?? "industry"}, ${`Headline ${label}`}, ${`Summary ${label}`}, 'en', ${score}, ${opts.selected ?? false})`;
  await sql`UPDATE articles SET grouping_status = 'complete', grouped_at = ${at}, selection_adds_value = ${opts.addsValue ?? true} WHERE id = ${articleId}`;
  if (opts.factId !== undefined) await sql`INSERT INTO fact_articles (fact_id, article_id, role) VALUES (${opts.factId}, ${articleId}, 'report')`;
  await publishArticle(articleId, { now: at, releasedAt: at });
  return articleId;
}

const window = (date: string) => [editionAt("daily", date, -86400), editionAt("daily", date)] as const;

test("a quiet daily relaxes every tier's bar a step at a time and stops once it has six events", async () => {
  const date = "2019-06-02";
  const lead = await report(date, "lead", "T2", 80, { selected: true });
  const step1 = [await report(date, "t2-74", "T2", 74), await report(date, "t2-72", "T2", 72), await report(date, "t1-56", "T1", 56)];
  const step2 = [await report(date, "t2-69", "T2", 69), await report(date, "t2-66", "T2", 66)];
  const beyond = [await report(date, "t2-60", "T2", 60), await report(date, "t2-52", "T2", 52)];
  const never = [
    await report(date, "no-new-value", "T2", 75, { addsValue: false }),
    await report(date, "unscored-tier", "EXCLUDE_MP", 75),
    await report(date, "below-floor", "T1", 45),
  ];

  const edition = await dailyEdition(date, ...window(date));
  const carried = new Set(edition.entries.map((e) => e.entry.itemId));
  for (const id of [lead, ...step1, ...step2]) assert.equal(carried.has(id), true, id);
  for (const id of [...beyond, ...never]) assert.equal(carried.has(id), false, id);
  assert.equal(edition.stats.relaxedBy, 10);
  assert.equal(edition.stats.events, 6);
  assert.equal(edition.stats.repeatsSuppressed, 0, "added reports are not counted against repeats");
  assert.equal(edition.entries[0]!.entry.itemId, lead, "a selected report still leads");
  assert.ok(edition.entries.filter((e) => e.entry.itemId !== lead).every((e) => e.entry.fillIn === true));
});

test("a daily with six events keeps the bar where it is", async () => {
  const date = "2019-06-09";
  for (let i = 0; i < 6; i++) await report(date, `selected-${i}`, "T2", 80 + i, { selected: true });
  const near = await report(date, "near", "T2", 74);

  const edition = await dailyEdition(date, ...window(date));
  assert.equal(edition.entries.some((e) => e.entry.itemId === near), false);
  assert.equal(edition.stats.relaxedBy, 0);
  assert.equal(edition.stats.fillIns, 0);
});

test("a quiet daily leads with news before a better scored how-to, and ties go to the earlier report", async () => {
  const date = "2019-06-16";
  const howTo = await report(date, "how-to", "T2", 74, { category: "tip", secondsBefore: 300 });
  const later = await report(date, "later-news", "T2", 71, { secondsBefore: 600 });
  const earlier = await report(date, "earlier-news", "T2", 71, { category: "paper", secondsBefore: 3600 });

  const edition = await dailyEdition(date, ...window(date));
  assert.deepEqual(edition.entries.map((e) => e.entry.itemId), [howTo, earlier, later]);
  const { main, flashes } = arrangeDaily(edition.entries);
  assert.deepEqual(main.map((e) => e.entry.itemId), [earlier, howTo], "the first news leads; the how-to keeps its place after it");
  assert.deepEqual(flashes.map((e) => e.entry.itemId), [later], "two entries per source at most");
  assert.deepEqual(arrangeDaily(edition.entries.filter((e) => e.entry.itemId === howTo)).main.map((e) => e.entry.itemId), [howTo], "an issue of commentary alone still has a lead");
});

test("a lead whose event a post leads cites the event's article instead, and lists the post under it", async () => {
  const date = "2019-06-30";
  const [story] = await sql<{ id: number }[]>`INSERT INTO stories (public_id, title, summary) VALUES (gen_random_uuid(), 'Lead launch', 'Lead launch') RETURNING id`;
  const [fact] = await sql<{ id: number }[]>`INSERT INTO facts (public_id, story_id, title) VALUES (gen_random_uuid(), ${story!.id}, 'Lead launch') RETURNING id`;
  const post = await report(date, "lead-post", "T2", 90, { selected: true, sourceId: X_QUIET, factId: fact!.id });
  const article = await report(date, "lead-article", "T2", 82, { selected: true, factId: fact!.id, secondsBefore: 60 });
  const second = await report(date, "second-post", "T2", 85, { selected: true, sourceId: X_LIKED });

  const edition = await dailyEdition(date, ...window(date));
  const launch = edition.entries.find((e) => e.storyId === story!.id)!;
  assert.equal(launch.entry.itemId, post, "the post still represents its event while the issue is ranked");
  const { main } = arrangeDaily(edition.entries);
  assert.equal(main[0]!.entry.itemId, article, "the lead cites the article");
  assert.equal(main[0]!.entry.title, "Headline lead-article");
  assert.deepEqual(main[0]!.entry.related?.map((r) => r.itemId), [post]);
  assert.equal(main.find((e) => e.entry.itemId === second)?.entry.itemId, second, "a post that does not lead keeps its place");
});

test("a company's X post liked far above its usual count raises its event; an account with few likes does not", async () => {
  const date = "2019-06-23";
  const day = 86400;
  for (let i = 1; i <= 5; i++) {
    await report(date, `liked-usual-${i}`, "T2", 40, { sourceId: X_LIKED, likes: 100, secondsBefore: (i + 1) * day });
    await report(date, `quiet-usual-${i}`, "T2", 40, { sourceId: X_QUIET, likes: 10, secondsBefore: (i + 1) * day });
  }
  // 8× its usual likes: +9, past a better scored report. Ten times a usual 10 likes earns nothing.
  const surge = await report(date, "surge", "T2", 70, { sourceId: X_LIKED, likes: 800, selected: true, secondsBefore: 600 });
  const media = await report(date, "media", "T2", 75, { selected: true, secondsBefore: 900 });
  const quiet = await report(date, "quiet-surge", "T2", 72, { sourceId: X_QUIET, likes: 100, selected: true, secondsBefore: 300 });

  const edition = await dailyEdition(date, ...window(date));
  assert.deepEqual(edition.entries.map((e) => e.entry.itemId).filter((id) => [surge, media, quiet].includes(id)), [surge, media, quiet]);
  const by = new Map(edition.entries.map((e) => [e.entry.itemId, e.importance]));
  assert.equal(by.get(surge)! - by.get(media)!, 70 + 9 - 75);
  assert.equal(by.get(quiet)! - by.get(media)!, 72 - 75);
});
