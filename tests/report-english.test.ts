import './setup.ts';
import assert from 'node:assert/strict';
import { after, mock, test } from 'node:test';
import * as llm from '@aihot/backend/providers/llm';
import type { ChatJsonOptions, ChatJsonResult } from '@aihot/backend/providers/llm';
import type { z } from 'zod';
import { config } from '@aihot/backend/config';
import { sql, closeDb } from '@aihot/backend/db';
import { paidRequest, rejectReceivedResponse } from '@aihot/backend/providers/receipts';
import { upsertMaterial } from '@aihot/backend/content/materials';
import { tag } from './setup.ts';
import type { ReportEntry } from '@aihot/backend/reports/compose';

const enabled = process.execArgv.includes('--experimental-test-module-mocks');
test('daily and period writers retain missing legacy citations and defer invalid editions atomically', { skip: !enabled }, async () => {
  assert.equal(config.modelCallsEnabled, false);
  const T = tag(), sourceId = `test-report-english-${T}`;
  const oldZone = config.reportTimeZone;
  config.reportTimeZone = 'Asia/Shanghai';
  let failure: 'none' | 'incomplete' | 'unknown' | 'chinese' | 'bad-ref' = 'none';
  const seen: Array<{ purpose: string; subject: string; missing: number }> = [];
  const moduleMock = mock.module(new URL('../packages/backend/src/providers/llm.ts', import.meta.url).href, { namedExports: { ...llm,
    chatJson: async <S extends z.ZodType>(opts: ChatJsonOptions<S>): Promise<ChatJsonResult<z.infer<S>>> => {
      const user = String(opts.user);
      const missing = user.includes('Missing English citations') ? JSON.parse(user.slice(user.lastIndexOf('\n') + 1)) as Array<{ itemId: string; title: string; summary: string }> : [];
      seen.push({ purpose: opts.purpose, subject: opts.subject, missing: missing.length });
      let citationCopies = missing.map(entry => ({ itemId: entry.itemId, title: 'A lab releases Model 2.5', summary: 'A lab releases Model 2.5 for USD 10.' }));
      if (failure === 'incomplete') citationCopies = citationCopies.slice(1);
      if (failure === 'unknown') citationCopies[0] = { ...citationCopies[0]!, itemId: 'unknown' };
      if (failure === 'chinese') citationCopies[0] = { ...citationCopies[0]!, summary: '实验室发布 Model 2.5，价格为 USD 10。' };
      const response = opts.purpose === 'report_lead'
        ? { title: 'A lab releases Model 2.5', leadParagraph: 'A lab releases Model 2.5 for USD 10.', highlights: [1, 2], citationCopies }
        : { headline: 'Model releases define the period', overview: 'The period covers model releases and public access terms.', themes: [{ heading: 'Model releases', summary: 'Labs release models with public pricing and access terms.', refs: failure === "bad-ref" ? [1, 999] : [1, 2, 3] }], citationCopies };
      const receipt = await paidRequest({ service: 'local-report-fixture', model: 'fixture', purpose: opts.purpose, subject: opts.subject,
        identity: { promptVersion: opts.promptVersion, user, system: opts.system } }, async () => ({ response, usage: { total_tokens: 1 } }));
      try { return { data: opts.schema.parse(receipt.response), receiptId: receipt.receiptId, reused: receipt.reused, model: 'fixture', usage: null }; }
      catch (error) { await rejectReceivedResponse(receipt.receiptId, 'invalid local report fixture'); throw error; }
    } } });
  try {
    // Dynamic import after module mock; compose imports the real publication projection and DB.
    const { composeDaily, composeMonthly, candidates, dailyReportWindow } = await import('@aihot/backend/reports/compose');
    const { publishArticle } = await import('@aihot/backend/publication/publish');
    const { currentContent, saveTranslation } = await import('@aihot/backend/publication/content-language');
    await sql`INSERT INTO sources(id,name,kind,tier,participation_mode,next_fetch_at) VALUES(${sourceId},'Report original fixture','rss','T1','editorial','2100-01-01')`;
    const ids: string[] = [];
    for (let i = 0; i < 10; i++) {
      const at = new Date('2011-04-01T12:00:00Z');
      const material = await upsertMaterial({ sourceId, url: `https://example.com/report-english-${T}-${i}`, title: 'Original source title', language: 'en', bodyText: 'A lab releases Model 2.5 for USD 10.', bodyStatus: 'ok', via: 'fetch', publishedAt: at, discoveredAt: at });
      ids.push(material.articleId);
      if (i === 0) await sql`INSERT INTO analyses(article_id,input_revision,origin,relevance,category,editorial_language,title,summary,score,selected) VALUES(${material.articleId},1,'rule','pass','ai-models','en','Native Model 2.5 title','Native price is USD 10.',99,true)`;
      else await sql`INSERT INTO analyses(article_id,input_revision,origin,relevance,category,title_zh,summary_zh,score,selected) VALUES(${material.articleId},1,'rule','pass','ai-models','实验室发布 Model 2.5','价格为 USD 10。',90,true)`;
      await publishArticle(material.articleId, { now: at, releasedAt: at });
    }
    const ready = await currentContent('item', ids[1]!, 'en'); assert.ok(ready);
    await saveTranslation({ ...ready, translations: { title: 'Stored Model 2.5 edition', summary: 'The stored price is USD 10.' } }, 'offline-agent', 'fixture', [], true);
    const window = dailyReportWindow('2011-04-02');
    const before = await candidates(window.start, window.end);
    assert.equal(before.length, 10); assert.equal(before.filter(entry => entry.needsEnglishCopy).length, 8);
    assert.equal(before.find(entry => entry.itemId === ids[0])!.title, 'Native Model 2.5 title');
    assert.equal(before.find(entry => entry.itemId === ids[1])!.title, 'Stored Model 2.5 edition');
    for (const mode of ['incomplete', 'unknown', 'chinese'] as const) {
      failure = mode;
      await assert.rejects(composeDaily('2011-04-02'));
      assert.equal((await sql`SELECT 1 FROM reports WHERE kind='daily' AND key='2011-04-02'`).length, 0);
    }
    failure = 'none';
    await composeDaily('2011-04-02');
    const [daily] = await sql`SELECT editorial_language,content FROM reports WHERE kind='daily' AND key='2011-04-02'`;
    assert.equal(daily!.editorial_language, 'en');
    const items = daily!.content.sections.flatMap((section: { items: ReportEntry[] }) => section.items) as ReportEntry[];
    assert.equal(items.length + daily!.content.flashes.length, 10);
    assert.ok([...items, ...daily!.content.flashes].every(entry => !/[一-鿿]/.test(entry.title)));
    assert.ok(items.every(entry => !/[一-鿿]/.test(entry.summary)));
    assert.ok(items.some(entry => entry.title === 'Native Model 2.5 title'));
    assert.ok([...items, ...daily!.content.flashes].some(entry => entry.title === 'Stored Model 2.5 edition'));
    assert.equal(daily!.content.reportTimeZone, 'Asia/Shanghai');
    assert.equal(daily!.content.windowEnd, window.end.toISOString());
    const original = await sql`SELECT title,editorial_language FROM publications WHERE article_id=${ids[2]!}`;
    assert.equal(original[0]!.editorial_language, 'zh'); assert.equal(original[0]!.title, '实验室发布 Model 2.5');
    failure = 'bad-ref';
    await assert.rejects(composeMonthly('2011-04'), /unknown period report citation reference/);
    assert.equal((await sql`SELECT 1 FROM reports WHERE kind='monthly' AND key='2011-04'`).length, 0);
    failure = 'none';
    await composeMonthly('2011-04');
    const [monthly] = await sql`SELECT editorial_language,content FROM reports WHERE kind='monthly' AND key='2011-04'`;
    assert.equal(monthly!.editorial_language, 'en'); assert.equal(monthly!.content.storyOrder.length, 10);
    assert.equal(monthly!.content.metrics.selectedCount, 10);
    assert.equal(seen.at(-1)!.missing, 8);
    // An untyped override on an English analysis needs the same governed repair as a legacy draft.
    await sql`INSERT INTO editorial_overrides(article_id,fields,reason,updated_by) VALUES(${ids[0]!},${sql.json({title:'实验室发布 Model 2.5',summary:'价格为 USD 10。'})},'fixture','test')`;
    await publishArticle(ids[0]!, { now: new Date('2011-04-01T12:00:00Z'), releasedAt: new Date('2011-04-01T12:00:00Z') });
    const overridden = (await candidates(window.start, window.end)).find(entry => entry.itemId === ids[0])!;
    assert.equal(overridden.needsEnglishCopy, true); assert.equal(overridden.title, '实验室发布 Model 2.5');
    failure = 'incomplete';
    await assert.rejects(composeDaily('2011-04-02'));
    const [unchanged] = await sql`SELECT content FROM reports WHERE kind='daily' AND key='2011-04-02'`;
    assert.deepEqual(unchanged!.content,daily!.content,'failed override repair preserves the previous issue');
    await assert.rejects(composeMonthly('2011-04'));
    failure = 'none';
    await composeDaily('2011-04-02');
    const [repaired] = await sql`SELECT content FROM reports WHERE kind='daily' AND key='2011-04-02'`;
    const references = [...repaired!.content.sections.flatMap((section: { items: ReportEntry[] }) => section.items), ...repaired!.content.flashes];
    assert.equal(references.length, 10, 'language repair preserves the bounded candidate set');
    assert.equal(references.find((entry: ReportEntry) => entry.itemId === ids[0]).title, 'A lab releases Model 2.5');
    await composeMonthly('2011-04'); assert.equal(seen.at(-1)!.missing, 9);
    const [periodRepaired] = await sql`SELECT content FROM reports WHERE kind='monthly' AND key='2011-04'`;
    assert.equal(periodRepaired!.content.storyOrder.length,10);
    assert.equal(periodRepaired!.content.themes.flatMap((theme:{storyRefs:ReportEntry[]})=>theme.storyRefs).find((entry:ReportEntry)=>entry.itemId === ids[0]).title,'A lab releases Model 2.5');
    const subject = seen.at(-1)!.subject;
    await sql`UPDATE publications SET summary='价格为 USD 10。现在支持公开访问。' WHERE article_id=${ids[2]!}`;
    config.reportTimeZone = 'America/New_York';
    await composeMonthly('2011-04');
    const [regenerated] = await sql`SELECT content,window_start,window_end FROM reports WHERE kind='monthly' AND key='2011-04'`;
    assert.equal(regenerated!.content.reportTimeZone, 'Asia/Shanghai');
    assert.equal(regenerated!.window_start.toISOString(), '2011-03-31T16:00:00.000Z');
    const [snapshot] = await sql`SELECT content FROM report_revisions WHERE report_id=(SELECT id FROM reports WHERE kind='monthly' AND key='2011-04') ORDER BY revision DESC LIMIT 1`;
    assert.equal(snapshot!.content.reportTimeZone, 'Asia/Shanghai');
    assert.equal(snapshot!.content.windowStart, '2011-03-31T16:00:00.000Z');
    assert.equal(snapshot!.content.editorialLanguage, 'en');
    assert.notEqual(seen.at(-1)!.subject, subject, 'canonical evidence changes invalidate receipt identity');
    assert.equal(config.modelCallsEnabled, false);
  } finally {
    await sql`DELETE FROM reports WHERE (kind='daily' AND key='2011-04-02') OR (kind='monthly' AND key='2011-04')`;
    await sql`DELETE FROM articles WHERE source_id=${sourceId}`;
    await sql`DELETE FROM sources WHERE id=${sourceId}`;
    moduleMock.restore();
    config.reportTimeZone = oldZone;
  }
});
test('catch-up uses the configured local publication clock and never rewrites existing historical issues', async () => {
  const { catchUpReports } = await import('@aihot/backend/reports/compose');
  const oldZone = config.reportTimeZone;
  config.reportTimeZone = 'America/New_York';
  try {
    await sql`DELETE FROM reports WHERE (kind='daily' AND key IN ('2097-03-09','2097-03-10')) OR (kind='weekly' AND key='2097-W10') OR (kind='monthly' AND key='2097-02')`;
    const before = await catchUpReports(new Date('2097-03-10T11:59:00Z'), 1);
    assert.ok(before.generated.includes('daily:2097-03-09'));
    assert.ok(!before.generated.includes('daily:2097-03-10'));
    const due = await catchUpReports(new Date('2097-03-10T12:00:00Z'), 1);
    assert.ok(due.generated.includes('daily:2097-03-10'));
    const [record] = await sql`SELECT revision,window_start,window_end,content FROM reports WHERE kind='daily' AND key='2097-03-10'`;
    assert.equal(record!.content.reportTimeZone, 'America/New_York');
    assert.equal(record!.window_end.toISOString(), '2097-03-10T12:00:00.000Z');
    config.reportTimeZone = 'Asia/Shanghai';
    await catchUpReports(new Date('2097-03-10T12:00:00Z'), 1);
    const [same] = await sql`SELECT revision,window_end,content FROM reports WHERE kind='daily' AND key='2097-03-10'`;
    assert.equal(same!.revision, record!.revision);
    assert.equal(same!.window_end.toISOString(), record!.window_end.toISOString());
    assert.equal(same!.content.reportTimeZone, 'America/New_York');
  } finally {
    await sql`DELETE FROM reports WHERE (kind='daily' AND key IN ('2097-03-09','2097-03-10')) OR (kind='weekly' AND key='2097-W10') OR (kind='monthly' AND key='2097-02')`;
    config.reportTimeZone = oldZone;
  }
});

test('report windows respect local 08:00 across DST and preserve the Shanghai default', async () => {
  const { dailyReportWindow, periodReportWindow } = await import('@aihot/backend/reports/compose');
  const spring = dailyReportWindow('2026-03-08', 'America/New_York');
  assert.equal(spring.start.toISOString(), '2026-03-07T13:00:00.000Z');
  assert.equal(spring.end.toISOString(), '2026-03-08T12:00:00.000Z');
  assert.equal((spring.end.getTime() - spring.start.getTime()) / 3600000, 23);
  const fall = dailyReportWindow('2026-11-01', 'America/New_York');
  assert.equal(fall.end.toISOString(), '2026-11-01T13:00:00.000Z');
  assert.equal((fall.end.getTime() - fall.start.getTime()) / 3600000, 25);
  const weekly = periodReportWindow('2026-03-02', '2026-03-08', 'America/New_York');
  assert.equal(weekly.start.toISOString(), '2026-03-02T05:00:00.000Z');
  assert.equal(weekly.end.toISOString(), '2026-03-09T04:00:00.000Z');
  const monthly = periodReportWindow('2026-11-01', '2026-11-30', 'America/New_York');
  assert.equal(monthly.start.toISOString(), '2026-11-01T04:00:00.000Z');
  assert.equal(monthly.end.toISOString(), '2026-12-01T05:00:00.000Z');
  const shanghai = dailyReportWindow('2026-03-08', 'Asia/Shanghai');
  assert.equal(shanghai.end.toISOString(), '2026-03-08T00:00:00.000Z');
});

test('legacy citation translations must cover exactly the requested IDs with unchanged numbers', async () => {
  const { validateReportCitationCopies } = await import('@aihot/backend/reports/compose');
  const expected = [{ itemId: 'legacy', title: '模型 2.5 发布', summary: '价格为 USD 10。' }] as ReportEntry[];
  const copy = { itemId: 'legacy', title: 'Model 2.5 launches', summary: 'The price is USD 10.' };
  assert.equal(validateReportCitationCopies(expected, [copy]).get('legacy')!.title, copy.title);
  assert.throws(() => validateReportCitationCopies(expected, []), /incomplete/);
  assert.throws(() => validateReportCitationCopies(expected, [{ ...copy, itemId: 'other' }]), /unknown/);
  assert.throws(() => validateReportCitationCopies(expected, [copy, copy]), /IDs/);
  assert.throws(() => validateReportCitationCopies(expected, [{ ...copy, summary: '价格为 USD 10。' }]), /English/);
  assert.throws(() => validateReportCitationCopies(expected, [{ ...copy, summary: 'The price is USD 20.' }]), /numbers changed/);
});

after(closeDb);
