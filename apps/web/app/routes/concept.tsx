// The e/acc concept pages (industry/concepts.ts, and concepts-zh.ts for /zh/<name>): explainers that rank
// for "e/acc", served at their original English addresses with their original titles, plus a Chinese
// edition of each at its own /zh/ address. The address decides the language of both the body and the frame
// around it (the same rule as every public page), and pageMeta names the editions as each other's hreflang
// alternates, so a search engine shows each reader the one in their language.
import { data, useLoaderData } from "react-router";
import { Link } from "../lib/navigation";
import { localePath, pathLocale, publicPath, type Locale } from "../lib/locale";
import type { Route } from "./+types/concept";
import { FEATURES } from "@aihot/industry/features";
import { SITE } from "@aihot/industry/site";
import { anchorOf, CONCEPT_PAGES, EACC_ENTITY, type ConceptPage } from "@aihot/industry/concepts";
import { CONCEPT_PAGES_ZH } from "@aihot/industry/concepts-zh";
import { useTranslate } from "../lib/i18n";
import { breadcrumbLd, pageMeta, siteUrl } from "../lib/seo";
import { Deck } from "../components/shell/Deck";
import { ArticleLayout, RailSection } from "../components/ui/Page";

type Slug = keyof typeof CONCEPT_PAGES;
type Lang = Locale;

const pathOf = (lang: Lang, slug: Slug) => localePath(`/${slug}`, lang);
const pageOf = (lang: Lang, slug: Slug): ConceptPage => (lang === "zh" ? CONCEPT_PAGES_ZH : CONCEPT_PAGES)[slug];

export function loader({ request }: Route.LoaderArgs) {
  // A client-side navigation asks for /<slug>.data; the page's own address is that without the suffix.
  const { pathname } = new URL(request.url);
  const lang = pathLocale(pathname);
  const slug = publicPath(pathname).replace(/^\/+|\/+$/g, "") as Slug;
  if (!FEATURES.eaccConcepts || !Object.hasOwn(CONCEPT_PAGES, slug)) throw data({ message: "not_found" }, { status: 404 });
  return { slug, lang };
}

/** Shared caches may keep this page for five minutes. */
export function headers() {
  return { "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=600" };
}

function structuredData(page: ConceptPage, lang: Lang) {
  const base = siteUrl();
  const url = `${base}${pathOf(lang, page.slug)}`;
  const inLanguage = lang === "zh" ? { inLanguage: "zh-CN" } : {};
  const main = page.terms
    ? {
        "@context": "https://schema.org",
        "@type": "DefinedTermSet",
        name: lang === "zh" ? "e/acc 术语表" : "e/acc glossary",
        url,
        ...inLanguage,
        about: EACC_ENTITY,
        hasDefinedTerm: page.terms.map((t) => ({ "@type": "DefinedTerm", "@id": `${url}#${t.id}`, name: t.term, description: t.def.replace(/<[^>]+>/g, "") })),
      }
    : {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        ...inLanguage,
        about: EACC_ENTITY,
        mainEntity: (page.faq ?? []).map(({ q, a }) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
      };
  return [main, breadcrumbLd([{ name: SITE.name, path: "/" }, { name: page.h1, path: pathOf(lang, page.slug) }])];
}

export function meta({ loaderData }: Route.MetaArgs) {
  if (!loaderData) return [{ title: "Not found · e/acc" }, { name: "robots", content: "noindex" }];
  const { slug, lang } = loaderData;
  const page = pageOf(lang, slug);
  // The title, description and og:locale describe the body, which is in the language of the address.
  return pageMeta({
    title: page.title,
    rawTitle: true,
    description: page.description,
    path: `/${slug}`,
    image: "/og.png",
    type: "article",
    jsonLd: structuredData(page, lang),
  }, lang);
}

function Html({ html, className }: { html: string; className?: string }) {
  return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}

const TEXT = {
  en: {
    htmlLang: "en",
    faq: "Frequently asked questions",
    terms: "Terms",
    other: "阅读中文版",
    otherLang: "zh-CN",
    ctaTitle: "Get the e/acc daily briefing",
    ctaBody: "A few AI stories worth reading, every day: model releases, price changes and compute expansion. Free, with one-click unsubscribe. Choose the English or Chinese edition.",
    ctaButton: "Subscribe",
  },
  zh: {
    htmlLang: "zh-CN",
    faq: "常见问题",
    terms: "术语",
    other: "Read in English",
    otherLang: "en",
    ctaTitle: "订阅 e/acc 每日简报",
    ctaBody: "每天一封 AI 圈值得看的几件事：模型发布、价格变动、算力扩张。免费，随时一键退订，可选择英文版或中文版。",
    ctaButton: "订阅",
  },
} as const;

export default function Concept() {
  const tx = useTranslate();
  const { slug, lang } = useLoaderData<typeof loader>();
  const page = pageOf(lang, slug);
  const t = TEXT[lang];
  // Each block's anchor and name: the heading's own for sections and link lists, the FAQ's and terms' fixed.
  const entries = page.blocks.map((b) =>
    b.kind === "faq" ? { id: "frequently-asked-questions", text: t.faq }
    : b.kind === "terms" ? { id: "terms", text: t.terms }
    : { id: b.id ?? anchorOf(b.heading), text: b.heading });
  return (
    <>
      <Deck compact night art="concepts/horizon" label={page.h1} kicker="e/acc" title={<span lang={t.htmlLang}>{page.h1}</span>} />
      <div className="h-6" />
      <ArticleLayout
        right={
          <RailSection title={lang === "zh" ? "目录" : tx("目录")}>
            <nav aria-label={lang === "zh" ? "目录" : tx("目录")}>
              <ol className="-ml-px space-y-0.5 border-l border-line">
                {entries.map((e) => (
                  <li key={e.id}>
                    <a href={`#${e.id}`} className="-ml-px block border-l border-transparent py-1 pl-3 text-[12.5px] leading-snug text-ink-3 transition-colors hover:border-accent hover:text-ink" lang={t.htmlLang}>{e.text}</a>
                  </li>
                ))}
              </ol>
            </nav>
          </RailSection>
        }
      >
        <article className="pb-14" lang={t.htmlLang}>
          <p className="mb-4 text-[13px]">
            <a href={pathOf(lang === "zh" ? "en" : "zh", slug)} hrefLang={t.otherLang} lang={t.otherLang} className="text-accent hover:underline">{t.other} →</a>
          </p>
          <div className="prose prose-compact">
            <Html html={page.lead} />
            {page.blocks.map((block, i) => {
              const { id, text } = entries[i]!;
              const h2 = <h2 id={id}>{text}</h2>;
              if (block.kind === "section") return <section key={id}>{h2}<Html html={block.html} /></section>;
              if (block.kind === "faq") {
                return (
                  <section key={id}>
                    {h2}
                    {(page.faq ?? []).map(({ q, a }) => (
                      <div key={q}>
                        <h3>{q}</h3>
                        <p>{a}</p>
                      </div>
                    ))}
                  </section>
                );
              }
              if (block.kind === "terms") {
                return (
                  <section key={id}>
                    {h2}
                    <ul>
                      {(page.terms ?? []).map((term) => (
                        <li key={term.id} id={term.id}><strong>{term.term}</strong> — <span dangerouslySetInnerHTML={{ __html: term.def }} /></li>
                      ))}
                    </ul>
                  </section>
                );
              }
              return (
                <section key={id}>
                  {h2}
                  <ul>
                    {block.links.map((l) => (
                      <li key={l.href}>
                        {l.href.startsWith("http") ? <a href={l.href} target="_blank" rel="noopener">{l.label}</a> : <a href={l.href}>{l.label}</a>}
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
          <aside className="mt-12 border-t border-line pt-6">
            <p className="text-[15px] font-semibold text-ink">{t.ctaTitle}</p>
            <p className="mt-1 text-[14px] leading-relaxed text-ink-3">{t.ctaBody}</p>
            <Link to="/subscribe" className="deck-button is-primary mt-4 inline-flex">{t.ctaButton}</Link>
          </aside>
        </article>
      </ArticleLayout>
    </>
  );
}
