// RSS routes. Unknown query parameters are accepted and never change content.
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { feedCacheControl, isFeedCategory, itemFeed, reportFeed, type ItemFeedKind } from "@aihot/backend/publication/feeds";
import { requestNotice, serverModules } from "@aihot/backend/modules";
import { applyPublicHeaders, sendTextWithEtag } from "../http/respond.ts";

async function sendFeed(req: FastifyRequest, reply: FastifyReply, xml: string, cacheControl: string) {
  applyPublicHeaders(reply, { cors: false });
  for (const m of serverModules()) m.on?.exitServed?.("rss", req);
  return sendTextWithEtag(req, reply, xml, { etagPrefix: "rss", cacheControl, contentType: "application/rss+xml; charset=utf-8" });
}

/** A module's reminder for the person behind the request, ahead of the feed at a path (publication/feeds). */
const noticeFor = (req: FastifyRequest) => (feedPath: string) => requestNotice("feed", req, feedPath);

function feedError(reply: FastifyReply) {
  return reply.code(503).header("Retry-After", "60").header("Cache-Control", "no-store").type("text/plain; charset=utf-8").send("Feed temporarily unavailable");
}

export function registerFeeds(app: FastifyInstance) {
  // A preflight gets 204 and the allowed methods; feeds send no CORS headers.
  for (const url of ["/feed.xml", "/feed/picks.xml", "/feed/full.xml", "/feed/all.xml", "/feed/daily.xml", "/feed/weekly.xml", "/feed/monthly.xml", "/feed/category/:file", "/feed/full/category/:file"]) {
    app.options(url, async (_req, reply) => reply.code(204).header("Allow", "GET, HEAD, OPTIONS").send());
  }
  const item = (kind: ItemFeedKind) => async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      return await sendFeed(req, reply, await itemFeed(kind, null, { notice: noticeFor(req) }), feedCacheControl(kind));
    } catch (error) {
      req.log.error({ err: error }, "feed error");
      return feedError(reply);
    }
  };
  // /feed.xml is e-acc.ai's acceleration-log feed once this site is served there; picks live at /feed/picks.xml.
  app.get("/feed/picks.xml", item("selected"));
  app.get("/feed.xml", item("selected"));
  app.get("/feed/full.xml", item("selected-full"));
  app.get("/feed/all.xml", item("all"));
  for (const kind of ["daily", "weekly", "monthly"] as const) {
    app.get(`/feed/${kind}.xml`, async (req, reply) => {
      try {
        return await sendFeed(req, reply, await reportFeed(kind, noticeFor(req)), feedCacheControl(kind));
      } catch (error) {
        req.log.error({ err: error }, "feed error");
        return feedError(reply);
      }
    });
  }
  for (const full of [false, true]) {
    app.get(full ? "/feed/full/category/:file" : "/feed/category/:file", async (req, reply) => {
      const file = (req.params as { file: string }).file;
      const slug = file.replace(/\.xml$/, "");
      if (!file.endsWith(".xml") || !isFeedCategory(slug)) return reply.code(404).type("text/plain; charset=utf-8").send("Not found");
      const kind = full ? "selected-full" : "selected";
      try {
        return await sendFeed(req, reply, await itemFeed(kind, slug, { notice: noticeFor(req) }), feedCacheControl(kind));
      } catch (error) {
        req.log.error({ err: error }, "feed error");
        return feedError(reply);
      }
    });
  }
  // Explicitly versioned feeds default to English; existing feed addresses remain compatible.
  for (const lang of ["en", "zh"] as const) {
    const prefix = `/feed/v2${lang === "zh" ? "/zh" : ""}`;
    for (const [file, kind] of [["picks", "selected"], ["full", "selected-full"], ["all", "all"]] as const) {
      app.get(`${prefix}/${file}.xml`, async (req, reply) => {
        try { return await sendFeed(req, reply, await itemFeed(kind, null, { lang, notice: noticeFor(req) }), feedCacheControl(kind)); }
        catch (error) { req.log.error({ err: error }, "feed error"); return feedError(reply); }
      });
    }
    for (const kind of ["daily", "weekly", "monthly"] as const) {
      app.get(`${prefix}/${kind}.xml`, async (req, reply) => {
        try { return await sendFeed(req, reply, await reportFeed(kind, noticeFor(req), lang), feedCacheControl(kind)); }
        catch (error) { req.log.error({ err: error }, "feed error"); return feedError(reply); }
      });
    }
    for (const full of [false, true]) {
      app.get(`${prefix}/${full ? "full/" : ""}category/:file`, async (req, reply) => {
        const file = (req.params as { file: string }).file;
        const category = file.replace(/\.xml$/, "");
        if (!file.endsWith(".xml") || !isFeedCategory(category)) return reply.code(404).send("Not found");
        const kind = full ? "selected-full" : "selected";
        try { return await sendFeed(req, reply, await itemFeed(kind, category, { lang, notice: noticeFor(req) }), feedCacheControl(kind)); }
        catch (error) { req.log.error({ err: error }, "feed error"); return feedError(reply); }
      });
    }
    app.options(`${prefix}/*`, async (_req, reply) => reply.code(204).header("Allow", "GET, HEAD, OPTIONS").send());
  }

}
