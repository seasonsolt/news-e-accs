import { SITE } from "@aihot/site";
import type { AdminMe } from "@aihot/contracts/admin";
import { useCallback, useEffect, useReducer, useRef, useState, type ReactNode } from "react";
import { data, Link, useBlocker, useLoaderData, useRouteLoaderData } from "react-router";
import { useAdminAction } from "@aihot/web/features/admin/action";
import { bj } from "@aihot/web/features/admin/format";
import { toast } from "@aihot/web/features/admin/toast";
import { AdminPage, Badge, Button, Card, DataTable, Field, Input, Select, Textarea, Time } from "@aihot/web/features/admin/ui";
import { adminGet } from "@aihot/web/lib/admin.server";
import type { EssayDetail, EssayEdition, EssayImage, EssayLanguage, EssayRevision, EssaySave, EssayStatus, EssayTask, EssayTaskKind, EssayTaskRequest } from "../../contracts.ts";
import styles from "../essays.css?url";

export async function loader({ request, params }: { request: Request; params: { id?: string } }) {
  if (!/^\d+$/.test(params.id ?? "")) throw data({ message: "not_found" }, { status: 404 });
  return adminGet<EssayDetail>(request, `/api/admin/essays/${params.id}`);
}

export const meta = () => [{ title: `写作台 · ${SITE.name} 后台` }, { name: "robots", content: "noindex" }];
export const links = () => [{ rel: "stylesheet", href: styles }];

const KIND: Record<EssayTaskKind, string> = { outline: "提纲", draft: "成稿", revise: "单节重写", localize: "中文版", search: "搜图", draw: "画图" };
const SOURCE: Record<EssayRevision["source"], string> = { outline: "生成提纲", draft: "成稿", revise: "单节重写", localize: "出中文版", manual: "手动保存" };
const STATUS: Record<EssayStatus, { label: string; tone: "muted" | "ok" | "warn" }> = {
  draft: { label: "草稿", tone: "muted" },
  published: { label: "已发布", tone: "ok" },
  withdrawn: { label: "已撤下", tone: "warn" },
};
const LANGUAGE: Record<EssayLanguage, string> = { en: "英文稿", zh: "中文版" };
const TEXT_KINDS: EssayTaskKind[] = ["outline", "draft", "revise", "localize"];
/** How often the page asks again while the worker has work queued or running. */
const POLL_MS = 3000;
/** How long typing pauses before the preview is rendered again. */
const PREVIEW_AFTER_MS = 600;
/** The api takes requests up to 10 MB; a picture travels as base64 (4/3 of its size). */
const UPLOAD_MAX_BYTES = 7 * 1024 * 1024;
const MEDIA = "/api/admin/essays/media";

// The author's text, part by part: each part is saved, merged and conflicted on its own.
type Part = "slug" | "style" | "fragments" | "refs" | "outline" | EssayLanguage;
const PARTS: Part[] = ["slug", "style", "fragments", "refs", "outline", "en", "zh"];
const PART_NAME: Record<Part, string> = { slug: "网址", style: "文风", fragments: "碎片", refs: "参考", outline: "提纲", en: "英文稿", zh: "中文版" };
interface Text { slug: string; style: string; fragments: string; refs: string; outline: string; en: EssayEdition; zh: EssayEdition }
/** A picture slot's words, saved through the images endpoint. */
interface Words { prompt: string; en: string; zh: string }
const NO_WORDS: Words = { prompt: "", en: "", zh: "" };

const refsOf = (text: string) => text.split("\n").map((l) => l.trim()).filter(Boolean);
const textOf = (d: EssayDetail): Text => ({ slug: d.slug, style: d.style, fragments: d.fragments, refs: d.refs.join("\n"), outline: d.outline, en: d.editions.en, zh: d.editions.zh });
const same = (p: Part, a: Text, b: Text) => (p === "refs" ? refsOf(a.refs).join("\n") === refsOf(b.refs).join("\n") : JSON.stringify(a[p]) === JSON.stringify(b[p]));
const wordsOf = (d: EssayDetail): Record<string, Words> => Object.fromEntries(d.images.map((i) => [i.slot, { prompt: i.prompt, en: i.alt.en ?? "", zh: i.alt.zh ?? "" }]));
const sameWords = (a: Words | undefined, b: Words | undefined) => JSON.stringify(a ?? NO_WORDS) === JSON.stringify(b ?? NO_WORDS);
const active = (t: EssayTask) => t.status === "queued" || t.status === "running";
const checks = (e: EssayEdition) => [e.title, e.dek, e.description, e.body].reduce((n, t) => n + (t.match(/\[\[check:/gi)?.length ?? 0), 0);
const figuresIn = (body: string) => [...new Set([...body.matchAll(/\[\[(figure-[1-9])\]\]/g)].map((m) => m[1]!))];
const slotOrder = (slot: string) => (slot === "cover" ? 0 : Number(slot.slice(7)));

/** The body cut at its `## ` lines as the worker cuts it (backend/render.ts `sections`): index 0 is the text before the first. */
function sections(body: string): string[] {
  const out: string[] = [];
  let current: string[] = [];
  for (const line of body.split("\n")) {
    if (/^## /.test(line) && (current.length || out.length)) {
      out.push(current.join("\n"));
      current = [];
    }
    current.push(line);
  }
  out.push(current.join("\n"));
  return out;
}

interface Desk {
  detail: EssayDetail;
  /** The version the author's edits stand on, and the text it had. */
  version: number;
  base: Text;
  draft: Text;
  wordsBase: Record<string, Words>;
  words: Record<string, Words>;
  /** Parts changed both here (unsaved) and on the server since. */
  conflicts: Part[];
}

type Action =
  | { type: "edit"; patch: Partial<Text> }
  | { type: "words"; slot: string; patch: Partial<Words> }
  | { type: "drop"; slot: string }
  | { type: "receive"; detail: EssayDetail; sent?: { text: Text; words: Record<string, Words> }; resolve?: "server" | "mine" };

function start(detail: EssayDetail): Desk {
  const text = textOf(detail);
  const words = wordsOf(detail);
  return { detail, version: detail.version, base: text, draft: text, wordsBase: words, words, conflicts: [] };
}

/**
 * Takes the server's essay. Parts the author has not touched follow the server; parts only the author changed
 * stay theirs on the new version; a part both changed is a conflict until the author picks a side. `sent` is
 * what a save just sent, which the server now holds.
 */
function receive(s: Desk, detail: EssayDetail, sent?: { text: Text; words: Record<string, Words> }, resolve?: "server" | "mine"): Desk {
  const server = textOf(detail);
  const was = sent?.text ?? s.base;
  const base = { ...server };
  const draft = { ...s.draft };
  const conflicts: Part[] = [];
  for (const p of PARTS) {
    const mine = !same(p, s.draft, was);
    if (!mine) {
      if (!same(p, server, s.draft)) Object.assign(draft, { [p]: server[p] });
    } else if (!same(p, server, was) && !same(p, server, s.draft)) {
      if (resolve === "server") Object.assign(draft, { [p]: server[p] });
      else if (resolve !== "mine") {
        conflicts.push(p);
        Object.assign(base, { [p]: was[p] });
      }
    }
  }
  const serverWords = wordsOf(detail);
  const wasWords = sent?.words ?? s.wordsBase;
  const words: Record<string, Words> = {};
  for (const slot of new Set([...Object.keys(serverWords), ...Object.keys(s.words)])) {
    const mine = !sameWords(s.words[slot], wasWords[slot]);
    if (mine || !(slot in serverWords)) {
      // A slot added here and not saved yet stays; one removed on the server goes.
      if (mine || !(slot in wasWords)) words[slot] = s.words[slot]!;
    } else words[slot] = serverWords[slot]!;
  }
  return { detail, version: conflicts.length ? s.version : detail.version, base, draft, wordsBase: serverWords, words, conflicts };
}

function reduce(s: Desk, a: Action): Desk {
  switch (a.type) {
    case "edit":
      return { ...s, draft: { ...s.draft, ...a.patch } };
    case "words":
      return { ...s, words: { ...s.words, [a.slot]: { ...(s.words[a.slot] ?? NO_WORDS), ...a.patch } } };
    case "drop": {
      const { [a.slot]: _w, ...words } = s.words;
      const { [a.slot]: _b, ...wordsBase } = s.wordsBase;
      return { ...s, words, wordsBase };
    }
    case "receive":
      return receive(s, a.detail, a.sent, a.resolve);
  }
}

const dirtyParts = (s: Desk) => PARTS.filter((p) => !same(p, s.draft, s.base));
const dirtySlots = (s: Desk) => Object.keys(s.words).filter((slot) => !sameWords(s.words[slot], s.wordsBase[slot]));

async function getJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(path, { credentials: "same-origin", headers: { accept: "application/json" } });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

function readDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

const host = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

function Notice({ tone = "warn", children }: { tone?: "warn" | "bad" | "info"; children: ReactNode }) {
  const color = tone === "bad" ? "bg-hot-soft text-hot ring-hot/25" : tone === "info" ? "bg-accent-soft text-ink-2 ring-accent/20" : "bg-amber-soft text-amber-ink ring-amber/25";
  return <div className={`rounded-control px-3 py-2 text-[13px] leading-relaxed ring-1 ${color}`}>{children}</div>;
}

/** The body as the public page prints it, rendered by the api a moment after typing stops. */
function Preview({ id, language, body, pictures }: { id: number; language: EssayLanguage; body: string; pictures: string }) {
  const csrf = (useRouteLoaderData("admin-layout") as { me: AdminMe } | undefined)?.me.csrf ?? "";
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const abort = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/essays/${id}/preview`, {
          method: "POST", credentials: "same-origin", signal: abort.signal,
          headers: { "content-type": "application/json", "x-csrf-token": csrf },
          body: JSON.stringify({ language, body }),
        });
        const json = (await res.json()) as { html?: string; detail?: string };
        if (!res.ok) throw new Error(json.detail ?? `预览失败（${res.status}）`);
        setHtml(json.html ?? "");
        setError(null);
      } catch (e) {
        if (!abort.signal.aborted) setError(e instanceof Error ? e.message : "预览失败");
      }
    }, PREVIEW_AFTER_MS);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [id, language, body, pictures, csrf]);
  return (
    <div className="rounded-panel bg-bg px-5 py-4 ring-1 ring-line">
      {error && <p className="mb-2 text-[12.5px] text-hot">{error}</p>}
      {html === null
        ? <p className="text-[13px] text-ink-4">预览载入中…</p>
        : (
          // The public page's own classes (../essays.css), so the preview reads as the published essay will.
          <div className="essay" lang={language} style={{ padding: 0 }}>
            <div
              className="essay-body !mt-0 [&_.essay-figure-missing]:rounded-tile [&_.essay-figure-missing]:border-2 [&_.essay-figure-missing]:border-dashed [&_.essay-figure-missing]:border-line-strong [&_.essay-figure-missing]:py-8 [&_.essay-figure-missing]:text-center [&_.essay-figure-missing]:font-mono [&_.essay-figure-missing]:text-ink-4"
              dangerouslySetInnerHTML={{ __html: html || "<p>（正文是空的）</p>" }}
            />
          </div>
        )}
    </div>
  );
}

function DeskView({ initial }: { initial: EssayDetail }) {
  const { run, pending } = useAdminAction();
  const [state, dispatch] = useReducer(reduce, initial, start);
  const ref = useRef(state);
  ref.current = state;
  const { detail: d, draft } = state;
  const id = d.id;
  const parts = dirtyParts(state);
  const slots = dirtySlots(state);
  const dirty = parts.length > 0 || slots.length > 0;

  const take = useCallback((detail: EssayDetail | null, resolve?: "server" | "mine") => {
    if (detail) dispatch({ type: "receive", detail, resolve });
    return detail;
  }, []);

  const polling = useRef(false);
  const refresh = useCallback(async () => {
    if (polling.current) return null;
    polling.current = true;
    const before = ref.current.detail.tasks.filter(active);
    const next = await getJson<EssayDetail>(`/api/admin/essays/${id}`);
    polling.current = false;
    if (!next) return null;
    for (const t of before) {
      const now = next.tasks.find((x) => x.id === t.id);
      if (now?.status === "done") toast(now.kind === "revise" ? "单节重写好了，在下面对比后采纳或丢弃" : `${KIND[now.kind]}完成`, "ok");
      else if (now?.status === "failed") toast(`${KIND[now.kind]}失败：${now.error ?? ""}`, "error");
    }
    return take(next);
  }, [id, take]);

  const working = d.tasks.some(active);
  useEffect(() => {
    if (!working) return;
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [working, refresh]);

  /** Saves every changed part and picture slot; resolves to the saved essay, or null when something was refused. */
  const save = useCallback(async (): Promise<EssayDetail | null> => {
    const s = ref.current;
    if (s.conflicts.length) {
      toast("先处理上面的冲突，再保存。", "error");
      return null;
    }
    const changed = dirtyParts(s);
    let next: EssayDetail | null = null;
    if (changed.length) {
      const body: EssaySave = { version: s.version };
      for (const p of changed) {
        if (p === "en" || p === "zh") body.editions = { ...body.editions, [p]: s.draft[p] };
        else if (p === "refs") body.refs = refsOf(s.draft.refs);
        else body[p] = s.draft[p];
      }
      next = await run<EssayDetail>("POST", `/api/admin/essays/${id}`, body, { label: "save", revalidate: false });
      // A stale version: take the server's essay, so parts only one side changed merge and the rest show as conflicts.
      if (!next) {
        await refresh();
        return null;
      }
    }
    const savedWords = { ...s.wordsBase };
    let failed = false;
    for (const slot of dirtySlots(s)) {
      const w = s.words[slot]!;
      const res = await run<EssayDetail>("POST", `/api/admin/essays/${id}/images/${slot}`, { prompt: w.prompt, alt: { en: w.en, zh: w.zh } }, { label: "save", revalidate: false });
      if (!res) {
        failed = true;
        break;
      }
      next = res;
      savedWords[slot] = w;
    }
    if (next) dispatch({ type: "receive", detail: next, sent: { text: changed.length ? s.draft : s.base, words: savedWords } });
    if (failed) return null;
    if (next) toast("已保存", "ok");
    return next ?? s.detail;
  }, [id, run, refresh]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [save]);

  useEffect(() => {
    if (!dirty) return;
    const onLeave = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [dirty]);
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname);
  useEffect(() => {
    if (blocker.state !== "blocked") return;
    if (window.confirm("有未保存的修改，离开会丢掉它们。确定离开吗？")) blocker.proceed();
    else blocker.reset();
  }, [blocker]);

  /** Text work reads the essay as saved, so unsaved edits are saved first and the request carries that version. */
  const request = async (req: EssayTaskRequest, success: string, ask?: string) => {
    if (ask && !window.confirm(ask)) return;
    let version = ref.current.version;
    if (dirtyParts(ref.current).length || dirtySlots(ref.current).length) {
      const saved = await save();
      if (!saved) return;
      version = saved.version;
    }
    const label = `task:${req.kind}:${req.slot ?? ""}:${req.language ?? ""}:${req.section ?? ""}`;
    take(await run<EssayDetail>("POST", `/api/admin/essays/${id}/tasks`, { ...req, version }, { label, success, revalidate: false }));
  };
  /** A command on the essay as saved (accept a rewrite, publish): unsaved edits are saved first. */
  const onSaved = async (path: string, body: (version: number) => unknown, label: string, success: string) => {
    let version = ref.current.version;
    if (dirtyParts(ref.current).length || dirtySlots(ref.current).length) {
      const saved = await save();
      if (!saved) return;
      version = saved.version;
    }
    take(await run<EssayDetail>("POST", path, body(version), { label, success, revalidate: false }));
  };
  const command = async (method: "POST" | "DELETE", path: string, body: unknown, label: string, success: string) =>
    take(await run<EssayDetail>(method, path, body, { label, success, revalidate: false }));

  const textTask = d.tasks.find((t) => active(t) && TEXT_KINDS.includes(t.kind));
  const writing = (kind: EssayTaskKind) => d.tasks.some((t) => active(t) && t.kind === kind);
  const textLocked = !!d.writingUnavailable || !!textTask;
  const edit = (patch: Partial<Text>) => dispatch({ type: "edit", patch });
  const editEdition = (language: EssayLanguage, patch: Partial<EssayEdition>) => edit({ [language]: { ...draft[language], ...patch } });
  const style = d.styles.find((s) => s.name === draft.style);
  const loadRevision = async (r: EssayRevision) => {
    const res = await getJson<{ part: EssayRevision["part"]; content: { text?: string } & Partial<EssayEdition> }>(`/api/admin/essays/${id}/revisions/${r.id}`);
    if (!res) return toast("没能读出这个版本", "error");
    if (res.part === "outline") edit({ outline: res.content.text ?? "" });
    else edit({ [res.part]: { title: res.content.title ?? "", dek: res.content.dek ?? "", description: res.content.description ?? "", body: res.content.body ?? "" } });
    toast(`已把${bj(r.createdAt)}的${PART_NAME[res.part]}载入编辑器，检查后保存`, "ok");
  };

  const slotList = [...new Set(["cover", ...Object.keys(state.words), ...d.images.map((i) => i.slot), ...figuresIn(draft.en.body), ...figuresIn(draft.zh.body)])]
    .sort((a, b) => slotOrder(a) - slotOrder(b));
  const freeFigures = Array.from({ length: 9 }, (_, i) => `figure-${i + 1}`).filter((s) => !slotList.includes(s));
  const [newFigure, setNewFigure] = useState("");
  const pictures = d.images.map((i) => `${i.slot}:${i.file ?? ""}:${i.alt.en ?? ""}:${i.alt.zh ?? ""}`).join("|");
  const failed = d.tasks.filter((t) => t.status === "failed");
  const running = d.tasks.filter(active);

  return (
    <AdminPage
      title={draft.en.title || draft.zh.title || `长文 #${id}`}
      subtitle={
        <span className="flex flex-wrap items-center gap-2">
          <Link to="/admin/essays" className="text-accent hover:underline">全部长文</Link>
          <Badge tone={STATUS[d.status].tone}>{STATUS[d.status].label}</Badge>
          <span>版本 {d.version} · 更新于 <Time at={d.updatedAt} /></span>
        </span>
      }
      actions={
        <>
          <span className={`inline-flex items-center gap-1.5 text-[13px] ${dirty ? "text-amber" : "text-ink-3"}`}>
            <span className={`size-[7px] rounded-full ${dirty ? "bg-amber" : "bg-ok"}`} />{dirty ? "有未保存的修改" : "已保存"}
          </span>
          <Button onClick={() => void refresh()}>刷新</Button>
          <Button tone="primary" busy={pending === "save"} disabled={!dirty || state.conflicts.length > 0} onClick={() => void save()} title="Ctrl/⌘ + S">保存</Button>
        </>
      }
    >
      <nav className="mb-4 flex flex-wrap gap-1.5 text-[12.5px]" aria-label="步骤">
        {[["fragments", "碎片"], ["outline", "提纲"], ["en", "英文稿"], ["zh", "中文版"], ["pictures", "配图"], ["publish", "发布"], ["history", "历史"]].map(([to, label]) => (
          <a key={to} href={`#${to}`} className="rounded-full bg-surface px-3 py-1 text-ink-2 ring-1 ring-line hover:bg-bg-sunk">{label}</a>
        ))}
      </nav>

      <div className="space-y-6">
        {(d.writingUnavailable || d.picturesUnavailable || state.conflicts.length > 0 || running.length > 0 || failed.length > 0) && (
          <div className="space-y-2">
            {d.writingUnavailable && <Notice>{d.writingUnavailable}</Notice>}
            {d.picturesUnavailable && <Notice>{d.picturesUnavailable}</Notice>}
            {state.conflicts.length > 0 && (
              <Notice tone="bad">
                <p>
                  {state.conflicts.map((p) => PART_NAME[p]).join("、")}在服务器上变了（worker 写完一步，或在别处保存过），你这里也有没保存的修改。
                  直接保存会被拒绝：要留的文字先复制出来，再选一边。
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button size="sm" tone="primary" onClick={() => take(state.detail, "server")}>载入服务器上的（丢掉我对这些部分的修改）</Button>
                  <Button size="sm" onClick={() => take(state.detail, "mine")}>保留我的（保存时覆盖服务器上的）</Button>
                </div>
              </Notice>
            )}
            {running.map((t) => (
              <Notice key={t.id} tone="info">
                <span className="mr-2 inline-block size-3 animate-spin rounded-full border-[1.5px] border-current border-r-transparent align-[-2px]" />
                {KIND[t.kind]}{t.input.slot ? ` · ${t.input.slot}` : ""}{t.input.language ? ` · ${LANGUAGE[t.input.language]}` : ""}
                {t.status === "queued" ? " 排队中" : " 进行中"}，{t.requestedBy} 于 <Time at={t.createdAt} /> 请求。完成后自动载入。
              </Notice>
            ))}
            {failed.map((t) => (
              <Notice key={t.id} tone="bad">
                <span className="flex flex-wrap items-start justify-between gap-2">
                  <span>{KIND[t.kind]}{t.input.slot ? ` · ${t.input.slot}` : ""}失败（<Time at={t.updatedAt} />）：{t.error ?? "没有错误信息"}</span>
                  <Button size="sm" busy={pending === `dismiss:${t.id}`} onClick={() => void command("POST", `/api/admin/essays/${id}/tasks/${t.id}`, { command: "dismiss" }, `dismiss:${t.id}`, "已清除")}>清除</Button>
                </span>
              </Notice>
            ))}
          </div>
        )}

        <section id="fragments" className="scroll-mt-20">
          <Card title="1 · 碎片" right={style?.name}>
            <div className="space-y-4">
              <Field label="碎片" hint="一段一个想法，空一行隔开。补几句再重跑提纲也可以。">
                <Textarea rows={12} value={draft.fragments} onChange={(e) => edit({ fragments: e.target.value })} />
              </Field>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="参考" hint="一行一个本站路径或网址；worker 读它们公开的标题和摘要，当作可以引用的材料。">
                  <Textarea rows={3} value={draft.refs} onChange={(e) => edit({ refs: e.target.value })} placeholder="/eacc-manifesto" />
                </Field>
                <Field label="文风" hint={style?.description}>
                  <Select value={draft.style} onChange={(e) => edit({ style: e.target.value })}>
                    {!style && <option value={draft.style}>{draft.style}（已不存在）</option>}
                    {d.styles.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}
                  </Select>
                </Field>
              </div>
              <Button tone="primary" disabled={textLocked || !draft.fragments.trim()} busy={pending?.startsWith("task:outline")}
                onClick={() => void request({ kind: "outline" }, "已请求提纲，约一分钟", draft.outline.trim() ? "会重新生成提纲，现在的提纲会被替换（历史里能找回）。继续吗？" : undefined)}>
                生成提纲
              </Button>
            </div>
          </Card>
        </section>

        <section id="outline" className="scroll-mt-20">
          <Card title="2 · 提纲">
            <div className="space-y-4">
              {writing("outline") && <Notice tone="info">提纲正在生成，写完后自动载入。</Notice>}
              <Textarea rows={18} className="font-mono text-[13px]" value={draft.outline} readOnly={writing("outline")}
                onChange={(e) => edit({ outline: e.target.value })} placeholder="生成提纲后在这里改：核心论点、标题候选、分节要点、论证薄弱处。" />
              <Button tone="primary" disabled={textLocked || !draft.outline.trim()} busy={pending?.startsWith("task:draft")}
                onClick={() => void request({ kind: "draft" }, "已请求成稿，需要几分钟", draft.en.body.trim() ? "会按提纲重写整篇英文稿，现在的英文稿会被替换（历史里能找回）。继续吗？" : undefined)}>
                按提纲写成稿
              </Button>
            </div>
          </Card>
        </section>

        {(["en", "zh"] as const).map((language) => (
          <section key={language} id={language} className="scroll-mt-20">
            <EditionEditor
              id={id} language={language} edition={draft[language]} enReady={!!draft.en.body.trim()} pictures={pictures} detail={d}
              locked={writing(language === "en" ? "draft" : "localize")} textLocked={textLocked} pending={pending}
              onEdit={(patch) => editEdition(language, patch)}
              onLocalize={() => void request({ kind: "localize" }, "已请求中文版，需要几分钟", draft.zh.body.trim() ? "会按英文稿重写整篇中文版，现在的中文版会被替换（历史里能找回）。继续吗？" : undefined)}
              onRevise={(section, instruction) => void request({ kind: "revise", language, section, instruction }, "已请求重写这一节")}
              onResolve={(task, accept) => void (accept
                ? onSaved(`/api/admin/essays/${id}/tasks/${task.id}`, (version) => ({ command: "accept", version }), `resolve:${task.id}`, "已采纳")
                : command("POST", `/api/admin/essays/${id}/tasks/${task.id}`, { command: "discard" }, `resolve:${task.id}`, "已丢弃"))}
            />
          </section>
        ))}

        <section id="pictures" className="scroll-mt-20">
          <Card title="5 · 配图" right="正文里单独一行写 [[figure-N]] 放插图；封面不用写">
            <div className="space-y-4">
              <div className="grid gap-4 xl:grid-cols-2">
                {slotList.map((slot) => (
                  <ImageCard
                    key={slot} slot={slot} image={d.images.find((i) => i.slot === slot)} words={state.words[slot] ?? NO_WORDS}
                    dirty={slots.includes(slot)} unavailable={d.picturesUnavailable} pending={pending}
                    placed={{ en: figuresIn(draft.en.body).includes(slot), zh: figuresIn(draft.zh.body).includes(slot) }}
                    task={d.tasks.find((t) => t.input.slot === slot && (t.kind === "search" || t.kind === "draw") && t.status !== "discarded")}
                    onWords={(patch) => dispatch({ type: "words", slot, patch })}
                    onTask={(kind) => void request({ kind, slot }, kind === "search" ? "开始搜图，约 1–3 分钟" : "开始画，约 1–4 分钟")}
                    onChoose={(file) => void command("POST", `/api/admin/essays/${id}/images/${slot}`, { choose: file }, `choose:${slot}`, "已换上这张图")}
                    onUpload={async (file) => void (await command("POST", `/api/admin/essays/${id}/images/${slot}`, { image: await readDataUrl(file) }, `upload:${slot}`, "已换上这张图"))}
                    onRemove={async () => {
                      if (!window.confirm(`删除图位 ${slot}（图、描述和替代文字）？正文里的 [[${slot}]] 需要自己删掉。`)) return;
                      if (!d.images.some((i) => i.slot === slot)) return dispatch({ type: "drop", slot });
                      if (await command("DELETE", `/api/admin/essays/${id}/images/${slot}`, undefined, `remove:${slot}`, "已删除图位")) dispatch({ type: "drop", slot });
                    }}
                  />
                ))}
              </div>
              {freeFigures.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <Select aria-label="新插图位" className="!w-auto" value={newFigure || freeFigures[0]} onChange={(e) => setNewFigure(e.target.value)}>
                    {freeFigures.map((s) => <option key={s} value={s}>{s}</option>)}
                  </Select>
                  <Button onClick={() => {
                    const slot = freeFigures.includes(newFigure) ? newFigure : freeFigures[0]!;
                    dispatch({ type: "words", slot, patch: {} });
                    setNewFigure("");
                  }}>添加插图位</Button>
                  <span className="text-[12.5px] text-ink-4">加好后在两版正文里各放一行 [[figure-N]]。</span>
                </div>
              )}
            </div>
          </Card>
        </section>

        <section id="publish" className="scroll-mt-20">
          <Card title="6 · 发布" right={d.live ? <>首次发布 {bj(d.live.publishedAt)} · 最近更新 {bj(d.live.modifiedAt)}</> : "还没有发布"}>
            <div className="space-y-4">
              <Field label="网址（slug）" hint={d.slugLocked ? "发布过的文章网址不能再改。" : "小写字母、数字和连字符，例如 the-cost-of-intelligence。中英两版共用。"}>
                <Input value={draft.slug} disabled={d.slugLocked} onChange={(e) => edit({ slug: e.target.value })} />
              </Field>
              {d.problems.length > 0
                ? (
                  <div>
                    <p className="mb-1 text-[12.5px] font-medium text-ink-2">还不能发布{dirty ? "（按已保存的内容检查，保存后会更新）" : ""}：</p>
                    <ul className="list-disc space-y-0.5 pl-5 text-[13px] text-hot">{d.problems.map((p) => <li key={p}>{p}</li>)}</ul>
                  </div>
                )
                : <p className="text-[13px] text-ok">检查清单都通过了{dirty ? "（按已保存的内容；发布前会先保存）" : ""}。</p>}
              <div className="flex flex-wrap items-center gap-2">
                <Button tone="primary" busy={pending === "publish"} disabled={d.problems.length > 0 && !dirty}
                  onClick={() => window.confirm(d.live ? "用现在保存的内容更新线上文章（中英两版）？" : "发布这篇文章（中英两版一起）？") && void onSaved(`/api/admin/essays/${id}/publish`, (version) => ({ version }), "publish", d.live ? "已更新发布" : "已发布")}>
                  {d.live ? "更新发布" : "发布"}
                </Button>
                {d.live && (
                  <Button tone="danger" busy={pending === "withdraw"}
                    onClick={() => window.confirm("撤下后文章页返回 410，并退出站点地图和订阅源。确定撤下吗？") && void command("POST", `/api/admin/essays/${id}/withdraw`, { version: state.version }, "withdraw", "已撤下")}>
                    撤下
                  </Button>
                )}
                {d.live && (
                  <span className="text-[13px]">
                    <a className="text-accent hover:underline" href={d.live.path} target="_blank" rel="noreferrer">英文页</a>
                    {" · "}
                    <a className="text-accent hover:underline" href={`/zh${d.live.path}`} target="_blank" rel="noreferrer">中文页</a>
                  </span>
                )}
              </div>
            </div>
          </Card>
        </section>

        <section id="history" className="scroll-mt-20">
          <Card title="7 · 历史" right="载入后在编辑器里检查，保存才生效" pad={false}>
            <DataTable<EssayRevision>
              rows={d.revisions}
              rowKey={(r) => r.id}
              empty="还没有版本。"
              dense
              columns={[
                { key: "part", label: "部分", render: (r) => PART_NAME[r.part] },
                { key: "source", label: "来源", render: (r) => SOURCE[r.source] },
                { key: "style", label: "文风", render: (r) => r.style ?? "—" },
                { key: "who", label: "谁", render: (r) => r.createdBy },
                { key: "when", label: "时间", render: (r) => <Time at={r.createdAt} /> },
                {
                  key: "load", label: "", align: "right",
                  render: (r) => <Button size="sm" disabled={writing(r.part === "outline" ? "outline" : r.part === "en" ? "draft" : "localize")} onClick={() => void loadRevision(r)}>载入</Button>,
                },
              ]}
            />
          </Card>
        </section>
      </div>
    </AdminPage>
  );
}

function EditionEditor({ id, language, edition, enReady, pictures, detail, locked, textLocked, pending, onEdit, onLocalize, onRevise, onResolve }: {
  id: number; language: EssayLanguage; edition: EssayEdition; enReady: boolean; pictures: string; detail: EssayDetail; locked: boolean; textLocked: boolean; pending: string | null;
  onEdit: (patch: Partial<EssayEdition>) => void; onLocalize: () => void; onRevise: (section: number, instruction: string) => void;
  onResolve: (task: EssayTask, accept: boolean) => void;
}) {
  const [instructions, setInstructions] = useState<Record<number, string>>({});
  const parts = sections(edition.body);
  const marks = checks(edition);
  const proposals = detail.tasks.filter((t) => t.kind === "revise" && t.status === "done" && (t.input.language ?? "en") === language);
  const description = Array.from(edition.description).length;
  return (
    <Card
      title={language === "en" ? "3 · 英文稿" : "4 · 中文版"}
      right={marks > 0 ? <Badge tone="warn">{marks} 处 [[check]] 待核</Badge> : <Badge tone="ok">没有 [[check]]</Badge>}
    >
      <div className="space-y-4">
        {locked && <Notice tone="info">{language === "en" ? "英文稿正在按提纲成稿" : "中文版正在生成"}，写完后自动载入。</Notice>}
        {language === "zh" && (
          <div className="flex flex-wrap items-center gap-2">
            <Button tone="primary" disabled={textLocked || !enReady} busy={pending?.startsWith("task:localize")} onClick={onLocalize}>出中文版</Button>
            <span className="text-[12.5px] text-ink-4">先保存，再按英文稿为中文读者重写一份，段落和图位与英文对应。</span>
          </div>
        )}
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3">
            <Field label="标题"><Input value={edition.title} readOnly={locked} onChange={(e) => onEdit({ title: e.target.value })} /></Field>
            <Field label="导语"><Textarea rows={2} value={edition.dek} readOnly={locked} onChange={(e) => onEdit({ dek: e.target.value })} /></Field>
            <Field label={`搜索摘要（${description} / 约 150）`}>
              <Textarea rows={2} value={edition.description} readOnly={locked} onChange={(e) => onEdit({ description: e.target.value })} />
            </Field>
            <Field label="正文" hint="## 小标题分节；!! 一句话设成大字论点；[[figure-N]] 单独一行放插图；[[check: …]] 是待核实的说法，发布前要清掉。">
              <Textarea rows={30} className="font-mono text-[13px]" value={edition.body} readOnly={locked} onChange={(e) => onEdit({ body: e.target.value })} />
            </Field>
          </div>
          <div className="lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:self-start lg:overflow-auto">
            <h3 className="mb-1.5 text-[12.5px] font-medium text-ink-2">预览（和公开页同一个渲染）</h3>
            {edition.title && <p className="mb-1 text-[20px] font-semibold leading-snug text-ink">{edition.title}</p>}
            {edition.dek && <p className="mb-3 text-[14px] text-ink-3">{edition.dek}</p>}
            <Preview id={id} language={language} body={edition.body} pictures={pictures} />
          </div>
        </div>

        {proposals.map((t) => (
          <div key={t.id} className="rounded-panel p-3 ring-1 ring-accent/30">
            <p className="mb-2 text-[13px] text-ink-2">
              单节重写（<Time at={t.updatedAt} />）：<span className="text-ink">{t.input.instruction}</span>
            </p>
            <div className="grid gap-3 lg:grid-cols-2">
              <div><p className="mb-1 text-[12px] text-ink-3">原文</p><pre className="whitespace-pre-wrap break-words rounded-control bg-bg-sunk p-2 text-[12.5px]"><del>{t.result?.base}</del></pre></div>
              <div><p className="mb-1 text-[12px] text-ink-3">改写</p><pre className="whitespace-pre-wrap break-words rounded-control bg-bg-sunk p-2 text-[12.5px]"><ins>{t.result?.text}</ins></pre></div>
            </div>
            <div className="mt-2 flex gap-2">
              <Button size="sm" tone="primary" busy={pending === `resolve:${t.id}`} onClick={() => onResolve(t, true)}>采纳</Button>
              <Button size="sm" busy={pending === `resolve:${t.id}`} onClick={() => onResolve(t, false)}>丢弃</Button>
            </div>
          </div>
        ))}

        {edition.body.trim() && (
          <details>
            <summary className="cursor-pointer text-[13px] font-medium text-ink-2">单节重写（{parts.length} 节）</summary>
            <ul className="mt-2 divide-y divide-line">
              {parts.map((part, i) => part.trim() && (
                <li key={i} className="flex flex-wrap items-center gap-2 py-2">
                  <span className="w-full truncate text-[13px] text-ink sm:w-56">{i === 0 ? "开头（第一个小标题之前）" : part.split("\n")[0]!.replace(/^## /, "")}</span>
                  <Input className="min-w-0 flex-1" placeholder="怎么改，例如：更锋利 / 补一个反例" value={instructions[i] ?? ""}
                    onChange={(e) => setInstructions((x) => ({ ...x, [i]: e.target.value }))} />
                  <Button size="sm" disabled={textLocked || !(instructions[i] ?? "").trim()} busy={pending === `task:revise::${language}:${i}`}
                    onClick={() => onRevise(i, instructions[i]!.trim())}>重写这一节</Button>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </Card>
  );
}

function ImageCard({ slot, image, words, dirty, unavailable, pending, placed, task, onWords, onTask, onChoose, onUpload, onRemove }: {
  slot: string; image: EssayImage | undefined; words: Words; dirty: boolean; unavailable: string | null; pending: string | null;
  placed: Record<EssayLanguage, boolean>; task: EssayTask | undefined;
  onWords: (patch: Partial<Words>) => void; onTask: (kind: "search" | "draw") => void; onChoose: (file: string) => void;
  onUpload: (file: File) => Promise<void>; onRemove: () => void;
}) {
  const file = useRef<HTMLInputElement>(null);
  const busy = !!task && active(task);
  const upload = (f: File | undefined) => {
    if (!f) return;
    if (!/^image\/(png|jpeg|webp)$/.test(f.type)) return toast("只能上传 PNG、JPEG 或 WebP", "error");
    if (f.size > UPLOAD_MAX_BYTES) return toast("图片太大，请小于 7 MB", "error");
    void onUpload(f);
  };
  const origin = image?.origin === "search" ? "网上找的" : image?.origin === "drawn" ? "AI 绘制" : image?.origin === "uploaded" ? "上传" : null;
  return (
    <div className="space-y-3 rounded-panel p-3 ring-1 ring-line">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-[13.5px] font-semibold text-ink">
          {slot === "cover" ? "封面" : slot}
          {dirty && <Badge tone="warn">未保存</Badge>}
        </span>
        {slot !== "cover" && (
          <span className="text-[12px] text-ink-4">
            {placed.en && placed.zh ? "两版正文都放了" : placed.en ? "只有英文稿放了" : placed.zh ? "只有中文版放了" : "正文还没放这张图"}
          </span>
        )}
      </div>
      <div className="relative aspect-video w-full overflow-hidden rounded-tile bg-bg-sunk">
        {image?.file
          ? <img src={`${MEDIA}/${image.file}`} alt={words.en || slot} className="size-full object-cover" />
          : <div className="flex size-full items-center justify-center rounded-tile border-[1.5px] border-dashed border-line-strong text-[13px] text-ink-4">还没有图</div>}
        {busy && (
          <div className="absolute inset-0 flex animate-pulse items-center justify-center bg-bg-sunk/85 text-[13px] font-medium text-ink-2">
            {task.kind === "search" ? "正在搜图，约 1–3 分钟" : "正在画，约 1–4 分钟"}
          </div>
        )}
      </div>
      {image?.file && (
        <p className="text-[12.5px] text-ink-3">
          {origin}{image.width && image.height ? ` · ${image.width}×${image.height}` : ""}
          {image.credit && <> · 出处 <a href={image.credit} target="_blank" rel="noreferrer" className="text-accent hover:underline">{host(image.credit)}</a><span className="text-ink-4">（图下注明，能否转载请自己判断）</span></>}
        </p>
      )}
      <Field label="画面描述" hint="搜图时当搜索主题，画图时当画面要求。">
        <Textarea rows={2} value={words.prompt} onChange={(e) => onWords({ prompt: e.target.value })} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="替代文字（英文）"><Input value={words.en} onChange={(e) => onWords({ en: e.target.value })} /></Field>
        <Field label="替代文字（中文）"><Input value={words.zh} onChange={(e) => onWords({ zh: e.target.value })} /></Field>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" tone="primary" disabled={!!unavailable || busy || !words.prompt.trim()} busy={pending === `task:search:${slot}::`} onClick={() => onTask("search")}>搜图</Button>
        <Button size="sm" disabled={!!unavailable || busy || !words.prompt.trim()} busy={pending === `task:draw:${slot}::`} onClick={() => onTask("draw")}>AI 画图</Button>
        <Button size="sm" disabled={busy} busy={pending === `upload:${slot}`} onClick={() => file.current?.click()}>上传</Button>
        <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ""; }} />
        <Button size="sm" tone="ghost" disabled={busy} busy={pending === `remove:${slot}`} onClick={onRemove}>删除图位</Button>
      </div>
      {task?.kind === "search" && task.status === "done" && !image?.candidates.length && <p className="text-[12.5px] text-ink-4">没搜到合适的图，换个描述再搜，或者画一张。</p>}
      {image && image.candidates.length > 0 && (
        <div>
          <p className="mb-1.5 text-[12.5px] text-ink-3">搜到的候选，点一张换上：</p>
          <div className="grid grid-cols-3 gap-2">
            {image.candidates.map((c) => (
              <button key={c.file} type="button" disabled={busy || pending === `choose:${slot}`} onClick={() => onChoose(c.file)}
                className={`group overflow-hidden rounded-tile text-left ring-2 transition ${c.file === image.file ? "ring-accent" : "ring-transparent hover:ring-line-strong"}`}>
                <img src={`${MEDIA}/${c.file}`} alt="" loading="lazy" className="aspect-video w-full bg-bg-sunk object-cover" />
                <span className="block truncate px-1 py-0.5 text-[11.5px] text-ink-4" title={c.page}>{host(c.page)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function EssayDesk() {
  const detail = useLoaderData<typeof loader>();
  return <DeskView key={detail.id} initial={detail} />;
}
