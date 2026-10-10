import type { FastifyInstance, FastifyRequest } from "fastify";
import { normalizePagePath, recordPageView } from "@aihot/backend/site/analytics";

const minute = 60_000;
let bucket = { start: 0, count: 0 };

function acceptHit(now = Date.now()): boolean {
  if (now - bucket.start >= minute) {
    bucket = { start: now, count: 0 };
  }
  bucket.count++;
  return bucket.count <= 6_000;
}

export function registerAnalytics(app: FastifyInstance) {
  app.post("/api/site/analytics", { bodyLimit: 1024 }, async (req: FastifyRequest, reply) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const path = normalizePagePath(body.path);
    if (body.event !== "page_view" || !path || !acceptHit()) return reply.header("Cache-Control", "no-store").code(204).send();
    await recordPageView(path);
    return reply.header("Cache-Control", "no-store").code(204).send();
  });
}
