// Closed-valve fixture responses exercise real receipt retries and body shielding without a provider.
import './setup.ts';
import assert from 'node:assert/strict';
import { after, mock, test } from 'node:test';
import type { z } from 'zod';
import * as llm from '@aihot/backend/providers/llm';
import type { ChatJsonOptions, ChatJsonResult } from '@aihot/backend/providers/llm';
import { config } from '@aihot/backend/config';
import { closeDb, sql } from '@aihot/backend/db';
import { paidRequest, ReceiptUnknownError } from '@aihot/backend/providers/receipts';
import { upsertMaterial } from '@aihot/backend/content/materials';
import { tag } from './setup.ts';

const enabled = process.execArgv.includes('--experimental-test-module-mocks');
test('wrong-language provider answers permit governed retry and failing bodies cannot starve English repair', { skip: !enabled }, async () => {
  assert.equal(config.modelCallsEnabled, false);
  const T = tag(), sourceId = `edition-provider-${T}`, ids: string[] = [];
  let mode: 'echo' | 'valid' | 'broken-body' | 'unknown' = 'echo';
  const calls: Array<{ language: string; kind: string; receiptId: number }> = [];
  const fixture = mock.module(new URL('../packages/backend/src/providers/llm.ts', import.meta.url).href, {
    namedExports: { ...llm, chatJson: async <S extends z.ZodType>(opts: ChatJsonOptions<S>): Promise<ChatJsonResult<z.infer<S>>> => {
      assert.equal(opts.purpose, 'translate_content');
      const input = JSON.parse(opts.user as string) as { targetLanguage: string; segments: Array<{key: string; text: string}> };
      const kind = opts.subject!.startsWith('body:') ? 'body' : 'item';
      const request = { service: `edition-fixture-${T}`, purpose: opts.purpose, subject: opts.subject, identity: { subject: opts.subject, promptVersion: opts.promptVersion, input } };
      const receipt = await paidRequest(request, async () => {
        if (mode === 'unknown' && input.targetLanguage === 'zh') throw new Error('fixture unknown after request');
        return { response: { translations: Object.fromEntries(input.segments.map(segment => [segment.key,
          input.targetLanguage === 'en' ? 'A verified English release summary.'
          : mode === 'echo' ? segment.text : mode === 'broken-body' ? '正文翻译丢失了所有保护标记。' : '已验证的中文标题与摘要。'])) } };
      });
      calls.push({language:input.targetLanguage,kind,receiptId:receipt.receiptId});
      return { data: opts.schema.parse(receipt.response), receiptId: receipt.receiptId, reused: receipt.reused, model: 'fixture', usage: {total_tokens:1} };
    } },
  });
  try {
    const { currentContent, localizePublication } = await import('@aihot/backend/publication/content-language');
    const { publishArticle } = await import('@aihot/backend/publication/publish');
    const { fetchItemsByIds, toItemSummary } = await import('@aihot/backend/publication/items');
    const { loadItemDetail } = await import('@aihot/backend/publication/detail');
    const { editionReady, bodyEditionReady } = await import('@aihot/backend/publication/distribution');
    const { translateContentEntry, runContentTranslationLanes, runContentTranslationSweep } = await import('@aihot/backend/editorial/content-translate');
    await sql`INSERT INTO sources(id,name,kind,tier,site_fulltext,next_fetch_at) VALUES(${sourceId},'Edition fixture','rss','T1',true,'2100-01-01')`;
    for (const language of ['en','zh']) {
      const material = await upsertMaterial({sourceId,url:`https://example.org/edition-${language}-${T}`,title:language === 'en' ? 'A lab releases a model' : '实验室发布新模型',language,
        bodyHtml: '<p>The original prose <a href="https://example.org/release">release notes</a> <code>const id = 1</code></p>',bodyText:'The original prose.',bodyStatus:'ok',via:'fetch',publishedAt:new Date()});
      ids.push(material.articleId);
      await sql`INSERT INTO analyses(article_id,input_revision,origin,editorial_language,relevance,category,title,summary,score,selected)
        VALUES(${material.articleId},1,'rule',${language},'pass','ai-models',${language === 'en' ? 'A lab releases a model' : '实验室发布新模型'},${language === 'en' ? 'The lab provides public access.' : '实验室提供公开访问。'},90,true)`;
      await publishArticle(material.articleId,{releasedAt:new Date(Date.now()-60000)});
    }
    const chinese = await currentContent('item',ids[0]!,'zh'); assert.ok(chinese);
    await assert.rejects(translateContentEntry(chinese),/translation prose must use zh/);
    const failedId = calls.at(-1)!.receiptId;
    assert.equal((await sql`SELECT status FROM receipts WHERE id=${failedId}`)[0]!.status,'failed');
    assert.equal((await sql`SELECT 1 FROM content_translations WHERE kind='item' AND content_id=${ids[0]!}`).length,0);
    const native = toItemSummary((await fetchItemsByIds([ids[0]!])).get(ids[0]!)!);
    assert.equal(editionReady(await localizePublication(native,'zh'),'zh'),false);
    mode = 'valid'; await translateContentEntry(chinese);
    assert.equal(calls.at(-1)!.receiptId,failedId,'retry uses the same governed logical request');
    assert.equal((await sql`SELECT count(*)::int AS n FROM receipt_attempts WHERE receipt_id=${failedId}`)[0]!.n,2);
    assert.equal(editionReady(await localizePublication(native,'zh'),'zh'),true);
    const body = await currentContent('body',ids[0]!,'zh'), english = await currentContent('item',ids[1]!,'en'); assert.ok(body); assert.ok(english);
    const cursors = {en:'',zh:'body:before'}, rotations: string[] = [];
    const deps = {
      rotate:async (language:'en'|'zh') => {rotations.push(language);},
      run:async (language:'en'|'zh',limit:number) => runContentTranslationSweep(cursors[language],limit,{
        priority:async()=>[], scan:async()=>({entries:[language === 'en' ? english : body],scanned:1,nextCursor:null}),
        translate:translateContentEntry, checkpoint:async cursor=>{cursors[language]=cursor;},
      }),
    };
    mode = 'broken-body';
    const progressed = await runContentTranslationLanes('zh',5,deps);
    assert.match(progressed.errors!.zh!,/body translation lost/); assert.equal(progressed.translated,1);
    assert.equal(cursors.zh,'body:before'); assert.deepEqual(rotations,['en']);
    const failedBodyId = calls.find(call=>call.kind === 'body')!.receiptId;
    assert.equal((await sql`SELECT status FROM receipts WHERE id=${failedBodyId}`)[0]!.status,'failed');
    const detail = await loadItemDetail(ids[0]!); assert.ok(detail.kind === 'found');
    assert.equal(bodyEditionReady(await localizePublication(detail.detail,'zh'),'zh'),false);
    mode = 'unknown';
    const unknown = await runContentTranslationLanes('zh',5,deps);
    assert.match(unknown.errors!.zh!,/unknown after request/); assert.equal(unknown.translated,1);
    assert.equal((await sql`SELECT status FROM receipts WHERE id=${failedBodyId}`)[0]!.status,'unknown');
    const blocked = await runContentTranslationLanes('zh',5,deps);
    assert.match(blocked.errors!.zh!,/unknown outcome/); assert.equal(blocked.translated,1);
    assert.equal(cursors.zh,'body:before');
    await assert.rejects(translateContentEntry(body),ReceiptUnknownError);
    assert.equal((await sql`SELECT count(*)::int AS n FROM receipt_attempts WHERE receipt_id=${failedBodyId}`)[0]!.n,2,'unknown outcome never causes another provider attempt');
    assert.equal(config.modelCallsEnabled,false);
  } finally {
    await sql`DELETE FROM content_translations WHERE content_id IN ${sql(ids)}`;
    await sql`DELETE FROM articles WHERE source_id=${sourceId}`;
    await sql`DELETE FROM sources WHERE id=${sourceId}`;
    fixture.restore();
  }
});
after(closeDb);
