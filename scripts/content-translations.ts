// Offline exports/imports never call a model. Writes require --apply; default is validation only.
import { readFile, writeFile } from 'node:fs/promises';
import { sql } from '@aihot/backend/db';
import { exportContentBatch, saveTranslation } from '@aihot/backend/publication/content-language';
import { translationBatchSchema } from '@aihot/backend/publication/content-source';
const args=process.argv.slice(2);
const value=(flag:string)=>args[args.indexOf(flag)+1];
const apply=args.includes('--apply');
try {
  if(args.includes('--import')) {
    const batch=translationBatchSchema.parse(JSON.parse(await readFile(value('--import')!,'utf8')));
    // Validate the entire batch before any mutation. Every entry is rechecked on write too.
    for(const entry of batch.entries) await saveTranslation(entry,'offline-agent','gpt-6-luna',[],false);
    if(apply) await sql.begin(async tx => {
      for(const entry of batch.entries) await saveTranslation(entry,'offline-agent','gpt-6-luna',[],true,tx);
    });
    console.log(JSON.stringify({mode:apply?'imported':'dry-run',validated:batch.entries.length}));
  } else {
    if(!args.includes('--all')) throw new Error('Export scope must be explicit: --all. No model calls are made.');
    const limit=Number(args.includes('--limit')?value('--limit'):50);
    if(!Number.isInteger(limit)||limit<1||limit>1000) throw new Error('--limit must be 1..1000');
    const saved=args.includes('--resume')?JSON.parse(await readFile(value('--resume')!,'utf8')):null;
    const cursor=args.includes('--cursor')?value('--cursor')!:saved?.nextCursor??'';
    if(typeof cursor !== 'string') throw new Error('invalid resume cursor');
    const targetLanguage=args.includes('--lang')?value('--lang'):saved?.targetLanguage??'en';
    if(targetLanguage!=='en'&&targetLanguage!=='zh') throw new Error('--lang must be en or zh');
    if(saved?.targetLanguage&&saved.targetLanguage!==targetLanguage) throw new Error('resume target language mismatch');
    const batch=await exportContentBatch(cursor,limit,targetLanguage);
    const {nextCursor,scanned,alreadyComplete,...payload}=batch;
    if(args.includes('--output')) await writeFile(value('--output')!,JSON.stringify(payload,null,2)+'\n');
    console.log(JSON.stringify({mode:'dry-run-export',scanned,alreadyComplete,pending:payload.entries.length,nextCursor}));
    if(args.includes('--checkpoint')) await writeFile(value('--checkpoint')!,JSON.stringify({nextCursor,scanned,alreadyComplete,targetLanguage})+'\n');
  }
} finally {await sql.end();}
