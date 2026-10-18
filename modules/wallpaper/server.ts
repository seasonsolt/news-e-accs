import path from "node:path";
import { access } from "node:fs/promises";
import { z } from "zod";
import { defineServerModule } from "@aihot/backend/modules";
import { sql } from "@aihot/backend/db";
import { actorOf } from "@aihot/backend/admin/auth";
import { NewsletterRejected } from "@aihot/backend/newsletter/subscribe";
import { siteUrl } from "@aihot/backend/publication/links";
import { adminHandler } from "@aihot/api/routes/admin-auth";
import { sendFile } from "../../apps/api/src/routes/static.ts";
import { sendJsonWithEtag, sendProblem } from "../../apps/api/src/http/respond.ts";
import { charge, keyOwner } from "./src/keys.ts";
import { claimEmail, claimToken } from "./src/claim.ts";
import { wallpapers, downloadWallpaper } from "./src/publication.ts";
import { directory, upload, remove, adminList } from "./src/admin.ts";
import { link, remote } from "./src/store.ts";
import type { FastifyReply, FastifyRequest } from "fastify";
const privateCache = "private, no-store";
const fail = (req: FastifyRequest, reply: FastifyReply, error: unknown) => {
  if (error instanceof NewsletterRejected) return sendProblem(req, reply, { status: error.status, code: error.code, detail: error.message, retryAfter: error.retryAfter, cacheControl: privateCache });
  return sendProblem(req, reply, { status: 503, code: "temporarily_unavailable", detail: "Please try again later.", cacheControl: privateCache });
};
const field = (value: unknown, name: string) => typeof (value as Record<string, unknown> | null)?.[name] === "string" ? (value as Record<string, string>)[name]! : "";
async function today() {
  const wallpaper = (await wallpapers())[0] ?? null;
  return { wallpaper, page: siteUrl("/products/wallpaper") };
}
export default defineServerModule({
  name: "wallpaper",
  http(app) {
    app.get("/api/site/wallpapers", async (req, reply) => sendJsonWithEtag(req, reply, await wallpapers(field(req.query, "lang")), { etagPrefix: "wallpapers", cacheControl: "public, max-age=60" }));
    app.get("/api/site/wallpaper/me", async (req, reply) => {
      reply.header("Cache-Control", privateCache);
      try { const owner = await keyOwner(field(req.query, "key")); return { credits: owner.credits, granted: owner.granted, used: owner.granted - owner.credits, active: owner.active }; }
      catch (error) { return fail(req, reply, error); }
    });
    app.post("/api/site/wallpaper/claim", { bodyLimit: 4096 }, async (req, reply) => {
      reply.header("Cache-Control", privateCache);
      try {
        if (req.body && Object.hasOwn(req.body, "token")) return await claimToken(field(req.body, "token"));
        const result = await claimEmail(field(req.body, "email"), field(req.body, "lang") || "en", String(req.headers["x-real-ip"] ?? req.ip), String(req.headers["user-agent"] ?? ""));
        return reply.code(202).send(result);
      } catch (error) { return fail(req, reply, error); }
    });
    app.get("/products/wallpaper/preview/:file", (req, reply) => {
      const file = field(req.params, "file");
      if (!/^preview-[a-f0-9]{64}\.webp$/.test(file)) return reply.code(404).send();
      return sendFile(req, reply, path.join(directory(), file), { cacheControl: "public, max-age=31536000, s-maxage=31536000, immutable" });
    });
    app.get("/products/wallpaper/:day/:kind", async (req, reply) => {
      reply.header("Cache-Control", privateCache);
      try {
        const owner = await keyOwner(field(req.query, "key"));
        const kind = field(req.params, "kind");
        if (kind !== "desktop.jpg" && kind !== "phone.jpg") return reply.code(404).send();
        const wallpaper = await downloadWallpaper(field(req.params, "day"));
        if (!wallpaper) return reply.code(404).send();
        const cut = kind === "desktop.jpg" ? "desktop" : "phone";
        const name = wallpaper[`${cut}_file`];
        const filename = `e-acc-wallpaper-${wallpaper.day}-${cut}.jpg`;
        if (remote()) {
          await charge(owner.subscriber_id, wallpaper.id);
          return reply.redirect(link(name, filename), 302);
        }
        const file = path.join(directory(), name);
        try { await access(file); } catch { return reply.code(404).send(); }
        await charge(owner.subscriber_id, wallpaper.id);
        reply.header("Content-Disposition", `inline; filename="${filename}"`);
        return await sendFile(req, reply, file, { cacheControl: privateCache });
      } catch (error) { return fail(req, reply, error); }
    });
    app.get("/api/admin/wallpapers", adminHandler(async () => adminList()));
    app.post("/api/admin/wallpapers", { bodyLimit: 32 * 1024 * 1024 }, adminHandler(async (req, _reply, admin) => upload(req.body, actorOf(admin))));
    app.delete("/api/admin/wallpapers/:day", adminHandler(async (req, _reply, admin) => remove(field(req.params, "day"), actorOf(admin))));
  },
  agent: { abilities: [{ path: "/wallpaper", title: "每日壁纸", ask: "今天的壁纸", answer: async () => JSON.stringify(await today()), etagPrefix: "wallpaper", cacheControl: "public, max-age=60", mcp: {
    tool: "wallpaper_today", use: "for today's wallpaper preview", description: "Today's public wallpaper preview and product page. No key or credit required.", input: z.object({}),
    run: async () => { const data = await today(); return { text: JSON.stringify(data), structured: data }; },
  } }] },
  sitemap: { pages: [{ loc: "/products/wallpaper", changefreq: "daily", priority: 0.7 }] },
  admin: { counts: {
    wallpaperKeys: async () => (await sql`SELECT count(*)::int AS n FROM wallpaper_keys`)[0]!.n,
    wallpaperDownloads: async () => (await sql`SELECT count(*)::int AS n FROM wallpaper_downloads WHERE first_at >= date_trunc('day', now() AT TIME ZONE 'Asia/Shanghai') AT TIME ZONE 'Asia/Shanghai'`)[0]!.n,
  } },
});
