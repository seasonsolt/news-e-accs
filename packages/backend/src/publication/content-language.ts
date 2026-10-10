import { load } from 'cheerio';
import { shield, unshield } from '../editorial/translate.ts';
import { sanitizeBody } from '../content/sanitize.ts';
import { sql, type Db } from '../db.ts';
import { completeReceipt } from '../providers/receipts.ts';
import { fetchItemsByIds, toItemSummary } from './items.ts';
import { loadItemDetail, withOutline } from './detail.ts';
import { loadStoryDetail, resolveStory, loadHotStrip } from './stories.ts';
import { loadReport } from './reports.ts';
import { loadPool } from './pool.ts';
import { contentSource, applyTranslations, validateTranslation, type ContentKind, type TranslationEntry } from './content-source.ts';

export function bodySource(id: string, html: string): { entry: TranslationEntry; render: (translations: Record<string,string>) => string } {
  const $ = load(html, null, false);
  const blocks = $('p,h2,h3,h4,h5,li,blockquote,figcaption,td,th,dt,dd,caption').toArray()
    .filter(node => !$(node).parents('pre,code').length && !$(node).find('p,h2,h3,h4,h5,li,blockquote,figcaption,td,th,dt,dd,caption,pre').length && $(node).text().trim());
  const protectedBlocks = blocks.map(node => shield($(node).html() ?? ''));
  const entry = contentSource('body', id, { blocks: protectedBlocks.map(block => ({ text: block.html })) });
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

export async function currentContent(kind: ContentKind, id: string): Promise<TranslationEntry | null> {
  if (kind === 'item' || kind === 'body') {
    const row = (await fetchItemsByIds([id])).get(id);
    if (!row || row.visibility !== 'public' || row.source_mode !== 'editorial' || (row.selected && (!row.visible_after || row.visible_after > new Date()))) return null;
    if (kind === 'item') return contentSource(kind, id, toItemSummary(row));
    if (row.language === 'en') return null;
    const detail = await loadItemDetail(id);
    if (detail.kind !== 'found' || !detail.detail.body) return null;
    const html = detail.detail.body.zh ?? detail.detail.body.original;
    return html ? bodySource(id, html).entry : null;
  }
  if (kind === 'story') {
    const found = await resolveStory(id);
    if (found.kind !== 'found') return null;
    const dto = await loadStoryDetail(found.storyId);
    return dto ? contentSource(kind,id,dto) : null;
  }
  const [reportKind,key] = id.split(':');
  if (!['daily','weekly','monthly'].includes(reportKind!)) return null;
  const dto = await loadReport(reportKind as 'daily'|'weekly'|'monthly', key!);
  return dto ? contentSource(kind,id,dto) : null;
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
  const current = await currentContent(entry.kind,entry.id);
  if (!current) throw new Error(`not currently public: ${entry.kind}:${entry.id}`);
  const translations = validateTranslation(entry,current);
  if (provenance === 'offline-agent' && receiptIds.length) throw new Error('offline imports cannot have provider receipts');
  if (entry.kind === 'body') {
    const detail = await loadItemDetail(entry.id);
    if (detail.kind !== 'found' || !detail.detail.body) throw new Error('body no longer public');
    bodySource(entry.id, detail.detail.body.zh ?? detail.detail.body.original ?? '').render(translations);
  }
  if (!write) return;
  await db`INSERT INTO content_translations (kind,content_id,source_hash,source_segments,translations,provenance,model,receipt_ids)
    VALUES (${entry.kind},${entry.id},${entry.sourceHash},${db.json(entry.segments)},${db.json(translations)},${provenance},${model},${receiptIds})
    ON CONFLICT (kind,content_id,lang) DO UPDATE SET source_hash=excluded.source_hash,source_segments=excluded.source_segments,
    translations=excluded.translations,provenance=excluded.provenance,model=excluded.model,receipt_ids=excluded.receipt_ids,translated_at=now()`;
  // Business data and receipt completion commit together; a stale source or rolled-back edition
  // leaves the received answer reusable. Offline imports never create or complete receipts.
  if (provenance === 'provider') for (const id of new Set(receiptIds)) await completeReceipt(db, id);
}

export async function exportContentBatch(cursor = '', limit = 50) {
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
    const entry = await currentContent(row.kind,row.id);
    if (!entry?.segments.length) continue;
    const [ready] = await sql`SELECT 1 FROM content_translations WHERE kind=${entry.kind} AND content_id=${entry.id} AND source_hash=${entry.sourceHash}`;
    if (ready) alreadyComplete++; else entries.push(entry);
  }
  return { schemaVersion:1 as const, targetLanguage:'en' as const, entries, nextCursor:rows.at(-1)?.cursor ?? null, scanned:rows.length, alreadyComplete };
}

/** Current visible headlines get a small priority lane; eligibility and fingerprints are still
 * checked through the same canonical public projection as the historical sweep. */
export async function priorityContentEntries() {
  const [hot, pool] = await Promise.all([
    loadHotStrip(), loadPool({ channel: 'all', category: null, tag: null, page: 1 }),
  ]);
  const refs = new Map<string, { kind: ContentKind; id: string }>();
  const add = (kind: ContentKind, id: string | null | undefined) => {
    if (id) refs.set(`${kind}:${id}`, { kind, id });
  };
  for (const headline of hot ?? []) {
    add('story', headline.storyPublicId); add('item', headline.itemId);
  }
  for (const item of pool.items) add('item', item.id);
  const entries: TranslationEntry[] = [];
  for (const ref of refs.values()) {
    const entry = await currentContent(ref.kind, ref.id);
    if (!entry?.segments.length) continue;
    const [ready] = await sql`SELECT 1 FROM content_translations WHERE kind=${entry.kind} AND content_id=${entry.id} AND source_hash=${entry.sourceHash}`;
    if (!ready) entries.push(entry);
  }
  return entries;
}

// Readers only read stored editions. Source text must still match, including editorial overrides.
export async function localizePublication<T>(input: T, lang: string, originalBody = false): Promise<T> {
  if (lang !== 'en') return input;
  const records = new Map<string,{kind: ContentKind; id:string; current:TranslationEntry|null}>();
  const identify = (o:any): {kind:ContentKind;id:string}|null => {
    if (o && typeof o === 'object' && typeof o.title === 'string') {
      if (typeof o.id === 'string' && ('summary' in o || 'originalTitle' in o)) return {kind:'item',id:o.id};
      if (typeof o.publicId === 'string') return {kind:'story',id:o.publicId};
      if (typeof o.storyPublicId === 'string') return {kind:'story',id:o.storyPublicId};
      if (typeof o.itemId === 'string' && 'rank' in o && 'participants' in o) return {kind:'item',id:o.itemId};
      if (typeof o.key === 'string' && ['daily','weekly','monthly'].includes(o.kind)) return {kind:'report',id:`${o.kind}:${o.key}`};
    }
    return null;
  };
  const collect = (o:any) => {
    if (!o || typeof o !== 'object' || o.available === false) return;
    const ref=identify(o); if(ref) records.set(`${ref.kind}:${ref.id}`,{...ref,current:null});
    for(const child of Object.values(o)) collect(child);
  };
  collect(input);
  const itemIds = [...records.values()].filter(r=>r.kind==='item').map(r=>r.id);
  const items = await fetchItemsByIds(itemIds);
  const ids=[...new Set([...records.values()].map(r=>r.id))];
  const translations=ids.length ? await sql<{kind:ContentKind;content_id:string;source_hash:string;source_segments:TranslationEntry['segments'];translations:Record<string,string>}[]>`SELECT kind,content_id,source_hash,source_segments,translations FROM content_translations WHERE content_id=ANY(${ids}::text[]) AND lang='en'` : [];
  const stored=new Map(translations.map(r=>[`${r.kind}:${r.content_id}`,r]));
  const storyIds=[...records.values()].filter(r=>r.kind==='story').map(r=>r.id);
  const stories=storyIds.length ? await sql<{public_id:string;title:string;summary:string|null;digest:string|null;latest:string|null}[]>`
    SELECT public_id::text,title,summary,digest,latest FROM stories st WHERE public_id::text=ANY(${storyIds}::text[]) AND merged_into IS NULL
      AND EXISTS(SELECT 1 FROM facts f JOIN fact_articles fa ON fa.fact_id=f.id JOIN publications p ON p.article_id=fa.article_id JOIN sources s ON s.id=p.source_id WHERE f.story_id=st.id AND p.visibility='public' AND s.participation_mode='editorial' AND (NOT p.selected OR p.visible_after <= now()))` : [];
  const storyRows=new Map(stories.map(r=>[r.public_id,r]));
  for(const record of records.values()) {
    if(record.kind==='item') {
      const row=items.get(record.id);
      if(row?.visibility==='public' && row.source_mode==='editorial' && (!row.selected || (!!row.visible_after && row.visible_after<=new Date()))) record.current=contentSource('item',record.id,toItemSummary(row));
    } else if(record.kind==='story') {
      const row=storyRows.get(record.id);const edition=stored.get(`story:${record.id}`);
      if(row&&edition){
        const core=contentSource('story',record.id,row).segments;
        const previous=edition.source_segments.filter(s=>['title','summary','digest','latest'].includes(s.key));
        if(JSON.stringify(core)===JSON.stringify(previous)) record.current={kind:'story',id:record.id,sourceHash:edition.source_hash,segments:edition.source_segments};
      }
    } else record.current=await currentContent(record.kind,record.id);
  }
  const visit=async(o:any):Promise<any>=>{
    if(!o || typeof o!=='object' || o.available===false) return o;
    let out=Array.isArray(o)?[]:{...o};
    for(const [key,child] of Object.entries(o)) out[key]=await visit(child);
    const ref=identify(o);
    if(ref){
      const record=records.get(`${ref.kind}:${ref.id}`); const source=record?.current; const ready=stored.get(`${ref.kind}:${ref.id}`);
      const matches=!!source && ready?.source_hash===source.sourceHash && (ref.kind!=='story' || !('developments' in o) || contentSource('story',ref.id,o).sourceHash===source.sourceHash);
      if(matches) {
        out=applyTranslations(out,source!,ready!.translations);
        if(ref.kind==='report' && !o.sections){
          const title=source!.segments.find(s=>s.key==='lead.title'&&s.text===o.title);
          if(title && ready!.translations[title.key]) out.title=ready!.translations[title.key];
        }
      }
      if(ref.kind==='item' && out.x?.quoted) out.x.quoted.translation=null;
      out.contentLanguage={requested:'en',status:matches?'translated':'original',sourceLanguage:'original'};
      if(ref.kind==='item' && o.body && !originalBody){
        if(o.language==='en' && o.body.original){
          out.body={...o.body,zh:null,original:o.body.original};out.bodyLanguage='original';
          out.bodyContentLanguage={status:'original-english'};out.outline=withOutline(o.body.original).outline;
        } else {
          const html=o.body.zh??o.body.original;
          if(html){
            const body=bodySource(ref.id,html);
            const [edition]=await sql<{source_hash:string;translations:Record<string,string>}[]>`SELECT source_hash,translations FROM content_translations WHERE kind='body' AND content_id=${ref.id} AND lang='en'`;
            if(edition?.source_hash===body.entry.sourceHash){
              const rendered=withOutline(body.render(edition.translations));
              out.body={...o.body,zh:null,original:rendered.html};out.bodyLanguage='original';
              out.bodyContentLanguage={status:'translated'};out.outline=rendered.outline;out.hasTranslation=true;
            } else out.bodyContentLanguage={status:'original'};
          }
        }
      }
    }
    return out;
  };
  return visit(input);
}
