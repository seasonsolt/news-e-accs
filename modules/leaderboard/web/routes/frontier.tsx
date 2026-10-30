import { Link } from "@aihot/web/lib/navigation";
import { localeFromMatches, Text, useTranslate } from "@aihot/web/lib/i18n";
import { FEATURES } from "@aihot/industry/features";
import { useLoaderData, useRouteLoaderData } from "react-router";
import type { MetaArgs } from "react-router";
import type { loader as rootLoader } from "@aihot/web/root";
import type { LbBoardResponse } from "@aihot/leaderboard/contracts";
import { apiGet } from "@aihot/web/lib/api.server";
import { pageMeta } from "@aihot/web/lib/seo";
import { Deck } from "@aihot/web/components/shell/Deck";
import { IconArrowRight } from "@aihot/web/components/icons";
import { webModules } from "@aihot/web/site-modules";
import { modelHref } from "../features/format";
import type { ReactNode } from "react";

// The frontier: one page for where capability stands, the leaderboard, model prices and, when the site
// runs the indices module, the cost of intelligence. Each card leads to its own page; a summary that
// cannot be read leaves its card with the words alone.

/** What the hub reads of the indices module's answer (modules/indices/contracts.ts). */
interface CostSummary { asOf: string; modelCount: number }

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
  return { top: board?.entries.slice(0, 3) ?? [], cost: cost && { asOf: cost.asOf, modelCount: cost.modelCount }, indices };
}

export function meta({ matches }: MetaArgs<typeof loader>) {
  return pageMeta({
    title: "前沿",
    description: "能力曲线此刻在哪：大模型共识排名、API 价格对比，以及固定能力的价格下降速度。",
    path: "/frontier",
  }, localeFromMatches(matches ?? []));
}

function Card({ to, kicker, title, children, more }: { to: string; kicker: string; title: ReactNode; children: ReactNode; more: string }) {
  return (
    <Link to={to} prefetch="intent" className="card group flex min-h-[220px] flex-col gap-3 p-6 transition-colors hover:border-[color:var(--brass)]">
      <span className="text-[11.5px] uppercase tracking-[0.12em] text-ink-4">{kicker}</span>
      <span className="font-display text-[30px] leading-tight text-ink">{title}</span>
      <div className="flex-1 text-[14.5px] leading-relaxed text-ink-3">{children}</div>
      <span className="inline-flex items-center gap-1 text-[14px] text-accent">{more}<IconArrowRight size={14} /></span>
    </Link>
  );
}

export default function Frontier() {
  const tx = useTranslate();
  const { top, cost, indices } = useLoaderData<typeof loader>();
  const kardashev = useRouteLoaderData<typeof rootLoader>("root")?.timeBounds?.kardashev ?? null;
  return (
    <div className="pb-10">
      <Deck art="cat-models" label={tx("前沿")} title={tx("能力曲线，此刻在哪")}
        description={tx("最强的模型、它们的价格，以及同样的能力变便宜得有多快。")} />
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <Card to="/leaderboard" kicker={tx("模型")} title={tx("模型榜")} more={tx("按能力分类看")}>
          {top.length ? (
            <ol className="space-y-1.5">
              {top.map((e) => (
                <li key={e.model.slug} className="flex items-baseline justify-between gap-3">
                  <span className="truncate"><span className="num text-ink-4">{e.rank}</span> · {e.model.name}</span>
                  <span className="num shrink-0 text-ink-2">{e.score.toFixed(1)}</span>
                </li>
              ))}
            </ol>
          ) : <Text value="汇总多家公开评测的共识排名。" />}
        </Card>
        <Card to="/pricing" kicker={tx("价格")} title={tx("模型价格")} more={tx("对比两个模型")}>
          <Text value="每百万 Token 的输入、输出与缓存价格并排比较，附调用成本计算器。" />
        </Card>
        {indices && (
          <Card to="/index/cost-of-intelligence" kicker={tx("指数")} title={tx("智能成本")} more={tx("看价格怎么降")}>
            <p><Text value="固定一档能力，看它的价格随时间怎么下降。" /></p>
            {cost && <p className="mt-2 text-[13px] text-ink-4">{tx("{0} 个模型 · 截至 {1}", cost.modelCount, cost.asOf)}</p>}
          </Card>
        )}
        {FEATURES.timeMachine && kardashev !== null && (
          <Card to="/chronicle" kicker={tx("文明")} title={<span className="font-mono">K = {kardashev.toFixed(3)}</span>} more={tx("在加速史里看")}>
            <Text value="人类一次能源功率在卡尔达肖夫指数上的位置，I 型文明为 1。" />
          </Card>
        )}
      </div>
      {top.length > 0 && <p className="mt-4 text-[12.5px] text-ink-4"><Text value="模型榜的分数是共识指数，不是正确率。" /> <Link to={modelHref(top[0]!.model.slug)} className="underline-offset-2 hover:underline">{tx("看第一名的评测证据")}</Link></p>}
    </div>
  );
}
