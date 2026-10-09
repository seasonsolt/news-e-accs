import { localeFromMatches, Text, useTranslate } from "../lib/i18n";
import { SITE, withSubject } from "@aihot/industry/site";
import { data as withHeaders, Link, redirect, useLoaderData, useRouteLoaderData } from "react-router";
import type { Route } from "./+types/home";
import type { TimelineResponse } from "@aihot/contracts/site";
import { isCategoryKey, isChannelKey } from "@aihot/contracts/taxonomy";
import { loadOr404, queryString, releaseBoundCache } from "../lib/api.server";
import { listPath, organizationLd, pageMeta, websiteLd } from "../lib/seo";
import { Deck } from "../components/shell/Deck";
import { KardashevMeter } from "../features/chrono/KardashevMeter";
import type { loader as rootLoader } from "../root";
import { Onboarding } from "../features/onboarding/Onboarding";
import { CategoryBanner } from "../features/art/CategoryBanner";
import { Timeline } from "../features/feed/Timeline";
import { HotTopics } from "../features/feed/HotTopics";
import { CategoryTabs, SearchField, SearchIconLink } from "../features/feed/Filters";
import { beijingDate, beijingWeekday } from "../lib/format";
import { requestAt } from "../features/chrono/at";

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const q = url.searchParams.get("q");
  // Search lives on /all; keep the parameters so old links still land on results.
  if (q && q.trim()) throw redirect(`/all${url.search}`);
  const channelParam = url.searchParams.get("channel") ?? "all";
  const categoryParam = url.searchParams.get("category");
  const channel = isChannelKey(channelParam) ? channelParam : "all";
  const category = categoryParam && isCategoryKey(categoryParam) ? categoryParam : null;
  const tag = url.searchParams.get("tag")?.trim() || null;
  const at = requestAt(request);
  const upstream = new Headers();
  const data = await loadOr404<TimelineResponse>(`/api/site/timeline${queryString({ channel: channel === "all" ? null : channel, category, tag, at })}`, { responseHeaders: upstream, request, signal: request.signal });
  return withHeaders({ data, filters: { channel, category, tag, topic: null, at } }, { headers: releaseBoundCache(data.refreshAt, 60, Date.now(), upstream) });
}

export function meta({ matches, loaderData }: Route.MetaArgs) {
  const f = loaderData?.filters;
  // A time-machine slice stands for the live page, which is the one to index.
  const path = listPath("/", { channel: f && f.channel !== "all" ? f.channel : null, category: f?.category, tag: f?.tag });
  return pageMeta({ path, jsonLd: path === "/" && !f?.at ? [websiteLd(), organizationLd()] : undefined, noindex: !!f?.at }, localeFromMatches(matches ?? []));
}

export function headers({ loaderHeaders }: Route.HeadersArgs) {
  return loaderHeaders;
}

/** The day the page shows (the time machine's, else today), in the deck's kicker. */
function TodayLabel({ at }: { at?: string | null }) {
  const tx = useTranslate();
  const day = at ?? beijingDate(Date.now());
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  return (
    <span suppressHydrationWarning>
      {y}.{String(m).padStart(2, "0")}.{String(d).padStart(2, "0")} · {tx(beijingWeekday(day)).replace("星期", "周")}
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
          </div>
        </Deck>
      )}

      <div className="mt-6 hidden items-center justify-between gap-4 lg:mt-8 lg:flex">
        <CategoryTabs base="/" category={filters.category} channel={filters.channel} layoutId="home-cat-desk" className="min-w-0" />
        <SearchField variant="track" keep={{ category: filters.category }} />
      </div>

      <div className="mt-6">{data.hot && <HotTopics entries={data.hot} />}</div>

      <h2 className="mt-6 font-display text-[28px] italic text-ink lg:hidden">{filters.tag ? `#${filters.tag}` : tx("最新精选")}</h2>
      <div className="-mx-4 mt-3 flex items-center gap-2 pl-4 pr-2 lg:hidden">
        <CategoryTabs base="/" category={filters.category} channel={filters.channel} layoutId="home-cat-mobile" size="sm" className="min-w-0 flex-1" />
        <SearchIconLink />
      </div>

      <CategoryBanner category={filters.category} channel={filters.channel} />
      <Timeline initial={data} filters={data.filters} />
    </div>
  );
}
