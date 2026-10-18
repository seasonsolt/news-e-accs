import { SITE } from "@aihot/site";
import { SUBSCRIBE_FUNNEL_EVENTS, SUBSCRIBE_SOURCES, type SubscribeFunnelEvent, type SubscribeSource } from "@aihot/contracts/subscribe";
import type { Route } from "./+types/analytics";
import { LineChart } from "../../features/admin/charts";
import { bj, num } from "../../features/admin/format";
import { AdminPage, Card, DataTable, FilterChips, Stat } from "../../features/admin/ui";
import { adminGet } from "../../lib/admin.server";

interface AnalyticsData {
  days: number;
  totals: { views: number; paths: number };
  daily: Array<{ day: string; views: number }>;
  pages: Array<{ path: string; views: number }>;
  mcp: {
    totals: { calls: number; successes: number; errors: number; initializes: number; discoveries: number; checks: number; activeDays: number; averageMs: number; maxMs: number; lastCallAt: string | null };
    daily: Array<{ day: string; calls: number; successes: number }>;
    tools: Array<{ tool: string; calls: number; successes: number; errors: number; averageMs: number; maxMs: number; lastCallAt: string }>;
    errors: Array<{ outcome: string; calls: number }>;
  };
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
  subscribe_view: "订阅入口出现",
  subscribe_submit: "提交订阅",
  subscribe_success: "订阅被接受",
  subscribe_error: "订阅失败",
  subscribe_confirmed: "确认订阅",
  subscribe_dismiss: "跳过或关掉订阅",
  outbound_click: "打开原文",
  share_click: "分享",
  starred_export: "导出收藏",
  starred_import: "导入收藏",
};

const EVENT_COLORS = ["var(--accent)", "var(--hot)", "var(--ok)", "var(--amber)", "#3d6b8a", "#6b5b95", "#2f6f6a", "#8a5a44", "#5f7a3a"];
const CHART_EVENTS = new Set(["star_add", "star_remove", "first_star", "subscribe_click", "subscribe_submit", "outbound_click", "share_click", "starred_export", "starred_import"]);

const SOURCE_LABELS: Record<SubscribeSource, string> = {
  home_overlay: "首页引导",
  home_button: "首页按钮",
  subscribe_page: "订阅页",
  daily_inline: "日报页",
  item_inline: "单条页",
  chronicle_inline: "加速史",
  sticky_mobile: "手机底部条",
};

interface FunnelCount { event: string; source: string; locale: string; reason: string; count: number }
interface SubscribeFunnel {
  days: number;
  daily: Array<{ day: string; counts: FunnelCount[] }>;
  totals: FunnelCount[];
}

export async function loader({ request }: Route.LoaderArgs) {
  const search = new URL(request.url).search;
  const [overview, funnel] = await Promise.all([
    adminGet<AnalyticsData>(request, `/api/admin/analytics${search}`),
    adminGet<SubscribeFunnel>(request, `/api/admin/analytics/subscribe${search}`),
  ]);
  return { overview, funnel };
}

export const meta: Route.MetaFunction = () => [{ title: `访问统计 · ${SITE.name} 后台` }];

export default function AnalyticsAdmin({ loaderData }: Route.ComponentProps) {
  const d = loaderData.overview;
  const m = d.mcp;
  const average = d.days ? Math.round(d.totals.views / d.days) : 0;
  const interactions = d.engagement.totals.reduce((sum, row) => sum + (CHART_EVENTS.has(row.event) ? row.count : 0), 0);
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
          series={d.engagement.totals.filter((row) => CHART_EVENTS.has(row.event)).map((row, i) => ({
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
      <FunnelCard funnel={loaderData.funnel} />
      <section className="mt-8" aria-labelledby="mcp-usage-title">
        <h2 id="mcp-usage-title" className="mb-2 text-lg font-semibold">MCP 使用统计</h2>
        <p className="mb-4 text-sm text-ink-2">实际使用以工具调用为准，初始化和工具发现请求单独计数。统计从部署后开始，保留 90 天；不统计独立用户，不保存 IP、客户端名称、参数或结果正文。</p>
        <p className="mb-4 text-sm text-ink-2">自带契约检查和 smoke 标记为检查流量，不计入调用量。匿名第三方客户端与机器人无法区分；重试每次计数。成功率按工具结果计算，HTTP 200 的业务错误也计为失败。</p>
        <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-3">
          <Stat label="MCP 工具调用" value={num(m.totals.calls)} />
          <Stat label="工具成功率" value={m.totals.calls ? `${num(m.totals.successes / m.totals.calls * 100, 1)}%` : "—"} />
          <Stat label="有调用的天数" value={`${num(m.totals.activeDays)} / ${d.days}`} />
          <Stat label="初始化请求" value={num(m.totals.initializes)} />
          <Stat label="工具发现请求" value={num(m.totals.discoveries)} />
          <Stat label="工具平均耗时" value={m.totals.calls ? `${num(m.totals.averageMs)} ms` : "—"} />
        </div>
        <p className="mb-4 text-sm text-ink-2">最近调用：{bj(m.totals.lastCallAt, true)} · 最长耗时：{m.totals.calls ? `${num(m.totals.maxMs)} ms` : "—"} · 已排除检查请求：{num(m.totals.checks)}</p>
        <Card title={`近 ${d.days} 天 MCP 工具调用趋势`}>
          <LineChart labels={m.daily.map((x) => x.day.slice(5))} series={[
            { key: "calls", label: "工具调用", color: "var(--accent)", values: m.daily.map((x) => x.calls) },
            { key: "successes", label: "成功调用", color: "var(--ok)", values: m.daily.map((x) => x.successes) },
          ]} height={220} />
        </Card>
        <Card className="mt-5" title="MCP 工具排行" pad={false}>
          <DataTable rows={m.tools} rowKey={(x) => x.tool} empty="所选时间范围内没有 MCP 工具调用" columns={[
            { key: "tool", label: "工具", render: (x) => <span className="font-mono text-xs">{x.tool === "__unknown__" ? "未知工具（请求被拒绝）" : x.tool}</span> },
            { key: "calls", label: "调用", align: "right", render: (x) => num(x.calls) },
            { key: "successes", label: "成功率", align: "right", render: (x) => `${num(x.successes / x.calls * 100, 1)}%` },
            { key: "errors", label: "失败", align: "right", render: (x) => num(x.errors) },
            { key: "averageMs", label: "平均 / 最长 ms", align: "right", render: (x) => `${num(x.averageMs)} / ${num(x.maxMs)}` },
            { key: "lastCallAt", label: "最近调用", render: (x) => bj(x.lastCallAt) },
          ]} />
        </Card>
        <Card className="mt-5" title="MCP 调用错误" pad={false}>
          <DataTable rows={m.errors} rowKey={(x) => x.outcome} empty="所选时间范围内没有 MCP 调用错误" columns={[
            { key: "outcome", label: "错误类型", render: (x) => x.outcome },
            { key: "calls", label: "次数", align: "right", render: (x) => num(x.calls) },
          ]} />
        </Card>
      </section>
    </AdminPage>
  );
}

function FunnelCard({ funnel }: { funnel: SubscribeFunnel }) {
  const rows = pivot(funnel.totals);
  const errors = funnel.totals.filter((row) => row.event === "subscribe_error" && row.count > 0);
  return (
    <>
      <h2 className="mb-3 mt-8 text-[15px] font-semibold text-ink">订阅漏斗</h2>
      <Card title={`近 ${funnel.days} 天，按入口和语言`} pad={false}>
        <p className="px-4 pt-3 text-[12.5px] leading-relaxed text-ink-4">只累计次数。失败原因是类别（例如当天确认信上限 cap，或服务暂不可用 503），不含邮箱。按天的明细在 GET /api/admin/analytics/subscribe。</p>
        <DataTable
          rows={rows}
          rowKey={(row) => `${row.source}:${row.locale}`}
          empty="所选时间范围内没有订阅漏斗记录"
          columns={[
            { key: "source", label: "入口", render: (row) => SOURCE_LABELS[row.source as SubscribeSource] ?? row.source },
            { key: "locale", label: "语言", render: (row) => row.locale === "zh" ? "中文" : "英文" },
            ...SUBSCRIBE_FUNNEL_EVENTS.map((event) => ({
              key: event,
              label: EVENT_LABELS[event] ?? event,
              align: "right" as const,
              render: (row: FunnelRow) => num(row.counts[event] ?? 0),
            })),
          ]}
        />
      </Card>
      {errors.length > 0 && (
        <Card className="mt-5" title="失败原因" pad={false}>
          <DataTable
            rows={errors}
            rowKey={(row) => `${row.source}:${row.locale}:${row.reason}`}
            columns={[
              { key: "source", label: "入口", render: (row) => SOURCE_LABELS[row.source as SubscribeSource] ?? row.source },
              { key: "locale", label: "语言", render: (row) => row.locale === "zh" ? "中文" : "英文" },
              { key: "reason", label: "原因", render: (row) => row.reason },
              { key: "count", label: "次数", align: "right", render: (row) => num(row.count) },
            ]}
          />
        </Card>
      )}
    </>
  );
}

interface FunnelRow { source: string; locale: string; counts: Partial<Record<SubscribeFunnelEvent, number>> }

function pivot(totals: FunnelCount[]): FunnelRow[] {
  const map = new Map<string, FunnelRow>();
  for (const source of SUBSCRIBE_SOURCES) for (const locale of ["zh", "en"] as const) {
    map.set(`${source}:${locale}`, { source, locale, counts: {} });
  }
  for (const row of totals) {
    const slot = map.get(`${row.source}:${row.locale}`);
    if (!slot) continue;
    const event = row.event as SubscribeFunnelEvent;
    slot.counts[event] = (slot.counts[event] ?? 0) + row.count;
  }
  return [...map.values()].filter((row) => Object.values(row.counts).some((count) => count > 0));
}
