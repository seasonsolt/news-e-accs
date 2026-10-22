import { localePath, publicPath, requestLocale } from "../lib/locale";
import { Link } from "../lib/navigation";
import { localeFromMatches, Text, translate, useTranslate } from "../lib/i18n";
import { SITE, subjectAfter } from "@aihot/site";
import { redirect, useLoaderData, useNavigation, useSearchParams } from "react-router";
import type { Route } from "./+types/all";
import type { PoolResponse } from "@aihot/contracts/site";
import { beijingTime } from "@aihot/contracts/time";
import { cachedPage, loadOr404 } from "../lib/api.server";
import { pageReuse } from "../lib/page-reuse";
import { filterParams, hasFeedFilters, itemListLd, listPath, pageMeta, readFilters } from "../lib/seo";
import { CategoryTabs, FeedSwitch, SearchField } from "../features/feed/Filters";
import { AmbientBackdrop } from "../features/art/AmbientBackdrop";
import { CategoryBanner } from "../features/art/CategoryBanner";
import { PillTabs } from "../components/ui/Tabs";
import { DayList, Pagination } from "../features/feed/DayList";
import { EmptyState } from "../components/ui/Page";
import { Deck } from "../components/shell/Deck";
import { FeedDeck } from "../features/feed/FeedDeck";
import { HotTopics } from "../features/feed/HotTopics";
import { inNav } from "../components/shell/nav";

export { pageHeaders as headers } from "../lib/api.server";
export const { clientLoader, shouldRevalidate } = pageReuse<typeof loader>();

const ALL_TITLE = subjectAfter("全部", "动态");

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim().slice(0, 200) || null;
  const tab = url.searchParams.get("tab") === "relevance" ? "relevance" : null;
  // Older deep-paging parameters (deep, anchorAt) still open a normal page.
  const page = Math.min(Math.max(Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1, 1), 50);
  const data = await loadOr404<PoolResponse>(
    listPath("/api/site/pool", { ...filterParams(readFilters(url.searchParams)), q, tab, page: page > 1 ? page : null }),
    // The busy page keeps the search, so it can be tried again as it was.
    { request, signal: request.signal, busyRedirect: `/all/search-busy${url.search}` },
  );
  // Past the last page of what there is: the last page, with the same search and filters.
  if (data.total > 0 && data.page > data.pageCount) throw redirect(localePath(pageHref(url.searchParams, data.pageCount), requestLocale(request)));
  return cachedPage(60, { data });
}

export function meta({ matches, loaderData }: Route.MetaArgs) {
  const f = loaderData?.data.filters;
  const q = f?.q;
  const page = loaderData?.data.page ?? 1;
  const path = listPath("/all", { ...(f && filterParams(f)), q, tab: q && f?.tab === "relevance" ? "relevance" : null, page: page > 1 ? page : null });
  const title = `${q ? `搜索：${q}` : ALL_TITLE}${page > 1 ? ` · 第 ${page} 页` : ""}`;
  const noindex = !!q || hasFeedFilters(f);
  const locale = localeFromMatches(matches ?? []);
  return pageMeta({
    title,
    description: `${SITE.name} 收录的${subjectAfter("全部", "相关动态")}，可按频道、类别与标签筛选，支持中英文搜索。`,
    path,
    noindex,
    jsonLd: noindex ? undefined : itemListLd(path, translate(locale, title), loaderData?.data.items.map((i) => i.title) ?? []),
  }, locale);
}

function pageHref(params: URLSearchParams, page: number) {
  const sp = new URLSearchParams(params);
  sp.delete("deep");
  sp.delete("anchorAt");
  sp.delete("search");
  if (page <= 1) sp.delete("page");
  else sp.set("page", String(page));
  const s = sp.toString();
  return s ? `/all?${s}` : "/all";
}

export default function AllPage() {
  const tx = useTranslate();
  const { data } = useLoaderData<typeof loader>();
  const [params] = useSearchParams();
  const navigation = useNavigation();
  const f = data.filters;
  const busy = navigation.state === "loading" && navigation.location && publicPath(navigation.location.pathname) === "/all";
  const { channel, category } = filterParams(f);
  const keep = { channel, category };
  const searchTabHref = (tab: "time" | "relevance") => {
    const sp = new URLSearchParams(params);
    sp.delete("page");
    if (tab === "relevance") sp.set("tab", "relevance");
    else sp.delete("tab");
    return `/all?${sp}`;
  };
  const title = f.q ? tx("搜索“{0}”", f.q) : f.tag ? `#${tx(f.tag)}` : null;
  const updated = beijingTime(data.freshness);

  return (
    <div className={`pb-6 ${f.q ? "" : "home-page"}`}>
      {f.q ? (
        <Deck compact art="ambient-engine-room" label={tx("全部动态")} kicker={tx("搜索")} title={title ?? tx("全部 AI 动态")} />
      ) : (
        <FeedDeck label={tx("全部动态")} heading={tx(ALL_TITLE)} tag={f.tag} filtered={!!(f.tag || f.category || f.channel !== "all")} />
      )}
      {/* Desktop, as on 精选: one filter row with the search field aligned on the right, then the hot strip. */}
      <div className="hidden lg:block">
        <div className="mb-5 mt-6 flex items-center justify-between gap-4 lg:mt-8">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <FeedSwitch base="/all" layoutId="all-feed-desk" />
            <CategoryTabs base="/all" category={f.category} channel={f.channel} layoutId="all-cat-desk" className="min-w-0" />
          </div>
          <SearchField variant="track" defaultValue={f.q ?? ""} keep={keep} />
        </div>
      </div>

      {/* Phones: title with today's count, the search bar, then the same filter row as 精选. */}
      <div className="lg:hidden">
        <div className="h-4" />
        <SearchField variant="bar" defaultValue={f.q ?? ""} keep={keep} autoFocus={params.get("search") === "1"} />
        <div className="-mx-4 mt-3 flex items-center gap-2 border-b border-line-soft px-4 pb-3">
          <FeedSwitch base="/all" layoutId="all-feed-mobile" />
          <CategoryTabs base="/all" category={f.category} channel={f.channel} layoutId="all-cat-mobile" size="sm" className="min-w-0 flex-1" />
        </div>
      </div>

      {data.hot && inNav("/hot") && <div className="mb-6"><HotTopics entries={data.hot} /></div>}

      {f.q && (
        <div className="mb-3 mt-3 flex flex-wrap items-center justify-between gap-2 lg:mt-0">
          <PillTabs
            size="xs"
            layoutId="all-search-sort"
            label={tx("搜索排序")}
            active={f.tab}
            items={(["time", "relevance"] as const).map((t) => ({ key: t, label: t === "time" ? tx("最新（标题与摘要）") : tx("全文相关"), to: searchTabHref(t) }))}
          />
          <span className="text-[12px] text-ink-4"><Text value="找到" /><span className="num">{data.total >= 2000 ? "2000+" : data.total}</span><Text value="条 · 更新于" /><span className="num">{updated}</span>
          </span>
        </div>
      )}

      {!f.q && <CategoryBanner category={f.category} channel={f.channel} />}
      <div className={`transition-opacity duration-200 ${busy ? "opacity-50" : ""}`}>
        {data.items.length === 0 ? (
          <div className="mt-2 lg:card">
            <EmptyState
              title={tx("没有找到相关内容")}
              action={
                f.q && f.tab === "time" ? (
                  <Link to={searchTabHref("relevance")} className="text-[13px] font-medium text-accent hover:underline"><Text value="试试“全文相关”，连正文一起搜" /></Link>
                ) : undefined
              }
            >
              {f.q ? tx("换个说法，或者去掉筛选再试。") : tx("这个筛选下暂时没有内容。")}
            </EmptyState>
          </div>
        ) : (
          <DayList items={data.items} todayCount={f.q ? null : data.todayCount} />
        )}
      </div>
      <Pagination page={data.page} pageCount={data.pageCount} href={(p) => pageHref(params, p)} />
      {data.page >= 50 && <p className="mt-4 text-center text-[12px] text-ink-4"><Text value="最多提供 50 页，更早的内容请使用搜索或主题页。" /></p>}
    </div>
  );
}
