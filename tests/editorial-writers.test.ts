// Exercise writer commits with local fixture answers while the production model valve stays closed.
// Run with --experimental-test-module-mocks; the default suite skips this isolated harness.
import './setup.ts';
import assert from 'node:assert/strict';
import { after, mock, test } from 'node:test';
import type { z } from 'zod';
import * as llm from '@aihot/backend/providers/llm';
import type { ChatJsonOptions, ChatJsonResult } from '@aihot/backend/providers/llm';
import { config } from '@aihot/backend/config';
import { sql, closeDb } from '@aihot/backend/db';
import { sha256, stableJson } from '@aihot/backend/lib/ids';
import { paidRequest } from '@aihot/backend/providers/receipts';
import { upsertMaterial } from '@aihot/backend/content/materials';
import { tag } from './setup.ts';

const enabled = process.execArgv.includes('--experimental-test-module-mocks');
test('English analysis commits neutral prose, keeps original evidence, and updates both model and locked legacy stories', { skip: !enabled }, async () => {
  assert.equal(config.modelCallsEnabled, false);
  const T = tag(), sourceId = `test-english-writers-${T}`;
  const calls: Array<{ purpose: string; system: string; user: string }> = [];
  const mockProvider = mock.module(new URL('../packages/backend/src/providers/llm.ts', import.meta.url).href, {
    namedExports: { ...llm, chatJson: async <S extends z.ZodType>(opts: ChatJsonOptions<S>): Promise<ChatJsonResult<z.infer<S>>> => {
      const user = typeof opts.user === 'string' ? opts.user : JSON.stringify(opts.user);
      calls.push({ purpose: opts.purpose, system: opts.system, user });
      const response = opts.purpose === 'prefilter_article' ? { label: 'PASS', reason: 'Relevant material' }
        : opts.purpose === 'score_article' ? { attentionScore: user.includes('LOWPOST') ? 40 : 75 }
        : opts.purpose === 'structure_article' ? { category: 'ai-products', tags: ['产品更新'], subjects: [], fact: { title: 'A lab releases Model 2.5', subject: 'A lab', action: 'releases', object: 'Model 2.5' } }
        : opts.purpose === 'understand_article' ? { itemType: 'product_launch', authorRole: 'principal', tags: ['产品更新'], editorialJudgment: 'The source provides concrete pricing and access terms.', title: 'A lab releases Model 2.5', summary: 'A lab releases Model 2.5 for USD 10.' }
        : opts.purpose === 'summarize_article' ? opts.parse!('title: A lab releases Model 2.5\nbody: The quoted lab announces Model 2.5 for USD 10.')
        : opts.purpose === 'group_article' ? { decisions: [] }
        : opts.purpose === 'story_digest' ? opts.system.includes('US English')
          ? { title: 'A lab releases Model 2.5', digest: 'A lab releases Model 2.5 for USD 10. The source describes public access terms.', latest: 'The model is available for USD 10.' }
          : { title: '实验室发布模型', digest: '实验室发布模型，提供了价格和公开访问方式。', latest: '模型现已提供公开访问。' }
        : (() => { throw new Error(`unexpected fixture purpose ${opts.purpose}`); })();
      const receipt = await paidRequest({ service: 'local-editorial-fixture', model: 'fixture', purpose: opts.purpose, subject: opts.subject,
        identity: { promptVersion: opts.promptVersion, user, system: opts.system }, attemptTag: opts.attemptTag }, async () => ({ response, usage: { total_tokens: 1 } }));
      return { data: opts.schema.parse(receipt.response), receiptId: receipt.receiptId, reused: receipt.reused, model: 'fixture', usage: { total_tokens: 1 } };
    } },
  });
  try {
    const { analyzeArticle } = await import('@aihot/backend/editorial/analyze');
    const { publishArticle } = await import('@aihot/backend/publication/publish');
    const { composeStoryDigest } = await import('@aihot/backend/events/digest');
    const { groupArticle } = await import('@aihot/backend/events/group');
    const { currentContent, saveTranslation, localizePublication, exportContentBatch } = await import('@aihot/backend/publication/content-language');
    const { loadStoryDetail } = await import('@aihot/backend/publication/stories');
    const { editionReady } = await import('@aihot/backend/publication/distribution');
    await sql`INSERT INTO sources(id,name,kind,tier,participation_mode,next_fetch_at) VALUES(${sourceId},'Original fixture','rss','T1','editorial','2100-01-01')`;
    const ids: string[] = [];
    for (const [language, body] of [['en', 'A lab releases Model 2.5 for USD 10.'], ['zh', '实验室发布 Model 2.5，价格为 USD 10。'], ['fr', 'Un laboratoire lance Model 2.5 pour USD 10.']]) {
      const material = await upsertMaterial({ sourceId, url: `https://example.com/english-writers-${T}-${language}`, title: `Model 2.5 ${T}`, language, bodyText: body, bodyStatus: 'ok', via: 'fetch' });
      ids.push(material.articleId);
      await sql`INSERT INTO translations(article_id,lang,revision,title,body_text,complete,origin) VALUES(${material.articleId},'zh',1,'Legacy','DO NOT READ THIS INTERMEDIARY',true,'source')`;
      const result = await analyzeArticle(material.articleId);
      assert.equal(result!.output!.editorialLanguage, 'en'); assert.equal(result!.output!.selected, true);
      const [row] = await sql`SELECT editorial_language,title,summary,reason,title_zh,summary_zh,reason_zh FROM analyses WHERE id=${result!.analysisId!}`;
      assert.equal(row!.editorial_language, 'en'); assert.equal(row!.title, 'A lab releases Model 2.5'); assert.equal(row!.summary, 'A lab releases Model 2.5 for USD 10.');
      assert.equal(row!.title_zh, null); assert.equal(row!.summary_zh, null); assert.equal(row!.reason_zh, null);
      await publishArticle(material.articleId, { releasedAt: new Date(Date.now() - 1000) });
      assert.equal(await currentContent('item', material.articleId, 'en'), null);
      assert.equal((await currentContent('item', material.articleId, 'zh'))!.sourceLanguage, 'en');
      const callsBefore = calls.length;
      assert.equal((await analyzeArticle(material.articleId))!.reused, true);
      assert.equal(calls.length, callsBefore + 5, 'calls use stored receipts in this fixture harness');
      assert.ok(calls.some(call => call.purpose === 'understand_article' && call.user.includes(body)));
    }
    const native = await upsertMaterial({ sourceId, url: `https://x.com/lab/status/${Date.now()}`, title: 'LOWPOST: The model is available.', language: 'en', xPost: { tweetId: String(Date.now()), authorName: 'Lab', text: 'LOWPOST: The model is available.\nhttps://example.com/model', handle: 'lab' }, via: 'fetch' });
    const nativeStart = calls.length;
    const nativeResult = await analyzeArticle(native.articleId);
    assert.equal(nativeResult!.output!.summary, 'LOWPOST: The model is available.\nhttps://example.com/model');
    assert.ok(!calls.slice(nativeStart).some(call => call.purpose === 'summarize_article'));
    const quote = await upsertMaterial({ sourceId, url: `https://x.com/reader/status/${Date.now() + 1}`, title: 'LOWPOST: Go build!', language: 'en', xPost: { tweetId: String(Date.now()), authorName: 'Lab', text: 'LOWPOST: Go build!', handle: 'reader', quoted: { authorName: 'Lab', url: 'https://x.com/lab/status/1', text: '实验室发布 Model 2.5，价格为 USD 10。', handle: 'lab' } }, via: 'fetch' });
    const quoteStart = calls.length;
    const quotedResult = await analyzeArticle(quote.articleId);
    assert.ok(quotedResult!.output!.summary.startsWith('The quoted lab'));
    assert.ok(calls.slice(quoteStart).some(call => call.purpose === 'summarize_article' && call.user.includes('explicit attribution to @lab')));
    const grouped = await groupArticle(ids[1]!);
    assert.equal(grouped.verdict, 'new-story');
    const [group] = await sql`SELECT st.editorial_language AS story_language, st.title AS story_title, f.editorial_language AS fact_language, f.title AS fact_title FROM facts f JOIN stories st ON st.id=f.story_id WHERE f.id=${grouped.factId!}`;
    assert.equal(group!.story_language, 'en'); assert.equal(group!.fact_language, 'en'); assert.equal(group!.story_title, 'A lab releases Model 2.5');
    assert.ok(calls.filter(call => call.purpose === 'structure_article' || call.purpose === 'understand_article').every(call => !call.user.includes('DO NOT READ THIS INTERMEDIARY')));
    for (const origin of ['model', 'manual']) {
      const [story] = await sql`INSERT INTO stories(public_id,title,origin,editorial_language,version) VALUES(${crypto.randomUUID()},'锁定中文标题',${origin},'zh',0) RETURNING id`;
      const [fact] = await sql`INSERT INTO facts(public_id,story_id,title) VALUES(${`fixture-${T}-${origin}`},${story!.id},'原始事实') RETURNING id`;
      await sql`INSERT INTO fact_articles(fact_id,article_id,role) VALUES(${fact!.id},${ids[0]!},'report')`;
      const result = await composeStoryDigest(Number(story!.id)); assert.equal(result.updated, true);
      const [updated] = await sql`SELECT title,digest,latest,editorial_language FROM stories WHERE id=${story!.id}`;
      if (origin === 'manual') { assert.equal(updated!.title, '锁定中文标题'); assert.equal(updated!.editorial_language, 'zh'); assert.ok(updated!.digest.includes('实验室')); }
      else { assert.equal(updated!.title, 'A lab releases Model 2.5'); assert.equal(updated!.editorial_language, 'en'); assert.ok(updated!.digest.startsWith('A lab')); }
      assert.equal((await composeStoryDigest(Number(story!.id))).updated, false, 'unchanged canonical evidence has no rewrite');
    }
    const [legacy] = await sql`INSERT INTO stories(public_id,title,summary,digest,origin,editorial_language,version) VALUES(${crypto.randomUUID()},'历史中文标题','历史中文摘要','历史中文综述','model','zh',1) RETURNING id`;
    const [legacyFact] = await sql`INSERT INTO facts(public_id,story_id,title) VALUES(${`legacy-${T}`},${legacy!.id},'历史事实') RETURNING id`;
    await sql`INSERT INTO fact_articles(fact_id,article_id,role) VALUES(${legacyFact!.id},${ids[0]!},'report')`;
    const [legacyFact2] = await sql`INSERT INTO facts(public_id,story_id,title) VALUES(${`legacy-second-${T}`},${legacy!.id},'历史第二事实') RETURNING id`;
    await sql`INSERT INTO fact_articles(fact_id,article_id,role) VALUES(${legacyFact2!.id},${ids[1]!},'report')`;
    const legacyInputs = await sql`SELECT p.article_id,p.title,p.summary FROM facts f JOIN fact_articles fa ON fa.fact_id=f.id JOIN publications p ON p.article_id=fa.article_id WHERE f.story_id=${legacy!.id} ORDER BY coalesce(p.published_at,p.discovered_at) DESC LIMIT 20`;
    const hash = sha256(stableJson([...legacyInputs].sort((a,b)=>a.article_id.localeCompare(b.article_id)).map(entry=>[entry.article_id,entry.title,entry.summary ?? ""])));
    await sql`INSERT INTO story_digests(story_id,version,digest,article_ids,inputs_hash) VALUES(${legacy!.id},1,'历史中文综述',${[ids[0]!,ids[1]!].sort()},${hash})`;
    const beforeRefresh = calls.length;
    assert.equal((await composeStoryDigest(Number(legacy!.id))).updated, false);
    assert.equal(calls.length, beforeRefresh, 'unchanged old evidence does not pay for a language-only rewrite');
    await sql`UPDATE publications SET summary='A lab releases Model 2.5 for USD 10 and adds public release notes.' WHERE article_id=${ids[0]!}`;
    assert.equal((await composeStoryDigest(Number(legacy!.id))).updated, true);
    const [converted] = await sql`SELECT editorial_language,title FROM stories WHERE id=${legacy!.id}`;
    assert.equal(converted!.editorial_language, 'en'); assert.equal(converted!.title, 'A lab releases Model 2.5');
    const [legacyIdentity] = await sql`SELECT public_id::text,frame FROM stories WHERE id=${legacy!.id}`;
    assert.equal(legacyIdentity!.frame.summaryLanguage, 'zh');
    const detail = await loadStoryDetail(Number(legacy!.id)); assert.ok(detail);
    const fallback = await localizePublication(detail, 'en');
    assert.equal(fallback.summary, '历史中文摘要'); assert.equal(fallback.developments.length,2);
    assert.deepEqual(new Set(fallback.developments.map(development=>development.title)),new Set(['历史事实','历史第二事实']));
    assert.equal(fallback.contentLanguage!.language, 'unknown'); assert.equal(editionReady(fallback, 'en'), false);
    const entry = await currentContent('story', legacyIdentity!.public_id, 'en'); assert.ok(entry);
    assert.equal(entry.sourceLanguage, 'unknown');
    assert.ok(entry.segments.some(segment => segment.key === 'summary'));
    assert.ok(entry.segments.some(segment => segment.key === 'developments.0.title'));
    assert.ok(entry.segments.some(segment => segment.key === 'developments.1.title'));
    assert.ok((await exportContentBatch('',1000,'en')).entries.some(candidate=>candidate.kind === 'story' && candidate.id === legacyIdentity!.public_id),'mixed stories remain in the worker historical repair lane');
    await saveTranslation({ ...entry, translations: Object.fromEntries(entry.segments.map(segment => [segment.key, 'Verified English event prose'])) }, 'offline-agent', 'fixture', [], true);
    const repaired = await localizePublication(detail, 'en');
    assert.equal(editionReady(repaired, 'en'), true);
    assert.equal(repaired.summary, 'Verified English event prose'); assert.equal(repaired.developments[0]!.title, 'Verified English event prose');
    const [factState] = await sql`SELECT title,editorial_language FROM facts WHERE id=${legacyFact!.id}`;
    assert.equal(factState!.title, '历史事实'); assert.equal(factState!.editorial_language, 'zh');
    await sql`UPDATE facts SET title='更新后的历史事实' WHERE id=${legacyFact!.id}`;
    await sql`UPDATE publications SET summary='Updated English evidence with the same price USD 10.' WHERE article_id=${ids[0]!}`;
    assert.equal((await composeStoryDigest(Number(legacy!.id))).updated, true, 'mixed historical prose does not freeze real updates');
    const updatedDetail = await loadStoryDetail(Number(legacy!.id)); assert.ok(updatedDetail);
    assert.equal((await localizePublication(updatedDetail, 'en')).contentLanguage!.language, 'unknown', 'new digest invalidates stored repair');
    assert.ok(await currentContent('story', legacyIdentity!.public_id, 'en'));
    assert.equal(config.modelCallsEnabled, false);
  } finally { mockProvider.restore(); }
});
after(closeDb);
