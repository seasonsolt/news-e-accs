// The writing desk's admin routes (/api/admin/essays…). Model work is only queued here; see backend/tasks.ts.
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { adminHandler } from "@aihot/api/routes/admin-auth";
import { sendObject } from "@aihot/api/routes/static";
import { actorOf } from "@aihot/backend/admin/auth";
import { ESSAY_LANGUAGES } from "../contracts.ts";
import {
  chooseCandidate, createEssay, dismissTask, essayDetail, FILE, listEssays, PICTURES, previewEssay, publishEssay, removeImage, requestTask,
  resolveRevision, revisionContent, saveEssay, saveImage, uploadImage, withdrawEssay,
} from "../backend/store.ts";
import { essayStyles, publicStyle, removeStyle, uploadStyle } from "../backend/styles.ts";
import { enqueueEssayTask } from "../backend/tasks.ts";

const Id = z.object({ id: z.coerce.number().int().positive() });
const Version = z.object({ version: z.number().int().positive() });
const Edition = z.object({ title: z.string(), dek: z.string(), description: z.string(), body: z.string() });
const Language = z.enum(ESSAY_LANGUAGES as ["en", "zh"]);
const Alt = z.object({ en: z.string().optional(), zh: z.string().optional() });

function decodeImage(dataUrl: string): Buffer {
  const m = /^data:image\/(png|jpeg|webp);base64,(.+)$/s.exec(dataUrl);
  if (!m) throw Object.assign(new Error("图片要是 PNG、JPEG 或 WebP。"), { statusCode: 400 });
  return Buffer.from(m[2]!, "base64");
}

export function registerEssayAdmin(app: FastifyInstance) {
  app.get("/api/admin/essays", adminHandler(async () => listEssays()));
  app.post("/api/admin/essays", adminHandler(async (req, _reply, admin) => {
    const body = z.object({ fragments: z.string().default(""), refs: z.array(z.string()).default([]), style: z.string().optional() }).parse(req.body);
    return createEssay(body, actorOf(admin));
  }));
  app.get("/api/admin/essays/media/:file", adminHandler(async (req, reply) => {
    const { file } = z.object({ file: z.string() }).parse(req.params);
    if (!FILE.test(file)) return reply.code(404).send("Not found");
    return sendObject(req, reply, `${PICTURES}/${file}`, { cacheControl: "private, max-age=31536000, immutable" });
  }));
  app.get("/api/admin/essays/styles", adminHandler(async () => ({ styles: (await essayStyles()).map(publicStyle) })));
  app.post("/api/admin/essays/styles", adminHandler(async (req, _reply, admin) => {
    const body = z.object({
      name: z.string().max(64).optional(),
      files: z.array(z.object({ path: z.string().min(1).max(300), content: z.string() })).max(500).optional(),
      archive: z.string().optional(),
    }).refine((b) => !!b.files?.length !== !!b.archive, "上传一个压缩包，或一组文件。").parse(req.body);
    return uploadStyle(body, actorOf(admin));
  }));
  app.delete("/api/admin/essays/styles/:name", adminHandler(async (req, _reply, admin) => {
    const { name } = z.object({ name: z.string() }).parse(req.params);
    return removeStyle(name, actorOf(admin));
  }));
  app.get("/api/admin/essays/:id", adminHandler(async (req) => essayDetail(Id.parse(req.params).id)));
  app.post("/api/admin/essays/:id", adminHandler(async (req, _reply, admin) => {
    const body = Version.extend({
      slug: z.string().optional(), style: z.string().optional(), fragments: z.string().optional(), refs: z.array(z.string()).optional(), outline: z.string().optional(),
      editions: z.object({ en: Edition.optional(), zh: Edition.optional() }).optional(),
    }).parse(req.body);
    return saveEssay(Id.parse(req.params).id, body, actorOf(admin));
  }));
  app.get("/api/admin/essays/:id/revisions/:revision", adminHandler(async (req) => {
    const { id, revision } = Id.extend({ revision: z.coerce.number().int().positive() }).parse(req.params);
    return revisionContent(id, revision);
  }));
  app.post("/api/admin/essays/:id/preview", adminHandler(async (req) => {
    const body = z.object({ language: Language, body: z.string().max(200_000) }).parse(req.body);
    return previewEssay(Id.parse(req.params).id, body.language, body.body);
  }));
  app.post("/api/admin/essays/:id/tasks", adminHandler(async (req, _reply, admin) => {
    const body = z.object({
      version: z.number().int().positive().optional(), kind: z.enum(["outline", "draft", "revise", "localize", "search", "draw"]),
      language: Language.optional(), section: z.number().int().min(0).optional(), instruction: z.string().optional(), slot: z.string().optional(),
    }).parse(req.body);
    const { version = 0, ...request } = body;
    return requestTask(Id.parse(req.params).id, version, request, actorOf(admin), enqueueEssayTask);
  }));
  app.post("/api/admin/essays/:id/tasks/:task", adminHandler(async (req, _reply, admin) => {
    const { id, task } = Id.extend({ task: z.coerce.number().int().positive() }).parse(req.params);
    const body = z.object({ command: z.enum(["accept", "discard", "dismiss"]), version: z.number().int().positive().optional() }).parse(req.body);
    if (body.command === "dismiss") return dismissTask(id, task, actorOf(admin));
    return resolveRevision(id, task, body.version ?? 0, body.command === "accept", actorOf(admin));
  }));
  app.post("/api/admin/essays/:id/images/:slot", adminHandler(async (req, _reply, admin) => {
    const { id, slot } = Id.extend({ slot: z.string() }).parse(req.params);
    const body = z.object({ prompt: z.string().optional(), alt: Alt.optional(), choose: z.string().optional(), image: z.string().optional() }).parse(req.body);
    if (body.choose) return chooseCandidate(id, slot, body.choose, actorOf(admin));
    if (body.image) return uploadImage(id, slot, decodeImage(body.image), actorOf(admin));
    return saveImage(id, slot, { prompt: body.prompt, alt: body.alt }, actorOf(admin));
  }));
  app.delete("/api/admin/essays/:id/images/:slot", adminHandler(async (req, _reply, admin) => {
    const { id, slot } = Id.extend({ slot: z.string() }).parse(req.params);
    return removeImage(id, slot, actorOf(admin));
  }));
  app.post("/api/admin/essays/:id/publish", adminHandler(async (req, _reply, admin) => publishEssay(Id.parse(req.params).id, Version.parse(req.body).version, actorOf(admin))));
  app.post("/api/admin/essays/:id/withdraw", adminHandler(async (req, _reply, admin) => withdrawEssay(Id.parse(req.params).id, Version.parse(req.body).version, actorOf(admin))));
}
