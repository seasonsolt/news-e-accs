// What scripts/wechat-video.ts on the editor's Mac reads to render a day's 视频号 video: the script with
// its entries, and their illustrations. It uses the video token (WECHAT_VIDEO_TOKEN), never an admin
// session; without the token on the server these answer 401.
import type { FastifyInstance } from "fastify";
import { illustrationJpeg } from "@aihot/backend/newsletter/wechat-illustrations";
import { videoSpec } from "@aihot/backend/newsletter/wechat-video";
import { tokenMatches, unauthorized } from "./ingest.ts";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function registerWechatVideo(app: FastifyInstance) {
  app.get<{ Params: { date: string } }>("/api/wechat-video/:date", async (req, reply) => {
    reply.header("Cache-Control", "no-store");
    if (!tokenMatches(req, "WECHAT_VIDEO_TOKEN")) return unauthorized(reply);
    if (!DATE.test(req.params.date)) return reply.code(400).send({ error: "date must be YYYY-MM-DD" });
    const spec = await videoSpec(req.params.date);
    return spec ?? reply.code(404).send({ error: "这一天还没有写好的口播稿：先在后台公众号工作台点「生成口播稿」。" });
  });
  app.get<{ Params: { date: string }; Querystring: { entry?: string } }>("/api/wechat-video/:date/illustration.jpg", async (req, reply) => {
    reply.header("Cache-Control", "no-store");
    if (!tokenMatches(req, "WECHAT_VIDEO_TOKEN")) return unauthorized(reply);
    if (!DATE.test(req.params.date)) return reply.code(400).send({ error: "date must be YYYY-MM-DD" });
    const jpeg = await illustrationJpeg(req.params.date, String(req.query.entry ?? ""));
    return jpeg ? reply.type("image/jpeg").send(jpeg) : reply.code(404).send({ error: "no illustration" });
  });
}
