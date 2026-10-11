import { SITE } from "@aihot/site";
import { Form } from "react-router";
import type { Route } from "./+types/wechat";
import { toast } from "../../features/admin/toast";
import { AdminPage, Button, Card, Empty, Input } from "../../features/admin/ui";
import { adminGet } from "../../lib/admin.server";
import { copyText } from "../../lib/clipboard";

interface WechatArticle {
  title: string;
  digest: string;
  readMoreUrl: string;
  html: string;
  text: string;
}

type WechatExport =
  | { date: string; status: "no_report" | "empty" }
  | { date: string; status: "not_ready"; reason: string }
  | { date: string; status: "ready"; article: WechatArticle };

/** The editor's limits (packages/backend/src/newsletter/wechat.ts). */
const TITLE_MAX = 64;
const DIGEST_MAX = 120;

export async function loader({ request }: Route.LoaderArgs) {
  return adminGet<WechatExport>(request, `/api/admin/wechat${new URL(request.url).search}`);
}

export const meta: Route.MetaFunction = () => [{ title: `公众号 · ${SITE.name} 后台` }];

const UNAVAILABLE: Record<string, string> = {
  no_report: "这一天还没有日报。",
  empty: "这一天的日报没有可展示的条目。",
  "edition not ready": "中文版日报还没生成好，稍后再来。",
  "citation edition not ready": "日报里还有条目没翻译成中文，稍后再来。",
};

/** Rich text for the 公众号 editor, with the plain text alongside for anywhere that takes no formatting. */
async function copyRich(html: string, text: string) {
  try {
    await navigator.clipboard.write([new ClipboardItem({ "text/html": new Blob([html], { type: "text/html" }), "text/plain": new Blob([text], { type: "text/plain" }) })]);
  } catch {
    await copyText(text);
    throw new Error("rich copy unavailable");
  }
}

function CopyRow({ label, value, max }: { label: string; value: string; max?: number }) {
  const length = Array.from(value).length;
  return (
    <div className="flex items-start gap-3 border-b border-line py-3 last:border-0">
      <div className="w-20 shrink-0 pt-0.5 text-[12.5px] text-ink-3">{label}</div>
      <div className="min-w-0 flex-1 break-words text-[14px] leading-relaxed text-ink">{value}</div>
      {max !== undefined && <div className={`num shrink-0 pt-0.5 text-[12px] ${length > max ? "text-hot" : "text-ink-4"}`}>{length}/{max}</div>}
      <Button size="sm" onClick={() => copyText(value).then(() => toast(`已复制${label}`, "ok"), () => toast("复制失败", "error"))}>复制</Button>
    </div>
  );
}

export default function WechatAdmin({ loaderData: d }: Route.ComponentProps) {
  return (
    <AdminPage
      title="公众号"
      subtitle="把一天的中文日报整理成公众号文章：复制正文粘贴到公众号编辑器，再把标题、摘要和「阅读原文」链接填进对应位置。正文不带链接，公众号只认文末的「阅读原文」。"
      actions={
        <Form method="get" className="flex items-center gap-2">
          <Input type="date" name="date" defaultValue={d.date} className="w-40" />
          <Button type="submit">查看</Button>
        </Form>
      }
    >
      {d.status !== "ready" ? (
        <Card><Empty>{UNAVAILABLE[d.status === "not_ready" ? d.reason : d.status] ?? "暂时无法导出。"}</Empty></Card>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_400px]">
          <div className="space-y-5">
            <Card title="填写项">
              <CopyRow label="标题" value={d.article.title} max={TITLE_MAX} />
              <CopyRow label="摘要" value={d.article.digest} max={DIGEST_MAX} />
              <CopyRow label="阅读原文" value={d.article.readMoreUrl} />
            </Card>
            <Card title="发布步骤">
              <ol className="list-decimal space-y-1.5 pl-5 text-[13.5px] leading-relaxed text-ink-2">
                <li>点「复制正文」，在公众号编辑器的正文区粘贴。</li>
                <li>填标题和摘要，在「原文链接」里填阅读原文的地址。</li>
                <li>自选封面图；信源里的图片版权不属于本站，不要直接拿来当封面。</li>
                <li>预览确认后再群发。</li>
              </ol>
            </Card>
          </div>
          <Card
            title="正文预览"
            right={
              <Button
                tone="primary"
                size="sm"
                onClick={() => copyRich(d.article.html, d.article.text).then(() => toast("已复制正文，可以粘贴到公众号编辑器", "ok"), () => toast("浏览器不支持复制格式，已复制纯文本", "error"))}
              >
                复制正文
              </Button>
            }
          >
            {/* Our own markup: every report string in it is escaped on the server. */}
            <div className="mx-auto max-w-[375px] rounded-[10px] bg-white px-4 py-5" dangerouslySetInnerHTML={{ __html: d.article.html }} />
          </Card>
        </div>
      )}
    </AdminPage>
  );
}
