import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, before, test } from "node:test";
import { chromium, expect, type Browser } from "@playwright/test";
import { startWebServer, type WebServer } from "./web-server.ts";

let web: WebServer;
let browser: Browser;
let empty = false;
const windows: number[] = [];
const api = createServer((req, res) => {
  const url = new URL(req.url!, "http://api.local");
  res.setHeader("Content-Type", "application/json");
  if (url.pathname === "/api/site/meta") return res.end(JSON.stringify({ changelogVersion: null }));
  if (url.pathname === "/api/admin/me") return res.end(JSON.stringify({ name: "MCP 统计检查", csrf: "fixture", dev: true }));
  if (url.pathname === "/api/admin/nav-counts") return res.end(JSON.stringify({}));
  if (url.pathname === "/api/admin/analytics/subscribe") return res.end(JSON.stringify({ days: Number(url.searchParams.get("days")) || 30, daily: [], totals: [] }));
  if (url.pathname === "/api/admin/analytics") {
    const days = Number(url.searchParams.get("days")) || 30;
    windows.push(days);
    const calls = empty ? 0 : 20;
    return res.end(JSON.stringify({ days, totals: { views: 30, paths: 1 }, daily: [{ day: "2026-10-18", views: 30 }], pages: [{ path: "/agent", views: 30 }], engagement: { totals: [], daily: [], firstStarDevices: 0, topStarred: [] }, mcp: {
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
    await page.goto(web.origin + "/admin/analytics");
    const section = page.locator('section[aria-labelledby="mcp-usage-title"]');
    await expect(section.getByText("所选时间范围内没有 MCP 工具调用", { exact: true })).toBeVisible();
    await expect(section.getByText("所选时间范围内没有 MCP 调用错误", { exact: true })).toBeVisible();
    assert.doesNotMatch(await section.innerText(), /NaN|Infinity|100[.]0%/);
  } finally { await page.close(); empty = false; }
});
