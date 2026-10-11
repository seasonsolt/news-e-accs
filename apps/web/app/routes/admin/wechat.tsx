import { SITE } from "@aihot/site";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate, useRevalidator } from "react-router";
import type { Route } from "./+types/wechat";
import { useAdminAction } from "../../features/admin/action";
import { toast } from "../../features/admin/toast";
import { Badge, Button, Card, Empty } from "../../features/admin/ui";
import { adminGet } from "../../lib/admin.server";
import { copyText } from "../../lib/clipboard";

// The shapes of packages/backend/src/admin/wechat.ts.
interface ColumnEntry {
  key: string;
  section: string;
  sourceName: string;
  added: boolean;
  hidden: boolean;
  title: string;
  body: string | null;
  comment: string | null;
  generated: { title: string; body: string | null; comment: string | null };
}

interface WechatEdits {
  title?: string;
  digest?: string;
  theme?: string;
  order?: string[];
  hidden?: string[];
  entries?: Record<string, { title?: string; body?: string; comment?: string }>;
}

interface WechatArticle {
  title: string;
  digest: string;
  defaults: { title: string; digest: string };
  readMoreUrl: string;
  theme: string;
  html: string;
  text: string;
  entries: ColumnEntry[];
  counts: { daily: number; added: number; commented: number };
}

interface Illustration {
  status: "queued" | "drawing" | "done" | "failed";
  origin: "drawn" | "uploaded";
  prompt: string | null;
  error: string | null;
  url: string | null;
  requestedBy: string | null;
  updatedAt: string;
}

type WechatExport =
  | { date: string; status: "no_report" | "empty" }
  | { date: string; status: "not_ready"; reason: string }
  | {
      date: string; status: "ready"; minimum: number; revision: number; edits: WechatEdits; article: WechatArticle;
      limits: { title: number; digest: number }; themes: Array<{ key: string; label: string }>;
      coverUrl: string;
      push: { enabled: boolean; configured: boolean; pushedAt: string | null; pushedRevision: number | null; pushedBy: string | null; imagesChanged: boolean };
      illustrations: Record<string, Illustration>;
      drawingUnavailable: string | null;
    };

type Ready = Extract<WechatExport, { status: "ready" }>;

interface IssueRow {
  date: string; issueNumber: number; edited: boolean; updatedAt: string | null; updatedBy: string | null; comments: number; pushedAt: string | null;
}

export async function loader({ request }: Route.LoaderArgs) {
  const [issue, issues] = await Promise.all([
    adminGet<WechatExport>(request, `/api/admin/wechat${new URL(request.url).search}`),
    adminGet<{ rows: IssueRow[] }>(request, "/api/admin/wechat/issues"),
  ]);
  return { issue, issues: issues.rows };
}

export const meta: Route.MetaFunction = () => [{ title: `公众号 · ${SITE.name} 后台` }];

const UNAVAILABLE: Record<string, string> = {
  no_report: "这一天还没有日报。",
  empty: "这一天的日报没有可展示的条目。",
  "edition not ready": "中文版日报还没生成好，稍后再来。",
  "citation edition not ready": "日报里还有条目没翻译成中文，稍后再来。",
};

/** How long typing pauses before the issue is saved. */
const SAVE_AFTER_MS = 800;
/** How often the page asks again while a picture is being drawn. */
const DRAWING_POLL_MS = 5000;
/** The api takes requests up to 10 MB; a picture travels as base64 (4/3 of its size). */
const UPLOAD_MAX_BYTES = 7 * 1024 * 1024;
const chars = (s: string) => Array.from(s).length;
const WEEKDAYS = "日一二三四五六";

function dayLabel(date: string) {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return `${m}月${d}日 周${WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]}`;
}

/** Rich text for the 公众号 editor, with the plain text alongside for anywhere that takes no formatting. */
async function copyRich(html: string, text: string) {
  try {
    await navigator.clipboard.write([new ClipboardItem({ "text/html": new Blob([html], { type: "text/html" }), "text/plain": new Blob([text], { type: "text/plain" }) })]);
  } catch {
    await copyText(text);
    throw new Error("rich copy unavailable");
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

function Icon({ d, size = 16, className = "" }: { d: ReactNode; size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={`shrink-0 ${className}`}>
      {d}
    </svg>
  );
}
const ICONS = {
  left: <path d="m15 18-6-6 6-6" />,
  right: <path d="m9 18 6-6-6-6" />,
  up: <path d="m18 15-6-6-6 6" />,
  down: <path d="m6 9 6 6 6-6" />,
  copy: <><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>,
  send: <><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></>,
  eye: <><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></>,
  eyeOff: <><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" /><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" /><path d="M6.61 6.61A13.53 13.53 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" /><path d="m2 2 20 20" /></>,
  image: <><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" /></>,
  spark: <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z" />,
  alert: <><circle cx="12" cy="12" r="10" /><path d="M12 8v4" /><path d="M12 16h.01" /></>,
};

function Counter({ value, max }: { value: string; max: number }) {
  const n = chars(value);
  return <span className={`num text-[12px] ${n > max ? "font-semibold text-hot" : "text-ink-4"}`}>{n} / {max}</span>;
}

/** A row of mutually exclusive choices. */
function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: Array<{ key: T; label: ReactNode }>; onChange: (v: T) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="inline-flex gap-0.5 rounded-[9px] bg-bg-sunk p-[3px]">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          aria-pressed={value === o.key}
          onClick={() => onChange(o.key)}
          className={`inline-flex h-[30px] items-center gap-1.5 rounded-[7px] px-3 text-[13px] font-medium ${value === o.key ? "bg-raised text-ink shadow-sm" : "text-ink-3 hover:text-ink"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const IconButton = ({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) => (
  <button type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick}
    className="inline-flex size-8 items-center justify-center rounded-[7px] text-ink-3 hover:bg-bg-sunk hover:text-ink disabled:pointer-events-none disabled:opacity-30">
    {children}
  </button>
);

const FIELD = "w-full rounded-control bg-raised px-3 py-2 text-[14px] leading-relaxed text-ink ring-1 ring-line outline-none transition-shadow placeholder:text-ink-4 focus:ring-2 focus:ring-accent";

/** The issue picker: the previous and next daily, and any of the recent ones. */
function IssueSwitcher({ rows, current }: { rows: IssueRow[]; current: string }) {
  const navigate = useNavigate();
  const at = rows.findIndex((r) => r.date === current);
  const newer = at > 0 ? rows[at - 1] : undefined;
  const older = at >= 0 ? rows[at + 1] : rows[0];
  const listed = at >= 0 ? rows : [{ date: current, issueNumber: 0, edited: false, updatedAt: null, updatedBy: null, comments: 0, pushedAt: null }, ...rows];
  const arrow = "inline-flex size-9 items-center justify-center rounded-control text-ink-3 hover:bg-bg-sunk hover:text-ink";
  return (
    <nav aria-label="切换期数" className="flex items-center gap-1">
      {older ? <Link to={`?date=${older.date}`} className={arrow} aria-label="上一期"><Icon d={ICONS.left} /></Link> : <span className={`${arrow} opacity-30`}><Icon d={ICONS.left} /></span>}
      <label className="relative">
        <span className="sr-only">期数</span>
        <select
          value={current}
          onChange={(ev) => navigate(`?date=${ev.target.value}`)}
          className="num h-9 appearance-none rounded-control bg-surface py-0 pl-3 pr-8 text-[14px] font-semibold text-ink ring-1 ring-line-strong outline-none focus:ring-2 focus:ring-accent"
        >
          {listed.map((r) => (
            <option key={r.date} value={r.date}>
              {dayLabel(r.date)}{r.issueNumber ? ` · 第 ${r.issueNumber} 期` : ""}{r.pushedAt ? " · 已推送" : r.edited ? " · 已编辑" : ""}
            </option>
          ))}
        </select>
        <Icon d={ICONS.down} size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-3" />
      </label>
      {newer ? <Link to={`?date=${newer.date}`} className={arrow} aria-label="下一期"><Icon d={ICONS.right} /></Link> : <span className={`${arrow} opacity-30`}><Icon d={ICONS.right} /></span>}
    </nav>
  );
}

/** The page's top bar: what is open, how to get to another issue, and the issue's main actions. */
function TopBar({ rows, current, actions, banner }: { rows: IssueRow[]; current: string; actions?: ReactNode; banner?: ReactNode }) {
  return (
    <header className="z-30 border-b border-line bg-bg/95 backdrop-blur lg:sticky lg:top-0">
      <div className="mx-auto flex max-w-[1680px] flex-wrap items-center gap-x-5 gap-y-3 px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
          <div className="shrink-0">
            <div className="text-[12px] text-ink-4">公众号工作台</div>
            <h1 className="text-[19px] font-semibold leading-tight tracking-tight text-ink">AI 早报</h1>
          </div>
          <div className="sm:border-l sm:border-line sm:pl-3"><IssueSwitcher rows={rows} current={current} /></div>
        </div>
        {actions && <div className="ml-auto flex flex-wrap items-center gap-2.5">{actions}</div>}
      </div>
      {banner}
    </header>
  );
}

function Banner({ tone, children }: { tone: "warn" | "muted"; children: ReactNode }) {
  return (
    <div className={`border-t ${tone === "warn" ? "border-amber/30 bg-amber-soft text-amber-ink" : "border-line bg-bg-sunk text-ink-2"}`}>
      <div className="mx-auto flex max-w-[1680px] items-center gap-2.5 px-4 py-2 text-[13px] leading-relaxed sm:px-6 lg:px-8">
        <Icon d={ICONS.alert} size={15} />
        <span>{children}</span>
      </div>
    </div>
  );
}

/** The server's address on the 公众号's IP allowlist; the draft API answers no other. */
const SERVER_IP = "154.17.4.14";
const PUSHED: Record<string, string> = {
  created: "已放进公众号草稿箱",
  updated: "已更新草稿箱里的这篇",
  recreated: "原来的草稿已不在草稿箱，已重新放进去",
};

/** The editor's working copy of one issue. */
interface Draft {
  title: string;
  digest: string;
  theme: string;
  items: Array<ColumnEntry & { body: string; comment: string }>;
}
type Item = Draft["items"][number];

function draftOf(d: Ready): Draft {
  return {
    title: d.edits.title ?? "",
    digest: d.edits.digest ?? "",
    theme: d.article.theme,
    items: d.article.entries.map((e) => ({ ...e, body: e.body ?? "", comment: e.comment ?? "" })),
  };
}

/** The edits the working copy amounts to: only what differs from the generated column. */
function editsOf(draft: Draft): WechatEdits {
  const entries: NonNullable<WechatEdits["entries"]> = {};
  for (const e of draft.items) {
    const one: { title?: string; body?: string; comment?: string } = {};
    if (e.title.trim() && e.title !== e.generated.title) one.title = e.title;
    if (e.body !== (e.generated.body ?? "")) one.body = e.body;
    if (e.comment !== (e.generated.comment ?? "")) one.comment = e.comment;
    if (Object.keys(one).length) entries[e.key] = one;
  }
  return {
    ...(draft.title.trim() ? { title: draft.title } : {}),
    ...(draft.digest.trim() ? { digest: draft.digest } : {}),
    theme: draft.theme,
    order: draft.items.map((e) => e.key),
    hidden: draft.items.filter((e) => e.hidden).map((e) => e.key),
    entries,
  };
}

const edited = (e: Item) =>
  e.title !== e.generated.title || e.body !== (e.generated.body ?? "") || e.comment !== (e.generated.comment ?? "");
const drawing = (i: Illustration | undefined) => i?.status === "queued" || i?.status === "drawing";

/** The entry's picture: drawn by the worker from a description, or uploaded. */
function IllustrationPanel({ date, entry, picture, unavailable }: { date: string; entry: Item; picture: Illustration | undefined; unavailable: string | null }) {
  const { run, pending } = useAdminAction();
  const [prompt, setPrompt] = useState(picture?.prompt ?? "");
  const file = useRef<HTMLInputElement>(null);
  const busy = drawing(picture);
  const draw = () => run("POST", `/api/admin/wechat/${date}/illustration`, { entry: entry.key, prompt }, { label: "draw", success: "已开始画，约 1–4 分钟" });
  const upload = async (f: File | undefined) => {
    if (!f) return;
    if (!/^image\/(png|jpeg|webp)$/.test(f.type)) return toast("只能上传 PNG、JPEG 或 WebP", "error");
    if (f.size > UPLOAD_MAX_BYTES) return toast("图片太大，请小于 7 MB", "error");
    await run("POST", `/api/admin/wechat/${date}/illustration/upload`, { entry: entry.key, image: await readDataUrl(f) }, { label: "upload", success: "已换上这张图" });
  };
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-[12.5px] text-ink-3">
        <span>配图 <span className="text-ink-4">· 印在这条标题下方</span></span>
        {picture?.url && (
          <button type="button" className="font-medium text-accent hover:underline" onClick={() => run("DELETE", `/api/admin/wechat/${date}/illustration`, { entry: entry.key }, { label: "remove", success: "已移除配图" })}>
            移除
          </button>
        )}
      </div>
      <div className="flex flex-wrap items-start gap-4">
        <div className="relative aspect-video w-full max-w-[320px] flex-[1_1_240px] overflow-hidden rounded-tile bg-bg-sunk">
          {picture?.url
            ? <img src={picture.url} alt={`${entry.title} 配图`} className="size-full object-cover" />
            : !busy && (
              <div className="flex size-full flex-col items-center justify-center gap-2 rounded-tile border-[1.5px] border-dashed border-line-strong bg-surface-2 text-[13px] text-ink-4">
                <Icon d={ICONS.image} size={22} />这一条还没有配图
              </div>
            )}
          {busy && (
            <div className="absolute inset-0 flex animate-pulse items-center justify-center bg-bg-sunk/85 text-[13px] font-medium text-ink-2">
              正在画，约 1–4 分钟
            </div>
          )}
        </div>
        <div className="flex min-w-0 flex-[999_1_260px] flex-col gap-2">
          <label htmlFor={`p-${entry.key}`} className="text-[12.5px] text-ink-3">画什么<span className="text-ink-4">（留空则按标题和正文画）</span></label>
          <textarea id={`p-${entry.key}`} rows={2} maxLength={500} value={prompt} onChange={(ev) => setPrompt(ev.target.value)}
            placeholder={`例：${entry.title.slice(0, 16)}…的场景，用象征手法`} className={`${FIELD} resize-y`} />
          <div className="flex flex-wrap items-center gap-2">
            <Button tone="primary" disabled={!!unavailable || busy} busy={pending === "draw"} onClick={draw}>
              <Icon d={ICONS.spark} size={15} />{picture?.url ? "重画" : "生成配图"}
            </Button>
            <Button busy={pending === "upload"} onClick={() => file.current?.click()}>上传图片</Button>
            <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(ev) => { void upload(ev.target.files?.[0]); ev.target.value = ""; }} />
          </div>
          {picture?.status === "failed" && picture.error && <p className="text-[12.5px] leading-relaxed text-hot">没画成：{picture.error}</p>}
          {unavailable && <p className="text-[12px] text-ink-4">{unavailable}</p>}
        </div>
      </div>
    </div>
  );
}

function EntryRow({ d, item, index, total, number, open, onToggle, move, setItem, drag }: {
  d: Ready; item: Item; index: number; total: number; number: number; open: boolean; onToggle: () => void;
  move: (from: number, to: number) => void; setItem: (patch: Partial<Item>) => void;
  drag: { start: () => void; drop: () => void };
}) {
  const picture = d.illustrations[item.key];
  return (
    <li
      draggable={!open}
      onDragStart={drag.start}
      onDragOver={(ev) => ev.preventDefault()}
      onDrop={drag.drop}
      className={`rounded-tile border ${open ? "border-line-strong bg-raised shadow-sm" : "border-transparent hover:bg-surface-2"}`}
    >
      <div className="flex items-center">
        <span aria-hidden="true" title="拖动排序" className={`flex w-6 justify-center text-line-strong ${open ? "" : "cursor-grab"}`}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.6" /><circle cx="15" cy="6" r="1.6" /><circle cx="9" cy="12" r="1.6" /><circle cx="15" cy="12" r="1.6" /><circle cx="9" cy="18" r="1.6" /><circle cx="15" cy="18" r="1.6" /></svg>
        </span>
        <button type="button" aria-expanded={open} onClick={onToggle} className="flex min-w-0 flex-1 items-center gap-3 py-2.5 pr-2 text-left">
          <span className={`num w-7 shrink-0 text-right text-[15px] font-bold ${item.hidden ? "text-ink-4" : "text-accent"}`}>{item.hidden ? "—" : String(number).padStart(2, "0")}</span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className={`truncate text-[14.5px] font-semibold leading-snug ${item.hidden ? "text-ink-4 line-through decoration-line-strong" : "text-ink"}`}>{item.title}</span>
            <span className="flex min-w-0 items-center gap-2 text-[12.5px] text-ink-4">
              <span className="shrink-0">{item.section} · {item.sourceName}</span>
              {!item.hidden && (item.comment
                ? <span className="truncate text-amber-ink">「{item.comment}」</span>
                : <span className="shrink-0 text-hot">无点评</span>)}
            </span>
          </span>
          <span className="flex shrink-0 gap-1">
            {item.added && <Badge title={`日报不足 ${d.minimum} 条时按评分补充的条目`}>补充</Badge>}
            {edited(item) && <Badge tone="accent">已改</Badge>}
            {drawing(picture) ? <Badge tone="warn">画图中</Badge> : picture?.url && <Badge tone="info">配图</Badge>}
            {picture?.status === "failed" && <Badge tone="bad">配图失败</Badge>}
          </span>
        </button>
        <span className="flex shrink-0 gap-0.5 pr-1.5">
          <IconButton label="上移" disabled={index === 0} onClick={() => move(index, index - 1)}><Icon d={ICONS.up} size={15} /></IconButton>
          <IconButton label="下移" disabled={index === total - 1} onClick={() => move(index, index + 1)}><Icon d={ICONS.down} size={15} /></IconButton>
          <IconButton label={item.hidden ? "恢复发这一条" : "不发这一条"} onClick={() => setItem({ hidden: !item.hidden })}>
            <Icon d={item.hidden ? ICONS.eye : ICONS.eyeOff} />
          </IconButton>
        </span>
      </div>

      {open && !item.hidden && (
        <div className="flex flex-col gap-4 pb-5 pl-4 pr-4 sm:pl-[60px]">
          <div>
            <div className="mb-1.5 flex items-center justify-between text-[12.5px] text-ink-3">
              <label htmlFor={`t-${item.key}`}>标题</label>
              {edited(item) && (
                <button type="button" className="font-medium text-accent hover:underline"
                  onClick={() => setItem({ title: item.generated.title, body: item.generated.body ?? "", comment: item.generated.comment ?? "" })}>
                  恢复生成的版本
                </button>
              )}
            </div>
            <input id={`t-${item.key}`} value={item.title} onChange={(ev) => setItem({ title: ev.target.value })} className={`${FIELD} font-semibold`} />
          </div>
          <div>
            <label htmlFor={`b-${item.key}`} className="mb-1.5 block text-[12.5px] text-ink-3">正文</label>
            <textarea id={`b-${item.key}`} rows={5} value={item.body} placeholder="（无正文）" onChange={(ev) => setItem({ body: ev.target.value })}
              className={`${FIELD} min-h-[120px] resize-y [field-sizing:content]`} />
          </div>
          <div className="rounded-tile bg-surface-2 p-3 ring-1 ring-line-soft">
            <div className="mb-1.5 flex items-center justify-between text-[12.5px]">
              <label htmlFor={`c-${item.key}`} className="font-semibold text-accent">{SITE.name} 点评</label>
              <span className="text-ink-4">留空则不显示</span>
            </div>
            <textarea id={`c-${item.key}`} rows={2} value={item.comment} placeholder="（无点评）" onChange={(ev) => setItem({ comment: ev.target.value })}
              className={`${FIELD} resize-y [field-sizing:content]`} />
          </div>
          <IllustrationPanel key={picture?.prompt ?? ""} date={d.date} entry={item} picture={picture} unavailable={d.drawingUnavailable} />
        </div>
      )}
    </li>
  );
}

/**
 * The article as the 公众号 shows it, scrolled to and marking the entry open on the left. The entries are
 * the article's nested sections after the first (the at-a-glance list); see newsletter/wechat.ts.
 */
function PhonePreview({ html, selected }: { html: string; selected: number | null }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const sections = [...(box.current?.querySelectorAll<HTMLElement>(":scope > section > section") ?? [])].slice(1);
    sections.forEach((s, k) => {
      s.style.outline = k === selected ? "2px solid rgba(149,84,24,.45)" : "";
      s.style.outlineOffset = "6px";
      s.style.borderRadius = "4px";
    });
    const target = selected === null ? undefined : sections[selected];
    if (target && box.current) box.current.scrollTo({ top: target.offsetTop - box.current.offsetTop - 16, behavior: "smooth" });
  }, [html, selected]);
  // Our own markup: every report string in it is escaped on the server.
  return <div ref={box} className="relative mx-auto h-[min(72vh,760px)] max-w-[375px] overflow-y-auto rounded-[18px] bg-white px-4 py-5 shadow-[0_0_0_1px_var(--line),0_6px_24px_rgba(42,31,22,.08)]" dangerouslySetInnerHTML={{ __html: html }} />;
}

function CopyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 border-b border-line-soft px-3.5 py-2.5 last:border-0">
      <div className="w-14 shrink-0 text-[12.5px] text-ink-3">{label}</div>
      <div className="min-w-0 flex-1 truncate text-[13px] text-ink" title={value}>{value}</div>
      <Button size="sm" onClick={() => copyText(value).then(() => toast(`已复制${label}`, "ok"), () => toast("复制失败", "error"))}>复制</Button>
    </div>
  );
}

function PublishPanel({ d, stale, pictures }: { d: Ready; stale: boolean; pictures: number }) {
  const { push } = d;
  const ready = push.enabled && push.configured;
  const tone = !ready ? "bg-bg-sunk ring-line" : !push.pushedAt ? "bg-bg-sunk ring-line" : stale ? "bg-amber-soft ring-amber/30" : "bg-ok-soft ring-ok/25";
  return (
    <div className="flex flex-col gap-5 p-5">
      <div className={`rounded-tile p-4 ring-1 ${tone}`}>
        <div className="text-[14px] font-semibold text-ink">
          {!ready ? "推送没有打开" : !push.pushedAt ? "这一期还没推送" : stale ? "草稿箱不是最新的" : "草稿箱是最新的"}
        </div>
        <p className="mt-1 text-[13px] leading-relaxed text-ink-2">
          {!ready
            ? `${push.enabled ? "还没配置 AppID 和 AppSecret。" : "WECHAT_DRAFT_ENABLED 没有打开。"}配好之前，用「复制正文」和下面的填写项手动发。`
            : push.pushedAt
              ? <>上次推送 {new Date(push.pushedAt).toLocaleString("zh-CN", { hour12: false })}{push.pushedBy ? `（${push.pushedBy}）` : ""}。{stale ? "之后又改过，点右上角「更新草稿」同步。" : "再次推送会更新同一篇草稿。"}</>
              : "标题、摘要、正文、配图、封面和阅读原文会一起放进草稿箱，发表仍在公众号后台点。"}
        </p>
        {!ready && (
          <ol className="mt-2.5 list-decimal space-y-1 pl-5 text-[12.5px] leading-relaxed text-ink-2">
            <li>在公众号后台「设置与开发 → 开发接口管理」拿到 AppID 和 AppSecret。</li>
            <li>把服务器 IP <code className="num rounded bg-surface px-1">{SERVER_IP}</code> 加进同一页的「IP 白名单」。</li>
            <li>在运行 api 的服务器的 .env 里设 <code>WECHAT_APPID</code>、<code>WECHAT_APPSECRET</code> 和 <code>WECHAT_DRAFT_ENABLED=true</code>，重启 api。</li>
          </ol>
        )}
      </div>
      <div>
        <h3 className="mb-2 text-[13px] font-semibold text-ink-2">手动发布时逐项复制</h3>
        <div className="rounded-tile bg-raised ring-1 ring-line">
          <CopyRow label="标题" value={d.article.title} />
          <CopyRow label="摘要" value={d.article.digest} />
          <CopyRow label="阅读原文" value={d.article.readMoreUrl} />
        </div>
        {pictures > 0 && <p className="mt-2 text-[12px] leading-relaxed text-ink-4">「复制正文」不带配图：手动发时要在公众号编辑器里另外插入；推送会把配图一起传上去。</p>}
      </div>
      <div>
        <div className="mb-2 flex items-center justify-between text-[13px]">
          <h3 className="font-semibold text-ink-2">封面</h3>
          <a href={d.coverUrl} download={`AI早报-${d.date}.png`} className="font-medium text-accent hover:underline">下载 PNG</a>
        </div>
        <img src={d.coverUrl} alt="本期封面" width={1175} height={500} className="h-auto w-full rounded-[6px] ring-1 ring-line" />
      </div>
    </div>
  );
}

type Filter = "all" | "edited" | "hidden";

function Workbench({ d, issues }: { d: Ready; issues: IssueRow[] }) {
  const { run, pending } = useAdminAction();
  const revalidator = useRevalidator();
  // A save revalidates the page, which hands out a new `run`; the effect must not save again for that.
  const runRef = useRef(run);
  runRef.current = run;
  const [draft, setDraft] = useState(() => draftOf(d));
  const [saving, setSaving] = useState<"idle" | "pending" | "saving" | "error">("idle");
  const revision = useRef(d.revision);
  const [saved, setSaved] = useState(d.revision);
  const queue = useRef(Promise.resolve());
  const dragged = useRef<number | null>(null);
  const first = useRef(true);
  const [open, setOpen] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [tab, setTab] = useState<"preview" | "publish">("preview");

  // Saves after a pause in typing, one save at a time, each on the revision the previous one returned.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setSaving("pending");
    const edits = editsOf(draft);
    const timer = setTimeout(() => {
      queue.current = queue.current.then(async () => {
        setSaving("saving");
        const res = await runRef.current<{ revision: number }>("PUT", `/api/admin/wechat/${d.date}`, { revision: revision.current, edits }, { label: "save" });
        if (res) {
          revision.current = res.revision;
          setSaved(res.revision);
        }
        setSaving(res ? "idle" : "error");
      });
    }, SAVE_AFTER_MS);
    return () => clearTimeout(timer);
  }, [draft, d.date]);

  // While a picture is being drawn, the page asks again until it is there.
  const anyDrawing = Object.values(d.illustrations).some(drawing);
  useEffect(() => {
    if (!anyDrawing) return;
    const timer = setInterval(() => { if (revalidator.state === "idle") revalidator.revalidate(); }, DRAWING_POLL_MS);
    return () => clearInterval(timer);
  }, [anyDrawing, revalidator]);

  const set = (patch: Partial<Draft>) => setDraft((x) => ({ ...x, ...patch }));
  const setItem = (key: string, patch: Partial<Item>) =>
    setDraft((x) => ({ ...x, items: x.items.map((e) => (e.key === key ? { ...e, ...patch } : e)) }));
  const move = (from: number, to: number) =>
    setDraft((x) => {
      if (to < 0 || to >= x.items.length || from === to) return x;
      const items = [...x.items];
      const [moved] = items.splice(from, 1);
      items.splice(to, 0, moved!);
      return { ...x, items };
    });

  const shown = draft.items.filter((e) => !e.hidden);
  const counts = {
    shown: shown.length,
    commented: shown.filter((e) => e.comment.trim()).length,
    edited: draft.items.filter(edited).length,
    hidden: draft.items.length - shown.length,
    pictures: shown.filter((e) => d.illustrations[e.key]?.url).length,
  };
  const numbers = new Map(shown.map((e, k) => [e.key, k + 1]));
  const visibleRows = draft.items.map((e, i) => ({ e, i })).filter(({ e }) => filter === "all" || (filter === "edited" ? edited(e) : e.hidden));
  // The preview prints the saved issue; it marks the open entry once the order it shows is saved too.
  const selected = open && saving === "idle" ? (d.article.entries.filter((e) => !e.hidden).findIndex((e) => e.key === open)) : -1;

  const { push } = d;
  const pushReady = push.enabled && push.configured;
  const stale = !!push.pushedAt && (push.pushedRevision !== saved || push.imagesChanged);
  const status = { idle: "已自动保存", pending: "待保存…", saving: "保存中…", error: "保存失败" }[saving];

  const actions = (
    <>
      <span className={`mr-1 inline-flex items-center gap-1.5 text-[13px] ${saving === "error" ? "text-hot" : "text-ink-3"}`}>
        <span className={`size-[7px] rounded-full ${saving === "idle" ? "bg-ok" : saving === "error" ? "bg-hot" : "bg-amber"}`} />{status}
      </span>
      <Button
        disabled={saving !== "idle"}
        onClick={() => copyRich(d.article.html, d.article.text).then(() => toast("已复制正文，可以粘贴到公众号编辑器", "ok"), () => toast("浏览器不支持复制格式，已复制纯文本", "error"))}
      >
        <Icon d={ICONS.copy} size={15} />复制正文
      </Button>
      {pushReady && (
        <Button
          tone="primary"
          disabled={saving !== "idle"}
          busy={pending === "push"}
          onClick={async () => {
            const res = await run<{ action: string }>("POST", `/api/admin/wechat/${d.date}/draft`, {}, { label: "push" });
            if (res) toast(PUSHED[res.action] ?? "已推送", "ok");
          }}
        >
          {pending !== "push" && <Icon d={ICONS.send} size={15} />}{pending === "push" ? "推送中…" : push.pushedAt ? "更新草稿" : "推送到草稿箱"}
        </Button>
      )}
    </>
  );
  const banner = !pushReady
    ? <Banner tone="muted">推送草稿没有打开，现在只能手动发；怎么打开见「发布」一栏。</Banner>
    : stale
      ? <Banner tone="warn">草稿箱里是 {new Date(push.pushedAt!).toLocaleTimeString("zh-CN", { hour12: false, hour: "2-digit", minute: "2-digit" })} 推送的版本，之后又改过，发表前记得「更新草稿」。</Banner>
      : null;

  return (
    <>
      <TopBar rows={issues} current={d.date} actions={actions} banner={banner} />
      <div className="mx-auto flex max-w-[1680px] flex-wrap items-start gap-6 px-4 pb-24 pt-5 sm:px-6 lg:px-8">
        <div className="flex min-w-0 flex-[999_1_600px] flex-col gap-5">
          <section aria-labelledby="meta-h" className="rounded-panel bg-surface p-5 ring-1 ring-line">
            <h2 id="meta-h" className="mb-4 text-[15px] font-semibold text-ink">文章信息</h2>
            <div className="flex flex-wrap gap-5">
              <div className="flex min-w-0 flex-[999_1_340px] flex-col gap-3.5">
                <div>
                  <div className="mb-1.5 flex items-center justify-between text-[12.5px] text-ink-3">
                    <label htmlFor="w-title">标题</label>
                    <Counter value={draft.title || d.article.defaults.title} max={d.limits.title} />
                  </div>
                  <input id="w-title" value={draft.title} placeholder={d.article.defaults.title} onChange={(ev) => set({ title: ev.target.value })} className={`${FIELD} font-semibold`} />
                </div>
                <div>
                  <div className="mb-1.5 flex items-center justify-between text-[12.5px] text-ink-3">
                    <label htmlFor="w-digest">摘要</label>
                    <Counter value={draft.digest || d.article.defaults.digest} max={d.limits.digest} />
                  </div>
                  <textarea id="w-digest" rows={3} value={draft.digest} placeholder={d.article.defaults.digest} onChange={(ev) => set({ digest: ev.target.value })} className={`${FIELD} resize-y`} />
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-[12.5px] text-ink-3">主题</span>
                  <Segmented label="主题" value={draft.theme} onChange={(theme) => set({ theme })} options={d.themes.map((t) => ({ key: t.key, label: t.label }))} />
                </div>
              </div>
              <div className="flex min-w-0 flex-[1_1_260px] flex-col gap-2">
                <div className="flex items-center justify-between text-[12.5px] text-ink-3">
                  <span>封面 <span className="text-ink-4">· 自动生成</span></span>
                  <a href={d.coverUrl} download={`AI早报-${d.date}.png`} className="font-medium text-accent hover:underline">下载 PNG</a>
                </div>
                <img src={d.coverUrl} alt="本期封面" width={1175} height={500} className="h-auto w-full rounded-[8px] ring-1 ring-line" />
                <span className="text-[12px] text-ink-4">左侧方块为 1:1 裁切区，随主题和第一条标题更新</span>
              </div>
            </div>
          </section>

          <section aria-labelledby="list-h" className="rounded-panel bg-surface px-3 pb-3 pt-4 ring-1 ring-line">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-2 pb-3">
              <h2 id="list-h" className="text-[15px] font-semibold text-ink">条目</h2>
              <span className="num text-[13px] text-ink-3">
                发 {counts.shown} 条 · 点评 {counts.commented} · 配图 {counts.pictures} · 已改 {counts.edited} · 隐藏 {counts.hidden}
              </span>
              <div className="ml-auto">
                <Segmented<Filter> label="筛选" value={filter} onChange={setFilter} options={[{ key: "all", label: "全部" }, { key: "edited", label: "已改" }, { key: "hidden", label: "已隐藏" }]} />
              </div>
            </div>
            <ol className="flex flex-col gap-0.5">
              {visibleRows.map(({ e, i }) => (
                <EntryRow
                  key={e.key} d={d} item={e} index={i} total={draft.items.length} number={numbers.get(e.key) ?? 0}
                  open={open === e.key}
                  onToggle={() => { setOpen(open === e.key ? null : e.key); setTab("preview"); }}
                  move={move} setItem={(patch) => setItem(e.key, patch)}
                  drag={{ start: () => { dragged.current = i; }, drop: () => { if (dragged.current !== null) move(dragged.current, i); dragged.current = null; } }}
                />
              ))}
            </ol>
            {!visibleRows.length && <p className="m-2 rounded-tile border border-dashed border-line-strong p-7 text-center text-[13.5px] text-ink-4">没有符合的条目</p>}
          </section>
        </div>

        <aside aria-label="预览与发布" className="min-w-0 max-w-full flex-[1_1_400px] rounded-panel bg-surface ring-1 ring-line lg:sticky lg:top-[88px] xl:max-w-[480px]">
          <div role="tablist" className="flex gap-5 border-b border-line px-5">
            {(["preview", "publish"] as const).map((k) => (
              <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
                className={`-mb-px h-11 border-b-2 px-0.5 text-[14px] font-medium ${tab === k ? "border-accent text-ink" : "border-transparent text-ink-3 hover:text-ink"}`}>
                {k === "preview" ? "手机预览" : "发布"}
              </button>
            ))}
          </div>
          {tab === "preview" ? (
            <div className="flex flex-col gap-2.5 p-5">
              <div className="flex justify-between text-[12.5px] text-ink-4">
                <span>手机宽度 · 点左侧条目定位</span>
                <span className="num">日报 {d.article.counts.daily} · 补充 {d.article.counts.added} · 点评 {d.article.counts.commented}</span>
              </div>
              <PhonePreview html={d.article.html} selected={selected >= 0 ? selected : null} />
            </div>
          ) : (
            <PublishPanel d={d} stale={stale} pictures={counts.pictures} />
          )}
        </aside>
      </div>
    </>
  );
}

export default function WechatAdmin({ loaderData: { issue: d, issues } }: Route.ComponentProps) {
  if (d.status === "ready") return <Workbench key={d.date} d={d} issues={issues} />;
  return (
    <>
      <TopBar rows={issues} current={d.date} />
      <div className="mx-auto max-w-[1680px] px-4 pb-24 pt-5 sm:px-6 lg:px-8">
        <Card><Empty>{UNAVAILABLE[d.status === "not_ready" ? d.reason : d.status] ?? "暂时无法导出。"}</Empty></Card>
      </div>
    </>
  );
}
