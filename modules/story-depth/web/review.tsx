import { useState } from "react";
import { Form, Link, useLoaderData, useRevalidator, useSearchParams } from "react-router";
import { adminGet } from "@aihot/web/lib/admin.server";
import { useAdminAction } from "@aihot/web/features/admin/action";
import { AdminPage, Button, Card, Field, Input, Select, Textarea } from "@aihot/web/features/admin/ui";
import { depthDiff, type ReviewEntry, type ReviewQueue, type StoryDepth } from "../contracts.ts";

export async function loader({ request }: { request: Request }) {
  return adminGet<ReviewQueue>(request, `/api/admin/review${new URL(request.url).search}`);
}

export const meta = () => [{ title: "待审" }, { name: "robots", content: "noindex" }];

const STATUS: Record<ReviewEntry["status"], string> = { queued: "起草中", pending: "待审", failed: "失败" };

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <Field label={label}><Textarea rows={3} value={value} onChange={(e) => onChange(e.target.value)} /></Field>;
}

function CitationFields({ evidence, reportId, quote, onReport, onQuote }: {
  evidence: ReviewEntry["evidence"];
  reportId: string;
  quote: string;
  onReport: (id: string) => void;
  onQuote: (quote: string) => void;
}) {
  return (
    <>
      <Field label="来源报道">
        <Select value={reportId} onChange={(e) => onReport(e.target.value)}>
          {evidence.map((e) => <option key={e.id} value={e.id}>{e.source}: {e.title}</option>)}
        </Select>
      </Field>
      <TextField label="原文引用（须与报道逐字一致）" value={quote} onChange={onQuote} />
    </>
  );
}

function DraftEditor({ entry }: { entry: ReviewEntry }) {
  const { run, busy } = useAdminAction();
  const [draft, setDraft] = useState(entry.draft);
  const [note, setNote] = useState("");
  const change = <K extends keyof StoryDepth>(key: K, value: StoryDepth[K]) => setDraft((d) => d ? { ...d, [key]: value } : d);
  const number = (i: number, patch: Partial<StoryDepth["numbers"][number]>) => {
    if (draft) change("numbers", draft.numbers.map((n, j) => j === i ? { ...n, ...patch } : n));
  };
  const reaction = (i: number, patch: Partial<StoryDepth["reactions"][number]>) => {
    if (draft) change("reactions", draft.reactions.map((r, j) => j === i ? { ...r, ...patch } : r));
  };
  const submit = (command: "save" | "publish" | "reject") => run("POST", `/api/admin/review/${entry.id}`, {
    version: entry.version, command, content: draft, note,
  }, { success: command === "publish" ? "已发布" : command === "reject" ? "已驳回" : "已保存" });

  return (
    <Card title={<a href={`/story/${entry.publicId}`}>{entry.title}</a>} right={`事件深度 · ${STATUS[entry.status]}`}>
      <div className="space-y-4">
        {entry.error && <p role="alert">{entry.error}</p>}
        {entry.status === "queued" && <p>等 worker 起草，刷新查看进度。</p>}
        {draft && (
          <>
            <TextField label="Background（前因）" value={draft.background} onChange={(v) => change("background", v)} />
            <fieldset className="space-y-3">
              <legend className="font-semibold">Key numbers（关键数字）</legend>
              {draft.numbers.map((n, i) => (
                <div key={i} className="space-y-2 rounded border border-line p-3">
                  <TextField label="数字（须在引用中原样出现）" value={n.value} onChange={(value) => number(i, { value })} />
                  <TextField label="说明：单位、范围和条件" value={n.context} onChange={(context) => number(i, { context })} />
                  <CitationFields evidence={entry.evidence} reportId={n.reportId} quote={n.quote}
                    onReport={(reportId) => number(i, { reportId })} onQuote={(quote) => number(i, { quote })} />
                  <Button size="sm" onClick={() => change("numbers", draft.numbers.filter((_, j) => j !== i))}>删除这条数字</Button>
                </div>
              ))}
              <Button size="sm" disabled={draft.numbers.length >= 10} onClick={() => change("numbers", [
                ...draft.numbers, { value: "", context: "", reportId: entry.evidence[0]?.id ?? "", quote: "" },
              ])}>添加数字</Button>
            </fieldset>
            <fieldset className="space-y-3">
              <legend className="font-semibold">Reactions（各方反应）</legend>
              {draft.reactions.map((r, i) => (
                <div key={i} className="space-y-2 rounded border border-line p-3">
                  <TextField label="谁" value={r.who} onChange={(who) => reaction(i, { who })} />
                  <TextField label="反应" value={r.text} onChange={(text) => reaction(i, { text })} />
                  <CitationFields evidence={entry.evidence} reportId={r.reportId} quote={r.quote}
                    onReport={(reportId) => reaction(i, { reportId })} onQuote={(quote) => reaction(i, { quote })} />
                  <Button size="sm" onClick={() => change("reactions", draft.reactions.filter((_, j) => j !== i))}>删除这条反应</Button>
                </div>
              ))}
              <Button size="sm" disabled={draft.reactions.length >= 10} onClick={() => change("reactions", [
                ...draft.reactions, { who: "", text: "", reportId: entry.evidence[0]?.id ?? "", quote: "" },
              ])}>添加反应</Button>
            </fieldset>
            <TextField label="What it accelerates（加速了什么）" value={draft.accelerates} onChange={(v) => change("accelerates", v)} />
            <Field label="指数页（可选）">
              <Input placeholder="/index/cost-of-intelligence" value={draft.curve?.path ?? ""}
                onChange={(e) => change("curve", e.target.value ? { path: e.target.value, label: draft.curve?.label ?? "" } : null)} />
            </Field>
            {draft.curve && <TextField label="指数链接文字" value={draft.curve.label} onChange={(label) => change("curve", { ...draft.curve!, label })} />}
            <details open={!!entry.published}>
              <summary>与已发布版本的差异{entry.published ? "" : "（首次起草）"}</summary>
              <div className="mt-3 space-y-4">
                {depthDiff(entry.published, draft).map((d) => (
                  <div key={d.field}>
                    <h3 className="font-semibold">{d.field}</h3>
                    <div className="grid gap-3 lg:grid-cols-2">
                      <div><p>已发布</p><pre className="whitespace-pre-wrap break-words text-sm"><del>{d.before}</del></pre></div>
                      <div><p>草稿</p><pre className="whitespace-pre-wrap break-words text-sm"><ins>{d.after}</ins></pre></div>
                    </div>
                  </div>
                ))}
              </div>
            </details>
          </>
        )}
        <details>
          <summary>来源依据（{entry.evidence.length}）</summary>
          {entry.evidence.map((e) => (
            <div key={e.id} className="mt-3">
              <a className="text-accent underline" href={`/items/${e.id}`}>{e.source}: {e.title}</a>
              <pre className="whitespace-pre-wrap break-words text-sm">{e.text}</pre>
            </div>
          ))}
        </details>
        <TextField label="审稿说明：发布前核对了哪些事实、改了哪些判断" value={note} onChange={setNote} />
        <div className="flex flex-wrap gap-3">
          {draft && (
            <>
              <Button disabled={busy} onClick={() => submit("save")}>保存修改</Button>
              <Button tone="primary" disabled={busy || !note.trim()} onClick={() => submit("publish")}>审定并发布</Button>
            </>
          )}
          <Button tone="danger" disabled={busy} onClick={() => submit("reject")}>{entry.status === "queued" ? "撤回请求" : "驳回草稿"}</Button>
        </div>
      </div>
    </Card>
  );
}

export default function ReviewPage() {
  const data = useLoaderData<typeof loader>();
  const { run, busy } = useAdminAction();
  const refresh = useRevalidator();
  const [search] = useSearchParams();
  const pageLink = (page: number) => {
    const params = new URLSearchParams(search);
    params.set("page", String(page));
    return `?${params}`;
  };
  return (
    <AdminPage title="待审"
      subtitle="核对来源依据、改定判断，写下审稿说明再发布。草稿不公开；深度内容用英文，前台中英文版都显示英文。"
      actions={<Button onClick={() => refresh.revalidate()}>刷新</Button>}>
      <section className="space-y-4" aria-label="待审草稿">
        {data.entries.length ? data.entries.map((entry) => <DraftEditor key={`${entry.id}:${entry.version}`} entry={entry} />) : <p>没有待审的草稿。</p>}
      </section>
      <Card className="mt-6" title="选择要做厚的事件">
        <Form method="get" className="flex gap-3">
          <Input aria-label="搜索事件" name="q" defaultValue={search.get("q") ?? ""} placeholder="标题或事件 ID" />
          <Button type="submit">搜索</Button>
        </Form>
        <ul className="divide-y divide-line">
          {data.stories.map((story) => (
            <li key={story.id} className="flex items-center justify-between gap-4 py-3">
              <a href={`/story/${story.publicId}`}>{story.title}</a>
              <Button size="sm" disabled={busy || data.entries.some((e) => e.subjectId === String(story.id))}
                onClick={() => run("POST", "/api/admin/review/deepen", { storyId: story.id }, { success: "已请求起草" })}>
                {story.published ? "重新起草" : "做厚"}
              </Button>
            </li>
          ))}
        </ul>
        <nav className="mt-3 flex gap-4">
          {data.page > 1 && <Link to={pageLink(data.page - 1)}>上一页</Link>}
          {data.hasMore && <Link to={pageLink(data.page + 1)}>下一页</Link>}
        </nav>
      </Card>
    </AdminPage>
  );
}
