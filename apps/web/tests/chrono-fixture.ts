// Independent local API + built SSR site, also runnable for browser QA. No database or providers.
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import { BIG_BANG, dateToYear, type ChronicleResponse } from "@aihot/contracts/chronicle";
import { beijingDate } from "@aihot/contracts/time";
import type { HotResponse, ReportDetail, TimelineResponse } from "@aihot/contracts/site";

export const chronicle: ChronicleResponse = {
  eras: [
    { id: "cosmos", from: BIG_BANG, title: "宇宙", summary: "宇宙的早期", art: "cosmos", artStyle: "深空摄影" },
    { id: "steam-age", from: 1769, title: "蒸汽时代", summary: "蒸汽动力改变文明", art: "steam", artStyle: "铜版画" },
    { id: "forecast", from: 2030, title: "未来（推测）", summary: "公开预测", art: "forecast", artStyle: "线框", forecast: true },
  ],
  milestones: [
    { id: "bang", t: BIG_BANG, precision: "ga", title: "大爆炸", detail: "宇宙膨胀", category: "cosmos", source: "https://example.com/bang" },
    { id: "steam", t: 1769, precision: "year", date: "1769", title: "瓦特蒸汽机", detail: "改良蒸汽机", category: "energy", capability: "蒸汽动力", source: "https://example.com/steam" },
    { id: "difference-engine", t: 1822, precision: "year", date: "1822", title: "差分机", detail: "机械计算", category: "compute", art: "difference-engine", artStyle: "铜版画", source: "https://example.com/engine" },
    { id: "electricity", t: 1882, precision: "year", date: "1882", title: "电力", detail: "电网", category: "energy", capability: "电力", source: "https://example.com/electricity" },
    { id: "moon", t: dateToYear("1969-07-20"), precision: "day", date: "1969-07-20", title: "登月", detail: "载人登月", category: "human", capability: "登月", source: "https://example.com/moon" },
    { id: "record", t: dateToYear("2026-09-01"), precision: "day", date: "2026-09-01", title: "本站记录", detail: "历史入口", category: "culture", source: "https://example.com/record" },
    { id: "future", t: 2040, precision: "year", date: "2040", title: "未来预测", detail: "不是事实", category: "ai", source: "https://example.com/future", forecast: { by: "测试机构", url: "https://example.com/forecast" } },
  ],
  metrics: [
    { key: "population", label: "世界人口", unit: "人", points: [[1700, 6e8], [2025, 8e9], [2050, 9e9]], forecastFrom: 2025, source: { name: "测试人口", url: "https://example.com/population" }, note: "测试数据" },
    { key: "energy", label: "能源功率", unit: "瓦", points: [[1700, 1e10], [2025, 2e13]], source: { name: "测试能源", url: "https://example.com/energy" }, note: "没有预测" },
  ],
};

export async function startChronoFixture() {
  const hits = new Map<string, number>();
  const api = createServer((req, res) => {
    const url = new URL(req.url!, "http://test.local");
    const path = url.pathname;
    hits.set(path, (hits.get(path) ?? 0) + 1);
    const at = url.searchParams.get("at");
    res.setHeader("Content-Type", "application/json");
    const send = (body: unknown) => res.end(JSON.stringify(body));
    if (path === "/api/site/meta") return send({ changelogVersion: null });
    if (path === "/api/site/chronicle") return send(chronicle);
    if (path === "/api/site/chronicle/bounds") return send({ earliest: "2026-08-01", feed: "2026-08-01", hot: "2026-08-01", daily: "2026-08-01", today: beijingDate(Date.now()) });
    if (path === "/api/site/hot") {
      const computedAt = `${at ?? "2026-10-01"}T15:00:00.000Z`;
      const body: HotResponse = { computedAt, windowHours: 48, entries: [{
        rank: 1, story: { publicId: "archive-story", title: at ? `历史热点 ${at}` : "当前热点条目" }, heat: 42, trend: "flat", trendPct: null, badges: [], participantCount: 0, sourceCount: 0, sourceNames: [], participants: [], spark: [], summary: "本地历史数据", latest: null, cover: null,
      }] };
      return send(body);
    }
    if (path === "/api/site/timeline") {
      const body: TimelineResponse = { filters: { channel: "all", category: null, tag: null, topic: null, at }, cards: [], nextCursor: null, dayCounts: {}, hot: Array.from({ length: 3 }, (_, i) => ({ rank: i + 1, title: `精选页热点 ${i}`, heat: 42, trend: "flat" as const, storyPublicId: "archive-story", itemId: null, participants: [], participantCount: 0 })) };
      return send(body);
    }
    if (path === "/api/site/reports/daily/at/2026-09-02") return send({ key: "2026-09-01" });
    if (/^\/api\/site\/reports\/daily\/at\//.test(path)) return send({ key: null });
    if (path === "/api/site/reports/daily/navigation/2026-09-01") return send({ items: [{ key: "2026-09-01", title: "测试日报" }] });
    if (path === "/api/site/reports/daily/2026-09-01") {
      const body: ReportDetail = { kind: "daily", key: "2026-09-01", issueNumber: 1, leadItemId: null, title: "测试日报", windowStart: "2026-08-31T16:00:00Z", windowEnd: "2026-09-01T16:00:00Z", generatedAt: "2026-09-01T00:00:00Z", lead: null, overview: null, highlights: [], sections: [], flashes: [], cover: null, metrics: {}, readingMinutes: 1, prev: null, next: null };
      return send(body);
    }
    res.statusCode = 404;
    return send({ code: "not_found" });
  });
  api.listen(0, "127.0.0.1");
  await once(api, "listening");
  const web = spawn(process.execPath, [fileURLToPath(new URL("../server.ts", import.meta.url))], {
    env: { ...process.env, WEB_PORT: "0", API_BASE_URL: `http://127.0.0.1:${(api.address() as AddressInfo).port}`, COLLECT_ENABLED: "false", MODEL_CALLS_ENABLED: "false", FEISHU_CONTENT_PUSH_ENABLED: "false", FEISHU_INTERNAL_ENABLED: "false", INDEXNOW_SUBMIT_ENABLED: "false", NEWSLETTER_ENABLED: "false" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let logs = "";
  let origin: string;
  try {
    origin = await new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(logs || "web did not start")), 15000);
      web.stderr!.on("data", (chunk) => { logs += String(chunk); });
      web.once("exit", () => { clearTimeout(timeout); reject(new Error(logs || "web exited")); });
      web.stdout!.on("data", (chunk) => {
        logs += String(chunk);
        const match = logs.match(/"msg":"web started","port":(\d+)/);
        if (match) { clearTimeout(timeout); resolve(`http://127.0.0.1:${match[1]}`); }
      });
    });
  } catch (error) { web.kill(); api.close(); throw error; }
  return { origin, hits, async close() {
    web.kill("SIGTERM");
    await once(web, "exit");
    api.closeAllConnections();
    await new Promise<void>((resolve) => api.close(() => resolve()));
  } };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const fixture = await startChronoFixture();
  console.log(fixture.origin);
  process.once("SIGTERM", async () => { await fixture.close(); process.exit(0); });
}
