import { localePath, requestLocale } from "../lib/locale";
import { Link } from "../lib/navigation";
import { localeFromMatches, Text, useTranslate } from "../lib/i18n";
import { SITE } from "@aihot/site";
import { FEATURES } from "@aihot/industry/features";
import { decimalYear, type ChronicleResponse } from "@aihot/contracts/chronicle";
import { redirect, useLoaderData, useRouteLoaderData, type ShouldRevalidateFunction } from "react-router";
import type { Route } from "./+types/home";
import type { TimelineResponse } from "@aihot/contracts/site";
import { cachedPage, loadOr404 } from "../lib/api.server";
import { pageReuse } from "../lib/page-reuse";
import { filterParams, hasFeedFilters, listPath, organizationLd, pageMeta, readFilters, websiteLd } from "../lib/seo";
import { inNav } from "../components/shell/nav";
import { Deck } from "../components/shell/Deck";
import { KardashevMeter } from "../features/chrono/KardashevMeter";
import { TimeStrip, useFrontPageTime, type TimeStripData } from "../features/chrono/TimeStrip";
import { ChronicleReadouts } from "../features/chrono/ChronicleReadouts";
import { distanceLabel, momentParam } from "../features/chrono/format";
import type { loader as rootLoader } from "../root";
import { Onboarding } from "../features/onboarding/Onboarding";
import { CategoryBanner } from "../features/art/CategoryBanner";
import { Timeline } from "../features/feed/Timeline";
import { HotTopics } from "../features/feed/HotTopics";
import { CategoryTabs, FeedSwitch, SearchField, SearchIconLink } from "../features/feed/Filters";
import { beijingDate } from "@aihot/contracts/time";
import { weekdayShort } from "../lib/format";
import { requestAt } from "../features/chrono/at";

export { pageHeaders as headers } from "../lib/api.server";
const reuse = pageReuse<typeof loader>();
export const clientLoader = reuse.clientLoader;
/** Deep time on the front page: only the needle (`t`) moves, so its readouts keep their data. */
const deepAddress = (url: URL) => url.searchParams.has("t") && !url.searchParams.has("at");
export const shouldRevalidate: ShouldRevalidateFunction = (args) =>
  args.currentUrl.pathname === args.nextUrl.pathname && deepAddress(args.currentUrl) && deepAddress(args.nextUrl) ? false : reuse.shouldRevalidate(args);

/** The band's share of the chronicle: what the axis and the readout line need, not the gauges or sources. */
function stripOf(chronicle: ChronicleResponse, now: number): TimeStripData {
  return {
    eras: chronicle.eras.map(({ id, from, title, summary, art, forecast }) => ({ id, from, title, summary: summary.slice(0, 160), art, forecast })),
    milestones: chronicle.milestones.map(({ id, t, title, detail, category, art, forecast }) => ({ id, t, title, category, art, forecast: !!forecast, ...(art && { summary: detail.slice(0, 160) }) })),
    now,
  };
}

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const q = url.searchParams.get("q");
  // Search lives on /all; keep the parameters so old links still land on results.
  if (q && q.trim()) throw redirect(localePath(`/all${url.search}`, requestLocale(request)));
  const at = requestAt(request);
  const filters = { ...readFilters(url.searchParams), topic: null, at };
  const now = decimalYear(Date.now());
  const filtered = !!(filters.tag || filters.category || filters.channel !== "all");
  // A needle before the site's records (or on the forecast side) keeps the front page and reads that moment out.
  const deepT = FEATURES.timeMachine && !at && !filtered ? momentParam(url.searchParams.get("t"), now) : null;
  const upstream = new Headers();
  if (deepT !== null) {
    const chronicle = await loadOr404<ChronicleResponse>("/api/site/chronicle", { responseHeaders: upstream, request, signal: request.signal });
    return cachedPage(60, { data: null, filters, strip: stripOf(chronicle, now), deep: { chronicle, t: deepT } }, upstream);
  }
  const [data, chronicle] = await Promise.all([
    loadOr404<TimelineResponse>(listPath("/api/site/timeline", { ...filterParams(filters), at }), { responseHeaders: upstream, request, signal: request.signal }),
    FEATURES.timeMachine ? loadOr404<ChronicleResponse>("/api/site/chronicle", { request, signal: request.signal }) : null,
  ]);
  return cachedPage(60, { data, filters, strip: chronicle ? stripOf(chronicle, now) : null, deep: null }, upstream);
}

export function meta({ matches, loaderData }: Route.MetaArgs) {
  const f = loaderData?.filters;
  // A time-machine slice stands for the live page, which is the one to index.
  const path = listPath("/", loaderData ? filterParams(loaderData.filters) : {});
  const deep = !!loaderData?.deep;
  return pageMeta({ path, jsonLd: path === "/" && !f?.at && !deep ? [websiteLd(localeFromMatches(matches ?? [])), organizationLd()] : undefined, noindex: !!f?.at || deep || hasFeedFilters(f) }, localeFromMatches(matches ?? []));
}

/** The day the page shows (the time machine's, else today), in the page's kicker. */
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
  const { data, filters, strip, deep } = useLoaderData<typeof loader>();
  const root = useRouteLoaderData<typeof rootLoader>("root");
  const k = root?.timeBounds?.kardashev ?? null;
  const bounds = root?.timeBounds ?? null;
  const time = useFrontPageTime(strip?.now ?? 0, filters.at, deep?.t ?? null, bounds);
  if (deep && strip) {
    return (
      <div className="pb-6">
        <TimeStrip chronicle={strip} at={null} bounds={bounds} t={time.t} onMove={time.move} onCommit={time.commit}>
          {({ label, title }) => (
            <>
              <p className="font-mono text-[11.5px] tracking-[0.08em] text-ink-4">{label} · {tx(distanceLabel(time.t, strip.now))}</p>
              <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
                <h2 className="font-display text-[28px] italic leading-tight text-ink">{title}</h2>
                <Link to="/" className="inline-flex h-10 items-center rounded-full border border-line px-4 text-[13px] text-ink transition-colors hover:border-ink"><Text value="回到现在" /></Link>
              </div>
            </>
          )}
        </TimeStrip>
        <ChronicleReadouts chronicle={deep.chronicle} t={time.t} now={strip.now} onCommit={time.commit} className="mt-6" />
      </div>
    );
  }
  // Only deep time comes without a feed, and it returned above.
  if (!data) return null;
  // A first visit to the unfiltered front page opens on the newsletter onboarding (shown before paint
  // by the boot script); everyone else, crawlers included, reads the news below.
  const front = filters.channel === "all" && !filters.category && !filters.tag && !filters.at;
  const filtered = !!(filters.tag || filters.category || filters.channel !== "all");
  return (
    <div className="pb-6">
      {front && <Onboarding mode="overlay" />}
      {filtered ? (
        <Deck compact art="epochs/agents" label={tx("精选")} kicker={<TodayLabel at={filters.at} />} title={filters.tag ? `#${filters.tag}` : tx("精选")} />
      ) : strip ? (
        <TimeStrip chronicle={strip} at={filters.at} bounds={bounds} t={time.t} onMove={time.move} onCommit={time.commit}>
          <p className="font-mono text-[11.5px] tracking-[0.08em] text-ink-4"><TodayLabel at={filters.at} /></p>
          <h2 className="mt-1 font-display text-[28px] italic leading-tight text-ink">{tx("最新精选")}</h2>
        </TimeStrip>
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

      <div className={`${strip && !filtered ? "mt-2" : "mt-6 lg:mt-8"} hidden items-center justify-between gap-4 lg:flex`}>
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <FeedSwitch base="/" layoutId="home-feed-desk" />
          <CategoryTabs base="/" category={filters.category} channel={filters.channel} layoutId="home-cat-desk" className="min-w-0" />
        </div>
        <SearchField variant="track" keep={{ category: filters.category }} />
      </div>

      <div className={strip && !filtered ? "mt-4 lg:mt-2 lg:[&>.hot-gauge]:mb-4" : "mt-6"}>{data.hot && inNav("/hot") && <HotTopics entries={data.hot} />}</div>

      {(!strip || filtered) && <h2 className="mt-6 font-display text-[28px] italic text-ink lg:hidden">{filters.tag ? `#${filters.tag}` : tx("最新精选")}</h2>}
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
