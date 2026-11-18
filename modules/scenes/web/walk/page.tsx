import { useEffect, useRef } from "react";
import { Link } from "react-router";
import { FEATURES } from "@aihot/industry/features";
import { MANIFESTO_CARD } from "@aihot/industry/manifesto";
import { SITE } from "@aihot/site";
import { localeFromMatches, translate, useLocale, useTranslate } from "@aihot/web/lib/i18n";
import { localePath } from "@aihot/web/lib/locale";
import { breadcrumbLd, pageMeta, siteUrl } from "@aihot/web/lib/seo";
import { artUrl } from "@aihot/web/features/chrono/art";
import type { Screen } from "@aihot/web/components/shell/screens";
import { END_S, chapterAt, yearReading } from "./land.ts";
import styles from "./walk.css?url";

const PATH = "/chronicle/walk";
const title = "从火堆到巨石";
const description = "一百万年，一条路。夜里的火，清晨的田，下午的麦子，和麦田中央那块石头，都在同一个世界里。";

export const handle: Screen = { bare: true };
export const links = () => [{ rel: "stylesheet", href: styles }];
export function headers() {
  return { "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=600" };
}
export function meta({ matches }: { matches?: Array<{ id: string; data?: unknown }> } = {}) {
  const locale = localeFromMatches(matches ?? []);
  const base = siteUrl(), path = localePath(PATH, locale);
  const name = translate(locale, title), summary = translate(locale, description);
  return pageMeta({
    title: name,
    description: summary,
    path: PATH,
    image: MANIFESTO_CARD,
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "WebApplication",
        name,
        description: summary,
        url: `${base}${path}`,
        inLanguage: locale === "zh" ? "zh-CN" : "en",
        image: `${base}${MANIFESTO_CARD}`,
        applicationCategory: "MultimediaApplication",
        operatingSystem: "Any",
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        author: { "@type": "Organization", name: SITE.organization.name, url: base },
      },
      breadcrumbLd([
        { name: SITE.name, path: localePath("/", locale) },
        { name: translate(locale, "加速史"), path: localePath("/chronicle", locale) },
        { name, path },
      ]),
    ],
  }, locale);
}

export default function Page() {
  const locale = useLocale();
  return <Walk key={locale} />;
}

function Walk() {
  const tx = useTranslate(), locale = useLocale() === "en" ? "en" : "zh";
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = root.current!, abort = new AbortController();
    let dispose: (() => void) | undefined;
    void import("./world.ts").then(({ start }) => start(element, { tx, locale, signal: abort.signal })).then((close) => {
      if (!abort.signal.aborted) dispose = close; else close();
    }).catch((error: unknown) => {
      if (abort.signal.aborted) return;
      const note = element.querySelector<HTMLElement>('[data-walk="error"]')!;
      note.hidden = false; note.textContent = `${tx("这个世界没有打开")} · ${error instanceof Error ? error.message : String(error)}`;
      element.querySelector<HTMLElement>('[data-walk="start"]')!.hidden = true;
    });
    return () => { abort.abort(); dispose?.(); };
  }, [locale]);
  const [figure, unit] = yearReading(0, locale);
  const tick1 = `${((200 - 4) / (END_S - 4)) * 100}%`, tick2 = `${((470 - 4) / (END_S - 4)) * 100}%`;
  return <div className="walk" ref={root}>
    <div className="walk-viewport" data-walk="viewport"><img className="walk-plate" src={artUrl("/media/art/epochs/taming-fire", 1600)} alt="" width={1600} height={1067} /></div>
    <header className="walk-top">
      <Link className="walk-back" to={localePath("/chronicle", locale)}>← {tx("返回加速史")}</Link>
      <p className="walk-chapter" data-walk="chapter">{tx(chapterAt(0))}</p>
    </header>
    <div className="walk-year" aria-live="off">
      <span className="walk-year-label" data-walk="year-label">{tx("此刻走到 · 约")}</span>
      <span className="walk-year-figure"><b data-walk="year">{figure}</b><span data-walk="unit">{unit}</span></span>
    </div>
    <div className="walk-rail" aria-hidden="true"><span>{tx("火")}</span><i><u style={{ top: tick1 }} /><u style={{ top: tick2 }} /><b data-walk="dot" /></i><span>{tx("碑")}</span></div>
    <p className="walk-say" data-walk="say" aria-live="polite" />
    <div className="walk-controls">
      <button type="button" className="walk-use" data-walk="use" hidden><kbd aria-hidden="true">E</kbd><span data-walk="use-label" /></button>
      <button type="button" className="walk-go" data-walk="go">{tx("按住前行")}</button>
      <button type="button" className="walk-auto" data-walk="auto" aria-pressed="false">{tx("自动前行")}</button>
      <button type="button" className="walk-sound" data-walk="sound" aria-pressed="true">{tx("声音")}</button>
    </div>
    <section className="walk-cover" data-walk="cover" aria-labelledby="walk-title">
      <p className="walk-kicker">{tx("加速史 · 一条走得通的路")}</p>
      <h1 id="walk-title" data-walk="cover-title">{tx(title)}</h1>
      <p className="walk-lede" data-walk="cover-text">{tx(description)}</p>
      <div className="walk-actions">
        <button type="button" className="walk-start" data-walk="start" disabled>{tx("正在打开世界")}</button>
        {/* Shown at the end of the road, beside 再走一遍. */}
        <Link className="walk-exit" data-walk="exit" to={localePath("/chronicle", locale)} hidden>{tx("返回加速史")}</Link>
        {FEATURES.eaccConcepts && <Link className="walk-exit" data-walk="manifesto" to={localePath("/manifesto", locale)} hidden>{tx("读《降临派宣言》")}</Link>}
        <button type="button" className="walk-share" data-walk="share" hidden>{tx("分享这条路")}</button>
      </div>
      <p className="walk-error" data-walk="error" role="alert" hidden />
      <p className="walk-keys" data-walk="cover-keys" />
    </section>
  </div>;
}
