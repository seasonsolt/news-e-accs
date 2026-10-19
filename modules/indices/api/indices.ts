// First-party index endpoints (/api/site/indices/*, and the chart image beside its page): read-only,
// computed from the leaderboard's data.
import type { FastifyInstance } from "fastify";
import { CHART_PATH, chartPng } from "../backend/chart.ts";
import { costOfIntelligenceCsv, loadCostOfIntelligence } from "../backend/publication.ts";
import { etagMatches, looseQuery, sendJsonWithEtag, sendTextWithEtag } from "../../../apps/api/src/http/respond.ts";
import { siteHandler } from "../../../apps/api/src/routes/site.ts";

const CACHE = "public, max-age=300, s-maxage=600, stale-while-revalidate=3600";

export function registerIndices(app: FastifyInstance) {
  app.get("/api/site/indices/cost-of-intelligence", siteHandler(async (req, reply) =>
    sendJsonWithEtag(req, reply, await loadCostOfIntelligence(), { etagPrefix: "coi", cacheControl: CACHE })));

  app.get("/api/site/indices/cost-of-intelligence.csv", siteHandler(async (req, reply) => {
    reply.header("Content-Disposition", 'attachment; filename="cost-of-intelligence.csv"');
    return sendTextWithEtag(req, reply, costOfIntelligenceCsv(await loadCostOfIntelligence()), { etagPrefix: "coi-csv", cacheControl: CACHE, contentType: "text/csv; charset=utf-8" });
  }));

  // English unless ?lang=zh: the image other sites embed.
  app.get(CHART_PATH, siteHandler(async (req, reply) => {
    const { png, etag } = await chartPng(await loadCostOfIntelligence(), looseQuery(req).lang === "zh" ? "zh" : "en");
    reply.header("ETag", etag).header("Cache-Control", CACHE).header("Access-Control-Allow-Origin", "*");
    if (etagMatches(req.headers["if-none-match"], etag)) return reply.code(304).send();
    return reply.type("image/png").send(png);
  }));
}
