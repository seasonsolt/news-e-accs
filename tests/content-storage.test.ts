import { editionReady, bodyEditionReady } from '@aihot/backend/publication/distribution';
import { digestInputsHash, digestReports } from '@aihot/backend/publication/story-evidence';
import { loadReport } from '@aihot/backend/publication/reports';
import { tag } from './setup.ts';
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { sql, closeDb } from '@aihot/backend/db';
import { upsertMaterial } from '@aihot/backend/content/materials';
import { publishArticle } from '@aihot/backend/publication/publish';
import { loadItemDetail, siteItemDetail } from '@aihot/backend/publication/detail';
import { fetchItemsByIds, toItemSummary } from '@aihot/backend/publication/items';
import { loadPool } from '@aihot/backend/publication/pool';
import { contentSource, legacySourceHash, validateTranslation, targetLanguageProse } from '@aihot/backend/publication/content-source';
import { currentContent, saveTranslation, localizePublication, exportContentBatch } from '@aihot/backend/publication/content-language';

const T=tag(), sourceId=`native-content-${T}`;
let id='';
before(async()=>{
  await sql`INSERT INTO sources(id,name,kind,tier,participation_mode,site_fulltext,next_fetch_at)
    VALUES(${sourceId},'Native fixture','rss','T1','editorial',true,'2100-01-01')`;
  const material=await upsertMaterial({sourceId,url:`https://example.com/native-${T}`,title:'Native accelerator',language:'en',bodyText:'Original licensed English body.',bodyHtml:'<h2>English heading</h2><p>Original licensed English body.</p>',bodyStatus:'ok',via:'fetch',publishedAt:new Date()});
  id=material.articleId;
  await sql`INSERT INTO analyses(article_id,input_revision,origin,editorial_language,relevance,category,title,summary,reason,score,selected)
    VALUES(${id},1,'rule','en','pass','ai-products','Native accelerator','Independent English summary.','Editorial rationale.',90,true)`;
  await publishArticle(id,{releasedAt:new Date(Date.now()-60000)});
});
after(closeDb);
const item=async()=>toItemSummary((await fetchItemsByIds([id])).get(id)!);
const projection=async()=>{
  const detail=await loadItemDetail(id);assert.equal(detail.kind,'found');
  if(detail.kind!=='found') throw new Error('fixture not found');
  return siteItemDetail(detail.detail);
};

test('neutral English analysis publishes without Chinese; native header and original English body skip translation',async()=>{
  const [analysis]=await sql`SELECT editorial_language,title_zh,summary_zh,reason_zh FROM analyses WHERE article_id=${id}`;
  assert.equal(analysis!.editorial_language,'en');assert.equal(analysis!.title_zh,null);assert.equal(analysis!.summary_zh,null);assert.equal(analysis!.reason_zh,null);
  const [publication]=await sql`SELECT editorial_language,eligible,selected FROM publications WHERE article_id=${id}`;
  assert.equal(publication!.editorial_language,'en');assert.equal(publication!.eligible,true);assert.equal(publication!.selected,true);
  assert.equal(await currentContent('item',id),null);assert.equal(await currentContent('body',id),null);
  const en:any=await localizePublication(await projection(),'en');
  assert.equal(en.title,'Native accelerator');assert.equal(en.contentLanguage.language,'en');assert.equal(en.contentLanguage.status,'original');
  assert.equal(en.bodyContentLanguage.status,'original-english');assert.equal(en.bodyContentLanguage.language,'en');assert.match(en.body.original,/Original licensed English body/);assert.equal(en.body.complete,true);assert.equal(en.body.zhKind,null);
  const search=await loadPool({channel:'all',category:null,tag:null,lang:'en',q:'native accelerator'});assert.ok(search.items.some(i=>i.id===id));
  const batch=await exportContentBatch('',1000);assert.ok(!batch.entries.some(e=>e.id===id));
});

test('Chinese edition and body have independent readiness; language metadata and incomplete fields cannot import',async()=>{
  const entry=await currentContent('item',id,'zh');assert.ok(entry);assert.equal(entry.sourceLanguage,'en');assert.equal(entry.targetLanguage,'zh');
  await assert.rejects(()=>saveTranslation({...entry,targetLanguage:'en',translations:{title:'wrong'}},'offline-agent','fixture',[],true),/not currently public/);
  assert.throws(()=>validateTranslation({...entry,sourceLanguage:'zh',translations:{title:'错误'}},entry),/stale/);
  await assert.rejects(()=>saveTranslation({...entry,translations:{title:'中文标题'}},'offline-agent','fixture',[],true),/incomplete/);
  await saveTranslation({...entry,translations:{title:'中文主标题',summary:'中文摘要',reason:'中文推荐'}},'offline-agent','fixture',[],true);
  const missing:any=await localizePublication(await projection(),'zh');
  assert.equal(missing.title,'中文主标题');assert.equal(missing.contentLanguage.status,'translated');assert.equal(missing.bodyContentLanguage.language,'en');assert.equal(missing.bodyContentLanguage.status,'original-english');
  const body=await currentContent('body',id,'zh');assert.ok(body);assert.equal(body.sourceLanguage,'en');
  await saveTranslation({...body,translations:{'blocks.0.text':'中文小标题','blocks.1.text':'许可的中文正文。'}},'offline-agent','fixture',[],true);
  const zh:any=await localizePublication(await projection(),'zh');assert.equal(zh.bodyContentLanguage.status,'translated');assert.equal(zh.bodyContentLanguage.language,'zh');assert.match(zh.body.zh,/许可的中文正文/);assert.equal(zh.outline[0].text,'中文小标题');assert.equal(zh.body.zhKind,'translation');assert.equal(zh.body.complete,true);
  const original:any=await localizePublication(await projection(),'zh',true);assert.equal(original.bodyContentLanguage.language,'en');
  assert.notEqual(contentSource('item',id,{title:'Same',editorialLanguage:'en'}).sourceHash,contentSource('item',id,{title:'Same',editorialLanguage:'zh'}).sourceHash);
});

test('header and body edits independently invalidate editions; body permission and withdrawal win',async()=>{
  await sql`UPDATE analyses SET title='Revised native accelerator' WHERE article_id=${id}`;
  await publishArticle(id);
  const updated:any=await localizePublication(await projection(),'zh');assert.equal(updated.title,'Revised native accelerator');assert.equal(updated.contentLanguage.language,'en');assert.equal(updated.bodyContentLanguage.status,'translated');
  await sql`UPDATE articles SET body_html='<h2>Changed</h2><p>Updated English body.</p>' WHERE id=${id}`;
  const changed:any=await localizePublication(await projection(),'zh');assert.equal(changed.bodyContentLanguage.language,'en');assert.equal(changed.bodyContentLanguage.status,'original-english');
  await sql`UPDATE sources SET site_fulltext=false WHERE id=${sourceId}`;
  await publishArticle(id); // a licence change reaches readers when the item is republished
  const revoked:any=await localizePublication(await projection(),'zh');assert.equal(revoked.body,null);assert.equal(await currentContent('body',id,'zh'),null);
  await sql`UPDATE publications SET visibility='withdrawn' WHERE article_id=${id}`;
  assert.equal((await loadItemDetail(id)).kind,'not_found');assert.equal(await currentContent('item',id,'zh'),null);
});

test('existing pre-migration Chinese-to-English edition remains valid and incomplete editions fall back',async()=>{
  await sql`UPDATE analyses SET editorial_language='zh',title=NULL,summary=NULL,reason=NULL,title_zh='旧中文标题',summary_zh='旧中文摘要',reason_zh='推荐' WHERE article_id=${id}`;
  await publishArticle(id);
  const entry=contentSource('item',id,await item());
  await sql`INSERT INTO content_translations(kind,content_id,lang,source_hash,source_segments,translations,provenance,model)
    VALUES('item',${id},'en',${legacySourceHash(entry)},${sql.json(entry.segments)},${sql.json({title:'Historical orbital engine',summary:'Legacy English summary',reason:'Rationale'})},'offline-agent','legacy')`;
  const en:any=await localizePublication(await item(),'en');assert.equal(en.title,'Historical orbital engine');assert.equal(en.contentLanguage.status,'translated');
  const search=await loadPool({channel:'all',category:null,tag:null,lang:'en',q:'historical orbital'});assert.ok(search.items.some(i=>i.id===id));
  await sql`UPDATE content_translations SET translations=${sql.json({title:'Historical orbital engine'})} WHERE kind='item' AND content_id=${id} AND lang='en'`;
  const incomplete:any=await localizePublication(await item(),'en');assert.equal(incomplete.title,'旧中文标题');assert.equal(incomplete.contentLanguage.status,'original');
  const invalidSearch=await loadPool({channel:'all',category:null,tag:null,lang:'en',q:'historical orbital'});assert.ok(!invalidSearch.items.some(i=>i.id===id));
  await sql`UPDATE content_translations SET source_hash=${'0'.repeat(64)},translations=${sql.json({title:'Historical orbital engine',summary:'Legacy English summary',reason:'Rationale'})} WHERE kind='item' AND content_id=${id} AND lang='en'`;
  const wrongHash=await loadPool({channel:'all',category:null,tag:null,lang:'en',q:'historical orbital'});assert.ok(!wrongHash.items.some(i=>i.id===id));
});

test('native English story and report editions work without reinterpreting revisions',async()=>{
  // The event's latest development is its newest public report: make that report native English again.
  await sql`UPDATE analyses SET editorial_language='en',title='Native English accelerator',summary='Native English summary',reason='Native reason',title_zh=NULL,summary_zh=NULL,reason_zh=NULL WHERE article_id=${id}`;
  await sql`UPDATE sources SET site_fulltext=true WHERE id=${sourceId}`;
  await publishArticle(id);
  const publicId='88888888-8888-4888-8888-'+T.replace(/[^a-f0-9]/g,'').padEnd(12,'0').slice(0,12);
  const [story]=await sql<{id:number}[]>`INSERT INTO stories(public_id,editorial_language,title,summary,digest,latest,latest_at)
    VALUES(${publicId},'en','English event','English event summary','English digest','English development',now()) RETURNING id`;
  const [fact]=await sql<{id:number}[]>`INSERT INTO facts(public_id,story_id,editorial_language,title) VALUES(${`native-fact-${T}`},${story!.id},'en','English fact') RETURNING id`;
  await sql`INSERT INTO fact_articles(fact_id,article_id,role) VALUES(${fact!.id},${id},'primary')`;
  const evidence=await digestReports(sql,[story!.id]);
  await sql`INSERT INTO story_digests(story_id,version,digest,latest,article_ids,inputs_hash) VALUES(${story!.id},1,'English digest','English development',${evidence.map(r=>r.id)},${digestInputsHash(evidence)})`;
  assert.equal(await currentContent('story',publicId,'en'),null);
  const storyEntry=await currentContent('story',publicId,'zh');assert.ok(storyEntry);
  await saveTranslation({...storyEntry,translations:Object.fromEntries(storyEntry.segments.map(s=>[s.key,`中文 ${s.key}`]))},'offline-agent','fixture',[],true);
  const localized:any=await localizePublication({publicId,title:'English event'},'zh');assert.equal(localized.title,'中文 title');assert.equal(localized.editorialLanguage,'en');
  const hot:any=await localizePublication({entries:[{rank:1,story:{publicId,title:'English event'},summary:'English digest',latest:'Native English accelerator'}]},'zh'); // the latest development is the newest public report's headline
  assert.equal(hot.entries[0].story.title,'中文 title');assert.equal(hot.entries[0].summary,'中文 digest');assert.equal(hot.entries[0].latest,'中文 latest');assert.equal(hot.entries[0].contentLanguage.language,'zh');
  await sql`UPDATE facts SET title='Changed English fact' WHERE id=${fact!.id}`;
  const changedStory:any=await localizePublication({publicId,title:'English event'},'zh');assert.equal(changedStory.contentLanguage.status,'original');
  const key='2099-12-30';
  await sql`INSERT INTO reports(kind,key,editorial_language,window_start,window_end,generated_at,content,origin)
    VALUES('daily',${key},'en','2099-12-30','2099-12-31',now(),${sql.json({title:'English daily',lead:{title:'English lead',leadParagraph:'English introduction'},sections:[]})},'manual')`;
  try {
    assert.equal(await currentContent('report',`daily:${key}`,'en'),null);
    const report=await currentContent('report',`daily:${key}`,'zh');assert.ok(report);
    await saveTranslation({...report,translations:Object.fromEntries(report.segments.map(s=>[s.key,`中文 ${s.key}`]))},'offline-agent','fixture',[],true);
    const translated:any=await localizePublication({kind:'daily',key,title:'English lead'},'zh');assert.equal(translated.title,'中文 lead.title');
    await sql`UPDATE reports SET revision=revision+1 WHERE kind='daily' AND key=${key}`;
    const same:any=await localizePublication({kind:'daily',key,title:'English lead'},'zh');assert.equal(same.contentLanguage.status,'translated','a republication with the same text keeps its edition');
    await sql`UPDATE reports SET content=jsonb_set(content,'{lead,title}','"Corrected English lead"') WHERE kind='daily' AND key=${key}`;
    const stale:any=await localizePublication({kind:'daily',key,title:'English lead'},'zh');assert.equal(stale.contentLanguage.status,'original');
  } finally { await sql`DELETE FROM reports WHERE kind='daily' AND key=${key}`; }
});

test('native English headers keep Chinese and unknown original body languages separate',async()=>{
  const multilingualSource=`${sourceId}-multilingual`;
  await sql`INSERT INTO sources(id,name,kind,tier,participation_mode,site_fulltext,next_fetch_at)
    VALUES(${multilingualSource},'Multilingual fixture','rss','T1','editorial',true,'2100-01-01')`;
  for (const language of ['zh',null]) {
    const material=await upsertMaterial({sourceId:multilingualSource,url:`https://example.com/multilingual-${T}-${language}`,title:'源报道标题',language,bodyText:'中文原文内容。',bodyHtml:'<h2>原文小标题</h2><p>中文原文内容。</p>',bodyStatus:'ok',via:'fetch',publishedAt:new Date()});
    const bodyId=material.articleId;
    await sql`INSERT INTO analyses(article_id,input_revision,origin,editorial_language,relevance,category,title,summary,score,selected)
      VALUES(${bodyId},1,'rule','en','pass','ai-products','Direct English editorial title','Written directly from the source.',90,true)`;
    await publishArticle(bodyId,{releasedAt:new Date(Date.now()-60000)});
    const detail=await loadItemDetail(bodyId);assert.ok(detail.kind==='found');
    if(detail.kind!=='found') throw new Error('fixture not found');
    const en:any=await localizePublication(siteItemDetail(detail.detail),'en');
    assert.equal(en.contentLanguage.language,'en');assert.equal(en.bodyContentLanguage.language,language ?? 'unknown');assert.equal(en.bodyContentLanguage.status,'original');
    const source=await currentContent('body',bodyId,'en');assert.ok(source);assert.equal(source.sourceLanguage,language ?? 'unknown');
    await saveTranslation({...source,translations:{'blocks.0.text':'Translated heading','blocks.1.text':'Translated from the original source.'}},'offline-agent','fixture',[],true);
    const translated:any=await localizePublication(siteItemDetail(detail.detail),'en');assert.equal(translated.bodyContentLanguage.status,'translated');assert.equal(translated.bodyContentLanguage.sourceLanguage,language ?? 'unknown');
    const original:any=await localizePublication(siteItemDetail(detail.detail,true),'en',true);assert.match(original.body.zh ?? original.body.original,/中文原文内容/);assert.equal(original.bodyContentLanguage.language,language ?? 'unknown');
  }
});

test('a historical English body translated from a non-Chinese original retains its legacy fingerprint',async()=>{
  const legacySource=`${sourceId}-foreign`;
  await sql`INSERT INTO sources(id,name,kind,tier,participation_mode,site_fulltext,next_fetch_at)
    VALUES(${legacySource},'Foreign fixture','rss','T1','editorial',true,'2100-01-01')`;
  const material=await upsertMaterial({sourceId:legacySource,url:`https://example.com/french-${T}`,title:'Annonce française',language:'fr',bodyText:'Un nouveau modèle.',bodyHtml:'<p>Un nouveau modèle.</p>',bodyStatus:'ok',via:'fetch',publishedAt:new Date()});
  const bodyId=material.articleId;
  await sql`INSERT INTO analyses(article_id,input_revision,origin,relevance,category,title_zh,summary_zh,score,selected)
    VALUES(${bodyId},1,'rule','pass','ai-products','中文编辑标题','中文编辑摘要',90,true)`;
  await publishArticle(bodyId,{releasedAt:new Date(Date.now()-60000)});
  const entry=await currentContent('body',bodyId);assert.ok(entry);assert.equal(entry.sourceLanguage,'fr');
  await sql`INSERT INTO content_translations(kind,content_id,source_hash,source_segments,translations,provenance,model)
    VALUES('body',${bodyId},${legacySourceHash(entry)},${sql.json(entry.segments)},${sql.json({'blocks.0.text':'A new model.'})},'offline-agent','legacy')`;
  const detail=await loadItemDetail(bodyId);assert.ok(detail.kind==='found');
  if(detail.kind!=='found') throw new Error('fixture not found');
  const en:any=await localizePublication(siteItemDetail(detail.detail),'en');assert.match(en.body.original,/A new model/);assert.equal(en.bodyContentLanguage.status,'translated');assert.equal(en.bodyContentLanguage.sourceLanguage,'fr');
});


test('echoed English cannot become a ready Chinese item/report/body edition, including malformed stored rows', async () => {
  const material = await upsertMaterial({ sourceId, url: `https://example.com/echo-guard-${T}`, title: 'A lab publishes a model', language: 'en',
    bodyHtml: '<h2>A model release</h2><p>A lab publishes a new model.</p>', bodyText: 'A lab publishes a new model.', bodyStatus: 'ok', via: 'fetch', publishedAt: new Date() });
  const echoId = material.articleId, reportId = 'daily:2098-11-28';
  try {
    await sql`UPDATE sources SET site_fulltext=true WHERE id=${sourceId}`;
    await sql`INSERT INTO analyses(article_id,input_revision,origin,editorial_language,relevance,category,title,summary,score,selected)
      VALUES(${echoId},1,'rule','en','pass','ai-products','A lab publishes a model','The new model supports public use.',90,true)`;
    await publishArticle(echoId, { releasedAt: new Date(Date.now()-60000) });
    await sql`INSERT INTO reports(kind,key,editorial_language,window_start,window_end,generated_at,content) VALUES('daily','2098-11-28','en',now()-interval '1 day',now(),now(),
      ${sql.json({ title: 'A daily model briefing', lead: { title: 'A lab publishes a model', leadParagraph: 'The new model supports public use.' }, sections: [] })})`;
    for (const [kind, contentId] of [['item', echoId], ['body', echoId], ['report', reportId]] as const) {
      const source = await currentContent(kind, contentId, 'zh'); assert.ok(source);
      const translations = Object.fromEntries(source.segments.map(segment => [segment.key, segment.text]));
      await assert.rejects(saveTranslation({ ...source, translations }, 'offline-agent', 'fixture', [], true), /translation prose must use zh/);
      // Even bypassing import validation cannot turn malformed legacy/external data into ready prose.
      await sql`INSERT INTO content_translations(kind,content_id,lang,source_language,source_hash,source_segments,translations,provenance,model)
        VALUES(${kind},${contentId},'zh',${source.sourceLanguage!},${source.sourceHash},${sql.json(source.segments)},${sql.json(translations)},'offline-agent','fixture')`;
    }
    const [revision] = await sql`SELECT revision FROM articles WHERE id=${echoId}`;
    await sql`INSERT INTO translations(article_id,lang,revision,body_html,body_text,complete,origin)
      VALUES(${echoId},'zh',${revision!.revision},'<p>A lab publishes a new model.</p>','A lab publishes a new model.',true,'source')`;
    const detail = await loadItemDetail(echoId); assert.ok(detail.kind === 'found');
    const chinese = await localizePublication(detail.detail, 'zh');
    assert.equal(chinese.contentLanguage!.language, 'en'); assert.equal(editionReady(chinese,'zh'),false);
    assert.equal(chinese.bodyContentLanguage!.language,'en'); assert.equal(bodyEditionReady(chinese,'zh'),false);
    const report = await loadReport('daily','2098-11-28'); assert.ok(report);
    assert.equal(editionReady(await localizePublication(report,'zh'),'zh'),false);
    assert.equal(targetLanguageProse('OpenAI GPT-5','zh'),true);
    assert.equal(targetLanguageProse('USD 10','zh'),true);
    assert.equal(targetLanguageProse('<code>const model = 1</code> ⟦0⟧','zh'),true);
    assert.equal(targetLanguageProse('发布模型，并引用 “The model is available.”','zh'),true);
    assert.equal(targetLanguageProse('The model is available.','zh'),false);
    // Seen in the 13 October daily: a full Chinese summary naming llama.cpp and a token.
    assert.equal(targetLanguageProse('AWS 介绍了如何在 Amazon SageMaker AI 上使用其 llama.cpp 深度学习容器部署 GGUF 模型，再添加 SemIf 适配器，使其能够针对声明的选项返回概率，而无需生成答案 token。该指南包含 CPU 和 GPU 部署代码。','zh'),true);
    assert.equal(targetLanguageProse('发布了新模型，the weights are available for research use today','zh'),false);
    // Rejected in October: a short title naming a site, a post quoting commands, a lowercase product name.
    assert.equal(targetLanguageProse('我刚发现，现在在 claude dot ai 上，Opus 5.5 只需一个提示词就能用 Blender 制作黏土动画','zh'),true);
    assert.equal(targetLanguageProse('.@Cloudflare 的决策模型现已登陆 Ollama！\n\nClef (27B)：\nollama pull clef\n\nClef Flash (9B)：\nollama pull clef-flash','zh'),true);
    assert.equal(targetLanguageProse('datasette 1.0a41','zh'),true);
    // 2026-11-17: Qwen's post listed "API: qwencloud.com/…"; its faithful translation has no Han.
    assert.equal(targetLanguageProse('API：<a id="L0">qwencloud.com/models/qwen4-max</a>','zh'),true);
    assert.equal(targetLanguageProse('the model is out','zh'),false);
    assert.equal(targetLanguageProse('发布了新模型。','en'),false);
    assert.equal(targetLanguageProse('The source says “发布模型”.','en'),true);
  } finally {
    await sql`DELETE FROM content_translations WHERE content_id IN (${echoId},${reportId})`;
    await sql`DELETE FROM reports WHERE kind='daily' AND key='2098-11-28'`;
    await sql`DELETE FROM articles WHERE id=${echoId}`;
  }
});
