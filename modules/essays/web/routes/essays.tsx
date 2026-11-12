// The essays at /essays and /zh/essays: what they are, then each published essay (cover, title, dek, date),
// newest first, and the feed. On the night ground of the menu pages, as a section of the top bar.
import { useLoaderData, type MetaArgs } from "react-router";
import { SITE } from "@aihot/site";
import { cachedPage, loadOr404 } from "@aihot/web/lib/api.server";
import { localeFromMatches, translate, useLocale, useTranslate } from "@aihot/web/lib/i18n";
import { Link } from "@aihot/web/lib/navigation";
import { breadcrumbLd, pageMeta, siteUrl } from "@aihot/web/lib/seo";
import { Deck } from "@aihot/web/components/shell/Deck";
import { IconRss } from "@aihot/web/components/icons";
import { MANIFESTO_AUTHOR } from "@aihot/industry/manifesto";
import { ESSAYS_PATH, essayFeedPath, type PublicEssayList } from "../../contracts.ts";
import { essayDate } from "../format.ts";

export { pageHeaders as headers } from "@aihot/web/lib/api.server";

export async function loader({ request }: { request: Request }) {
  const upstream = new Headers();
  const list = await loadOr404<PublicEssayList>("/api/site/essays", { request, signal: request.signal, responseHeaders: upstream });
  return cachedPage(120, { essays: list.essays }, upstream);
}

export function meta({ matches, loaderData }: MetaArgs<typeof loader>) {
  const locale = localeFromMatches(matches ?? []);
  const title = translate(locale, "{0} 的署名长文", MANIFESTO_AUTHOR);
  const base = siteUrl();
  const essays = loaderData?.essays ?? [];
  const tags = pageMeta({
    title,
    description: translate(locale, "{0} 的署名长文：根据作者笔记由 AI 起草，作者修改并审定。", MANIFESTO_AUTHOR),
    path: ESSAYS_PATH,
    jsonLd: [
      breadcrumbLd([{ name: SITE.name, path: "/" }, { name: translate(locale, "长文"), path: ESSAYS_PATH }]),
      // Each essay page describes itself; the list only points at them.
      ...(essays.length ? [{
        "@context": "https://schema.org",
        "@type": "ItemList",
        itemListElement: essays.map((e, i) => ({ "@type": "ListItem", position: i + 1, url: `${base}${e.path}` })),
      }] : []),
    ],
  }, locale);
  return [...tags, { tagName: "link", rel: "alternate", type: "application/rss+xml", title: `${SITE.name} — ${translate(locale, "长文")}`, href: essayFeedPath(locale) }];
}

export default function EssaysPage() {
  const { essays } = useLoaderData<typeof loader>();
  const tx = useTranslate();
  const locale = useLocale();
  const feed = (
    <a href={essayFeedPath(locale)} className="inline-flex min-h-[44px] items-center gap-2 text-[14.5px] text-[color:var(--brass-hi)] hover:text-[color:var(--deck-ink)]">
      <IconRss size={16} />{tx("RSS 订阅")}
    </a>
  );
  return (
    <div className="mx-auto max-w-[960px] pb-10">
      <Deck
        compact
        art="masthead-press"
        label={tx("长文")}
        kicker={tx("长文")}
        title={tx("{0} 的署名长文", MANIFESTO_AUTHOR)}
        description={<>
          <p>{tx("关于加速、智能与人类未来的署名长文，中英两版同时发布。")}</p>
          <p className="mt-2">{tx("根据作者笔记由 AI 起草，作者修改并审定。")}</p>
        </>}
      >
        {feed}
      </Deck>

      {essays.length === 0 ? (
        <div className="mt-10 rounded-panel border border-line px-6 py-12 text-center">
          <p className="text-[18px] font-semibold text-ink">{tx("还没有发布的长文。")}</p>
          <p className="mt-2 text-[14.5px] text-ink-3">{tx("第一篇发布后会出现在这里；可以先订阅 RSS。")}</p>
        </div>
      ) : (
        <ol className="mt-8 divide-y divide-line">
          {essays.map((e, i) => (
            <li key={e.slug}>
              <Link to={`${ESSAYS_PATH}/${e.slug}`} prefetch="intent" className="group flex flex-col gap-5 py-8 sm:flex-row sm:items-start sm:gap-8">
                <img
                  src={e.cover.src}
                  width={e.cover.width}
                  height={e.cover.height}
                  alt={e.cover.alt}
                  loading={i === 0 ? "eager" : "lazy"}
                  decoding="async"
                  className="aspect-[16/10] w-full shrink-0 rounded-card bg-bg-muted object-cover sm:w-[300px]"
                />
                <span className="flex min-w-0 flex-col gap-3">
                  <span className="font-mono text-[12px] tracking-[0.12em] text-[color:var(--brass)]"><time dateTime={e.publishedAt}>{essayDate(e.publishedAt, locale)}</time></span>
                  <span className={`text-[28px] leading-[1.15] text-ink transition-colors group-hover:text-accent ${locale === "zh" ? "font-bold" : "font-display italic"}`}>{e.title}</span>
                  <span className="text-[16px] leading-relaxed text-ink-3">{e.dek}</span>
                </span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
