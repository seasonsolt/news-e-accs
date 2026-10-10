// The translation queue's priority covers the whole hot ranking /hot shows, not only the home strip's five:
// an event ranked sixth with no English edition is translated before the backlog.
import './setup.ts';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, test } from 'node:test';
import { closeDb, sql } from '@aihot/backend/db';
import type { HotEntry } from '@aihot/backend/events/hot';
import { priorityContentEntries } from '@aihot/backend/publication/content-language';

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
