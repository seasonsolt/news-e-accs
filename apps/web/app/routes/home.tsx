import { localePath, requestLocale } from "../lib/locale";
import { Link } from "../lib/navigation";
import { localeFromMatches, Text, useTranslate } from "../lib/i18n";
import { SITE } from "@aihot/site";
import { redirect, useLoaderData } from "react-router";
import type { Route } from "./+types/home";
import type { TimelineResponse } from "@aihot/contracts/site";
import type { ChronicleResponse } from "@aihot/contracts/chronicle";
import { FEATURES } from "@aihot/industry/features";
import { apiGet, cachedPage, loadOr404 } from "../lib/api.server";
import { pageReuse } from "../lib/page-reuse";
import { webModules } from "../site-modules";
import { filterParams, hasFeedFilters, listPath, organizationLd, pageMeta, readFilters, websiteLd } from "../lib/seo";
import { Deck } from "../components/shell/Deck";
import { CategoryBanner } from "../features/art/CategoryBanner";
import { Timeline } from "../features/feed/Timeline";
import { HomeHero, leadCard, TodayLabel } from "../features/feed/HomeHero";
import { chronicleNow, costReading, type CostIndex } from "@aihot/contracts/chronicle";
import { CategoryTabs, FeedSwitch, SearchField, SearchIconLink } from "../features/feed/Filters";
import { requestAt, withAt } from "../features/chrono/at";

export { pageHeaders as headers } from "../lib/api.server";
export const { clientLoader, shouldRevalidate } = pageReuse<typeof loader>();

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const q = url.searchParams.get("q");
  // Search lives on /all; keep the parameters so old links still land on results.
  if (q && q.trim()) throw redirect(localePath(`/all${url.search}`, requestLocale(request)));
  const at = requestAt(request);
  const filters = { ...readFilters(url.searchParams), topic: null, at };
  const upstream = new Headers();
  const [data, chronicle, cost] = await Promise.all([
    loadOr404<TimelineResponse>(listPath("/api/site/timeline", { ...filterParams(filters), at }), { responseHeaders: upstream, request, signal: request.signal }),
    // Like the masthead's time machine (root), the chronicle only dresses the deck: without it the deck keeps the day's lead.
    FEATURES.timeMachine ? apiGet<ChronicleResponse>("/api/site/chronicle", { request, signal: request.signal }).catch(() => null) : null,
    // Today's figure, so a past day of the time machine goes without it; like the chronicle, it can fail without the page.
    !at && webModules().some((m) => m.name === "indices") ? apiGet<CostIndex>("/api/site/indices/cost-of-intelligence", { request, signal: request.signal }).then(costReading).catch(() => null) : null,
  ]);
  return cachedPage(60, { data, filters, chronicle: chronicle && chronicleNow(chronicle, at), cost }, upstream);
}

export function meta({ matches, loaderData }: Route.MetaArgs) {
  const f = loaderData?.filters;
  // A time-machine slice stands for the live page, which is the one to index.
  const path = listPath("/", loaderData ? filterParams(loaderData.filters) : {});
  return pageMeta({ path, jsonLd: path === "/" && !f?.at ? [websiteLd(localeFromMatches(matches ?? [])), organizationLd()] : undefined, noindex: !!f?.at || hasFeedFilters(f) }, localeFromMatches(matches ?? []));
}

export default function Home() {
  const tx = useTranslate();
  const { data, filters, chronicle, cost } = useLoaderData<typeof loader>();
  // Old links and the switch from /all can still narrow the picks; those pages keep the full filter row.
  const narrowed = !!filters.tag || !!filters.category || filters.channel !== "all";
  return (
    <div className="home-page pb-6">
      {narrowed ? (
        <Deck compact art="home-intelligence" label={tx("精选")} kicker={<TodayLabel at={filters.at} />} title={filters.tag ? `#${filters.tag}` : tx("精选")} />
      ) : (
        <HomeHero label={tx("精选")} heading={tx(SITE.homeHeading)} at={filters.at} lead={leadCard(data.cards)} chronicle={chronicle} cost={cost} />
      )}

      {narrowed ? (
        <>
          <div className="mt-6 hidden items-center justify-between gap-4 lg:mt-8 lg:flex">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <FeedSwitch base="/" layoutId="home-feed-desk" />
              <CategoryTabs base="/" category={filters.category} channel={filters.channel} layoutId="home-cat-desk" className="min-w-0" />
            </div>
            <SearchField variant="track" keep={{ category: filters.category }} />
          </div>
          <h2 className="mt-6 font-display text-[28px] italic text-ink lg:hidden">{filters.tag ? `#${filters.tag}` : tx("最新精选")}</h2>
          <div className="-mx-4 mt-3 flex items-center gap-2 pl-4 pr-2 lg:hidden">
            <FeedSwitch base="/" layoutId="home-feed-mobile" />
            <CategoryTabs base="/" category={filters.category} channel={filters.channel} layoutId="home-cat-mobile" size="sm" className="min-w-0 flex-1" />
            <SearchIconLink />
          </div>
        </>
      ) : (
        <div className="mt-6 flex items-center justify-between gap-4 lg:mt-8">
          <FeedSwitch base="/" layoutId="home-feed" />
          <Link to={withAt("/all", filters.at)} prefetch="intent" className="home-browse"><Text value="搜索和分类" /> →</Link>
        </div>
      )}

      <CategoryBanner category={filters.category} channel={filters.channel} />
      <Timeline initial={data} filters={data.filters} foldReasons />
    </div>
  );
}
