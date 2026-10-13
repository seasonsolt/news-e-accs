// Failure cases: reading several stories' prose together lets one story claim an article linked to both
// and drops the other's development, changes a story's edition identity, or returns a story with no
// public report that the one-story read hides.
import { tag } from './setup.ts';
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { sql, closeDb } from '@aihot/backend/db';
import { upsertMaterial } from '@aihot/backend/content/materials';
import { publishArticle } from '@aihot/backend/publication/publish';
import { loadStoriesProse, loadStoryProse } from '@aihot/backend/publication/stories';

const T = tag(), SOURCE = `test-story-prose-batch-${T}`;
const stories: Record<'shared' | 'own' | 'empty', number> = { shared: 0, own: 0, empty: 0 };

async function article(n: number, minutesAgo: number) {
  const material = await upsertMaterial({ sourceId: SOURCE, url: `https://example.com/prose-${T}-${n}`, title: `Report ${n}`, language: 'en', bodyText: `Body ${n}`, bodyHtml: `<p>Body ${n}</p>`, bodyStatus: 'ok', via: 'fetch', publishedAt: new Date(Date.now() - minutesAgo * 60_000) });
  await sql`INSERT INTO analyses(article_id,input_revision,origin,relevance,category,title_zh,summary_zh,reason_zh,score,selected) VALUES(${material.articleId},1,'rule','pass','ai-products',${`报道 ${n}`},${`摘要 ${n}`},'理由',80,true)`;
  await publishArticle(material.articleId, { releasedAt: new Date(Date.now() - 60_000) });
  return material.articleId;
}

async function story(name: string) {
  const publicId = crypto.randomUUID();
  const [row] = await sql<{ id: number }[]>`INSERT INTO stories(public_id,title,summary,latest,latest_at) VALUES(${publicId},${`事件 ${name}`},null,null,now()) RETURNING id`;
  return row!.id;
}

async function fact(storyId: number, name: string, links: Array<[string, 'primary' | 'report' | 'mention']>) {
  const [row] = await sql<{ id: number }[]>`INSERT INTO facts(public_id,story_id,title) VALUES(${`fact-${T}-${name}`},${storyId},${`进展 ${name}`}) RETURNING id`;
  for (const [articleId, role] of links) await sql`INSERT INTO fact_articles(fact_id,article_id,role) VALUES(${row!.id},${articleId},${role})`;
}

before(async () => {
  await sql`INSERT INTO sources(id,name,kind,tier,participation_mode,site_fulltext,next_fetch_at) VALUES(${SOURCE},'Prose fixture','rss','T1','editorial',false,'2100-01-01')`;
  const [a, b, c] = [await article(1, 30), await article(2, 20), await article(3, 10)];
  stories.shared = await story('shared');
  await fact(stories.shared, 'shared-1', [[a, 'primary'], [b, 'report']]);
  await fact(stories.shared, 'shared-2', [[c, 'primary']]);
  // Article c is the other story's primary report and this story's only report of own-2: each story keeps
  // its own link, so own-2 stays a development here. A mention-only article adds no development.
  stories.own = await story('own');
  await fact(stories.own, 'own-1', [[b, 'primary'], [a, 'mention']]);
  await fact(stories.own, 'own-2', [[c, 'report']]);
  stories.empty = await story('empty');
});
after(async () => { await closeDb(); });

test('the batch read gives every story exactly its one-story prose and omits stories without public reports', async () => {
  const now = new Date();
  const ids = [stories.shared, stories.own, stories.empty, -1];
  const batch = await loadStoriesProse(ids, now);
  assert.deepEqual([...batch.keys()].sort(), [stories.shared, stories.own].sort());
  for (const id of ids) {
    const single = await loadStoryProse(id, now);
    assert.deepEqual(batch.get(id) ?? null, single, `story ${id}`);
  }
  assert.deepEqual(batch.get(stories.shared)!.developments.map((d) => d.title), [`进展 shared-2`, `进展 shared-1`]);
  assert.deepEqual(batch.get(stories.own)!.developments.map((d) => d.title), [`进展 own-2`, `进展 own-1`]);
  assert.equal((await loadStoriesProse([], now)).size, 0);
});
