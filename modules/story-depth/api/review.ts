import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { adminHandler } from "@aihot/api/routes/admin-auth";
import { actorOf } from "@aihot/backend/admin/auth";
import { requestDepth, reviewDepth, reviewQueue } from "../backend/review.ts";

export function registerReview(app: FastifyInstance) {
  app.get("/api/admin/review", adminHandler(async (req) => {
    const query = z.object({ q: z.string().max(200).default(""), page: z.coerce.number().int().min(1).max(10000).default(1) }).parse(req.query);
    return reviewQueue(query.q, query.page);
  }));
  app.post("/api/admin/review/deepen", adminHandler(async (req, _reply, admin) => {
    const body = z.object({ storyId: z.number().int().positive() }).parse(req.body);
    return requestDepth(body.storyId, actorOf(admin));
  }));
  app.post("/api/admin/review/:id", adminHandler(async (req, _reply, admin) => {
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(req.params);
    const body = z.object({ version: z.number().int().positive(), command: z.enum(["save", "publish", "reject"]), content: z.unknown().optional(), note: z.string().max(4000).default("") }).parse(req.body);
    return reviewDepth(id, body.version, body.command, body.content, body.note, actorOf(admin));
  }));
}
