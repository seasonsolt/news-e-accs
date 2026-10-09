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
import { releaseBoundCache } from "../app/lib/api.server.ts";

const seoSource = { id: "src", name: "示例媒体", kind: "rss", firstParty: false, iconUrl: null };
const seoItem = {
  id: "seo-sample", revision: 1, title: "示例标题", originalTitle: null, summary: "示例摘要", reason: null, source: seoSource,
  links: { aihot: "/items/seo-sample", original: "https://example.com/report" }, publishedAt: "2026-10-09T01:00:00.000Z",
  discoveredAt: "2026-10-09T01:05:00.000Z", timelineAt: "2026-10-09T01:05:00.000Z", category: null, tags: ["开源"], score: null,
  selected: true, channel: "news", story: null, x: null, readingMode: "summary-only", author: null, language: "zh", body: null,
  outline: [], relatedStories: [], indexable: true, markdownAvailable: false, group: null, hasTranslation: false, bodyLanguage: "zh",
};
const seoStory = {
  publicId: "seo-story", title: "示例事件", status: "active", reportCount: 2, sourceCount: 2, firstReportAt: "2026-10-08T00:00:00.000Z",
  latestAt: "2026-10-09T00:00:00.000Z", digest: "事件综述", digestUpdatedAt: null, summary: null, excerpt: null, latest: null,
  whyHot: { participants48h: 0, newParticipants6h: 0, recentReports24h: 0, observationComplete: true, rank: null, heat: null },
  developments: [], officialReports: [], timeline: [], heat: [], related: [],
};

/** The JSON-LD entries of a rendered page. */
function jsonLd(html: string): Array<Record<string, unknown>> {
  return [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].flatMap((m) => [JSON.parse(m[1]!)].flat());
}

let web: ChildProcess;
let origin: string;
let logs = "";
let deadline: number;
let refreshAt: string;
let metaDelayMs = 0;
const apiCookies: Array<string | undefined> = [];
const api = createServer((req, res) => {
  const url = new URL(req.url!, "http://api.local");
  apiCookies.push(req.headers.cookie);
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
  if (url.pathname === "/api/site/echo-client") return res.end(JSON.stringify({ forwarded: req.headers["x-forwarded-for"], real: req.headers["x-real-ip"] }));
  if (url.pathname === "/api/site/items/long-lived") return res.end(JSON.stringify({ id: "long-lived", title: "t" }));
  if (url.pathname === "/api/site/items/seo-sample") return res.end(JSON.stringify(seoItem));
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

test("interface preferences isolate HTML and Router data while public content stays anonymous", async () => {
  const english = await fetch(`${origin}/`, { headers: { "Accept-Language": "en-US" } });
  const englishHtml = await english.text();
  assert.equal(english.status, 200);
  assert.match(englishHtml, /<html lang="en"/);
  assert.match(englishHtml, /The universe is cooling/);
  assert.doesNotMatch(englishHtml, /English editions appear when available/);
  const chinese = await fetch(`${origin}/`, { headers: { "Accept-Language": "zh-TW,en;q=0.8" } });
  const chineseHtml = await chinese.text();
  assert.match(chineseHtml, /<html lang="zh-CN"/);
  assert.match(chineseHtml, /宇宙在降温/);
  // The front page's h1 is what readers search for; the line under it is display copy.
  assert.match(chineseHtml, /<h1 class="deck-heading">AI 日报 · 今日人工智能新闻精选与热点<\/h1>/);
  assert.match(chineseHtml, /<p class="deck-title">宇宙在降温/);
  assert.match(englishHtml, /<h1 class="deck-heading">AI daily news · today&#x27;s top AI stories and trends<\/h1>/);
  assert.match(chineseHtml, /"@type":"WebSite"/);
  // The acceleration (/chronicle) is the signature view: second in the top bar and a tab on phones.
  assert.match(chineseHtml, /aria-label="底部导航"[\s\S]*?href="\/chronicle"[^>]*>[\s\S]*?<span>加速史<\/span>/);
  assert.match(englishHtml, /Explore the acceleration/);
  assert.notEqual(chineseHtml, englishHtml);
  const manual = await fetch(`${origin}/`, { headers: { "Accept-Language": "zh-CN", Cookie: "eacc_language=en; admin_session=private" } });
  assert.match(await manual.text(), /<html lang="en"/);
  for (const res of [english, chinese, manual]) {
    assert.equal(res.headers.get("Cache-Control"), "private, no-store");
    assert.equal(res.headers.get("X-Accel-Expires"), "0");
    assert.match(res.headers.get("Vary")!, /Accept-Language/);
    assert.match(res.headers.get("Vary")!, /Cookie/);
    assert.equal(res.headers.get("Set-Cookie"), null);
  }
  const plain = await fetch(`${origin}/about.data`);
  const signedIn = await fetch(`${origin}/about.data?_routes=root`, { headers: { cookie: "admin_session=private; aihot_vid=reader" } });
  assert.equal(plain.headers.get("Cache-Control"), "private, no-store");
  assert.equal(signedIn.headers.get("Set-Cookie"), null);
  assert.equal(await signedIn.text(), await plain.text());
  const localized = await fetch(`${origin}/about.data`, { headers: { cookie: "eacc_language=zh" } });
  assert.match(await localized.text(), /"locale".*"zh"/);
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
  const zh=await fetch(`${origin}/changelog`,{headers:{"Accept-Language":"en",cookie:"eacc_language=zh"}});
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
  const event = jsonLd(await story.text()).find((e) => e["@type"] === "NewsArticle")!;
  assert.equal(event.datePublished, "2026-10-08T00:00:00.000Z");
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
    const main = jsonLd(html).find((e) => e["@type"] === page.type)!;
    assert.ok(main, `${page.path} ${page.type}`);
    assert.equal((main.about as { name: string }).name, "Effective accelerationism");
    const entries = (main.mainEntity ?? main.hasDefinedTerm) as unknown[];
    assert.equal(entries.length, page.count, page.path);
  }
  const glossary = await (await fetch(`${origin}/eacc-glossary`)).text();
  for (const id of ["decel", "doomer", "pdoom", "uacc"]) assert.match(glossary, new RegExp(`<li id="${id}">`));
  assert.equal((await fetch(`${origin}/eacc-unknown`)).status, 404);
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
  assert.match(await admin.text(), /admin\/login/);
  const action = await fetch(`${origin}/hot.data`, { method: "POST" });
  assert.equal(action.status, 405);
  assert.equal(action.headers.get("Cache-Control"), "private, no-store");
  assert.equal(action.headers.get("X-Accel-Expires"), "0");
  await action.text();
});

test("an elapsed release deadline cannot be extended by a fresh page/data response", async () => {
  const saved = refreshAt;
  refreshAt = new Date(Date.now() - 1000).toISOString();
  try {
    for (const pathname of ["/", "/_.data?_routes=routes%2Fhome"]) {
      const res = await fetch(origin + pathname);
      assert.equal(res.status, 200);
      assert.equal(res.headers.get("Cache-Control"), "private, no-store");
      assert.equal(res.headers.get("X-Accel-Expires"), "0");
      await res.text();
    }
  } finally {
    refreshAt = saved;
  }
  const now = Date.parse("2026-09-28T00:00:00Z");
  const upstream = new Headers({ "X-Accel-Expires": `@${now / 1000 + 7}` });
  const headers = releaseBoundCache(new Date(now + 20_000).toISOString(), 30, now + 2_000, upstream);
  assert.equal(headers["Cache-Control"], "public, max-age=0, s-maxage=5");
  assert.equal(headers["X-Accel-Expires"], upstream.get("X-Accel-Expires"));
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
