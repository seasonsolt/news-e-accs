import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { z } from "zod";
import { config } from "@aihot/backend/config";
import { sql } from "@aihot/backend/db";
import { audit } from "@aihot/backend/audit";
import { beijingDate } from "@aihot/contracts/time";
import { put, remote } from "./store.ts";
export const directory = () => path.join(config.dataDir, "uploads", "wallpapers");
const invalid = (message: string) => Object.assign(new Error(message), { statusCode: 400 });
export async function upload(body: unknown, actor: string) {
  const input = z.object({ day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), titleZh: z.string().trim().min(1).max(200), titleEn: z.string().trim().min(1).max(200), desktop: z.string(), phone: z.string(), preview: z.string() }).parse(body);
  if (!Number.isFinite(Date.parse(input.day)) || new Date(input.day).toISOString().slice(0, 10) !== input.day) throw invalid("Invalid date.");
  const sharp = (await import("sharp")).default;
  const files: Record<string, { name: string; bytes: Buffer }> = {};
  for (const kind of ["desktop", "phone", "preview"] as const) {
    const format = kind === "preview" ? "webp" : "jpeg";
    const match = new RegExp(`^data:image/${format};base64,([A-Za-z0-9+/]+={0,2})$`).exec(input[kind]);
    if (!match) throw invalid(`${kind}: expected a ${format} data URL.`);
    const bytes = Buffer.from(match[1]!, "base64");
    let meta;
    try { meta = await sharp(bytes, { limitInputPixels: 20_000_000 }).metadata(); } catch { throw invalid(`${kind}: invalid image.`); }
    if (meta.format !== format || (meta.pages ?? 1) !== 1 || meta.width !== (kind === "desktop" ? 3840 : kind === "phone" ? 2160 : 1600) || (kind !== "preview" && meta.height !== (kind === "desktop" ? 2160 : 3840))) throw invalid(`${kind}: incorrect dimensions or format.`);
    files[kind] = { name: `${kind}-${createHash("sha256").update(bytes).digest("hex")}.${kind === "preview" ? "webp" : "jpg"}`, bytes };
  }
  await mkdir(directory(), { recursive: true });
  for (const [kind, file] of Object.entries(files)) {
    if (kind !== "preview" && remote()) await put(file.name, file.bytes);
    else await writeFile(path.join(directory(), file.name), file.bytes);
  }
  const [row] = await sql`INSERT INTO wallpapers (day, title_zh, title_en, desktop_file, phone_file, preview_file)
    VALUES (${input.day}, ${input.titleZh}, ${input.titleEn}, ${files.desktop!.name}, ${files.phone!.name}, ${files.preview!.name})
    ON CONFLICT (day) DO UPDATE SET title_zh = EXCLUDED.title_zh, title_en = EXCLUDED.title_en,
      desktop_file = EXCLUDED.desktop_file, phone_file = EXCLUDED.phone_file, preview_file = EXCLUDED.preview_file
    RETURNING id`;
  await audit(actor, "wallpaper.upload", `wallpaper:${row!.id}`, null, null, { day: input.day });
  return { ok: true };
}
export async function remove(day: string, actor: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(Date.parse(day)) || new Date(day).toISOString().slice(0, 10) !== day || day <= beijingDate(Date.now())) throw invalid("Only future wallpapers can be deleted.");
  const removed = await sql`DELETE FROM wallpapers WHERE day = ${day} AND NOT EXISTS
    (SELECT 1 FROM wallpaper_downloads WHERE wallpaper_id = wallpapers.id) RETURNING id`;
  if (!removed.length) throw invalid("Wallpaper is missing or has paid downloads.");
  await audit(actor, "wallpaper.delete", `wallpaper:${removed[0]!.id}`, null, { day }, null);
  return { ok: true };
}
export async function adminList() {
  return sql`SELECT w.id, w.day::text, w.title_zh, w.title_en, w.preview_file,
    (SELECT count(*)::int FROM wallpaper_downloads d WHERE d.wallpaper_id = w.id) AS downloads
    FROM wallpapers w ORDER BY w.day DESC`;
}
