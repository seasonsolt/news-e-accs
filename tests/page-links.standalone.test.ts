// What an article and an event page show readers and search engines about where else to go, written before
// the change from the ways it can go wrong:
// - an article a daily carries does not link to that daily, names its date
//   otherwise than the site names issues, or calls itself the lead of an issue that leads with another;
// - an article's tags send readers and crawlers to filtered lists that search engines are kept from although
//   a topic page covers the tag, or a tag repeats the topic chip beside it;
// - an event page shows no date of its own: when it was first reported, in Beijing time, and of which year
//   when not this one.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import * as cheerio from "cheerio";
import type { SiteItemDetail, StoryDetail } from "@aihot/contracts/site";
import { beijingDate } from "@aihot/contracts/time";
import { withSubject } from "@aihot/site";
import { fakeApi, FIXTURE_AT, itemDetail, startWebServer, type WebServer } from "../apps/web/tests/web-server.ts";

const agent = { slug: "agent", name: "Agent 智能体" };
const items: SiteItemDetail[] = [
  itemDetail({ id: "links-lead", title: "日报头条", topics: [agent], daily: { key: "2026-11-07", lead: true } }),
  itemDetail({ id: "links-entry", title: "日报里的一条", daily: { key: "2026-11-07", lead: false } }),
  itemDetail({ id: "links-none", title: "没进日报" }),
  // Tagged with a company its title does not name: that company's topic is the tag's, not the article's.
  itemDetail({ id: "links-tags", title: "带标签", topics: [agent], tags: ["Agent", "OpenAI", "框架"], tagTopics: { Agent: "agent", OpenAI: "openai" } }),
];
// A minute ago: this year's, unless the test runs in the first minute of one.
const recent = new Date(Date.now() - 60_000).toISOString();
const story = (publicId: string, firstReportAt: string | null): StoryDetail => ({
  publicId, title: "测试事件", status: "settled", reportCount: 61, sourceCount: 20, firstReportAt, latestAt: firstReportAt ?? FIXTURE_AT, digest: null, digestUpdatedAt: null,
  summary: null, excerpt: null, latest: null, latestReport: null,
  whyHot: { participants48h: 0, newParticipants6h: 0, recentReports24h: 0, observationComplete: true, rank: null },
  developments: [], officialReports: [], timeline: [], heat: [], related: [], topics: [], mentions: [],
});
const stories = [story("links-this-year", recent), story("links-last-year", "2025-12-30T17:00:00.000Z"), story("links-undated", null)];

let web: WebServer;
before(async () => {
  web = await startWebServer(fakeApi((url) => {
    const item = items.find((i) => url.pathname === `/api/site/items/${i.id}`);
    if (item) return item;
    return stories.find((s) => url.pathname === `/api/site/stories/${s.publicId}`);
  }));
});
after(async () => { await web?.stop(); });

async function page(path: string) {
  const response = await fetch(`${web.origin}${path}`);
  assert.equal(response.status, 200, web.logs());
  return cheerio.load(await response.text());
}

// This site's item page closes with a card to the daily that carries it, after one row of chips for topics and
// tags (no separate rail); Chinese copy is read on the /zh edition, where every site link carries the /zh prefix.
test("an article a daily carries links to that issue, named as the site names its issues", async () => {
  const daily = withSubject("日报");
  for (const [id, name] of [["links-lead", `11月7日 ${daily} · 头条`], ["links-entry", `11月7日 ${daily}`]] as const) {
    const $ = await page(`/zh/items/${id}`);
    const links = $("a[href='/zh/daily/2026-11-07']");
    assert.deepEqual(links.toArray().map((el) => $(el).find("span").first().text()), [`这条收录于 ${name}`], id);
    assert.ok(links.eq(0).closest("article").length, id);
  }
  const en = await page("/items/links-lead");
  assert.deepEqual(en("a[href='/daily/2026-11-07']").toArray().map((el) => en(el).find("span").first().text()), ["This story is in 11/7 AI Daily · Lead story"]);
  const $ = await page("/zh/items/links-none");
  assert.equal($("a[href^='/zh/daily/2']").length, 0);
});

test("a tag that is a topic's own leads to the topic page, and not beside that topic's chip", async () => {
  const $ = await page("/zh/items/links-tags");
  const hrefs = (text: string) => $("a").filter((_, el) => $(el).text() === text).toArray().map((el) => $(el).attr("href"));
  assert.deepEqual(hrefs("Agent 智能体"), ["/zh/topics/agent"]);
  assert.deepEqual(hrefs("#Agent"), []);
  assert.deepEqual(hrefs("#OpenAI"), ["/zh/topics/openai"]);
  assert.deepEqual(hrefs("#框架"), [`/zh/all?tag=${encodeURIComponent("框架")}`]);
  assert.equal($("a[href^='/zh/all?tag=Agent']").length, 0);
});

test("an event page says when it was first reported, by the Beijing day and its year when not this one", async () => {
  const day = beijingDate(recent);
  for (const [id, date, at] of [["links-this-year", `${Number(day.slice(5, 7))}月${Number(day.slice(8, 10))}日`, recent], ["links-last-year", "2025年12月31日", "2025-12-30T17:00:00.000Z"]] as const) {
    const $ = await page(`/zh/story/${id}`);
    const first = $(`time[datetime='${at}']`).first();
    assert.equal(first.text(), date, id);
    assert.ok(first.closest("span").text().endsWith("首报"), `${id}: ${first.closest("span").text()}`);
  }
  const undated = await page("/zh/story/links-undated");
  assert.ok(!undated("main").text().includes("首报"));
});
