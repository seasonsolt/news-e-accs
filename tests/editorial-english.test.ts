import './setup.ts';
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { closeDb } from '@aihot/backend/db';
import { buildMaterial, type AnalyzeInputArticle } from '@aihot/backend/editorial/input';
import { buildShortTweetPrompt, compactAnswerFirstSummary, finalizeCopy, looksEnglish, parseWritingOutput, renderContext } from '@aihot/backend/editorial/writing';
import { normalizeAnalysis, PROMPT_VERSIONS, type AnalysisRun } from '@aihot/backend/editorial/analyze';
import { contentTranslationPrompt, runContentTranslationSweep } from '@aihot/backend/editorial/content-translate';
import { contentSource } from '@aihot/backend/publication/content-source';
import { storyDigestLanguage } from '@aihot/backend/events/digest';
import { promptText } from '@aihot/backend/editorial/prompts';

const original: AnalyzeInputArticle = { id: 'original', revision: 2, title: 'A lab releases Model 2.5', url: 'https://example.com/model', author: null, publishedAt: null,
  language: 'en', bodyText: 'A lab releases Model 2.5 for USD 10.', excerpt: null, xPost: null, media: [], source: { name: 'A lab', kind: 'rss', tier: 'T1', firstParty: true }, translationZh: 'DO NOT READ THE STORED CHINESE TRANSLATION' };

test('understanding and structure use original material without the Chinese intermediary', () => {
  assert.ok(buildMaterial(original).includes(original.bodyText!));
  assert.ok(renderContext(original).includes(original.bodyText!));
  assert.ok(!buildMaterial(original).includes(original.translationZh!));
  assert.ok(promptText('understand').includes('original material'));
  assert.ok(PROMPT_VERSIONS.understand.includes('@'));
});

test('English copy accepts sparse facts, preserves numbers, and requires English prose', () => {
  const input = { title: original.title, text: original.bodyText!, sourceKind: 'rss' };
  const copy = finalizeCopy(input, { title: original.title, summary: 'The lab releases Model 2.5 for USD 10.' });
  assert.equal(copy.summary, 'The lab releases Model 2.5 for USD 10.');
  assert.equal(copy.identityGuard.outcome, 'pass');
  assert.equal(finalizeCopy(input, { title: '实验室发布新模型', summary: '实验室发布了新模型。' }).title, '');
  assert.equal(looksEnglish('The post says “发布模型” in its original wording.'), true);
  assert.equal(looksEnglish('实验室 releases model'), false);
  const guard = finalizeCopy(input, { title: 'OpenAI releases Model 2.5', summary: 'OpenAI releases a new model.' });
  assert.equal(guard.title, original.title);
  assert.equal(guard.summary, '');
});

test('short X output retains original line breaks, URLs and quote attribution instructions', () => {
  const post = 'Model 2.5 is available.\nhttps://example.com/model';
  const prompt = buildShortTweetPrompt({ title: 'Go build!', text: post, mainText: 'Go build!', quotedText: post, quotedAuthor: 'lab', sourceKind: 'x_search' });
  assert.ok(prompt.includes(post));
  assert.ok(prompt.includes('explicit attribution to @lab'));
  assert.ok(prompt.includes("not the main author's work"));
  const parsed = parseWritingOutput(`title: The lab releases Model 2.5\nbody: Model 2.5 is available.\n\nhttps://example.com/model`);
  assert.equal(parsed.body, 'Model 2.5 is available.\n\nhttps://example.com/model');
});

test('long English copy is compacted at sentence boundaries without clipping a version number', () => {
  const sentence = 'The lab releases Model 2.5, with USD 10 pricing and public benchmark details. ';
  const compact = compactAnswerFirstSummary(sentence.repeat(30));
  assert.ok(compact.length <= 800);
  assert.ok(compact.includes('Model 2.5'));
  assert.ok(compact.endsWith('.'));
});

test('new normalized analysis has neutral English fields and retains the exact scoring rule', () => {
  const run: AnalysisRun = { prefilter: { label: 'PASS', reason: '', model: 'fixture', receiptId: 1, reused: true },
    scores: { model: 'fixture', threshold: 60, values: [59, 61], receiptIds: [2, 3], reused: true },
    writing: { kind: 'understand', model: 'fixture', title: original.title, summary: original.bodyText!, reason: 'The source provides access terms.', receiptIds: [4], reused: true }, structure: null };
  const result = normalizeAnalysis(run);
  assert.equal(result.editorialLanguage, 'en'); assert.equal(result.selected, true); assert.equal(result.score, 60);
  assert.equal(result.title, original.title); assert.ok(!('titleZh' in result));
  const missing = normalizeAnalysis({ ...run, writing: { ...run.writing!, title: '' } });
  assert.equal(missing.relevance, 'unknown'); assert.equal(missing.selected, false);
});

test('edition receipts distinguish source, target and source fingerprint', () => {
  const en = contentSource('item', 'id', { editorialLanguage: 'en', title: 'Model 2.5 launches' }, 'zh');
  const zh = contentSource('item', 'id', { editorialLanguage: 'zh', title: '模型发布' }, 'en');
  const first = contentTranslationPrompt(en), second = contentTranslationPrompt(zh);
  assert.ok(first.subject.includes(':en->zh')); assert.ok(second.subject.includes(':zh->en'));
  assert.notEqual(first.subject, second.subject);
  assert.ok(first.system.includes('Simplified Chinese')); assert.ok(second.system.includes('US English'));
  assert.equal(first.promptVersion, 'content-edition-v2');
  const changed = contentTranslationPrompt(contentSource('item', 'id', { editorialLanguage: 'en', title: 'Model 2.6 launches' }, 'zh'));
  assert.notEqual(first.subject, changed.subject);
});

test('sweep never conflates different language editions of the same record', async () => {
  const entries = [contentSource('item', 'id', { editorialLanguage: 'en', title: 'Model launches' }, 'zh'), contentSource('item', 'id', { editorialLanguage: 'zh', title: '模型发布' }, 'en')];
  const translated: string[] = [];
  const result = await runContentTranslationSweep('', 2, { priority: async () => [entries[0]!], scan: async () => ({ entries, scanned: 2, nextCursor: 'item:id' }),
    translate: async entry => { translated.push(entry.targetLanguage!); }, checkpoint: async () => {} });
  assert.equal(result.translated, 2); assert.deepEqual(translated, ['zh', 'en']);
});

test('locked legacy Chinese titles retain Chinese digests; normal updates become English', () => {
  assert.equal(storyDigestLanguage({ origin: 'manual', editorial_language: 'zh' }), 'zh');
  assert.equal(storyDigestLanguage({ origin: 'manual', editorial_language: 'en' }), 'en');
  assert.equal(storyDigestLanguage({ origin: 'model', editorial_language: 'zh' }), 'en');
  assert.ok(promptText('story-digest-zh').includes('事件综述'));
  assert.ok(promptText('story-digest').includes('US English'));
});
after(closeDb);
