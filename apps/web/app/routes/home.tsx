import { localePath, requestLocale } from "../lib/locale";
import { Link } from "../lib/navigation";
import { localeFromMatches, Text, useTranslate } from "../lib/i18n";
import { SITE } from "@aihot/site";
import { redirect, useLoaderData } from "react-router";
import type { Route } from "./+types/home";
import type { ReportDetail, ReportIndexResponse, TimelineResponse } from "@aihot/contracts/site";
import { beijingDate } from "@aihot/contracts/time";
import { dailyEventCount } from "../features/report/format";
import type { ChronicleResponse } from "@aihot/contracts/chronicle";
import { FEATURES } from "@aihot/industry/features";
import { apiGet, cachedPage, loadOr404 } from "../lib/api.server";
import { pageReuse } from "../lib/page-reuse";
import { webModules } from "../site-modules";
import { filterParams, hasFeedFilters, listPath, organizationLd, pageMeta, readFilters, websiteLd } from "../lib/seo";
import { Deck } from "../components/shell/Deck";
import { CategoryBanner } from "../features/art/CategoryBanner";
import { Timeline } from "../features/feed/Timeline";
import { HomeHero, leadCard, TodayLabel, type HomeDaily } from "../features/feed/HomeHero";
import { chronicleNow, costReading, type CostIndex } from "@aihot/contracts/chronicle";
import { CategoryTabs, FeedSwitch, SearchField, SearchIconLink } from "../features/feed/Filters";
import { requestAt, withAt } from "../features/chrono/at";

export { pageHeaders as headers } from "../lib/api.server";

/** What the front page reads of the essays module's list (modules/essays/contracts.ts PublicEssayList). */
interface EssayCard { slug: string; path: string; title: string; dek: string; cover: { src: string; width: number; height: number; alt: string }; publishedAt: string }
export const { clientLoader, shouldRevalidate } = pageReuse<typeof loader>();

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const q = url.searchParams.get("q");
  // Search lives on /all; keep the parameters so old links still land on results.
  if (q && q.trim()) throw redirect(localePath(`/all${url.search}`, requestLocale(request)));
  const at = requestAt(request);
  const filters = { ...readFilters(url.searchParams), topic: null, at };
  const upstream = new Headers();
  const [data, chronicle, cost, essays, daily] = await Promise.all([
    loadOr404<TimelineResponse>(listPath("/api/site/timeline", { ...filterParams(filters), at }), { responseHeaders: upstream, request, signal: request.signal }),
    // Like the masthead's time machine (root), the chronicle only dresses the deck: without it the deck keeps the day's lead.
    FEATURES.timeMachine ? apiGet<ChronicleResponse>("/api/site/chronicle", { request, signal: request.signal }).catch(() => null) : null,
    // Today's figure, so a past day of the time machine goes without it; like the chronicle, it can fail without the page.
    !at && webModules().some((m) => m.name === "indices") ? apiGet<CostIndex>("/api/site/indices/cost-of-intelligence", { request, signal: request.signal }).then(costReading).catch(() => null) : null,
    // The latest signed essays, today only (the time machine shows the site as it was); the page stands without them.
    !at && webModules().some((m) => m.name === "essays")
      ? apiGet<{ essays: EssayCard[] }>("/api/site/essays", { request, signal: request.signal }).then((r) => r.essays.slice(0, 3).map(({ slug, path, title, dek, cover, publishedAt }) => ({ slug, path, title, dek, cover, publishedAt }))).catch(() => null)
      : null,
    // The deck's lead is the daily's, so the front page and the issue agree on it; without one it falls back to the picks.
    // A narrowed page has the compact deck, with no lead.
    hasFeedFilters(filters) ? null : latestDaily(request, at).catch(() => null),
  ]);
  return cachedPage(60, { data, filters, day: at ?? beijingDate(Date.now()), chronicle: chronicle && chronicleNow(chronicle, at), cost, essays, daily }, upstream);
}

/** The issue a reader had on the page's day (the time machine's, else the latest), as the deck names it. */
async function latestDaily(request: Request, at: string | null): Promise<HomeDaily | null> {
  const init = { request, signal: request.signal };
  const key = at
    ? (await apiGet<{ key: string | null }>(`/api/site/reports/daily/at/${at}`, init)).key
    : (await apiGet<ReportIndexResponse>("/api/site/reports/daily", init)).items[0]?.key ?? null;
  if (!key) return null;
  const report = await apiGet<ReportDetail>(`/api/site/reports/daily/${key}`, init);
  // An issue without a lead (a quiet day) has no headline to put there.
  if (!report.lead) return null;
  return { key, title: report.lead.title, count: dailyEventCount(report), today: key === (at ?? beijingDate(Date.now())) };
}

export function meta({ matches, loaderData }: Route.MetaArgs) {
  const f = loaderData?.filters;
  // A time-machine slice stands for the live page, which is the one to index.
  const path = listPath("/", loaderData ? filterParams(loaderData.filters) : {});
  const live = path === "/" && !f?.at;
  const tags = pageMeta({ path, jsonLd: live ? [websiteLd(localeFromMatches(matches ?? [])), organizationLd()] : undefined, noindex: !!f?.at || hasFeedFilters(f) }, localeFromMatches(matches ?? []));
  // Webmaster platforms look for their verification tag on the home page only.
  if (!live) return tags;
  return [...tags, ...Object.entries(SITE.siteVerification).map(([name, content]) => ({ name, content }))];
}

export default function Home() {
  const tx = useTranslate();
  const { data, filters, day, chronicle, cost, essays, daily } = useLoaderData<typeof loader>();
  // Old links and the switch from /all can still narrow the picks; those pages keep the full filter row.
  const narrowed = !!filters.tag || !!filters.category || filters.channel !== "all";
  return (
    <div className="home-page pb-6">
      {narrowed ? (
        <Deck compact art="home-intelligence" label={tx("精选")} kicker={<TodayLabel at={filters.at} />} title={filters.tag ? `#${filters.tag}` : tx("精选")} />
      ) : (
        <HomeHero label={tx("精选")} heading={tx(SITE.homeHeading)} day={day} at={filters.at} lead={leadCard(data.cards)} daily={daily} chronicle={chronicle} cost={cost} />
      )}

      {!narrowed && essays && essays.length > 0 && <LatestEssays essays={essays} />}

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

/** The latest signed essays, one compact card each (the newest only on phones), between the hero and the picks. */
function LatestEssays({ essays }: { essays: EssayCard[] }) {
  const tx = useTranslate();
  return (
    <section className="mt-6 lg:mt-8" aria-labelledby="home-essays-title">
      <div className="flex items-baseline justify-between gap-4">
        <h2 id="home-essays-title" className="font-mono text-[12px] uppercase tracking-[0.14em] text-[color:var(--brass)]">{tx("最新长文")}</h2>
        <Link to="/essays" prefetch="intent" className="home-browse">{tx("全部长文")} →</Link>
      </div>
      <ul className={`mt-2 grid gap-3 ${essays.length > 1 ? "lg:grid-cols-3" : ""}`}>
        {essays.map((e, i) => (
          // Phones show the newest only, so the picks stay near the top.
          <li key={e.slug} className={i > 0 ? "max-lg:hidden" : undefined}>
            <Link to={`/essays/${e.slug}`} prefetch="intent" className="group flex items-start gap-4 rounded-card border border-line p-3 transition-colors hover:border-line-strong">
              <img src={e.cover.src} width={e.cover.width} height={e.cover.height} alt={e.cover.alt} loading="lazy" decoding="async" className="aspect-[4/3] w-[96px] shrink-0 rounded-control bg-bg-muted object-cover" />
              <span className="flex min-w-0 flex-col gap-1">
                <span className="line-clamp-2 text-[16.5px] font-semibold leading-snug text-ink group-hover:text-accent">{e.title}</span>
                <span className="line-clamp-2 text-[13.5px] leading-relaxed text-ink-3">{e.dek}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
