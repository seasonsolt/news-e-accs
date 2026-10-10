import { localePath, requestLocale } from "../lib/locale";
import { Link } from "../lib/navigation";
import { localeFromMatches, translate, Text, useTranslate } from "../lib/i18n";
import { REPORTS, SITE } from "@aihot/site";
import { redirect, useLoaderData } from "react-router";
import type { Route } from "./+types/topic";
import type { TopicPage } from "@aihot/contracts/site";
import { cachedPage, loadOr404 } from "../lib/api.server";
import { pageReuse } from "../lib/page-reuse";
import { breadcrumbLd, pageMeta, titled, topicLd } from "../lib/seo";
import { DayList, Pagination } from "../features/feed/DayList";
import { BrandMark } from "../components/BrandMark";
import { EmptyState } from "../components/ui/Page";
import { beijingDate } from "@aihot/contracts/time";
import { monthDay, monthDayTime } from "../lib/format";
import { Deck } from "../components/shell/Deck";
import type { TopicPagePart } from "../modules";
import { loadParts } from "../site-modules";

export { pageHeaders as headers } from "../lib/api.server";
export const { clientLoader, shouldRevalidate } = pageReuse<typeof loader>();

/** Selected items of a topic: shared caches keep the page as long as its api answer (one minute). */
export async function loader({ params, request }: Route.LoaderArgs) {
  const page = params.page ? Number(params.page) : 1;
  if (params.page !== undefined && (!/^\d+$/.test(params.page) || page < 1)) throw new Response("Not found", { status: 404 });
  // Page 1 lives at the topic's own address (308).
  if (params.page === "1") throw redirect(localePath(`/topics/${params.slug}${new URL(request.url).search}`, requestLocale(request)), 308);
  const data = await loadOr404<TopicPage>(`/api/site/topics/${encodeURIComponent(params.slug)}?page=${page}`, { request, signal: request.signal });
  return cachedPage(60, { data });
}

const PARTS = await loadParts((m) => m.topicPage);

type Part = TopicPagePart & { key: string; data: unknown };

/** The modules' parts that have something on this page, in the site's order. */
function partsOf(data: TopicPage): Part[] {
  return PARTS.flatMap(({ name, part }) => {
    const value = data.modules[name];
    return value !== undefined && part.shows(value, data.topic) ? [{ ...part, key: name, data: value }] : [];
  });
}

/** The search snippet: what the topic covers, after when it last changed and its biggest recent events. */
function description(data: TopicPage, parts: Part[], en: boolean): string {
  const { topic } = data;
  let text = topic.definition;
  const news = parts.flatMap((p) => p.news(p.data)).slice(0, 2).map((title) => title.replace(/[。.]$/u, "")).join("；");
  if (news && topic.latest) {
    const day = beijingDate(topic.latest.at);
    text = en ? `Updated ${day}: ${news}. ${topic.definition}` : `${monthDay(day)}更新：${news}。${topic.definition}`;
  }
  return text.length > 150 ? `${text.slice(0, 149)}…` : text;
}

export function meta({ matches, loaderData }: Route.MetaArgs) {
  const locale = localeFromMatches(matches ?? []);
  if (!loaderData) return [{ title: titled(translate(locale, "主题不存在")) }, { name: "robots", content: "noindex" }];
  const data = loaderData.data;
  const { topic, page } = data;
  const parts = partsOf(data);
  const path = page > 1 ? `/topics/${topic.slug}/page/${page}` : `/topics/${topic.slug}`;
  const en = locale === "en";
  const text = page > 1
    ? (en ? `${topic.name} picks archive, page ${page}. ${topic.definition}` : `${topic.name}的精选归档第 ${page} 页。${topic.definition}`)
    : description(data, parts, en);
  const crumbs = breadcrumbLd([{ name: SITE.name, path: "/" }, { name: "主题", path: "/topics" }, { name: topic.name, path: `/topics/${topic.slug}` }]);
  return pageMeta({
    title: page > 1
      ? (en ? `${topic.name} picks · page ${page}` : `${topic.name} 精选 · 第 ${page} 页`)
      : (en
        ? `${topic.name} latest news${parts.length ? ` and ${parts.map((p) => p.name).join(", ")}` : ""}`
        : `${topic.name} 最新动态${parts.length ? `与${parts.map((p) => p.name).join("、")}` : ""}`),
    description: text,
    path,
    image: `/og/topics/${topic.slug}.png`,
    noindex: !topic.indexable,
    jsonLd: page > 1
      ? crumbs
      : [
          topicLd({
            path,
            name: en ? `${topic.name} latest news` : `${topic.name} 最新动态`,
            description: text,
            dateModified: topic.latest?.at ?? null,
            lists: parts.map((p) => ({ name: p.name, entries: p.entries(p.data) })),
          }),
          crumbs,
        ],
  }, locale);
}

export default function TopicRoute() {
  const tx = useTranslate();
  const { data } = useLoaderData<typeof loader>();
  const { topic, items, page, pageCount, pageSize } = data;
  const parts = partsOf(data);
  const href = (p: number) => (p <= 1 ? `/topics/${topic.slug}` : `/topics/${topic.slug}/page/${p}`);
  const first = (page - 1) * pageSize + 1;
  const last = first + items.length - 1;
  return (
    <div className="pb-6">
      <Deck compact art="topics" label={topic.name} kicker={<Link to="/topics" className="hover:text-[var(--heat-hi)]"><Text value="← 全部主题" /></Link>} title={<span className="inline-flex items-center gap-3">{topic.brand && <BrandMark brand={topic.brand} size={34} />}{topic.name}</span>} description={topic.definition} />
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2 pb-5 pt-5">
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-ink-4">
          <span>
            <span className="num font-semibold text-ink-2">{topic.total.toLocaleString("zh-CN")}</span>{" "}<Text value={REPORTS.metricUnits.selectedCount} />
          </span>
          <span>
            <Text value="近 30 天" /> <span className="num font-semibold text-ink-2">{topic.recent.toLocaleString("zh-CN")}</span><Text value="条" />
          </span>
          <span>
            <Text value="共收录" /> <span className="num font-semibold text-ink-2">{topic.poolTotal.toLocaleString("zh-CN")}</span><Text value="条" />
          </span>
        </p>
        {topic.latest && (
          <span className="text-[12px] text-ink-4">
            <time dateTime={topic.latest.at} className="num">{monthDayTime(topic.latest.at)}</time> <Text value="更新" />
          </span>
        )}
      </header>

      {parts.map((p) => (
        <div key={`${p.key}:${topic.slug}`} className="mb-8">
          <p.Block data={p.data} topic={topic} />
        </div>
      ))}

      <h2 className="sr-only">{page === 1 ? tx("{0}的精选", topic.name) : tx("精选归档 · 第 {0} 页", page)}</h2>
      {items.length === 0 ? (
        <div className="lg:card">
          <EmptyState title={tx("这个主题暂时还没有精选内容")} />
        </div>
      ) : (
        <DayList items={items} headerAside={<span className="num whitespace-nowrap"><Text value="第" />{first}–{last}<Text value="条" /><span className="hidden sm:inline"> · <Text value="共" /> {topic.total.toLocaleString("zh-CN")} <Text value="条" /></span></span>} />
      )}
      <Pagination page={page} pageCount={pageCount} href={href} />
    </div>
  );
}
