import { shareOrCopy } from "../features/item/share.ts";
import { hasAlternateEdition } from "../lib/edition-meta.server";
import { contentHtmlLanguage, bodyLocale } from "../lib/content-language";
import { localePath } from "../lib/locale";
import { Link, useNavigate } from "../lib/navigation";
import { ContentLanguage } from "../components/ContentLanguage";
import { localeFromMatches, translate, Text, useTranslate, useLocale } from "../lib/i18n";
import { ITEM_COPY, SITE, withSubject } from "@aihot/site";
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useLoaderData } from "react-router";
import type { Route } from "./+types/item";
import { REPORT_NAMES, reportDateLabel, type NextReads as Reads, type SiteItemDetail } from "@aihot/contracts/site";
import { linkMentions } from "@aihot/contracts/mentions";
import { apiGet, cachedPage, loadOr404 } from "../lib/api.server";
import { pageReuse } from "../lib/page-reuse";
import { breadcrumbLd, newsArticleLd, pageMeta, siteUrl, titled } from "../lib/seo";
import { fullDateTime, timeAgo } from "../lib/format";
import { markRead } from "../lib/local-state";
import { outboundLink } from "../lib/engagement";
import { SameEventBadge, SelectedBadge } from "../components/ui/Badge";
import { shownScore } from "../components/ui/Score";
import { PillTabs } from "../components/ui/Tabs";
import { Menu, MenuItem } from "../components/ui/Menu";
import { StarPill } from "../features/feed/parts";
import { ItemSources } from "../features/item/ItemSources";
import { withoutShortLinks } from "../features/item/post-links";
import { ArticleBody } from "../features/item/ArticleBody";
import { scrollToAnchor } from "../lib/motion";
import { useContainedScroll } from "../components/ui/Page";
import { copyText } from "../lib/clipboard";
import { loadFollowups } from "../features/item/followups.server";
import { StoryFollowups } from "../features/item/StoryFollowups";
import { AuthorRoleMark, FactCard, StoryDigest, XCountsLine } from "../features/item/FactCard";
import { MediaGallery } from "../features/item/MediaGallery";
import { QuotedPost } from "../features/item/QuotedPost";
import { IconArrowLeft, IconArrowUpRight, IconChevronRight, IconCopy, IconDownload, IconExternal, IconImage, IconMenu, IconShare } from "../components/icons";
import { ReadingGear } from "../features/art/ReadingGear";
import { CATEGORY_ART } from "../features/art/CategoryBanner";
import { Plate } from "../components/shell/Deck";
import { CATEGORIES } from "@aihot/industry/taxonomy";
import { NextReads } from "../components/NextReads";
import { MentionText } from "../components/ui/MentionText";

export { pageHeaders as headers } from "../lib/api.server";
export const { clientLoader, shouldRevalidate } = pageReuse<typeof loader>();

const PosterSheet = lazy(() => import("../features/item/PosterSheet"));

export async function loader({ params, request }: Route.LoaderArgs) {
  // What to read next is optional: the page renders without it.
  const next = apiGet<Reads>("/api/site/next-reads", { request, signal: request.signal }).catch(() => null);
  const item = await loadOr404<SiteItemDetail>(`/api/site/items/${encodeURIComponent(params.id)}`, { request, signal: request.signal });
  const [alternateEdition, nextReads, followups] = await Promise.all([hasAlternateEdition(`/api/site/items/${encodeURIComponent(params.id)}`, item, request), next, loadFollowups(item, request)]);
  return cachedPage(600, { item, alternateEdition, nextReads, followups });
}

export function meta({ matches, loaderData, location }: Route.MetaArgs) {
  if (!loaderData) return [{ title: titled(translate(localeFromMatches(matches ?? []), "内容不存在")) }, { name: "robots", content: "noindex" }];
  const { item } = loaderData;
  return pageMeta({
    content: item,
    alternates: loaderData.alternateEdition,
    title: item.title,
    description: item.summary ?? undefined,
    path: location.pathname,
    image: `/og/items/${item.id}.png`,
    type: "article",
    publishedTime: item.publishedAt ?? item.discoveredAt,
    noindex: !item.indexable,
    googleNoindex: item.googleNoindex,
    jsonLd: [
      newsArticleLd({
        path: `/items/${item.id}`,
        headline: item.title,
        description: item.summary,
        image: `/og/items/${item.id}.png`,
        datePublished: item.publishedAt ?? item.discoveredAt,
        inLanguage: contentHtmlLanguage(item, localeFromMatches(matches ?? [])),
        basedOn: item.links.original,
        keywords: item.tags,
      }),
      breadcrumbLd([
        { name: SITE.name, path: "/" },
        { name: item.selected ? "精选" : "全部动态", path: item.selected ? "/" : "/all" },
        { name: item.title, path: `/items/${item.id}` },
      ]),
    ],
  }, localeFromMatches(matches ?? []));
}

/** An outline link: a plain click scrolls in place (above); modifier clicks keep the browser's behaviour. */
function jumpTo(e: React.MouseEvent, id: string) {
  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  if (!document.getElementById(id)) return;
  e.preventDefault();
  scrollToAnchor(id);
}

/** WeChat's in-app browser cannot save downloads: there the Markdown is copied instead. */
function inWeChat(): boolean {
  return typeof navigator !== "undefined" && /MicroMessenger/i.test(navigator.userAgent);
}

/** The byline, unless the source's name already says it (公众号：卡尔的AI沃茨 by AI沃茨, Claude：YouTube by Claude). */
function bylineOf(author: string | null, source: string): string | null {
  const key = (s: string) => s.toLowerCase().replace(/[\s\p{P}]/gu, "");
  const a = author ? key(author) : "";
  const s = key(source);
  return a && !s.includes(a) && !a.includes(s) ? author : null;
}

/** "11月7日 AI 日报 · 头条": the daily that carries the article, named as the site names its issues. */
function dailyName(daily: NonNullable<SiteItemDetail["daily"]>, tx: (message: string) => string): string {
  return `${tx(reportDateLabel("daily", daily.key))} ${tx(withSubject(REPORT_NAMES.daily))}${daily.lead ? ` · ${tx("头条")}` : ""}`;
}

/**
 * The tag chips that go beside the article's topic chips (every place showing tags shows all its topics): a
 * tag that is a topic's own leads to the topic's page, not to a filtered list search engines are kept from,
 * and beside that topic's chip it is not repeated.
 */
function tagChips(item: SiteItemDetail): Array<{ tag: string; to: string }> {
  const shown = new Set(item.topics.map((t) => t.slug));
  return item.tags.flatMap((tag) => {
    const topic = item.tagTopics[tag];
    if (topic && shown.has(topic)) return [];
    return [{ tag, to: topic ? `/topics/${topic}` : `/all?tag=${encodeURIComponent(tag)}` }];
  });
}

export default function ItemPage() {
  const tx = useTranslate();
  const locale = useLocale();
  const { item, nextReads, followups } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const hasTranslation = item.hasTranslation;
  const lang = item.bodyLanguage;
  const [posterRequested, setPosterRequested] = useState(false);
  const [posterOpen, setPosterOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => markRead(item.id), [item.id]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 1600);
    return () => clearTimeout(t);
  }, [toast]);
  const closePoster = useCallback(() => setPosterOpen(false), []);
  const openPoster = () => {
    setPosterRequested(true);
    setPosterOpen(true);
  };
  const share = async () => {
    const r = await shareOrCopy(item.title, `${siteUrl()}${localePath(`/items/${item.id}`, locale)}`);
    if (r === "copied") setToast(tx("链接已复制"));
  };

  const copyMarkdown = async () => {
    try {
      const res = await fetch(`/items/${item.id}/markdown?lang=${locale}`);
      if (!res.ok) throw new Error(String(res.status));
      await copyText(await res.text());
      setToast(tx("Markdown 已复制"));
    } catch {
      setToast(tx("复制失败，请在浏览器中打开后导出"));
    }
  };

  const bodyHtml = lang === "zh" ? (item.body?.zh ?? item.body?.original) : (item.body?.original ?? item.body?.zh);
  const actualBodyLocale = !item.bodyContentLanguage && lang === "zh" && item.body?.zh ? "zh" : bodyLocale(item.bodyContentLanguage, locale, item.language);
  const bodyLabel = !item.body ? null : item.bodyContentLanguage?.status === "translated" && actualBodyLocale === locale
    ? locale === "en" ? "Body · English translation" : "正文 · 中文译文"
    : actualBodyLocale && actualBodyLocale !== locale
      ? locale === "en" ? "Body · English edition pending (original content)" : "正文 · 中文版本尚未就绪（原文）"
      : item.bodyContentLanguage && !actualBodyLocale
        ? locale === "en" ? "Body · Original content (language unverified)" : "正文 · 原文（语言尚未确认）"
        : lang === "zh" && item.body.zhKind === "translation" ? tx("正文 · AI 翻译") : tx("正文");
  const isX = item.channel === "x" && !!item.x;
  // A post reads under its author; one that publishes a long X Article reads like an article, under its headline.
  const isPost = isX && !item.x!.article;
  // Without a reliable date from the original, the time shown is when it was collected, labelled as such.
  const publishedIso = item.publishedAt ?? item.discoveredAt;
  const summaryOnly = item.readingMode === "summary-only";
  const showOutline = item.outline.length >= 3;
  const fromX = item.channel === "x";
  const originalLabel = fromX ? tx("在 X 查看原推") : tx("打开原文");

  const related = item.relatedStories.filter((s) => s.publicId !== item.story?.publicId);
  const daily = item.daily && { to: `/daily/${item.daily.key}`, name: dailyName(item.daily, tx) };
  const tags = tagChips(item);

  const back = () => {
    if (window.history.state?.idx > 0) navigate(-1);
    else navigate(item.selected ? "/" : "/all");
  };
  const backButton = (
    <button type="button" onClick={back} className="-ml-1.5 inline-flex h-8 items-center gap-1.5 rounded-full px-1.5 text-[14px] text-ink-2 transition-colors hover:text-ink lg:text-[13px] lg:text-ink-3">
      <IconArrowLeft size={16} /><Text value="返回" /></button>
  );
  const score = shownScore(item.score);
  const moreMenu = (
    <Menu label={tx("更多操作")} trigger={<IconMenu size={17} />}>
      {(close) => (
        <>
          {score !== null && (
            <div className="border-b border-line-soft px-3 pb-2 pt-1.5 text-[12px] text-ink-4">
              <Text value="AI 评分" /> <span className="num text-ink-2">{Math.round(score)}</span>
            </div>
          )}
          <MenuItem icon={<IconShare size={15} />} onSelect={() => { close(); void share(); }}><Text value="分享链接" /></MenuItem>
          <MenuItem icon={<IconImage size={15} />} onSelect={() => { close(); openPoster(); }}><Text value="生成分享海报" /></MenuItem>
          <MenuItem
            icon={<IconCopy size={15} />}
            onSelect={async () => {
              close();
              try {
                await copyText(`${siteUrl()}${localePath(`/items/${item.id}`, locale)}`);
                setToast(tx("链接已复制"));
              } catch {
                // clipboard unavailable
              }
            }}
          ><Text value="复制链接" /></MenuItem>
          {item.markdownAvailable &&
            (inWeChat() ? (
              <MenuItem icon={<IconDownload size={15} />} onSelect={() => { close(); void copyMarkdown(); }}><Text value="复制 Markdown" /></MenuItem>
            ) : (
              <MenuItem icon={<IconDownload size={15} />} href={`/items/${item.id}/markdown?lang=${locale}`} download onSelect={close}><Text value="导出 Markdown" /></MenuItem>
            ))}
        </>
      )}
    </Menu>
  );
  const badge = item.selected && (item.sameEvent ? <SameEventBadge /> : <SelectedBadge />);
  const category = item.category ? CATEGORIES.find((c) => c.key === item.category) : null;
  // An X post's source name already ends in "· X"; its author is the account's handle.
  const byline = isX ? `@${item.x!.handle}` : fromX && item.author ? `@${item.author.replace(/^@/, "")}` : bylineOf(item.author, item.source.name);
  // Post text keeps t.co short links that say nothing on their own: the page names how many the post has.
  const { text: summaryText, links: postLinks } = fromX && item.summary ? withoutShortLinks(item.summary) : { text: item.summary, links: 0 };
  // The names the summary mentions link to their pages, each once.
  const [summaryRuns] = useMemo(() => linkMentions([summaryText], item.mentions), [summaryText, item.mentions]);
  const [outlineRef, outlineOverscroll] = useContainedScroll<HTMLElement>();
  const outline = showOutline && (
    <nav ref={outlineRef} aria-label={tx("本文目录")} tabIndex={outlineOverscroll ? 0 : undefined} onKeyDown={(e) => {
      const nav = e.currentTarget;
      if (nav.scrollHeight <= nav.clientHeight || e.altKey || e.ctrlKey || e.metaKey) return;
      const up = ["ArrowUp", "PageUp", "Home"].includes(e.key) || (e.key === " " && e.shiftKey);
      const down = ["ArrowDown", "PageDown", "End"].includes(e.key) || (e.key === " " && !e.shiftKey);
      if ((up && nav.scrollTop <= 0) || (down && nav.scrollTop + nav.clientHeight >= nav.scrollHeight - 1)) e.preventDefault();
    }} className={`scrollbar-thin max-h-[calc(100vh-3rem)] overflow-y-auto border-t border-line pt-3.5 ${outlineOverscroll}`}>
      <h2 className="text-[12px] font-semibold text-ink-3"><Text value="本文目录" /></h2>
      <ol className="-ml-px mt-2.5 space-y-0.5 border-l border-line">
        {item.outline.map((o) => (
          <li key={o.id}>
            <a href={`#${o.id}`} onClick={(e) => jumpTo(e, o.id)} className={`-ml-px block border-l border-transparent py-1 text-[12.5px] leading-snug text-ink-3 transition-colors hover:border-accent hover:text-ink ${o.level > 2 ? "pl-5" : "pl-3"}`}>
              {o.text}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );

  return (
    <div className="pb-8">
      {item.body && <ReadingGear />}
      {/* The category's plate as a thin band: the page keeps the site's deck without giving it the first screen. */}
      <div className="item-band" aria-hidden="true">
        {item.category && <Plate key={item.category} src={`/media/art/${CATEGORY_ART[item.category]}`} className="deck-plate" />}
      </div>

      {/* Phones: a sticky bar with back, 收藏, the original and more (share is in more). */}
      <div className="sticky top-0 z-30 -mx-4 flex h-12 items-center gap-1.5 border-b border-line-soft bg-bg/95 px-4 backdrop-blur lg:hidden">
        {backButton}
        <span className="flex-1" />
        <StarPill item={item} className="h-8 px-2.5" />
        <a href={item.links.original} target="_blank" rel="noopener noreferrer" {...outboundLink(item.links.original)} className="inline-flex h-8 items-center gap-1 rounded-full bg-ink px-3 text-[13px] font-medium text-bg">
          <Text value="原文" /><IconExternal size={13} /></a>
        {moreMenu}
      </div>

      <div className={`mx-auto ${showOutline ? "max-w-[var(--page-max-reading)] lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,720px)_minmax(0,1fr)] lg:gap-x-8 2xl:gap-x-12" : "max-w-[720px]"}`}>
        {showOutline && <div className="hidden lg:block" />}
        <article lang={contentHtmlLanguage(item, locale)} className="min-w-0 pb-6 pt-5 lg:pt-6">
          <div className="sticky top-2 z-20 mb-3 hidden w-fit rounded-full bg-bg/90 pl-1.5 pr-2 backdrop-blur lg:block">{backButton}</div>
          <ContentLanguage content={item} />
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[13px] text-ink-3">
            {category && (
              <Link viewTransition to={`/all?category=${category.key}`} className="mr-1 rounded-full bg-accent-soft px-2 py-0.5 text-[12px] font-medium text-accent transition-colors hover:text-accent-ink">
                {tx(category.label)}
              </Link>
            )}
            <span className="font-semibold text-ink-2">{isX ? `${item.x!.authorName} · X` : item.source.name}</span>
            <AuthorRoleMark role={item.authorRole} />
            {byline && <span>· {byline}</span>}
            <span>·</span>
            {!item.publishedAt && <span><Text value="收录于" /></span>}
            <time dateTime={publishedIso} className="mono">{fullDateTime(publishedIso)}</time>
            <span className="empty:hidden" suppressHydrationWarning>{timeAgo(publishedIso) && `· ${tx(timeAgo(publishedIso)!)}`}</span>
            {badge && <span className="ml-1 lg:hidden">{badge}</span>}
          </div>

          {item.xCounts && <XCountsLine counts={item.xCounts} />}

          <h1 lang={contentHtmlLanguage(item, locale) ?? "und"} className="mt-3 text-balance text-[26px] font-[750] leading-[1.25] tracking-[-0.01em] text-ink lg:text-[34px] lg:leading-[1.2]">
            {item.title}
          </h1>
          {!fromX && item.originalTitle && item.originalTitle !== item.title && (
            <p className="mt-2 text-[14px] leading-relaxed text-ink-4">{item.originalTitle}</p>
          )}

          <div className="mt-5 hidden items-center gap-2 lg:flex">
            <a
              href={item.links.original}
              target="_blank"
              rel="noopener noreferrer"
              {...outboundLink(item.links.original)}
              className="inline-flex h-8 items-center gap-1.5 rounded-full bg-ink px-4 text-[13px] font-medium text-bg transition-opacity hover:opacity-90"
            >
              {originalLabel} <IconExternal size={13} />
            </a>
            <StarPill item={item} />
            <button type="button" onClick={share} className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line-strong bg-surface px-3 text-[13px] text-ink-2 transition-colors hover:border-ink-4 hover:text-ink">
              <IconShare size={14} /><Text value="分享" /></button>
            {moreMenu}
            {badge && <span className="ml-auto">{badge}</span>}
          </div>

          {/* The original page's own share picture, credited and linked to it like a link preview. */}
          {item.cover && (
            <figure className="mt-6">
              <a href={item.links.original} target="_blank" rel="noopener noreferrer" {...outboundLink(item.links.original)} className="block overflow-hidden rounded-tile border border-line-soft bg-bg-sunk">
                <img src={item.cover.url} srcSet={item.cover.srcSet} sizes="(min-width: 768px) 720px, calc(100vw - 32px)" width={item.cover.width ?? undefined} height={item.cover.height ?? undefined}
                  alt="" decoding="async" className="max-h-[420px] w-full object-cover" />
              </a>
              <figcaption className="mt-1.5 text-[12px] text-ink-4">{tx("图片来自 {0}", item.source.name)}</figcaption>
            </figure>
          )}

          {item.fact && !summaryOnly && <FactCard fact={item.fact} />}

          {summaryText && (!isPost || summaryText.replace(/\s+/g, " ").trim() !== item.title) && (
            <section className="mt-8">
              <h2 className="text-[12.5px] font-semibold text-accent">{summaryOnly ? tx("摘要") : tx("发生了什么")}</h2>
              <p className="mt-2 text-[17px] leading-[1.75] text-ink lg:text-[18px]"><MentionText runs={summaryRuns} /></p>
              {postLinks > 0 && (
                <a href={item.links.original} target="_blank" rel="noopener noreferrer" {...outboundLink(item.links.original)} className="mt-2 inline-flex items-center gap-1 text-[13px] text-ink-3 transition-colors hover:text-accent">
                  {tx("原帖含 {0} 个链接", postLinks)} <IconArrowUpRight size={13} />
                </a>
              )}
            </section>
          )}

          {item.reason && !summaryOnly && (
            <section className="mt-6 rounded-tile bg-accent-soft px-4 py-3.5 lg:px-5 lg:py-4">
              <h2 className="text-[12.5px] font-semibold text-accent"><Text value={ITEM_COPY.reasonLabel} /></h2>
              <p className="mt-1.5 text-[15px] leading-[1.8] text-ink-2">{item.reason}</p>
            </section>
          )}

          {item.sameEvent && (
            <p className="mt-5 text-[13px] leading-relaxed text-ink-4">
              <Text value="同一新闻，精选展示" />
              <Link viewTransition to={`/items/${item.sameEvent.id}`} className="text-ink-3 transition-colors hover:text-accent">
                《{item.sameEvent.title}》
              </Link>
            </p>
          )}

          {summaryOnly && <p className="mt-6 rounded-control bg-bg-sunk px-4 py-3 text-[13.5px] leading-relaxed text-ink-3"><Text value="应来源方要求，这里只提供摘要与原文入口。完整内容请阅读原文。" /></p>}

          <NextReads reads={nextReads} related={[
            ...(item.story ? [{ to: `/story/${item.story.publicId}`, title: item.story.title, label: "查看这件事的完整进展" }] : []),
            ...related.map((s) => ({ to: `/story/${s.publicId}`, title: s.title, label: "相关事件" })),
          ]} />

          {item.group && item.group.reportCount > 1 && <ItemSources group={item.group} parentId={item.id} />}

          {item.body && bodyHtml && (
            <section className="mt-10 border-t border-line pt-4">
              <div className="mb-6 flex items-center justify-between gap-3">
                <span className="text-[12px] text-ink-4">{bodyLabel}</span>
                {hasTranslation && locale === "zh" && (
                  <PillTabs
                    size="xs"
                    layoutId="item-body-lang"
                    label={tx("正文语言")}
                    active={lang}
                    items={[
                      { key: "zh", label: tx("中文"), prefetch: "intent", replace: true, to: `/items/${item.id}` },
                      { key: "original", label: tx("原文"), prefetch: "intent", replace: true, to: `/items/${item.id}/original` },
                    ]}
                  />
                )}
              </div>
              {hasTranslation && lang === "zh" && !item.body.complete && (
                <p className="mb-5 rounded-control bg-bg-sunk px-3 py-2 text-[13px] text-ink-3"><Text value="译文尚不完整，完整内容请切换到原文。" /></p>
              )}
              {outline && <div className="mb-8 lg:hidden">{outline}</div>}
              <ArticleBody html={bodyHtml} lang={actualBodyLocale ?? "und"} />
            </section>
          )}

          {isX && item.x!.media.length > 0 && <MediaGallery media={item.x!.media} postUrl={item.links.original} />}
          {isX && item.x!.quoted?.html && <QuotedPost quoted={item.x!.quoted} original={lang === "original"} />}

          {item.story?.digest && <StoryDigest digest={item.story.digest} lang={contentHtmlLanguage(item.story, locale) ?? "und"} />}
          {item.story && <StoryFollowups followups={followups} story={item.story} current={{ id: item.id, title: item.title, timelineAt: item.timelineAt }} />}

          {(item.topics.length > 0 || tags.length > 0) && (
            <div className="mt-9 flex flex-wrap gap-1.5">
              {item.topics.map((t) => (
                <Link viewTransition key={t.slug} to={`/topics/${t.slug}`} className="chip">
                  {t.name}
                </Link>
              ))}
              {tags.slice(0, 8).map(({ tag, to }) => (
                <Link key={tag} to={to} className="chip">
                  #{tx(tag)}
                </Link>
              ))}
            </div>
          )}

          {/* The article's way on is the issue that carries it; signing up happens there. */}
          {daily && (
            <Link viewTransition to={daily.to} data-item-daily className="group mt-10 block rounded-card border border-accent/30 bg-surface px-5 py-4 transition-colors hover:border-accent">
              <span className="block text-[12px] font-semibold text-accent">{tx("这条收录于 {0}", daily.name)}</span>
              <span className="mt-1 flex items-center gap-2 text-[16px] font-semibold leading-relaxed text-ink">
                <Text value="看这一期日报的全部内容" /><IconChevronRight size={17} className="shrink-0 text-accent" />
              </span>
            </Link>
          )}
        </article>
        {showOutline && (
          <aside className="hidden lg:block">
            <div className="sticky top-6 max-w-[240px]">{outline}</div>
          </aside>
        )}
      </div>

      {posterRequested && (
        <Suspense fallback={null}>
          <PosterSheet path={`/og/posters/${item.id}.png`} name={item.id} title={item.title} open={posterOpen} onClose={closePoster} />
        </Suspense>
      )}
      {toast && (
        <div role="status" className="fixed bottom-[calc(80px+env(safe-area-inset-bottom))] left-1/2 z-50 -translate-x-1/2 rounded-full bg-ink px-4 py-2 text-[13px] text-bg shadow-[var(--shadow-pop)] lg:bottom-8">
          {toast}
        </div>
      )}
    </div>
  );
}
