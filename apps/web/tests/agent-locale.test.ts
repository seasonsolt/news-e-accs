// English SSR of the agent page. Failure case: interface copy still contains Chinese.
// The language switcher's 中文 endonym is the one exception.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, before, test } from "node:test";
import { PUBLIC_INTERFACE_VERSION } from "@aihot/contracts/http-policy";
import { startWebServer, type WebServer } from "./web-server.ts";

const CJK = /[\p{Script=Han}\u3000-\u303f\uff00-\uffef]/u;
const ENDONYM = /<option\b[^>]*\bvalue="zh"[^>]*>中文<\/option>/g;
const DECK = "MCP, RSS, API: three ways to read the same data — picks, trending, daily, weekly and monthly briefings. Pick whichever suits your tool. Everything is anonymous and read-only, with no sign-up or API key.";
const CHINESE_DECK = "MCP、RSS、API 三种方式读的是同一份数据：精选、热点、日报、周报和月报，按你用的工具选一种就行。全部匿名只读，不用注册，也不用 API Key。";

let web: WebServer;
const api = createServer((req, res) => {
  res.setHeader("Content-Type", "application/json");
  if (req.url === "/api/health") return res.end(JSON.stringify({ ok: true }));
  if (req.url === "/api/site/meta") return res.end(JSON.stringify({ changelogVersion: "2026-01-01T00:00" }));
  res.statusCode = 404;
  res.end(JSON.stringify({ code: "not_found" }));
});
before(async () => { web = await startWebServer(api); });
after(() => web.stop());

function leak(html: string) {
  const text = html.replace(ENDONYM, "");
  const at = text.search(CJK);
  return at < 0 ? null : text.slice(Math.max(0, at - 48), at + 48);
}

test("the English agent page contains no CJK outside the language switcher", async () => {
  for (const path of ["/agent", "/agent?tab=rss", "/agent?tab=api"]) {
    const response = await fetch(`${web.origin}${path}`);
    assert.equal(response.status, 200, web.logs());
    const html = await response.text();
    assert.match(html, ENDONYM);
    assert.ok(html.includes(DECK), path);
    assert.ok(html.includes("Agent guide"), path);
    assert.ok(html.includes("An agent can look things up after reading it."), path);
    assert.ok(html.includes(`Full REST API definition · ${PUBLIC_INTERFACE_VERSION}`), path);
    assert.equal(leak(html), null, `${path}: ${leak(html)}`);
  }
});

test("the Chinese agent page keeps its copy", async () => {
  const response = await fetch(`${web.origin}/zh/agent`);
  assert.equal(response.status, 200, web.logs());
  const html = await response.text();
  assert.ok(html.includes(CHINESE_DECK));
  assert.ok(html.includes("Agent 使用说明"));
  assert.ok(html.includes("Agent 读了就能查"));
  assert.ok(html.includes(`REST API 的完整定义 · ${PUBLIC_INTERFACE_VERSION}`));
  assert.equal(html.includes(DECK), false);
  assert.equal(html.includes("An agent can look things up after reading it."), false);
});
