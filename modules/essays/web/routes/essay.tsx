// An essay at /essays/<slug> and its Chinese edition at /zh/essays/<slug>: title, dek, byline, cover, the
// body the api renders (backend/render.ts, sanitized there), the fixed closing line and the way to the other
// edition. A withdrawn essay answers 410 with a page saying so; the api reads only live publications.
import { data, useLoaderData, type MetaArgs } from "react-router";
import { FEATURES } from "@aihot/industry/features";
import { SITE } from "@aihot/site";
import { ApiError, apiErrorResponse, apiGet, cachedPage } from "@aihot/web/lib/api.server";
import { localeFromMatches, translate, useLocale, useTranslate } from "@aihot/web/lib/i18n";
import { htmlLanguage, type Locale } from "@aihot/web/lib/locale";
import { Link } from "@aihot/web/lib/navigation";
import { breadcrumbLd, pageMeta, siteUrl } from "@aihot/web/lib/seo";
import { ESSAYS_PATH, type PublicEssay } from "../../contracts.ts";
import { creditHost, essayDate } from "../format.ts";
import styles from "../essays.css?url";

export { pageHeaders as headers } from "@aihot/web/lib/api.server";
export const links = () => [{ rel: "stylesheet", href: styles }];

export async function loader({ request, params }: { request: Request; params: { slug?: string } }) {
  const slug = params.slug ?? "";
  const upstream = new Headers();
  try {
    const essay = await apiGet<PublicEssay>(`/api/site/essays/${encodeURIComponent(slug)}`, { request, signal: request.signal, responseHeaders: upstream });
    return cachedPage(120, { essay, slug }, upstream);
  } catch (error) {
    if (error instanceof ApiError && error.status === 410) {
      // The web server keeps any status but 200 out of shared caches.
      return data({ essay: null, slug, expiresAt: 0 }, { status: 410 });
    }
    throw apiErrorResponse(error, { request, signal: request.signal });
  }
}

/** The page's address without the edition prefix: pageMeta and the structured data add it. */
const pagePath = (slug: string) => `${ESSAYS_PATH}/${slug}`;

function structuredData(essay: PublicEssay, locale: Locale) {
  const base = siteUrl();
  const url = `${base}${pagePath(essay.slug)}`;
  const essays = translate(locale, "长文");
  return [
    {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: essay.title,
      description: essay.description,
      image: [`${base}${essay.card}`, `${base}${essay.cover.src}`],
      datePublished: essay.publishedAt,
      dateModified: essay.modifiedAt,
      author: { "@type": "Person", name: essay.author.name, url: `${base}${essay.author.path}` },
      publisher: { "@type": "Organization", name: SITE.organization.name, url: base, logo: `${base}/icon.png` },
      mainEntityOfPage: url,
      url,
      inLanguage: htmlLanguage(locale),
      wordCount: essay.wordCount,
    },
    breadcrumbLd([{ name: SITE.name, path: "/" }, { name: essays, path: ESSAYS_PATH }, { name: essay.title, path: pagePath(essay.slug) }]),
  ];
}

export function meta({ matches, loaderData }: MetaArgs<typeof loader>) {
  const locale = localeFromMatches(matches ?? []);
  if (!loaderData?.essay) {
    return pageMeta({ title: "这篇长文已撤下", path: pagePath(loaderData?.slug ?? ""), noindex: true, alternates: false }, locale);
  }
  const essay = loaderData.essay;
  return pageMeta({
    title: essay.title,
    description: essay.description,
    path: pagePath(essay.slug),
    type: "article",
    publishedTime: essay.publishedAt,
    modifiedTime: essay.modifiedAt,
    image: essay.card,
    jsonLd: structuredData(essay, locale),
  }, locale);
}

function Withdrawn() {
  const tx = useTranslate();
  return (
    <div className="essay">
      <p className="essay-kicker"><Link to={ESSAYS_PATH}>{tx("长文")}</Link></p>
      <h1 className="essay-title">{tx("这篇长文已撤下")}</h1>
      <p className="essay-dek">{tx("作者撤下了这篇文章，它不再公开。")}</p>
      <nav className="essay-more"><Link to={ESSAYS_PATH}>{tx("全部长文")} →</Link></nav>
    </div>
  );
}

export default function EssayPage() {
  const { essay } = useLoaderData<typeof loader>();
  const tx = useTranslate();
  const locale = useLocale();
  if (!essay) return <Withdrawn />;
  const other: Locale = locale === "zh" ? "en" : "zh";
  const published = essayDate(essay.publishedAt, locale);
  const modified = essayDate(essay.modifiedAt, locale);
  return (
    <article className="essay" lang={htmlLanguage(locale)}>
      <header>
        <p className="essay-kicker"><Link to={ESSAYS_PATH}>{tx("长文")}</Link></p>
        <h1 className="essay-title">{essay.title}</h1>
        <p className="essay-dek">{essay.dek}</p>
        <p className="essay-byline">
          <span>{tx("essays.byline")} <Link to={essay.author.path} rel="author">{essay.author.name}</Link></span>
          <time dateTime={essay.publishedAt}>{published}</time>
          {modified !== published && <span>{tx("更新于 {0}", modified)}</span>}
        </p>
      </header>
      <figure className="essay-cover">
        <img src={essay.cover.src} width={essay.cover.width} height={essay.cover.height} alt={essay.cover.alt} fetchPriority="high" decoding="async" />
        {essay.cover.credit && (
          <figcaption>{tx("图片来源：")}<a href={essay.cover.credit} rel="noopener">{creditHost(essay.cover.credit)}</a></figcaption>
        )}
      </figure>
      <div className="essay-body" dangerouslySetInnerHTML={{ __html: essay.html }} />
      <p className="essay-disclosure">{tx("根据作者笔记由 AI 起草，作者修改并审定。")}</p>
      <nav className="essay-more" aria-label={tx("长文")}>
        {/* The other edition is another page in another language: a full load, so the frame follows. */}
        <a href={essay.alternate} hrefLang={htmlLanguage(other)} lang={htmlLanguage(other)}>{other === "zh" ? "中文版" : "English edition"} →</a>
        <Link to={ESSAYS_PATH}>{tx("全部长文")} →</Link>
        {FEATURES.eaccConcepts && <Link to="/manifesto">{tx("降临派宣言")} →</Link>}
      </nav>
    </article>
  );
}
