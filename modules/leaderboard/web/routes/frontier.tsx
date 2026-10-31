import { Link } from "@aihot/web/lib/navigation";
import { localeFromMatches, Text, useLocale, useTranslate } from "@aihot/web/lib/i18n";
import { FEATURES } from "@aihot/industry/features";
import { useLoaderData, useRouteLoaderData } from "react-router";
import type { MetaArgs } from "react-router";
import type { loader as rootLoader } from "@aihot/web/root";
import type { LbBoardEntry, LbBoardResponse, LbFx } from "@aihot/leaderboard/contracts";
import { apiGet } from "@aihot/web/lib/api.server";
import { pageMeta } from "@aihot/web/lib/seo";
import { Deck } from "@aihot/web/components/shell/Deck";
import { BrandMark } from "@aihot/web/components/BrandMark";
import { KardashevMeter } from "@aihot/web/features/chrono/KardashevMeter";
import { webModules } from "@aihot/web/site-modules";
import { beijingDate } from "@aihot/contracts/time";
import { modelHref, usd } from "../features/format";
import { times } from "../features/pricing";
import type { ReactNode } from "react";

// The frontier: one page for where capability stands, the leaderboard, model prices and, when the site
// runs the indices module, the cost of intelligence. A row of figures under the deck reads the four at a
// glance; each card below draws its instrument and leads to its own page. A summary that cannot be read
// leaves its card with the words alone.

const TOP = 5;

/** What the hub reads of the indices module's answer (modules/indices/contracts.ts). */
interface CostPoint { date: string; price: number; model: { name: string } }
interface CostTier { key: string; threshold: number; reference: string; points: CostPoint[]; ratio: number | null }
interface CostSummary { asOf: string; modelCount: number; tiers: CostTier[] }

export function headers() {
  return { "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=600" };
}

export async function loader({ request }: { request: Request }) {
  const options = { request, signal: request.signal };
  const indices = webModules().some((m) => m.name === "indices");
  const [board, cost] = await Promise.all([
    apiGet<LbBoardResponse>("/api/site/leaderboard/boards/overall", options).catch(() => null),
    indices ? apiGet<CostSummary>("/api/site/indices/cost-of-intelligence", options).catch(() => null) : null,
  ]);
  return {
    top: board?.entries.slice(0, TOP) ?? [],
    fx: board?.run.fx ?? null,
    updatedAt: board?.run.generatedAt ?? null,
    sources: board ? { benchmarks: board.board.sourceCount, operators: board.board.operatorCount } : null,
    cost: cost && {
      asOf: cost.asOf,
      modelCount: cost.modelCount,
      tiers: cost.tiers.filter((t) => t.points.length > 0).map(({ key, threshold, reference, points, ratio }) => ({
        key, threshold, reference, ratio, points: points.map((p) => ({ date: p.date, price: p.price, model: { name: p.model.name } })),
      })),
    },
    indices,
  };
}

export function meta({ matches }: MetaArgs<typeof loader>) {
  return pageMeta({
    title: "前沿",
    description: "能力曲线此刻在哪：大模型共识排名、API 价格对比，以及固定能力的价格下降速度。",
    path: "/frontier",
  }, localeFromMatches(matches ?? []));
}

/** A board entry's uncached prices in USD: the list price when it is in dollars, else converted at the run's rate. */
function usdPrices(entry: LbBoardEntry, fx: LbFx | null): { input: number; output: number } | null {
  const p = entry.price;
  if (!p || p.input === null || p.output === null) return null;
  if (p.currency === "USD") return { input: p.input, output: p.output };
  return fx ? { input: p.input / fx.rate, output: p.output / fx.rate } : null;
}

function Kicker({ index, children }: { index: string; children: ReactNode }) {
  return <span className="font-mono text-[11.5px] uppercase tracking-[0.12em] text-ink-4">{index} — {children}</span>;
}

function More({ children }: { children: ReactNode }) {
  return <span className="text-[14.5px] text-accent">{children} →</span>;
}

function Figure({ label, value, note }: { label: string; value: ReactNode; note: ReactNode }) {
  return (
    <div className="min-w-0 border-t border-[rgb(244_236_220/0.14)] pt-5">
      <p className="truncate font-mono text-[11.5px] uppercase tracking-[0.12em] text-[color:var(--deck-faint)]">{label}</p>
      <p className="num mt-3 truncate font-mono text-[26px] leading-none text-[color:var(--deck-ink)] sm:text-[34px]">{value}</p>
      <p className="mt-2 line-clamp-2 text-[13px] leading-snug text-[color:var(--deck-dim)] sm:text-[13.5px]">{note}</p>
    </div>
  );
}

const CARD = "card group flex min-w-0 flex-col gap-6 p-6 transition-colors hover:border-[color:var(--brass)] sm:p-8";

function Leaders({ top, sources }: { top: LbBoardEntry[]; sources: { benchmarks: number; operators: number } | null }) {
  const tx = useTranslate();
  // Bars run from the decade below the fifth score to 100, so the gaps between the leaders show.
  const floor = Math.floor(Math.min(...top.map((e) => e.score)) / 10) * 10;
  return (
    <Link to="/leaderboard" prefetch="intent" className={`${CARD} flex-[7_1_520px]`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div>
          <Kicker index="01">{tx("模型")}</Kicker>
          <h2 className="mt-2 font-display text-[36px] leading-tight text-ink">{tx("模型榜")}</h2>
        </div>
        {sources && <span className="font-mono text-[12px] text-ink-4">{tx("{0} 项评测 · {1} 家机构", sources.benchmarks, sources.operators)}</span>}
      </div>
      {top.length ? (
        <ol className="border-b border-line">
          {top.map((e, i) => (
            <li key={e.model.slug} className="grid grid-cols-[28px_minmax(0,1fr)_52px] items-center gap-3 border-t border-line py-3 sm:grid-cols-[32px_minmax(0,1fr)_minmax(64px,150px)_52px] sm:gap-4">
              <span className={`num font-mono text-[13px] ${i === 0 ? "text-accent" : "text-ink-4"}`}>{String(e.rank).padStart(2, "0")}</span>
              <span className="flex min-w-0 items-center gap-3">
                <BrandMark brand={e.model.brand} size={30} />
                <span className="min-w-0 truncate">
                  <span className={`text-[15.5px] ${i === 0 ? "text-ink" : "text-ink-2"}`}>{e.model.name}</span>
                  {e.model.provider && <span className="ml-2 hidden text-[13px] text-ink-4 sm:inline">{e.model.provider}</span>}
                </span>
              </span>
              <span className="hidden h-[3px] overflow-hidden rounded-full bg-[rgb(255_222_170/0.08)] sm:block" aria-hidden="true">
                <span className="block h-full bg-[color:var(--brass)]" style={{ width: `${Math.max(2, ((e.score - floor) / (100 - floor)) * 100)}%`, opacity: i === 0 ? 1 : 0.6 }} />
              </span>
              <span className="num text-right font-mono text-[15px] text-ink">{e.score.toFixed(1)}</span>
            </li>
          ))}
        </ol>
      ) : <p className="text-[14.5px] leading-relaxed text-ink-3"><Text value="汇总多家公开评测的共识排名。" /></p>}
      <div className="mt-auto flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <span className="text-[13px] text-ink-4">{top.length > 0 && tx("共识指数，不是正确率")}</span>
        <More>{tx("按能力分类看")}</More>
      </div>
    </Link>
  );
}

/** Where a price sits on a log axis spanning whole decades, as a percentage. */
function decades(values: number[]): { lo: number; hi: number; at: (v: number) => number } {
  const lo = Math.floor(Math.log10(Math.min(...values)));
  const hi = Math.max(lo + 1, Math.ceil(Math.log10(Math.max(...values))));
  return { lo, hi, at: (v) => ((Math.log10(v) - lo) / (hi - lo)) * 100 };
}

function Prices({ top, fx }: { top: LbBoardEntry[]; fx: LbFx | null }) {
  const tx = useTranslate();
  const rows = top.flatMap((e) => {
    const price = usdPrices(e, fx);
    return price ? [{ entry: e, price }] : [];
  }).sort((a, b) => a.price.output - b.price.output || a.price.input - b.price.input);
  const axis = rows.length ? decades(rows.flatMap((r) => [r.price.input, r.price.output])) : null;
  return (
    <Link to="/pricing" prefetch="intent" className={`${CARD} flex-[5_1_380px]`}>
      <div>
        <Kicker index="02">{tx("价格")}</Kicker>
        <h2 className="mt-2 font-display text-[36px] leading-tight text-ink">{tx("前沿的价格")}</h2>
      </div>
      {axis ? (
        <div>
          <div className="num flex justify-between pl-[calc(min(40%,160px)+12px)] font-mono text-[11px] text-ink-4" aria-hidden="true">
            {Array.from({ length: axis.hi - axis.lo + 1 }, (_, i) => <span key={i}>{usd(10 ** (axis.lo + i))}</span>)}
          </div>
          <ul className="mt-1 border-b border-line">
            {rows.map(({ entry, price }) => (
              <li key={entry.model.slug} className="grid grid-cols-[min(40%,160px)_minmax(0,1fr)] items-center gap-3 border-t border-line py-2.5">
                <span className="flex min-w-0 items-center gap-2.5 text-[14px] text-ink-2">
                  <BrandMark brand={entry.model.brand} size={24} />
                  <span className="truncate">{entry.model.name}</span>
                </span>
                <span className="relative block h-3" role="img" aria-label={tx("输入 {0}，输出 {1}", usd(price.input), usd(price.output))}>
                  <span className="absolute top-[5px] h-[2px] bg-[rgb(217_164_65/0.4)]" style={{ left: `${axis.at(price.input)}%`, width: `${axis.at(price.output) - axis.at(price.input)}%` }} />
                  <span className="absolute top-0.5 h-2 w-2 -translate-x-1/2 rounded-full border-[1.5px] border-[color:var(--brass)] bg-surface" style={{ left: `${axis.at(price.input)}%` }} />
                  <span className="absolute top-0.5 h-2 w-2 -translate-x-1/2 rounded-full bg-[color:var(--brass)]" style={{ left: `${axis.at(price.output)}%` }} />
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-ink-4">
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full border-[1.5px] border-[color:var(--brass)]" aria-hidden="true" />{tx("输入")}</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[color:var(--brass)]" aria-hidden="true" />{tx("输出")}</span>
            <span>{tx("美元 / 百万 Token · 对数刻度")}</span>
          </p>
        </div>
      ) : <p className="text-[14.5px] leading-relaxed text-ink-3"><Text value="每百万 Token 的输入、输出与缓存价格并排比较，附调用成本计算器。" /></p>}
      <div className="mt-auto flex flex-wrap items-center justify-end gap-4">
        <More>{tx("对比两个模型")}</More>
      </div>
    </Link>
  );
}

/** Index prices as the cost-of-intelligence page prints them: $37.50, $4.50, $0.053. */
function dollars(price: number): string {
  if (price >= 100) return `$${price.toFixed(0)}`;
  if (price >= 1) return `$${price.toFixed(2)}`;
  return `$${price.toPrecision(2)}`;
}

/** The tier the index page leads with: the first whose price has fallen. */
function leadTier(tiers: CostTier[]): CostTier | undefined {
  return tiers.find((t) => t.ratio) ?? tiers[0];
}

/** The cheapest price of each tier as steps over time, on a log scale, the lead tier in brass. */
function CostChart({ tiers, lead, asOf }: { tiers: CostTier[]; lead: CostTier; asOf: string }) {
  const tx = useTranslate();
  const points = tiers.flatMap((t) => t.points);
  const start = Math.min(...points.map((p) => Date.parse(p.date)));
  const end = Math.max(Date.parse(asOf), start + 1);
  const lo = Math.log10(Math.min(...points.map((p) => p.price))) - 0.15;
  const hi = Math.log10(Math.max(...points.map((p) => p.price))) + 0.15;
  const x = (date: string) => ((Date.parse(date) - start) / (end - start)) * 100;
  const y = (price: number) => ((hi - Math.log10(price)) / (hi - lo)) * 100;
  const path = (t: CostTier) => t.points.reduce((d, p, i) => i === 0 ? `M${x(p.date)},${y(p.price)}` : `${d}H${x(p.date)}V${y(p.price)}`, "") + `H${x(asOf)}`;
  const grid = Array.from({ length: Math.ceil(hi) - Math.floor(lo) + 1 }, (_, i) => Math.floor(lo) + i)
    .flatMap((e) => [10 ** e, 3 * 10 ** e]).filter((v) => Math.log10(v) > lo && Math.log10(v) < hi);
  const years = Array.from({ length: new Date(end).getUTCFullYear() - new Date(start).getUTCFullYear() }, (_, i) => new Date(start).getUTCFullYear() + i + 1);
  const first = lead.points[0]!;
  const last = lead.points.at(-1)!;
  return (
    <figure className="m-0">
      <div className="num relative h-[220px] font-mono text-[11px] text-ink-4 sm:h-[260px]" role="img" aria-label={tx("{0} 级能力的最低价格：从 {1} 降到 {2}", lead.reference, dollars(first.price), dollars(last.price))}>
        {grid.map((v) => <span key={v} className="absolute left-0 -translate-y-1/2" style={{ top: `${y(v)}%` }} aria-hidden="true">{tickUsd(v)}</span>)}
        <div className="absolute inset-y-0 left-12 right-0" aria-hidden="true">
          <svg className="absolute inset-0 h-full w-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none">
            {grid.map((v) => <line key={v} x1="0" x2="100" y1={y(v)} y2={y(v)} stroke="var(--line)" vectorEffect="non-scaling-stroke" />)}
            {tiers.filter((t) => t !== lead).map((t) => <path key={t.key} d={path(t)} fill="none" stroke="var(--ink-4)" strokeOpacity="0.45" strokeWidth="1" vectorEffect="non-scaling-stroke" />)}
            <path d={path(lead)} fill="none" stroke="var(--brass)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
          </svg>
          <span className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[color:var(--brass)]" style={{ left: `${x(first.date)}%`, top: `${y(first.price)}%` }} />
          <span className="absolute whitespace-nowrap pl-2 pt-2 text-ink-2" style={{ left: `${x(first.date)}%`, top: `${y(first.price)}%` }}>{first.model.name} · {dollars(first.price)}</span>
          <span className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[color:var(--brass)] shadow-[0_0_0_5px_rgb(217_164_65/0.18)]" style={{ left: `${x(asOf)}%`, top: `${y(last.price)}%` }} />
          <span className="absolute right-0 -translate-y-full whitespace-nowrap pb-2 text-ink-2" style={{ top: `${y(last.price)}%` }}>{last.model.name} · {dollars(last.price)}</span>
        </div>
      </div>
      <div className="num relative ml-12 mt-2 h-4 font-mono text-[11px] text-ink-4" aria-hidden="true">
        {years.map((year) => <span key={year} className="absolute -translate-x-1/2" style={{ left: `${x(`${year}-01-01`)}%` }}>{year}</span>)}
      </div>
      <figcaption className="mt-3 text-[12.5px] text-ink-4">{tx("每百万 Token 的最低价格，输入与输出按 3:1 混合，对数刻度；金线是 GPQA ≥ {0}，灰线是其他档位。", `${Math.round(lead.threshold * 100)}%`)}</figcaption>
    </figure>
  );
}

/** Axis ticks with one significant figure: $30, $3, $0.3. */
const tickUsd = (v: number) => `$${Number(v.toPrecision(1))}`;

function Cost({ cost }: { cost: { asOf: string; modelCount: number; tiers: CostTier[] } | null }) {
  const tx = useTranslate();
  const lead = cost && leadTier(cost.tiers);
  const first = lead?.points[0];
  const last = lead?.points.at(-1);
  return (
    <Link to="/index/cost-of-intelligence" prefetch="intent" className={`${CARD} flex-[1_1_100%] lg:flex-row lg:flex-wrap lg:gap-x-14`}>
      <div className="flex min-w-0 flex-[999_1_520px] flex-col gap-6">
        <div>
          <Kicker index="03">{tx("指数")} · {tx("智能成本")}</Kicker>
          {lead?.ratio && first && last ? (
            <>
              <h2 className="mt-2 font-display text-[40px] leading-[1.05] text-ink sm:text-[48px]">{tx("同样的智能，便宜了 {0} 倍。", times(lead.ratio))}</h2>
              <p className="mt-3 max-w-[560px] text-[15px] leading-relaxed text-ink-3">{tx("{0}，{1} 级能力每百万 Token {2}；今天 {3} 只要 {4}。", first.date.slice(0, 7), lead.reference, dollars(first.price), last.model.name, dollars(last.price))}</p>
            </>
          ) : (
            <>
              <h2 className="mt-2 font-display text-[40px] leading-tight text-ink">{tx("智能成本")}</h2>
              <p className="mt-3 text-[14.5px] leading-relaxed text-ink-3"><Text value="固定一档能力，看它的价格随时间怎么下降。" /></p>
            </>
          )}
        </div>
        {cost && lead && <CostChart tiers={cost.tiers} lead={lead} asOf={cost.asOf} />}
      </div>
      <div className="flex min-w-0 flex-[1_1_280px] flex-col justify-between gap-6">
        {cost && cost.tiers.length > 0 && (
          <div>
            <p className="font-mono text-[11.5px] uppercase tracking-[0.12em] text-ink-4">{tx("今天 · 每百万 Token")}</p>
            <dl className="mt-2 border-b border-line">
              {cost.tiers.map((t) => (
                <div key={t.key} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-baseline gap-5 border-t border-line py-3.5">
                  <dt className="text-[14px] text-ink-2">GPQA ≥ {Math.round(t.threshold * 100)}%</dt>
                  <dd className="num m-0 text-right font-mono text-[15px] text-ink">{dollars(t.points.at(-1)!.price)}</dd>
                  <dd className="num m-0 min-w-[4ch] text-right font-mono text-[15px] text-accent">{t.ratio ? `${times(t.ratio)}×` : "—"}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          {cost && <span className="num font-mono text-[12px] text-ink-4">{tx("{0} 个模型 · 截至 {1}", cost.modelCount, cost.asOf)}</span>}
          <More>{tx("看价格怎么降")}</More>
        </div>
      </div>
    </Link>
  );
}

export default function Frontier() {
  const tx = useTranslate();
  const locale = useLocale();
  const { top, fx, updatedAt, sources, cost, indices } = useLoaderData<typeof loader>();
  const kardashev = useRouteLoaderData<typeof rootLoader>("root")?.timeBounds?.kardashev ?? null;
  const leader = top[0];
  const leaderPrice = leader ? usdPrices(leader, fx) : null;
  const lead = cost && leadTier(cost.tiers);
  return (
    <div className="pb-10">
      <Deck art="cat-models" label={tx("前沿")}
        kicker={updatedAt ? `${tx("前沿")} · ${beijingDate(updatedAt)}` : tx("前沿")}
        title={<span className={`font-display ${locale === "en" ? "font-normal italic" : "font-bold"}`}>{tx("能力曲线，此刻在哪")}</span>}
        description={tx("最强的模型、它们的价格，以及同样的能力变便宜得有多快。")}>
        <div className="grid grid-cols-2 gap-x-5 gap-y-5 sm:gap-x-8 lg:grid-cols-4">
          {leader && <Figure label={`01 · ${tx("第一名")}`} value={leader.score.toFixed(1)} note={tx("{0} · 共识指数", leader.model.name)} />}
          {leaderPrice && <Figure label={`02 · ${tx("前沿的价格")}`} value={<>{usd(leaderPrice.input)} <span className="text-[15px] sm:text-[18px] text-[color:var(--deck-faint)]">/ {usd(leaderPrice.output)}</span></>} note={tx("第一名 · 每百万 Token 输入 / 输出")} />}
          {lead?.ratio && <Figure label={`03 · ${tx("智能成本")}`} value={<span className="text-[color:var(--brass)]">{times(lead.ratio)}×</span>} note={tx("{0} 级能力，自 {1} 起", lead.reference, lead.points[0]!.date.slice(0, 7))} />}
          {FEATURES.timeMachine && kardashev !== null && <Figure label={`04 · ${tx("文明")}`} value={`K ${kardashev.toFixed(3)}`} note={tx("在卡尔达肖夫指数上")} />}
        </div>
      </Deck>
      <div className="mt-8 flex flex-wrap gap-4 lg:gap-5">
        <Leaders top={top} sources={sources} />
        <Prices top={top} fx={fx} />
        {indices && <Cost cost={cost} />}
        {FEATURES.timeMachine && kardashev !== null && (
          <section className="card flex min-w-0 flex-[1_1_100%] flex-wrap items-center gap-x-14 gap-y-2 p-6 sm:px-8" aria-label={tx("文明")}>
            <div className="min-w-0 flex-[1_1_260px]">
              <Kicker index="04">{tx("文明")}</Kicker>
              <p className="num mt-3 font-mono text-[40px] leading-none text-ink">K = {kardashev.toFixed(3)}</p>
              <p className="mt-3 max-w-[340px] text-[14px] leading-relaxed text-ink-3"><Text value="人类一次能源功率在卡尔达肖夫指数上的位置，I 型文明为 1。" /></p>
            </div>
            <div className="min-w-0 flex-[999_1_480px] pb-2">
              <KardashevMeter k={kardashev} />
              <Link to="/chronicle" prefetch="intent" className="mt-4 flex justify-end"><More>{tx("在加速史里看")}</More></Link>
            </div>
          </section>
        )}
      </div>
      {leader && <p className="mt-5 text-[12.5px] text-ink-4"><Text value="模型榜的分数是共识指数，不是正确率。" /> <Link to={modelHref(leader.model.slug)} className="text-ink-3 underline underline-offset-2 hover:text-ink">{tx("看第一名的评测证据")}</Link></p>}
    </div>
  );
}
