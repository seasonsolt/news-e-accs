// The e/acc concept pages (industry/concepts.ts): English explainers that rank for "e/acc", served at
// their original addresses with their original titles. The body stays English in either interface
// language; only the site's frame around it follows the reader's language.
import { data, Link, useLoaderData } from "react-router";
import type { Route } from "./+types/concept";
import { FEATURES } from "@aihot/industry/features";
import { SITE } from "@aihot/industry/site";
import { CONCEPT_PAGES, EACC_ENTITY, type ConceptPage } from "@aihot/industry/concepts";
import { useTranslate } from "../lib/i18n";
import { breadcrumbLd, pageMeta, siteUrl } from "../lib/seo";
import { Deck } from "../components/shell/Deck";
import { ArticleLayout, RailSection } from "../components/ui/Page";

type Slug = keyof typeof CONCEPT_PAGES;

export function loader({ request }: Route.LoaderArgs) {
  // A client-side navigation asks for /<slug>.data; the page's own address is that without the suffix.
  const slug = new URL(request.url).pathname.replace(/\.data$/, "").replace(/^\/+|\/+$/g, "") as Slug;
  if (!FEATURES.eaccConcepts || !(slug in CONCEPT_PAGES)) throw data({ message: "not_found" }, { status: 404 });
  return { slug };
}

/** Shared caches may keep this page for five minutes. */
export function headers() {
  return { "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=600" };
}

/** An anchor for a section heading: "Where they split" → "where-they-split". */
function anchor(heading: string): string {
  return heading.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function structuredData(page: ConceptPage) {
  const base = siteUrl();
  const main = page.terms
    ? {
        "@context": "https://schema.org",
        "@type": "DefinedTermSet",
        name: "e/acc glossary",
        url: `${base}/${page.slug}`,
        about: EACC_ENTITY,
        hasDefinedTerm: page.terms.map((t) => ({ "@type": "DefinedTerm", "@id": `${base}/${page.slug}#${t.id}`, name: t.term, description: t.def.replace(/<[^>]+>/g, "") })),
      }
    : {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        about: EACC_ENTITY,
        mainEntity: (page.faq ?? []).map(({ q, a }) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
      };
  return [main, breadcrumbLd([{ name: SITE.name, path: "/" }, { name: page.h1, path: `/${page.slug}` }])];
}

export function meta({ loaderData }: Route.MetaArgs) {
  if (!loaderData) return [{ title: "Not found · e/acc" }, { name: "robots", content: "noindex" }];
  const page = CONCEPT_PAGES[loaderData.slug];
  // English whatever the interface language: the title, description and og:locale describe the body.
  return pageMeta({ title: page.title, rawTitle: true, description: page.description, path: `/${page.slug}`, image: "/og.png", type: "article", jsonLd: structuredData(page) }, "en");
}

function Html({ html, className }: { html: string; className?: string }) {
  return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}

export default function Concept() {
  const tx = useTranslate();
  const { slug } = useLoaderData<typeof loader>();
  const page = CONCEPT_PAGES[slug];
  const headings = page.blocks.map((b) => (b.kind === "faq" ? "Frequently asked questions" : b.kind === "terms" ? "Terms" : b.heading));
  return (
    <>
      <Deck compact label={page.h1} kicker="e/acc" title={<span lang="en">{page.h1}</span>} />
      <div className="h-6" />
      <ArticleLayout
        right={
          <RailSection title={tx("目录")}>
            <nav aria-label={tx("目录")}>
              <ol className="-ml-px space-y-0.5 border-l border-line">
                {headings.map((h) => (
                  <li key={h}>
                    <a href={`#${anchor(h)}`} className="-ml-px block border-l border-transparent py-1 pl-3 text-[12.5px] leading-snug text-ink-3 transition-colors hover:border-accent hover:text-ink" lang="en">{h}</a>
                  </li>
                ))}
              </ol>
            </nav>
          </RailSection>
        }
      >
        <article className="pb-14" lang="en">
          <div className="prose prose-compact">
            <Html html={page.lead} />
            {page.blocks.map((block, i) => {
              const heading = headings[i]!;
              const h2 = <h2 id={anchor(heading)}>{heading}</h2>;
              if (block.kind === "section") return <section key={heading}>{h2}<Html html={block.html} /></section>;
              if (block.kind === "faq") {
                return (
                  <section key={heading}>
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
                  <section key={heading}>
                    {h2}
                    <ul>
                      {(page.terms ?? []).map((t) => (
                        <li key={t.id} id={t.id}><strong>{t.term}</strong> — <span dangerouslySetInnerHTML={{ __html: t.def }} /></li>
                      ))}
                    </ul>
                  </section>
                );
              }
              return (
                <section key={heading}>
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
            <p className="text-[15px] font-semibold text-ink">Get the e/acc daily briefing</p>
            <p className="mt-1 text-[14px] leading-relaxed text-ink-3">A few AI stories worth reading, every day at 08:00 (UTC+8): model releases, price changes and compute expansion. Free, with one-click unsubscribe. Briefings currently use Chinese.</p>
            <Link to="/subscribe" className="deck-button is-primary mt-4 inline-flex">Subscribe</Link>
          </aside>
        </article>
      </ArticleLayout>
    </>
  );
}
