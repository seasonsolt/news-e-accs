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
}

export async function loader({ request }: Route.LoaderArgs) {
  return adminGet<AnalyticsData>(request, `/api/admin/analytics${new URL(request.url).search}`);
}

export const meta: Route.MetaFunction = () => [{ title: `访问统计 · ${SITE.name} 后台` }];

export default function AnalyticsAdmin({ loaderData: d }: Route.ComponentProps) {
  const average = d.days ? Math.round(d.totals.views / d.days) : 0;
  return (
    <AdminPage title="访问统计" subtitle="按天聚合的页面访问量，不统计独立访客；不保存 IP、Cookie、访客 ID、查询参数或单次访问记录。">
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
    </AdminPage>
  );
}
