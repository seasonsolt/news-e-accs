// The inline subscribe form is part of the server HTML, after the digest, in both editions.
// It adds no image and no second copy of the form (the phone bar mounts only after scrolling).
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, before, test } from "node:test";
import { chromium } from "@playwright/test";
import { parseHTML } from "linkedom";
import type { FeedItemSummary, ReportCitation, ReportDetail, ReportKind, SiteItemDetail } from "@aihot/contracts/site";
import { subscribeErrorReason, subscribeSource, SUBSCRIBE_SOURCES } from "@aihot/contracts/subscribe";
import { readFileSync } from "node:fs";
import { claimSubscribeView } from "../app/features/subscribe/claim.ts";
import { requestConfirm, requestSubscribe } from "../app/features/subscribe/flow.ts";
import { startWebServer, type WebServer } from "./web-server.ts";

const at = "2026-10-04T00:00:00.000Z";
const item: FeedItemSummary = {
  id: "subscribe-cta-item", title: "可核实的测试报道", summary: "报道摘要", reason: null,
  source: { name: "Fixture" }, publishedAt: at, timelineAt: at, category: "ai-models", tags: [], score: 80, selected: true, channel: "news", x: null,
};
const detail: SiteItemDetail = {
  ...item, x: null, originalTitle: null, links: { original: "https://example.org/report" }, discoveredAt: at,
  story: null, readingMode: "full", author: null, body: { zh: "<p>可核实的测试正文。</p>", original: "<p>A verifiable test body.</p>", zhKind: "original", complete: true },
  outline: [], relatedStories: [], topics: [], indexable: true, markdownAvailable: false, group: null, hasTranslation: false, bodyLanguage: "zh", language: "zh",
};
const citation = (): ReportCitation => ({
  itemId: item.id, title: item.title, summary: item.summary, sourceName: item.source.name, sourceUrl: detail.links.original,
  sourceIconUrl: null, firstParty: true, publishedAt: at, available: true,
});
const report = (kind: ReportKind): ReportDetail => ({
  kind, key: kind === "daily" ? "2026-10-04" : kind === "weekly" ? "2026-W40" : "2026-10", issueNumber: 12,
  title: "测试刊物", windowStart: at, windowEnd: at, generatedAt: at,
  lead: { title: "本期已验证的重要变化", leadParagraph: "本期的导读与依据。" }, leadItemId: item.id, overview: null,
  highlights: [citation()], sections: [{ label: "模型", summary: null, items: [citation()] }], flashes: [], cover: null,
  metrics: {}, readingMinutes: 4, prev: kind === "daily" ? "2026-10-03" : null, next: null,
});

test("every subscribe form posts the page locale", async () => {
  const root = new URL("../app/", import.meta.url);
  const onboarding = readFileSync(new URL("features/onboarding/Onboarding.tsx", root), "utf8");
  const cta = readFileSync(new URL("features/subscribe/SubscribeCta.tsx", root), "utf8");
  const home = readFileSync(new URL("features/feed/FeedDeck.tsx", root), "utf8");
  assert.match(onboarding, /const locale = useLocale\(\)/);
  assert.match(onboarding, /requestSubscribe\(email, locale, source\)/);
  assert.match(cta, /const locale = useLocale\(\)/);
  assert.match(cta, /requestSubscribe\(email, locale, source\)/);
  assert.match(home, /<Link to="\/subscribe"/);
  assert.match(onboarding, /function finish\(dismiss: boolean\)/);
  assert.match(onboarding, /if \(dismiss\) recordSubscribe\("subscribe_dismiss"/);
  assert.match(onboarding, /先不订阅，直接看新闻 →"\), false, true\)/);
  assert.doesNotMatch(onboarding, /先去看看今天的新闻"\), true, true\)/);
  const view = readFileSync(new URL("features/subscribe/useSubscribeView.ts", root), "utf8");
  assert.match(view, /useLocation\(\)\.pathname/);
  assert.match(cta, /useLocation\(\)\.pathname/);
  assert.doesNotMatch(view, /useLocation\(\)\.key/);
  assert.doesNotMatch(cta, /useLocation\(\)\.key/);
  const bodies: unknown[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    bodies.push(JSON.parse(String(init?.body)));
    return new Response("{}", { status: 202 });
  };
  try {
    assert.equal(await requestSubscribe("reader@example.com", "en", "concept"), null);
    assert.equal(await requestSubscribe("reader@example.com", "zh", "story_inline"), null);
  } finally {
    globalThis.fetch = original;
  }
  assert.deepEqual(bodies, [
    { email: "reader@example.com", language: "en", source: "concept" },
    { email: "reader@example.com", language: "zh", source: "story_inline" },
  ]);
});

test("a subscribe view is counted once per page view, and a failure reason stays a class", () => {
  assert.equal(claimSubscribeView("page-a", "daily_inline", "zh"), true);
  assert.equal(claimSubscribeView("page-a", "daily_inline", "zh"), false);
  assert.equal(claimSubscribeView("page-a", "daily_inline", "en"), true);
  assert.equal(claimSubscribeView("page-b", "daily_inline", "zh"), true);
  assert.equal(subscribeErrorReason(429, { retryAfter: 3600 }), "cap");
  assert.equal(subscribeErrorReason(503), "503");
});

let web: WebServer;
let latestFails = false;
const api = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://local");
  res.setHeader("Content-Type", "application/json");
  const send = (value: unknown) => res.end(JSON.stringify(value));
  if (url.pathname === "/api/site/stories/subscribe-story") return send({
    publicId: "subscribe-story", title: "事件标题", status: "active", reportCount: 0, sourceCount: 0,
    firstReportAt: at, latestAt: at, digest: "事件综述", digestUpdatedAt: null, summary: null, excerpt: null, latest: null,
    whyHot: { participants48h: 0, newParticipants6h: 0, recentReports24h: 0, observationComplete: true, rank: null, heat: null },
    developments: [], officialReports: [], timeline: [], heat: [], related: [], topics: [], latestReport: null,
  });
  if (url.pathname === "/api/site/meta") return send({ changelogVersion: null });
  if (url.pathname === `/api/site/items/${item.id}`) return send(detail);
  if (url.pathname === "/api/site/next-reads") return send({ daily: { key: "2026-10-04", issueNumber: 12, title: "测试刊物", count: 2 }, hot: [] });
  const match = /^\/api\/site\/reports\/(daily|weekly|monthly)\/(.+)$/.exec(url.pathname);
  if (match) {
    const r = report(match[1] as ReportKind);
    const index = [{ key: r.key, issueNumber: r.issueNumber, title: r.lead?.title ?? r.title, count: 2 }];
    if (match[2] === "latest-page" && latestFails) { res.statusCode = 503; return send({ code: "temporarily_unavailable" }); }
    if (match[2] === "latest-page") return send({ report: r, index });
    if (match[2]?.startsWith("navigation/")) return send({ items: index });
    if (match[2] === r.key) return send(r);
  }
  res.statusCode = 404;
  send({ code: "not_found" });
});

before(async () => { web = await startWebServer(api); });
after(async () => { await web?.stop(); });

async function page(path: string) {
  const response = await fetch(`${web.origin}${path}`);
  assert.equal(response.status, 200, web.logs());
  return { html: await response.text(), robots: response.headers.get("x-robots-tag") };
}

function ctaOf(html: string, source: string) {
  const { document } = parseHTML(html);
  const cta = document.querySelector(`[data-subscribe-cta=${source}]`);
  assert.ok(cta, source);
  const input = cta.querySelector("input[type=email]");
  // React prints the DOM property name; browsers lowercase it to autocomplete when parsing HTML.
  assert.match(input?.outerHTML ?? "", /autocomplete="email"/i);
  assert.match(input?.className ?? "", /text-\[16px\]/);
  assert.equal(cta.querySelector("img"), null);
  assert.equal(document.querySelector("[data-subscribe-sticky]"), null);
  return cta;
}

test("daily and item pages render the subscribe form after the piece, and weekly does not", async () => {
  const daily = await page("/zh/daily");
  assert.equal(daily.html.indexOf("（本期完）") < daily.html.indexOf('data-subscribe-cta="daily_inline"'), true);
  const dailyCta = ctaOf(daily.html, "daily_inline");
  assert.match(dailyCta.textContent ?? "", /明早 08:00 把这样一份日报发到你邮箱/);
  assert.equal(dailyCta.querySelector("a")?.getAttribute("href"), "/zh/daily/2026-10-03");
  assert.doesNotMatch(daily.html, /noindex/);

  const english = await page("/daily/2026-10-04");
  const englishCta = ctaOf(english.html, "daily_inline");
  assert.match(englishCta.textContent ?? "", /Tomorrow at 08:00, a briefing like this arrives in your inbox\./);
  assert.equal(englishCta.querySelector("a")?.getAttribute("href"), "/daily/2026-10-03");
  assert.doesNotMatch(english.html, /noindex/);

  const story = await page(`/zh/items/${item.id}`);
  assert.equal(story.html.indexOf("可核实的测试正文") < story.html.indexOf('data-subscribe-cta="item_inline"'), true);
  const storyCta = ctaOf(story.html, "item_inline");
  assert.equal(storyCta.querySelector("a")?.getAttribute("href"), "/zh/daily/2026-10-04");

  const weekly = await page("/weekly");
  assert.doesNotMatch(weekly.html, /data-subscribe-cta/);
});


test("confirmation only reports the backend's first transition with its source and language", async () => {
  const original = globalThis.fetch;
  const oldWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { value: {}, configurable: true });
  const events: unknown[] = [];
  let first = true;
  globalThis.fetch = async (url, init) => {
    if (url === "/api/site/events") {
      events.push(JSON.parse(String(init?.body)));
      return new Response(null, { status: 204 });
    }
    return Response.json({ ok: true, first, language: "zh", source: "concept" });
  };
  try {
    await requestConfirm("token");
    first = false;
    await requestConfirm("token");
    assert.deepEqual(events, [{ event: "subscribe_confirmed", target: "concept:zh" }]);
  } finally {
    globalThis.fetch = original;
    if (oldWindow) Object.defineProperty(globalThis, "window", oldWindow);
    else Reflect.deleteProperty(globalThis, "window");
  }
});

test("concept subscription and latest sample keep the page language", async () => {
  for (const prefix of ["", "/zh"]) {
    const { html } = await page(`${prefix}/what-is-eacc`);
    const { document } = parseHTML(html);
    assert.ok(document.querySelector(`a[href="${prefix}/subscribe?from=concept"]`));
    assert.ok(document.querySelector(`a[href="${prefix}/daily/2026-10-04"]`));
  }
});


test("story pages offer the daily subscription after the timeline", async () => {
  for (const prefix of ["", "/zh"]) {
    const { html } = await page(`${prefix}/story/subscribe-story`);
    const cta = ctaOf(html, "story_inline");
    assert.equal(cta.querySelector("a")?.getAttribute("href"), `${prefix}/daily`);
    assert.ok(html.includes('id="event-reports"'));
    assert.ok(html.indexOf('id="event-reports"') < html.indexOf('data-subscribe-cta="story_inline"'));
  }
});

test("confirmed page delivers the confirmed language's daily and tolerates a missing issue", async () => {
  const browser = await chromium.launch({ channel: "chromium" });
  try {
    const tab = await browser.newPage();
    let available = true;
    const languages: string[] = [];
    await tab.route("**/api/site/newsletter/confirm", (route) => route.fulfill({ json: { ok: true, first: false, language: "zh", source: "concept" } }));
    await tab.route("**/api/site/reports/daily/latest-page?*", (route) => {
      languages.push(new URL(route.request().url()).searchParams.get("lang")!);
      return route.fulfill({ json: { report: available ? { ...report("daily"), highlights: Array.from({ length: 5 }, () => citation()) } : null, index: [] } });
    });
    // The letter links the confirmation page in the requested language (confirmUrl), so the page locale matches.
    await tab.goto(`${web.origin}/zh/subscribe?token=test`);
    await tab.locator('a[href="/zh/daily/2026-10-04"]').waitFor();
    assert.equal(await tab.locator('[role="status"] li').count(), 3);
    assert.equal(await tab.locator('[role="status"]').getByText("本期已验证的重要变化").count(), 1);
    available = false;
    await tab.reload();
    await tab.locator('[role="status"] a[href="/zh/daily"]').waitFor();
    assert.equal(await tab.locator('[role="status"] li').count(), 0);
    assert.ok(languages.length >= 2 && languages.every((language) => language === "zh"));
  } finally { await browser.close(); }
});


test("subscribe from parameters accept only the source whitelist", () => {
  for (const source of SUBSCRIBE_SOURCES) assert.equal(subscribeSource(source), source);
  for (const value of [null, undefined, "", "private@example.org", "CONCEPT", {}, ["concept"]]) assert.equal(subscribeSource(value), null);
});

test("subscription page shows a deduplicated real issue and an explicit language before signup", async () => {
  for (const prefix of ["", "/zh"]) {
    const { document } = parseHTML((await page(`${prefix}/subscribe?from=concept`)).html);
    assert.ok(document.querySelector('a[href="'+prefix+'/daily/2026-10-04"]'));
    assert.equal(document.querySelectorAll('section[aria-labelledby="sample-title"] li').length, 1);
    assert.ok(document.querySelector('[data-subscribe-page-form] button[type=submit]')?.textContent?.includes(prefix ? "免费订阅日报" : "Subscribe for free"));
    assert.ok(document.querySelector(`a[href="${prefix ? '' : '/zh'}/subscribe?from=concept"]`));
    assert.equal(document.querySelector('video'), null);
  }
});

test("the subscription form still renders when the sample issue cannot be read", async () => {
  latestFails = true;
  try {
    const { document } = parseHTML((await page("/zh/subscribe")).html);
    assert.ok(document.querySelector("[data-subscribe-page-form] #subscribe-page-email"));
  } finally { latestFails = false; }
});

test("subscription page submits the selected language and preserves attribution, with visible errors and confirmation instructions", async () => {
  const browser = await chromium.launch({ channel: "chromium" });
  try {
    for (const prefix of ["", "/zh"]) {
      const tab = await browser.newPage();
      await tab.route("**/api/site/engagement", (route) => route.fulfill({ status: 204 }));
      const bodies: unknown[] = [];
      await tab.route("**/api/site/newsletter/subscribe", (route) => {
        bodies.push(route.request().postDataJSON());
        return route.fulfill(bodies.length === 1 ? { status: 503, json: { detail: "暂时无法完成，请稍后再试。" } } : { status: 202, json: { ok: true } });
      });
      await tab.goto(`${web.origin}${prefix}/subscribe?from=concept`);
      await tab.locator('#subscribe-page-email').fill('reader@example.com');
      await tab.locator('[data-subscribe-page-form] button[type=submit]').click();
      await tab.locator('[data-subscribe-page-form] [role=alert]').waitFor();
      await tab.locator('[data-subscribe-page-form] button[type=submit]').click();
      await tab.locator('[data-subscribe-page-form] [role=status]').waitFor();
      assert.deepEqual(bodies, Array(2).fill({ email: 'reader@example.com', language: prefix ? 'zh' : 'en', source: 'concept' }));
      assert.match(await tab.locator('[data-subscribe-page-form] [role=status]').innerText(), /reader@example.com/);
      await tab.close();
    }
  } finally { await browser.close(); }
});
