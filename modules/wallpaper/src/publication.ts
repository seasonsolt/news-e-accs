import { sql } from "@aihot/backend/db";
import { cached } from "@aihot/backend/lib/cache";
import { beijingDate } from "@aihot/contracts/time";
export interface Wallpaper { id: number; day: string; title: string; preview: string }
const list = cached(async () => sql<{ id: number; day: string; title_zh: string; title_en: string; preview_file: string }[]>`
  SELECT id, day::text, title_zh, title_en, preview_file FROM wallpapers
  WHERE day <= ${beijingDate(Date.now())} ORDER BY day DESC`, { freshMs: 30_000, maxStaleMs: 30_000 });
export async function wallpapers(lang = "en"): Promise<Wallpaper[]> {
  return (await list.get()).map((r) => ({ id: r.id, day: r.day, title: lang === "zh" ? r.title_zh : r.title_en, preview: `/products/wallpaper/preview/${r.preview_file}` }));
}
export async function downloadWallpaper(day: string) {
  const today = beijingDate(Date.now());
  if (day !== "today" && (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(Date.parse(day)) || new Date(day).toISOString().slice(0, 10) !== day || day > today)) return null;
  const rows = day === "today"
    ? await sql`SELECT id, day::text, desktop_file, phone_file FROM wallpapers WHERE day <= ${today} ORDER BY day DESC LIMIT 1`
    : await sql`SELECT id, day::text, desktop_file, phone_file FROM wallpapers WHERE day = ${day}`;
  return rows[0] ?? null;
}
