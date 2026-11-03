import { Link } from "@aihot/web/lib/navigation";
import { localeFromMatches, Text, translate, useTranslate } from "@aihot/web/lib/i18n";
import { SITE } from "@aihot/site";
import { useLoaderData } from "react-router";
import type { LoaderFunctionArgs, MetaArgs } from "react-router";
import type { LbSourceDetail } from "@aihot/leaderboard/contracts";
import { loadOr404 } from "@aihot/web/lib/api.server";
import { breadcrumbLd, pageMeta, siteUrl } from "@aihot/web/lib/seo";
import { BrandMark } from "@aihot/web/components/BrandMark";
import { Deck } from "@aihot/web/components/shell/Deck";
import { SaturatedChip, StatusChip } from "../features/StatusChip";
import { pct, shortStamp } from "../features/format";
import { IconArrowLeft, IconArrowUpRight, IconChevronDown } from "@aihot/web/components/icons";

export async function loader({ params, request }: LoaderFunctionArgs) {
  return loadOr404<LbSourceDetail>(`/api/site/leaderboard/sources/${encodeURIComponent(params.key!)}`, { request, signal: request.signal });
}

export function meta({ matches, loaderData }: MetaArgs<typeof loader>) {
  const locale = localeFromMatches(matches ?? []);
  const tx = (message: string, ...values: unknown[]) => translate(locale, message, ...values);
  if (!loaderData) return pageMeta({ title: "页面不存在", path: "/leaderboard/sources", noindex: true }, locale);
  const { source } = loaderData;
  const path = `/leaderboard/sources/${source.key}`;
  return pageMeta({
    title: tx("{0} 排行榜：各模型成绩", source.name),
    description: source.description,
    path,
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "Dataset",
        name: source.fullName,
        description: source.description,
        url: `${siteUrl()}${path}`,
        creator: { "@type": "Organization", name: source.operator },
        ...(source.officialUrl ? { sameAs: source.officialUrl } : {}),
      },
      breadcrumbLd([
        { name: tx("模型榜"), path: "/leaderboard" },
        { name: tx("评测来源"), path: "/leaderboard/sources" },
        { name: source.name, path },
      ]),
    ],
  }, locale);
}

export function headers() {
  return { "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=900" };
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <span className="text-[11px] text-ink-4">{label}</span>
      <span className="mono mt-2 block text-[16px] font-semibold text-ink">{children}</span>
    </div>
  );
}

export default function LeaderboardSourcePage() {
  const tx = useTranslate();
  const d = useLoaderData<typeof loader>();
  const { source } = d;
  return (
    <div className="pb-12">
      <Deck
        compact
        art="cat-models"
        label={source.fullName}
        kicker={<Link to="/leaderboard/sources" className="inline-flex items-center gap-1 hover:text-[var(--heat-hi)]"><IconArrowLeft size={14} /><Text value="评测来源" /></Link>}
        title={<span className="inline-flex items-center gap-4"><BrandMark brand={source.brand} size={44} />{source.fullName}</span>}
        description={<>{source.operator}{source.area ? ` / ${source.area}` : ""} · {source.description}</>}
        aside={source.officialUrl && (
          <a href={source.officialUrl} target="_blank" rel="noopener noreferrer" className="deck-button"><Text value="官方评测" /><IconArrowUpRight size={13} className="ml-1" />
          </a>
        )}
      />

      <section className="mt-6 grid grid-cols-2 gap-x-4 gap-y-5 border-y border-line py-5 lg:grid-cols-4" aria-label={tx("在 {0} 中", SITE.name)}>
        <div className="min-w-0">
          <span className="text-[11px] text-ink-4"><Text value="在" />{SITE.name}<Text value="中" /></span>
          <span className="mt-1.5 block">
            <span className="flex flex-wrap items-center gap-1.5">
              <StatusChip status={source.status} large />
              {source.saturated && <SaturatedChip spreadPp={source.spreadPp} large />}
            </span>
          </span>
        </div>
        <Stat label={tx("证据预算")}>
          {source.budget === null ? (
            <span className="font-sans text-[14px] font-normal text-ink-3"><Text value="不计分" /></span>
          ) : source.saturated ? (
            <>
              {pct(source.effectiveBudget ?? source.budget)}
              <span className="ml-1.5 font-sans text-[12px] font-normal text-ink-4"><Text value="（接近饱和，原" />{pct(source.budget)}<Text value="）" /></span>
            </>
          ) : (
            pct(source.budget)
          )}
        </Stat>
        <Stat label={tx("上游数据时间")}>{d.collected ? tx(shortStamp(d.upstreamAt)) : <span className="font-sans text-[14px] font-normal text-ink-3"><Text value="待核实" /></span>}</Stat>
        <Stat label={tx("最近成功同步")}>
          {d.collected ? tx(shortStamp(d.syncedAt)) : <span className="font-sans text-[14px] font-normal text-ink-3">{source.status === "awaiting" ? tx("等待可比成绩") : tx("尚未开始采集")}</span>}
        </Stat>
      </section>

      <section className="mt-6 grid gap-6 md:grid-cols-2 md:gap-10">
        <div>
          <h2 className="text-[14px] font-semibold text-ink"><Text value="它测什么，怎么测" /></h2>
          <p className="mt-2 text-[13px] leading-[1.8] text-ink-3">{source.what}</p>
        </div>
        <div>
          <h2 className="text-[14px] font-semibold text-ink"><Text value="如何使用这份证据" /></h2>
          <p className="mt-2 text-[13px] leading-[1.8] text-ink-3">{source.usage}</p>
        </div>
      </section>

      {d.collected && d.rows.length > 0 && (
        <section className="mt-10">
          <h2 className="text-[18px] font-bold text-ink"><Text value="评测成绩" /></h2>
          {d.rowsNote && <p className="mt-1 text-[12.5px] text-ink-3">{d.rowsNote}</p>}
          <div className="card mt-4 overflow-x-auto">
            <table className="w-full min-w-[560px] text-[13.5px]">
              <thead className="bg-[rgba(28,39,51,0.04)] text-[12px] text-ink-4 dark:bg-white/[0.03]">
                <tr className="border-b border-line">
                  <th scope="col" className="w-24 whitespace-nowrap px-4 py-2.5 text-left font-medium lg:px-[22px]"><Text value="原榜名次" /></th>
                  <th scope="col" className="px-3 py-2.5 text-left font-medium"><Text value="原榜型号" /></th>
                  <th scope="col" className="px-3 py-2.5 text-left font-medium"><Text value="原始成绩" /></th>
                  <th scope="col" className="px-4 py-2.5 text-left font-medium lg:px-[22px]">{d.systemRows ? tx("运行配置") : tx("代表配置")}</th>
                </tr>
              </thead>
              <tbody>
                {d.rows.map((r, i) => (
                  <tr key={`${r.sourceModelName}-${i}`} className="border-b border-line last:border-0 transition-colors hover:bg-accent-softer">
                    <td className="mono px-4 py-3.5 text-[13px] text-ink-4 lg:px-[22px]">{r.sourceRank ?? "—"}</td>
                    <td className="px-3 py-3.5">
                      {r.modelSlug ? (
                        <Link to={`/leaderboard/${r.modelSlug}`} className="mono break-all text-[12.5px] font-semibold text-ink transition-colors hover:text-accent">
                          {r.sourceModelName}
                        </Link>
                      ) : (
                        <span className="mono break-all text-[12.5px] font-semibold text-ink-2">{r.sourceModelName}</span>
                      )}
                      <span className="block text-[11.5px] text-ink-4">{r.provider ?? "—"}</span>
                    </td>
                    <td className="mono px-3 py-3.5 text-[15px] font-medium text-ink">{r.display}</td>
                    <td className="px-4 py-3.5 text-[12.5px] text-ink-3 lg:px-[22px]">{r.configurationLabel ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <details className="disclosure group mt-6 border-y border-line">
        <summary className="flex items-center justify-between py-4 text-[14px] font-semibold text-ink"><Text value="评测局限与数据署名" /><IconChevronDown size={16} className="text-ink-4 transition-transform duration-200 group-open:rotate-180" />
        </summary>
        <div className="space-y-2 pb-5 text-[13px] leading-relaxed text-ink-3">
          <p>{source.limits}</p>
          <p>
            <span className="text-ink-4"><Text value="数据许可：" /></span>
            {source.license}
          </p>
          <p className="text-ink-4">{source.attribution}</p>
        </div>
      </details>
    </div>
  );
}
