import { useEffect, useState, type FormEvent } from "react";
import { useLoaderData } from "react-router";
import { loadOr404 } from "@aihot/web/lib/api.server";
import { useLocale, useTranslate, localeFromMatches, translate } from "@aihot/web/lib/i18n";
import { pageMeta } from "@aihot/web/lib/seo";
interface Wallpaper { id: number; day: string; title: string; preview: string }
const STORAGE = "aihot.wallpaper.key";
export const loader = ({ request }: { request: Request }) => loadOr404<Wallpaper[]>("/api/site/wallpapers", { request, signal: request.signal });
export function meta({ matches }: { matches?: Array<{ id: string; data?: unknown }> } = {}) {
  const locale = localeFromMatches(matches ?? []);
  return pageMeta({ title: translate(locale, "Daily 4K wallpaper"), description: translate(locale, "A new 4K wallpaper every day. Subscribe for 100 credits (10 credits per wallpaper)."), path: "/products/wallpaper" }, locale);
}
async function claim(body: object) {
  const res = await fetch("/api/site/wallpaper/claim", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store" });
  if (!res.ok) throw new Error("claim failed");
  return res.json();
}
export default function Page() {
  const list = useLoaderData<Wallpaper[]>();
  return <WallpaperPage list={list} />;
}
export function WallpaperPage({ list }: { list: Wallpaper[] }) {
  const tx = useTranslate();
  const lang = useLocale();
  const [key, setKey] = useState("");
  const [credits, setCredits] = useState<number | null>(null);
  const [email, setEmail] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [rotate, setRotate] = useState(false);
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState("");
  const save = (value: string) => { setKey(value); try { localStorage.setItem(STORAGE, value); } catch {} };
  useEffect(() => {
    setOrigin(location.origin);
    const params = new URLSearchParams(location.hash.slice(1));
    const incoming = params.get("key");
    const token = params.get("token");
    if (incoming || token) history.replaceState(null, "", location.pathname + location.search);
    if (incoming) save(incoming);
    else if (token) { void claim({ token }).then((data) => save(data.key)).catch(() => setNotice("Your link is invalid or your subscription is inactive. Request a new link below.")); }
    else { try { setKey(localStorage.getItem(STORAGE) ?? ""); } catch {} }
  }, []);
  useEffect(() => {
    if (!key) return;
    let active = true;
    const refresh = () => fetch(`/api/site/wallpaper/me?key=${encodeURIComponent(key)}`, { cache: "no-store" }).then(async (res) => {
      if (!active) return;
      if (res.status === 401 || res.status === 403) { setKey(""); setCredits(null); try { localStorage.removeItem(STORAGE); } catch {} setNotice("Your link is invalid or your subscription is inactive. Request a new link below."); return; }
      if (!res.ok) throw new Error();
      const data = await res.json(); if (active) setCredits(data.credits);
    }).catch(() => { if (active) setNotice("Please try again later."); });
    void refresh(); window.addEventListener("focus", refresh);
    return () => { active = false; window.removeEventListener("focus", refresh); };
  }, [key]);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setNotice("");
    try { await claim({ email, lang }); setNotice("Please check your email."); }
    catch { setNotice("Please try again later."); }
    finally { setBusy(false); }
  }
  const link = (day: string, cut: string) => `/products/wallpaper/${day}/${cut}.jpg?key=${encodeURIComponent(key)}`;
  const downloads = (day: string) => <div className="mt-3 flex flex-wrap gap-3">{["desktop", "phone"].map((cut) => <a key={cut} className="rounded-full border border-line-soft px-4 py-2" href={link(day, cut)} target="_blank" rel="noreferrer">{tx(cut === "desktop" ? "Desktop" : "Phone")}</a>)}</div>;
  return <main className="mx-auto max-w-5xl space-y-8 py-6">
    <header><div className="flex items-center gap-4"><img src="/media/products/wallpaper.svg" alt="" width={56} height={56} className="size-14 shrink-0" /><h1 className="text-3xl font-bold">{tx("Daily 4K wallpaper")}</h1></div><p className="mt-3 text-ink-3">{tx("A new 4K wallpaper every day. Subscribe for 100 credits (10 credits per wallpaper).")}</p></header>
    {list[0] ? <section><img className="w-full rounded-xl" src={list[0].preview} alt={list[0].title} width={1600} height={900} /><h2 className="mt-3 text-xl">{list[0].title} · {list[0].day}</h2>{key && downloads(list[0].day)}</section> : <p>{tx("No wallpaper yet. Check back soon.")}</p>}
    {notice && <p role="status">{tx(notice)}</p>}
    {(!key || rotate) && <form onSubmit={submit} className="card space-y-3 p-5"><label className="block">{tx("Email address")}<input className="mt-2 block w-full rounded border border-line-soft p-3" type="email" required maxLength={200} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></label><button className="rounded-full bg-accent px-5 py-3 text-white" disabled={busy}>{tx("Get my wallpaper link")}</button><p className="text-sm text-ink-3">{tx("Subscribers receive a link; new readers receive a confirmation email first.")}</p></form>}
    {key && <section className="card space-y-4 p-5"><p>{tx("Credits remaining")}: {credits ?? "…"}</p><p>{tx("Wallpapers available")}: {credits === null ? "…" : Math.floor(credits / 10)}</p>{credits !== null && credits < 10 && <p>{tx("Not enough credits for a new wallpaper. Thank you for your support.")}</p>}<h2 className="text-xl font-bold">{tx("Daily automatic updates")}</h2>
      {["desktop", "phone"].map((cut) => <div key={cut} className="flex min-w-0 flex-wrap gap-2"><input className="min-w-0 flex-1 border border-line-soft p-2" aria-label={tx(cut === "desktop" ? "Desktop" : "Phone")} readOnly value={origin + link("today", cut)} /><button onClick={async () => { try { await navigator.clipboard.writeText(origin + link("today", cut)); setCopied(cut); } catch { setNotice("Please try again later."); } }}>{tx(copied === cut ? "Copied" : "Copy")}</button></div>)}
      <p>{tx("iOS Shortcuts: Get Contents of URL → Set Wallpaper. Create a daily personal automation for 7 AM and choose Run Immediately.")}</p><p>{tx("macOS Shortcuts: Get Contents of URL → Set Desktop Picture. Schedule it daily; confirm the action names on your system version.")}</p><p>{tx("This link grants access to your credits. Do not share it.")}</p><button className="underline" onClick={() => setRotate(true)}>{tx("Request a new link")}</button></section>}
    <section><h2 className="text-2xl font-bold">{tx("Archive")}</h2><p className="my-3">{tx("The first download of each day costs 10 credits. Both sizes and repeat downloads of that day are included.")}</p><div className="grid gap-5 sm:grid-cols-2">{list.map((wallpaper) => <article key={wallpaper.id} className="card p-3"><img className="w-full rounded" src={wallpaper.preview} alt={wallpaper.title} width={1600} height={900} loading="lazy" /><h3 className="mt-3">{wallpaper.title} · {wallpaper.day}</h3>{key && downloads(wallpaper.day)}</article>)}</div></section>
  </main>;
}
