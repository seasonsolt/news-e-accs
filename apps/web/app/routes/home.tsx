import { localePath, requestLocale } from "../lib/locale";
import { Link } from "../lib/navigation";
import { localeFromMatches, Text, useTranslate } from "../lib/i18n";
import { SITE } from "@aihot/site";
import { redirect, useLoaderData, useRouteLoaderData } from "react-router";
import type { Route } from "./+types/home";
import type { TimelineResponse } from "@aihot/contracts/site";
import { cachedPage, loadOr404 } from "../lib/api.server";
import { pageReuse } from "../lib/page-reuse";
import { filterParams, hasFeedFilters, listPath, organizationLd, pageMeta, readFilters, websiteLd } from "../lib/seo";
import { inNav } from "../components/shell/nav";
import { Deck } from "../components/shell/Deck";
import { KardashevMeter } from "../features/chrono/KardashevMeter";
import type { loader as rootLoader } from "../root";
import { Onboarding } from "../features/onboarding/Onboarding";
import { CategoryBanner } from "../features/art/CategoryBanner";
import { Timeline } from "../features/feed/Timeline";
import { HotTopics } from "../features/feed/HotTopics";
import { CategoryTabs, FeedSwitch, SearchField, SearchIconLink } from "../features/feed/Filters";
import { beijingDate } from "@aihot/contracts/time";
import { weekdayShort } from "../lib/format";
import { requestAt } from "../features/chrono/at";
import { webModules } from "../site-modules";

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

/** The day the page shows (the time machine's, else today), in the deck's kicker. */
function TodayLabel({ at }: { at?: string | null }) {
  const tx = useTranslate();
  const day = at ?? beijingDate(Date.now());
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  return (
    <span suppressHydrationWarning>
      {y}.{String(m).padStart(2, "0")}.{String(d).padStart(2, "0")} · {tx(weekdayShort(day))}
    </span>
  );
}

export default function Home() {
  const tx = useTranslate();
  const { data, filters } = useLoaderData<typeof loader>();
  const root = useRouteLoaderData<typeof rootLoader>("root");
  const k = root?.timeBounds?.kardashev ?? null;
  // A first visit to the unfiltered front page opens on the newsletter onboarding (shown before paint
  // by the boot script); everyone else, crawlers included, reads the news below.
  const front = filters.channel === "all" && !filters.category && !filters.tag && !filters.at;
  const filtered = !!(filters.tag || filters.category || filters.channel !== "all");
  return (
    <div className="pb-6">
      {front && <Onboarding mode="overlay" />}
      {filtered ? (
        <Deck compact art="epochs/agents" label={tx("精选")} kicker={<TodayLabel at={filters.at} />} title={filters.tag ? `#${filters.tag}` : tx("精选")} />
      ) : (
        <Deck
          art="epochs/agents"
          label={tx("精选")}
          heading={tx(SITE.homeHeading)}
          kicker={<><TodayLabel at={filters.at} /><Text value="· 智能体时代" /></>}
          title={<><Text value="宇宙在降温，" /><br /><Text value="文明在升温。" /></>}
          description={tx("站在时间之外看这一天：它在一百三十八亿年里的位置，以及刚刚推着文明往前走的那几件事。")}
          aside={k !== null && <KardashevMeter k={k} />}
        >
          <div className="flex flex-wrap gap-3">
            <Link to="/subscribe" className="deck-button is-primary"><Text value="订阅每日 08:00 日报" /></Link>
            <Link to="/chronicle" className="deck-button"><Text value="打开加速史" /></Link>
            {webModules().flatMap((m) => m.home?.links ?? []).map((l) => <Link key={l.to} to={l.to} className="deck-button"><Text value={l.label} /></Link>)}
          </div>
        </Deck>
      )}

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
      <Timeline initial={data} filters={data.filters} />
    </div>
  );
}
