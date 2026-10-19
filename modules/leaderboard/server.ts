import path from "node:path";
import { defineServerModule } from "@aihot/backend/modules";
import { sql } from "@aihot/backend/db";
import { beijingStamp } from "@aihot/backend/notify/feishu";
import { siteUrl } from "@aihot/backend/publication/links";
import { sendFile } from "../../apps/api/src/routes/static.ts";
import { registerLeaderboard } from "./api/leaderboard.ts";
import { fetchOverview } from "./backend/admin.ts";
import { refreshLeaderboard } from "./backend/fetch/refresh.ts";
import { runLeaderboardRound } from "./backend/method/run.ts";
import { leaderboardUrls } from "./backend/publication.ts";
import { LEADERBOARD_PUBLIC_BOARDS } from "./taxonomy.ts";

const collecting = process.env.COLLECT_ENABLED === "true";

export default defineServerModule({
  name: "leaderboard",
  http(app) {
    registerLeaderboard(app);
    for (const dir of ["model-providers", "leaderboard-sources"]) {
      app.get(`/${dir}/:file`, (req, reply) => {
        const file = (req.params as { file: string }).file;
        if (!/^[a-z0-9-]+\.(svg|png)$/.test(file)) return reply.code(404).send();
        return sendFile(req, reply, path.join(import.meta.dirname, "assets", dir, file), { cacheControl: "public, max-age=604800" });
      });
    }
  },
  schedules: [
    { name: "leaderboard.round", cron: "5 2,8,14,20 * * *", missed: "once", run: () => collecting ? refreshLeaderboard() : runLeaderboardRound() },
  ],
  async workerStarted(boss) {
    // A new site has no leaderboard until the first scheduled round: compute one now.
    const [published] = await sql`SELECT 1 FROM lb_runs WHERE status = 'published' LIMIT 1`;
    if (!published) await boss.send("cron.leaderboard.round", {}, { singletonKey: "first-round" });
  },
  admin: { runs: fetchOverview },
  async alerts(now) {
    // A leaderboard source keeps its last snapshot while failing.
    const [lb] = await sql<{ value: { sources?: Record<string, { ok: boolean; lastOkAt: string | null; error?: string }> } }[]>`SELECT value FROM settings WHERE key = 'leaderboard.fetch'`;
    const stale = Object.entries(lb?.value.sources ?? {}).filter(([, s]) => !s.ok && s.lastOkAt && now - Date.parse(s.lastOkAt) > 26 * 3600_000);
    return stale.length ? [{
      key: "leaderboard.fetch",
      level: "later",
      title: `模型榜有 ${stale.length} 个评测来源超过一天没抓到，榜单暂用上一份数据`,
      detail: stale.slice(0, 6).map(([k, s]) => `${k}：${s.error ?? "失败"}（上次成功 ${beijingStamp(s.lastOkAt!)}）`).join("；"),
    }] : [];
  },
  async llms() {
    const [published] = await sql`SELECT 1 FROM lb_runs WHERE status = 'published' LIMIT 1`;
    return {
      pages: published ? [
        `- [Model leaderboard](${siteUrl("/leaderboard")})`,
        `- [LLM API pricing](${siteUrl("/pricing")}): API prices of the leaderboard's models from OpenRouter, in USD per million tokens (input, output, cached input), with a cost calculator`,
      ] : [],
    };
  },
  sitemap: {
    pages: [
      { loc: "/leaderboard", changefreq: "daily", priority: 0.8 },
      { loc: "/leaderboard/sources", changefreq: "weekly", priority: 0.5 },
      { loc: "/leaderboard/rules", changefreq: "monthly", priority: 0.4 },
      { loc: "/pricing", changefreq: "weekly", priority: 0.7 },
      ...LEADERBOARD_PUBLIC_BOARDS.filter((key) => key !== "overall").map((key) => ({ loc: `/leaderboard/category/${key}`, changefreq: "daily", priority: 0.6 })),
    ],
    async entries() {
      const fixed = new Set(["/leaderboard", "/leaderboard/sources", "/leaderboard/rules"]);
      return (await leaderboardUrls()).filter((loc) => !fixed.has(loc) && !loc.startsWith("/leaderboard/category/"))
        .map((loc) => ({ loc, changefreq: "weekly", priority: 0.4 }));
    },
  },
});
