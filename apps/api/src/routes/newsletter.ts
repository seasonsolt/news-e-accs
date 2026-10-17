import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { confirm, NewsletterRejected, subscribe, subscribeLanguage } from "@aihot/backend/newsletter/subscribe";
import { sendProblem } from "../http/respond.ts";

function field(body: unknown, key: string): string {
  const value = (body ?? {}) as Record<string, unknown>;
  return typeof value[key] === "string" ? (value[key] as string) : "";
}

function fail(req: FastifyRequest, reply: FastifyReply, error: unknown, what: string) {
  if (error instanceof NewsletterRejected) return sendProblem(req, reply, { status: error.status, code: error.code, detail: error.message, retryAfter: error.retryAfter });
  req.log.error({ err: error }, `newsletter ${what} failed`);
  return sendProblem(req, reply, { status: 503, code: "temporarily_unavailable", detail: "暂时无法完成，请稍后再试。", retryAfter: 30 });
}

export function registerNewsletter(app: FastifyInstance) {
  app.post("/api/site/newsletter/subscribe", { bodyLimit: 4 * 1024 }, async (req, reply) => {
    try {
      // The form sends the page locale. Accept-Language is not read.
      const language = subscribeLanguage((req.body as { language?: unknown } | null)?.language);
      const ip = String(req.headers["x-real-ip"] ?? req.ip ?? "");
      const result = await subscribe({ language, email: field(req.body, "email"), ip, userAgent: String(req.headers["user-agent"] ?? "") });
      return reply.header("Cache-Control", "no-store").code(202).send(result);
    } catch (error) {
      return fail(req, reply, error, "subscribe");
    }
  });
  app.post("/api/site/newsletter/confirm", { bodyLimit: 4 * 1024 }, async (req, reply) => {
    try {
      return reply.header("Cache-Control", "no-store").send(await confirm(field(req.body, "token")));
    } catch (error) {
      return fail(req, reply, error, "confirm");
    }
  });
}
