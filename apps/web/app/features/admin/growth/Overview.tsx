// 概览 and 获客: headline figures against the previous span, the trend, live readers, what the bot filter left out,
// and where readers came from.
import { Link } from "react-router";
import { LineChart, ShareBars } from "../charts";
import { num, pct } from "../format";
import { Card, DataTable } from "../ui";
import { BreakdownCard, Delta, EVENT_LABELS, FILTER_LABELS, Kpi, ms, rate, Section, useHref, valueLabel } from "./shared";
import type { GrowthOverview, Totals } from "./types";

function figures(t: Totals) {
  return {
    visitors: t.visitors,
    sessions: t.sessions,
    views: t.views,
    viewsPerSession: rate(t.views, t.sessions),
    bounce: rate(t.bounces, t.sessions),
    engagedRate: rate(t.engagedSessions, t.sessions),
    engagedMs: rate(t.engagedMs, t.sessions),
    newShare: rate(t.newVisitors, t.visitors),
    conversion: rate(t.conversions, t.sessions),
  };
}

export function OverviewTab({ d }: { d: GrowthOverview }) {
  const now = figures(d.totals);
  const before = figures(d.previous);
  const label = (b: string) => (d.hourly ? `${b}时` : b.slice(5));
  const filteredTotal = d.filtered.reduce((n, r) => n + r.count, 0);
  return (
    <>
      {d.since && d.since > d.range.previous.from && (
        <p className="mb-4 rounded-control bg-amber/10 px-3 py-2 text-[12.5px] text-amber ring-1 ring-amber/25">
          会话数据从 {d.since} 开始采集，{d.since > d.range.from ? "所选时段" : "对比时段"}有一部分在那之前，环比偏高。
        </p>
      )}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="独立访客" value={num(now.visitors)} delta={<Delta now={now.visitors} before={before.visitors} />} hint="按浏览器跨天去重" />
        <Kpi label="会话" value={num(now.sessions)} delta={<Delta now={now.sessions} before={before.sessions} />} hint={`每会话 ${num(now.viewsPerSession, 2)} 页`} />
        <Kpi label="页面浏览" value={num(now.views)} delta={<Delta now={now.views} before={before.views} />} />
        <Kpi label="跳出率" value={pct(now.bounce)} delta={<Delta now={now.bounce} before={before.bounce} points lowerIsBetter />} hint="只看了一页的会话" />
        <Kpi label="互动会话率" value={pct(now.engagedRate)} delta={<Delta now={now.engagedRate} before={before.engagedRate} points />} hint="≥2 页、≥10 秒或达成目标" />
        <Kpi label="平均互动时长" value={now.engagedMs === null ? "—" : ms(now.engagedMs)} delta={<Delta now={now.engagedMs} before={before.engagedMs} />} hint="页面可见时间，每会话" />
        <Kpi label="新访客占比" value={pct(now.newShare)} delta={<Delta now={now.newShare} before={before.newShare} points />} hint={`新访客 ${num(d.totals.newVisitors)}`} />
        <Kpi label={`转化：${EVENT_LABELS[d.goal] ?? d.goal}`} value={pct(now.conversion, 2)} delta={<Delta now={now.conversion} before={before.conversion} points />} hint={`${num(d.totals.conversions)} 个会话`} />
      </div>

      <div className="mt-5 grid gap-5 *:min-w-0 lg:grid-cols-[1fr_300px]">
        <Card title={d.hourly ? "按小时" : "按天"}>
          <LineChart
            labels={d.series.map((p) => label(p.bucket))}
            series={[
              { key: "visitors", label: "访客", color: "var(--accent)", values: d.series.map((p) => p.visitors) },
              { key: "sessions", label: "会话", color: "var(--ok)", values: d.series.map((p) => p.sessions) },
              { key: "views", label: "浏览", color: "#3d6b8a", values: d.series.map((p) => p.views) },
              { key: "prev", label: "上一时段访客", color: "var(--accent)", dashed: true, values: d.previousSeries.map((p) => p.visitors) },
            ]}
            height={300}
          />
        </Card>
        <div className="space-y-5">
          <Card title={<span className="inline-flex items-center gap-2"><span className="size-2 animate-pulse rounded-full bg-ok" />此刻在读</span>}>
            <div className="num text-[28px] font-semibold text-ink">{num(d.live.visitors)}</div>
            <div className="text-[12px] text-ink-4">近 5 分钟有活动的访客</div>
            <div className="mt-3 flex h-10 items-end gap-[2px]" aria-label="近 30 分钟每分钟浏览">
              {d.live.views.map((v, i) => (
                <div key={i} className="flex-1 rounded-mark bg-accent/70" style={{ height: `${Math.max(4, (v / Math.max(1, ...d.live.views)) * 100)}%`, opacity: v ? 1 : 0.2 }} title={`${30 - i} 分钟前：${v}`} />
              ))}
            </div>
            {d.live.pages.length > 0 && (
              <ul className="mt-3 space-y-1 text-[12.5px]">
                {d.live.pages.map((p) => <li key={p.key} className="flex justify-between gap-2"><span className="truncate font-mono text-ink-2">{p.key}</span><span className="num text-ink-3">{p.sessions}</span></li>)}
              </ul>
            )}
          </Card>
          <Card title="已过滤的机器流量">
            <div className="num text-[22px] font-semibold text-ink">{num(filteredTotal)}</div>
            <div className="mb-3 text-[12px] text-ink-4">次浏览没计入；筛选条件不作用于这里</div>
            <ShareBars rows={d.filtered.filter((r) => r.count).map((r) => ({ label: FILTER_LABELS[r.reason] ?? r.reason, value: r.count }))} />
          </Card>
        </div>
      </div>

      <div className="mt-5 grid gap-5 *:min-w-0 lg:grid-cols-2">
        <BreakdownCard dimension="channel" rows={d.breakdowns.channel ?? []} goal={d.goal} />
        <BreakdownCard dimension="landing" rows={d.breakdowns.landing ?? []} goal={d.goal} />
        <BreakdownCard dimension="referrer" rows={(d.breakdowns.referrer ?? []).filter((r) => r.key)} goal={d.goal} />
        <BreakdownCard dimension="device" rows={d.breakdowns.device ?? []} goal={d.goal} />
      </div>
    </>
  );
}

export function AcquisitionTab({ d }: { d: GrowthOverview }) {
  const href = useHref();
  const channels = d.breakdowns.channel ?? [];
  return (
    <>
      <Card title="渠道构成（会话）">
        <ShareBars rows={channels.map((r) => ({ label: valueLabel("channel", r.key), value: r.sessions }))} />
        <p className="mt-3 text-[12.5px] leading-relaxed text-ink-4">
          渠道判定顺序：邮件标记（?via=newsletter、utm_medium=email）→ 付费标记 → 来源站（AI 助手、搜索、社交、邮箱网页版）→ 其他来源站算外链 → 只有 utm_source 时按它判断（ChatGPT 会加 utm_source=chatgpt.com）→ ?via=share 算分享链接 → 其余为直接访问。
          站内跳转不改变会话的来源；带新来源的整页加载会开始新会话。
        </p>
      </Card>
      <div className="mt-5 grid gap-5 *:min-w-0 lg:grid-cols-2">
        <BreakdownCard dimension="referrer" rows={d.breakdowns.referrer ?? []} goal={d.goal} limit={20} />
        <BreakdownCard dimension="landing_page" rows={d.breakdowns.landing_page ?? []} goal={d.goal} limit={20} />
        <BreakdownCard dimension="utm_source" rows={(d.breakdowns.utm_source ?? []).filter((r) => r.key)} goal={d.goal} />
        <BreakdownCard dimension="utm_campaign" rows={(d.breakdowns.utm_campaign ?? []).filter((r) => r.key)} goal={d.goal} />
        <BreakdownCard dimension="utm_medium" rows={(d.breakdowns.utm_medium ?? []).filter((r) => r.key)} goal={d.goal} />
        <BreakdownCard dimension="visitor_type" rows={d.breakdowns.visitor_type ?? []} goal={d.goal} />
      </div>
      <Section title="受众" note="国家/地区来自 Cloudflare 边缘；浏览器语言是浏览器首选语言的主标签。">
        <div className="grid gap-5 *:min-w-0 lg:grid-cols-2">
          <BreakdownCard dimension="country" rows={d.breakdowns.country ?? []} goal={d.goal} limit={15} />
          <BreakdownCard dimension="language" rows={d.breakdowns.language ?? []} goal={d.goal} />
          <BreakdownCard dimension="browser" rows={d.breakdowns.browser ?? []} goal={d.goal} />
          <BreakdownCard dimension="os" rows={d.breakdowns.os ?? []} goal={d.goal} />
        </div>
      </Section>
      <p className="mt-6 text-[12.5px] text-ink-4">
        点表格里的值可以把整页限定到它，例如 <Link className="text-accent underline" to={href({ channel: "search" })} preventScrollReset>只看搜索来的会话</Link>。
      </p>
    </>
  );
}

export function ContentTab({ d, journeys }: { d: GrowthOverview; journeys: { depth: number; journeys: Array<{ path: string[]; sessions: number }> } }) {
  const href = useHref();
  const pageColumns = (by: "route" | "path") => [
    { key: "key", label: by === "route" ? "路由" : "页面", render: (r: GrowthOverview["breakdowns"]["page"][number]) => by === "route"
      ? <Link to={href({ page: r.key })} preventScrollReset className="font-mono text-[12px] text-ink hover:text-accent">{r.key}</Link>
      : <a href={r.key} target="_blank" rel="noopener noreferrer" className="block max-w-[340px] truncate font-mono text-[12px] text-ink hover:text-accent">{r.key}</a> },
    { key: "views", label: "浏览", align: "right" as const, render: (r: GrowthOverview["breakdowns"]["page"][number]) => num(r.views) },
    { key: "sessions", label: "会话", align: "right" as const, render: (r: GrowthOverview["breakdowns"]["page"][number]) => num(r.sessions) },
    { key: "entries", label: "入口", align: "right" as const, render: (r: GrowthOverview["breakdowns"]["page"][number]) => num(r.entries) },
    { key: "exit", label: "退出率", align: "right" as const, render: (r: GrowthOverview["breakdowns"]["page"][number]) => pct(rate(r.exits, r.views), 0) },
    { key: "engaged", label: "平均可见", align: "right" as const, render: (r: GrowthOverview["breakdowns"]["page"][number]) => (r.engagedMs ? ms(r.engagedMs) : "—") },
  ];
  return (
    <>
      <Card title="路由" pad={false} scrollable>
        <DataTable dense rows={d.breakdowns.page} rowKey={(r) => r.key} empty="没有浏览" columns={pageColumns("route")} />
      </Card>
      <Card className="mt-5" title="具体页面" pad={false} scrollable>
        <DataTable dense rows={d.breakdowns.page_path} rowKey={(r) => r.key} empty="没有浏览" columns={pageColumns("path")} />
      </Card>
      <div className="mt-5 grid gap-5 *:min-w-0 lg:grid-cols-2">
        <BreakdownCard dimension="exit" rows={d.breakdowns.exit ?? []} goal={d.goal} />
        <Card title="会话里的互动" pad={false}>
          <DataTable dense rows={d.events} rowKey={(r) => r.key} empty="没有互动" columns={[
            { key: "event", label: "操作", render: (r) => EVENT_LABELS[r.key] ?? r.key },
            { key: "count", label: "次数", align: "right", render: (r) => num(r.count) },
            { key: "sessions", label: "会话", align: "right", render: (r) => num(r.sessions) },
            { key: "share", label: "占会话", align: "right", render: (r) => pct(rate(r.sessions, d.totals.sessions)) },
          ]} />
        </Card>
      </div>
      <Section title="阅读路径" note={`会话里最先读的 ${journeys.depth} 页（按路由），最常见的 40 种。筛选某个落地路由，就能看从它出发的下一步。`}>
        <Card pad={false}>
          <DataTable dense rows={journeys.journeys} rowKey={(r) => r.path.join(">")} empty="没有会话" columns={[
            { key: "path", label: "路径", render: (r) => (
              <span className="flex flex-wrap items-center gap-1 font-mono text-[12px]">
                {r.path.map((p, i) => <span key={i} className="inline-flex items-center gap-1">{i > 0 && <span className="text-ink-4">→</span>}<span className="rounded-mark bg-bg-sunk px-1.5 py-0.5 text-ink-2">{p}</span></span>)}
                {r.path.length === 1 && <span className="text-ink-4">（跳出）</span>}
              </span>
            ) },
            { key: "sessions", label: "会话", align: "right", render: (r) => num(r.sessions) },
            { key: "share", label: "占比", align: "right", render: (r) => pct(rate(r.sessions, d.totals.sessions)) },
          ]} />
        </Card>
      </Section>
    </>
  );
}
