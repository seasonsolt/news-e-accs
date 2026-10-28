// 周报 and 出口: one row a week of page views, subscribers and Search Console (the baseline of
// docs/plans/phase-two.md 9.1), and the machine outlets and interaction counts kept as daily totals.
import { Badge, Card, DataTable, FilterChips, Stat } from "../ui";
import { LineChart } from "../charts";
import { bj, num, pct } from "../format";
import { EVENT_LABELS, Section } from "./shared";
import type { EngagementData, SectionReading, WeeklyData, WeeklyReading } from "./types";

const SECTION_LABELS: Record<string, string> = {
  home: "首页", story: "事件", items: "条目", daily: "日报", weekly: "周报", monthly: "月报", index: "指数",
  leaderboard: "模型榜", topics: "话题", all: "全部", hot: "热榜", chronicle: "编年",
};
const label = (section: string) => SECTION_LABELS[section] ?? section;
// Google's coverage states for pages it has not indexed, as Search Console names them in Chinese.
const REASON_LABELS: Record<string, string> = {
  "Crawled - currently not indexed": "已抓取，未编入索引",
  "Discovered - currently not indexed": "已发现，未抓取",
  "URL is unknown to Google": "Google 不知道这个网址",
  "Duplicate, Google chose different canonical than user": "重复，Google 选了别的规范网址",
  "Duplicate without user-selected canonical": "重复，未指定规范网址",
  "Alternate page with proper canonical tag": "备用网页，规范标记正确",
  "Excluded by ‘noindex’ tag": "noindex 排除",
  "Page with redirect": "重定向",
  "Not found (404)": "404",
  "Soft 404": "软 404",
};
const reasons = (x: SectionReading) =>
  Object.entries(x.reasons ?? {}).sort((a, b) => b[1] - a[1]).map(([r, n]) => `${REASON_LABELS[r] ?? r} ${n}`).join("；");

export function WeeklyTab({ d }: { d: WeeklyData }) {
  // The sections with the most views over the window get a column each; the rest are summed.
  const totals = new Map<string, number>();
  for (const r of d.rows) for (const [s, n] of Object.entries(r.sections)) totals.set(s, (totals.get(s) ?? 0) + n);
  const shown = [...totals].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([s]) => s);
  const latest = d.rows.find((r) => !r.partial);
  const searched = d.rows.find((r) => r.search);
  const detailed = d.rows.find((r) => r.search?.pageQueries);
  const previous = detailed && d.rows[d.rows.indexOf(detailed) + 1];
  const prior = new Map(previous?.search?.pageQueries?.property === detailed?.search?.pageQueries?.property ? previous?.search?.pageQueries?.rows.map((r) => [JSON.stringify([r.page, r.query]), r]) : []);
  const candidates = [...(detailed?.search?.pageQueries?.rows ?? [])].sort((a, b) => b.impressions - a.impressions || a.page.localeCompare(b.page) || a.query.localeCompare(b.query)).slice(0, 100);
  return (
    <>
      <p className="mb-4 text-[12.5px] text-ink-4">每周一行（周一到周日）：页面浏览（浏览器上报、已滤掉机器，按次数不按人；2026-10-10 起）、邮件订阅和 Search Console。本周未过完，标“进行中”。</p>
      <div className="mb-4">
        <FilterChips param="weeks" options={[4, 12, 26].map((weeks) => ({ value: weeks === 12 ? "" : String(weeks), label: `近 ${weeks} 周` }))} />
      </div>
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="上周页面浏览" value={latest ? num(latest.views) : "—"} hint={latest && latest.days < 7 ? `只有 ${latest.days} 天有记录` : latest ? `日均 ${num(Math.round(latest.views / 7))}` : undefined} />
        <Stat label="已确认订阅" value={num(d.rows[0]?.subscribers ?? 0)} hint="不含已退订（每天从 Resend 同步）" />
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
            { key: "views", label: "浏览", align: "right", render: (r) => <span title={`${r.days} 天有记录`}>{num(r.views)}</span> },
            ...shown.map((s) => ({ key: `s-${s}`, label: label(s), align: "right" as const, render: (r: WeeklyReading) => num(r.sections[s] ?? 0) })),
            { key: "other", label: "其他", align: "right", render: (r) => num(Object.entries(r.sections).filter(([s]) => !shown.includes(s)).reduce((n, [, v]) => n + v, 0)) },
            { key: "subscribers", label: "订阅", align: "right", className: "whitespace-nowrap", render: (r) => <span title={`新登记 ${r.signups}，新确认 ${r.confirmations}`}>{num(r.subscribers)}{r.confirmations ? <span className="text-ink-3"> +{r.confirmations}</span> : null}</span> },
            { key: "sources", label: "首次确认来源", render: (r) => r.confirmationsBySource.map((s) => `${s.source ?? "未知"} ${s.count}`).join("；") || "—" },
            { key: "impressions", label: "展示", align: "right", render: (r) => (r.search ? num(r.search.impressions) : "—") },
            { key: "clicks", label: "点击", align: "right", render: (r) => (r.search ? num(r.search.clicks) : "—") },
            { key: "ctr", label: "CTR", align: "right", render: (r) => (r.search?.impressions ? pct(r.search.clicks / r.search.impressions) : "—") },
            { key: "indexed", label: "收录", align: "right", className: "whitespace-nowrap", render: (r) => (r.search ? `${num(r.search.indexed)} / ${num(r.search.inspected)}` : "—") },
          ]}
        />
      </Card>
      <Card className="mt-5" title="分发来源" pad={false}>
        <p className="p-4 text-[13px] text-ink-3">邮件和分享标记在当前标签页内延续。访问为页面次数，阅读为累计可见 15 秒的页面次数，均非人数；确认按首次登记来源、首次确认时间统计。开始记录前的历史没有渠道归因，未记录不代表没有访问。</p>
        <DataTable rows={d.rows.flatMap((r) => r.distribution.map((c) => ({ week: r.week, ...c })))} rowKey={(r) => `${r.week}:${r.channel}`} columns={[
          { key: "week", label: "周", render: (r) => r.week },
          { key: "channel", label: "来源", render: (r) => (r.channel === "newsletter" ? "日报邮件" : "分享链接") },
          { key: "visits", label: "访问", align: "right", render: (r) => num(r.visits) },
          { key: "reads", label: "可见阅读 ≥15 秒", align: "right", render: (r) => num(r.reads) },
          { key: "confirmations", label: "首次确认订阅", align: "right", render: (r) => num(r.confirmations) },
        ]} />
      </Card>
      <Card className="mt-5" title={detailed ? `${detailed.week} 页面 × 查询词（按展示排序，前 100 行）` : "页面 × 查询词"} pad={false}>
        <p className="p-4 text-[13px] text-ink-3">用于逐页核对标题、导语与查询意图，不自动改正文。Google 只返回部分主要查询，不能用明细之和代替全站总数；日期按太平洋时间。变化仅比较紧邻前一周的同网址、同查询，缺失显示 —。{detailed?.search?.pageQueries?.limitReached ? "本次达到 25,000 行采集上限。" : ""}</p>
        {!detailed ? <p className="p-4 text-ink-3">尚未采集页面查询明细；下次周读数任务开始保存，旧周不会补零。</p> : <DataTable rows={candidates} rowKey={(r) => JSON.stringify([r.page, r.query])} columns={[
          { key: "page", label: "页面", render: (r) => <a className="break-all text-accent" href={/^https?:\/\//.test(r.page) ? r.page : undefined} target="_blank" rel="noopener noreferrer">{r.page}</a> },
          { key: "query", label: "查询词", render: (r) => r.query },
          { key: "impressions", label: "展示", align: "right", render: (r) => num(r.impressions) },
          { key: "clicks", label: "点击", align: "right", render: (r) => num(r.clicks) },
          { key: "ctr", label: "CTR", align: "right", render: (r) => pct(r.ctr) },
          { key: "position", label: "平均排名", align: "right", render: (r) => r.position.toFixed(1) },
          { key: "change", label: "较前周（点击 / 排名）", render: (r) => { const p = prior.get(JSON.stringify([r.page, r.query])); return p ? `${r.clicks - p.clicks >= 0 ? "+" : ""}${r.clicks - p.clicks} / ${r.position - p.position >= 0 ? "+" : ""}${(r.position - p.position).toFixed(1)}` : "—"; } },
        ]} />}
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
              { key: "reasons", label: "未收录原因", render: ([, x]) => <span className="text-[12.5px] text-ink-3">{reasons(x) || "—"}</span> },
            ]}
          />
        </Card>
      )}
    </>
  );
}

const EVENT_COLORS = ["var(--accent)", "var(--hot)", "var(--ok)", "var(--amber)", "#3d6b8a", "#6b5b95", "#2f6f6a", "#8a5a44", "#5f7a3a"];
const CHART_EVENTS = new Set(["star_add", "star_remove", "first_star", "subscribe_click", "subscribe_submit", "outbound_click", "share_click", "starred_export", "starred_import"]);

export function OutletsTab({ d }: { d: EngagementData }) {
  const m = d.mcp;
  return (
    <>
      <FilterChips param="days" options={[7, 30, 90].map((days) => ({ value: days === 30 ? "" : String(days), label: `近 ${days} 天` }))} />
      <Section title="互动（每日累计）" note="不分会话的每日次数，和会话数据并行记录；收藏、订阅、原文点击等从各自开始采集的那天起有数。">
        <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-3">
          <Stat label="累计首次收藏" value={num(d.engagement.firstStarDevices)} hint="每台设备最多计一次" />
          <Stat label={`近 ${d.days} 天互动`} value={num(d.engagement.totals.reduce((sum, row) => sum + (CHART_EVENTS.has(row.event) ? row.count : 0), 0))} />
        </div>
        <Card>
          <LineChart
            missing="未采集"
            labels={d.engagement.daily.map((x) => x.day.slice(5))}
            series={d.engagement.totals.filter((row) => CHART_EVENTS.has(row.event)).map((row, i) => ({
              key: row.event, label: EVENT_LABELS[row.event] ?? row.event, color: EVENT_COLORS[i] ?? "var(--accent)",
              values: d.engagement.daily.map((day) => day.counts[row.event] ?? null),
            }))}
            height={220}
          />
        </Card>
        <Card className="mt-5" pad={false}>
          <DataTable rows={d.engagement.totals} rowKey={(x) => x.event} empty="所选时间范围内没有互动" columns={[
            { key: "event", label: "操作", render: (x) => EVENT_LABELS[x.event] ?? x.event },
            { key: "since", label: "采集起点", render: (x) => (d.engagement.firstDays[x.event] ? `自 ${d.engagement.firstDays[x.event]} 起` : "未采集") },
            { key: "count", label: "次数", align: "right", render: (x) => (d.engagement.firstDays[x.event] ? num(x.count) : "未采集") },
          ]} />
        </Card>
      </Section>
      <Section id="mcp-usage-title" title="MCP 使用统计" note="实际使用以工具调用为准，初始化和工具发现请求单独计数，保留 90 天；不统计独立用户，不保存 IP、客户端名称、参数或结果正文。自带契约检查和 smoke 标为检查流量，不计入调用量；重试每次计数；HTTP 200 的业务错误也计为失败。RSS、公开 API 和 Agent Markdown 的客户端数量在服务器日志里，见 traffic-metrics 技能。">
        <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-3">
          <Stat label="MCP 工具调用" value={num(m.totals.calls)} />
          <Stat label="工具成功率" value={m.totals.calls ? `${num(m.totals.successes / m.totals.calls * 100, 1)}%` : "—"} />
          <Stat label="有调用的天数" value={`${num(m.totals.activeDays)} / ${d.days}`} />
          <Stat label="初始化请求" value={num(m.totals.initializes)} />
          <Stat label="工具发现请求" value={num(m.totals.discoveries)} />
          <Stat label="工具平均耗时" value={m.totals.calls ? `${num(m.totals.averageMs)} ms` : "—"} />
        </div>
        <p className="mb-4 text-sm text-ink-2">最近调用：{bj(m.totals.lastCallAt, true)} · 最长耗时：{m.totals.calls ? `${num(m.totals.maxMs)} ms` : "—"} · 已排除检查请求：{num(m.totals.checks)}</p>
        <Card>
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
      </Section>
    </>
  );
}
