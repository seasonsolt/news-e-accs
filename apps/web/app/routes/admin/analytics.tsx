import { SITE } from "@aihot/site";
import type { Route } from "./+types/analytics";
import { LineChart } from "../../features/admin/charts";
import { num } from "../../features/admin/format";
import { AdminPage, Card, DataTable, FilterChips, Stat } from "../../features/admin/ui";
import { adminGet } from "../../lib/admin.server";

interface AnalyticsData {
  days: number;
  totals: { views: number; paths: number };
  daily: Array<{ day: string; views: number }>;
  pages: Array<{ path: string; views: number }>;
  engagement: {
    totals: Array<{ event: string; count: number }>;
    daily: Array<{ day: string; counts: Record<string, number> }>;
    firstStarDevices: number;
    topStarred: Array<{ id: string; title: string | null; net: number }>;
  };
}

const EVENT_LABELS: Record<string, string> = {
  star_add: "收藏",
  star_remove: "取消收藏",
  first_star: "首次收藏",
  subscribe_click: "点击订阅入口",
  subscribe_submit: "提交订阅",
  outbound_click: "打开原文",
  share_click: "分享",
  starred_export: "导出收藏",
  starred_import: "导入收藏",
};

const EVENT_COLORS = ["var(--accent)", "var(--hot)", "var(--ok)", "var(--amber)", "#3d6b8a", "#6b5b95", "#2f6f6a", "#8a5a44", "#5f7a3a"];

export async function loader({ request }: Route.LoaderArgs) {
  return adminGet<AnalyticsData>(request, `/api/admin/analytics${new URL(request.url).search}`);
}

export const meta: Route.MetaFunction = () => [{ title: `访问统计 · ${SITE.name} 后台` }];

export default function AnalyticsAdmin({ loaderData: d }: Route.ComponentProps) {
  const average = d.days ? Math.round(d.totals.views / d.days) : 0;
  const interactions = d.engagement.totals.reduce((sum, row) => sum + row.count, 0);
  return (
    <AdminPage title="访问统计" subtitle="按天聚合的页面访问和互动次数，不统计独立访客；不保存 IP、Cookie、访客 ID、查询参数或单次访问记录。原文点击只保留来源域名。">
      <div className="mb-4">
        <FilterChips
          param="days"
          options={[7, 30, 90].map((days) => ({ value: days === 30 ? "" : String(days), label: `近 ${days} 天` }))}
        />
      </div>
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat label={`近 ${d.days} 天页面访问`} value={num(d.totals.views)} />
        <Stat label="日均访问" value={num(average)} />
        <Stat label="有访问的页面类型" value={num(d.totals.paths)} />
      </div>
      <Card title={`近 ${d.days} 天访问趋势`}>
        <LineChart
          labels={d.daily.map((x) => x.day.slice(5))}
          series={[{ key: "views", label: "页面访问", color: "var(--accent)", values: d.daily.map((x) => x.views) }]}
          height={220}
        />
      </Card>
      <Card className="mt-5" title="页面排行" pad={false}>
        <DataTable
          rows={d.pages}
          rowKey={(x) => x.path}
          empty="所选时间范围内没有页面访问"
          columns={[
            { key: "path", label: "页面", render: (x) => <span className="font-mono text-[12.5px] text-ink">{x.path}</span> },
            { key: "views", label: "访问量", align: "right", render: (x) => num(x.views) },
          ]}
        />
      </Card>

      <h2 className="mb-3 mt-8 text-[15px] font-semibold text-ink">互动</h2>
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat label="累计首次收藏" value={num(d.engagement.firstStarDevices)} hint="每台设备最多计一次，不保存设备标识" />
        <Stat label={`近 ${d.days} 天互动`} value={num(interactions)} />
      </div>
      <Card title={`近 ${d.days} 天互动趋势`}>
        <LineChart
          labels={d.engagement.daily.map((x) => x.day.slice(5))}
          series={d.engagement.totals.map((row, i) => ({
            key: row.event,
            label: EVENT_LABELS[row.event] ?? row.event,
            color: EVENT_COLORS[i] ?? "var(--accent)",
            values: d.engagement.daily.map((day) => day.counts[row.event] ?? 0),
          }))}
          height={220}
        />
      </Card>
      <Card className="mt-5" title={`近 ${d.days} 天互动合计`} pad={false}>
        <DataTable
          rows={d.engagement.totals}
          rowKey={(x) => x.event}
          empty="所选时间范围内没有互动"
          columns={[
            { key: "event", label: "操作", render: (x) => EVENT_LABELS[x.event] ?? x.event },
            { key: "count", label: "次数", align: "right", render: (x) => num(x.count) },
          ]}
        />
      </Card>
      <Card className="mt-5" title={`近 ${d.days} 天净收藏`} pad={false}>
        <DataTable
          rows={d.engagement.topStarred}
          rowKey={(x) => x.id}
          empty="所选时间范围内没有净收藏"
          columns={[
            {
              key: "title",
              label: "内容",
              render: (x) => (
                <a href={`/items/${x.id}`} className="text-ink hover:text-accent">
                  {x.title ?? "（已不在公开列表）"}
                  <span className="mt-0.5 block font-mono text-[11.5px] text-ink-4">{x.id}</span>
                </a>
              ),
            },
            { key: "net", label: "净收藏", align: "right", render: (x) => num(x.net) },
          ]}
        />
      </Card>
    </AdminPage>
  );
}
