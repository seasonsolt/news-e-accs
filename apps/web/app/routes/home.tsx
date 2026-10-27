import { localePath, requestLocale } from "../lib/locale";
import { localeFromMatches, useTranslate } from "../lib/i18n";
import { SITE } from "@aihot/site";
import { useRef } from "react";
import { redirect, useLoaderData } from "react-router";
import type { Route } from "./+types/home";
import type { TimelineResponse } from "@aihot/contracts/site";
import { cachedPage, loadOr404 } from "../lib/api.server";
import { pageReuse } from "../lib/page-reuse";
import { filterParams, hasFeedFilters, listPath, organizationLd, pageMeta, readFilters, websiteLd } from "../lib/seo";
import { inNav } from "../components/shell/nav";
import { Onboarding } from "../features/onboarding/Onboarding";
import { useSubscribeView } from "../features/subscribe/useSubscribeView";
import { CategoryBanner } from "../features/art/CategoryBanner";
import { Timeline } from "../features/feed/Timeline";
import { HotTopics } from "../features/feed/HotTopics";
import { FeedDeck, leadCard } from "../features/feed/FeedDeck";
import { CategoryTabs, FeedSwitch, SearchField, SearchIconLink } from "../features/feed/Filters";
import { requestAt } from "../features/chrono/at";

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
  const data = await loadOr404<TimelineResponse>(listPath("/api/site/timeline", { ...filterParams(filters), at }), { responseHeaders: upstream, request, signal: request.signal });
  return cachedPage(60, { data, filters }, upstream);
}

export function meta({ matches, loaderData }: Route.MetaArgs) {
  const f = loaderData?.filters;
  // A time-machine slice stands for the live page, which is the one to index.
  const path = listPath("/", loaderData ? filterParams(loaderData.filters) : {});
  return pageMeta({ path, jsonLd: path === "/" && !f?.at ? [websiteLd(localeFromMatches(matches ?? [])), organizationLd()] : undefined, noindex: !!f?.at || hasFeedFilters(f) }, localeFromMatches(matches ?? []));
}

export default function Home() {
  const tx = useTranslate();
  const subscribeLink = useRef<HTMLSpanElement>(null);
  const { data, filters } = useLoaderData<typeof loader>();
  // A first visit to the unfiltered front page opens on the newsletter onboarding (shown before paint
  // by the boot script); everyone else, crawlers included, reads the news below.
  const front = filters.channel === "all" && !filters.category && !filters.tag && !filters.at;
  useSubscribeView(subscribeLink, "home_button", front);
  return (
    <div className="home-page pb-6">
      {front && <Onboarding mode="overlay" />}
      <FeedDeck label={tx("精选")} heading={tx(SITE.homeHeading)} at={filters.at} tag={filters.tag} front lead={leadCard(data.cards)} subscribeRef={subscribeLink} />

      <div className="mt-6 hidden items-center justify-between gap-4 lg:mt-8 lg:flex">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <FeedSwitch base="/" layoutId="home-feed-desk" />
          <CategoryTabs base="/" category={filters.category} channel={filters.channel} layoutId="home-cat-desk" className="min-w-0" />
        </div>
        <SearchField variant="track" keep={{ category: filters.category }} />
      </div>

      <div className="mt-6">{data.hot && inNav("/hot") && <HotTopics entries={data.hot} />}</div>

      <h2 className="mt-6 font-display text-[28px] italic text-ink lg:hidden">{filters.tag ? `#${filters.tag}` : tx("最新精选")}</h2>
      <div className="-mx-4 mt-3 flex items-center gap-2 pl-4 pr-2 lg:hidden">
        <FeedSwitch base="/" layoutId="home-feed-mobile" />
        <CategoryTabs base="/" category={filters.category} channel={filters.channel} layoutId="home-cat-mobile" size="sm" className="min-w-0 flex-1" />
        <SearchIconLink />
      </div>

      <CategoryBanner category={filters.category} channel={filters.channel} />
      <Timeline initial={data} filters={data.filters} foldReasons />
    </div>
  );
}
