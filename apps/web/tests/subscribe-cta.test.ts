// The inline subscribe form is part of the server HTML, after the digest, in both editions.
// It adds no image and no second copy of the form (the phone bar mounts only after scrolling).
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, before, test } from "node:test";
import { parseHTML } from "linkedom";
import type { FeedItemSummary, ReportCitation, ReportDetail, ReportKind, SiteItemDetail } from "@aihot/contracts/site";
import { subscribeErrorReason } from "@aihot/contracts/subscribe";
import { readFileSync } from "node:fs";
import { claimSubscribeView } from "../app/features/subscribe/claim.ts";
import { requestSubscribe } from "../app/features/subscribe/flow.ts";
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
  const home = readFileSync(new URL("routes/home.tsx", root), "utf8");
  assert.match(onboarding, /const locale = useLocale\(\)/);
  assert.match(onboarding, /requestSubscribe\(email, locale\)/);
  assert.match(cta, /const locale = useLocale\(\)/);
  assert.match(cta, /requestSubscribe\(email, locale\)/);
  assert.match(home, /<Link to="\/subscribe"/);
  const bodies: unknown[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    bodies.push(JSON.parse(String(init?.body)));
    return new Response("{}", { status: 202 });
  };
  try {
    assert.equal(await requestSubscribe("reader@example.com", "en"), null);
    assert.equal(await requestSubscribe("reader@example.com", "zh"), null);
  } finally {
    globalThis.fetch = original;
  }
  assert.deepEqual(bodies, [
    { email: "reader@example.com", language: "en" },
    { email: "reader@example.com", language: "zh" },
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
const api = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://local");
  res.setHeader("Content-Type", "application/json");
  const send = (value: unknown) => res.end(JSON.stringify(value));
  if (url.pathname === "/api/site/meta") return send({ changelogVersion: null });
  if (url.pathname === `/api/site/items/${item.id}`) return send(detail);
  if (url.pathname === "/api/site/next-reads") return send({ daily: { key: "2026-10-04", issueNumber: 12, title: "测试刊物", count: 2 }, hot: [] });
  const match = /^\/api\/site\/reports\/(daily|weekly|monthly)\/(.+)$/.exec(url.pathname);
  if (match) {
    const r = report(match[1] as ReportKind);
    const index = [{ key: r.key, issueNumber: r.issueNumber, title: r.lead?.title ?? r.title, count: 2 }];
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
