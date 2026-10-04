// Local synthetic leaderboard API + the built SSR server. Also runnable directly for browser QA;
// never contacts providers or the database, and never changes production data.
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import type { LbBoardResponse, LbSourcesResponse } from "@aihot/contracts/leaderboard";
import { LEADERBOARD_BOARD_LABELS, type LeaderboardBoardKey } from "@aihot/contracts/taxonomy";

const run = { id: "motion-test", methodologyVersion: "test", generatedAt: "2026-09-28T00:00:00Z", fx: null };
function board(key: LeaderboardBoardKey): LbBoardResponse {
  return {
    run, tabs: [],
    board: { key, name: LEADERBOARD_BOARD_LABELS[key], title: "Motion test", description: "测试榜单", howToRead: "测试证据。", sourceCount: 5, operatorCount: 3, modelCount: 30 },
    entries: Array.from({ length: 30 }, (_, i) => ({
      rank: i + 1, score: 98.7 - i - (key === "coding" ? 3 : 0), sourceCount: 5, coverage: 1, confidence: "HIGH", stability: null, price: null,
      model: { slug: `motion-model-${i}`, name: `测试模型 ${i + 1}`, provider: "本地测试", releasedAt: "2026-09-01", brand: { src: null, monogram: "T", raster: false } },
    })),
  };
}
const sources: LbSourcesResponse = {
  run, rankedCount: 5, totalCount: 5,
  groups: [{ key: "coding", name: "编程", blurb: "测试证据", sources: [], lineage: [
    { name: "SWE-bench Verified", period: "2024", note: "测试" },
    { name: "DeepSWE", period: "2025", note: "测试" },
    { name: "FrontierCode", period: "2026", note: "测试", current: true },
  ] }],
};

export async function startMotionFixture() {
  const api = createServer((req, res) => {
    const path = new URL(req.url!, "http://test.local").pathname;
    res.setHeader("Content-Type", "application/json");
    if (path === "/api/site/meta") return res.end(JSON.stringify({ changelogVersion: null }));
    if (path === "/api/site/timeline") return res.end(JSON.stringify({ filters: { channel: "all", category: null, tag: null, topic: null }, cards: [], nextCursor: null, dayCounts: [], hot: null, refreshAt: new Date(Date.now() + 60_000).toISOString(), generatedAt: run.generatedAt }));
    if (path.includes("/leaderboard/boards/")) return res.end(JSON.stringify(board(path.split("/").at(-1) as LeaderboardBoardKey)));
    if (path === "/api/site/leaderboard/sources") return res.end(JSON.stringify(sources));
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
  return { origin, async close() {
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
