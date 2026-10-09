// Scheduling and recovery use local evidence only; model/collector valves stay closed.
import { stub, tag } from './setup.ts';
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { config } from '@aihot/backend/config';
import { sql, closeDb } from '@aihot/backend/db';
import { upsertMaterial } from '@aihot/backend/content/materials';
import { publishArticle } from '@aihot/backend/publication/publish';
import { currentContent, saveTranslation, priorityContentEntries } from '@aihot/backend/publication/content-language';
import { paidRequest, completeReceipt } from '@aihot/backend/providers/receipts';
import { contentSource, type TranslationEntry } from '@aihot/backend/publication/content-source';
import { runContentTranslationSweep, translateContentPending } from '@aihot/backend/editorial/content-translate';

// This file owns its test process; close its model valve even when CI leaves the global default
// enabled for other files' local model stubs. No environment/production config is changed.
config.modelCallsEnabled = false;

const entry = (id: string, title = '当前公开标题') => contentSource('item', id, { title });
function queue(rows: TranslationEntry[], completed: TranslationEntry[] = [], priority: TranslationEntry[] = []) {
  const hashes = new Map(completed.map(e => [`${e.kind}:${e.id}`, e.sourceHash]));
  const calls: string[] = [], cursors: string[] = [], sizes: number[] = [];
  return { hashes, calls, cursors, sizes, deps: {
    priority: async () => priority,
    scan: async (cursor: string, size: number) => {
      sizes.push(size);
      const page = rows.filter(e => `${e.kind}:${e.id}` > cursor).slice(0, size);
      return { scanned: page.length, nextCursor: page.at(-1) ? `${page.at(-1)!.kind}:${page.at(-1)!.id}` : null,
        entries: page.filter(e => hashes.get(`${e.kind}:${e.id}`) !== e.sourceHash) };
    },
    translate: async (e: TranslationEntry) => { calls.push(e.id); hashes.set(`${e.kind}:${e.id}`, e.sourceHash); },
    checkpoint: async (cursor: string) => { cursors.push(cursor); },
  } };
}

test('completed pages do not consume the translation limit; stopping mid-page never skips later pending entries', async () => {
  const rows = Array.from({ length: 2502 }, (_, i) => entry(String(i).padStart(5, '0')));
  const q = queue(rows, rows.slice(0, 2500));
  const first = await runContentTranslationSweep('', 1, q.deps);
  assert.equal(first.translated, 1); assert.equal(first.scanned, 2502);
  assert.deepEqual(q.sizes, [1000, 1000, 1000]); assert.deepEqual(q.calls, ['02500']);
  assert.equal(first.cursor, 'item:02500');
  const second = await runContentTranslationSweep(first.cursor, 1, q.deps);
  assert.equal(second.translated, 1); assert.deepEqual(q.calls, ['02500', '02501']);
});

test('a source edited before the saved cursor is found in the same tick, even when later rows are complete', async () => {
  const old = [entry('a'), entry('b'), entry('z')];
  const changed = entry('a', '修改后的公开标题');
  const q = queue([changed, ...old.slice(1)], old);
  const result = await runContentTranslationSweep('item:b', 5, q.deps);
  assert.deepEqual(q.calls, ['a']); assert.equal(result.cursor, ''); assert.equal(result.translated, 1);
  assert.equal(q.hashes.get('item:a'), changed.sourceHash);
});

test('priority headlines count toward the same limit, deduplicate the sweep and reserve historical progress', async () => {
  const rows = [entry('a'), entry('b'), entry('z')];
  const q = queue(rows, [], [rows[2]!]);
  const result = await runContentTranslationSweep('', 2, q.deps);
  assert.deepEqual(q.calls, ['z', 'a']); assert.equal(result.cursor, 'item:a'); assert.equal(result.translated, 2);
  const retry = await runContentTranslationSweep(result.cursor, 2, { ...q.deps, priority: async () => [] });
  assert.equal(retry.translated, 1); assert.deepEqual(q.calls, ['z', 'a', 'b']);
});

test('a failed edition leaves the cursor unchanged while earlier stored editions are skipped on retry', async () => {
  const rows = [entry('a'), entry('b'), entry('c')], q = queue(rows);
  let fail = true;
  const deps = { ...q.deps, translate: async (e: TranslationEntry) => {
    if (e.id === 'b' && fail) { fail = false; throw new Error('provider/save failed'); }
    await q.deps.translate(e);
  } };
  await assert.rejects(runContentTranslationSweep('', 3, deps), /provider\/save failed/);
  assert.deepEqual(q.cursors, []); assert.deepEqual(q.calls, ['a']);
  const recovered = await runContentTranslationSweep('', 3, deps);
  assert.equal(recovered.translated, 2); assert.deepEqual(q.calls, ['a', 'b', 'c']);
});

test('recovery reuses the real receipt after a local provider answer, with every attempt budgeted', async () => {
  const T = tag(), provider = await stub(() => ({ translations: { title: 'Current public headline' } }));
  const e = entry(`receipt-${T}`), q = queue([e]);
  let failSave = true; const used: number[] = [];
  try {
    const deps = { ...q.deps, translate: async (source: TranslationEntry) => {
      const result = await paidRequest({ service: 'deepseek', model: 'local-test', purpose: 'translate_content',
        subject: `${source.kind}:${source.id}@${source.sourceHash}#0`, identity: { kind: source.kind, id: source.id, sourceHash: source.sourceHash, promptVersion: 'content-en-v1', segments: source.segments } },
        async () => ({ response: await (await fetch(provider.url, { method: 'POST', body: JSON.stringify(source.segments) })).json(), usage: { total_tokens: 1 } }));
      used.push(result.receiptId);
      if (failSave) { failSave = false; throw new Error('lost business commit'); }
      await q.deps.translate(source); await completeReceipt(sql, result.receiptId);
    } };
    await assert.rejects(runContentTranslationSweep('', 1, deps), /lost business commit/);
    assert.deepEqual(q.cursors, []);
    await runContentTranslationSweep('', 1, deps);
    assert.equal(provider.hits(), 1); assert.equal(used.length, 2); assert.equal(used[0], used[1]);
    const [attempts] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM receipt_attempts WHERE receipt_id=${used[0]!}`;
    assert.equal(attempts!.n, 1);
    const [receipt] = await sql`SELECT status FROM receipts WHERE id=${used[0]!}`;
    assert.equal(receipt!.status, 'completed');
  } finally { await provider.close(); }
});

test('the real public priority projection finds new and edited headlines but excludes completed and unreleased editions', async () => {
  const T = tag(), source = `test-continuous-${T}`, ids: string[] = [];
  await sql`INSERT INTO sources(id,name,kind,tier,participation_mode,site_fulltext,next_fetch_at) VALUES(${source},'Continuous fixture','rss','T1','editorial',false,'2100-01-01')`;
  for (let index = 0; index < 3; index++) {
    const material = await upsertMaterial({ sourceId: source, url: `https://example.com/continuous-${T}-${index}`, title: `Original ${index}`, language: 'en', bodyText: 'Summary only.', bodyStatus: 'none', via: 'fetch', discoveredAt: new Date(Date.now() + index * 1000) });
    ids.push(material.articleId);
    await sql`INSERT INTO analyses(article_id,input_revision,origin,relevance,category,title_zh,summary_zh,reason_zh,score,selected)
      VALUES(${material.articleId},1,'rule','pass','ai-products',${`新公开标题${index}`},'中文摘要',null,65,false)`;
    await publishArticle(material.articleId);
  }
  const complete = await currentContent('item', ids[0]!); assert.ok(complete);
  await saveTranslation({ ...complete, translations: Object.fromEntries(complete.segments.map(s => [s.key, 'Previously translated text'])) }, 'offline-agent', 'test-fixture', [], true);
  await sql`UPDATE publications SET selected=true,visible_after=now()+interval '1 hour' WHERE article_id=${ids[2]!}`;
  const first = await priorityContentEntries();
  assert.ok(first.some(e => e.id === ids[1])); assert.ok(!first.some(e => e.id === ids[0] || e.id === ids[2]));
  await sql`UPDATE publications SET title='编辑修订后的公开标题' WHERE article_id=${ids[0]!}`;
  const edited = (await priorityContentEntries()).find(e => e.id === ids[0]); assert.ok(edited);
  assert.notEqual(edited.sourceHash, complete.sourceHash);
  await sql`UPDATE publications SET visibility='withdrawn' WHERE article_id=${ids[1]!}`;
  assert.ok(!(await priorityContentEntries()).some(e => e.id === ids[1]));
});

test('the opt-in defaults to closed', async () => {
  const previous = process.env.CONTENT_TRANSLATION_ENABLED;
  delete process.env.CONTENT_TRANSLATION_ENABLED;
  try { assert.deepEqual(await translateContentPending(), { disabled: true, translated: 0 }); }
  finally { if (previous !== undefined) process.env.CONTENT_TRANSLATION_ENABLED = previous; }
});

test('the deployed entry point remains disabled with the model valve closed', async () => {
  const previous = process.env.CONTENT_TRANSLATION_ENABLED;
  process.env.CONTENT_TRANSLATION_ENABLED = 'true';
  try { assert.deepEqual(await translateContentPending(), { disabled: true, translated: 0 }); }
  finally { if (previous === undefined) delete process.env.CONTENT_TRANSLATION_ENABLED; else process.env.CONTENT_TRANSLATION_ENABLED = previous; }
});
after(closeDb);
