import { SITE } from "@aihot/site";
import { useEffect, useMemo, useRef, useState } from "react";
import { Form, Link } from "react-router";
import type { Route } from "./+types/wechat";
import { useAdminAction } from "../../features/admin/action";
import { toast } from "../../features/admin/toast";
import { AdminPage, Badge, Button, Card, Empty, Input, Textarea } from "../../features/admin/ui";
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

type WechatExport =
  | { date: string; status: "no_report" | "empty" }
  | { date: string; status: "not_ready"; reason: string }
  | {
      date: string; status: "ready"; minimum: number; revision: number; edits: WechatEdits; article: WechatArticle;
      limits: { title: number; digest: number }; themes: Array<{ key: string; label: string }>;
      coverUrl: string;
      push: { enabled: boolean; configured: boolean; pushedAt: string | null; pushedRevision: number | null; pushedBy: string | null };
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
const chars = (s: string) => Array.from(s).length;

/** Rich text for the 公众号 editor, with the plain text alongside for anywhere that takes no formatting. */
async function copyRich(html: string, text: string) {
  try {
    await navigator.clipboard.write([new ClipboardItem({ "text/html": new Blob([html], { type: "text/html" }), "text/plain": new Blob([text], { type: "text/plain" }) })]);
  } catch {
    await copyText(text);
    throw new Error("rich copy unavailable");
  }
}

function Counter({ value, max }: { value: string; max: number }) {
  const n = chars(value);
  return <span className={`num text-[12px] ${n > max ? "text-hot" : "text-ink-4"}`}>{n}/{max}</span>;
}

function CopyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 border-b border-line py-2.5 last:border-0">
      <div className="w-16 shrink-0 text-[12.5px] text-ink-3">{label}</div>
      <div className="min-w-0 flex-1 truncate text-[13px] text-ink" title={value}>{value}</div>
      <Button size="sm" onClick={() => copyText(value).then(() => toast(`已复制${label}`, "ok"), () => toast("复制失败", "error"))}>复制</Button>
    </div>
  );
}

function Issues({ rows, current }: { rows: IssueRow[]; current: string }) {
  return (
    <Card title="期数" pad={false}>
      <ul className="max-h-[70vh] overflow-y-auto py-1">
        {rows.map((r) => (
          <li key={r.date}>
            <Link
              to={`?date=${r.date}`}
              className={`flex items-center justify-between gap-2 px-4 py-2 text-[13px] hover:bg-bg-sunk ${r.date === current ? "bg-accent-soft text-accent" : "text-ink-2"}`}
            >
              <span className="num">{r.date.slice(5)}<span className="ml-1.5 text-[11.5px] text-ink-4">第 {r.issueNumber} 期</span></span>
              <span className="flex gap-1">
                {r.pushedAt && <Badge tone="ok">已推送</Badge>}
                {r.edited && <Badge tone="accent">已编辑</Badge>}
                {r.comments > 0 && <Badge>点评 {r.comments}</Badge>}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** The server's address on the 公众号's IP allowlist; the draft API answers no other. */
const SERVER_IP = "154.17.4.14";
const PUSHED: Record<string, string> = {
  created: "已放进公众号草稿箱",
  updated: "已更新草稿箱里的这篇",
  recreated: "原来的草稿已不在草稿箱，已重新放进去",
};

function Push({ d, revision, saving }: { d: Ready; revision: number; saving: boolean }) {
  const { run, pending } = useAdminAction();
  const { push } = d;
  if (!push.enabled || !push.configured) {
    return (
      <Card title="推送到草稿箱">
        <ol className="list-decimal space-y-1.5 pl-5 text-[12.5px] leading-relaxed text-ink-2">
          <li>在公众号后台「设置与开发 → 开发接口管理」拿到 AppID 和 AppSecret。</li>
          <li>把服务器 IP <code className="num rounded bg-bg-sunk px-1">{SERVER_IP}</code> 加进同一页的「IP 白名单」。</li>
          <li>在服务器的 .env 里设 <code>WECHAT_APPID</code>、<code>WECHAT_APPSECRET</code> 和 <code>WECHAT_DRAFT_ENABLED=true</code>，重启。</li>
        </ol>
        <p className="mt-2 text-[12px] text-ink-4">
          {!push.enabled ? "推送还没打开。" : "还没配置 AppID 和 AppSecret。"}配好之前，用上面的「复制正文」和下载的封面手动发。
        </p>
      </Card>
    );
  }
  const stale = push.pushedRevision !== null && push.pushedRevision !== revision;
  return (
    <Card
      title="推送到草稿箱"
      right={
        <Button
          tone="primary"
          size="sm"
          disabled={saving || pending === "push"}
          onClick={async () => {
            const res = await run<{ action: string }>("POST", `/api/admin/wechat/${d.date}/draft`, {}, { label: "push" });
            if (res) toast(PUSHED[res.action] ?? "已推送", "ok");
          }}
        >
          {pending === "push" ? "推送中…" : push.pushedAt ? "更新草稿" : "推送到草稿箱"}
        </Button>
      }
    >
      <p className="text-[12.5px] leading-relaxed text-ink-2">
        {push.pushedAt
          ? <>上次推送：{new Date(push.pushedAt).toLocaleString("zh-CN", { hour12: false })}{push.pushedBy ? `（${push.pushedBy}）` : ""}{stale && <span className="text-hot">，之后又改过，记得更新草稿</span>}</>
          : "还没推送过这一期。"}
      </p>
      <p className="mt-1.5 text-[12px] text-ink-4">标题、摘要、正文、封面和阅读原文一起放进草稿箱；发表仍在公众号后台点。再次推送会更新同一篇草稿。</p>
    </Card>
  );
}

/** The editor's working copy of one issue. */
interface Draft {
  title: string;
  digest: string;
  theme: string;
  items: Array<ColumnEntry & { body: string; comment: string }>;
}

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

const edited = (e: Draft["items"][number]) =>
  e.title !== e.generated.title || e.body !== (e.generated.body ?? "") || e.comment !== (e.generated.comment ?? "");

function Workbench({ d }: { d: Ready }) {
  const { run } = useAdminAction();
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

  const set = (patch: Partial<Draft>) => setDraft((x) => ({ ...x, ...patch }));
  const setItem = (key: string, patch: Partial<Draft["items"][number]>) =>
    setDraft((x) => ({ ...x, items: x.items.map((e) => (e.key === key ? { ...e, ...patch } : e)) }));
  const move = (from: number, to: number) =>
    setDraft((x) => {
      if (to < 0 || to >= x.items.length || from === to) return x;
      const items = [...x.items];
      const [moved] = items.splice(from, 1);
      items.splice(to, 0, moved!);
      return { ...x, items };
    });

  const shown = useMemo(() => draft.items.filter((e) => !e.hidden).length, [draft.items]);
  const status = { idle: "已保存", pending: "待保存…", saving: "保存中…", error: "保存失败" }[saving];
  let number = 0;

  return (
    <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
      <div className="min-w-0 space-y-5">
        <Card title="标题与摘要" right={<span className={saving === "error" ? "text-hot" : ""}>{status}</span>}>
          <div className="space-y-3">
            <div>
              <div className="mb-1 flex items-center justify-between text-[12.5px] text-ink-2">
                <span>标题</span>
                <Counter value={draft.title || d.article.defaults.title} max={d.limits.title} />
              </div>
              <Input value={draft.title} placeholder={d.article.defaults.title} onChange={(ev) => set({ title: ev.target.value })} />
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between text-[12.5px] text-ink-2">
                <span>摘要</span>
                <Counter value={draft.digest || d.article.defaults.digest} max={d.limits.digest} />
              </div>
              <Textarea rows={2} className="min-h-[60px]" value={draft.digest} placeholder={d.article.defaults.digest} onChange={(ev) => set({ digest: ev.target.value })} />
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-ink-2">
              <span className="mr-1">主题</span>
              {d.themes.map((t) => (
                <Button key={t.key} size="sm" tone={draft.theme === t.key ? "primary" : "secondary"} onClick={() => set({ theme: t.key })}>{t.label}</Button>
              ))}
            </div>
          </div>
        </Card>

        <Card
          title={`条目（显示 ${shown} 条）`}
          right={<span>拖动或用 ↑↓ 排序；点「隐藏」不发这一条；改过的文字可以恢复成生成的版本</span>}
        >
          <ol className="space-y-3">
            {draft.items.map((e, i) => {
              if (!e.hidden) number += 1;
              return (
                <li
                  key={e.key}
                  draggable
                  onDragStart={() => { dragged.current = i; }}
                  onDragOver={(ev) => ev.preventDefault()}
                  onDrop={() => { if (dragged.current !== null) move(dragged.current, i); dragged.current = null; }}
                  className={`rounded-control p-3 ring-1 ring-line ${e.hidden ? "bg-bg-sunk opacity-60" : "bg-surface"}`}
                >
                  <div className="mb-2 flex flex-wrap items-center gap-2 text-[12px] text-ink-3">
                    <span className="num cursor-grab text-[15px] font-semibold text-accent" title="拖动排序">{e.hidden ? "—" : String(number).padStart(2, "0")}</span>
                    <span>{e.section} · {e.sourceName}</span>
                    {e.added && <Badge title="日报不足 10 条时按评分补充的条目">补充</Badge>}
                    {edited(e) && <Badge tone="accent">已改</Badge>}
                    <span className="ml-auto flex gap-1">
                      <Button size="sm" tone="ghost" disabled={i === 0} onClick={() => move(i, i - 1)} aria-label="上移">↑</Button>
                      <Button size="sm" tone="ghost" disabled={i === draft.items.length - 1} onClick={() => move(i, i + 1)} aria-label="下移">↓</Button>
                      {edited(e) && (
                        <Button size="sm" tone="ghost" onClick={() => setItem(e.key, { title: e.generated.title, body: e.generated.body ?? "", comment: e.generated.comment ?? "" })}>恢复</Button>
                      )}
                      <Button size="sm" onClick={() => setItem(e.key, { hidden: !e.hidden })}>{e.hidden ? "显示" : "隐藏"}</Button>
                    </span>
                  </div>
                  {!e.hidden && (
                    <div className="space-y-2">
                      <Input value={e.title} onChange={(ev) => setItem(e.key, { title: ev.target.value })} className="font-semibold" />
                      <Textarea rows={3} className="min-h-[72px]" value={e.body} placeholder="（无正文）" onChange={(ev) => setItem(e.key, { body: ev.target.value })} />
                      <div className="flex items-start gap-2">
                        <span className="mt-2 shrink-0 text-[12px] font-medium text-accent">{SITE.name} 点评</span>
                        <Textarea rows={2} className="min-h-[48px]" value={e.comment} placeholder="（无点评，留空则不显示）" onChange={(ev) => setItem(e.key, { comment: ev.target.value })} />
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        </Card>
      </div>

      <div className="min-w-0 space-y-5 xl:sticky xl:top-4 xl:self-start">
        <Card
          title="手机预览"
          right={
            <Button
              tone="primary"
              size="sm"
              disabled={saving !== "idle"}
              onClick={() => copyRich(d.article.html, d.article.text).then(() => toast("已复制正文，可以粘贴到公众号编辑器", "ok"), () => toast("浏览器不支持复制格式，已复制纯文本", "error"))}
            >
              复制正文
            </Button>
          }
        >
          {/* Our own markup: every report string in it is escaped on the server. */}
          <div className="mx-auto max-h-[70vh] max-w-[375px] overflow-y-auto rounded-[10px] bg-white px-4 py-5 ring-1 ring-line" dangerouslySetInnerHTML={{ __html: d.article.html }} />
          <p className="mt-2 text-center text-[12px] text-ink-4">
            共 {d.article.counts.daily + d.article.counts.added} 条（日报 {d.article.counts.daily}，补充 {d.article.counts.added}），点评 {d.article.counts.commented} 条
          </p>
        </Card>
        <Card
          title="封面"
          right={<a href={d.coverUrl} download={`AI早报-${d.date}.png`} className="text-accent hover:underline">下载</a>}
        >
          <img src={d.coverUrl} alt="本期封面" width={1175} height={500} className="h-auto w-full rounded-[6px] ring-1 ring-line" />
          <p className="mt-2 text-[12px] text-ink-4">随主题和第一条的标题自动生成；左侧方块是 1:1 的裁切区域。</p>
        </Card>
        <Push d={d} revision={saved} saving={saving !== "idle"} />
        <Card title="填写项">
          <CopyRow label="标题" value={d.article.title} />
          <CopyRow label="摘要" value={d.article.digest} />
          <CopyRow label="阅读原文" value={d.article.readMoreUrl} />
        </Card>
      </div>
    </div>
  );
}

export default function WechatAdmin({ loaderData: { issue: d, issues } }: Route.ComponentProps) {
  return (
    <AdminPage
      title="公众号工作台"
      subtitle="「AI 早报」每天由中文日报生成，日报不足 10 条时按评分补充；worker 在日报就绪后为每条写一句点评。在这里排序、隐藏、改写，改动自动保存，右侧预览随之更新。"
      actions={
        <Form method="get" className="flex items-center gap-2">
          <Input type="date" name="date" defaultValue={d.date} className="w-40" />
          <Button type="submit">查看</Button>
        </Form>
      }
    >
      <div className="grid gap-5 lg:grid-cols-[200px_minmax(0,1fr)]">
        <div className="min-w-0"><Issues rows={issues} current={d.date} /></div>
        {d.status !== "ready" ? (
          <Card><Empty>{UNAVAILABLE[d.status === "not_ready" ? d.reason : d.status] ?? "暂时无法导出。"}</Empty></Card>
        ) : (
          <Workbench key={d.date} d={d} />
        )}
      </div>
    </AdminPage>
  );
}
