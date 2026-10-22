import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { normalizePagePath, normalizeSiteEvent, readerFilter, recordPageView, recordSiteEvent } from "@aihot/backend/site/analytics";

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

export function registerAnalytics(app: FastifyInstance) {
  const readers = readerFilter();
  app.post("/api/site/analytics", { bodyLimit: 1024 }, async (req: FastifyRequest, reply) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const path = normalizePagePath(body.path);
    // The browser marks every view after the first one in a document as an in-app navigation.
    const kind = body.nav === true ? "nav" : "load";
    if (body.event !== "page_view" || !path || !readers.view(req.headers["user-agent"] ?? "", kind) || !acceptHit()) return reply.header("Cache-Control", "no-store").code(204).send();
    await recordPageView(path);
    return reply.header("Cache-Control", "no-store").code(204).send();
  });

  // Never a cached response, including when the event is dropped.
  app.post("/api/site/events", { bodyLimit: 1024 }, async (req, reply) => {
    noStore(reply);
    const hit = normalizeSiteEvent(req.body);
    if (hit && readers.event(req.headers["user-agent"] ?? "") && acceptEvent()) await recordSiteEvent(hit.event, hit.target);
    return reply.code(204).send();
  });
}
