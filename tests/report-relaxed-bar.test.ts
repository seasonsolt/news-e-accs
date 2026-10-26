import { editionAt, tag } from "./setup.ts";
// A quiet window's daily lowers the selection bar step by step until it has six events; it takes only
// reports that missed on their score, and a busy window takes none.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { closeDb, sql } from "@aihot/backend/db";
import { upsertMaterial } from "@aihot/backend/content/materials";
import { stopBoss } from "@aihot/backend/jobs/queue";
import { publishArticle } from "@aihot/backend/publication/publish";
import { dailyEdition } from "@aihot/backend/reports/edition";

const T = tag();
const SOURCE = { T1: `test-relaxed-t1-${T}`, T2: `test-relaxed-t2-${T}`, EXCLUDE_MP: `test-relaxed-mp-${T}` };

before(async () => {
  for (const [tier, id] of Object.entries(SOURCE)) {
    await sql`INSERT INTO sources (id, name, kind, tier, participation_mode, next_fetch_at)
              VALUES (${id}, ${`Relaxed bar ${tier}`}, 'rss', ${tier}, 'editorial', '2100-01-01')`;
  }
});
after(async () => {
  await stopBoss();
  await closeDb();
});

async function report(date: string, label: string, tier: keyof typeof SOURCE, score: number, opts: { selected?: boolean; addsValue?: boolean } = {}): Promise<string> {
  const at = editionAt("daily", date, -120);
  const { articleId } = await upsertMaterial({
    sourceId: SOURCE[tier], url: `https://example.com/relaxed-${T}-${date}-${label}`, title: `Relaxed ${label}`,
    bodyText: `Relaxed ${label} body`, bodyStatus: "ok", publishedAt: at, discoveredAt: at, via: "fetch",
  });
  await sql`INSERT INTO analyses (article_id, input_revision, origin, relevance, category, title, summary, editorial_language, score, selected)
            VALUES (${articleId}, 1, 'rule', 'pass', 'industry', ${`Headline ${label}`}, ${`Summary ${label}`}, 'en', ${score}, ${opts.selected ?? false})`;
  await sql`UPDATE articles SET grouping_status = 'complete', grouped_at = ${at}, selection_adds_value = ${opts.addsValue ?? true} WHERE id = ${articleId}`;
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
