// The translation queue's priority covers the whole hot ranking /hot shows, not only the home strip's five:
// an event ranked sixth with no English edition is translated before the backlog. The newest daily is too.
import './setup.ts';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, test } from 'node:test';
import { closeDb, sql } from '@aihot/backend/db';
import type { HotEntry } from '@aihot/backend/events/hot';
import { priorityContentEntries, saveTranslation } from '@aihot/backend/publication/content-language';
import { upsertMaterial } from '@aihot/backend/content/materials';
import { publishArticle } from '@aihot/backend/publication/publish';

after(closeDb);
test('every ranked hot event without an English edition is a translation priority', async () => {
  const at = new Date(Date.now() - 60_000);
  await sql`INSERT INTO sources (id,name,kind,tier,participation_mode,next_fetch_at)
    VALUES ('hot-priority','Hot priority','rss','T1','editorial','2100-01-01')`;
  const entries: HotEntry[] = [];
  for (let rank = 1; rank <= 6; rank++) {
    const id = `hot-priority-${rank}`;
    const [story] = await sql<{ id: number; public_id: string }[]>`INSERT INTO stories(public_id,title,summary)
      VALUES (${randomUUID()},${`热榜事件${rank}`},${`第${rank}名的摘要`}) RETURNING id,public_id`;
    const [fact] = await sql<{ id: number }[]>`INSERT INTO facts(public_id,story_id,title)
      VALUES (${randomUUID()},${story!.id},${`热榜事件${rank}`}) RETURNING id`;
    await sql`INSERT INTO articles(id,source_id,identity_key,url,title,discovered_at,timeline_at)
      VALUES (${id},'hot-priority',${id},${`https://example.org/${id}`},${`热榜事件${rank}`},${at},${at})`;
    await sql`INSERT INTO fact_articles(fact_id,article_id,role) VALUES (${fact!.id},${id},'report')`;
    await sql`INSERT INTO publications(article_id,source_id,title,summary,url,timeline_at,discovered_at,sort_at,body_mode,eligible,channel,story_id,fact_id)
      VALUES (${id},'hot-priority',${`热榜事件${rank}`},${`第${rank}名的摘要`},${`https://example.org/${id}`},${at},${at},${at},'summary',true,'news',${story!.id},${fact!.id})`;
    entries.push({ rank, storyId: story!.id, storyPublicId: story!.public_id, title: `热榜事件${rank}`, heat: 100 - rank, trend: 'flat', trendPct: 0, badges: [], participantCount: 0, sourceCount: 1, signalCount: 0, reportCount: 1, sourceNames: ['Hot priority'], latestAt: at.toISOString(), firstReportAt: at.toISOString(), representativeItemId: id, representativeUrl: `https://example.org/${id}`, representativeSource: 'Hot priority', participants: [] });
  }
  await sql`INSERT INTO hot_rankings(computed_at,rule_version,entries,published) VALUES (now(),'test',${sql.json(entries as never)},true)`;
  const stories = new Set((await priorityContentEntries('en')).filter((e) => e.kind === 'story').map((e) => e.id));
  assert.ok(stories.has(entries[5]!.storyPublicId), 'the sixth event, past the home strip');
  assert.ok(stories.has(entries[0]!.storyPublicId));
});

test('the newest daily is a translation priority until its edition is stored', async () => {
  const content = (title: string) => sql.json({ title, lead: { title, leadParagraph: 'A lab publishes a new model for public use.' }, sections: [] });
  for (const key of ['2100-05-31', '2100-06-01']) {
    await sql`INSERT INTO reports(kind,key,editorial_language,window_start,window_end,generated_at,content)
      VALUES('daily',${key},'en',now()-interval '1 day',now(),now(),${content(`Daily briefing ${key}`)})`;
  }
  const reports = async () => (await priorityContentEntries('zh')).filter((e) => e.kind === 'report');
  const [newest, ...others] = await reports();
  assert.equal(newest?.id, 'daily:2100-06-01');
  assert.deepEqual(others, [], 'older dailies stay with the historical sweep');
  await saveTranslation({ ...newest!, translations: Object.fromEntries(newest!.segments.map((s) => [s.key, '一家实验室发布了面向公众的新模型。'])) }, 'offline-agent', 'test-fixture', [], true);
  assert.deepEqual(await reports(), []);
});

test('the newest daily\'s items are a priority with their bodies, so a post it leads with is read in Chinese', async () => {
  const sourceId = `daily-body-priority-${randomUUID()}`;
  await sql`INSERT INTO sources(id,name,kind,tier,participation_mode,site_fulltext,next_fetch_at)
    VALUES(${sourceId},'Daily body priority','rss','T1','editorial',true,'2100-01-01')`;
  const material = await upsertMaterial({ sourceId, url: `https://example.com/${sourceId}`, title: 'Model launch', language: 'en',
    bodyText: 'The API is live today.', bodyHtml: '<p>The API is live today.</p>', bodyStatus: 'ok', via: 'fetch', publishedAt: new Date() });
  const id = material.articleId;
  await sql`INSERT INTO analyses(article_id,input_revision,origin,relevance,category,title_zh,summary_zh,reason_zh,score,selected)
    VALUES(${id},1,'rule','pass','ai-products','模型发布','中文摘要','推荐理由',90,true)`;
  await publishArticle(id, { releasedAt: new Date(Date.now() - 60_000) });
  await sql`INSERT INTO reports(kind,key,editorial_language,window_start,window_end,generated_at,content)
    VALUES('daily','2100-06-02','zh',now()-interval '1 day',now(),now(),
      ${sql.json({ title: '日报', lead: { title: '日报', leadParagraph: '一家实验室发布了新模型。' }, sections: [{ label: '模型', items: [{ itemId: id, title: '模型发布' }] }] })})`;
  const bodies = async () => (await priorityContentEntries('zh')).filter((e) => e.kind === 'body' && e.id === id);
  const [body] = await bodies();
  assert.ok(body, 'the body of an item the newest daily cites');
  await saveTranslation({ ...body, translations: { 'blocks.0.text': 'API 今天上线。' } }, 'offline-agent', 'test-fixture', [], true);
  assert.deepEqual(await bodies(), [], 'a stored edition leaves the queue');
});
