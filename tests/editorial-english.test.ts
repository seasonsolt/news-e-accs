import './setup.ts';
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { closeDb } from '@aihot/backend/db';
import { buildMaterial, type AnalyzeInputArticle } from '@aihot/backend/editorial/input';
import { buildShortTweetPrompt, compactAnswerFirstSummary, finalizeCopy, looksEnglish, parseWritingOutput, renderContext } from '@aihot/backend/editorial/writing';
import { normalizeAnalysis, PROMPT_VERSIONS, type AnalysisRun } from '@aihot/backend/editorial/analyze';
import { contentTranslationPrompt, runContentTranslationSweep } from '@aihot/backend/editorial/content-translate';
import { contentSource } from '@aihot/backend/publication/content-source';
import { englishDisplayName, englishReaderText, presentEnglish } from '@aihot/contracts/english-surface';
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
  assert.equal(looksEnglish('The post says “发布模型” in its original wording.'), false);
  assert.equal(looksEnglish('实验室 releases model'), false);
  assert.ok(promptText('understand').includes('Do not use Han'));
  assert.ok(!promptText('understand').includes('官方中文品牌'));
  const guard = finalizeCopy(input, { title: 'OpenAI releases Model 2.5', summary: 'OpenAI releases a new model.' });
  assert.equal(guard.title, original.title);
  assert.equal(guard.summary, '');
});

test('Chinese characters in an English summary are rejected instead of published', () => {
  const input = { title: '小米开源了个150元的AI小玩意', text: '小米开源 HachimoDock，硬件自制成本约150元，硬件BOM、结构模型和组装教程发布在嘉立创。', sourceKind: 'rss' };
  const summary = 'Xiaomi has open-sourced HachimoDock, an AI desktop companion with a reported DIY hardware cost of about 150 yuan. Hardware bills of materials, structural models, and assembly tutorials are available on 嘉立创.';
  const copy = finalizeCopy(input, { title: 'Xiaomi open-sources HachimoDock, an AI desktop companion costing about 150 yuan to build', summary });
  assert.equal(copy.title, 'Xiaomi open-sources HachimoDock, an AI desktop companion costing about 150 yuan to build');
  assert.equal(copy.summary, 'Xiaomi has open-sourced HachimoDock, an AI desktop companion with a reported DIY hardware cost of about 150 yuan.');
  assert.equal(copy.identityGuard.outcome, 'pass');
  const run: AnalysisRun = { prefilter: { label: 'PASS', reason: '', model: 'fixture', receiptId: 1, reused: true },
    scores: { model: 'fixture', threshold: 76, values: [77, 73], receiptIds: [2, 3], reused: true },
    writing: { ...copy, kind: 'understand', model: 'fixture', reason: null, receiptIds: [4], reused: true }, structure: null };
  const out = normalizeAnalysis(run);
  assert.equal(out.relevance, 'pass');
  assert.equal(out.summary, copy.summary);
  assert.equal(out.selected, false);
  assert.equal(finalizeCopy(input, { title: copy.title, summary: '小米开源 HachimoDock，硬件自制成本约150元。' }).summary, '');
  assert.equal(finalizeCopy(input, { title: copy.title, summary: '嘉立创 hosts the HachimoDock tutorials. The dock costs about 150 yuan.' }).summary, '', 'a leading CJK name is rejected, not cut out');
  assert.equal(finalizeCopy(input, { title: '嘉立创 hosts HachimoDock', summary }).title, '');
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
  assert.equal(first.promptVersion, 'content-edition-v3');
  assert.match(second.system, /must not contain Han/);
  assert.doesNotMatch(first.system, /must not contain Han/);
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

test('English reader text maps known names and drops only whole trailing CJK sentences', () => {
  assert.equal(englishDisplayName('量子位'), 'QbitAI');
  assert.equal(englishDisplayName('雷锋网'), 'Leiphone');
  assert.equal(englishDisplayName('宝玉 · X'), 'Baoyu');
  assert.equal(englishDisplayName('Z.ai 智谱 · X'), 'Z.ai Zhipu');
  assert.equal(englishDisplayName('机器之心'), '机器之心', 'an unknown name is kept, not replaced by a placeholder');
  assert.equal(englishReaderText('Xiaomi released a dock. Tutorials are on 嘉立创.'), 'Xiaomi released a dock.');
  assert.equal(englishReaderText('莱芒生物 explains the trial. It enrolled 40 patients.'), null, 'a leading sentence is never cut');
  assert.equal(englishReaderText('A deal between 晶泰科技 and partners.'), null);
  const page = presentEnglish({
    title: 'OpenAI 发布 GPT-5.5 Turbo',
    summary: 'Xiaomi released a dock. Tutorials are on 嘉立创.',
    source: { name: '量子位' },
    author: '机器之心',
    tags: ['评测/基准'],
    x: { authorName: '宝玉' },
  });
  assert.equal(page.title, 'OpenAI 发布 GPT-5.5 Turbo', 'unmarked prose is not rewritten');
  assert.equal(page.summary, 'Xiaomi released a dock. Tutorials are on 嘉立创.');
  assert.equal(page.source.name, 'QbitAI');
  assert.equal(page.author, '机器之心');
  assert.equal(page.x.authorName, 'Baoyu');
  assert.deepEqual(page.tags, ['评测/基准']);
  const fallback = presentEnglish({ title: '示例标题', contentLanguage: { language: 'zh' }, source: { name: '量子位' } });
  assert.equal(fallback.title, '示例标题');
  assert.equal(fallback.source.name, '量子位');
  const english = presentEnglish({ title: '量子位发布', summary: 'Xiaomi released a dock. 教程发布在嘉立创。', contentLanguage: { language: 'en' }, source: { name: '量子位' } });
  assert.equal(english.source.name, 'QbitAI');
  assert.equal(english.title, '量子位发布', 'a sentence that cannot be cleaned whole stays as stored');
  assert.equal(english.summary, 'Xiaomi released a dock.');
});

test('locked legacy Chinese titles retain Chinese digests; normal updates become English', () => {
  assert.equal(storyDigestLanguage({ origin: 'manual', editorial_language: 'zh' }), 'zh');
  assert.equal(storyDigestLanguage({ origin: 'manual', editorial_language: 'en' }), 'en');
  assert.equal(storyDigestLanguage({ origin: 'model', editorial_language: 'zh' }), 'en');
  assert.ok(promptText('story-digest-zh').includes('事件综述'));
  assert.ok(promptText('story-digest').includes('US English'));
});
after(closeDb);
