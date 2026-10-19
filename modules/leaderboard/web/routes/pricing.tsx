import { Link } from "@aihot/web/lib/navigation";
import { localeFromMatches, Text, translate, useTranslate } from "@aihot/web/lib/i18n";
import { SITE } from "@aihot/site";
import { useState } from "react";
import { useLoaderData } from "react-router";
import type { MetaArgs } from "react-router";
import type { LbPricingResponse, LbPricingRow } from "@aihot/leaderboard/contracts";
import { loadOr404 } from "@aihot/web/lib/api.server";
import { breadcrumbLd, pageMeta, siteUrl } from "@aihot/web/lib/seo";
import { BrandMark } from "@aihot/web/components/BrandMark";
import { Deck } from "@aihot/web/components/shell/Deck";
import { listPrice, tokensShort, usd } from "../features/format";
import { IconArrowLeft, IconArrowRight, IconExternal } from "@aihot/web/components/icons";

export async function loader({ request }: { request: Request }) {
  return loadOr404<LbPricingResponse>("/api/site/leaderboard/pricing", { request, signal: request.signal });
}

export function meta({ matches, loaderData }: MetaArgs<typeof loader>) {
  const locale = localeFromMatches(matches ?? []);
  const tx = (message: string, ...values: unknown[]) => translate(locale, message, ...values);
  if (!loaderData) return pageMeta({ title: "页面不存在", path: "/pricing", noindex: true }, locale);
  const { rows, verifiedOn } = loaderData;
  const title = tx("大模型 API 价格对比 2026：全部模型");
  return pageMeta({
    title,
    rawTitle: true,
    description: verifiedOn
      ? tx("对比 {0} 个大模型的 API 价格：每百万 Token 的输入、输出与缓存输入价格（美元），取自 OpenRouter，最近一次更新于 {1}，附调用成本计算器。", rows.length, verifiedOn)
      : tx("对比 {0} 个大模型的 API 价格：每百万 Token 的输入、输出与缓存输入价格（美元），附调用成本计算器。", rows.length),
    path: "/pricing",
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "Dataset",
        name: title,
        description: tx("{0} 个大模型的 API 价格（输入、输出与缓存输入，每百万 Token），以美元列出，取自 OpenRouter 公开模型列表，并附每个价格的来源链接。", rows.length),
        url: `${siteUrl()}/pricing`,
        creator: { "@type": "Organization", name: SITE.name, url: siteUrl() },
        isAccessibleForFree: true,
        ...(verifiedOn ? { dateModified: verifiedOn } : {}),
      },
      breadcrumbLd([
        { name: tx("模型榜"), path: "/leaderboard" },
        { name: tx("API 价格"), path: "/pricing" },
      ]),
    ],
  }, locale);
}

export function headers() {
  return { "Cache-Control": "public, max-age=0, s-maxage=600, stale-while-revalidate=600" };
}

const PRESETS = [
  { key: "chat", label: "聊天消息", input: 1_000, output: 500 },
  { key: "document", label: "长文档", input: 100_000, output: 2_000 },
  { key: "agent", label: "Agent 会话", input: 500_000, output: 50_000 },
] as const;
const DEFAULT_REQUESTS = 1_000;

function UsdCell({ value, list, currency }: { value: number | null; list: number | null; currency: LbPricingRow["price"]["currency"] }) {
  const tx = useTranslate();
  return (
    <td className="py-2.5 pl-3 text-right align-top">
      <span className="num block text-ink">{usd(value)}</span>
      {currency === "CNY" && list !== null && <span className="num block text-[11px] text-ink-4">{tx("标价 {0}", listPrice(list, "CNY"))}</span>}
    </td>
  );
}

function PriceTable({ rows }: { rows: LbPricingRow[] }) {
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full min-w-[760px] text-[13px]">
        <thead className="text-[12px] text-ink-4">
          <tr className="border-b border-line">
            <th className="py-2 text-left font-medium"><Text value="模型名称" /></th>
            <th className="py-2 pl-3 text-left font-medium"><Text value="厂商" /></th>
            <th className="py-2 pl-3 text-right font-medium"><Text value="输入" /></th>
            <th className="py-2 pl-3 text-right font-medium"><Text value="输出" /></th>
            <th className="py-2 pl-3 text-right font-medium"><Text value="缓存输入" /></th>
            <th className="py-2 pl-3 text-right font-medium"><Text value="综合排名" /></th>
            <th className="py-2 pl-3 text-right font-medium"><Text value="核对日期" /></th>
            <th className="py-2 pl-3 text-right font-medium"><Text value="价格来源" /></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.model.slug} className="border-b border-line-soft last:border-0">
              <td className="py-2.5 align-top">
                <span className="flex items-center gap-2.5">
                  <BrandMark brand={r.model.brand} size={24} />
                  {r.hasPage ? (
                    <Link to={`/leaderboard/${r.model.slug}`} className="font-medium text-ink hover:text-accent">{r.model.name}</Link>
                  ) : (
                    <span className="font-medium text-ink">{r.model.name}</span>
                  )}
                </span>
              </td>
              <td className="py-2.5 pl-3 align-top text-ink-3">{r.model.provider ?? "—"}</td>
              <UsdCell value={r.usd.input} list={r.price.input} currency={r.price.currency} />
              <UsdCell value={r.usd.output} list={r.price.output} currency={r.price.currency} />
              <UsdCell value={r.usd.cached} list={r.price.cached} currency={r.price.currency} />
              <td className="num py-2.5 pl-3 text-right align-top text-ink-3">{r.rank !== null ? `#${r.rank}` : "—"}</td>
              <td className="num py-2.5 pl-3 text-right align-top text-ink-4">{r.price.verifiedOn ?? "—"}</td>
              <td className="py-2.5 pl-3 text-right align-top">
                {r.price.officialUrl ? (
                  <a href={r.price.officialUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-ink-3 hover:text-accent"><Text value="价格来源" /><IconExternal size={12} /></a>
                ) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const FIELD = "num w-full rounded-control bg-surface px-3 py-2 text-[13.5px] text-ink ring-1 ring-line-strong outline-none transition-shadow focus:ring-2 focus:ring-accent";

function NumberField({ id, label, value, onChange }: { id: string; label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label htmlFor={id} className="flex min-w-0 flex-col gap-1.5">
      <span className="text-[12px] text-ink-4">{label}</span>
      <input
        id={id}
        type="number"
        min={0}
        step={1}
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
        className={FIELD}
      />
    </label>
  );
}

/** Pure arithmetic on the table's prices; the server renders the default preset so the numbers are in the HTML. */
function Calculator({ rows }: { rows: LbPricingRow[] }) {
  const tx = useTranslate();
  const [input, setInput] = useState<number>(PRESETS[0].input);
  const [output, setOutput] = useState<number>(PRESETS[0].output);
  const [requests, setRequests] = useState(DEFAULT_REQUESTS);
  const costs = rows
    .map((r) => ({ r, perRequest: r.usd.input !== null && r.usd.output !== null ? (input * r.usd.input + output * r.usd.output) / 1e6 : null }))
    .sort((a, b) => (a.perRequest === b.perRequest ? 0 : a.perRequest === null ? 1 : b.perRequest === null ? -1 : a.perRequest - b.perRequest));
  return (
    <section id="calculator" className="mt-12 scroll-mt-6">
      <h2 className="text-[17px] font-bold text-ink"><Text value="成本计算器" /></h2>
      <p className="mt-1 text-[12.5px] text-ink-3"><Text value="按上表的输入与输出价格计算，不含缓存折扣，从便宜到贵排列；缺少价格的模型排在最后。" /></p>
      <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label={tx("常见用量")}>
        {PRESETS.map((p) => {
          const active = p.input === input && p.output === output;
          return (
            <button
              key={p.key}
              type="button"
              aria-pressed={active}
              onClick={() => { setInput(p.input); setOutput(p.output); }}
              className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12.5px] transition-colors ${active ? "border-accent/45 text-accent" : "border-line bg-surface text-ink-3 hover:border-line-strong hover:text-accent"}`}
            >
              {tx(p.label)}
              <span className="num text-[11.5px] text-ink-4">{tx("{0} 输入 / {1} 输出", tokensShort(p.input), tokensShort(p.output))}</span>
            </button>
          );
        })}
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <NumberField id="calc-input" label={tx("输入 Token")} value={input} onChange={setInput} />
        <NumberField id="calc-output" label={tx("输出 Token")} value={output} onChange={setOutput} />
        <NumberField id="calc-requests" label={tx("每月请求数")} value={requests} onChange={setRequests} />
      </div>
      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[420px] text-[13px]">
          <thead className="text-[12px] text-ink-4">
            <tr className="border-b border-line">
              <th className="py-2 text-left font-medium"><Text value="模型名称" /></th>
              <th className="py-2 pl-3 text-right font-medium"><Text value="每次请求" /></th>
              <th className="py-2 pl-3 text-right font-medium"><Text value="每月" /></th>
            </tr>
          </thead>
          <tbody>
            {costs.map(({ r, perRequest }) => (
              <tr key={r.model.slug} className="border-b border-line-soft last:border-0">
                <td className="py-2 text-ink-2">{r.model.name}</td>
                <td className="num py-2 pl-3 text-right text-ink">{usd(perRequest)}</td>
                <td className="num py-2 pl-3 text-right text-ink">{usd(perRequest === null ? null : perRequest * requests)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function PricingPage() {
  const tx = useTranslate();
  const { rows, verifiedOn, run } = useLoaderData<typeof loader>();
  return (
    <div className="pb-12">
      <Deck
        compact
        art="cat-models"
        label={tx("API 价格")}
        kicker={<Link to="/leaderboard" className="inline-flex items-center gap-1 hover:text-[var(--heat-hi)]"><IconArrowLeft size={14} /><Text value="返回模型前沿" /></Link>}
        title={tx("大模型 API 价格对比 2026：全部模型")}
        description={tx("{0} 个模型的 API 价格，统一换算为美元 / 每百万 Token。", rows.length)}
      />
      <section className="mt-6 max-w-[720px] space-y-2 text-[13.5px] leading-relaxed text-ink-3">
        <p><Text value="价格取自 OpenRouter 公开模型列表的标准按量付费价，单位为每百万 Token；输入价格按未命中缓存计算，批量接口不计入。OpenRouter 的价格有时来自第三方托管商，可能和厂商官方价不同。OpenRouter 上没有的模型保留厂商官方价，以人民币标价的按本轮汇率折算为美元。" /></p>
        <p>
          {verifiedOn ? tx("价格随模型榜每天更新四次，最近一次在 {0}，每行的核对日期见表格。", verifiedOn) : tx("价格尚未更新。")}
          {run.fx && ` ${tx("汇率：1 美元 = {0} 元（{1}，{2}）。", run.fx.rate, run.fx.sourceName, run.fx.asOf)}`}
        </p>
        <Link to="/leaderboard" className="inline-flex items-center gap-1 text-[13px] font-medium text-accent hover:text-accent-ink"><Text value="查看模型榜排名" /><IconArrowRight size={13} /></Link>
      </section>

      <section className="mt-10">
        <h2 className="text-[17px] font-bold text-ink"><Text value="全部模型价格" /></h2>
        <p className="mt-1 text-[12.5px] text-ink-4"><Text value="美元 / 每百万 Token" /></p>
        <PriceTable rows={rows} />
      </section>

      <Calculator rows={rows} />
    </div>
  );
}
