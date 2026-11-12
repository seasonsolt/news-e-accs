// The essays' public routes: the pages' data (/api/site/essays…), their pictures and their feeds. All read
// live publications through backend/publication.ts.
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { sendJsonWithEtag, sendProblem, sendTextWithEtag, applyPublicHeaders, looseQuery } from "@aihot/api/http/respond";
import { sendFile } from "@aihot/api/routes/static";
import { siteHandler } from "@aihot/api/routes/site";
import { ESSAY_MEDIA, essayFeedPath, type EssayLanguage } from "../contracts.ts";
import { essayDir, FILE } from "../backend/store.ts";
import { essayBySlug, essayFeed, essayFileIsPublic, essayList } from "../backend/publication.ts";
import { SLUG } from "../backend/render.ts";

const CACHE = "public, max-age=120, s-maxage=300, stale-while-revalidate=3600";
const language = (q: Record<string, string>): EssayLanguage => (q.lang === "zh" ? "zh" : "en");

export function registerEssayPublic(app: FastifyInstance) {
  app.get("/api/site/essays", siteHandler(async (req, reply) =>
    sendJsonWithEtag(req, reply, await essayList(language(looseQuery(req))), { etagPrefix: "essays", cacheControl: CACHE })));

  app.get("/api/site/essays/:slug", siteHandler(async (req, reply) => {
    const { slug } = req.params as { slug: string };
    const found = SLUG.test(slug) ? await essayBySlug(slug, language(looseQuery(req))) : { kind: "not_found" as const };
    if (found.kind === "withdrawn") return sendProblem(req, reply, { status: 410, code: "gone", detail: "This essay was withdrawn." });
    if (found.kind === "not_found") return sendProblem(req, reply, { status: 404, code: "not_found", detail: "No such essay." });
    return sendJsonWithEtag(req, reply, found.essay, { etagPrefix: "essay", cacheControl: CACHE });
  }));

  // Only pictures a live essay prints; drafts' pictures stay in the admin.
  app.get(`${ESSAY_MEDIA}/:file`, async (req, reply) => {
    const { file } = req.params as { file: string };
    if (!FILE.test(file) || !(await essayFileIsPublic(file))) return reply.code(404).type("text/plain; charset=utf-8").send("Not found");
    return sendFile(req, reply, path.join(essayDir(), file), { cacheControl: "public, max-age=31536000, immutable" });
  });

  for (const lang of ["en", "zh"] as const) {
    app.get(essayFeedPath(lang), async (req, reply) => {
      applyPublicHeaders(reply, { cors: false });
      return sendTextWithEtag(req, reply, await essayFeed(lang), { etagPrefix: "rss-essays", cacheControl: "public, max-age=600, s-maxage=900", contentType: "application/rss+xml; charset=utf-8" });
    });
  }
}
