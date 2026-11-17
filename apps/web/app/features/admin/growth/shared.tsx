// Building blocks of the growth dashboard: the range and filter bar, figures with their change against the
// previous span, and breakdown tables whose rows narrow the whole page to that value.
import type { ReactNode } from "react";
import { Form, Link, useSearchParams } from "react-router";
import { num, pct } from "../format";
import { Card, Empty, FilterChips } from "../ui";
import type { BreakdownRow, Range } from "./types";

export const CHANNEL_LABELS: Record<string, string> = {
  direct: "直接访问", search: "搜索", ai: "AI 助手", social: "社交", email: "邮件", referral: "外链", share: "分享链接", paid: "付费",
};
export const DIMENSION_LABELS: Record<string, string> = {
  channel: "渠道", referrer: "来源站", utm_source: "utm_source", utm_medium: "utm_medium", utm_campaign: "utm_campaign",
  landing: "落地路由", landing_page: "落地页", exit: "退出路由", browser: "浏览器", os: "系统", device: "设备",
  country: "国家/地区", language: "浏览器语言", visitor_type: "新/老访客", page: "看过的路由",
};
export const EVENT_LABELS: Record<string, string> = {
  star_add: "收藏", star_remove: "取消收藏", first_star: "首次收藏", subscribe_click: "点击订阅入口", subscribe_view: "订阅入口出现",
  subscribe_submit: "提交订阅", subscribe_success: "订阅被接受", subscribe_error: "订阅失败", subscribe_confirmed: "确认订阅",
  subscribe_dismiss: "跳过或关掉订阅", outbound_click: "打开原文", share_click: "分享（完成）", starred_export: "导出收藏",
  starred_import: "导入收藏", distribution_visit: "分发访问", distribution_read: "分发阅读 ≥15 秒",
  workshop_start: "开始行走", workshop_finish: "走到巨石", chronicle_move: "移动加速史时间轴", chronicle_deep: "加速史看到第 6 张",
};
export const FILTER_LABELS: Record<string, string> = {
  agent: "自报爬虫或无 UA", reloads: "大量整页加载、不站内跳转", automation: "自动化浏览器（webdriver）", owner: "站长本人",
  unseen: "只开一页、从未显示、没有操作",
};
const DEVICE_LABELS: Record<string, string> = { mobile: "手机", tablet: "平板", desktop: "电脑" };
const VISITOR_LABELS: Record<string, string> = { new: "新访客", returning: "老访客" };
// Fixed names: Intl.DisplayNames differs between the server's and the browser's ICU, which breaks hydration.
const COUNTRY_LABELS: Record<string, string> = {
  CN: "中国大陆", HK: "香港", TW: "台湾", MO: "澳门", SG: "新加坡", JP: "日本", KR: "韩国", US: "美国", CA: "加拿大", GB: "英国",
  DE: "德国", FR: "法国", NL: "荷兰", IE: "爱尔兰", ES: "西班牙", IT: "意大利", SE: "瑞典", CH: "瑞士", PL: "波兰", RU: "俄罗斯",
  UA: "乌克兰", TR: "土耳其", IL: "以色列", AE: "阿联酋", SA: "沙特", IN: "印度", ID: "印度尼西亚", MY: "马来西亚", TH: "泰国",
  VN: "越南", PH: "菲律宾", AU: "澳大利亚", NZ: "新西兰", BR: "巴西", MX: "墨西哥", AR: "阿根廷", ZA: "南非", NG: "尼日利亚",
};

/** A dimension's value as a reader would name it. */
export function valueLabel(dimension: string, value: string): string {
  if (value === "") return dimension === "referrer" ? "（无来源站）" : "（未知）";
  if (dimension === "channel") return CHANNEL_LABELS[value] ?? value;
  if (dimension === "device") return DEVICE_LABELS[value] ?? value;
  if (dimension === "visitor_type") return VISITOR_LABELS[value] ?? value;
  if (dimension === "country") return COUNTRY_LABELS[value] ? `${COUNTRY_LABELS[value]} ${value}` : value;
  return value;
}

export const ms = (v: number) => (v >= 60_000 ? `${Math.floor(v / 60_000)}分${Math.round((v % 60_000) / 1000)}秒` : `${Math.round(v / 1000)}秒`);
export const rate = (a: number, b: number) => (b ? a / b : null);
/** Minutes and seconds, for narrow table cells. */
const clock = (v: number) => `${Math.floor(v / 60_000)}:${String(Math.round((v % 60_000) / 1000)).padStart(2, "0")}`;

/** The current query with some parameters set or removed (null). */
export function useHref() {
  const [sp] = useSearchParams();
  return (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(changes)) {
      if (v === null) next.delete(k);
      else next.set(k, v);
    }
    return `?${next}`;
  };
}

/** Change against the previous span; for rates, in percentage points. Lower is better for a bounce rate. */
export function Delta({ now, before, points = false, lowerIsBetter = false }: { now: number | null; before: number | null; points?: boolean; lowerIsBetter?: boolean }) {
  if (now === null || before === null) return <span className="text-ink-4">—</span>;
  const change = points ? (now - before) * 100 : before ? (now - before) / before * 100 : null;
  if (change === null) return <span className="text-ink-4">{now ? "新增" : "—"}</span>;
  const good = lowerIsBetter ? change < 0 : change > 0;
  const tone = Math.abs(change) < 0.05 ? "text-ink-4" : good ? "text-ok" : "text-hot";
  return <span className={`num ${tone}`}>{change > 0 ? "▲" : change < 0 ? "▼" : ""}{Math.abs(change).toFixed(1)}{points ? "pp" : "%"}</span>;
}

export function Kpi({ label, value, delta, hint }: { label: ReactNode; value: ReactNode; delta: ReactNode; hint?: ReactNode }) {
  return (
    <div className="rounded-panel bg-surface px-4 py-3.5 ring-1 ring-line">
      <div className="text-[12.5px] text-ink-3">{label}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="num text-[22px] font-semibold tracking-tight text-ink">{value}</span>
        <span className="text-[12px]">{delta}</span>
      </div>
      {hint && <div className="mt-0.5 text-[12px] text-ink-4">{hint}</div>}
    </div>
  );
}

const RANGES = [["today", "今天"], ["yesterday", "昨天"], ["7d", "7 天"], ["28d", "28 天"], ["90d", "90 天"]] as const;

/** Range chips, a custom span, the conversion goal and the active filters (each removable). */
export function GrowthBar({ range, filters, goal, goals, weeks }: { range?: Range; filters?: Record<string, string>; goal?: string; goals?: string[]; weeks?: boolean }) {
  const [sp] = useSearchParams();
  const href = useHref();
  const current = sp.get("range") ?? "7d";
  const active = Object.entries(filters ?? {});
  return (
    <div className="mb-5 space-y-3">
      {weeks ? (
        <FilterChips param="weeks" options={[8, 12, 26].map((n) => ({ value: n === 8 ? "" : String(n), label: `近 ${n} 周` }))} />
      ) : (
      <div className="flex flex-wrap items-center gap-1.5">
        {RANGES.map(([value, label]) => (
          <Link key={value} to={href({ range: value === "7d" ? null : value, from: null, to: null })} preventScrollReset
            className={`rounded-full px-3 py-1 text-[12.5px] transition-colors ${current === value ? "bg-ink text-bg" : "bg-surface text-ink-2 ring-1 ring-line hover:bg-bg-sunk"}`}>
            {label}
          </Link>
        ))}
        <Form method="get" className="flex items-center gap-1.5 text-[12.5px]" preventScrollReset>
          {[...sp].filter(([k]) => !["range", "from", "to"].includes(k)).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
          <input type="hidden" name="range" value="custom" />
          <input type="date" name="from" defaultValue={range?.from} className="rounded-control bg-surface px-2 py-1 ring-1 ring-line" aria-label="开始日期" />
          <span className="text-ink-4">–</span>
          <input type="date" name="to" defaultValue={range?.to} className="rounded-control bg-surface px-2 py-1 ring-1 ring-line" aria-label="结束日期" />
          <button type="submit" className="rounded-full bg-surface px-3 py-1 text-ink-2 ring-1 ring-line hover:bg-bg-sunk">自定义</button>
        </Form>
        {goals && (
          <Form method="get" className="ml-auto flex items-center gap-1.5 text-[12.5px] text-ink-3" preventScrollReset>
            {[...sp].filter(([k]) => k !== "goal").map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
            <label htmlFor="growth-goal">转化目标</label>
            <select id="growth-goal" name="goal" defaultValue={goal} onChange={(e) => e.currentTarget.form?.requestSubmit()}
              className="rounded-control bg-surface px-2 py-1 text-ink-2 ring-1 ring-line">
              {goals.map((g) => <option key={g} value={g}>{EVENT_LABELS[g] ?? g}</option>)}
            </select>
          </Form>
        )}
      </div>
      )}
      {range && (
        <p className="text-[12.5px] text-ink-4">
          {range.from === range.to ? range.from : `${range.from} – ${range.to}`}（台北时间），对比 {range.previous.from === range.previous.to ? range.previous.from : `${range.previous.from} – ${range.previous.to}`}
        </p>
      )}
      {active.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[12.5px] text-ink-3">筛选：</span>
          {active.map(([d, v]) => (
            <Link key={d} to={href({ [d]: null })} preventScrollReset title="去掉这个筛选"
              className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2.5 py-0.5 text-[12.5px] text-accent ring-1 ring-accent/20">
              {DIMENSION_LABELS[d] ?? d}：{valueLabel(d, v)} <span aria-hidden>×</span>
            </Link>
          ))}
          <Link to={href(Object.fromEntries(active.map(([d]) => [d, null])))} preventScrollReset className="text-[12.5px] text-ink-3 underline">全部清除</Link>
        </div>
      )}
    </div>
  );
}

/**
 * A dimension's rows; clicking a value narrows the page to it. A compact table that fits half the page: the bar
 * behind each value is its share of sessions, and the conversion count is in the rate's tooltip.
 */
export function BreakdownCard({ dimension, rows, goal, title, limit = 10, className = "" }: { dimension: string; rows: BreakdownRow[]; goal: string; title?: ReactNode; limit?: number; className?: string }) {
  const href = useHref();
  const total = rows.reduce((n, r) => n + r.sessions, 0);
  const mono = dimension === "landing_page" || dimension === "landing" || dimension === "exit";
  return (
    <Card title={title ?? DIMENSION_LABELS[dimension] ?? dimension} right={rows.length > limit ? `前 ${limit} / ${rows.length}` : undefined} pad={false} className={className}>
      {!rows.length ? <Empty>没有记录</Empty> : (
        <table className="w-full table-fixed border-collapse text-[12.5px]">
          <thead>
            <tr className="border-b border-line text-[11.5px] text-ink-3">
              <th className="px-3 py-2 text-left font-medium">{DIMENSION_LABELS[dimension] ?? dimension}</th>
              <th className="w-[46px] py-2 pr-2 text-right font-medium">访客</th>
              <th className="w-[46px] py-2 pr-2 text-right font-medium">会话</th>
              <th className="w-[42px] py-2 pr-2 text-right font-medium">跳出</th>
              <th className="w-[44px] py-2 pr-2 text-right font-medium" title="平均互动时长（分:秒）">时长</th>
              <th className="w-[52px] py-2 pr-3 text-right font-medium" title={EVENT_LABELS[goal] ?? goal}>转化</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, limit).map((r) => (
              <tr key={r.key} className="border-b border-line/70 last:border-0">
                <td className="relative px-3 py-1.5">
                  <span className="absolute inset-y-1 left-1 rounded-mark bg-accent/10" style={{ width: `calc(${total ? (r.sessions / total) * 100 : 0}% - 4px)` }} aria-hidden />
                  <Link to={href({ [dimension]: r.key })} preventScrollReset title={`${r.key || valueLabel(dimension, r.key)} · 占会话 ${pct(rate(r.sessions, total))}`}
                    className={`relative block truncate text-ink hover:text-accent ${mono ? "font-mono text-[12px]" : ""}`}>
                    {valueLabel(dimension, r.key)}
                  </Link>
                </td>
                <td className="num py-1.5 pr-2 text-right text-ink-2">{num(r.visitors)}</td>
                <td className="num py-1.5 pr-2 text-right text-ink-2">{num(r.sessions)}</td>
                <td className="num py-1.5 pr-2 text-right text-ink-2">{pct(rate(r.bounces, r.sessions), 0)}</td>
                <td className="num py-1.5 pr-2 text-right text-ink-2">{clock(r.engagedMs)}</td>
                <td className="num py-1.5 pr-3 text-right text-ink-2" title={`${num(r.conversions)} 个会话`}>{r.conversions ? pct(rate(r.conversions, r.sessions), 1) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

export function Section({ id, title, children, note }: { id?: string; title: string; children: ReactNode; note?: ReactNode }) {
  return (
    <section className="mt-8" aria-labelledby={id}>
      <h2 id={id} className="mb-1 text-[15px] font-semibold text-ink">{title}</h2>
      {note && <p className="mb-3 text-[12.5px] leading-relaxed text-ink-4">{note}</p>}
      {!note && <div className="mb-3" />}
      {children}
    </section>
  );
}
