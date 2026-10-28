import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, before, test } from "node:test";
import { chromium, expect, type Browser } from "@playwright/test";
import { startWebServer, type WebServer } from "./web-server.ts";

let web: WebServer;
let browser: Browser;
let empty = false;
const windows: number[] = [];
const growthQueries: string[] = [];

const totals = (sessions: number) => ({ visitors: sessions - 1, newVisitors: 2, sessions, views: sessions * 2, bounces: 1, engagedSessions: sessions - 1, engagedMs: sessions * 30_000, durationMs: 0, conversions: 1 });
const row = (key: string, sessions: number) => ({ key, visitors: sessions, sessions, views: sessions * 2, bounces: 1, engagedMs: 30_000, conversions: 1 });
function growthFixture(channel: string | null) {
  const range = { range: "7d", from: "2026-10-22", to: "2026-10-28", days: 7, previous: { from: "2026-10-15", to: "2026-10-21" } };
  return {
    range, filters: channel ? { channel } : {}, goal: "subscribe_success", goals: ["subscribe_success", "subscribe_submit"], channels: ["direct", "search"],
    since: "2026-10-01", hourly: false, totals: totals(channel ? 4 : 10), previous: totals(8),
    series: ["2026-10-22", "2026-10-23"].map((bucket) => ({ bucket, visitors: 3, sessions: 4, views: 8, bounces: 1 })),
    previousSeries: ["2026-10-15", "2026-10-16"].map((bucket) => ({ bucket, visitors: 2, sessions: 3, views: 6, bounces: 1 })),
    breakdowns: { channel: [row("search", 4), row("direct", 6)], landing: [row("/story/:id", 5)], referrer: [row("google.com", 4)], device: [row("mobile", 7)], page: [], page_path: [] },
    events: [], filtered: [{ reason: "reloads", count: 120 }, { reason: "owner", count: 3 }],
    live: { visitors: 1, sessions: 1, pages: [{ key: "/", sessions: 1 }], views: Array.from({ length: 30 }, (_, i) => i % 5) },
  };
}
const api = createServer((req, res) => {
  const url = new URL(req.url!, "http://api.local");
  res.setHeader("Content-Type", "application/json");
  if (url.pathname === "/api/site/meta") return res.end(JSON.stringify({ changelogVersion: null }));
  if (url.pathname === "/api/admin/me") return res.end(JSON.stringify({ name: "MCP 统计检查", csrf: "fixture", dev: true }));
  if (url.pathname === "/api/admin/nav-counts") return res.end(JSON.stringify({}));
  if (url.pathname === "/api/admin/analytics/subscribe") return res.end(JSON.stringify({ days: Number(url.searchParams.get("days")) || 30, daily: [], totals: [], firstDays: {} }));
  if (url.pathname === "/api/admin/growth") {
    growthQueries.push(url.search);
    return res.end(JSON.stringify(growthFixture(url.searchParams.get("channel"))));
  }
  if (url.pathname === "/api/admin/analytics") {
    const days = Number(url.searchParams.get("days")) || 30;
    windows.push(days);
    const calls = empty ? 0 : 20;
    return res.end(JSON.stringify({ days, totals: { views: 30, paths: 1 }, daily: [{ day: "2026-10-18", views: 30 }], pages: [{ path: "/agent", views: 30 }], engagement: { totals: [], daily: [], firstStarDevices: 0, topStarred: [], firstDays: {} }, mcp: {
      totals: { calls, successes: empty ? 0 : 15, errors: empty ? 0 : 5, initializes: 10, discoveries: 8, checks: 9, activeDays: empty ? 0 : 1, averageMs: 42, maxMs: 100, lastCallAt: empty ? null : "2026-10-18T00:00:00.000Z" },
      daily: [{ day: "2026-10-18", calls, successes: empty ? 0 : 15 }],
      tools: empty ? [] : [{ tool: "eacc_get_latest", calls: 20, successes: 15, errors: 5, averageMs: 42, maxMs: 100, lastCallAt: "2026-10-18T00:00:00.000Z" }],
      errors: empty ? [] : [{ outcome: "not_found", calls: 5 }],
    } }));
  }
  res.statusCode = 404;
  res.end(JSON.stringify({ detail: "not_found" }));
});
before(async () => { web = await startWebServer(api); browser = await chromium.launch({ channel: "chromium" }); });
after(async () => { await browser?.close(); await web?.stop(); });

test("MCP usage shows outcomes and preserves the selected time window on desktop and mobile", async () => {
  for (const viewport of [{ width: 1400, height: 900 }, { width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    try {
      const response = await page.goto(web.origin + "/admin/analytics?days=7");
      assert.equal(response?.headers()["cache-control"], "private, no-store");
      await expect(page).toHaveURL(/\/admin\/metrics\?tab=outlets&days=7$/, { timeout: 5000 });
      const section = page.locator('section[aria-labelledby="mcp-usage-title"]');
      await expect(section.getByRole("heading", { name: "MCP 使用统计", exact: true })).toBeVisible();
      await expect(section.getByText("75.0%", { exact: true })).toHaveCount(2);
      await expect(section.getByRole("cell", { name: "eacc_get_latest" })).toBeVisible();
      await expect(section.getByRole("cell", { name: "not_found" })).toBeVisible();
      await page.getByRole("link", { name: "近 90 天", exact: true }).click();
      await expect(page).toHaveURL(/days=90/);
      await expect(section.getByText("1 / 90", { exact: true })).toBeVisible();
      assert.ok(windows.includes(90));
      assert.deepEqual(errors, []);
    } finally { await page.close(); }
  }
});

test("a newly deployed site shows no invented success rate or usage", async () => {
  empty = true;
  const page = await browser.newPage();
  try {
    await page.goto(web.origin + "/admin/metrics?tab=outlets");
    const section = page.locator('section[aria-labelledby="mcp-usage-title"]');
    await expect(section.getByText("所选时间范围内没有 MCP 工具调用", { exact: true })).toBeVisible();
    await expect(section.getByText("所选时间范围内没有 MCP 调用错误", { exact: true })).toBeVisible();
    assert.doesNotMatch(await section.innerText(), /NaN|Infinity|100[.]0%/);
  } finally { await page.close(); empty = false; }
});

test("the growth overview compares with the previous span and narrows to a clicked value", async () => {
  for (const viewport of [{ width: 1400, height: 900 }, { width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    try {
      await page.goto(web.origin + "/admin/metrics");
      await expect(page.getByRole("heading", { name: "增长", exact: true })).toBeVisible();
      await expect(page.getByText("▲25.0%").first()).toBeVisible();
      await expect(page.getByText("自报爬虫或无 UA")).toHaveCount(0);
      await expect(page.getByText("大量整页加载、不站内跳转")).toBeVisible();
      await page.getByRole("link", { name: "搜索", exact: true }).first().click();
      await expect(page).toHaveURL(/channel=search/);
      await expect(page.getByRole("link", { name: /渠道：搜索/ })).toBeVisible();
      assert.ok(growthQueries.some((q) => q.includes("channel=search")));
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "no sideways scroll of the page");
      assert.deepEqual(errors, []);
    } finally { await page.close(); }
  }
});
