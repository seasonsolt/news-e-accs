// Failure modes, fixed before changing public loaders or prefetch:
// - returning to a page that was already open still needs the network;
// - query variants mix content/SEO, or restores lose their anchor;
// - intent downloads page data before a visit, scroll-through touches preload resources, or failed resources break the current page;
// - visits renew deadlines, expired/errors stay cached, or refresh stops working;
// - Agent tabs choose an invalid panel or leave canonical/history behind;
// - phone search fails to open /all, focus its field, submit a query, or retry a failed read;
// Reader work failures fixed before changing enhancement and return-position code:
// - offscreen code downloads/runs immediately, visible code stays plain, or raw copying changes;
// - tiny/linked pictures become zoom buttons, or language changes keep old handlers;
// - a deep return loses its anchor, or folded dates confuse the anchor search.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { before, after, test } from "node:test";
import { chromium, webkit, expect, type Browser, type BrowserContextOptions, type Locator } from "@playwright/test";
import type { FeedItemSummary, SiteItemDetail, ReportDetail } from "@aihot/contracts/site";
import { startWebServer, type WebServer } from "./web-server.ts";
import { KEYS } from "../app/lib/local-state.ts";

const at = '2026-10-04T08:00:00.000Z';
const item: FeedItemSummary = {id:'navigation-fixture',title:'性能检查文章',summary:'固定摘要',reason:'固定推荐理由',source:{name:'Fixture'},publishedAt:at,timelineAt:at,category:'ai-models',tags:[],score:80,selected:true,channel:'news',x:null};
const detail: SiteItemDetail = {...item,x:null,originalTitle:'Fixture article',links:{original:'https://example.org/article'},discoveredAt:at,story:null,readingMode:'full',author:null,body:{zh:'<p>固定正文</p>',original:null,zhKind:'translation',complete:true},outline:[],relatedStories:[],topics:[],indexable:true,markdownAvailable:true,group:null,hasTranslation:true,bodyLanguage:'zh',language:'zh'};
const codeSource='import json\n\nwith open("data.json") as file:\n    data = json.load(file)\n\nfor record in data:\n    print(record["title"])\n';
const readerBody=(english=false)=>Array.from({length:30},(_,i)=>english?`<p>Reading paragraph ${i}: read the article before the code and pictures. Text remains readable; pictures and code are enhanced when needed.</p>`:`<p>阅读段落 ${i}：先阅读文章，再查看后面的代码和图片。正文保持可读，图片和代码在需要时增强。</p>`).join('')
  +`<pre><code>${codeSource}</code></pre><pre><code>x = 1</code></pre>`
  +Array.from({length:12},(_,i)=>`<img src="/reader-image/${i}.svg" alt="正文配图 ${i}" width="640" height="360" loading="lazy">`).join('')
  +'<img src="/reader-image/tiny.svg" alt="小图标" width="16" height="16" loading="lazy"><a href="https://example.org"><img src="/reader-image/linked.svg" alt="链接图片" width="640" height="360" loading="lazy"></a>';
const report = (kind:'daily'|'weekly'|'monthly'): ReportDetail => ({kind,key:kind==='daily'?'2026-10-04':kind==='weekly'?'2026-W40':'2026-10',issueNumber:1,title:'Fixture '+kind,windowStart:at,windowEnd:at,generatedAt:at,lead:{title:'Fixture '+kind,leadParagraph:'Fixture report'},leadItemId:null,overview:null,highlights:[],sections:[],flashes:[],cover:null,metrics:{},readingMinutes:1,prev:null,next:null});
const hits: string[] = [];
async function readerContext(browser:Browser,options:BrowserContextOptions={}) {
  const context=await browser.newContext(options);
  // Use the site's persisted skip choice before its first paint.
  await context.addInitScript(({key})=>localStorage.setItem(key,'1'),{key:KEYS.onboarded});
  return context;
}
// Touch and hover handlers exist only once React has hydrated the link; a slow runner may still be hydrating after load.
const hydrated=(link:Locator)=>expect.poll(()=>link.evaluate(el=>Object.keys(el).some(key=>key.startsWith('__reactProps$')))).toBe(true);
// Tall enough that the first card is on screen without scrolling. The router finishes its first load by
// scrolling back to where that load started, which on a slow runner can pull the page out from under a
// pointer that Playwright scrolled down to hover.
const desk={viewport:{width:1280,height:1200}};
let failing='';
let ttl=60;
let web:WebServer;
let origin:string;
let chrome:Browser;
let safari:Browser;
const api=createServer((req,res)=>{
  const url=new URL(req.url!,'http://local');
  const p=url.pathname;
  res.setHeader('Content-Type','application/json');
  if(p==='/api/site/meta') return res.end(JSON.stringify({changelogVersion:'fixture'}));
  if(p==='/api/site/track'){res.statusCode=204;return res.end();}
  hits.push(req.url!);
  if(p===failing){res.statusCode=503;return res.end(JSON.stringify({code:'unavailable'}));}
  if(p==='/api/health')return res.end('{}');
  if(p==='/api/site/topics')return res.end(JSON.stringify({groups:[],topics:[{slug:'openai',name:'OpenAI',group:'company',definition:'Fixture',brand:null,total:0,recent:0,indexable:false,latest:null}]}));
  if(p==='/api/site/hot')return res.end(JSON.stringify({computedAt:at,windowHours:48,entries:[{rank:1,story:{publicId:'fixture',title:'Fixture trending story'},heat:10,trend:'flat',trendPct:0,badges:[],participantCount:0,sourceCount:0,sourceNames:[],participants:[],spark:[],summary:null,latest:null,cover:null}]}));
  if(p==='/api/site/timeline'){
    res.setHeader('X-Accel-Expires','@'+(Math.floor(Date.now()/1000)+ttl));
    const category=url.searchParams.get('category');
    const shown={...item,title:category?'分类 '+category:'性能检查文章'};
    if(url.searchParams.get('tag')==='long-reading'){
      const cards=Array.from({length:180},(_,i)=>({key:'long-'+i,anchorAt:i<60?at:'2026-10-03T08:00:00.000Z',item:{...item,id:'long-'+i,title:'长列表文章 '+i,summary:'用于核实深处阅读返回的固定摘要。'.repeat(3)},group:null}));
      return res.end(JSON.stringify({filters:{channel:'all',category:null,tag:'long-reading'},cards,nextCursor:null,hot:null,dayCounts:{'2026-10-04':60,'2026-10-03':120}}));
    }
    return res.end(JSON.stringify({filters:{channel:'all',category,tag:null},cards:[{key:shown.id,anchorAt:at,item:shown,group:null}],nextCursor:null,hot:null,dayCounts:{'2026-10-04':1}}));
  }
  if(p==='/api/site/pool'){
    const page=Number(url.searchParams.get('page')||1);
    const q=url.searchParams.get('q');
    return res.end(JSON.stringify({filters:{channel:'all',category:null,tag:null,q,tab:'time'},items:[{...item,title:q?'Search result '+q:'全部第 '+page+' 页'}],page,pageCount:3,total:3,todayCount:1,freshness:at}));
  }
  if(p==='/api/site/items/navigation-fixture')return res.end(JSON.stringify(detail));
  if(p==='/api/site/items/navigation-fixture/original')return res.end(JSON.stringify({...detail,body:{zh:null,original:'<p>Original fixture</p>',zhKind:null,complete:true},bodyLanguage:'original'}));
  if(p==='/api/site/items/reader-fixture')return res.end(JSON.stringify({...detail,id:'reader-fixture',title:'阅读增强检查',body:{...detail.body,zh:readerBody()}}));
  if(p==='/api/site/items/reader-en')return res.end(JSON.stringify({...detail,id:'reader-en',title:'Reader enhancements',editorialLanguage:'en',language:'en',hasTranslation:false,bodyLanguage:'original',body:{zh:null,original:readerBody(true),zhKind:null,complete:true},contentLanguage:{requested:'en',status:'original',sourceLanguage:'en',language:'en'},bodyContentLanguage:{requested:'en',status:'original-english',sourceLanguage:'en',language:'en'}}));
  if(p==='/api/site/items/reader-fixture/original')return res.end(JSON.stringify({...detail,id:'reader-fixture',title:'阅读增强检查',body:{...detail.body,zh:null,original:'<p>Original reader text</p>'},bodyLanguage:'original'}));
  if(p.startsWith('/api/site/items/long-'))return res.end(JSON.stringify({...detail,id:p.split('/').at(-1),title:'长列表详情'}));
  const kind=p.match(/^\/api\/site\/reports\/(daily|weekly|monthly)\/latest-page$/)?.[1] as 'daily'|'weekly'|'monthly'|undefined;
  if(kind){const r=report(kind);return res.end(JSON.stringify({report:r,index:[{key:r.key,issueNumber:1,title:r.title,count:0}]}));}
  res.statusCode=404;res.end(JSON.stringify({code:'not_found'}));
});

before(async()=>{
  // Started together; whatever started is stopped in after() even when another one failed.
  const started=await Promise.allSettled([
    startWebServer(api).then(w=>{web=w;origin=w.origin;}),
    chromium.launch({channel:'chromium'}).then(b=>{chrome=b;}),
    webkit.launch().then(b=>{safari=b;}),
  ]);
  for(const result of started)if(result.status==='rejected')throw result.reason;
});
after(async()=>{
  await chrome?.close();await safari?.close();
  await web?.stop();
});

// One engine per behaviour: WebKit for what phone readers do (iPhone Safari), Chromium for desktop-only
// intent such as hover. The router and caches are the same code in both.
test('SSR list and visited query variants return offline without another read',async()=>{
  const context=await readerContext(safari,{viewport:{width:390,height:844}});
  const page=await context.newPage();
  try{
    await page.goto(origin+'/');
    // This exercises client history/cache, so wait for hydration before leaving the SSR page.
    await hydrated(page.getByRole('link',{name:'性能检查文章',exact:true}));
    await page.getByRole('link',{name:'性能检查文章',exact:true}).click();
    await expect(page.getByText('固定正文',{exact:true})).toBeVisible();
    await context.setOffline(true);
    await page.goBack();
    // Offline, a revisit that needed the network would show an error page, so the content appearing is the
    // check; the time limit only has to outlast a slow WebKit runner.
    await expect(page.getByRole('link',{name:'性能检查文章',exact:true})).toBeVisible({timeout:10_000});
    await context.setOffline(false);
    await page.locator('#main').getByRole('link',{name:'Models',exact:true}).click();
    await expect(page.getByRole('link',{name:'分类 ai-models',exact:true})).toBeVisible();
    await page.locator('#main').getByRole('link',{name:'Products',exact:true}).click();
    await expect(page.getByRole('link',{name:'分类 ai-products',exact:true})).toBeVisible();
    await context.setOffline(true);
    await page.goBack();
    await expect(page.getByRole('link',{name:'分类 ai-models',exact:true})).toBeVisible({timeout:10_000});
    await expect(page.locator('link[rel=canonical]')).toHaveAttribute('href',origin+'/?category=ai-models');
  }finally{await context.close();}
});

test('hover preloads modules without data, moving touches do not, and an unavailable target leaves the current page intact until clicked',async()=>{
  const context=await readerContext(chrome,desk);const page=await context.newPage();
  const requests:string[]=[];
  page.on('request',r=>{if(r.url().includes('.data'))requests.push(r.url());});
  const modules=page.locator('link[rel=modulepreload][href*="/assets/item-"]');
  try{
    await page.goto(origin+'/');
    const link=page.getByRole('link',{name:'性能检查文章',exact:true});
    await hydrated(link);
    const start=hits.length;
    await link.dispatchEvent('touchstart');await link.dispatchEvent('touchmove');
    await page.waitForTimeout(250);
    await expect(modules).toHaveCount(0);
    assert.deepEqual(requests,[]);
    await link.hover();
    await expect(modules.first()).toBeAttached();
    await page.waitForTimeout(250);
    assert.deepEqual(requests,[],'hover must not request Router data');
    assert.equal(hits.slice(start).filter(x=>x.startsWith('/api/site/items/')).length,0);
    await link.click();await expect(page.getByText('固定正文',{exact:true})).toBeVisible();
    assert.equal(hits.slice(start).filter(x=>x.startsWith('/api/site/items/')).length,1,'only the actual click reads the article');
    assert.equal(requests.length,1);
    const fresh=await readerContext(chrome,desk);const freshPage=await fresh.newPage();
    try{
      await freshPage.goto(origin+'/');failing='/api/site/items/navigation-fixture';
      await hydrated(freshPage.getByRole('link',{name:'性能检查文章',exact:true}));
      const start=hits.length;
      await freshPage.getByRole('link',{name:'性能检查文章',exact:true}).hover();
      await expect(freshPage.locator('link[rel=modulepreload][href*="/assets/item-"]').first()).toBeAttached();
      await freshPage.waitForTimeout(250);
      assert.equal(hits.slice(start).filter(x=>x.startsWith('/api/site/items/')).length,0,'even an unavailable target is not read on intent');
      await expect(freshPage.getByRole('heading',{name:'Today’s AI news: editorial picks and emerging stories',exact:true})).toBeVisible();
      await expect(freshPage).toHaveURL(origin+'/');
      await freshPage.getByRole('link',{name:'性能检查文章',exact:true}).click();
      await expect(freshPage.getByRole('heading',{name:'Unable to load this page',exact:true})).toBeVisible();
      assert.equal(hits.slice(start).filter(x=>x.startsWith('/api/site/items/')).length,1);
    }finally{await fresh.close();}
  }finally{failing='';await context.close();}
});

test('SSR all-pages and report kinds return offline with their own content',async()=>{
  const context=await readerContext(chrome);const page=await context.newPage();
  try{
    await page.goto(origin+'/all');
    await page.locator('a[href="/all?page=2"]').first().click();
    await expect(page.getByRole('link',{name:'全部第 2 页',exact:true})).toBeVisible();
    await context.setOffline(true);await page.goBack();
    await expect(page.getByRole('link',{name:'全部第 1 页',exact:true})).toBeVisible({timeout:1500});
    await context.setOffline(false);await page.goto(origin+'/daily');
    await page.getByRole('link',{name:'Weekly',exact:true}).click();
    await expect(page.locator('#report-start')).toContainText('AI stories of the week');
    await context.setOffline(true);await page.getByRole('link',{name:'Daily',exact:true}).click();
    await expect(page.locator('#report-start')).toContainText('AI stories of the day',{timeout:1500});
  }finally{await context.close();}
});

// A prefetch of the newly selected link must not be mistaken for an explicit refresh of that page.
// Disable HTTP reuse here: otherwise the browser cache can hide a lost document-level result.
test('intent on a selected link preserves visited data and the next revisit starts no data request',async()=>{
  const context=await readerContext(chrome);const page=await context.newPage();
  const requests:string[]=[];
  await context.route('**/*.data*',route=>route.continue());
  page.on('request',request=>{if(request.url().includes('.data'))requests.push(request.url());});
  try{
    await page.goto(origin+'/');
    // A click before hydration is a document load, which leaves the client cache this test is about empty.
    await hydrated(page.locator('#main').getByRole('link',{name:'Models',exact:true}));
    await page.locator('#main').getByRole('link',{name:'Models',exact:true}).click();
    await expect(page.getByRole('link',{name:'分类 ai-models',exact:true})).toBeVisible();
    await page.locator('#main').getByRole('link',{name:'Models',exact:true}).focus();
    await page.waitForTimeout(150);
    await page.locator('#main').getByRole('link',{name:'Products',exact:true}).click();
    await expect(page.getByRole('link',{name:'分类 ai-products',exact:true})).toBeVisible();
    await page.locator('#main').getByRole('link',{name:'Products',exact:true}).focus();
    await page.waitForTimeout(150);
    const before=requests.length;
    await page.locator('#main').getByRole('link',{name:'Models',exact:true}).click();
    await expect(page.getByRole('link',{name:'分类 ai-models',exact:true})).toBeVisible();
    assert.deepEqual(requests.slice(before),[],'neither prefetch nor navigation may evict and reload a still-valid visited page');
  }finally{await context.close();}
});

test('a revisit never renews the original deadline; an expired read shows an error and a reload asks again',async()=>{
  const context=await readerContext(chrome);const page=await context.newPage();
  try{
    await page.clock.install();ttl=1;
    await page.goto(origin+'/');
    await page.getByRole('link',{name:'性能检查文章',exact:true}).click();await expect(page.getByText('固定正文',{exact:true})).toBeVisible();
    failing='/api/site/timeline';
    await page.clock.runFor(1500);
    await page.goBack();await expect(page.getByRole('heading',{name:'Unable to load this page',exact:true})).toBeVisible();
    await expect(page.getByText('This page is temporarily unavailable. Please reload and try again.',{exact:true})).toBeVisible();
    await expect(page.getByRole('link',{name:'Reload',exact:true})).toBeVisible();
    failing='';ttl=60;
    await page.reload();await expect(page.getByRole('link',{name:'性能检查文章',exact:true})).toBeVisible();
  }finally{ttl=60;failing='';await context.close();}
});

test('SSR freshness spent in an upstream cache is not renewed by HTML hydration',async()=>{
  const context=await readerContext(chrome);const page=await context.newPage();
  try{
    ttl=0;await page.goto(origin+'/');
    await page.getByRole('link',{name:'性能检查文章',exact:true}).click();await expect(page.getByText('固定正文',{exact:true})).toBeVisible();
    const start=hits.length;ttl=60;
    await page.goBack();await expect(page.getByRole('link',{name:'性能检查文章',exact:true})).toBeVisible();
    assert.equal(hits.slice(start).filter(x=>x.startsWith('/api/site/timeline')).length,1);
  }finally{ttl=60;await context.close();}
});

test('Agent tabs finish offline with matching canonical; invalid direct tabs and anchored links keep a panel',async()=>{
  const context=await readerContext(chrome);const page=await context.newPage();
  try{
    await page.goto(origin+'/agent');
    await context.setOffline(true);
    await page.getByRole('tablist',{name:'Integrations'}).getByRole('tab',{selected:true}).click();
    await expect(page.locator('#agent-panel')).not.toBeEmpty();
    for(const [tab,name] of [['mcp',/^MCP/],['rss',/^RSS/],['api',/^REST API/]] as const){
      const choice=page.getByRole('tab',{name});
      // The active track was exercised above; compare navigation through every remaining track.
      if(await choice.getAttribute('aria-selected')==='true')continue;
      const target=await choice.getAttribute('href');
      await choice.click();
      await expect(page).toHaveURL(origin+target,{timeout:1500});
      await expect(page.locator('link[rel=canonical]')).toHaveAttribute('href',origin+target);
      await expect(page.locator('#agent-panel')).toHaveAttribute('aria-labelledby','agent-tab-'+tab);
      await expect(page.locator('#agent-panel')).not.toBeEmpty();
    }
    await context.setOffline(false);
    await page.goto(origin+'/agent?tab=unknown');
    await expect(page.getByRole('tab').first()).toHaveAttribute('aria-selected','true');
    await expect(page.locator('#agent-panel')).not.toBeEmpty();
    await page.goto(origin+'/agent#agent-api-recovery');
    await expect(page.locator('#agent-api-recovery')).toBeVisible();
  }finally{await context.close();}
});

test('phone search links to all news, focuses on opening, submits only on demand and retries a failed read',async()=>{
  const context=await readerContext(safari,{viewport:{width:390,height:844}});const page=await context.newPage();
  try{
    const start=hits.length;
    await page.goto(origin+'/');
    assert.equal(hits.slice(start).filter(x=>x.startsWith('/api/site/pool')).length,0);
    const search=page.locator('#main').getByRole('link',{name:'Search',exact:true});
    await expect(search).toHaveAttribute('href','/all?search=1');
    await search.click();
    await expect(page).toHaveURL(origin+'/all?search=1');
    const input=page.getByRole('search').getByRole('textbox');
    await expect(input).toBeFocused();
    const opened=hits.length;
    await input.fill('fixture');await page.waitForTimeout(250);
    assert.equal(hits.slice(opened).filter(x=>x.startsWith('/api/site/pool')).length,0,'typing alone must not search the API');
    await page.getByRole('search').getByRole('button',{name:'Search',exact:true}).click();
    await expect(page.getByRole('link',{name:'Search result fixture',exact:true})).toBeVisible();
    assert.equal(hits.slice(opened).filter(x=>x.startsWith('/api/site/pool')&&new URL(x,'http://local').searchParams.get('q')==='fixture').length,1);
    failing='/api/site/pool';await input.fill('unavailable');await input.press('Enter');
    await expect(page.getByRole('heading',{name:'Search is busy',exact:true})).toBeVisible();
    await expect(page.getByText('Search is busy right now. Try again in 5 seconds. Lists remain available.',{exact:true})).toBeVisible();
    failing='';await page.getByRole('link',{name:'Retry this search',exact:true}).click();
    await expect(page.getByRole('link',{name:'Search result unavailable',exact:true})).toBeVisible();
    assert.equal(hits.slice(start).filter(x=>x.startsWith('/api/site/search/suggestions')).length,0,'this site has no suggestion overlay');
  }finally{failing='';await context.close();}
});

for(const locale of ['en','zh'] as const) test(locale==='en'?'English reader enhancements wait for visible code and preserve licensed body text':'Chinese reader enhancements clean up on switching to the original',async()=>{
  const context=await readerContext(safari,{viewport:{width:390,height:844}});
  const page=await context.newPage();
  const scripts:string[]=[];page.on('request',r=>{if(r.url().includes('/assets/')&&r.url().includes('highlight-'))scripts.push(r.url());});
  await page.route('**/reader-image/*.svg',route=>route.fulfill({contentType:'image/svg+xml',body:`<svg xmlns="http://www.w3.org/2000/svg" width="${route.request().url().endsWith('/tiny.svg')?16:640}" height="360"><rect width="640" height="360" fill="red"/></svg>`}));
  try{
    await page.goto(origin+(locale==='en'?'/items/reader-en':'/zh/items/reader-fixture'));
    await expect(page.getByRole('heading',{name:locale==='en'?'Reader enhancements':'阅读增强检查',exact:true})).toBeVisible();
    await expect(page.locator('.code-block-copy')).toHaveCount(2);
    await expect(page.locator('.code-block-copy').first()).toHaveText(locale==='en'?'Copy':'复制');
    await expect(page.locator('.code-block-copy').first()).toHaveAttribute('aria-label',locale==='en'?'Copy code':'复制代码');
    assert.deepEqual(scripts,[],'reading the introduction must not download the offscreen highlighter');
    const source=page.locator('.prose pre code').first();
    assert.equal(await source.textContent(),codeSource);
    await source.scrollIntoViewIfNeeded();
    await expect(source).toHaveClass(/hljs/);
    assert.equal(await source.textContent(),codeSource,'colouring preserves the copyable text');
    assert.equal(scripts.length,1);
    await page.locator('.code-block-copy').first().click();
    await expect(page.locator('.code-block-copy').first()).toHaveText(locale==='en'?'Copied':'已复制');
    assert.equal(await page.locator('.prose pre code').nth(1).textContent(),'x = 1');
    for(let i=0;i<12;i++){
      const picture=page.locator(`.prose img[alt="正文配图 ${i}"]`);
      await picture.scrollIntoViewIfNeeded();
      await expect(picture).toHaveAttribute('role','button');
      await expect(picture).toHaveAttribute('aria-label',(locale==='en'?'View full image: ':'查看大图：')+'正文配图 '+i);
    }
    const tiny=page.locator('.prose img[alt="小图标"]');await tiny.scrollIntoViewIfNeeded();
    await expect(tiny).not.toHaveAttribute('role','button');
    await expect(page.locator('.prose a img')).not.toHaveAttribute('role','button');
    if(locale==='zh'){
      await page.getByRole('navigation',{name:'正文语言'}).getByRole('link',{name:'原文',exact:true}).click();
      await expect(page.getByText('Original reader text',{exact:true})).toBeVisible();
      assert.equal(await page.locator('.code-block-copy').count(),0);
      await page.getByRole('navigation',{name:'正文语言'}).getByRole('link',{name:'中文',exact:true}).click();
      await expect(page.locator('.code-block-copy')).toHaveCount(2);
      await expect(page.locator('.code-block-copy').first()).toHaveText('复制');
    }else{
      await expect(page.locator('.prose p').first()).toHaveText('Reading paragraph 0: read the article before the code and pictures. Text remains readable; pictures and code are enhanced when needed.');
      await expect(page.getByRole('navigation',{name:'Article language'})).toHaveCount(0);
      // The UI can change while the same licensed body remains untranslated.
      await page.getByRole('combobox',{name:'Edition language'}).first().selectOption('zh');
      await expect(page).toHaveURL(origin+'/zh/items/reader-en');
      await expect(page.locator('.code-block-copy').first()).toHaveText('复制');
      assert.equal(await page.locator('.prose pre code').first().textContent(),codeSource);
      await expect(page.locator('.prose p').first()).toContainText('Reading paragraph 0:');
    }
  }finally{await context.close();}
});

for(const folded of [false,true]) test(folded?'desktop deep reading returns to its anchor with folded dates':'phone deep reading returns to its anchor without folding dates',async()=>{
  const context=await readerContext(safari,{viewport:{width:folded?1440:390,height:844}});
  const page=await context.newPage();
  try{
    await page.goto(origin+'/?tag=long-reading');
    await expect(page.locator('[data-card-key]')).toHaveCount(180);
    const collapse=page.getByRole('button',{name:'Collapse 10/4',exact:true});
    if(folded){
      await collapse.click();
      await expect(page.locator('[data-card-key]')).toHaveCount(120);
    }else await expect(collapse).not.toBeVisible();
    await page.getByRole('link',{name:'长列表文章 160',exact:true}).scrollIntoViewIfNeeded();
    const before=await page.evaluate(()=>{
      const first=[...document.querySelectorAll<HTMLElement>('[data-card-key]')].find(e=>e.getBoundingClientRect().bottom>72)!;
      return {key:first.dataset.cardKey!,top:first.getBoundingClientRect().top};
    });
    await page.getByRole('link',{name:'长列表文章 160',exact:true}).click();
    await expect(page.getByText('固定正文',{exact:true})).toBeVisible();
    await page.goBack();
    await expect(page.locator('[data-card-key]')).toHaveCount(folded?120:180);
    await expect.poll(()=>page.locator(`[data-card-key="${before.key}"]`).evaluate((e,top)=>Math.abs(e.getBoundingClientRect().top-top),before.top)).toBeLessThan(2);
    if(folded)await expect(page.getByRole('button',{name:'Expand 10/4',exact:true})).toBeVisible();
  }finally{await context.close();}
});

test('a card sends no click sparks with the page and makes them on the first save, on phones and desktops',async()=>{
  for(const [browser,viewport] of [[chrome,{width:1280,height:900}],[safari,{width:390,height:844}]] as const){
    const context=await readerContext(browser,{viewport});const page=await context.newPage();
    try{
      await page.goto(origin+'/');
      const star=page.locator('[data-item-id="navigation-fixture"] button[aria-pressed]');
      const sparks=star.locator('span[aria-hidden=true] > span');
      await expect(sparks).toHaveCount(0);
      await star.click();
      await expect(star).toHaveAttribute('aria-pressed','true');
      await expect(sparks).toHaveCount(8);
      // One score pill per card: phones see the number, desktops the label too.
      const score=page.locator('[data-item-id="navigation-fixture"] [aria-label^="AI score"]');
      await expect(score).toHaveCount(1);
      await expect(score.getByText('AI score',{exact:true})).toBeVisible({visible:viewport.width>=961});
    }finally{await context.close();}
  }
});
