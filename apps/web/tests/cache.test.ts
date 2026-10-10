import { UNSAFE_decodeViaTurboStream } from "react-router";
// Run after `npm run build -w @aihot/web`. Real production server/router, synthetic HTTP API only.
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { CATEGORY_KEYS } from "@aihot/contracts/taxonomy";
import { parseHTML } from "linkedom";

const seoSource = { id: "src", name: "示例媒体", kind: "rss", firstParty: false, iconUrl: null };
const seoItem = {
  id: "seo-sample", revision: 1, title: "示例标题", originalTitle: null, summary: "示例摘要", reason: null, source: seoSource,
  links: { aihot: "/items/seo-sample", original: "https://example.com/report" }, publishedAt: "2026-10-09T01:00:00.000Z",
  discoveredAt: "2026-10-09T01:05:00.000Z", timelineAt: "2026-10-09T01:05:00.000Z", category: null, tags: ["开源"], score: null,
  selected: true, channel: "news", story: null, x: null, readingMode: "summary-only", author: null, language: "zh", body: null,
  outline: [], relatedStories: [], topics: [], sameEvent: null, indexable: true, markdownAvailable: false, group: null, hasTranslation: false, bodyLanguage: "zh",
};
const seoStory = {
  publicId: "seo-story", title: "示例事件", status: "active", reportCount: 2, sourceCount: 2, firstReportAt: "2026-10-08T00:00:00.000Z",
  latestAt: "2026-10-09T00:00:00.000Z", digest: "事件综述", digestUpdatedAt: null, summary: null, excerpt: null, latest: null,
  whyHot: { participants48h: 0, newParticipants6h: 0, recentReports24h: 0, observationComplete: true, rank: null, heat: null },
  developments: [], officialReports: [], timeline: [], heat: [], related: [], topics: [], latestReport: null,
};

/** The JSON-LD entries of a rendered page. */
function jsonLd(html: string): Array<Record<string, unknown>> {
  return [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].flatMap((m) => [JSON.parse(m[1]!)].flat());
}

function alternate(document: ReturnType<typeof parseHTML>["document"], language: string) {
  return [...document.querySelectorAll('link[rel="alternate"]')].find((link) => (link.getAttribute("hrefLang") ?? link.getAttribute("hreflang")) === language);
}

let web: ChildProcess;
let origin: string;
let logs = "";
let deadline: number;
let refreshAt: string;
let metaDelayMs = 0;
const apiCookies: Array<string | undefined> = [];
const apiRequests: string[] = [];
const api = createServer((req, res) => {
  const url = new URL(req.url!, "http://api.local");
  apiCookies.push(req.headers.cookie);
  apiRequests.push(url.pathname + url.search);
  res.setHeader("Content-Type", "application/json");
  if (url.pathname === "/api/site/meta") {
    const respond = () => res.end(JSON.stringify({ changelogVersion: "2026-09-28T12:00" }));
    return metaDelayMs ? setTimeout(respond, metaDelayMs) : respond();
  }
  if (url.pathname === "/api/site/timeline") {
    const filters = { channel: "all", category: url.searchParams.get("category"), tag: null, topic: null };
    res.setHeader("X-Accel-Expires", `@${deadline}`);
    res.setHeader("Cache-Control", "public, max-age=30, s-maxage=30");
    return res.end(JSON.stringify({ filters, cards: [], nextCursor: null, refreshAt, dayCounts: [], hot: null, generatedAt: "2026-09-28T00:00:00Z" }));
  }
  if (url.pathname === "/api/site/hot") return res.end(JSON.stringify({ entries: [] }));
  if (url.pathname === "/api/site/changelog") {
    const english=url.searchParams.get("lang")==="en";
    return res.end(JSON.stringify({latestVersion:"2026-10-01T08:00",releases:[{date:"2026-10-01",time:"08:00",kind:"公告",title:english?"Website launch":"网站上线",body:[english?"A **daily briefing** every morning.":"每天早上出一份**日报**。"]}]}));
  }
  if (url.pathname === "/api/site/cache-example") { res.setHeader("Cache-Control", "public, max-age=30, s-maxage=60"); return res.end("{}"); }
  if (url.pathname === "/feed/picks.xml") { res.setHeader("Content-Type", "application/rss+xml"); res.setHeader("Cache-Control", "public, max-age=60"); return res.end("<rss/>"); }
  if (url.pathname === "/api/site/download") {
    res.setHeader("Content-Type", "text/markdown; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="article.md"');
    return res.end("# Article");
  }
  if (url.pathname === "/api/site/echo-client") return res.end(JSON.stringify({ forwarded: req.headers["x-forwarded-for"], real: req.headers["x-real-ip"] }));
  if (/^\/api\/site\/items\/(native-en|legacy-zh|bilingual|actual-en|foreign-body|unknown-body)(?:\/original)?$/.test(url.pathname)) {
    const id = url.pathname.split("/")[4]!;
    const zh = url.searchParams.get("lang") === "zh";
    const bilingual = id === "bilingual";
    const legacy = id === "legacy-zh";
    const actual = legacy ? "zh" : bilingual && zh ? "zh" : "en";
    return res.end(JSON.stringify({ ...seoItem, id, title: actual === "zh" ? "中文标题" : "Native English headline", summary: actual === "zh" ? "中文摘要" : "English summary", editorialLanguage: legacy || id === "actual-en" ? "zh" : "en", language: "en",
      readingMode: "full", body: { original: id === "foreign-body" ? "<p>Texte original français autorisé.</p>" : "<p>Permitted original English body.</p>", zh: null, zhKind: null, complete: true }, bodyLanguage: "original",
      contentLanguage: { requested: zh ? "zh" : "en", status: bilingual && zh ? "translated" : "original", sourceLanguage: legacy || id === "actual-en" ? "zh" : "en", language: actual },
      bodyContentLanguage: { requested: zh ? "zh" : "en", status: id === "foreign-body" || id === "unknown-body" ? "original" : "original-english", sourceLanguage: id === "foreign-body" ? "fr" : "en", language: id === "foreign-body" ? "fr" : id === "unknown-body" ? "unknown" : "en" },
    }));
  }
  if (url.pathname === "/api/site/pool") return res.end(JSON.stringify({ filters: { channel: "all", category: null, tag: null, q: url.searchParams.get("q"), tab: "latest" }, items: [], page: 1, pageCount: 1, total: 0, freshness: "2026-09-28T00:00:00Z", todayCount: 0 }));
  if (url.pathname === "/api/site/topics") return res.end(JSON.stringify({ groups: [{ key: "field", name: "Fields", blurb: "By field" }], topics: [{ slug: "robots", name: "Robots", definition: "Robotics news", group: "field", brand: null, total: 40, recent: 0, indexable: true, latest: null }] }));
  if (url.pathname === "/api/site/topics/robots") return res.end(JSON.stringify({ topic: { slug: "robots", name: "Robots", definition: "Robotics news", group: "field", groupName: "Fields", brand: null, total: 40, recent: 0, poolTotal: 40, latest: null, indexable: true }, modules: {}, items: [], page: Number(url.searchParams.get("page") ?? 1), pageCount: 2, pageSize: 20 }));
  const report = /^\/api\/site\/reports\/(daily|weekly|monthly)\/(latest-page|navigation\/[^/]+|[^/]+)$/.exec(url.pathname);
  if (report) {
    const kind = report[1]!;
    const key = kind === "daily" ? "2026-09-01" : kind === "weekly" ? "2026-W39" : "2026-09";
    const zh = url.searchParams.get("lang") === "zh";
    const entry = { key, title: zh ? "中文报告" : "English briefing" };
    const detail = { ...entry, kind, reportTimeZone: "America/New_York", windowStart: "2026-09-01T00:00:00Z", windowEnd: "2026-09-02T00:00:00Z", generatedAt: "2026-09-02T00:00:00Z", revision: 1, lead: null, overview: null, highlights: [], sections: [], stories: [], flashes: [], cover: null, metrics: {}, readingMinutes: 1, prev: null, next: null,
      editorialLanguage: "en", contentLanguage: { status: zh ? "translated" : "original", sourceLanguage: "en" } };
    return res.end(JSON.stringify(report[2] === "latest-page" ? { report: detail, index: [entry] } : report[2]!.startsWith("navigation/") ? { items: [entry] } : detail));
  }
  if (url.pathname === "/api/site/items/long-lived") return res.end(JSON.stringify({ id: "long-lived", title: "t" }));
  if (url.pathname === "/api/site/items/seo-sample") return res.end(JSON.stringify(seoItem));
  if (url.pathname === "/api/site/stories/mixed-story") return res.end(JSON.stringify({ ...seoStory, publicId:"mixed-story",title:"An English digest title",digest:"A new English digest.",summary:"历史中文摘要",editorialLanguage:"en",
    contentLanguage:{requested:url.searchParams.get("lang"),status:"original",sourceLanguage:"unknown",language:"unknown"},
    developments:[1,2].map(index=>({factId:`legacy-fact-${index}`,title:`历史事实 ${index}`,firstReportAt:seoStory.firstReportAt,occurredAt:null,reportCount:1,representative:{id:`legacy-${index}`,title:"A current English article",summary:"A verified English summary.",source:seoSource,publishedAt:seoStory.firstReportAt,originalUrl:"https://example.com/report",selected:true}})),
  }));
  if (url.pathname === "/api/site/stories/seo-story") return res.end(JSON.stringify(seoStory));
  if (url.pathname === "/api/site/contact") return res.end(JSON.stringify({ wechatQr: "/qr.png", feishuQr: "/qr.png" }));
  if (url.pathname === "/api/site/stories/merged") {
    res.statusCode = 308;
    return res.end(JSON.stringify({ mergedInto: "surviving-story" }));
  }
  res.statusCode = url.pathname.startsWith("/api/admin/") ? 401 : 404;
  res.end(JSON.stringify({ code: "not_found" }));
});

before(async () => {
  deadline = Math.floor(Date.now() / 1000) + 20;
  refreshAt = new Date((deadline + 5) * 1000).toISOString();
  api.listen(0, "127.0.0.1");
  await once(api, "listening");
  web = spawn(process.execPath, [fileURLToPath(new URL("../server.ts", import.meta.url))], {
    env: { ...process.env, WEB_PORT: "0", TRUST_PROXY: "false", API_BASE_URL: `http://127.0.0.1:${(api.address() as AddressInfo).port}` },
    stdio: ["ignore", "pipe", "pipe"],
  });
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`web did not start: ${logs}`)), 15_000);
    web.on("exit", () => { clearTimeout(timeout); reject(new Error(`web exited: ${logs}`)); });
    web.stderr!.on("data", (chunk) => { logs += String(chunk); });
    web.stdout!.on("data", (chunk) => {
      logs += String(chunk);
      const match = logs.match(/"msg":"web started","port":(\d+)/);
      if (match) {
        origin = `http://127.0.0.1:${match[1]}`;
        clearTimeout(timeout);
        resolve();
      }
    });
  });
});

after(async () => {
  if (web && web.exitCode === null) {
    web.kill("SIGTERM");
    await once(web, "exit");
  }
  api.closeAllConnections();
  await new Promise<void>((resolve) => api.close(() => resolve()));
});

test("public route subsets produce the same complete navigation data; filters still differ", async () => {
  const answers = await Promise.all(["", "?_routes=root", "?_routes=routes%2Fhome", "?_routes=unknown"].map(async (query) => {
    const res = await fetch(`${origin}/_.data${query}`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("Cache-Control"), "private, no-store");
    assert.equal(res.headers.get("X-Accel-Expires"), "0");
    assert.doesNotMatch(res.headers.get("Cache-Control")!, /stale/);
    const body = await res.text();
    assert.ok(body.includes("root") && body.includes("routes/home"));
    return body;
  }));
  assert.ok(answers.every((body) => body === answers[0]));
  const category = CATEGORY_KEYS.at(-1)!;
  const filtered = await fetch(`${origin}/_.data?category=${category}&_routes=root`);
  const body = await filtered.text();
  assert.ok(body.includes(category));
  assert.notEqual(body, answers[0]);
});

test("URL editions isolate HTML and Router data while preferences cannot change a URL", async () => {
  const english = await fetch(`${origin}/`, { headers: { "Accept-Language": "en-US" } });
  const englishHtml = await english.text();
  assert.equal(english.status, 200);
  assert.match(englishHtml, /<html lang="en"/);
  assert.match(englishHtml, /The universe is cooling/);
  assert.doesNotMatch(englishHtml, /English editions appear when available/);
  const chinese = await fetch(`${origin}/zh`, { headers: { "Accept-Language": "zh-TW,en;q=0.8" } });
  const chineseHtml = await chinese.text();
  assert.match(chineseHtml, /<html lang="zh-CN"/);
  assert.match(chineseHtml, /宇宙在降温/);
  // The front page's h1 is what readers search for; the line under it is display copy.
  assert.match(chineseHtml, /<h1 class="deck-heading">今日 AI 新闻：精选与新兴事件<\/h1>/);
  assert.match(chineseHtml, /<p class="deck-title">宇宙在降温/);
  assert.match(englishHtml, /<h1 class="deck-heading">Today’s AI news: editorial picks and emerging stories<\/h1>/);
  assert.match(chineseHtml, /"@type":"WebSite"/);
  // The acceleration (/chronicle) is the signature view: second in the top bar and a tab on phones.
  assert.match(chineseHtml, /aria-label="底部导航"[\s\S]*?href="\/zh\/chronicle"[^>]*>[\s\S]*?<span>加速史<\/span>/);
  assert.match(englishHtml, /Explore the acceleration/);
  assert.notEqual(chineseHtml, englishHtml);
  const manual = await fetch(`${origin}/`, { headers: { "Accept-Language": "zh-CN", Cookie: "eacc_language=zh; admin_session=private" } });
  assert.match(await manual.text(), /<html lang="en"/);
  for (const res of [english, chinese, manual]) {
    assert.equal(res.headers.get("Cache-Control"), "private, no-store");
    assert.equal(res.headers.get("X-Accel-Expires"), "0");
    assert.match(res.headers.get("Vary")!, /Accept-Language/);
    assert.match(res.headers.get("Vary")!, /Cookie/);
    assert.equal(res.headers.get("Set-Cookie"), null);
  }
  const started = Date.now();
  const plain = await fetch(`${origin}/about.data`);
  const signedIn = await fetch(`${origin}/about.data?_routes=root`, { headers: { cookie: "admin_session=private; aihot_vid=reader" } });
  assert.equal(plain.headers.get("Cache-Control"), "private, no-store");
  assert.equal(signedIn.headers.get("Set-Cookie"), null);
  const decoded = await Promise.all([plain, signedIn].map(async (response) => {
    const { value } = await UNSAFE_decodeViaTurboStream(response.body!, globalThis);
    const result = value as { root: { data: { locale: string } }; "routes/about": { data: { expiresAt: number } } };
    assert.equal(result.root.data.locale, "en");
    const { expiresAt, ...content } = result["routes/about"].data;
    // Each read owns its server deadline; crossing a second must not change business content.
    assert.ok(expiresAt >= started + 299_000 && expiresAt <= Date.now() + 300_000);
    return { ...result, "routes/about": { data: content } };
  }));
  assert.deepEqual(decoded[1], decoded[0]);
  const localized = await fetch(`${origin}/about.data`, { headers: { cookie: "eacc_language=zh" } });
  assert.match(await localized.text(), /"locale".*"en"/);
  const chineseData = await fetch(`${origin}/zh/about.data`, { headers: { cookie: "eacc_language=en" } });
  assert.match(await chineseData.text(), /"locale".*"zh"/);
  assert.ok(apiCookies.every((cookie) => !cookie));
});

test("changelog renders English prose, kind filters and calendar labels; Chinese remains available",async()=>{
  const en=await fetch(`${origin}/changelog`,{headers:{"Accept-Language":"en"}});
  assert.equal(en.status,200);assert.equal(en.headers.get("Cache-Control"),"private, no-store");
  const english=parseHTML(await en.text()).document.querySelector("main")!;
  assert.match(english.textContent!,/Website launch/);assert.match(english.textContent!,/Announcement/);
  assert.match(english.textContent!,/Oct 1, 2026/);assert.match(english.textContent!,/Thursday/);assert.match(english.textContent!,/October 2026/);
  assert.doesNotMatch(english.textContent!,/[\u3400-\u9fff]/u);
  assert.equal(english.querySelector("article b")?.textContent,"daily briefing");
  const zh=await fetch(`${origin}/zh/changelog`,{headers:{"Accept-Language":"en",cookie:"eacc_language=zh"}});
  const chinese=parseHTML(await zh.text()).document.querySelector("main")!;
  assert.match(chinese.textContent!,/网站上线/);assert.match(chinese.textContent!,/公告/);assert.match(chinese.textContent!,/2026 年 10 月 1 日/);assert.match(chinese.textContent!,/周四/);
});

test("news pages carry NewsArticle data matching their visible dates and source", async () => {
  const item = await fetch(`${origin}/items/seo-sample`, { headers: { "Accept-Language": "zh-CN" } });
  assert.equal(item.status, 200);
  const itemLd = jsonLd(await item.text());
  const article = itemLd.find((e) => e["@type"] === "NewsArticle")!;
  assert.ok(article, "item NewsArticle");
  assert.equal(article.headline, "示例标题");
  assert.equal(article.datePublished, "2026-10-09T01:00:00.000Z");
  assert.equal(article.isBasedOn, "https://example.com/report");
  assert.equal(article.inLanguage, "zh-CN");
  assert.match(String(article.url), /\/items\/seo-sample$/);
  assert.ok(itemLd.some((e) => e["@type"] === "BreadcrumbList"));
  const story = await fetch(`${origin}/story/seo-story`, { headers: { "Accept-Language": "zh-CN" } });
  assert.equal(story.status, 200);
  // An event page is a collection of public reports: it is dated modified, never "published".
  const event = jsonLd(await story.text()).find((e) => e["@type"] === "CollectionPage")!;
  assert.ok(event, "event CollectionPage");
  assert.equal("datePublished" in event, false);
  assert.equal(event.dateModified, "2026-10-09T00:00:00.000Z");
  assert.equal(event.description, "事件综述");
});

test("the e/acc concept pages keep their English titles, text language and structured data", async () => {
  const pages = [
    { path: "/what-is-eacc", title: "What is e/acc? Effective Accelerationism, Explained | e-acc.ai", type: "FAQPage", count: 6 },
    { path: "/eacc-vs-dacc", title: "e/acc vs d/acc: Accelerationism&#x27;s Two Camps | e-acc.ai", type: "FAQPage", count: 5 },
    { path: "/eacc-glossary", title: "e/acc Glossary: Accelerationism Terms, Defined | e-acc.ai", type: "DefinedTermSet", count: 16 },
  ];
  for (const page of pages) {
    // A Chinese interface still gets the English page: the body, title and og:locale describe the text.
    const res = await fetch(`${origin}${page.path}`, { headers: { "Accept-Language": "zh-CN" } });
    assert.equal(res.status, 200, page.path);
    const html = await res.text();
    assert.ok(html.includes(`<title>${page.title}</title>`), page.path);
    assert.match(html, new RegExp(`<link rel="canonical" href="[^"]*${page.path}"/>`));
    assert.match(html, /<meta property="og:locale" content="en"\/>/);
    assert.match(html, /<article class="pb-14" lang="en">/);
    const english = await (await fetch(`${origin}${page.path}`, { headers: { "Accept-Language": "en" } })).text();
    assert.doesNotMatch(english, /English editions appear when available/, page.path);
    const main = jsonLd(html).find((e) => e["@type"] === page.type)!;
    assert.ok(main, `${page.path} ${page.type}`);
    assert.equal((main.about as { name: string }).name, "Effective accelerationism");
    const entries = (main.mainEntity ?? main.hasDefinedTerm) as unknown[];
    assert.equal(entries.length, page.count, page.path);
  }
  const glossary = await (await fetch(`${origin}/eacc-glossary`)).text();
  for (const id of ["decel", "doomer", "pdoom", "uacc"]) assert.match(glossary, new RegExp(`<li id="${id}">`));
  assert.equal((await fetch(`${origin}/eacc-unknown`)).status, 404);
  // Opening a concept page from the site's menu is a client-side navigation: it asks for the page's data.
  for (const path of ["/what-is-eacc", "/eacc-vs-dacc", "/eacc-glossary"]) {
    for (const query of ["", "?_routes=concept-" + path.slice(1)]) {
      const res = await fetch(`${origin}${path}.data${query}`);
      assert.equal(res.status, 200, `${path}.data${query}`);
      assert.match(await res.text(), new RegExp(`"slug".*"${path.slice(1)}"|${path.slice(1)}`), path);
    }
  }
  assert.equal((await fetch(`${origin}/eacc-unknown.data`)).status, 404);
});

test("navigation streams are plain text for download managers, including errors", async () => {
  for (const [pathname, status] of [["/_.data?_routes=root", 200], ["/items/missing.data", 404]] as const) {
    const res = await fetch(origin + pathname);
    assert.equal(res.status, status, pathname);
    assert.equal(res.headers.get("Content-Type"), "text/plain; charset=utf-8", pathname);
    assert.equal(res.headers.get("Content-Disposition"), null, pathname);
    assert.ok((await res.text()).length > 0, pathname);
  }
  const download = await fetch(origin + "/api/site/download");
  assert.equal(download.headers.get("Content-Type"), "text/markdown; charset=utf-8");
  assert.equal(download.headers.get("Content-Disposition"), 'attachment; filename="article.md"');
  assert.equal(await download.text(), "# Article");
});

// A tab opened before a page lost its loader still asks for that page's result, and its router rejects
// a missing one before React's release recovery can run.
test("a page without a loader still answers navigation with an empty result", async () => {
  const res = await fetch(`${origin}/terms.data?_routes=routes%2Fterms`);
  assert.equal(res.status, 200);
  const { value } = await UNSAFE_decodeViaTurboStream(res.body!, globalThis);
  const result = value as Record<string, { data: unknown }>;
  assert.ok("routes/terms" in result, "an already open router must be able to unwrap its requested route");
  assert.equal(result["routes/terms"]!.data, null);
});

test("missing routes cannot be hidden by a root-only request; errors and redirects stay uncached", async () => {
  for (const pathname of ["/items/missing.data?_routes=root", "/does-not-exist.data?_routes=root", "/items/missing"]) {
    const res = await fetch(origin + pathname);
    assert.equal(res.status, 404, pathname);
    assert.equal(res.headers.get("Cache-Control"), "private, no-store");
    assert.equal(res.headers.get("X-Accel-Expires"), "0");
    await res.text();
  }
  for (const [pathname, target] of [["/story/merged.data?_routes=root", "/story/surviving-story"], ["/_.data?q=search&_routes=root", "/all?q=search"]]) {
    const res = await fetch(origin + pathname);
    assert.equal(res.status, 202);
    assert.equal(res.headers.get("Cache-Control"), "private, no-store");
    assert.match(await res.text(), new RegExp(target.replace("?", "\\?")));
  }
});

test("admin data and actions never become public cache entries", async () => {
  const admin = await fetch(`${origin}/admin/sources.data?_routes=admin-layout`);
  assert.equal(admin.status, 202);
  assert.equal(admin.headers.get("Cache-Control"), "private, no-store");
  assert.equal(admin.headers.get("X-Accel-Expires"), "0");
  assert.match(await admin.text(), /api\/auth\/login/);
  const action = await fetch(`${origin}/hot.data`, { method: "POST" });
  assert.equal(action.status, 405);
  assert.equal(action.headers.get("Cache-Control"), "private, no-store");
  assert.equal(action.headers.get("X-Accel-Expires"), "0");
  await action.text();
});

test("slow sibling loaders and long-lived pages cannot enable language-dependent shared caches", async () => {
  metaDelayMs = 100;
  try {
    for (const pathname of ["/", "/_.data?_routes=routes%2Fhome", "/items/long-lived.data"]) {
      const res = await fetch(origin + pathname);
      assert.equal(res.status, 200);
      assert.equal(res.headers.get("Cache-Control"), "private, no-store");
      assert.equal(res.headers.get("X-Accel-Expires"), "0");
      await res.text();
    }
  } finally {
    metaDelayMs = 0;
  }
});

test("language cache isolation preserves noindex and private sign-in responses", async () => {
  const feedback = await fetch(origin + "/feedback");
  assert.equal(feedback.status, 200);
  assert.match(await feedback.text(), /name="robots" content="noindex/);
  assert.equal(feedback.headers.get("Cache-Control"), "private, no-store");
  const login = await fetch(origin + "/admin/login");
  assert.equal(login.status, 200);
  assert.equal(login.headers.get("Cache-Control"), "private, no-store");
  assert.equal(login.headers.get("X-Robots-Tag"), "noindex, nofollow");
  await login.text();
});

test("a visitor cannot name its own address to the api without a trusted proxy in front", async () => {
  const res = await fetch(`${origin}/api/site/echo-client`, { headers: { "X-Forwarded-For": "6.6.6.6", "X-Real-IP": "6.6.6.6" } });
  assert.deepEqual(await res.json(), { forwarded: "127.0.0.1", real: "127.0.0.1" });
});

 test("API, feeds and static assets keep their own cache policy", async () => {
  const apiResponse = await fetch(origin + "/api/site/cache-example", { headers: { cookie: "eacc_language=zh" } });
  assert.equal(apiResponse.headers.get("Cache-Control"), "public, max-age=30, s-maxage=60");
  const feed = await fetch(origin + "/feed/picks.xml");
  assert.equal(feed.headers.get("Cache-Control"), "public, max-age=60");
  assert.equal(await feed.text(), "<rss/>");
  const icon = await fetch(origin + "/media/art/epochs/sapiens-language-800.webp");
  assert.equal(icon.headers.get("Cache-Control"), "public, max-age=3600");
});

 test("product directory lists upcoming products with logos and no product links", async () => {
  const res = await fetch(origin + "/products", { headers: { "Accept-Language": "en" } });
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /Built to accelerate/);
  assert.match(html, /RoboLabX/);
  assert.match(html, /src="\/media\/products\/twin.svg"/);
  assert.match(html, /Coming soon/);
  assert.doesNotMatch(html, /twin\.e-acc\.ai|k12\.e-acc\.ai|github\.com\/seasonsolt\/(twin|tachi|lancer|skills)/);
  assert.doesNotMatch(html, /AudioStudio|Retake|seasonsolt\/legal/i);
  assert.match(html, /rel="canonical" href="[^"]+\/products"/);
});

test("public URLs and Router data stay English despite Chinese cookies and browser language", async () => {
  for (const path of ["/", "/all", "/items/native-en", "/weekly", "/monthly", "/topics/robots", "/about"]) {
    const headers = { Cookie: "eacc_language=zh; admin_session=private", "Accept-Language": "zh-CN" };
    const htmlResponse = await fetch(origin + path, { headers });
    assert.equal(htmlResponse.status, 200, path);
    const document = parseHTML(await htmlResponse.text()).document;
    assert.equal(document.documentElement.lang, "en", path);
    const dataPath = path === "/" ? "/_.data" : `${path}.data`;
    const response = await fetch(origin + dataPath + "?_routes=root", { headers });
    assert.equal(response.status, 200, dataPath);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    const decoded = (await UNSAFE_decodeViaTurboStream(response.body!, globalThis)).value as { root: { data: { locale: string } } };
    assert.equal(decoded.root.data.locale, "en", dataPath);
  }
});

test("Chinese menu links request working data routes with distinct IDs and explicit API language", async () => {
  const response = await fetch(origin + "/zh", { headers: { Cookie: "eacc_language=en", "Accept-Language": "en-US" } });
  const document = parseHTML(await response.text()).document;
  assert.equal(document.documentElement.lang, "zh-CN");
  for (const path of ["/zh/all", "/zh/topics", "/zh/subscribe", "/zh/about", "/zh/changelog", "/what-is-eacc"]) {
    assert.ok(document.querySelector(`a[href="${path}"]`), path);
    const before = apiRequests.length;
    const data = await fetch(origin + path + ".data?_routes=root");
    assert.equal(data.status, 200, path);
    const body = await data.text();
    if (path !== "/zh/subscribe") assert.match(body, path.startsWith("/zh/") ? /zh-routes|zh-concept/ : /concept-what-is-eacc/);
    const publicReads = apiRequests.slice(before).filter((url) => url.startsWith("/api/site/"));
    assert.ok(publicReads.every((url) => new URL(url, origin).searchParams.get("lang") === (path.startsWith("/zh/") ? "zh" : "en")), path);
  }
  for (const path of ["/zh.data", "/zh/_.data"]) {
    const response = await fetch(origin + path + "?_routes=root");
    assert.equal(response.status, 200, path);
    assert.match(await response.text(), /zh-routes\/home/);
  }
});

test("report kind, topic pagination and redirects retain Chinese paths in HTML and data", async () => {
  for (const [kind, key] of [["weekly", "2026-W39"], ["monthly", "2026-09"]]) {
    const before = apiRequests.length;
    for (const suffix of ["", ".data?_routes=root"]) {
      const response = await fetch(`${origin}/zh/${kind}/${key}${suffix}`);
      assert.equal(response.status, 200);
      assert.match(await response.text(), /中文报告/);
    }
    assert.ok(apiRequests.slice(before).some((path) => path.startsWith(`/api/site/reports/${kind}/${key}?lang=zh`)));
    assert.ok(!apiRequests.slice(before).some((path) => path.startsWith("/api/site/reports/daily")));
  }
  const topic = parseHTML(await (await fetch(origin + "/zh/topics/robots/page/2")).text()).document;
  assert.ok(topic.querySelector('a[href="/zh/topics/robots"]'));
  assert.match(topic.querySelector('link[rel="canonical"]')!.getAttribute("href")!, /\/zh\/topics\/robots\/page\/2$/);
  for (const [path, target, status] of [["/zh/topics/robots/page/1?q=robot", "/zh/topics/robots?q=robot", 308], ["/zh?q=robot", "/zh/all?q=robot", 302], ["/zh/story/merged", "/zh/story/surviving-story", 308], ["/zh/all/?q=robot", "/zh/all?q=robot", 301]] as const) {
    const response = await fetch(origin + path, { redirect: "manual" });
    assert.equal(response.status, status, path);
    assert.equal(response.headers.get("location"), target, path);
    const url = new URL(path, origin);
    const data = await fetch(origin + `${url.pathname === "/zh" ? "/zh/_.data" : url.pathname + ".data"}${url.search}`);
    assert.equal(data.status, 202, path);
    assert.ok((await data.text()).includes(target), path);
  }
});

test("native English originals do not carry a pending marker and fallback language is honest", async () => {
  const english = parseHTML(await (await fetch(origin + "/items/native-en")).text()).document;
  assert.doesNotMatch(english.querySelector("main")!.textContent!, /edition pending/);
  assert.equal(english.querySelector('article[lang="en"]')?.getAttribute("lang"), "en");
  assert.equal(english.querySelector('meta[property="og:locale"]')?.getAttribute("content"), "en");
  assert.equal(jsonLd(english.toString()).find((value) => value["@type"] === "NewsArticle")!.inLanguage, "en");
  assert.equal(alternate(english, "zh-CN"), undefined);
  const fallback = parseHTML(await (await fetch(origin + "/items/legacy-zh")).text()).document;
  assert.match(fallback.querySelector("main")!.textContent!, /English edition pending/);
  assert.equal(fallback.querySelector('meta[property="og:locale"]')?.getAttribute("content"), "zh_CN");
  assert.equal(fallback.querySelector('article[lang="zh-CN"]')?.getAttribute("lang"), "zh-CN");
  assert.equal(alternate(fallback, "zh-CN"), undefined);
  const chineseFallback = parseHTML(await (await fetch(origin + "/zh/items/native-en")).text()).document;
  assert.match(chineseFallback.querySelector("main")!.textContent!, /中文版本尚未就绪/);
  assert.equal(chineseFallback.querySelector('meta[property="og:locale"]')?.getAttribute("content"), "en");
});

test("existing editions have reciprocal hreflang, self canonicals and localized structured URLs", async () => {
  for (const prefix of ["", "/zh"]) {
    const response = await fetch(origin + prefix + "/items/bilingual");
    const html = await response.text();
    const document = parseHTML(html).document;
    assert.match(document.querySelector('link[rel="canonical"]')!.getAttribute("href")!, new RegExp(`${prefix}/items/bilingual$`));
    assert.match(alternate(document, "en")!.getAttribute("href")!, /(?<!\/zh)\/items\/bilingual$/);
    assert.match(alternate(document, "zh-CN")!.getAttribute("href")!, /\/zh\/items\/bilingual$/);
    assert.match(alternate(document, "x-default")!.getAttribute("href")!, /(?<!\/zh)\/items\/bilingual$/);
    const article = jsonLd(html).find((entry) => entry["@type"] === "NewsArticle")!;
    assert.equal(article.inLanguage, prefix ? "zh-CN" : "en");
    assert.match(String(article.url), new RegExp(`${prefix}/items/bilingual$`));
  }
});

test("concepts have no Chinese mirrors and legal pages disclose the preserved Chinese template", async () => {
  for (const path of ["/what-is-eacc", "/eacc-vs-dacc", "/eacc-glossary"]) {
    const response = await fetch(origin + path);
    const document = parseHTML(await response.text()).document;
    assert.equal(alternate(document, "zh-CN"), undefined);
    assert.equal(document.querySelector('option[value="zh"]')?.hasAttribute("disabled"), true);
    assert.equal((await fetch(origin + "/zh" + path)).status, 404);
    assert.equal((await fetch(origin + "/zh" + path + ".data?_routes=root")).status, 404);
  }
  for (const path of ["/terms", "/privacy"]) {
    const english = parseHTML(await (await fetch(origin + path)).text()).document;
    assert.match(english.querySelector("main")!.textContent!, /This document is available in Chinese/);
    assert.ok(english.querySelector('.prose[lang="zh-CN"]'));
    assert.equal(alternate(english, "zh-CN"), undefined);
    assert.equal(english.querySelector('meta[property="og:locale"]')?.getAttribute("content"), "zh_CN");
    assert.equal((await fetch(origin + "/zh" + path + ".data?_routes=root")).status, 200);
  }
  for (const path of ["/zh/admin/login", "/zh/api/site/meta", "/zh/assets/unknown.js"]) assert.equal((await fetch(origin + path)).status, 404);
  const admin = parseHTML(await (await fetch(origin + "/admin/login")).text()).document;
  assert.equal(admin.documentElement.lang, "zh-CN");
});

test("English public UI and empty states use English copy", async () => {
  for (const path of ["/", "/all", "/topics", "/topics/robots", "/about", "/products", "/more", "/subscribe", "/daily", "/weekly", "/monthly", "/daily/2026-09-01"]) {
    const response = await fetch(origin + path);
    assert.equal(response.status, 200, path);
    const document = parseHTML(await response.text()).document;
    const text = document.querySelector("main")!.textContent!;
    const remaining = text.match(/.{0,20}[\p{Script=Han}].{0,20}/gu) ?? [];
    assert.deepEqual(remaining, [], path);
    for (const copy of [document.title, document.querySelector('meta[name="description"]')?.getAttribute("content") ?? ""]) {
      assert.deepEqual(copy.match(/.{0,20}[\p{Script=Han}].{0,20}/gu) ?? [], [], `${path} metadata`);
    }
  }
});


test("actual returned language takes precedence over canonical language for readiness and body labels", async () => {
  const ready = parseHTML(await (await fetch(origin + "/items/actual-en")).text()).document;
  assert.doesNotMatch(ready.querySelector("main")!.textContent!, /edition pending/);
  assert.equal(ready.querySelector('meta[property="og:locale"]')?.getAttribute("content"), "en");
  assert.equal(ready.querySelector('.prose[lang="en"]')?.getAttribute("lang"), "en");
  const unknown = parseHTML(await (await fetch(origin + "/items/unknown-body")).text()).document;
  assert.match(unknown.querySelector("main")!.textContent!, /language unverified/);
  assert.equal(unknown.querySelector('.prose[lang="und"]')?.getAttribute("lang"), "und");
  const foreign = parseHTML(await (await fetch(origin + "/items/foreign-body")).text()).document;
  assert.match(foreign.querySelector("main")!.textContent!, /Body · English edition pending/);
  assert.equal(foreign.querySelector('.prose[lang="fr"]')?.getAttribute("lang"), "fr");
});


test("report metadata and masthead expose the stored opt-in calendar without a fixed offset claim", async () => {
  for (const path of ["/daily", "/zh/daily", "/daily/2026-09-01"]) {
    const html = await (await fetch(`${origin}${path}`)).text();
    assert.match(html, /America\/New_York/);
    assert.doesNotMatch(html, /UTC\+8/);
  }
});


test("RSS discovery and footer links use the actual versioned language endpoint", async () => {
  for (const [path, feed] of [["/", "/feed/v2/picks.xml"], ["/zh", "/feed/v2/zh/picks.xml"]]) {
    const { document } = parseHTML(await (await fetch(`${origin}${path}`)).text());
    assert.equal(document.querySelector('link[type="application/rss+xml"]')!.getAttribute("href"), feed);
    assert.equal([...document.querySelectorAll("footer a")].find(link => link.textContent === "RSS")!.getAttribute("href"), feed);
  }
});


test('More RSS links select the same versioned language as the URL', async () => {
  for (const [path, feed] of [['/more','/feed/v2/picks.xml'],['/zh/more','/feed/v2/zh/picks.xml']]) {
    const { document } = parseHTML(await (await fetch(origin + path)).text());
    assert.equal([...document.querySelectorAll('main a')].find(link => link.textContent === 'RSS')!.getAttribute('href'),feed);
  }
});


test('mixed historical story developments render with an honest pending notice in each URL edition', async () => {
  for(const [path,notice] of [['/story/mixed-story','English edition pending'],['/zh/story/mixed-story','中文版本尚未就绪']]) {
    const response=await fetch(origin+path); assert.equal(response.status,200);
    const main=parseHTML(await response.text()).document.querySelector('main')!;
    assert.ok(main.textContent!.includes(notice)); assert.match(main.textContent!,/历史事实 1/); assert.match(main.textContent!,/历史事实 2/);
  }
});
