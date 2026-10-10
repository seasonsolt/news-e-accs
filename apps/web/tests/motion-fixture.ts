// Local synthetic API + the built SSR server. Also runnable directly for browser QA;
// never contacts providers or the database, and never changes production data.
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import type { HotResponse, TimelineCard, TimelineResponse } from "@aihot/contracts/site";

const run = { generatedAt: "2026-09-28T00:00:00Z" };

function card(i: number): TimelineCard {
  const at = new Date(Date.parse(run.generatedAt) - i * 60_000).toISOString();
  return { key: `motion-card-${i}`, anchorAt: at, group: null, item: {
    id: `motion-item-${i}`, title: `测试报道 ${i}`, summary: `独立摘要 ${i}`, reason: null,
    source: { name: "测试信源" }, publishedAt: at, timelineAt: at, category: "ai-models",
    tags: [], score: 80, selected: true, channel: "news", x: null,
  } };
}

function hot(phase: number): HotResponse {
  const order = phase % 2 ? [0, 1, 2, 4, 3, 5, 6, 7, 8, 9] : Array.from({ length: 10 }, (_, i) => i);
  return { computedAt: run.generatedAt, windowHours: 48, entries: order.map((id, i) => ({
    rank: i + 1, story: { publicId: `motion-story-${id}`, title: `热点事件 ${id}` }, heat: 987 - id * 37 + (id === 4 ? phase * 19 : 0),
    trend: "flat", trendPct: null, badges: [], participantCount: 5, sourceCount: 3,
    sourceNames: ["测试信源"],
    participants: [], spark: [], summary: `热点摘要 ${id}`, latest: null, cover: null,
  })) };
}

export async function startMotionFixture() {
  let phase = 0;
  const api = createServer((req, res) => {
    const url = new URL(req.url!, "http://test.local");
    const path = url.pathname;
    res.setHeader("Content-Type", "application/json");
    if (path === "/api/site/meta") return res.end(JSON.stringify({ changelogVersion: null }));
    // Confirmation QA stays on this synthetic API; no subscriber or mailer exists here.
    if (path === "/api/site/newsletter/confirm" && req.method === "POST") {
      let body = "";
      req.on("data", (chunk) => { body += String(chunk); });
      req.on("end", () => {
        const accepted = body === JSON.stringify({ token: "motion-fixture-confirm" });
        res.statusCode = accepted ? 200 : 400;
        res.end(JSON.stringify(accepted ? { ok: true } : { detail: "仅接受本地测试凭证。" }));
      });
      return;
    }
    if (path === "/api/site/items/broken") { res.statusCode = 500; return res.end("{}"); }
    if (path === "/api/site/motion-test") { phase++; return res.end(JSON.stringify({ phase })); }
    if (path === "/api/site/hot") return res.end(JSON.stringify(hot(phase)));
    if (path === "/api/site/timeline") {
      const category = url.searchParams.get("category") === "ai-models" ? "ai-models" : null;
      const page = Number(url.searchParams.get("cursor") ?? "0");
      const cards = category ? Array.from({ length: page ? 6 : 12 }, (_, i) => card(page ? 12 + (page - 1) * 6 + i : i)) : [];
      if (category && !page && phase) cards.unshift(card(99 + phase));
      const response: TimelineResponse = { filters: { channel: "all", category, tag: null, topic: null }, cards, nextCursor: category && page < 3 ? String(page + 1) : null, dayCounts: {}, hot: null };
      return res.end(JSON.stringify(response));
    }
    res.statusCode = 404;
    res.end("{}");
  });
  api.listen(0, "127.0.0.1");
  await once(api, "listening");
  const web = spawn(process.execPath, [fileURLToPath(new URL("../server.ts", import.meta.url))], {
    env: { ...process.env, WEB_PORT: "0", API_BASE_URL: `http://127.0.0.1:${(api.address() as AddressInfo).port}`, COLLECT_ENABLED: "false", MODEL_CALLS_ENABLED: "false", FEISHU_CONTENT_PUSH_ENABLED: "false", INDEXNOW_SUBMIT_ENABLED: "false" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let logs = "";
  const origin = await new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(logs || "web did not start")), 15_000);
    web.stderr!.on("data", (chunk) => { logs += String(chunk); });
    web.on("exit", () => { clearTimeout(timeout); reject(new Error(logs || "web exited")); });
    web.stdout!.on("data", (chunk) => {
      logs += String(chunk);
      const match = logs.match(/"msg":"web started","port":(\d+)/);
      if (match) { clearTimeout(timeout); resolve(`http://127.0.0.1:${match[1]}`); }
    });
  });
  return { origin, update() { phase++; }, async close() {
    web.kill("SIGTERM");
    await once(web, "exit");
    api.closeAllConnections();
    await new Promise<void>((resolve) => api.close(() => resolve()));
  } };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const fixture = await startMotionFixture();
  console.log(fixture.origin);
  process.once("SIGTERM", async () => { await fixture.close(); process.exit(0); });
}
