import './setup.ts';
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { MCP_TOOL_NAMES } from '@aihot/contracts/mcp';
import { config } from '@aihot/backend/config';
import { sql, closeDb } from '@aihot/backend/db';
import { stopBoss } from '@aihot/backend/jobs/queue';
import { upsertMaterial } from '@aihot/backend/content/materials';
import { publishArticle } from '@aihot/backend/publication/publish';
import { currentContent, saveTranslation } from '@aihot/backend/publication/content-language';
import { bodyEditionReady, editionReady, distributionLanguage } from '@aihot/backend/publication/distribution';
import { exportMarkdown } from '@aihot/backend/publication/detail';
import { loadItemShare } from '@aihot/backend/publication/og';
import { localizeV1 } from '@aihot/backend/publication/v1';
import { dailyIssueMail } from '@aihot/backend/newsletter/mail';
import { loadReport } from '@aihot/backend/publication/reports';
import { localizePublication } from '@aihot/backend/publication/content-language';
import { decodeCursor } from '@aihot/backend/lib/cursor';
import { buildApp } from '../apps/api/src/app.ts';
import { sha256 } from '@aihot/backend/lib/ids';
import { tag } from './setup.ts';

const T = tag();
const SOURCE = `distribution-${T}`;
const app = await buildApp();
let itemId: string;
let secondId: string;

before(async () => {
  // Earlier suites can leave a selected entry behind its release gate, holding the global watermark.
  await sql`UPDATE selected_ledger SET visible_at = now() WHERE visible_at > now()`;
  config.newsletterEnabled = false;
  await sql`INSERT INTO sources (id, name, kind, tier, site_fulltext, syndicate_fulltext, next_fetch_at)
    VALUES (${SOURCE}, 'Distribution fixture', 'rss', 'T1', true, true, '2100-01-01')`;
  for (let index = 0; index < 2; index++) {
    const material = await upsertMaterial({ sourceId: SOURCE, url: `https://example.org/distribution/${T}/${index}`,
      title: `Original release ${index}`, bodyHtml: '<p>English original body with a source link.</p>', bodyText: 'English original body with a source link.', bodyStatus: 'ok', via: 'fetch', publishedAt: new Date() });
    await sql`UPDATE articles SET language = 'en' WHERE id = ${material.articleId}`;
    await sql`INSERT INTO analyses (article_id, input_revision, origin, relevance, category, title_zh, summary_zh, reason_zh, score, selected)
      VALUES (${material.articleId}, 1, 'rule', 'pass', 'ai-models', ${`中文稿${index}-${T}`}, '中文摘要', '中文理由', 90, true)`;
    await publishArticle(material.articleId, { releasedAt: new Date(Date.now() - 60_000) });
    if (index === 0) itemId = material.articleId; else secondId = material.articleId;
  }
  const entry = await currentContent('item', itemId);
  assert.ok(entry);
  entry.translations = { title: `English release ${T}`, summary: 'A new model was released.', reason: 'A material capability improvement.' };
  await saveTranslation(entry, 'offline-agent', 'distribution-test', [], true);
});

after(async () => {
  await app.close();
  await sql`DELETE FROM content_translations WHERE content_id IN (${itemId}, ${secondId})`;
  await sql`DELETE FROM articles WHERE source_id = ${SOURCE}`;
  await sql`DELETE FROM sources WHERE id = ${SOURCE}`;
  await stopBoss();
  await closeDb();
});

test('v1 preserves its legacy default and exposes explicit stored English plus fallback status', async () => {
  const base = `/api/v1/items?mode=selected&by=published&limit=100`;
  const legacy = await app.inject(base);
  assert.equal(legacy.statusCode, 200);
  assert.equal(legacy.json().items.find((item: any) => item.id === itemId).title, `中文稿0-${T}`);
  const english = await app.inject(`${base}&lang=en`);
  assert.equal(english.statusCode, 200);
  const translated = english.json().items.find((item: any) => item.id === itemId);
  assert.equal(translated.title, `English release ${T}`);
  assert.equal(translated.contentLanguage.requested, 'en');
  assert.equal(translated.contentLanguage.status, 'translated');
  const missing = english.json().items.find((item: any) => item.id === secondId);
  assert.equal(missing.title, `中文稿1-${T}`);
  assert.equal(missing.contentLanguage.status, 'original');
  assert.notEqual(english.headers.etag, legacy.headers.etag);
  const chinese = await app.inject(`${base}&lang=zh`);
  assert.equal(chinese.statusCode, 200);
  assert.equal(chinese.json().items.find((item: any) => item.id === itemId).title, `中文稿0-${T}`);
});

test('invalid and repeated explicit API language values fail before reading publication', async () => {
  for (const endpoint of ['items', 'hot-topics', 'dailies', 'dailies/latest', 'selected/snapshot', 'selected/changes']) {
    assert.equal((await app.inject(`/api/v1/${endpoint}?lang=fr`)).statusCode, 400, endpoint);
    assert.equal((await app.inject(`/api/v1/${endpoint}?lang=en&lang=zh`)).statusCode, 400, endpoint);
  }
});

test('snapshot cursors bind language and cannot switch editions during incremental sync', async () => {
  const snapshot = await app.inject('/api/v1/selected/snapshot?lang=en&limit=1000');
  assert.equal(snapshot.statusCode, 200);
  const cursor = snapshot.json().cursor;
  assert.equal((await app.inject(`/api/v1/selected/changes?cursor=${encodeURIComponent(cursor)}&lang=zh`)).statusCode, 409);
  assert.equal((await app.inject(`/api/v1/selected/changes?cursor=${encodeURIComponent(cursor)}`)).statusCode, 200);
  const legacy = await app.inject('/api/v1/selected/snapshot?limit=1000');
  assert.equal(legacy.statusCode, 200);
  const legacyCursor = legacy.json().cursor;
  assert.equal(decodeCursor<{ l?: string }>('ax1', legacyCursor).l, undefined, 'omitted language retains the existing cursor format');
  assert.equal((await app.inject(`/api/v1/selected/changes?cursor=${encodeURIComponent(legacyCursor)}`)).statusCode, 200);
  assert.equal((await app.inject(`/api/v1/selected/changes?cursor=${encodeURIComponent(legacyCursor)}&lang=en`)).statusCode, 409);
});

test('explicit English minimal snapshots localize before trimming fields', async () => {
  const snapshot = await app.inject('/api/v1/selected/snapshot?lang=en&fields=minimal&limit=1000');
  assert.equal(snapshot.statusCode, 200);
  const item = snapshot.json().items.find((entry: any) => entry.id === itemId);
  assert.equal(item.title, `English release ${T}`);
  assert.equal(item.contentLanguage.status, 'translated');
  assert.equal('summary' in item, false);
});

test('versioned English feed includes only ready editions and retains permitted original English bodies', async () => {
  const feed = await app.inject('/feed/v2/full.xml');
  assert.equal(feed.statusCode, 200);
  assert.match(feed.body, /<language>en-US<\/language>/);
  assert.match(feed.body, new RegExp(`English release ${T}`));
  assert.doesNotMatch(feed.body, new RegExp(`中文稿1-${T}`));
  assert.match(feed.body, /English original body with a source link/);
  assert.match(feed.body, /<category>Models<\/category>/);
  const legacy = await app.inject('/feed/picks.xml');
  assert.match(legacy.body, /<language>zh-CN<\/language>/);
  assert.match(legacy.body, new RegExp(`中文稿0-${T}`));
});

test('English Markdown and OG read stored editions, with no mixed Chinese body', async () => {
  const markdown = await exportMarkdown(itemId, 'en');
  assert.ok(markdown);
  assert.match(markdown.body, /## Summary/);
  assert.match(markdown.body, /English original body/);
  assert.doesNotMatch(markdown.body, /中文摘要|中文理由|中文完整正文/);
  assert.equal((await loadItemShare(itemId, 'en'))?.title, `English release ${T}`);
  assert.equal(await loadItemShare(secondId, 'en'), null);
  assert.equal((await app.inject(`/og/items/${itemId}.png?lang=fr`)).statusCode, 400);
});

test('MCP advertises English defaults and refuses mixed or missing required editions', async () => {
  const rpc = async (method: string, params: object) => {
    const response = await app.inject({ method: 'POST', url: '/api/mcp',
      headers: { host: 'localhost', 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      payload: { jsonrpc: '2.0', id: 1, method, params } });
    assert.equal(response.statusCode, 200, response.body);
    const text = response.body.startsWith('{') ? response.body : response.body.split('\n').find(line => line.startsWith('data:'))!.slice(5).trim();
    return JSON.parse(text);
  };
  const initialized = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'distribution-test', version: '1' } });
  assert.equal(initialized.result.serverInfo.version, '4.0.0');
  const listing = await rpc('tools/list', {});
  assert.equal(listing.result.tools.find((tool: any) => tool.name === MCP_TOOL_NAMES.latest).inputSchema.properties.lang.default, 'en');
  const result = await rpc('tools/call', { name: MCP_TOOL_NAMES.latest, arguments: { limit: 2 } });
  assert.equal(result.result.isError, true);
  assert.equal(result.result.structuredContent.error.code, 'edition_unavailable');
});

test('default v1 projection preserves honest native English fallback metadata', async () => {
  const fallback = { title: 'Native English report', editorialLanguage: 'en',
    contentLanguage: { requested: 'zh', status: 'original', sourceLanguage: 'en' } };
  const result = await localizeV1(fallback);
  assert.deepEqual(result.contentLanguage, fallback.contentLanguage);
  assert.equal(result.title, fallback.title);
});

test('readiness guard rejects unknown metadata and distinguishes requested languages', () => {
  assert.equal(editionReady({ title: 'Ambiguous text' }, 'en'), false);
  assert.equal(editionReady({ editorialLanguage: 'en', contentLanguage: { requested: 'en', status: 'native', sourceLanguage: 'en' } }, 'en'), true);
  assert.equal(editionReady({ contentLanguage: { requested: 'en', status: 'original', sourceLanguage: 'en' } }, 'en'), true, 'native English original is ready for mail');
  assert.equal(editionReady({ editorialLanguage: 'en', contentLanguage: { requested: 'en', status: 'original', sourceLanguage: 'original' } }, 'en'), true);
  assert.equal(editionReady({ contentLanguage: { requested: 'en', status: 'original', sourceLanguage: 'unknown' } }, 'en'), false);
  assert.equal(editionReady({ contentLanguage: { requested: 'zh', status: 'translated', sourceLanguage: 'en' } }, 'en'), false);
  assert.equal(editionReady({ contentLanguage: { requested: 'en', status: 'original', sourceLanguage: 'zh', language: 'en' } }, 'en'), true);
  assert.equal(editionReady({ editorialLanguage: 'en', contentLanguage: { requested: 'en', status: 'translated', sourceLanguage: 'en', language: 'zh' } }, 'en'), false);
  assert.equal(bodyEditionReady({ bodyContentLanguage: { requested: 'en', status: 'original', sourceLanguage: 'zh', language: 'en' } }, 'en'), true);
  assert.equal(bodyEditionReady({ bodyContentLanguage: { requested: 'en', status: 'translated', sourceLanguage: 'zh', language: 'zh' } }, 'en'), false);
  assert.throws(() => distributionLanguage('fr'), RangeError);
});


test('native English and stored Chinese DTOs agree across site, v1, feeds, Markdown, OG, MCP and mail', async () => {
  const key = '2098-10-10';
  const material = await upsertMaterial({ sourceId: SOURCE, url: `https://example.org/native-distribution/${T}`,
    title: 'Native source title', language: 'en', bodyHtml: '<p>Permitted native English body.</p>', bodyText: 'Permitted native English body.', bodyStatus: 'ok', via: 'fetch', publishedAt: new Date() });
  const id = material.articleId;
  try {
    await sql`INSERT INTO analyses (article_id,input_revision,origin,relevance,category,editorial_language,title,summary,reason,score,selected)
      VALUES (${id},1,'rule','pass','ai-models','en','Native English headline','Native English summary.','Native editorial rationale.',90,true)`;
    await publishArticle(id, { releasedAt: new Date(Date.now() - 60_000) });
    const site = (await app.inject(`/api/site/items/${id}?lang=en`)).json();
    assert.equal(site.editorialLanguage, 'en'); assert.equal(site.contentLanguage.language, 'en');
    assert.equal(site.contentLanguage.status, 'original'); assert.equal(site.bodyContentLanguage.language, 'en');
    assert.equal(site.bodyContentLanguage.status, 'original-english');
    assert.equal((await app.inject(`/api/site/items/${id}?lang=zh`)).json().contentLanguage.language, 'en');
    for (const query of ['lang=fr', 'lang=en&lang=zh', 'lang=en&lang=en']) {
      for (const path of [`/api/site/items/${id}`, `/items/${id}/markdown`]) assert.equal((await app.inject(`${path}?${query}`)).statusCode, 400);
    }
    const v1 = (await app.inject('/api/v1/items?mode=selected&limit=100')).json().items.find((item: any) => item.id === id);
    assert.equal(v1.contentLanguage.requested, 'zh'); assert.equal(v1.contentLanguage.language, 'en');
    assert.equal((await app.inject(`/items/${id}/markdown`)).statusCode, 200);
    assert.match((await app.inject('/feed/v2/full.xml')).body, /Native English headline/);
    assert.equal((await loadItemShare(id, 'en'))!.title, site.title);
    const zh = await currentContent('item', id, 'zh'); assert.ok(zh);
    await saveTranslation({ ...zh, translations: { title: '原生稿中文标题', summary: '原生稿中文摘要。', reason: '原生稿中文推荐。' } }, 'offline-agent', 'integration-fixture', [], true);
    const chinese = (await app.inject(`/api/site/items/${id}?lang=zh`)).json();
    assert.equal(chinese.contentLanguage.language, 'zh'); assert.equal(chinese.bodyContentLanguage.language, 'en');
    const markdown = await exportMarkdown(id, 'zh'); assert.ok(markdown); assert.match(markdown.body, /原生稿中文标题/);
    assert.doesNotMatch(markdown.body, /Permitted native English body/);
    assert.match((await app.inject('/feed/v2/zh/picks.xml')).body, /原生稿中文标题/);
    const content = { title: 'Native English briefing', reportTimeZone: 'America/New_York', lead: { title: 'Native lead', leadParagraph: 'Native lead paragraph.' },
      sections: [{ label: 'Models', items: [{ itemId: id, title: 'Native report citation', summary: 'Native citation summary.', sourceName: 'Fixture', sourceUrl: 'https://example.org/native' }] }], flashes: [], highlights: [], metrics: {} };
    await sql`INSERT INTO reports(kind,key,editorial_language,window_start,window_end,content,generated_at)
      VALUES ('daily',${key},'en','2098-10-09T12:00:00Z','2098-10-10T12:00:00Z',${sql.json(content)},now())`;
    const report = await loadReport('daily', key); assert.ok(report); assert.equal(report.reportTimeZone, 'America/New_York');
    const english = await localizePublication(report, 'en'); assert.equal(editionReady(english, 'en'), true);
    assert.match(dailyIssueMail(english, 'en').text, /Native report citation/);
    const legacy = (await app.inject(`/api/v1/dailies/${key}`)).json().report;
    assert.equal(legacy.contentLanguage.requested, 'zh'); assert.equal(legacy.contentLanguage.language, 'en');
    assert.equal(legacy.reportTimeZone, 'America/New_York');
    const rpc = await app.inject({ method: 'POST', url: '/api/mcp', headers: { host: 'localhost', 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      payload: { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: MCP_TOOL_NAMES.daily, arguments: { date: key, lang: 'en' } } } });
    const message = JSON.parse(rpc.body.startsWith('{') ? rpc.body : rpc.body.split('\n').find(line => line.startsWith('data:'))!.slice(5));
    assert.notEqual(message.result.isError, true); assert.match(JSON.stringify(message.result), /Native report citation/);
    const entry = await currentContent('report', `daily:${key}`, 'zh'); assert.ok(entry);
    await saveTranslation({ ...entry, translations: Object.fromEntries(entry.segments.map(segment => [segment.key, '中文日报正文'])) }, 'offline-agent', 'integration-fixture', [], true);
    const translated = (await app.inject(`/api/site/reports/daily/${key}?lang=zh`)).json();
    assert.equal(translated.contentLanguage.language, 'zh'); assert.equal(translated.reportTimeZone, 'America/New_York');
    assert.match(dailyIssueMail(translated, 'zh').text, /中文日报正文/);
    await sql`UPDATE reports SET revision=revision+1 WHERE kind='daily' AND key=${key}`;
    assert.equal((await app.inject(`/api/site/reports/daily/${key}?lang=zh`)).json().contentLanguage.language, 'zh', 'a republication with the same text keeps its edition');
    await sql`UPDATE reports SET content=jsonb_set(content,'{lead,title}','"Corrected native lead"') WHERE kind='daily' AND key=${key}`;
    assert.equal((await app.inject(`/api/site/reports/daily/${key}?lang=zh`)).json().contentLanguage.language, 'en');
  } finally {
    await sql`DELETE FROM content_translations WHERE content_id IN (${id},${`daily:${key}`})`;
    await sql`DELETE FROM reports WHERE kind='daily' AND key=${key}`;
    await sql`DELETE FROM articles WHERE id=${id}`;
  }
});


test('the MCP Registry domain key is served as text at the site root', async () => {
  const response = await app.inject('/.well-known/mcp-registry-auth');
  assert.equal(response.statusCode, 200);
  assert.match(response.headers['content-type'] as string, /^text\/plain/);
  assert.match(response.body, /^v=MCPv1; k=ed25519; p=[A-Za-z0-9+/]{43}=\n$/);
  const glama = await app.inject('/.well-known/glama.json');
  assert.equal(glama.statusCode, 200);
  assert.match(glama.json().claim, /^glama_claim_/);
});

test('OpenAPI describes explicit edition selection while preserving historical monitor date semantics', async () => {
  const response = await app.inject('/openapi-v1.json'); assert.equal(response.statusCode, 200);
  const document = response.json();
  assert.deepEqual(document.components.parameters.Language.schema.enum, ['en', 'zh']);
  for (const [path, methods] of Object.entries(document.paths) as Array<[string, any]>) {
    const language = methods.get.parameters.some((parameter: any) => parameter.$ref === '#/components/parameters/Language');
    // The weekly, monthly and Agent endpoints return the stored issue as written; they take no edition parameter.
    if (/^\/api\/v1\/(weeklies|monthlies|agent)/.test(path)) continue;
    assert.equal(language, true, path);
  }
});


test('original-only headline readiness uses known source provenance and does not contaminate edited copy', async () => {
  const ids: string[] = [];
  try {
    for (const language of ['en', 'fr', null]) {
      const material = await upsertMaterial({ sourceId: SOURCE, url: `https://example.org/original-provenance/${T}/${language}`,
        title: language === 'fr' ? 'Un modèle original' : 'Original source headline', language,
        bodyText: 'Permitted source body.', bodyHtml: '<p>Permitted source body.</p>', bodyStatus: 'ok', via: 'fetch', publishedAt: new Date() });
      const id = material.articleId; ids.push(id); await publishArticle(id);
      const detail = (await app.inject(`/api/site/items/${id}?lang=en`)).json();
      assert.equal(detail.contentLanguage.language, language ?? 'unknown');
      assert.equal(detail.editorialLanguage, 'zh', 'storage compatibility default is not relabeled');
      assert.equal(editionReady(detail, 'en'), language === 'en');
      assert.equal((await app.inject(`/items/${id}/markdown`)).statusCode, language === 'en' ? 200 : 503);
      assert.equal((await loadItemShare(id, 'en')) !== null, language === 'en');
      assert.equal((await app.inject(`/items/${id}/markdown?lang=zh`)).statusCode, 503);
      assert.equal((await app.inject(`/api/site/items/${id}?lang=zh`)).statusCode, 200, 'readers keep the public fallback');
    }
    const id = ids[0]!;
    await sql`INSERT INTO analyses (article_id,input_revision,origin,relevance,category,title_zh,summary_zh,reason_zh,score,selected)
      VALUES (${id},1,'rule','pass','ai-models','真正的中文编辑稿','独立中文摘要。','中文推荐。',90,true)`;
    await publishArticle(id, { releasedAt: new Date(Date.now() - 60_000) });
    const edited = (await app.inject(`/api/site/items/${id}?lang=en`)).json();
    assert.equal(edited.contentLanguage.language, 'zh', 'known English source does not label Chinese edited prose English');
    assert.equal(edited.bodyContentLanguage.language, 'en');
    assert.equal(await loadItemShare(id, 'en'), null);
    await sql`INSERT INTO editorial_overrides (article_id,fields,reason,updated_by) VALUES (${id},${sql.json({ title: 'Manual title in another language' })},'test','integration-fixture')`;
    await publishArticle(id);
    const manual = (await app.inject(`/api/site/items/${id}?lang=zh`)).json();
    assert.equal(manual.contentLanguage.language, 'unknown', 'untyped manual override may mix languages');
    assert.equal(manual.title, 'Manual title in another language');
    assert.equal(editionReady(manual, 'zh'), false); assert.equal(await loadItemShare(id, 'zh'), null);
    await sql`INSERT INTO editorial_overrides (article_id,fields,reason,updated_by) VALUES (${ids[1]!},${sql.json({ summary: 'A manual summary' })},'test','integration-fixture')`;
    await publishArticle(ids[1]!);
    assert.equal((await app.inject(`/api/site/items/${ids[1]}?lang=en`)).json().contentLanguage.language, 'unknown');
  } finally {
    await sql`DELETE FROM articles WHERE id IN ${sql(ids)}`;
  }
});


test('Markdown preserves attributed quote evidence and links with honest missing-language markers', async () => {
  const quoteId = `8${Date.now()}`, ids: string[] = [];
  // X posts are shown only from a licensed X source (their text, quotes and media follow the source's site permission).
  const xSource = `${SOURCE}-x`;
  await sql`INSERT INTO sources (id, name, kind, tier, participation_mode, site_fulltext, syndicate_fulltext, next_fetch_at)
    VALUES (${xSource}, 'Distribution X fixture', 'x_search', 'T1', 'editorial', true, true, '2100-01-01')`;
  try {
    for (const language of ['en', 'zh']) {
      const material = await upsertMaterial({ sourceId: xSource, url: `https://x.com/reader/status/${Date.now()}-${language}`,
        title: 'A reader discusses a model release', language: 'en', bodyText: 'Read this release.', bodyHtml: '<p>Read this release.</p>', bodyStatus: 'ok', via: 'fetch', xPost: { tweetId: `9${Date.now()}`, handle: 'reader', authorName: 'Reader', text: 'Read this release.',
          quoted: { handle: 'lab', authorName: 'Lab', text: language === 'en' ? 'The quoted lab releases a model.' : '被引用的实验室发布新模型。', url: `https://x.com/lab/status/${quoteId}` } } });
      ids.push(material.articleId);
      await sql`INSERT INTO analyses(article_id,input_revision,origin,editorial_language,relevance,category,title,summary,score,selected)
        VALUES(${material.articleId},1,'rule','en','pass','ai-models','A reader discusses a model release','The reader points to the quoted release.',90,true)`;
      await publishArticle(material.articleId, { releasedAt: new Date(Date.now()-60000) });
      const markdown = await exportMarkdown(material.articleId,'en'); assert.ok(markdown);
      assert.match(markdown.body,/Quoted from @lab/); assert.match(markdown.body,new RegExp(quoteId));
      if(language === 'en') { assert.match(markdown.body,/> The quoted lab releases a model/); assert.match(markdown.body,/quote edition is unavailable.*language: unknown/); }
      else { assert.match(markdown.body,/quote edition is unavailable.*language: unknown/); assert.match(markdown.body,/> 被引用的实验室/); }
      const entry = await currentContent('item',material.articleId,'zh'); assert.ok(entry);
      await saveTranslation({ ...entry, translations: { title:'读者讨论新模型发布', summary:'读者引用了实验室的新模型发布。' } },'offline-agent','fixture',[],true);
      if(language === 'en') await sql`INSERT INTO quote_translations(tweet_id,text_hash,text_zh,origin) VALUES(${quoteId},${sha256('The quoted lab releases a model.')},'被引用的实验室发布新模型。','reused') ON CONFLICT(tweet_id) DO UPDATE SET text_zh=excluded.text_zh`;
      const chinese = await exportMarkdown(material.articleId,'zh'); assert.ok(chinese);
      assert.match(chinese.body,/引用自 @lab/); assert.match(chinese.body,/> 被引用的实验室/); assert.match(chinese.body,new RegExp(quoteId));
      if(language === 'en') assert.doesNotMatch(chinese.body,/所选语言的引用版本尚未就绪/);
      else assert.match(chinese.body,/所选语言的引用版本尚未就绪.*unknown/);
    }
    await sql`UPDATE sources SET site_fulltext=false WHERE id=${SOURCE}`;
    // X quoting is already public evidence; disabling licensed article fulltext never adds hidden prose.
    assert.ok(await exportMarkdown(ids[0]!,'en'));
    await sql`UPDATE publications SET visibility='withdrawn' WHERE article_id=${ids[0]!}`;
    assert.equal(await exportMarkdown(ids[0]!,'en'),null);
  } finally {
    await sql`DELETE FROM quote_translations WHERE tweet_id=${quoteId}`;
    await sql`DELETE FROM articles WHERE id IN ${sql(ids)}`;
    await sql`UPDATE sources SET site_fulltext=true WHERE id=${SOURCE}`;
  }
});
