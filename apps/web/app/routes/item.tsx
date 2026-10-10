import { hasAlternateEdition } from "../lib/edition-meta.server";
import { contentHtmlLanguage, bodyLocale } from "../lib/content-language";
import { localePath, type Locale } from "../lib/locale";
import { Link, useNavigate } from "../lib/navigation";
import { ContentLanguage } from "../components/ContentLanguage";
import { localeFromMatches, translate, Text, useTranslate, useLocale } from "../lib/i18n";
import { SITE, withSubject } from "@aihot/industry/site";
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useLoaderData } from "react-router";
import type { Route } from "./+types/item";
import type { SiteItemDetail } from "@aihot/contracts/site";
import { loadOr404 } from "../lib/api.server";
import { breadcrumbLd, newsArticleLd, pageMeta, siteUrl, titled } from "../lib/seo";
import { fullDateTime, relativeTime } from "../lib/format";
import { markRead } from "../lib/local-state";
import { SelectedBadge } from "../components/ui/Badge";
import { ScoreLabel } from "../components/ui/Score";
import { PillTabs } from "../components/ui/Tabs";
import { ArticleLayout, RailSection } from "../components/ui/Page";
import { Menu, MenuItem } from "../components/ui/Menu";
import { StarButton } from "../features/feed/parts";
import { GroupSources } from "../features/feed/ReadingGroup";
import { StoryFollowups } from "../features/item/StoryFollowups";
import { MediaGallery } from "../features/item/MediaGallery";
import { QuotedPost } from "../features/item/QuotedPost";
import { IconArrowLeft, IconCopy, IconDownload, IconExternal, IconImage, IconMenu, IconShare } from "../components/icons";
import { ReadingGear } from "../features/art/ReadingGear";
import { CATEGORY_ART } from "../features/art/CategoryBanner";
import { Deck } from "../components/shell/Deck";

const PosterSheet = lazy(() => import("../features/item/PosterSheet"));

export async function loader({ params, request }: Route.LoaderArgs) {
  const item = await loadOr404<SiteItemDetail>(`/api/site/items/${encodeURIComponent(params.id)}`, { request, signal: request.signal });
  return { item, alternateEdition: await hasAlternateEdition(`/api/site/items/${encodeURIComponent(params.id)}`, item, request) };
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
    noindex: !item.indexable,
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

export function headers() {
  return { "Cache-Control": "public, max-age=0, s-maxage=600, stale-while-revalidate=120" };
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

async function shareOrCopy(item: Pick<SiteItemDetail, "id" | "title">, locale: Locale): Promise<"shared" | "copied" | null> {
  const url = `${siteUrl()}${localePath(`/items/${item.id}`, locale)}`;
  try {
    if (navigator.share && matchMedia("(pointer: coarse)").matches) {
      await navigator.share({ title: item.title, url });
      return "shared";
    }
    await navigator.clipboard.writeText(`${item.title}\n${url}`);
    return "copied";
  } catch {
    return null;
  }
}

export default function ItemPage() {
  const tx = useTranslate();
  const locale = useLocale();
  const { item } = useLoaderData<typeof loader>();
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
    const r = await shareOrCopy(item, locale);
    if (r === "copied") setToast(tx("链接已复制"));
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
  const publishedIso = item.publishedAt ?? item.discoveredAt;
  const summaryOnly = item.readingMode === "summary-only";
  const showOutline = item.outline.length >= 3;
  const originalLabel = isX ? tx("在 X 查看原推") : tx("打开原文");

  const related = item.relatedStories.filter((s) => s.publicId !== item.story?.publicId);

  const back = () => {
    if (window.history.state?.idx > 0) navigate(-1);
    else navigate(item.selected ? "/" : "/all");
  };
  const backButton = (
    <button type="button" onClick={back} className="-ml-1.5 inline-flex h-8 items-center gap-1.5 rounded-full px-1.5 text-[14px] text-ink-2 transition-colors hover:text-ink lg:text-[13px] lg:text-ink-3">
      <IconArrowLeft size={16} /><Text value="返回" /></button>
  );
  const moreMenu = (
    <Menu label={tx("更多操作")} trigger={<IconMenu size={17} />}>
      {(close) => (
        <>
          <MenuItem icon={<IconShare size={15} />} onSelect={() => { close(); void share(); }}><Text value="分享链接" /></MenuItem>
          <MenuItem icon={<IconImage size={15} />} onSelect={() => { close(); openPoster(); }}><Text value="生成分享海报" /></MenuItem>
          <MenuItem
            icon={<IconCopy size={15} />}
            onSelect={async () => {
              close();
              try {
                await navigator.clipboard.writeText(`${siteUrl()}${localePath(`/items/${item.id}`, locale)}`);
                setToast(tx("链接已复制"));
              } catch {
                // clipboard unavailable
              }
            }}
          ><Text value="复制链接" /></MenuItem>
          {item.markdownAvailable && (
            <MenuItem icon={<IconDownload size={15} />} href={`/items/${item.id}/markdown?lang=${locale}`} download onSelect={close}><Text value="导出 Markdown" /></MenuItem>
          )}
        </>
      )}
    </Menu>
  );
  // Desktop actions head the right rail, one row as tall as 返回 at the head of the left one.
  const actions = (
    <div className="flex items-center gap-1">
      <a
        href={item.links.original}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-full border border-line-strong bg-surface px-3.5 text-[12.5px] font-medium text-ink-2 transition-colors hover:border-ink-4 hover:text-ink"
      >
        {originalLabel} <IconExternal size={13} />
      </a>
      <StarButton item={item} size={32} />
      {moreMenu}
    </div>
  );
  const verdict = (item.selected || item.score !== null) && (
    <div className="flex items-center gap-2">
      {item.selected && <SelectedBadge />}
      <ScoreLabel score={item.score} />
    </div>
  );

  // Rails: the piece's facts on the left (wide screens), the editor's notes on the right, the outline
  // under the facts (or under the notes when only the right rail shows).
  const facts = (
    <RailSection title={tx("来源")}>
      <div className="text-[14px] font-semibold leading-snug text-ink">{isX ? item.x!.authorName : item.source.name}</div>
      <div className="mt-1 text-[12.5px] leading-relaxed text-ink-3">
        {isX ? `@${item.x!.handle} · X` : item.author ?? hostOf(item.links.original)}
      </div>
      <div className="mt-3 text-[12px] text-ink-4"><Text value="发布时间" /></div>
      <time dateTime={publishedIso} className="mono mt-0.5 block text-[12.5px] text-ink-2">
        {fullDateTime(publishedIso)}
      </time>
      <div className="mt-0.5 text-[12px] text-ink-4" suppressHydrationWarning>
        {tx(relativeTime(publishedIso))}
      </div>
    </RailSection>
  );
  const outline = showOutline && (
    <RailSection title={tx("本文目录")}>
      <nav aria-label={tx("本文目录")}>
        <ol className="-ml-px space-y-0.5 border-l border-line">
          {item.outline.map((o) => (
            <li key={o.id}>
              <a href={`#${o.id}`} className={`-ml-px block border-l border-transparent py-1 text-[12.5px] leading-snug text-ink-3 transition-colors hover:border-accent hover:text-ink ${o.level > 2 ? "pl-5" : "pl-3"}`}>
                {o.text}
              </a>
            </li>
          ))}
        </ol>
      </nav>
    </RailSection>
  );
  const notes = (
    <>
      {item.reason && !summaryOnly ? (
        <RailSection title={tx("推荐理由")}>
          {verdict && <div className="mb-3">{verdict}</div>}
          <p className="text-[13.5px] leading-[1.8] text-ink-2">{item.reason}</p>
        </RailSection>
      ) : (
        verdict && <RailSection title={tx("AI 评分")}>{verdict}</RailSection>
      )}
      {item.tags.length > 0 && (
        <RailSection title={tx("标签")}>
          <div className="flex flex-wrap gap-1.5">
            {item.tags.slice(0, 8).map((t) => (
              <Link key={t} to={`/all?tag=${encodeURIComponent(t)}`} className="chip">
                #{tx(t)}
              </Link>
            ))}
          </div>
        </RailSection>
      )}
    </>
  );

  return (
    <div className="mx-auto max-w-[var(--page-max-reading)] pb-8">
      {item.body && <ReadingGear />}
      <Deck
        compact
        art={item.category ? CATEGORY_ART[item.category] : undefined}
        label={isX ? item.x!.authorName : item.title}
        kicker={<>{isX ? `${item.x!.authorName} · @${item.x!.handle} · X` : item.source.name} · <time dateTime={publishedIso}>{fullDateTime(publishedIso)}</time></>}
        title={<span lang={contentHtmlLanguage(item, locale) ?? "und"}>{isX ? item.x!.authorName : item.title}</span>}
        description={!isX && item.originalTitle ? item.originalTitle : undefined}
      />
      <ContentLanguage content={item} />

      {/* Phones: a sticky bar with back, 收藏, the original, share and more. Desktop puts these in the rails. */}
      <div className="sticky top-0 z-30 -mx-4 flex h-12 items-center gap-1.5 border-b border-line-soft bg-bg/95 px-4 backdrop-blur lg:hidden">
        {backButton}
        <span className="flex-1" />
        <StarButton item={item} size={32} />
        <a href={item.links.original} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center gap-1 px-1.5 text-[14px] text-ink-2">
          <IconExternal size={15} /><Text value="原文" /></a>
        <button type="button" aria-label={tx("分享")} onClick={share} className="inline-flex size-8 items-center justify-center rounded-full text-ink-3 hover:text-ink">
          <IconShare size={17} />
        </button>
        {moreMenu}
      </div>

      {/* The text on the page in one column; back and the facts in the left rail, actions and notes in the right. */}
      <ArticleLayout
        left={
          <>
            {backButton}
            {facts}
            {outline}
          </>
        }
        right={
          <>
            {actions}
            {notes}
            <div className="space-y-8 2xl:hidden">{outline}</div>
          </>
        }
      >
        <div className="hidden lg:block 2xl:hidden">{backButton}</div>
        <article lang={contentHtmlLanguage(item, locale)} className="pb-6 pt-6 lg:pt-2 2xl:pt-1">
          <div className={`flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[13px] text-ink-3 2xl:hidden ${isX ? "" : "mb-3"}`}>
            <span className="font-semibold text-ink-2">{isX ? item.x!.authorName : item.source.name}</span>
            {isX && <span>· @{item.x!.handle} · X</span>}
            {item.author && !isX && <span>· {item.author}</span>}
            <span>·</span>
            <time dateTime={publishedIso} className="mono">{fullDateTime(publishedIso)}</time>
            <span suppressHydrationWarning>· {tx(relativeTime(publishedIso))}</span>
            {item.selected && (
              <span className="ml-1 lg:hidden">
                <SelectedBadge />
              </span>
            )}
            {item.score !== null && (
              <span className="ml-1 lg:hidden">
                <ScoreLabel score={item.score} />
              </span>
            )}
          </div>

          {item.summary && (
            <section className={isX ? "mt-4" : "mt-7 xl:mt-8"}>
              <div className="mb-2 text-[12px] font-semibold text-accent">{summaryOnly ? tx("摘要") : tx("AI 导读")}</div>
              <p className="text-[18px] leading-[1.7] text-ink xl:text-[20px] xl:leading-[1.7]">{item.summary}</p>
            </section>
          )}

          {item.reason && !summaryOnly && (
            <section className="mt-6 border-t border-line pt-4 lg:hidden">
              <div className="mb-1 text-[12px] font-semibold text-ink-3"><Text value="推荐理由" /></div>
              <p className="text-[15px] leading-[1.75] text-ink-2">{item.reason}</p>
            </section>
          )}

          {item.group && item.group.reportCount > 1 && (
            <div className="mt-5">
              <GroupSources group={item.group} parentId={item.id} />
            </div>
          )}

          {summaryOnly && <p className="mt-7 rounded-control bg-bg-sunk px-4 py-3 text-[13.5px] leading-relaxed text-ink-3"><Text value="应来源方要求，这里只提供摘要与原文入口。完整内容请阅读原文。" /></p>}

          {item.body && bodyHtml && (
            <section className="mt-9 border-t border-line pt-4 xl:mt-10">
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
              <div className="prose" lang={actualBodyLocale ?? "und"} dangerouslySetInnerHTML={{ __html: bodyHtml }} />
            </section>
          )}

          {isX && item.x!.media.length > 0 && <MediaGallery media={item.x!.media} postUrl={item.links.original} />}
          {isX && item.x!.quoted?.text && <QuotedPost quoted={item.x!.quoted} original={lang === "original"} />}

          <p className="mt-8 text-[13px] text-ink-4"><Text value="来源：" /><a href={item.links.original} target="_blank" rel="noopener noreferrer" className="text-ink-3 hover:text-accent">
              {isX ? item.x!.authorName : item.source.name}
            </a>
            <span> · {hostOf(item.links.original)}</span>
          </p>

          {item.tags.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1.5 lg:hidden">
              {item.tags.slice(0, 6).map((t) => (
                <Link key={t} to={`/all?tag=${encodeURIComponent(t)}`} className="chip">
                  #{tx(t)}
                </Link>
              ))}
            </div>
          )}

          {item.story && <StoryFollowups story={item.story} currentId={item.id} />}

          {related.length > 0 && (
            <section className="mt-8">
              <h2 className="mb-2 text-[14px] font-semibold text-ink"><Text value="相关事件" /></h2>
              <ul className="divide-y divide-line-soft">
                {related.map((s) => (
                  <li key={s.publicId}>
                    <Link to={`/story/${s.publicId}`} className="block py-2.5 text-[14px] text-ink-2 hover:text-accent">
                      {s.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </article>
      </ArticleLayout>

      {posterRequested && (
        <Suspense fallback={null}>
          <PosterSheet id={item.id} title={item.title} open={posterOpen} onClose={closePoster} />
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
