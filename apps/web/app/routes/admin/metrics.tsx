import { SITE } from "@aihot/site";
import type { Route } from "./+types/metrics";
import { num, pct } from "../../features/admin/format";
import { AdminPage, Badge, Card, DataTable, FilterChips, Stat } from "../../features/admin/ui";
import { adminGet } from "../../lib/admin.server";

interface SectionReading { clicks: number; impressions: number; inspected: number; indexed: number }
interface WeeklyReading {
  week: string;
  end: string;
  partial: boolean;
  days: number;
  views: number;
  sections: Record<string, number>;
  subscribers: number;
  signups: number;
  confirmations: number;
  search: { clicks: number; impressions: number; inspected: number; indexed: number; sections: Record<string, SectionReading> } | null;
}
interface MetricsData { weeks: number; rows: WeeklyReading[]; searchConsole: { enabled: boolean } }

export async function loader({ request }: Route.LoaderArgs) {
  return adminGet<MetricsData>(request, `/api/admin/metrics${new URL(request.url).search}`);
}

export const meta: Route.MetaFunction = () => [{ title: `周读数 · ${SITE.name} 后台` }];

const SECTION_LABELS: Record<string, string> = {
  home: "首页", story: "事件", items: "条目", daily: "日报", weekly: "周报", monthly: "月报", index: "指数",
  leaderboard: "模型榜", topics: "话题", all: "全部", hot: "热榜", chronicle: "编年",
};
const label = (section: string) => SECTION_LABELS[section] ?? section;

export default function MetricsAdmin({ loaderData: d }: Route.ComponentProps) {
  // The sections with the most views over the window get a column each; the rest are summed.
  const totals = new Map<string, number>();
  for (const r of d.rows) for (const [s, n] of Object.entries(r.sections)) totals.set(s, (totals.get(s) ?? 0) + n);
  const shown = [...totals].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([s]) => s);
  const latest = d.rows.find((r) => !r.partial);
  const searched = d.rows.find((r) => r.search);
  return (
    <AdminPage title="周读数" subtitle="每周一行（周一到周日）：真人页面访问（浏览器上报，爬虫不执行脚本，不计入）、邮件订阅和 Search Console。本周未过完，标“进行中”。">
      <div className="mb-4">
        <FilterChips param="weeks" options={[4, 12, 26].map((weeks) => ({ value: weeks === 12 ? "" : String(weeks), label: `近 ${weeks} 周` }))} />
      </div>
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="上周页面访问" value={latest ? num(latest.views) : "—"} hint={latest && latest.days < 7 ? `只有 ${latest.days} 天有记录` : latest ? `日均 ${num(Math.round(latest.views / 7))}` : undefined} />
        <Stat label="已确认订阅" value={num(d.rows[0]?.subscribers ?? 0)} hint="退订未同步，实际略少" />
        <Stat label="上周搜索展示" value={searched?.search ? num(searched.search.impressions) : "—"} hint={searched?.search ? `点击 ${num(searched.search.clicks)}` : undefined} />
        <Stat label="已收录 / 已检查" value={searched?.search ? `${num(searched.search.indexed)} / ${num(searched.search.inspected)}` : "—"} hint={searched?.search ? `${searched.week} 那周` : undefined} />
      </div>
      {!d.searchConsole.enabled && (
        <p className="mb-4 text-[13px] text-ink-3">Search Console 读数没有打开：设 SEARCH_CONSOLE_ENABLED、SEARCH_CONSOLE_PROPERTY 和 SEARCH_CONSOLE_KEY_FILE（见 docs/deploy.md），worker 每周三读上一周。</p>
      )}
      <Card title="每周" pad={false}>
        <DataTable
          rows={d.rows}
          rowKey={(r) => r.week}
          columns={[
            { key: "week", label: "周", render: (r) => <span className="whitespace-nowrap font-mono text-[12.5px] text-ink">{r.week.slice(5)} – {r.end.slice(5)} {r.partial && <Badge>进行中</Badge>}</span> },
            { key: "views", label: "访问", align: "right", render: (r) => <span title={`${r.days} 天有记录`}>{num(r.views)}</span> },
            ...shown.map((s) => ({ key: `s-${s}`, label: label(s), align: "right" as const, render: (r: WeeklyReading) => num(r.sections[s] ?? 0) })),
            { key: "other", label: "其他", align: "right", render: (r) => num(Object.entries(r.sections).filter(([s]) => !shown.includes(s)).reduce((n, [, v]) => n + v, 0)) },
            { key: "subscribers", label: "订阅", align: "right", className: "whitespace-nowrap", render: (r) => <span title={`新登记 ${r.signups}，新确认 ${r.confirmations}`}>{num(r.subscribers)}{r.confirmations ? <span className="text-ink-3"> +{r.confirmations}</span> : null}</span> },
            { key: "impressions", label: "展示", align: "right", render: (r) => (r.search ? num(r.search.impressions) : "—") },
            { key: "clicks", label: "点击", align: "right", render: (r) => (r.search ? num(r.search.clicks) : "—") },
            { key: "indexed", label: "收录", align: "right", className: "whitespace-nowrap", render: (r) => (r.search ? `${num(r.search.indexed)} / ${num(r.search.inspected)}` : "—") },
          ]}
        />
      </Card>
      {searched?.search && (
        <Card className="mt-5" title={`${searched.week} 那周的 Search Console，按栏目`} pad={false}>
          <DataTable
            rows={Object.entries(searched.search.sections).sort((a, b) => b[1].impressions - a[1].impressions || b[1].inspected - a[1].inspected)}
            rowKey={([s]) => s}
            columns={[
              { key: "section", label: "栏目", render: ([s]) => label(s) },
              { key: "impressions", label: "展示", align: "right", render: ([, x]) => num(x.impressions) },
              { key: "clicks", label: "点击", align: "right", render: ([, x]) => num(x.clicks) },
              { key: "indexed", label: "已收录 / 已检查", align: "right", className: "whitespace-nowrap", render: ([, x]) => (x.inspected ? `${num(x.indexed)} / ${num(x.inspected)}` : "—") },
              { key: "rate", label: "收录率", align: "right", render: ([, x]) => (x.inspected ? pct(x.indexed / x.inspected) : "—") },
            ]}
          />
        </Card>
      )}
    </AdminPage>
  );
}
