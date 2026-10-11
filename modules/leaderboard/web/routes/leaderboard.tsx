import { Link } from "@aihot/web/lib/navigation";
import { localeFromMatches, Text, translate, useTranslate } from "@aihot/web/lib/i18n";
import { SITE } from "@aihot/site";
import { data, useLoaderData } from "react-router";
import type { LoaderFunctionArgs, MetaArgs } from "react-router";
import type { LbBoardResponse } from "@aihot/leaderboard/contracts";
import { ApiError, apiGet, apiErrorResponse, loadOr404, queryString } from "@aihot/web/lib/api.server";
import { EmptyState } from "@aihot/web/components/ui/Page";
import { atLabel, requestAt, useAt } from "@aihot/web/features/chrono/at";
import { breadcrumbLd, pageMeta, siteUrl } from "@aihot/web/lib/seo";
import { BoardTable } from "../features/BoardTable";
import { Podium } from "../features/Podium";
import { IconInfo } from "@aihot/web/components/icons";
import { modelHref, shortStamp } from "../features/format";
import { useEntrance } from "@aihot/web/lib/hydration";
import { useState } from "react";

const CATEGORY_KEYS = new Set(["coding", "reasoning", "knowledge", "professional"]);

export async function loader({ params, request }: LoaderFunctionArgs) {
  const key = params.key ?? "overall";
  if (params.key !== undefined && !CATEGORY_KEYS.has(params.key)) throw data({ message: "not_found" }, { status: 404 });
  const at = requestAt(request);
  if (!at) return { at, board: await loadOr404<LbBoardResponse>(`/api/site/leaderboard/boards/${key}`, { request, signal: request.signal }) };
  try {
    return { at, board: await apiGet<LbBoardResponse>(`/api/site/leaderboard/boards/${key}${queryString({ at })}`, { request, signal: request.signal }) };
  } catch (error) {
    // The time machine went back before the first ranking run.
    if (!request.signal.aborted && error instanceof ApiError && error.status === 404) return { at, board: null };
    throw apiErrorResponse(error, { request, signal: request.signal });
  }
}

export function meta({ matches, loaderData }: MetaArgs<typeof loader>) {
  const locale = localeFromMatches(matches ?? []);
  const tx = (message: string, ...values: unknown[]) => translate(locale, message, ...values);
  if (!loaderData?.board) return pageMeta({ title: loaderData ? "模型榜" : "页面不存在", path: "/leaderboard", noindex: true }, locale);
  const { board, entries } = loaderData.board;
  const path = board.key === "overall" ? "/leaderboard" : `/leaderboard/category/${board.key}`;
  return pageMeta({
    noindex: !!loaderData.at,
    title: board.title,
    rawTitle: true,
    description: board.key === "overall" ? tx("汇总多家公开模型评测榜单，给出{0} 共识分、评测完整度、上线日期与 API 参考价格。", SITE.name) : board.description,
    path,
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "ItemList",
        name: board.key === "overall" ? tx("{0} 大模型综合榜", SITE.name) : tx("{0} {1}模型榜", SITE.name, board.name),
        itemListOrder: "https://schema.org/ItemListOrderAscending",
        numberOfItems: entries.length,
        itemListElement: entries.map((e) => ({ "@type": "ListItem", position: e.rank, name: e.model.name, url: `${siteUrl()}${modelHref(e.model.slug)}` })),
      },
      breadcrumbLd(
        board.key === "overall"
          ? [{ name: tx("模型榜"), path: "/leaderboard" }]
          : [{ name: tx("模型榜"), path: "/leaderboard" }, { name: tx("{0}榜", board.name), path }],
      ),
    ],
  }, locale);
}

export function headers() {
  return { "Cache-Control": "public, max-age=0, s-maxage=600, stale-while-revalidate=600" };
}

export default function LeaderboardPage() {
  const tx = useTranslate();
  const { board: loaded, at } = useLoaderData<typeof loader>();
  if (!loaded) {
    return (
      <div className="card mt-3">
        <EmptyState title={tx("这一天还没有模型榜")}>{at ? tx("{0}之前，本站还没有算出第一份共识排名。", atLabel(at)) : null}<Text value="往后拨几天再看。" /></EmptyState>
      </div>
    );
  }
  return <Board data={loaded} />;
}

function Board({ data: { board, entries, run } }: { data: LbBoardResponse }) {
  const tx = useTranslate();
  const at = useAt();
  const entrance = useEntrance();
  // Router reuses this route component across board URLs; the keyed subtree alone cannot detect
  // that switch. Carry the switch flag through the render so returning to the initial board works.
  const [view, setView] = useState({ board: board.key, switched: entrance });
  const viewSwitch = view.switched || view.board !== board.key;
  if (view.board !== board.key) setView({ board: board.key, switched: true });
  return (
    <div key={board.key} className={entrance ? "animate-fade-up" : undefined}>
      <div className="mt-3 flex flex-col gap-1 lg:flex-row lg:items-center lg:justify-between">
        <p className="text-[13.5px] text-ink-2">{board.description}</p>
        <p className="num text-[12px] text-ink-4">
          {board.sourceCount}<Text value="项评测" /><span className="mx-2">·</span>
          {board.operatorCount}<Text value="家机构" /><span className="mx-2">·</span>
          {tx(shortStamp(run.generatedAt))}<Text value="更新" /></p>
      </div>

      <Podium entries={entries} board={board.key} />

      <section className="card mt-3 overflow-hidden" aria-labelledby="lb-board-title">
        <div className="flex items-center justify-between gap-3 px-4 py-3 lg:px-[22px]">
          <h2 id="lb-board-title" className="text-[16px] font-bold text-ink">
            {board.key === "overall" ? tx("综合榜") : tx("{0}榜", board.name)}
            <span className="mono ml-2 text-[11px] font-normal tracking-wide text-ink-4">TOP {entries.length}</span>
          </h2>
          <span className="text-right text-[12px] text-ink-4"><Text value="按多项公开评测的共同证据排名" /></span>
        </div>
        <BoardTable entries={entries} board={board.key} viewSwitch={viewSwitch} />
        <div className="border-t border-line px-4 py-3 text-[12px] leading-relaxed text-ink-4 lg:px-[22px]">
          <p><Text value="每个榜单最多展示 30 个模型" /></p>
          <p><Text value="共识指数不是正确率；同分仍按共同证据确定的名次展示。" /></p>
        </div>
      </section>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <section className="card p-5">
          <h2 className="flex items-center gap-1.5 text-[14px] font-semibold text-ink">
            <IconInfo size={16} className="text-accent" /><Text value="如何看这张榜" /></h2>
          <p className="mt-2 text-[13px] leading-relaxed text-ink-3">{board.howToRead}<Text value="价格不参与排名，缺测不记零分，指数不是正确率。" /></p>
          <Link to="/leaderboard/rules" className="mt-2.5 inline-flex items-center gap-1 text-[12.5px] font-medium text-accent hover:text-accent-ink"><Text value="了解计算方法 →" /></Link>
        </section>
        <section className="card p-5">
          <h2 className="text-[14px] font-semibold text-ink"><Text value="关于价格" /></h2>
          <p className="mt-2 text-[13px] leading-relaxed text-ink-3"><Text value="API 价格来自厂商官网，按每百万 Token 展示。" />{at && tx("价格为当前价，不是历史快照。")}{run.fx ? tx("美元报价按 {0} 汇率折算成人民币。", run.fx.asOf) : ""}<Text value="缓存价格指命中后的输入价格，缓存写入、存储及订阅费用另计。" /></p>
        </section>
      </div>
    </div>
  );
}
