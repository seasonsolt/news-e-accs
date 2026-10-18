import { useState, type FormEvent } from "react";
import { useLoaderData } from "react-router";
import { adminGet } from "@aihot/web/lib/admin.server";
import { useAdminAction } from "@aihot/web/features/admin/action";
import { beijingDate } from "@aihot/contracts/time";
interface Row { id: number; day: string; title_zh: string; title_en: string; preview_file: string; downloads: number }
export const loader = ({ request }: { request: Request }) => adminGet<Row[]>(request, "/api/admin/wallpapers");
export const meta = () => [{ title: "每日壁纸" }, { name: "robots", content: "noindex" }];
const dataUrl = (file: File) => new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(file); });
export default function Admin() {
  const rows = useLoaderData<Row[]>();
  const action = useAdminAction();
  const [error, setError] = useState("");
  const [reading, setReading] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setReading(true); setError("");
    const form = new FormData(event.currentTarget);
    try {
      const body: Record<string, string> = { day: String(form.get("day")), titleZh: String(form.get("titleZh")), titleEn: String(form.get("titleEn")) };
      for (const kind of ["desktop", "phone", "preview"]) { const file = form.get(kind) as File; if (!file?.size || file.size > 20 * 1024 * 1024) throw new Error("请选择不超过 20 MB 的图片；总请求上限 32 MB。"); body[kind] = await dataUrl(file); }
      await action.run("POST", "/api/admin/wallpapers", body, { success: "壁纸已保存" });
    } catch (e) { setError(String(e)); } finally { setReading(false); }
  }
  return <div className="space-y-6"><h1 className="text-2xl font-bold">每日壁纸</h1><p>北京日期上线；可以提前上传。相同日期覆盖，已上线或有人下载的壁纸不能删除。</p><form onSubmit={submit} className="card grid gap-4 p-5">
    <label>上线日期<input name="day" type="date" required className="ml-3 border p-2" /></label>
    <label>中文标题<input name="titleZh" required maxLength={200} className="ml-3 border p-2" /></label>
    <label>英文标题<input name="titleEn" required maxLength={200} className="ml-3 border p-2" /></label>
    {[["desktop", "桌面 JPEG 3840×2160"], ["phone", "手机 JPEG 2160×3840"], ["preview", "预览 WebP 宽 1600"]].map(([name, label]) => <label key={name}>{label}<input className="block" name={name} type="file" required accept={name === "preview" ? "image/webp" : "image/jpeg"} /></label>)}
    <button disabled={action.busy || reading} className="rounded border p-3">上传</button>{error && <p role="alert">{error}</p>}
  </form><div className="grid gap-4 sm:grid-cols-2">{rows.map((row) => <article key={row.id} className="card p-4"><img src={`/products/wallpaper/preview/${row.preview_file}`} alt="" className="w-full" /><h2>{row.day} · {row.title_zh}</h2><p>{row.title_en}</p><p>下载人数：{row.downloads}</p>{row.day > beijingDate(Date.now()) && row.downloads === 0 && <button onClick={() => action.run("DELETE", `/api/admin/wallpapers/${row.day}`, undefined, { success: "已删除" })} disabled={action.busy}>删除</button>}</article>)}</div></div>;
}
