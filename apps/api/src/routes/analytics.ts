import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { namedBot, normalizePagePath, normalizeSiteEvent, readerFilter, recordPageView, recordSiteEvent } from "@aihot/backend/site/analytics";
import { recordFilteredView, recordSessionEngagement, recordSessionEvent, recordSessionView } from "@aihot/backend/site/sessions";
import { distributionChannel } from "@aihot/contracts/distribution";
import { clientIp } from "../http/respond.ts";

const minute = 60_000;

function limiter(max: number) {
  let bucket = { start: 0, count: 0 };
  return (now = Date.now()) => {
    if (now - bucket.start >= minute) bucket = { start: now, count: 0 };
    bucket.count++;
    return bucket.count <= max;
  };
}

const acceptHit = limiter(6_000);
const acceptEvent = limiter(6_000);

function noStore(reply: FastifyReply) {
  return reply.header("Cache-Control", "private, no-store").header("CDN-Cache-Control", "no-store");
}

/** The visitor's country as the edge saw it (apps/web/server.ts passes it on only from the edge). */
function country(req: FastifyRequest): string {
  const value = String(req.headers["x-eacc-country"] ?? "").toUpperCase();
  return /^[A-Z]{2}$/.test(value) && value !== "XX" && value !== "T1" ? value : "";
}

export function registerAnalytics(app: FastifyInstance) {
  const readers = readerFilter();
  app.post("/api/site/analytics", { bodyLimit: 2048 }, async (req: FastifyRequest, reply) => {
    noStore(reply).code(204);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const path = typeof body.path === "string" ? body.path : "";
    const route = normalizePagePath(path);
    const ua = req.headers["user-agent"] ?? "";
    if (!route) return reply.send();
    if (body.event === "page_leave") {
      // Visible time on a page that was counted; the same filters as an interaction.
      if (body.own !== true && typeof body.ms === "number" && readers.event(ua) && acceptEvent()) {
        await recordSessionEngagement({ ip: clientIp(req), userAgent: ua, path, ms: body.ms });
      }
      return reply.send();
    }
    if (body.event !== "page_view") return reply.send();
    // The browser marks every view after the first one in a document as an in-app navigation.
    const kind = body.nav === true ? "nav" : "load";
    // The owner's browser marks itself after opening the admin; a browser driven by automation says so.
    const filtered = body.own === true ? "owner" : body.wd === true ? "automation" : namedBot(ua) ? "agent" : !readers.view(ua, kind) ? "reloads" : null;
    if (filtered) {
      if (acceptHit()) await recordFilteredView(filtered);
      return reply.send();
    }
    if (!acceptHit()) return reply.send();
    const utm = body.utm && typeof body.utm === "object" && !Array.isArray(body.utm) ? body.utm as Record<string, unknown> : null;
    await Promise.all([
      recordPageView(route),
      recordSessionView({
        ip: clientIp(req), userAgent: ua, path, route, load: kind === "load",
        referrer: body.ref, utm, via: distributionChannel(body.via), touch: body.touch === true,
        country: country(req), language: body.lang, firstSeen: body.first, prevSeen: body.prev,
      }),
    ]);
    return reply.send();
  });

  // Never a cached response, including when the event is dropped.
  app.post("/api/site/events", { bodyLimit: 1024 }, async (req, reply) => {
    noStore(reply);
    const hit = normalizeSiteEvent(req.body);
    const ua = req.headers["user-agent"] ?? "";
    const own = (req.body as { own?: unknown } | null)?.own === true;
    if (hit && !own && readers.event(ua) && acceptEvent()) {
      await Promise.all([
        recordSiteEvent(hit.event, hit.target),
        recordSessionEvent({ ip: clientIp(req), userAgent: ua, event: hit.event, target: hit.target }),
      ]);
    }
    return reply.code(204).send();
  });
}
