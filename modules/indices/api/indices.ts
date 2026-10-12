// First-party index endpoints (/api/site/indices/*): read-only, computed from the leaderboard's data.
import type { FastifyInstance } from "fastify";
import { costOfIntelligenceCsv, loadCostOfIntelligence } from "../backend/publication.ts";
import { sendJsonWithEtag, sendTextWithEtag } from "../../../apps/api/src/http/respond.ts";
import { siteHandler } from "../../../apps/api/src/routes/site.ts";

const CACHE = "public, max-age=300, s-maxage=600, stale-while-revalidate=3600";

export function registerIndices(app: FastifyInstance) {
  app.get("/api/site/indices/cost-of-intelligence", siteHandler(async (req, reply) =>
    sendJsonWithEtag(req, reply, await loadCostOfIntelligence(), { etagPrefix: "coi", cacheControl: CACHE })));

  app.get("/api/site/indices/cost-of-intelligence.csv", siteHandler(async (req, reply) => {
    reply.header("Content-Disposition", 'attachment; filename="cost-of-intelligence.csv"');
    return sendTextWithEtag(req, reply, costOfIntelligenceCsv(await loadCostOfIntelligence()), { etagPrefix: "coi-csv", cacheControl: CACHE, contentType: "text/csv; charset=utf-8" });
  }));
}
