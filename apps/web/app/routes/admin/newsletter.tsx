import { SITE } from "@aihot/site";
import type { Route } from "./+types/newsletter";
import { LineChart } from "../../features/admin/charts";
import { bj, num } from "../../features/admin/format";
import { AdminPage, Badge, Card, DataTable, FilterChips, Pager, Stat } from "../../features/admin/ui";
import { adminGet } from "../../lib/admin.server";

interface Subscriber {
  id: number;
  email: string;
  status: "pending" | "confirmed";
  created_at: string;
  confirm_sent_at: string | null;
  confirmed_at: string | null;
  unsubscribed_at: string | null;
}

interface NewsletterData {
  days: number;
  page: number;
  pageSize: number;
  totalRows: number;
  totals: { total: number; confirmed: number; pending: number; unsubscribed: number };
  daily: Array<{ day: string; signups: number; confirmations: number }>;
  rows: Subscriber[];
}

export async function loader({ request }: Route.LoaderArgs) {
  return adminGet<NewsletterData>(request, `/api/admin/newsletter${new URL(request.url).search}`);
}

export const meta: Route.MetaFunction = () => [{ title: `订阅 · ${SITE.name} 后台` }];

export default function NewsletterAdmin({ loaderData: d }: Route.ComponentProps) {
  return (
    <AdminPage title="订阅" subtitle="双重确认订阅的数量、转化趋势和最近记录。退订由读者点邮件里的链接，在 Resend 完成，每天同步回本站。邮箱只在管理员后台显示。">
      <div className="mb-4">
        <FilterChips
          param="days"
          options={[7, 30, 90].map((days) => ({ value: days === 30 ? "" : String(days), label: `近 ${days} 天` }))}
        />
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="订阅总数" value={num(d.totals.total)} />
        <Stat label="已确认" value={num(d.totals.confirmed)} tone="ok" hint="不含已退订" />
        <Stat label="待确认" value={num(d.totals.pending)} tone={d.totals.pending ? "warn" : undefined} />
        <Stat label="已退订" value={num(d.totals.unsubscribed)} />
      </div>

      <Card title={`近 ${d.days} 天新增与确认`}>
        <LineChart
          labels={d.daily.map((x) => x.day.slice(5))}
          series={[
            { key: "signups", label: "新增订阅", color: "var(--accent)", values: d.daily.map((x) => x.signups) },
            { key: "confirmations", label: "完成确认", color: "var(--ok)", values: d.daily.map((x) => x.confirmations) },
          ]}
          height={220}
        />
      </Card>

      <Card className="mt-5" title="订阅记录" right={<span>共 {num(d.totalRows)} 条</span>} pad={false}>
        <DataTable
          dense
          rows={d.rows}
          rowKey={(s) => s.id}
          empty="还没有订阅记录"
          columns={[
            { key: "email", label: "邮箱", render: (s) => <span className="break-all text-ink">{s.email}</span> },
            { key: "status", label: "状态", render: (s) => (s.unsubscribed_at ? <Badge>已退订</Badge> : <Badge tone={s.status === "confirmed" ? "ok" : "warn"}>{s.status === "confirmed" ? "已确认" : "待确认"}</Badge>) },
            { key: "created", label: "提交时间", render: (s) => <span className="num whitespace-nowrap">{bj(s.created_at, true)}</span> },
            { key: "sent", label: "确认邮件", render: (s) => <span className="num whitespace-nowrap">{bj(s.confirm_sent_at, true)}</span> },
            { key: "confirmed", label: "确认时间", render: (s) => <span className="num whitespace-nowrap">{bj(s.confirmed_at, true)}</span> },
            { key: "unsubscribed", label: "发现退订", render: (s) => <span className="num whitespace-nowrap">{bj(s.unsubscribed_at, true)}</span> },
          ]}
        />
      </Card>
      <Pager page={d.page} hasMore={d.rows.length === d.pageSize} />
    </AdminPage>
  );
}
