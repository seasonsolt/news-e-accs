import { SITE } from "@aihot/site";
import { useRef, useState } from "react";
import { Link, useLoaderData, useNavigate } from "react-router";
import { useAdminAction } from "@aihot/web/features/admin/action";
import { toast } from "@aihot/web/features/admin/toast";
import { AdminPage, Badge, Button, Card, DataTable, Field, Input, Select, Textarea, Time } from "@aihot/web/features/admin/ui";
import { adminGet } from "@aihot/web/lib/admin.server";
import type { EssayList, EssayListEntry, EssayStatus, EssayStyle, EssayStyleUpload, EssayTaskKind } from "../../contracts.ts";

export async function loader({ request }: { request: Request }) {
  return adminGet<EssayList>(request, "/api/admin/essays");
}

export const meta = () => [{ title: `长文 · ${SITE.name} 后台` }, { name: "robots", content: "noindex" }];

const STATUS: Record<EssayStatus, { label: string; tone: "muted" | "ok" | "warn" }> = {
  draft: { label: "草稿", tone: "muted" },
  published: { label: "已发布", tone: "ok" },
  withdrawn: { label: "已撤下", tone: "warn" },
};

const KIND: Record<EssayTaskKind, string> = { outline: "提纲", draft: "成稿", revise: "单节重写", localize: "中文版", search: "搜图", draw: "画图" };

/** One site path or address per line, as the api takes them. */
const refsOf = (text: string) => text.split("\n").map((l) => l.trim()).filter(Boolean);

function NewEssay({ styles }: { styles: EssayList["styles"] }) {
  const { run, pending } = useAdminAction();
  const navigate = useNavigate();
  const [fragments, setFragments] = useState("");
  const [refs, setRefs] = useState("");
  const [style, setStyle] = useState(styles[0]?.name ?? "");
  const create = async () => {
    const res = await run<{ id: number }>("POST", "/api/admin/essays", { fragments, refs: refsOf(refs), style: style || undefined }, { label: "create", revalidate: false });
    if (res) navigate(`/admin/essays/${res.id}`);
  };
  return (
    <Card title="新文章">
      <div className="space-y-4">
        <Field label="碎片" hint="中英文都可以，一段一个想法；空一行隔开两段。之后在写作台里还能继续补。">
          <Textarea rows={12} value={fragments} onChange={(e) => setFragments(e.target.value)} placeholder="想说的观点、例子、反驳、一句话的直觉……" />
        </Field>
        <Field label="参考（可选）" hint="一行一个本站路径或网址，例如 /story/… 或 /index/…；worker 读它们公开的标题和摘要，当作文中可以引用的材料。">
          <Textarea rows={3} value={refs} onChange={(e) => setRefs(e.target.value)} placeholder="/eacc-manifesto" />
        </Field>
        {styles.length > 0 && (
          <Field label="文风" hint={styles.find((s) => s.name === style)?.description}>
            <Select value={style} onChange={(e) => setStyle(e.target.value)}>
              {styles.map((s) => <option key={s.name} value={s.name}>{s.name}{s.source === "uploaded" ? " · 上传" : ""}</option>)}
            </Select>
          </Field>
        )}
        <Button tone="primary" busy={pending === "create"} disabled={!fragments.trim()} onClick={create}>创建</Button>
      </div>
    </Card>
  );
}

const TEXT = /\.(md|markdown|txt)$/i;
const ARCHIVE = /\.(zip|skill)$/i;

function readDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/** What the browser picked, as the api takes it: one archive, or the skill's text files under their paths. */
async function uploadOf(picked: File[]): Promise<EssayStyleUpload | null> {
  const archive = picked.find((f) => ARCHIVE.test(f.name));
  if (archive) return { archive: await readDataUrl(archive) };
  const texts = picked.filter((f) => TEXT.test(f.name));
  if (!texts.length) return null;
  const files = await Promise.all(texts.map(async (f) => ({ path: f.webkitRelativePath || f.name, content: await f.text() })));
  // One loose file is the skill itself, whatever it is called.
  if (files.length === 1 && !files[0]!.path.includes("/")) files[0]!.path = "SKILL.md";
  return { files };
}

function Styles({ styles }: { styles: EssayStyle[] }) {
  const { run, pending } = useAdminAction();
  const [name, setName] = useState("");
  const folder = useRef<HTMLInputElement>(null);
  const loose = useRef<HTMLInputElement>(null);
  const upload = async (list: FileList | null) => {
    const body = await uploadOf([...(list ?? [])]);
    if (!body) return;
    const res = await run<EssayStyle>("POST", "/api/admin/essays/styles", { ...body, name: name.trim() || undefined }, { label: "style-upload" });
    if (res) {
      setName("");
      toast(`文风 ${res.name} 可以用了`, "ok");
    }
  };
  return (
    <Card title="文风" right={`${styles.length} 种`}>
      <div className="space-y-4">
        <ul className="divide-y divide-line-soft">
          {styles.map((s) => (
            <li key={s.name} className="flex items-start justify-between gap-3 py-2.5 first:pt-0">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-medium text-ink">{s.name}</span>
                  <Badge tone={s.source === "builtin" ? "muted" : "accent"}>{s.source === "builtin" ? "自带" : "上传"}</Badge>
                  {s.essays > 0 && <span className="text-[12px] text-ink-3">{s.essays} 篇在用</span>}
                </div>
                {s.description && <p className="mt-0.5 text-[12.5px] text-ink-2">{s.description}</p>}
                <p className="mt-0.5 text-[12px] text-ink-4" title={s.files.join("\n")}>
                  {s.files.length} 个文件{s.updatedAt && <> · <Time at={s.updatedAt} /></>}
                </p>
              </div>
              {s.source === "uploaded" && (
                <Button size="sm" tone="ghost" busy={pending === `style-remove-${s.name}`} disabled={s.essays > 0}
                  title={s.essays > 0 ? "还有文章在用，先给它们换个文风" : undefined}
                  onClick={() => window.confirm(`删掉文风 ${s.name}？`) && run("DELETE", `/api/admin/essays/styles/${s.name}`, undefined, { label: `style-remove-${s.name}`, success: "已删除" })}>
                  删除
                </Button>
              )}
            </li>
          ))}
        </ul>
        <Field label="上传 skill" hint="整个 skill 文件夹、它的 .zip / .skill 包，或一份 SKILL.md。只读里面的 .md 文字，脚本不会执行。名字取 SKILL.md 开头的 name；同名的上传会替换旧版，之后的写作马上用新版。">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="名字（可选，留空用 SKILL.md 里的）" />
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button busy={pending === "style-upload"} onClick={() => folder.current?.click()}>选文件夹</Button>
          <Button busy={pending === "style-upload"} onClick={() => loose.current?.click()}>选压缩包或 .md</Button>
        </div>
        <input ref={folder} type="file" className="hidden" {...{ webkitdirectory: "", directory: "" }} onChange={(e) => { void upload(e.target.files); e.target.value = ""; }} />
        <input ref={loose} type="file" multiple accept=".zip,.skill,.md,.markdown,.txt" className="hidden" onChange={(e) => { void upload(e.target.files); e.target.value = ""; }} />
      </div>
    </Card>
  );
}

export default function EssaysAdmin() {
  const data = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  return (
    <AdminPage title="长文" subtitle="把零散的想法交给 worker 扩写成署名长文：先出提纲，再成稿、出中文版、配图，改定后中英两版一起发布。">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
        <Card title="全部文章" right={`${data.essays.length} 篇`} pad={false}>
          <DataTable<EssayListEntry>
            rows={data.essays}
            rowKey={(e) => e.id}
            empty="还没有文章。"
            onRowClick={(e) => navigate(`/admin/essays/${e.id}`)}
            columns={[
              { key: "title", label: "标题", render: (e) => <Link to={`/admin/essays/${e.id}`} className="font-medium text-ink hover:underline">{e.title}</Link> },
              {
                key: "status", label: "状态", render: (e) => (
                  <span className="flex flex-wrap gap-1">
                    <Badge tone={STATUS[e.status].tone}>{STATUS[e.status].label}</Badge>
                    {e.working && <Badge tone="accent">{KIND[e.working]}进行中</Badge>}
                    {e.failed > 0 && <Badge tone="bad">{e.failed} 个失败</Badge>}
                  </span>
                ),
              },
              { key: "updated", label: "更新", render: (e) => <Time at={e.updatedAt} /> },
              { key: "published", label: "首次发布", render: (e) => <Time at={e.publishedAt} /> },
            ]}
          />
        </Card>
        <div className="space-y-6">
          <NewEssay styles={data.styles} />
          <Styles styles={data.styles} />
        </div>
      </div>
    </AdminPage>
  );
}
