// First-party leaderboard endpoints (/api/site/leaderboard*). Read-only views of the latest published run.
import type { FastifyInstance } from "fastify";
import { LEADERBOARD_PUBLIC_BOARDS, type LeaderboardBoardKey } from "@aihot/leaderboard/taxonomy";
import { loadBoard, loadComparison, loadModel, loadPricing, loadRulesData, loadSource, loadSources, NoLeaderboardRun } from "../backend/publication.ts";
import { beijingDayEnd } from "@aihot/contracts/time";
import { looseQuery, sendJsonWithEtag, sendProblem } from "../../../apps/api/src/http/respond.ts";
import { PAST_SLICE_CACHE, parseAt, siteHandler } from "../../../apps/api/src/routes/site.ts";

const CACHE = "public, max-age=120, s-maxage=300, stale-while-revalidate=600";

export function registerLeaderboard(app: FastifyInstance) {
  const guarded = (fn: Parameters<typeof siteHandler>[0]) =>
    siteHandler(async (req, reply) => {
      try {
        return await fn(req, reply);
      } catch (error) {
        // The time machine went back before the first run: there is no board for that day.
        if (error instanceof NoLeaderboardRun && parseAt(looseQuery(req).at)) {
          return sendProblem(req, reply, { status: 404, code: "not_found", detail: "no leaderboard run by that day", cacheControl: PAST_SLICE_CACHE });
        }
        if (error instanceof NoLeaderboardRun) {
          return sendProblem(req, reply, { status: 503, code: "temporarily_unavailable", detail: "leaderboard not computed yet", retryAfter: 300 });
        }
        throw error;
      }
    });

  const notFound = (req: Parameters<typeof sendProblem>[0], reply: Parameters<typeof sendProblem>[1]) =>
    sendProblem(req, reply, { status: 404, code: "not_found", detail: "not found", cacheControl: "public, max-age=60" });

  app.get("/api/site/leaderboard/boards/:key", guarded(async (req, reply) => {
    const key = (req.params as { key: string }).key;
    if (!(LEADERBOARD_PUBLIC_BOARDS as readonly string[]).includes(key)) return notFound(req, reply);
    const query = looseQuery(req);
    const lang = query.lang === "en" ? "en" : "zh";
    const at = parseAt(query.at);
    const body = await loadBoard(key as LeaderboardBoardKey, at ? beijingDayEnd(at) : null, lang);
    if (!body) return notFound(req, reply);
    return sendJsonWithEtag(req, reply, body, { etagPrefix: `lb-${key}-${lang}`, cacheControl: at ? PAST_SLICE_CACHE : CACHE });
  }));

  app.get("/api/site/leaderboard/models/:slug", guarded(async (req, reply) => {
    const query = looseQuery(req);
    const lang = query.lang === "en" ? "en" : "zh";
    const at = parseAt(query.at);
    const body = await loadModel((req.params as { slug: string }).slug, at ? beijingDayEnd(at) : null, lang);
    if (!body) return notFound(req, reply);
    return sendJsonWithEtag(req, reply, body, { etagPrefix: `lb-model-${lang}`, cacheControl: at ? PAST_SLICE_CACHE : CACHE });
  }));

  app.get("/api/site/leaderboard/sources", guarded(async (req, reply) => {
    const lang = looseQuery(req).lang === "en" ? "en" : "zh";
    return sendJsonWithEtag(req, reply, await loadSources(lang), { etagPrefix: `lb-sources-${lang}`, cacheControl: CACHE });
  }));

  app.get("/api/site/leaderboard/sources/:key", guarded(async (req, reply) => {
    const lang = looseQuery(req).lang === "en" ? "en" : "zh";
    const body = await loadSource((req.params as { key: string }).key, lang);
    if (!body) return notFound(req, reply);
    return sendJsonWithEtag(req, reply, body, { etagPrefix: `lb-source-${lang}`, cacheControl: CACHE });
  }));

  app.get("/api/site/leaderboard/pricing", guarded(async (req, reply) => {
    const lang = looseQuery(req).lang === "en" ? "en" : "zh";
    return sendJsonWithEtag(req, reply, await loadPricing(lang), { etagPrefix: `lb-pricing-${lang}`, cacheControl: CACHE });
  }));

  app.get("/api/site/leaderboard/pricing/compare/:pair", guarded(async (req, reply) => {
    const lang = looseQuery(req).lang === "en" ? "en" : "zh";
    const body = await loadComparison((req.params as { pair: string }).pair, lang);
    if (!body) return notFound(req, reply);
    return sendJsonWithEtag(req, reply, body, { etagPrefix: `lb-compare-${lang}`, cacheControl: CACHE });
  }));

  app.get("/api/site/leaderboard/rules", guarded(async (req, reply) => {
    const lang = looseQuery(req).lang === "en" ? "en" : "zh";
    return sendJsonWithEtag(req, reply, await loadRulesData(lang), { etagPrefix: `lb-rules-${lang}`, cacheControl: CACHE });
  }));
}
