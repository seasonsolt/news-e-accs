import { Link } from "@aihot/web/lib/navigation";
import { localeFromMatches, Text, translate, useTranslate } from "@aihot/web/lib/i18n";
import type { ReactNode } from "react";
import { redirect, useLoaderData } from "react-router";
import type { LoaderFunctionArgs, MetaArgs } from "react-router";
import type { LbCompareResponse, LbCompareSide } from "@aihot/leaderboard/contracts";
import { loadOr404 } from "@aihot/web/lib/api.server";
import { localePath, requestLocale } from "@aihot/web/lib/locale";
import { breadcrumbLd, pageMeta } from "@aihot/web/lib/seo";
import { BrandMark } from "@aihot/web/components/BrandMark";
import { Deck } from "@aihot/web/components/shell/Deck";
import { listPrice, tokensShort, tokensWan, usd } from "../features/format";
import { PRESETS, requestCost, times } from "../features/pricing";
import { IconArrowLeft, IconArrowRight, IconExternal } from "@aihot/web/components/icons";

export async function loader({ params, request }: LoaderFunctionArgs) {
  const pair = params.pair ?? "";
  const body = await loadOr404<LbCompareResponse>(`/api/site/leaderboard/pricing/compare/${encodeURIComponent(pair)}`, { request, signal: request.signal });
  // One address per pair: the slugs in alphabetical order.
  if (body.pair !== pair) throw redirect(localePath(`/pricing/compare/${body.pair}`, requestLocale(request)), 301);
  return body;
}

type Tx = (message: string, ...values: unknown[]) => string;

/** The chat-message preset's costs, cheaper side first: the comparison's one-line answer. */
function chatSummary(tx: Tx, [a, b]: LbCompareResponse["sides"]): string {
  const chat = PRESETS[0];
  const ca = requestCost(a.row, chat.input, chat.output)!;
  const cb = requestCost(b.row, chat.input, chat.output)!;
  if (ca === cb) return tx("按一次聊天消息（{0} 输入、{1} 输出）计算，两者每次都是 {2}。", tokensShort(chat.input), tokensShort(chat.output), usd(ca));
  const [cheap, dear] = ca < cb ? [[a, ca], [b, cb]] as const : [[b, cb], [a, ca]] as const;
  return tx("按一次聊天消息（{0} 输入、{1} 输出）计算，{2} 每次 {3}，{4} 每次 {5}，前者便宜约 {6} 倍。",
    tokensShort(chat.input), tokensShort(chat.output), cheap[0].row.model.name, usd(cheap[1]), dear[0].row.model.name, usd(dear[1]), times(dear[1] / cheap[1]));
}

function rankSummary(tx: Tx, [a, b]: LbCompareResponse["sides"]): string | null {
  const [ra, rb] = [a.row.rank, b.row.rank];
  if (ra !== null && rb !== null) return tx("综合榜上 {0} 排第 {1}，{2} 排第 {3}。", a.row.model.name, ra, b.row.model.name, rb);
  const ranked = ra !== null ? a : rb !== null ? b : null;
  if (!ranked) return null;
  return tx("综合榜上 {0} 排第 {1}，{2} 不在榜单前列。", ranked.row.model.name, ranked.row.rank, (ranked === a ? b : a).row.model.name);
}

export function meta({ matches, loaderData }: MetaArgs<typeof loader>) {
  const locale = localeFromMatches(matches ?? []);
  const tx: Tx = (message, ...values) => translate(locale, message, ...values);
  if (!loaderData) return pageMeta({ title: "页面不存在", path: "/pricing", noindex: true }, locale);
  const [a, b] = loaderData.sides;
  const path = `/pricing/compare/${loaderData.pair}`;
  const title = tx("{0} 与 {1} API 价格对比", a.row.model.name, b.row.model.name);
  return pageMeta({
    noindex: !loaderData.featured,
    title: tx("{0} 与 {1} API 价格对比 2026：每次调用成本", a.row.model.name, b.row.model.name),
    rawTitle: true,
    description: `${tx("每百万 Token：{0} 输入 {1}、输出 {2}；{3} 输入 {4}、输出 {5}。", a.row.model.name, usd(a.row.usd.input), usd(a.row.usd.output), b.row.model.name, usd(b.row.usd.input), usd(b.row.usd.output))}${chatSummary(tx, loaderData.sides)}`,
    path,
    jsonLd: [
      breadcrumbLd([
        { name: tx("模型榜"), path: "/leaderboard" },
        { name: tx("API 价格"), path: "/pricing" },
        { name: title, path },
      ]),
    ],
  }, locale);
}

export function headers() {
  return { "Cache-Control": "public, max-age=0, s-maxage=600, stale-while-revalidate=600" };
}

function ModelHead({ side }: { side: LbCompareSide }) {
  const { model, hasPage } = side.row;
  return (
    <span className="inline-flex items-center justify-end gap-2">
      <BrandMark brand={model.brand} size={22} />
      {hasPage ? <Link to={`/leaderboard/${model.slug}`} className="font-semibold text-ink hover:text-accent">{model.name}</Link> : <span className="font-semibold text-ink">{model.name}</span>}
    </span>
  );
}

function PriceCell({ side, field }: { side: LbCompareSide; field: "input" | "output" | "cached" }) {
  const tx = useTranslate();
  const { usd: converted, price } = side.row;
  return (
    <td className="py-2.5 pl-3 text-right align-top">
      <span className="num block text-ink">{usd(converted[field])}</span>
      {price.currency === "CNY" && price[field] !== null && <span className="num block text-[11px] text-ink-4">{tx("标价 {0}", listPrice(price[field], "CNY"))}</span>}
    </td>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <tr className="border-b border-line-soft last:border-0">
      <th scope="row" className="py-2.5 text-left align-top font-normal text-ink-3"><Text value={label} /></th>
      {children}
    </tr>
  );
}

function SpecTable({ sides }: { sides: LbCompareResponse["sides"] }) {
  const tx = useTranslate();
  const rank = (r: number | null) => (r !== null ? `#${r}` : "—");
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full min-w-[480px] text-[13px]">
        <thead className="text-[12px] text-ink-4">
          <tr className="border-b border-line">
            <th className="py-2 text-left font-medium"><Text value="美元 / 每百万 Token" /></th>
            {sides.map((s) => <th key={s.row.model.slug} className="py-2 pl-3 text-right font-medium"><ModelHead side={s} /></th>)}
          </tr>
        </thead>
        <tbody>
          <Row label="输入">{sides.map((s) => <PriceCell key={s.row.model.slug} side={s} field="input" />)}</Row>
          <Row label="输出">{sides.map((s) => <PriceCell key={s.row.model.slug} side={s} field="output" />)}</Row>
          <Row label="缓存输入">{sides.map((s) => <PriceCell key={s.row.model.slug} side={s} field="cached" />)}</Row>
          <Row label="厂商">{sides.map((s) => <td key={s.row.model.slug} className="py-2.5 pl-3 text-right text-ink-2">{s.row.model.provider ?? "—"}</td>)}</Row>
          {sides.some((s) => s.contextWindowTokens) && <Row label="上下文窗口">{sides.map((s) => <td key={s.row.model.slug} className="num py-2.5 pl-3 text-right text-ink-2">{s.contextWindowTokens ? tx(tokensWan(s.contextWindowTokens)) : "—"}</td>)}</Row>}
          <Row label="上线日期">{sides.map((s) => <td key={s.row.model.slug} className="num py-2.5 pl-3 text-right text-ink-2">{s.row.model.releasedAt ?? "—"}</td>)}</Row>
          {sides[0].boards.map((board, i) => (
            <tr key={board.key} className="border-b border-line-soft last:border-0">
              <th scope="row" className="py-2.5 text-left align-top font-normal text-ink-3">
                <Link to={board.href} className="hover:text-accent">{tx("{0}排名", board.name)}</Link>
              </th>
              {sides.map((s) => <td key={s.row.model.slug} className="num py-2.5 pl-3 text-right text-ink-2">{rank(s.boards[i]!.rank)}</td>)}
            </tr>
          ))}
          <Row label="核对日期">{sides.map((s) => <td key={s.row.model.slug} className="num py-2.5 pl-3 text-right text-ink-4">{s.row.price.verifiedOn ?? "—"}</td>)}</Row>
          <Row label="价格来源">
            {sides.map((s) => (
              <td key={s.row.model.slug} className="py-2.5 pl-3 text-right">
                {s.row.price.officialUrl ? <a href={s.row.price.officialUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-ink-3 hover:text-accent"><Text value="价格来源" /><IconExternal size={12} /></a> : "—"}
              </td>
            ))}
          </Row>
        </tbody>
      </table>
    </div>
  );
}

function CostTable({ sides }: { sides: LbCompareResponse["sides"] }) {
  const tx = useTranslate();
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full min-w-[560px] text-[13px]">
        <thead className="text-[12px] text-ink-4">
          <tr className="border-b border-line">
            <th className="py-2 text-left font-medium"><Text value="用量" /></th>
            {sides.map((s) => <th key={s.row.model.slug} className="py-2 pl-3 text-right font-medium">{s.row.model.name}</th>)}
            <th className="py-2 pl-3 text-right font-medium"><Text value="差距" /></th>
          </tr>
        </thead>
        <tbody>
          {PRESETS.map((p) => {
            const costs = sides.map((s) => requestCost(s.row, p.input, p.output)!);
            const [lo, hi] = [Math.min(...costs), Math.max(...costs)];
            const cheaper = sides[costs.indexOf(lo)]!.row.model.name;
            return (
              <tr key={p.key} className="border-b border-line-soft last:border-0">
                <td className="py-2.5 align-top">
                  <span className="block text-ink-2">{tx(p.label)}</span>
                  <span className="num block text-[11.5px] text-ink-4">{tx("{0} 输入 / {1} 输出", tokensShort(p.input), tokensShort(p.output))}</span>
                </td>
                {costs.map((c, i) => (
                  <td key={sides[i]!.row.model.slug} className="py-2.5 pl-3 text-right align-top">
                    <span className="num block text-ink">{usd(c)}</span>
                    <span className="num block text-[11.5px] text-ink-4">{tx("每千次 {0}", usd(c * 1000))}</span>
                  </td>
                ))}
                <td className="py-2.5 pl-3 text-right align-top text-ink-2">{lo === hi ? tx("相同") : tx("{0} 便宜 {1} 倍", cheaper, times(hi / lo))}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Related({ side }: { side: LbCompareSide }) {
  const tx = useTranslate();
  if (!side.related.length) return null;
  return (
    <div className="min-w-0">
      <h3 className="text-[14px] font-semibold text-ink">{tx("{0} 与其他模型", side.row.model.name)}</h3>
      <ul className="mt-2 space-y-1.5 text-[13px]">
        {side.related.map((r) => (
          <li key={r.pair}>
            <Link to={`/pricing/compare/${r.pair}`} className="text-ink-3 hover:text-accent">{tx("{0} 与 {1}", side.row.model.name, r.model.name)}</Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function PricingComparePage() {
  const tx = useTranslate();
  const data = useLoaderData<typeof loader>();
  const [a, b] = data.sides;
  const ranks = rankSummary(tx, data.sides);
  return (
    <div className="pb-12">
      <Deck
        compact
        art="cat-models"
        label={tx("API 价格对比")}
        kicker={<Link to="/pricing" className="inline-flex items-center gap-1 hover:text-[var(--heat-hi)]"><IconArrowLeft size={14} /><Text value="全部模型价格" /></Link>}
        title={tx("{0} 与 {1} API 价格对比", a.row.model.name, b.row.model.name)}
        description={chatSummary(tx, data.sides)}
      />
      <section className="mt-6 max-w-[720px] space-y-2 text-[13.5px] leading-relaxed text-ink-3">
        {ranks && <p>{ranks}</p>}
        <p><Text value="价格取自 OpenRouter 公开模型列表的标准按量付费价，输入按未命中缓存计算；OpenRouter 上没有的模型用厂商官方价，以人民币标价的按本轮汇率折算为美元。" /></p>
        <div className="flex flex-wrap gap-x-5 gap-y-1">
          <Link to="/pricing#calculator" className="inline-flex items-center gap-1 text-[13px] font-medium text-accent hover:text-accent-ink"><Text value="用计算器按自己的用量算" /><IconArrowRight size={13} /></Link>
          <Link to="/leaderboard" className="inline-flex items-center gap-1 text-[13px] font-medium text-accent hover:text-accent-ink"><Text value="查看模型榜排名" /><IconArrowRight size={13} /></Link>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-[17px] font-bold text-ink"><Text value="价格与排名" /></h2>
        <SpecTable sides={data.sides} />
      </section>

      <section className="mt-10">
        <h2 className="text-[17px] font-bold text-ink"><Text value="按用量算每次调用成本" /></h2>
        <p className="mt-1 text-[12.5px] text-ink-3"><Text value="不含缓存折扣与批量优惠。" /></p>
        <CostTable sides={data.sides} />
      </section>

      {(a.related.length > 0 || b.related.length > 0) && (
        <section className="mt-10">
          <h2 className="text-[17px] font-bold text-ink"><Text value="更多价格对比" /></h2>
          <div className="mt-4 grid gap-6 sm:grid-cols-2">
            <Related side={a} />
            <Related side={b} />
          </div>
        </section>
      )}
    </div>
  );
}
