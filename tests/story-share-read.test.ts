import { tag } from "./setup.ts";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import { sql, closeDb } from "@aihot/backend/db";
import { upsertMaterial } from "@aihot/backend/content/materials";
import { publishArticle } from "@aihot/backend/publication/publish";
import { loadStoryDetail } from "@aihot/backend/publication/stories";
import { loadStoryOgCard } from "@aihot/backend/publication/og";
import { currentContent, saveTranslation, localizePublication } from "@aihot/backend/publication/content-language";
import { installModules } from "@aihot/backend/modules";

const source = `story-share-${tag()}`;
let storyId: number;
let itemId: string;
const publicId = randomUUID();
before(async () => {
  await sql`INSERT INTO sources(id,name,kind,tier,participation_mode) VALUES(${source},'Share fixture','rss','T1','editorial')`;
  const material = await upsertMaterial({ sourceId: source, url: `https://example.org/${source}`, title: "原文标题", via: "fetch", publishedAt: new Date() });
  itemId = material.articleId;
  await sql`INSERT INTO analyses(article_id,input_revision,origin,relevance,editorial_language,title_zh,summary_zh,score,selected)
    VALUES(${itemId},1,'rule','pass','zh','公开报道标题','公开报道摘要',90,true)`;
  await publishArticle(itemId, { releasedAt: new Date(Date.now() - 60_000) });
  const [story] = await sql<{ id: number }[]>`INSERT INTO stories(public_id,title,editorial_language,latest_at) VALUES(${publicId},'事件标题','zh',now()) RETURNING id`;
  storyId = story!.id;
  const [fact] = await sql<{ id: number }[]>`INSERT INTO facts(public_id,story_id,title,editorial_language) VALUES(${`fact-${publicId}`},${storyId},'事件进展','zh') RETURNING id`;
  await sql`INSERT INTO fact_articles(fact_id,article_id,role) VALUES(${fact!.id},${itemId},'report')`;
});
after(closeDb);

test("event cards retain detail metadata and skip page-only module reads", async (t) => {
  const queriesOf = async (read: () => Promise<unknown>) => {
    const queries: string[] = [];
    const previous = sql.options.debug;
    sql.options.debug = (_connection, query) => { queries.push(query); };
    try { await read(); } finally { sql.options.debug = previous; }
    return queries;
  };
  const detailQueries = await queriesOf(async () => localizePublication(await loadStoryDetail(storyId), "zh"));
  const cardQueries = await queriesOf(() => loadStoryOgCard(storyId, "zh"));
  assert.ok(cardQueries.length < detailQueries.length, "the card executes fewer queries than a localized full detail read");
  assert.ok(!cardQueries.some((q) => q.includes("story_heat_hourly")), "a card never reads the heat chart");
  t.diagnostic(`SQL queries: full detail ${detailQueries.length}, share metadata ${cardQueries.length}`);
  const detail = await loadStoryDetail(storyId);
  assert.ok(detail);
  let pageReads = 0;
  installModules([{ name: "share-test", storyPage: async () => { pageReads++; throw new Error("page-only read"); } }]);
  try {
    assert.deepEqual(await loadStoryOgCard(storyId, "zh"), {
      kicker: "事件", title: detail.title, subtitle: detail.latest ?? detail.digest,
      meta: `${detail.sourceCount} 个来源 · ${detail.reportCount} 篇报道`, accent: "teal",
    });
    assert.equal(pageReads, 0);
    assert.equal(await loadStoryOgCard(-1, "zh"), null);
    assert.equal(await loadStoryOgCard(storyId, "en"), null, "an unavailable English edition must not show Chinese");
    const entry = await currentContent("story", publicId, "en");
    assert.ok(entry);
    const translations = Object.fromEntries(entry.segments.map((s) => [s.key, `English ${s.key}`]));
    await saveTranslation({ ...entry, translations }, "offline-agent", "test", [], true);
    const english = await loadStoryOgCard(storyId, "en");
    assert.equal(english?.title, "English title");
    assert.equal(english?.subtitle, "English latest");
    await sql`UPDATE publications SET title = '修正后的报道' WHERE article_id = ${itemId}`;
    assert.equal(await loadStoryOgCard(storyId, "en"), null, "changed evidence invalidates the stored translation");
    await sql`UPDATE publications SET visibility = 'withdrawn' WHERE article_id = ${itemId}`;
    assert.equal(await loadStoryOgCard(storyId, "zh"), null, "withdrawn reports cannot survive via a cached share card");
  } finally { installModules([]); }
});
