import { scrollBehavior } from "../lib/motion";
import { hasAlternateEdition } from "../lib/edition-meta.server";
import { contentHtmlLanguage } from "../lib/content-language";
import { localePath, requestLocale } from "../lib/locale";
import { Link } from "../lib/navigation";
import { ContentLanguage } from "../components/ContentLanguage";
import { localeFromMatches, translate, Text, useTranslate, useLocale } from "../lib/i18n";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { IntentLink } from "../components/ui/IntentLink";
import { useLoaderData, useLocation } from "react-router";
import type { Route } from "./+types/story";
import type { NextReads as Reads, StoryDetail, StoryReportView } from "@aihot/contracts/site";
import { SITE } from "@aihot/site";
import { apiGet, cachedPage, loadOr404 } from "../lib/api.server";
import { SubscribeCta } from "../features/subscribe/SubscribeCta";
import { NextReads } from "../components/NextReads";
import { pageReuse } from "../lib/page-reuse";
import { breadcrumbLd, clipText, organizationLd, pageMeta, storyArticleLd, storyLd, storyTimes, titled } from "../lib/seo";
import { beijingDate, beijingTime } from "@aihot/contracts/time";
import { monthDay, monthDayTime, relativeTime } from "../lib/format";
import { HeatChart } from "../features/story/HeatChart";
import { sessionCache } from "../lib/session-cache";
import { outboundLink } from "../lib/engagement";
import { isReload } from "../lib/restore";
import { Badge, SelectedBadge } from "../components/ui/Badge";
import { PillTabs } from "../components/ui/Tabs";
import { Select } from "../components/ui/Controls";
import { IconArrowLeft, IconChevronRight, IconClock, IconDoc, IconUsers } from "../components/icons";
import { inNav } from "../components/shell/nav";
import { Deck } from "../components/shell/Deck";
import { loadParts } from "../site-modules";

const STORY_PARTS = await loadParts((m) => m.storyPage);

export { pageHeaders as headers } from "../lib/api.server";
export const { clientLoader, shouldRevalidate } = pageReuse<typeof loader>();

export async function loader({ params, request }: Route.LoaderArgs) {
  const path = `/api/site/stories/${encodeURIComponent(params.publicId)}`;
  const search = new URL(request.url).search;
  // What to read next is optional: the page renders without it.
  const next = apiGet<Reads>("/api/site/next-reads", { request, signal: request.signal }).catch(() => null);
  const story = await loadOr404<StoryDetail>(path, { request, signal: request.signal, merged: (id) => localePath(`/story/${id}${search}`, requestLocale(request)) });
  const [alternateEdition, nextReads] = await Promise.all([hasAlternateEdition(path, story, request), next]);
  return cachedPage(300, { story, alternateEdition, nextReads });
}

export function meta({ matches, loaderData }: Route.MetaArgs) {
  const locale = localeFromMatches(matches ?? []);
  if (!loaderData) return [{ title: titled(translate(locale, "事件不存在")) }, { name: "robots", content: "noindex" }];
  const s = loaderData.story;
  const language = contentHtmlLanguage(s, locale);
  const overview = s.digest ?? s.summary ?? s.excerpt?.text;
  const times = storyTimes(s);
  return pageMeta({
    content: s,
    alternates: loaderData.alternateEdition,
    title: s.title,
    description: overview ? clipText(overview) : locale === "en"
      ? `${s.sourceCount} reporting sources and ${s.reportCount} reports, with the full timeline and the latest developments.`
      : `${s.sourceCount} 个报道来源 ${s.reportCount} 篇报道，完整时间线与最新进展。`,
    path: `/story/${s.publicId}`,
    image: `/og/stories/${s.publicId}.png`,
    type: "article",
    publishedTime: times.published,
    modifiedTime: times.modified,
    jsonLd: [
      storyArticleLd(s, language),
      { ...storyLd(s), ...(language ? { inLanguage: language } : {}) },
      breadcrumbLd([{ name: SITE.name, path: "/" }, { name: "热点榜", path: "/hot" }, { name: s.title, path: `/story/${s.publicId}` }]),
      organizationLd(),
    ],
  }, locale);
}

const STATUS = {
  active: { label: "持续更新", tone: "hot" },
  watching: { label: "观察中", tone: "amber" },
  settled: { label: "历史事件", tone: "neutral" },
} as const;

// Section anchors keep the old page's ids so shared links still land in the right place.
const SECTIONS = { overview: "event-overview", reports: "event-reports", heat: "event-heat" } as const;
type SectionKey = keyof typeof SECTIONS;

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** A main-column card: 17px title, 24px padding. */
function Panel({ id, title, sub, right, children, className = "" }: { id?: string; title: ReactNode; sub?: ReactNode; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section id={id} className={`card scroll-mt-[calc(var(--bar-h)+64px)] p-5 lg:p-6 ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[17px] font-[650] leading-[1.5] text-ink">{title}</h2>
          {sub && <p className="mt-0.5 text-[12.5px] text-ink-4">{sub}</p>}
        </div>
        {right && <div className="shrink-0 text-[11.5px] text-ink-4">{right}</div>}
      </div>
      <div className="mt-3.5">{children}</div>
    </section>
  );
}

/** A rail card: 14px title, 22px padding. */
function RailCard({ title, right, children, className = "" }: { title: ReactNode; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card p-5 lg:p-[22px] ${className}`}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[14px] font-[650] text-ink">{title}</h2>
        {right && <span className="num text-[11.5px] text-ink-4">{right}</span>}
      </div>
      <div className="mt-2">{children}</div>
    </section>
  );
}

/** Highlights the section nav entry whose section is under the sticky bar. */
function useActiveSection(keys: SectionKey[]): [SectionKey, (k: SectionKey) => void] {
  const [active, setActive] = useState<SectionKey>("overview");
  const clampedTarget = useRef<{ key: SectionKey; landed: boolean } | null>(null);
  useEffect(() => {
    const sections = keys.flatMap((key) => {
      const el = document.getElementById(SECTIONS[key]);
      return el ? [{ key, el }] : [];
    });
    const onScroll = () => {
      let cur: SectionKey = keys[0]!;
      // Use the same offset as anchor scrolling; fractional positions need one pixel of tolerance.
      for (const { key, el } of sections) {
        const offset = parseFloat(getComputedStyle(el).scrollMarginTop) || 0;
        if (el.getBoundingClientRect().top <= offset + 1) cur = key;
      }
      // Several short sections can share the bottom landing. A click disambiguates that landing;
      // scrolling away restores the ordinary position-based highlight.
      const bottom = window.scrollY > 0 && window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      if (bottom) {
        cur = clampedTarget.current?.key ?? keys[keys.length - 1]!;
        if (clampedTarget.current) clampedTarget.current.landed = true;
      } else if (clampedTarget.current?.landed) clampedTarget.current = null;
      setActive(cur);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    const resized = new ResizeObserver(onScroll);
    resized.observe(document.body);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      resized.disconnect();
    };
  }, [keys.join()]);
  const go = (k: SectionKey) => {
    const el = document.getElementById(SECTIONS[k]);
    if (!el) return;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const destination = window.scrollY + el.getBoundingClientRect().top - (parseFloat(getComputedStyle(el).scrollMarginTop) || 0);
    clampedTarget.current = destination >= max - 1 ? { key: k, landed: false } : null;
    setActive(k);
    el.scrollIntoView({ behavior: scrollBehavior(), block: "start" });
    history.replaceState(history.state, "", `#${SECTIONS[k]}`);
  };
  return [active, go];
}

/** The report's own address, beside the on-site reading link. */
function SourceAnchor({ name, url, title, className = "" }: { name: string; url?: string | null; title?: string; className?: string }) {
  const tx = useTranslate();
  let href: string | null = null;
  if (url) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") href = parsed.href;
    } catch {
      href = null;
    }
  }
  if (!href) return <span className={`min-w-0 truncate ${className}`}>{name}</span>;
  return (
    <a href={href} target="_blank" rel="noopener" {...outboundLink(href)} aria-label={tx("阅读{0}原文：{1}（新标签页）", name, title ?? href)} className={`min-w-0 truncate hover:text-accent ${className}`}>
      {name}
    </a>
  );
}

/** One report on the story timeline: time, source and marks, title, a summary that opens on demand. */
function TimelineRow({ r }: { r: StoryReportView }) {
  const tx = useTranslate();
  const [open, setOpen] = useState(false);
  const [clamped, setClamped] = useState(false);
  const ref = useRef<HTMLParagraphElement>(null);
  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (el && !open) setClamped(el.scrollHeight > el.clientHeight + 1);
  }, [r.summary, open]);
  return (
    <li className="grid gap-x-3 border-b border-line-soft py-4 last:border-b-0 lg:grid-cols-[48px_minmax(0,1fr)]">
      <time dateTime={r.publishedAt} className="mono text-[12px] leading-[20px] text-ink-4">
        {beijingTime(r.publishedAt)}
      </time>
      <div className="min-w-0">
        <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5 text-[12px] leading-[20px] text-ink-4 lg:mt-0">
          <SourceAnchor name={r.source.name} url={r.originalUrl} title={r.title} />
          {r.selected && <SelectedBadge />}
        </div>
        <IntentLink viewTransition to={`/items/${r.id}`} className="mt-1 block text-[16px] font-[650] leading-[1.6] text-ink transition-colors hover:text-accent lg:text-[15.5px]">
          {r.title}
        </IntentLink>
        {r.summary && (
          <>
            <p ref={ref} className={`mt-1 text-[14px] leading-[1.75] text-ink-3 ${open ? "" : "line-clamp-2"}`}>
              {r.summary}
            </p>
            {(clamped || open) && (
              <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="mt-1 text-[12.5px] text-note transition-colors hover:text-accent">
                {open ? tx("收起摘要") : tx("展开摘要")}
              </button>
            )}
          </>
        )}
      </div>
    </li>
  );
}

type Filter = "all" | "official" | "selected";
type Order = "desc" | "asc";

// The report filter and shared reading order, per history entry: back from a report restores the view.
const viewCache = sessionCache<{ savedAt: number; filter: Filter; order: Order }>("aihot:story-view:", 30 * 60 * 1000);

export default function StoryPage() {
  const tx = useTranslate();
  const locale = useLocale();
  const { story, nextReads } = useLoaderData<typeof loader>();
  const entry = useLocation().key;
  const [filter, setFilter] = useState<Filter>(() => viewCache.peek(entry)?.filter ?? "all");
  const [order, setOrder] = useState<Order>(() => viewCache.peek(entry)?.order ?? "desc");
  // A document the browser reloaded on back/forward gets the view back after hydration.
  useEffect(() => {
    if (viewCache.peek(entry) || isReload()) return;
    const saved = viewCache.read(entry);
    if (saved) {
      setFilter(saved.filter);
      setOrder(saved.order);
    }
  }, [entry]);
  useEffect(() => {
    if (filter !== "all" || order !== "desc" || viewCache.peek(entry)) viewCache.set(entry, { savedAt: Date.now(), filter, order });
  }, [entry, filter, order]);
  const status = STATUS[story.status];
  // A settled story nobody watched (history pages) has no heat to explain or chart.
  const observed = story.status !== "settled" || story.heat.length > 0 || story.whyHot.participants48h > 0 || story.whyHot.rank !== null;
  const sectionKeys: SectionKey[] = observed ? ["overview", "reports", "heat"] : ["overview", "reports"];
  const [activeSection, goSection] = useActiveSection(sectionKeys);
  const counts = {
    all: story.timeline.length,
    official: story.timeline.filter((r) => r.source.firstParty).length,
    selected: story.timeline.filter((r) => r.selected).length,
  };
  const days = useMemo(() => {
    const list = story.timeline.filter((r) => (filter === "official" ? r.source.firstParty : filter === "selected" ? r.selected : true));
    const sorted = [...list].sort((a, b) => (order === "desc" ? Date.parse(b.publishedAt) - Date.parse(a.publishedAt) : Date.parse(a.publishedAt) - Date.parse(b.publishedAt)));
    const out: Array<{ day: string; rows: StoryReportView[] }> = [];
    for (const r of sorted) {
      const d = beijingDate(r.publishedAt);
      const last = out[out.length - 1];
      if (last && last.day === d) last.rows.push(r);
      else out.push({ day: d, rows: [r] });
    }
    return out;
  }, [story.timeline, filter, order]);
  const developments = useMemo(() => [...story.developments].sort((a, b) =>
    order === "desc" ? Date.parse(b.firstReportAt) - Date.parse(a.firstReportAt) : Date.parse(a.firstReportAt) - Date.parse(b.firstReportAt)
  ), [story.developments, order]);
  const newest = story.latestReport;
  const latestSource = newest
    ? story.timeline.find((r) => r.id === newest.id)
      ?? story.officialReports.find((r) => r.id === newest.id)
      ?? story.developments.find((d) => d.representative.id === newest.id)?.representative
    : null;
  const overview = story.digest
    ? { label: tx("AI 综述"), text: story.digest, note: story.digestUpdatedAt ? tx("AI 根据报道生成 · {0}更新", tx(relativeTime(story.digestUpdatedAt))) : tx("AI 根据报道生成") }
    : story.summary
      ? { label: tx("事实说明"), text: story.summary, note: null }
      : story.excerpt
        ? { label: tx("报道摘要"), text: story.excerpt.text, note: tx("摘自 {0}", story.excerpt.sourceName) }
        : null;
  const showOfficial = () => {
    setFilter("official");
    goSection("reports");
  };

  return (
    <div className="mx-auto max-w-[var(--page-max-reading)] pb-10">
      <Deck
        compact
        label={tx("事件详情")}
        kicker={
          <nav aria-label={tx("位置")} className="flex flex-wrap items-center gap-2">
            <Link to={inNav("/hot") ? "/hot" : "/"} className="inline-flex items-center gap-1 hover:text-[var(--heat-hi)]">
              <IconArrowLeft size={14} />{tx(inNav("/hot") ? "热点榜" : "精选")}
            </Link>
            <span aria-hidden="true">·</span>
            <span><Text value="热点事件 ·" />{tx(status.label)}</span>
          </nav>
        }
        title={<span lang={contentHtmlLanguage(story, locale) ?? "und"}>{story.title}</span>}
        description={
          <span className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[13px]">
            <span className="inline-flex items-center gap-1.5">
              <IconDoc size={15} /> <b className="num font-semibold text-[var(--deck-ink)]">{story.reportCount}</b><Text value="篇报道" /></span>
            <span className="inline-flex items-center gap-1.5">
              <IconUsers size={15} /> <b className="num font-semibold text-[var(--deck-ink)]">{story.sourceCount}</b><Text value="个报道来源" /></span>
            {story.latestAt && (
              <span className="inline-flex items-center gap-1.5" suppressHydrationWarning>
                <IconClock size={15} /> {tx("{0}更新", tx(relativeTime(story.latestAt)))}</span>
            )}
          </span>
        }
      />
      <ContentLanguage content={story} />

      <div className="sticky top-[var(--bar-h)] z-20 -mx-4 mt-5 bg-bg/90 px-4 py-2 backdrop-blur-md lg:mx-0 lg:px-0">
        <PillTabs
          size="sm"
          layoutId="story-sections"
          label={tx("事件内容导航")}
          active={activeSection}
          onSelect={(k) => goSection(k as SectionKey)}
          items={[
            { key: "overview", label: tx("事件概览") },
            { key: "reports", label: tx("报道时间线"), count: story.reportCount },
            ...(observed ? [{ key: "heat", label: tx("热度走势") }] : []),
          ]}
        />
      </div>

      <div className="mt-5 grid grid-cols-[minmax(0,1fr)] items-start gap-4 lg:mt-6 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-6 2xl:grid-cols-[minmax(0,1fr)_340px]">
        {/* On phones the main column dissolves so the rail's cards can sit between its sections. */}
        <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-6">
          <Panel id={SECTIONS.overview} title={tx("先了解这件事")} right={overview?.label} className="order-1">
            {overview ? (
              <>
                <p lang={contentHtmlLanguage(story, locale) ?? "und"} className="whitespace-pre-line text-[15px] leading-[1.85] text-ink-2">{overview.text}</p>
                {overview.note && (
                  <p className="mt-2 text-[12px] text-ink-4" suppressHydrationWarning>
                    {overview.note}
                  </p>
                )}
              </>
            ) : (
              <p className="text-[13.5px] text-ink-4"><Text value="还没有综述，先看下面的报道时间线。" /></p>
            )}
            {story.latest && (
              <div className="-mx-5 mt-5 border-t border-line-soft px-5 pt-4 lg:-mx-6 lg:px-6">
                <div className="flex items-center gap-2.5 text-[12px]">
                  <span className="font-semibold text-ink"><Text value="最新进展" /></span>
                  {story.latestAt && <span className="num text-ink-4">{tx(monthDayTime(story.latestAt))}</span>}
                </div>
                {newest ? (
                  <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <Link viewTransition to={`/items/${newest.id}`} className="group inline text-[14px] leading-[1.7] text-ink-2 transition-colors hover:text-accent">
                      {story.latest}
                      <IconChevronRight size={14} className="ml-0.5 inline -translate-y-px text-ink-4 transition-transform group-hover:translate-x-0.5" />
                    </Link>
                    {latestSource && <SourceAnchor name={latestSource.source.name} url={latestSource.originalUrl} title={latestSource.title} className="text-[12.5px] text-ink-4" />}
                  </div>
                ) : (
                  <p className="mt-1.5 text-[14px] leading-[1.7] text-ink-2">{story.latest}</p>
                )}
              </div>
            )}
          </Panel>

          <NextReads reads={nextReads} currentStory={story.publicId} related={
            [...story.related].sort((a, b) => Number(b.relation === "storyline") - Number(a.relation === "storyline"))
              .map((r) => ({ to: `/story/${r.publicId}`, title: r.title, label: r.relation === "storyline" ? "沿着这条故事线读下去" : "相关事件" }))
          } className="order-2 px-1" />

          {STORY_PARTS.map(({ name, part: Block }) => story.modules?.[name] ? <div key={name} className="order-3"><Block data={story.modules[name]} /></div> : null)}

          {story.developments.length > 1 && (
            <Panel title={tx("事件进展")} sub={tx("{0} 个进展", story.developments.length)} className="order-3" right={
              <Select value={order} onChange={(e) => setOrder(e.target.value as "desc" | "asc")} aria-label={tx("事件进展排序")}>
                <option value="desc">{tx("最新在前")}</option>
                <option value="asc">{tx("最早在前")}</option>
              </Select>
            }>
              <ol className="relative space-y-4 pl-5 before:absolute before:bottom-2 before:left-[3px] before:top-2 before:w-px before:bg-line">
                {developments.map((d) => (
                  <li key={d.factId} className="relative">
                    <span className={`absolute -left-5 top-[7px] size-[7px] rounded-full ring-4 ring-surface ${d.factId === story.developments[0]?.factId ? "bg-accent" : "bg-line-strong"}`} aria-hidden="true" />
                    <div className="num text-[12px] text-ink-4">
                      {tx(monthDayTime(d.firstReportAt))} · {d.reportCount}<Text value="篇报道" />
                    </div>
                    <Link viewTransition to={`/items/${d.representative.id}`} className="mt-0.5 block text-[15px] font-semibold leading-snug text-ink transition-colors hover:text-accent">
                      {d.title}
                    </Link>
                    <div className="mt-0.5 flex min-w-0 items-baseline gap-1 truncate text-[12.5px] text-ink-4">
                      <SourceAnchor name={d.representative.source.name} url={d.representative.originalUrl} title={d.representative.title} />
                      <span className="min-w-0 truncate">：{d.representative.title}</span>
                    </div>
                  </li>
                ))}
              </ol>
            </Panel>
          )}

          <Panel
            id={SECTIONS.reports}
            title={tx("报道时间线")}
            sub={tx("沿着报道，了解事件的不同侧面。")}
            className="order-4"
            right={
              <Select value={order} onChange={(e) => setOrder(e.target.value as "desc" | "asc")} aria-label={tx("报道时间线排序")}>
                <option value="desc">{tx("最新在前")}</option>
                <option value="asc">{tx("最早在前")}</option>
              </Select>
            }
          >
            <PillTabs
              size="xs"
              layoutId="story-report-filter"
              label={tx("报道筛选")}
              active={filter}
              onSelect={(k) => setFilter(k as Filter)}
              items={[
                { key: "all", label: tx("全部报道"), count: counts.all },
                { key: "official", label: tx("官方一手"), count: counts.official },
                { key: "selected", label: tx("精选报道"), count: counts.selected },
              ]}
            />
            {days.length === 0 ? (
              <p className="py-10 text-center text-[13px] text-ink-4"><Text value="这个筛选下没有报道。" /></p>
            ) : (
              days.map(({ day, rows }) => (
                <div key={day}>
                  <div className="pb-0.5 pt-5 text-[14px] font-semibold text-ink">{tx(monthDay(day))}</div>
                  <ol>
                    {rows.map((r) => (
                      <TimelineRow key={r.id} r={r} />
                    ))}
                  </ol>
                </div>
              ))
            )}
            {story.reportCount > story.timeline.length && (
              <p className="pt-3 text-center text-[12px] text-ink-4">
                <Text value="显示最近" /> {story.timeline.length} <Text value="篇，共" /> {story.reportCount} <Text value="篇报道。" />
              </p>
            )}
          </Panel>

          <div className="order-4"><SubscribeCta source="story_inline" sticky sample={{ to: "/daily" }} /></div>

          {observed && (
            <Panel id={SECTIONS.heat} title={tx("本事件热度走势")} className="order-5">
              <HeatChart points={story.heat} />
            </Panel>
          )}


        </div>

        <aside className="order-2 flex min-w-0 flex-col gap-4 lg:order-none lg:gap-5">
          {observed && (
            <RailCard title={tx("为什么热")}>
              <p className="text-[12.5px] leading-[1.75] text-ink-3">
                <Text value="过去 48 小时，已观察到" /> <b className="num font-semibold text-ink">{story.whyHot.participants48h}</b> <Text value="个独立主体参与讨论或报道，最近 6 小时新增" />{" "}
                <b className="num font-semibold text-ink">{story.whyHot.newParticipants6h}</b> <Text value="个。" />
              </p>
              {!story.whyHot.observationComplete && <p className="mt-2 text-[12px] leading-relaxed text-ink-4"><Text value="部分信源观测不完整，以上仅为已观察到的参与。" /></p>}
              <p className="mt-2 text-[12px] text-ink-4">
                <span className="num">{story.whyHot.recentReports24h}</span> <Text value="篇近期报道" />
                {story.whyHot.rank && (
                  <>
                    <span className="mx-1">·</span>
                    {inNav("/hot") ? (
                      <Link to="/hot" className="text-accent hover:underline">
                        <Text value="热点榜第" /> {story.whyHot.rank} <Text value="名" />
                      </Link>
                    ) : (
                      <><Text value="热点榜第" /> {story.whyHot.rank} <Text value="名" /></>
                    )}
                  </>
                )}
              </p>
            </RailCard>
          )}
          {story.officialReports.length > 0 && (
            <RailCard title={tx("官方一手")} right={tx("{0} 篇", counts.official || story.officialReports.length)}>
              <p className="text-[12px] text-ink-4"><Text value="直接了解当事方的说法" /></p>
              <ul className="mt-1 divide-y divide-line-soft">
                {story.officialReports.slice(0, 5).map((r) => (
                  <li key={r.id} className="py-3">
                    <div className="truncate text-[11.5px] text-ink-4"><SourceAnchor name={r.source.name} url={r.originalUrl} title={r.title} /></div>
                    <Link viewTransition to={`/items/${r.id}`} className="group mt-1 block text-[13.5px] font-semibold leading-[1.6] text-ink transition-colors hover:text-accent">
                      {r.title}
                      <IconChevronRight size={13} className="ml-0.5 inline -translate-y-px text-ink-4 transition-transform group-hover:translate-x-0.5" />
                    </Link>
                  </li>
                ))}
              </ul>
              {counts.official > 0 && (
                <button type="button" onClick={showOfficial} className="text-[12px] text-ink-4 transition-colors hover:text-accent">
                  <Text value="在时间线筛选全部官方报道" />
                </button>
              )}
            </RailCard>
          )}
          {story.topics.length > 0 && (
            <RailCard title={tx("相关主题")}>
              <div className="flex flex-wrap gap-1.5">
                {story.topics.map((t) => (
                  <Link viewTransition key={t.slug} to={`/topics/${t.slug}`} className="chip">
                    {t.name}
                  </Link>
                ))}
              </div>
            </RailCard>
          )}
          <RailCard title={tx("事件记录")} className="hidden lg:block">
            <dl className="space-y-2 text-[12.5px]">
              {story.firstReportAt && (
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-4"><Text value="最早报道" /></dt>
                  <dd className="num text-ink-2">
                    <time dateTime={story.firstReportAt}>{tx(monthDayTime(story.firstReportAt))}</time>
                  </dd>
                </div>
              )}
              {story.latestAt && (
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-4"><Text value="最近更新" /></dt>
                  <dd className="num text-ink-2">
                    <time dateTime={story.latestAt}>{tx(monthDayTime(story.latestAt))}</time>
                  </dd>
                </div>
              )}
            </dl>
            <p className="mt-3 border-t border-line-soft pt-3 text-[12px] leading-relaxed text-ink-4"><Text value="同一事件的报道集中在这里，新的进展会继续补充。" /></p>
          </RailCard>
        </aside>
      </div>
    </div>
  );
}
