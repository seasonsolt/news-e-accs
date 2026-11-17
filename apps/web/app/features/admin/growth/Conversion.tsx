// 转化 and 留存: a funnel over the steps a session takes, the subscribe funnel by entry point, net stars, how far
// walks go, and weekly cohorts of first-time readers.
import { SUBSCRIBE_FUNNEL_EVENTS, SUBSCRIBE_SOURCES, type SubscribeFunnelEvent, type SubscribeSource } from "@aihot/contracts/subscribe";
import { Form, useSearchParams } from "react-router";
import { num, pct } from "../format";
import { Card, DataTable } from "../ui";
import { EVENT_LABELS, rate, Section } from "./shared";
import type { EngagementData, FunnelCount, FunnelData, RetentionData, SubscribeFunnel } from "./types";

const SOURCE_LABELS: Record<SubscribeSource, string> = {
  home_overlay: "首页引导", home_button: "首页按钮", subscribe_page: "订阅页", daily_inline: "日报页", item_inline: "单条页",
  chronicle_inline: "加速史", sticky_mobile: "手机底部条", story_inline: "事件页", concept: "概念页", wallpaper: "壁纸产品页",
};

const PLACE_LABELS: Record<string, string> = {
  start: "没走到火堆", fire: "火堆", sow: "播种处", village: "村落", fields: "水渠与麦田", machines: "风车升起处", stone: "巨石跟前",
};
const ACT_LABELS: Record<string, string> = { feed: "添柴", sow: "亲手播种", auto: "开自动前行", replay: "再走一遍", exit: "终点返回加速史" };
const TIME_LABELS: Record<string, string> = { "0-1m": "不到 1 分钟", "1-2m": "1–2 分钟", "2-4m": "2–4 分钟", "4m+": "4 分钟以上" };

const stepValue = (s: { kind: string; value: string }) => `${s.kind}:${s.value}`;
const stepLabel = (s: { kind: string; value: string }) => (s.kind === "event" ? EVENT_LABELS[s.value] ?? s.value : s.value === "*" ? "任意页面" : `看 ${s.value}`);

function FunnelBuilder({ f }: { f: FunnelData }) {
  const [sp] = useSearchParams();
  const options = [
    { value: "view:*", label: "任意页面" },
    ...f.routes.map((r) => ({ value: `view:${r}`, label: `看 ${r}` })),
    ...f.events.map((e) => ({ value: `event:${e}`, label: EVENT_LABELS[e] ?? e })),
  ];
  const slots = [...f.steps.map(stepValue), ""].slice(0, 8);
  return (
    <Form method="get" preventScrollReset className="flex flex-wrap items-center gap-2 border-b border-line p-4 text-[12.5px]">
      {[...sp].filter(([k]) => k !== "step" && k !== "steps").map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      {slots.map((value, i) => (
        <span key={i} className="inline-flex items-center gap-2">
          {i > 0 && <span className="text-ink-4">→</span>}
          <select name="step" defaultValue={value} className="max-w-[200px] rounded-control bg-surface px-2 py-1 text-ink-2 ring-1 ring-line">
            {i === slots.length - 1 && <option value="">＋ 加一步</option>}
            {i < slots.length - 1 && i >= 2 && <option value="">（去掉这一步）</option>}
            {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </span>
      ))}
      <button type="submit" className="rounded-full bg-ink px-3 py-1 text-bg">计算</button>
    </Form>
  );
}

export function ConversionTab({ funnel, subscribe, engagement }: { funnel: FunnelData; subscribe: SubscribeFunnel; engagement: EngagementData }) {
  const first = funnel.steps[0]?.sessions ?? 0;
  return (
    <>
      <Card title="会话漏斗" pad={false}>
        <FunnelBuilder f={funnel} />
        <ol className="space-y-3 p-4">
          {funnel.steps.map((s, i) => {
            const prev = i ? funnel.steps[i - 1]!.sessions : s.sessions;
            return (
              <li key={i}>
                <div className="flex items-baseline justify-between gap-3 text-[13px]">
                  <span className="text-ink-2"><span className="num mr-2 text-ink-4">{i + 1}</span>{stepLabel(s)}</span>
                  <span className="num text-ink-3">
                    {num(s.sessions)} 会话 · 总转化 {pct(rate(s.sessions, first))}
                    {i > 0 && <span className={s.sessions < prev ? "text-hot" : ""}> · 本步流失 {pct(rate(prev - s.sessions, prev))}</span>}
                  </span>
                </div>
                <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-bg-sunk">
                  <div className="h-full rounded-full bg-accent" style={{ width: `${first ? Math.max(1, (s.sessions / first) * 100) : 0}%` }} />
                </div>
              </li>
            );
          })}
        </ol>
        <p className="px-4 pb-4 text-[12.5px] text-ink-4">同一会话内按顺序达成才算；两个“任意页面”表示至少读了两页。订阅确认通常发生在点开邮件后的新会话里，看下面的“订阅漏斗”和“周报”里的确认数。</p>
      </Card>
      <SubscribeFunnelCard funnel={subscribe} />
      <Section title={`近 ${engagement.days} 天净收藏`}>
        <Card pad={false}>
          <DataTable rows={engagement.engagement.topStarred} rowKey={(x) => x.id} empty="所选时间范围内没有净收藏" columns={[
            { key: "title", label: "内容", render: (x) => (
              <a href={`/items/${x.id}`} className="text-ink hover:text-accent">
                {x.title ?? "（已不在公开列表）"}
                <span className="mt-0.5 block font-mono text-[11.5px] text-ink-4">{x.id}</span>
              </a>
            ) },
            { key: "net", label: "净收藏", align: "right", render: (x) => num(x.net) },
          ]} />
        </Card>
      </Section>
      <WalkCard days={engagement.days} walk={engagement.engagement.walk} />
    </>
  );
}

/** The chronicle's walk as a funnel from the start: each place along the road, then the stone touched; below it, what walkers did, where they left and how long they stayed. */
function WalkCard({ days, walk }: { days: number; walk: EngagementData["engagement"]["walk"] }) {
  const steps = [
    { label: "开始行走", count: walk.starts },
    ...walk.reached.map((r) => ({ label: `走到${PLACE_LABELS[r.place] ?? r.place}`, count: r.count })),
    { label: "触碰巨石", count: walk.finishes },
  ];
  const leaves = walk.left.reduce((n, r) => n + r.count, 0);
  const timed = walk.times.reduce((n, r) => n + r.count, 0);
  return (
    <Section title={`近 ${days} 天行走`} note="每次打开行走页，每一项最多算一次；中英文页面合并。离开是这次打开后页面第一次被切走或关掉时走到的最远处，时长从开始行走算起；切走后回来接着走的不再计入。">
      <Card pad={false}>
        <p className="border-b border-line px-4 py-3 text-[13px] text-ink-2">
          打开 <span className="num">{num(walk.views)}</span> 次 · 开始 <span className="num">{num(walk.starts)}</span> 次
          <span className="text-ink-4"> · 打开后开始 {pct(rate(walk.starts, walk.views))}</span>
        </p>
        <ol className="space-y-3 p-4">
          {steps.map((s, i) => (
            <li key={i}>
              <div className="flex items-baseline justify-between gap-3 text-[13px]">
                <span className="text-ink-2"><span className="num mr-2 text-ink-4">{i + 1}</span>{s.label}</span>
                <span className="num text-ink-3">{num(s.count)} · 占开始 {pct(rate(s.count, walk.starts))}</span>
              </div>
              <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-bg-sunk">
                <div className="h-full rounded-full bg-accent" style={{ width: `${walk.starts ? Math.max(s.count ? 1 : 0, Math.min(100, (s.count / walk.starts) * 100)) : 0}%` }} />
              </div>
            </li>
          ))}
        </ol>
      </Card>
      <Card className="mt-5" title="路上的操作" pad={false}>
        <DataTable rows={walk.acts} rowKey={(x) => x.act} columns={[
          { key: "act", label: "操作", render: (x) => ACT_LABELS[x.act] ?? x.act },
          { key: "count", label: "次数", align: "right", render: (x) => num(x.count) },
          { key: "rate", label: "占开始", align: "right", render: (x) => pct(rate(x.count, walk.starts)) },
        ]} />
      </Card>
      <Card className="mt-5" title="离开时走到" pad={false}>
        <DataTable rows={walk.left} rowKey={(x) => x.place} columns={[
          { key: "place", label: "最远处", render: (x) => PLACE_LABELS[x.place] ?? x.place },
          { key: "count", label: "次数", align: "right", render: (x) => num(x.count) },
          { key: "rate", label: "占离开", align: "right", render: (x) => pct(rate(x.count, leaves)) },
        ]} />
      </Card>
      <Card className="mt-5" title="行走时长" pad={false}>
        <DataTable rows={walk.times} rowKey={(x) => x.time} columns={[
          { key: "time", label: "开始后", render: (x) => TIME_LABELS[x.time] ?? x.time },
          { key: "count", label: "次数", align: "right", render: (x) => num(x.count) },
          { key: "rate", label: "占离开", align: "right", render: (x) => pct(rate(x.count, timed)) },
        ]} />
      </Card>
    </Section>
  );
}

interface FunnelRow { source: string; locale: string; counts: Partial<Record<SubscribeFunnelEvent, number>> }

function pivot(totals: FunnelCount[]): FunnelRow[] {
  const map = new Map<string, FunnelRow>();
  for (const source of SUBSCRIBE_SOURCES) for (const locale of ["zh", "en"] as const) map.set(`${source}:${locale}`, { source, locale, counts: {} });
  for (const row of totals) {
    const slot = map.get(`${row.source}:${row.locale}`);
    if (!slot) continue;
    const event = row.event as SubscribeFunnelEvent;
    slot.counts[event] = (slot.counts[event] ?? 0) + row.count;
  }
  return [...map.values()].filter((row) => Object.values(row.counts).some((count) => count > 0));
}

function SubscribeFunnelCard({ funnel }: { funnel: SubscribeFunnel }) {
  const rows = pivot(funnel.totals);
  const errors = funnel.totals.filter((row) => row.event === "subscribe_error" && row.count > 0);
  const last = funnel.daily.at(-1)?.day ?? "";
  return (
    <Section title={`订阅漏斗，近 ${funnel.days} 天按入口和语言`} note={`只累计次数；失败原因是类别（cap 为当天确认信上限，503 为服务暂不可用），不含邮箱。${SUBSCRIBE_FUNNEL_EVENTS.filter((e) => !funnel.firstDays[e]).map((e) => EVENT_LABELS[e]).join("、") || ""}${SUBSCRIBE_FUNNEL_EVENTS.some((e) => !funnel.firstDays[e]) ? "尚未采集。" : ""}`}>
      <Card pad={false}>
        <DataTable rows={rows} rowKey={(row) => `${row.source}:${row.locale}`} empty="所选时间范围内没有订阅漏斗记录" columns={[
          { key: "source", label: "入口", render: (row) => SOURCE_LABELS[row.source as SubscribeSource] ?? row.source },
          { key: "locale", label: "语言", render: (row) => (row.locale === "zh" ? "中文" : "英文") },
          ...SUBSCRIBE_FUNNEL_EVENTS.map((event) => ({
            key: event, label: EVENT_LABELS[event] ?? event, align: "right" as const,
            render: (row: FunnelRow) => (funnel.firstDays[event] && funnel.firstDays[event]! <= last ? num(row.counts[event] ?? 0) : "未采集"),
          })),
          { key: "rate", label: "出现→接受", align: "right", render: (row) => pct(rate(row.counts.subscribe_success ?? 0, row.counts.subscribe_view ?? 0)) },
        ]} />
      </Card>
      {errors.length > 0 && (
        <Card className="mt-5" title="失败原因" pad={false}>
          <DataTable rows={errors} rowKey={(row) => `${row.source}:${row.locale}:${row.reason}`} columns={[
            { key: "source", label: "入口", render: (row) => SOURCE_LABELS[row.source as SubscribeSource] ?? row.source },
            { key: "locale", label: "语言", render: (row) => (row.locale === "zh" ? "中文" : "英文") },
            { key: "reason", label: "原因", render: (row) => row.reason },
            { key: "count", label: "次数", align: "right", render: (row) => num(row.count) },
          ]} />
        </Card>
      )}
    </Section>
  );
}

/** Cell shade by retention share, so the matrix reads as a heat map. */
const shade = (share: number | null) => (share === null ? undefined : { background: `color-mix(in srgb, var(--accent) ${Math.round(Math.min(1, share) * 70)}%, transparent)` });

export function RetentionTab({ r }: { r: RetentionData }) {
  const width = r.cohorts[0]?.weeks.length ?? 0;
  const averages = Array.from({ length: width }, (_, k) => {
    const usable = r.cohorts.filter((c) => c.weeks.length > k && c.weeks[0]);
    const size = usable.reduce((n, c) => n + c.weeks[0]!, 0);
    return size ? usable.reduce((n, c) => n + c.weeks[k]!, 0) / size : null;
  });
  // The week collection began holds every earlier reader too: their first visit is recorded as that day.
  const launch = r.since ? r.cohorts.filter((c) => c.cohort <= r.since!).at(-1)?.cohort : undefined;
  return (
    <>
      <Card title="按首次访问周的留存" pad={false}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-[12.5px]">
            <thead>
              <tr className="border-b border-line text-ink-3">
                <th className="px-3 py-2 text-left font-medium">首访周</th>
                <th className="px-3 py-2 text-right font-medium">新读者</th>
                {Array.from({ length: width }, (_, k) => <th key={k} className="px-2 py-2 text-right font-medium">第 {k} 周</th>)}
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-line bg-bg-sunk/50">
                <td className="px-3 py-1.5 text-ink-2">加权平均</td>
                <td />
                {averages.map((a, k) => <td key={k} className="num px-2 py-1.5 text-right text-ink" style={shade(k ? a : null)}>{pct(a, 0)}</td>)}
              </tr>
              {r.cohorts.map((c) => (
                <tr key={c.cohort} className="border-b border-line/70 last:border-0">
                  <td className="whitespace-nowrap px-3 py-1.5 font-mono text-ink-2">{c.cohort.slice(5)}{c.cohort === launch ? <span className="ml-1 text-ink-4" title="采集开始前的那周：首访日期是开始采集那天，混入了老读者">*</span> : null}</td>
                  <td className="num px-3 py-1.5 text-right text-ink">{num(c.weeks[0] ?? 0)}</td>
                  {Array.from({ length: width }, (_, k) => {
                    if (k >= c.weeks.length) return <td key={k} />;
                    const share = rate(c.weeks[k]!, c.weeks[0]!);
                    return <td key={k} className="num px-2 py-1.5 text-right text-ink-2" style={shade(k ? share : null)} title={`${num(c.weeks[k])} 人`}>{k === 0 ? (c.weeks[0] ? "100%" : "—") : pct(share, 0)}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <p className="mt-3 text-[12.5px] leading-relaxed text-ink-4">
        队列按浏览器自己记下的首次访问日期分周（周一开始，台北时间）；某一周算“回来”，是这个浏览器那周至少打开过一次页面。服务器不保存跨天的访客标识，所以清过浏览器数据或用无痕窗口的读者会被当作新读者，留存是下限。
        {r.since ? ` 首次访问日期从 ${r.since} 开始记录，在那之前就来过的读者都会落在开始那周的队列里，这一周的留存偏高。` : ""}
      </p>
    </>
  );
}
