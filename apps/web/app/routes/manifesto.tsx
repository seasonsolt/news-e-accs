// The Adventist Manifesto (industry/manifesto.ts): the site's founding view, at /manifesto and its
// Chinese edition at /zh/manifesto. On the night ground of the menu pages: the slab at sunset across the
// first screen, the nine sections beside their contents, then the closing lines. The address decides the
// language of the text and the frame, and pageMeta names the editions as each other's hreflang alternates.
import { useState } from "react";
import { data, useLoaderData } from "react-router";
import { FEATURES } from "@aihot/industry/features";
import { MANIFESTO, MANIFESTO_ART, MANIFESTO_AUTHOR, MANIFESTO_CARD, MANIFESTO_PUBLISHED, type ManifestoBlock } from "@aihot/industry/manifesto";
import { SITE } from "@aihot/site";
import { Link } from "../lib/navigation";
import { localeFromMatches, useLocale, useTranslate } from "../lib/i18n";
import { localePath, type Locale } from "../lib/locale";
import { apiGet, edgeTtl } from "../lib/api.server";
import { webModules } from "../site-modules";
import { breadcrumbLd, pageMeta, siteUrl } from "../lib/seo";
import { Plate } from "../components/shell/Deck";
import { shareOrCopy } from "../features/item/share";

const PATH = "/manifesto";

export function headers() {
  return edgeTtl(300);
}

/** What the closing list reads of the essays module's list (modules/essays/contracts.ts PublicEssayList). */
interface EssayLink { slug: string; title: string; dek: string }

export async function loader({ request }: { request: Request }) {
  if (!FEATURES.eaccConcepts) throw data({ message: "not_found" }, { status: 404 });
  // The author's signed essays under the closing lines, when the site runs the essays module; the page stands without them.
  const essays = webModules().some((m) => m.name === "essays")
    ? await apiGet<{ essays: EssayLink[] }>("/api/site/essays", { request, signal: request.signal }).then((r) => r.essays.slice(0, 5).map(({ slug, title, dek }) => ({ slug, title, dek }))).catch(() => null)
    : null;
  return { essays };
}

function structuredData(locale: Locale) {
  const text = MANIFESTO[locale];
  const base = siteUrl();
  const path = localePath(PATH, locale);
  return [
    {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: text.h1,
      description: text.description,
      url: `${base}${path}`,
      inLanguage: locale === "zh" ? "zh-CN" : "en",
      image: `${base}${MANIFESTO_CARD}`,
      datePublished: MANIFESTO_PUBLISHED,
      dateModified: MANIFESTO_PUBLISHED,
      author: { "@type": "Person", name: MANIFESTO_AUTHOR, url: `${base}${localePath("/about", locale)}` },
      publisher: { "@type": "Organization", name: SITE.organization.name, url: base, logo: `${base}/icon.png` },
    },
    breadcrumbLd([{ name: SITE.name, path: localePath("/", locale) }, { name: text.h1, path }]),
  ];
}

export function meta({ matches }: { matches?: Array<{ id: string; data?: unknown }> } = {}) {
  const locale = localeFromMatches(matches ?? []);
  const text = MANIFESTO[locale];
  return pageMeta({ title: text.title, rawTitle: true, description: text.description, path: PATH, type: "article", publishedTime: MANIFESTO_PUBLISHED, image: MANIFESTO_CARD, jsonLd: structuredData(locale) }, locale);
}

function Block({ block }: { block: ManifestoBlock }) {
  switch (block.kind) {
    case "p":
      return <p dangerouslySetInnerHTML={{ __html: block.html }} />;
    case "thesis":
      return <p className="manifesto-thesis">{block.text}</p>;
    case "quote":
      return <blockquote className="manifesto-quote">{block.text}</blockquote>;
    case "list":
      return <ul className="manifesto-list">{block.items.map((item) => <li key={item}>{item}</li>)}</ul>;
    case "contrast":
      return (
        <div className="manifesto-contrast">
          <div><span className="manifesto-label">{block.theirs.label}</span><p>{block.theirs.text}</p></div>
          <div className="is-ours"><span className="manifesto-label">{block.ours.label}</span><p>{block.ours.text}</p></div>
        </div>
      );
    case "tenets":
      return (
        <ol className="manifesto-tenets">
          {block.items.map((item, i) => <li key={item}><span className="manifesto-tenet-n" aria-hidden="true">{String(i + 1).padStart(2, "0")}</span><p>{item}</p></li>)}
        </ol>
      );
    case "refusals":
      return <ul className="manifesto-refusals">{block.items.map((item) => <li key={item}><span aria-hidden="true">×</span><span>{item}</span></li>)}</ul>;
    case "record":
      return (
        <Link to={block.href} className="manifesto-record">
          <svg viewBox="0 0 220 90" width="180" height="74" aria-hidden="true">
            <line x1="0" y1="89" x2="220" y2="89" stroke="currentColor" strokeOpacity=".25" />
            <path d="M0 10 C60 18 100 40 140 62 C170 76 195 84 220 86" fill="none" stroke="var(--brass)" strokeWidth="2" />
          </svg>
          <span><span className="manifesto-label">{block.label}</span><span className="manifesto-record-text">{block.text}</span></span>
        </Link>
      );
  }
}

export default function ManifestoPage() {
  const { essays } = useLoaderData<typeof loader>();
  const locale = useLocale();
  const text = MANIFESTO[locale];
  const other: Locale = locale === "zh" ? "en" : "zh";
  const lang = locale === "zh" ? "zh-CN" : "en";
  const [shared, setShared] = useState(false);
  const share = async () => {
    const result = await shareOrCopy(text.h1, `${window.location.origin}${localePath(PATH, locale)}`);
    if (result === "copied") setShared(true);
  };
  return (
    <div className="manifesto" lang={lang}>
      <section className="manifesto-hero" aria-labelledby="manifesto-title">
        <Plate src={`/media/art/${MANIFESTO_ART}`} alt={text.imageAlt} className="manifesto-plate" />
        <div className="manifesto-shade" aria-hidden="true" />
        <div className="manifesto-hero-inner">
          <div className="manifesto-kicker">{text.kicker}</div>
          <h1 id="manifesto-title" className="manifesto-title">{text.h1}</h1>
          {text.alias && <p className="manifesto-alias" lang="en">{text.alias}</p>}
          <p className="manifesto-lead">{text.lead}</p>
          <div className="manifesto-actions">
            <a href={`#${text.sections[0]!.id}`} className="deck-button is-primary">{text.read}</a>
            <span>{text.byline}</span>
          </div>
          <p className="manifesto-mark">{text.mark}</p>
        </div>
      </section>

      <div className="manifesto-body">
        <aside className="manifesto-aside">
          <nav aria-label={text.contents}>
            <p className="manifesto-label">{text.contents}</p>
            <ol>
              {text.sections.map((s) => <li key={s.id}><a href={`#${s.id}`}>{s.numeral} · {s.short}</a></li>)}
            </ol>
          </nav>
          <p className="manifesto-explainer">{text.explainer.text} <Link to={text.explainer.href}>{text.explainer.label}</Link></p>
        </aside>
        <article className="manifesto-article">
          <p className="manifesto-definition">{text.definition}</p>
          {text.sections.map((s) => (
            <section key={s.id} id={s.id} className="manifesto-section" aria-labelledby={`${s.id}-heading`}>
              <p className="manifesto-numeral" aria-hidden="true">{s.numeral}</p>
              <h2 id={`${s.id}-heading`} dangerouslySetInnerHTML={{ __html: s.heading }} />
              {s.blocks.map((b, i) => <Block key={i} block={b} />)}
            </section>
          ))}
        </article>
      </div>

      <section className="manifesto-closing" aria-label={text.closing.god.join(" ")}>
        <p className="manifesto-god">{text.closing.god[0]}<br />{text.closing.god[1]}</p>
        <p className="manifesto-arrival">{text.closing.arrival}</p>
        <p className="manifesto-dream">{text.closing.dream}</p>
        <p className="manifesto-signature">{text.closing.signature}</p>
        <p className="manifesto-note">{text.closing.note}</p>
        <div className="manifesto-more">
          {FEATURES.timeMachine && webModules().some((m) => m.name === "scenes") && <Link to="/chronicle/walk" className="deck-button is-primary">{text.more.walk}</Link>}
          <button type="button" className="deck-button" onClick={share}>{shared ? text.more.copied : text.more.share}</button>
          <a href={localePath(PATH, other)} hrefLang={other === "zh" ? "zh-CN" : "en"} lang={other === "zh" ? "zh-CN" : "en"} className="deck-button">{text.more.other}</a>
          <Link to="/what-is-eacc" className="deck-button">{text.more.whatIs}</Link>
        </div>
      </section>
      {essays && essays.length > 0 && <ManifestoEssays essays={essays} />}
    </div>
  );
}

/** The author's essays after the closing lines: where the manifesto's view is argued at length. */
function ManifestoEssays({ essays }: { essays: EssayLink[] }) {
  const tx = useTranslate();
  return (
    <section className="mx-auto max-w-[720px] px-0 pb-16 pt-4" aria-labelledby="manifesto-essays">
      <h2 id="manifesto-essays" className="manifesto-label">{tx("长文")}</h2>
      <ul className="mt-4 divide-y divide-line border-y border-line">
        {essays.map((e) => (
          <li key={e.slug}>
            <Link to={`/essays/${e.slug}`} prefetch="intent" className="group flex flex-col gap-1 py-4">
              <span className="text-[18px] font-semibold leading-snug text-ink group-hover:text-accent">{e.title}</span>
              <span className="text-[14.5px] leading-relaxed text-ink-3">{e.dek}</span>
            </Link>
          </li>
        ))}
      </ul>
      <Link to="/essays" className="mt-4 inline-flex min-h-[44px] items-center text-[14.5px] text-accent">{tx("全部长文")} →</Link>
    </section>
  );
}
