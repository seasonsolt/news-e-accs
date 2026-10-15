import { load } from 'cheerio';
import { shield, unshield } from '../editorial/translate.ts';
import { sanitizeBody } from '../content/sanitize.ts';
import { sql, type Db } from '../db.ts';
import { completeReceipt } from '../providers/receipts.ts';
import { fetchItemsByIds, toItemSummary } from './items.ts';
import { loadItemDetail, withOutline } from './detail.ts';
import { loadStoryProse, loadStoriesProse, resolveStory, loadHotStrip, loadHot } from './stories.ts';
import { loadReport } from './reports.ts';
import { loadPool } from './pool.ts';
import { contentSource, applyTranslations, validateTranslation, editionMatches, targetLanguageProse, type ContentKind, type TranslationEntry } from './content-source.ts';

export function bodySource(id: string, html: string, sourceLanguage = "zh", targetLanguage: "en" | "zh" = "en"): { entry: TranslationEntry; render: (translations: Record<string,string>) => string } {
  const $ = load(html, null, false);
  const blocks = $('p,h2,h3,h4,h5,li,blockquote,figcaption,td,th,dt,dd,caption').toArray()
    .filter(node => !$(node).parents('pre,code').length && !$(node).find('p,h2,h3,h4,h5,li,blockquote,figcaption,td,th,dt,dd,caption,pre').length && $(node).text().trim());
  const protectedBlocks = blocks.map(node => shield($(node).html() ?? ''));
  const entry = contentSource('body', id, { editorialLanguage: sourceLanguage, blocks: protectedBlocks.map(block => ({ text: block.html })) }, targetLanguage);
  return { entry, render: translations => {
    blocks.forEach((node,index) => {
      const translated = translations[`blocks.${index}.text`];
      if (!translated) throw new Error('missing body block');
      const restored = unshield(translated, protectedBlocks[index]!);
      if (restored === null) throw new Error('body translation lost protected links/code/media');
      const clean=load(sanitizeBody(`<p>${restored}</p>`),null,false);
      $(node).html(clean('p').first().html() ?? '');
    });
    return $.html();
  } };
}

type EditionLanguage = 'en' | 'zh';
function canonicalBody(detail: { editorialLanguage?: EditionLanguage; language: string | null; body: { zh: string | null; original: string | null; zhKind: "translation" | "original" | null; complete: boolean } | null }, originalBody = false) {
  const body = detail.body;
  if (!body) return null;
  // Native editorial copy translates directly from the original source, never through Chinese.
  const useOriginal = originalBody || detail.language === 'en' || detail.editorialLanguage === 'en' || !body.zh;
  const html = useOriginal ? body.original ?? body.zh : body.zh ?? body.original;
  const original = (useOriginal && !!body.original) || body.zhKind === 'original';
  const language = original ? detail.language ?? 'unknown' : 'zh';
  if (!original && html && !targetLanguageProse(html, 'zh')) {
    return body.original ? { html: body.original, language: detail.language ?? 'unknown', complete: true }
      : { html, language: 'unknown', complete: false };
  }
  const complete = original || body.complete;
  return html ? { html, language, complete } : null;
}
export async function currentContent(kind: ContentKind, id: string, targetLanguage: EditionLanguage = 'en'): Promise<TranslationEntry | null> {
  if (kind === 'item' || kind === 'body') {
    const row = (await fetchItemsByIds([id])).get(id);
    if (!row || row.visibility !== 'public' || row.source_mode !== 'editorial' || (row.selected && (!row.visible_after || row.visible_after > new Date()))) return null;
    if (kind === 'item') {
      if ((row.header_source_language ?? row.editorial_language ?? 'zh') === targetLanguage) return null;
      return contentSource(kind, id, toItemSummary(row), targetLanguage);
    }
    const detail = await loadItemDetail(id);
    if (detail.kind !== 'found') return null;
    const body = canonicalBody(detail.detail);
    return body && body.language !== targetLanguage ? bodySource(id, body.html, body.language, targetLanguage).entry : null;
  }
  if (kind === 'story') {
    const found = await resolveStory(id);
    if (found.kind !== 'found') return null;
    const dto = await loadStoryProse(found.storyId);
    return dto && contentSource(kind,id,dto,targetLanguage).sourceLanguage !== targetLanguage ? contentSource(kind,id,dto,targetLanguage) : null;
  }
  const [reportKind,key] = id.split(':');
  if (!['daily','weekly','monthly'].includes(reportKind!)) return null;
  const dto = await loadReport(reportKind as 'daily'|'weekly'|'monthly', key!);
  return dto && contentSource(kind,id,dto,targetLanguage).sourceLanguage !== targetLanguage ? contentSource(kind,id,dto,targetLanguage) : null;
}

export async function saveTranslation(entry: TranslationEntry, provenance: 'provider'|'offline-agent'|'original', model: string, receiptIds: number[] = [], write = false, db: Db = sql): Promise<void> {
  if (write && db === sql) return sql.begin(tx => saveTranslation(entry,provenance,model,receiptIds,true,tx));
  if (write) {
    if (entry.kind === 'item' || entry.kind === 'body') await db`SELECT article_id FROM publications WHERE article_id=${entry.id} FOR SHARE`;
    else if (entry.kind === 'story') {
      await db`SELECT id FROM stories WHERE public_id::text=${entry.id} FOR SHARE`;
      await db`SELECT f.id FROM facts f JOIN stories st ON st.id=f.story_id WHERE st.public_id::text=${entry.id} FOR SHARE OF f`;
    } else {
      const [kind,key]=entry.id.split(':');
      await db`SELECT id FROM reports WHERE kind=${kind!} AND key=${key!} FOR SHARE`;
    }
  }
  const current = await currentContent(entry.kind,entry.id,entry.targetLanguage ?? "en");
  if (!current) throw new Error(`not currently public: ${entry.kind}:${entry.id}`);
  const translations = validateTranslation(entry,current);
  if (provenance === 'offline-agent' && receiptIds.length) throw new Error('offline imports cannot have provider receipts');
  if (entry.kind === 'body') {
    const detail = await loadItemDetail(entry.id);
    if (detail.kind !== 'found' || !detail.detail.body) throw new Error('body no longer public');
    const body = canonicalBody(detail.detail);
    if (!body) throw new Error('body no longer public');
    bodySource(entry.id, body.html, body.language, entry.targetLanguage ?? 'en').render(translations);
  }
  if (!write) return;
  await db`INSERT INTO content_translations (kind,content_id,lang,source_language,source_hash,source_segments,translations,provenance,model,receipt_ids)
    VALUES (${entry.kind},${entry.id},${entry.targetLanguage ?? 'en'},${entry.sourceLanguage ?? 'zh'},${entry.sourceHash},${db.json(entry.segments)},${db.json(translations)},${provenance},${model},${receiptIds})
    ON CONFLICT (kind,content_id,lang) DO UPDATE SET source_language=excluded.source_language,source_hash=excluded.source_hash,source_segments=excluded.source_segments,
    translations=excluded.translations,provenance=excluded.provenance,model=excluded.model,receipt_ids=excluded.receipt_ids,translated_at=now()`;
  // Business data and receipt completion commit together; a stale source or rolled-back edition
  // leaves the received answer reusable. Offline imports never create or complete receipts.
  if (provenance === 'provider') for (const id of new Set(receiptIds)) await completeReceipt(db, id);
}

export async function exportContentBatch(cursor = '', limit = 50, targetLanguage: EditionLanguage = 'en') {
  const rows = await sql<{ kind: ContentKind; id: string; cursor: string }[]>`
    SELECT * FROM (
      SELECT 'item'::text AS kind, article_id AS id, 'item:' || article_id AS cursor FROM publications p JOIN sources s ON s.id=p.source_id
      WHERE visibility='public' AND s.participation_mode='editorial' AND (NOT selected OR visible_after <= now())
      UNION ALL SELECT 'body', article_id, 'body:' || article_id FROM publications p JOIN sources s ON s.id=p.source_id WHERE visibility='public' AND s.participation_mode='editorial'
        AND body_mode='full' AND (NOT selected OR visible_after <= now())
      UNION ALL SELECT 'story', public_id::text, 'story:' || public_id::text FROM stories st WHERE merged_into IS NULL
        AND EXISTS (SELECT 1 FROM facts f JOIN fact_articles fa ON fa.fact_id=f.id JOIN publications p ON p.article_id=fa.article_id JOIN sources s ON s.id=p.source_id WHERE f.story_id=st.id AND p.visibility='public' AND s.participation_mode='editorial' AND (NOT p.selected OR p.visible_after <= now()))
      UNION ALL SELECT 'report', kind || ':' || key, 'report:' || kind || ':' || key FROM reports
    ) candidates WHERE cursor COLLATE "C" > ${cursor} COLLATE "C" ORDER BY cursor COLLATE "C" LIMIT ${Math.min(1000,Math.max(1,limit))}`;
  const entries: TranslationEntry[] = [];
  let alreadyComplete = 0;
  for (const row of rows) {
    const entry = await currentContent(row.kind,row.id,targetLanguage);
    if (!entry?.segments.length) continue;
    const [ready] = await sql<{source_hash:string;source_language:string;source_segments:TranslationEntry['segments'];translations:Record<string,string>}[]>`SELECT source_hash,source_language,source_segments,translations FROM content_translations WHERE kind=${entry.kind} AND content_id=${entry.id} AND lang=${targetLanguage}`;
    if (ready && editionMatches(entry,ready)) alreadyComplete++; else entries.push(entry);
  }
  return { schemaVersion:1 as const, targetLanguage, entries, nextCursor:rows.at(-1)?.cursor ?? null, scanned:rows.length, alreadyComplete };
}

/** Current visible headlines get a small priority lane; eligibility and fingerprints are still
 * checked through the same canonical public projection as the historical sweep. */
export async function priorityContentEntries(targetLanguage: EditionLanguage = 'en') {
  const [hot, ranking, pool, [daily]] = await Promise.all([
    loadHotStrip(), loadHot(), loadPool({ channel: 'all', category: null, tag: null, page: 1 }),
    sql<{ key: string }[]>`SELECT key FROM reports WHERE kind='daily' ORDER BY key DESC LIMIT 1`,
  ]);
  const refs = new Map<string, { kind: ContentKind; id: string }>();
  const add = (kind: ContentKind, id: string | null | undefined) => {
    if (id) refs.set(`${kind}:${id}`, { kind, id });
  };
  // The newest daily is mailed and exported in both languages that morning; the historical sweep
  // reaches reports only after every item, so a backlog would hold it back for hours.
  if (daily) add('report', `daily:${daily.key}`);
  for (const headline of hot ?? []) {
    add('story', headline.storyPublicId); add('item', headline.itemId);
  }
  // The strip shows five; /hot shows the whole ranking, whose titles readers see too.
  for (const entry of ranking.entries) add('story', entry.story.publicId);
  for (const item of pool.items) add('item', item.id);
  const entries: TranslationEntry[] = [];
  for (const ref of refs.values()) {
    const entry = await currentContent(ref.kind, ref.id,targetLanguage);
    if (!entry?.segments.length) continue;
    const [ready] = await sql<{source_hash:string;source_language:string;source_segments:TranslationEntry['segments'];translations:Record<string,string>}[]>`SELECT source_hash,source_language,source_segments,translations FROM content_translations WHERE kind=${entry.kind} AND content_id=${entry.id} AND lang=${targetLanguage}`;
    if (!ready || !editionMatches(entry,ready)) entries.push(entry);
  }
  return entries;
}

// Readers only read stored editions after canonical visibility and licence projection.
export async function localizePublication<T>(input: T, lang: string, originalBody = false): Promise<T> {
  if (lang !== 'en' && lang !== 'zh') return input;
  const targetLanguage = lang;
  const records = new Map<string,{kind: ContentKind; id:string; dto:any}>();
  const identify = (o:any): {kind:ContentKind;id:string}|null => {
    if (o?.story?.publicId && 'rank' in o && 'summary' in o) return {kind:'story',id:o.story.publicId};
    if (o && typeof o === 'object' && typeof o.title === 'string') {
      // Followups and a group's report list name a report by id, title and timelineAt only.
      if (typeof o.id === 'string' && ('summary' in o || 'originalTitle' in o || 'timelineAt' in o)) return {kind:'item',id:o.id};
      if (typeof o.publicId === 'string') return {kind:'story',id:o.publicId};
      if (typeof o.storyPublicId === 'string') return {kind:'story',id:o.storyPublicId};
      if (typeof o.itemId === 'string' && 'rank' in o && 'participants' in o) return {kind:'item',id:o.itemId};
      if (typeof o.key === 'string' && ['daily','weekly','monthly'].includes(o.kind)) return {kind:'report',id:`${o.kind}:${o.key}`};
    }
    return null;
  };
  const collect = (o:any) => {
    if (!o || typeof o !== 'object' || o.available === false) return;
    const ref=identify(o); if(ref) records.set(`${ref.kind}:${ref.id}`,{...ref,dto:null});
    if (ref?.kind === 'report') return;
    for(const child of Object.values(o)) collect(child);
  };
  collect(input);
  const items = await fetchItemsByIds([...records.values()].filter(r=>r.kind==='item').map(r=>r.id));
  const ids=[...new Set([...records.values()].map(r=>r.id))];
  type Edition = { kind:ContentKind; content_id:string; source_hash:string; source_language:string; source_segments:TranslationEntry['segments']; translations:Record<string,string> };
  const editions=ids.length ? await sql<Edition[]>`SELECT kind,content_id,source_hash,source_language,source_segments,translations FROM content_translations WHERE content_id=ANY(${ids}::text[]) AND lang=${targetLanguage}` : [];
  const stored=new Map(editions.map(r=>[`${r.kind}:${r.content_id}`,r]));
  // A page names many stories (the hot list, a timeline): resolve them together and read their prose in one batch.
  const storyRecords=[...records.values()].filter(r=>r.kind==='story');
  const found=new Map((await Promise.all(storyRecords.map(async r=>[r.id,await resolveStory(r.id)] as const))).flatMap(([id,f])=>f.kind==='found'?[[id,f.storyId] as const]:[]));
  const prose=await loadStoriesProse([...new Set(found.values())]);
  for(const record of records.values()) {
    if(record.kind==='item') {
      const row=items.get(record.id);
      if(row?.visibility==='public' && row.source_mode==='editorial' && (!row.selected || (!!row.visible_after && row.visible_after<=new Date()))) record.dto=toItemSummary(row);
    } else if(record.kind==='story') {
      const storyId=found.get(record.id);
      if(storyId!==undefined) record.dto=prose.get(storyId) ?? null;
    } else {
      const [kind,key]=record.id.split(':');
      record.dto=await loadReport(kind as 'daily'|'weekly'|'monthly',key!);
    }
  }
  const visit=async(o:any):Promise<any>=>{
    if(!o || typeof o!=='object' || o.available===false) return o;
    let out:any=Array.isArray(o)?[]:{...o};
    const ref=identify(o);
    if (ref?.kind === 'report') out=structuredClone(o);
    else for(const [key,child] of Object.entries(o)) out[key]=await visit(child);
    if(ref){
      const dto=records.get(`${ref.kind}:${ref.id}`)?.dto;
      if (!dto) return out;
      const source=contentSource(ref.kind,ref.id,dto,targetLanguage);
      const ready=stored.get(`${ref.kind}:${ref.id}`);
      const native=source.sourceLanguage===targetLanguage;
      const hotStory=ref.kind==='story' && o.story?.publicId && 'rank' in o && 'summary' in o;
      const projectionMatches=hotStory
        ? o.story.title===dto.title && o.summary===(dto.digest ?? dto.summary) && o.latest===dto.latest
        : ref.kind==='report' && !o.sections
        ? source.segments.some(segment=>segment.text===o.title)
        : contentSource(ref.kind,ref.id,o,targetLanguage).segments.every(segment=>source.segments.some(current=>current.key===segment.key && current.text===segment.text));
      const matches=!native && projectionMatches && !!ready && editionMatches(source,ready,dto.revision ?? null);
      if(matches) {
        out=applyTranslations(out,source,ready!.translations);
        if (hotStory && o.summary) out.summary=ready!.translations[dto.digest?'digest':'summary'] ?? out.summary;
        if(ref.kind==='report' && !o.sections){
          const title=source.segments.find(s=>s.key==='lead.title'&&s.text===o.title);
          if(title) out.title=ready!.translations[title.key];
        }
      }
      out.editorialLanguage=dto.editorialLanguage ?? 'zh';
      out.contentLanguage={requested:targetLanguage,status:matches?'translated':'original',sourceLanguage:source.sourceLanguage,language:matches?targetLanguage:projectionMatches?source.sourceLanguage:o.editorialLanguage ?? 'unknown'};
      if (ref.kind === 'report') {
        // Citations are edited report snapshots, not current story/item projections.
        for (const citation of [...(out.sections ?? []).flatMap((section:any) => section.items ?? []), ...(out.stories ?? []), ...(out.highlights ?? []), ...(out.flashes ?? [])]) {
          if (citation.available !== false) citation.contentLanguage={...out.contentLanguage};
        }
      }
      if(ref.kind==='item' && out.x?.quoted && targetLanguage==='en') out.x.quoted.translation=null;
      if(ref.kind==='item' && o.body){
        const detail=await loadItemDetail(ref.id);
        if(detail.kind!=='found' || !detail.detail.body) { out.body=null; out.outline=[]; return out; }
        const body=canonicalBody(detail.detail,originalBody);
        if(body){
          let html=body.html, language=body.language, translated=false;
          if (!originalBody && body.language!==targetLanguage) {
            const sourceBody=bodySource(ref.id,body.html,body.language,targetLanguage);
            const edition=stored.get(`body:${ref.id}`);
            if(edition && editionMatches(sourceBody.entry,edition)) {
              try { html=sourceBody.render(edition.translations); language=targetLanguage; translated=true; } catch { /* Invalid body markup falls back to the licensed source. */ }
            } else if (targetLanguage==='zh' && detail.detail.body.zh && detail.detail.body.complete && targetLanguageProse(detail.detail.body.zh, 'zh')) {
              html=detail.detail.body.zh; language='zh'; translated=detail.detail.body.zhKind==='translation';
            }
          }
          const rendered=withOutline(html);
          out.body={...detail.detail.body,zh:language==='zh'?rendered.html:null,original:language==='zh'?null:rendered.html,
              zhKind:language==='zh'?(translated?'translation':'original'):null,complete:language===body.language || translated?body.complete:detail.detail.body.complete};
          out.bodyLanguage=language==='zh'?'zh':'original'; out.outline=rendered.outline;
          out.hasTranslation=translated || !!(detail.detail.body.zh && detail.detail.body.original);
          out.bodyContentLanguage={requested:targetLanguage,status:translated?'translated':language==='en'?'original-english':'original',sourceLanguage:body.language,language};
        }
      }
    }
    return out;
  };
  return visit(input);
}
