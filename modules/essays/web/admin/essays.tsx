import { SITE } from "@aihot/site";
import { useState } from "react";
import { Link, useLoaderData, useNavigate } from "react-router";
import { useAdminAction } from "@aihot/web/features/admin/action";
import { AdminPage, Badge, Button, Card, DataTable, Field, Select, Textarea, Time } from "@aihot/web/features/admin/ui";
import { adminGet } from "@aihot/web/lib/admin.server";
import type { EssayList, EssayListEntry, EssayStatus, EssayTaskKind } from "../../contracts.ts";

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
              {styles.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}
            </Select>
          </Field>
        )}
        <Button tone="primary" busy={pending === "create"} disabled={!fragments.trim()} onClick={create}>创建</Button>
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
        <NewEssay styles={data.styles} />
      </div>
    </AdminPage>
  );
}
