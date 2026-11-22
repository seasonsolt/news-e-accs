import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { FEATURES } from "@aihot/industry/features";
import { SITE } from "@aihot/site";
import { localeFromMatches, translate, useLocale, useTranslate } from "@aihot/web/lib/i18n";
import { localePath } from "@aihot/web/lib/locale";
import { breadcrumbLd, pageMeta, siteUrl } from "@aihot/web/lib/seo";
import { artUrl } from "@aihot/web/features/chrono/art";
import { IconArrowLeft, IconArrowRight, IconChevronDown, IconClock } from "@aihot/web/components/icons";
import { WalkGuide } from "./Guide.tsx";
import guideStyles from "./guide.css?url";
import type { Screen } from "@aihot/web/components/shell/screens";
import { END_S, START_S, chapterAt, yearReading } from "./land.ts";
import styles from "./walk.css?url";

const PATH = "/chronicle/walk";
const CARD = "/media/art/walk-odyssey-og.jpg";
const title = "从火堆到巨石";
const description = "从火塘走到麦田，再到训练 AI 的机房。《加速史》的一段可行走的寓言，讲人与小麦如何改变彼此，也讲今天的人与 AI。";

export const handle: Screen = { bare: true };
export const links = () => [{ rel: "stylesheet", href: styles }, { rel: "stylesheet", href: guideStyles }];
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
    image: CARD,
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "WebApplication",
        name,
        description: summary,
        url: `${base}${path}`,
        inLanguage: locale === "zh" ? "zh-CN" : "en",
        image: `${base}${CARD}`,
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

const stages = {
  download: "正在载入三维场景",
  terrain: "正在铺设地形与天空",
  fields: "正在生成麦田",
  landmarks: "正在搭建营地、村落与巨石",
  light: "正在绘制第一帧光影",
} as const;

const route = [
  ["walk-fire", "Ⅰ", "火堆", "约一百万年前"],
  ["walk-field", "Ⅱ", "麦田", "约一万两千年前"],
  ["walk-monolith", "Ⅲ", "巨石", "今天"],
] as const;

export default function Page() {
  const locale = useLocale();
  const [lost, setLost] = useState(0);
  return <Walk key={`${locale}-${lost}`} interrupted={lost > 0} onContextLost={() => setLost(count => count + 1)} />;
}

function Walk({ interrupted, onContextLost }: { interrupted: boolean; onContextLost: () => void }) {
  const tx = useTranslate(), locale = useLocale() === "en" ? "en" : "zh";
  const root = useRef<HTMLElement>(null), startButton = useRef<HTMLButtonElement>(null);
  const attempt = useRef<AbortController | null>(null);
  const [ready, setReady] = useState(false);
  const [stage, setStage] = useState<keyof typeof stages | null>(null);
  const [error, setError] = useState(interrupted);
  useEffect(() => {
    setReady(true);
    return () => { attempt.current?.abort(); };
  }, []);
  useEffect(() => { if (ready && interrupted) startButton.current?.focus(); }, [ready, interrupted]);

  async function enter() {
    if (attempt.current || !root.current) return;
    const element = root.current, controller = new AbortController();
    const { signal } = controller;
    attempt.current = controller;
    setError(false); setStage("download");

    // Reserve audio during the gesture, before the asynchronous scene import (required on touch browsers).
    let audioContext: AudioContext | undefined;
    try {
      audioContext = new AudioContext();
      void audioContext.resume().catch(() => {});
    } catch { /* The walk can run silently. */ }
    const closeAudio = () => { if (audioContext && audioContext.state !== "closed") void audioContext.close().catch(() => {}); };
    signal.addEventListener("abort", closeAudio, { once: true });
    try {
      const { start } = await import("./world.ts");
      if (signal.aborted) return;
      await start(element, { tx, locale, signal, audioContext, onProgress: setStage, onContextLost: () => {
        if (!signal.aborted) { controller.abort(); onContextLost(); }
      } });
      if (!signal.aborted) {
        signal.removeEventListener("abort", closeAudio); // The running world's sound now owns the context.
        setStage(null);
      }
    } catch {
      if (signal.aborted) return;
      controller.abort(); attempt.current = null;
      setStage(null); setError(true);
    }
  }

  function cancel() {
    attempt.current?.abort(); attempt.current = null;
    setStage(null); startButton.current?.focus({ preventScroll: true });
  }

  const [figure, unit] = yearReading(0, locale);
  const poster = "/media/art/walk-odyssey";
  const loading = !ready || stage !== null;
  const step = stage ? Object.keys(stages).indexOf(stage) + 1 : 0;
  return <main className="walk" ref={root}>
    <div className="walk-viewport" data-walk="viewport" />
    <a className="walk-back" href={localePath("/chronicle", locale)}><IconArrowLeft size={16} /> {tx("返回加速史")}</a>
    <div className="walk-hud" data-walk="hud" hidden>
      <div className="walk-position">
        <p className="walk-chapter" data-walk="chapter" aria-live="polite">{tx(chapterAt(0))}</p>
        <div className="walk-rail" aria-hidden="true">
          {[200, 470].map(s => <i key={s} style={{ left: `${(s - START_S) / (END_S - START_S) * 100}%` }} />)}
          <b data-walk="dot" />
        </div>
      </div>
      <div className="walk-year">
        <span className="walk-year-label" data-walk="year-label">{tx("此刻走到 · 约")}</span>
        <span className="walk-year-figure"><b data-walk="year">{figure}</b><span data-walk="unit">{unit}</span></span>
      </div>
      <p className="walk-say" data-walk="say" aria-live="polite" />
      <div className="walk-controls">
        <button type="button" className="walk-use" data-walk="use" hidden><kbd aria-hidden="true">E</kbd><span data-walk="use-label" /></button>
        <button type="button" className="walk-go" data-walk="go">{tx("按住前行")}</button>
        <button type="button" className="walk-auto" data-walk="auto" aria-pressed="false">{tx("自动前行")}</button>
        <button type="button" className="walk-sound" data-walk="sound" aria-pressed="true">{tx("声音")}</button>
      </div>
    </div>
    <section className="walk-cover" data-walk="cover" aria-labelledby="walk-title">
      <div className="walk-hero">
        <picture className="walk-poster walk-intro-only">
          <source media="(max-width: 740px) and (orientation: portrait)" srcSet="/media/art/walk-odyssey-portrait.webp" />
          <img src={artUrl(poster, 1600)} srcSet={`${artUrl(poster, 800)} 800w, ${artUrl(poster, 1600)} 1600w`}
            sizes="100vw" alt="" fetchPriority="high" width={1600} height={901} />
        </picture>
        <div className="walk-intro">
          <p className="walk-kicker walk-intro-only"><span>{tx("加速史 · 第一人称漫游")}</span><span><IconClock size={14} />{tx("约两分钟")}</span></p>
          <h1 id="walk-title" data-walk="cover-title" tabIndex={-1}>
            <span>{tx("从火堆")}</span>{locale === "en" && " "}<em>{tx("到巨石")}</em>
          </h1>
          <p className="walk-lede" data-walk="cover-text">{tx("给火添柴，为来年留一把麦种。顺着田埂往前走，你会听见今天的机房。")}</p>
          <div className="walk-actions">
            {FEATURES.eaccConcepts && <Link className="walk-exit" data-walk="manifesto" to={localePath("/manifesto#wheat", locale)} hidden>{tx("读宣言里的〈小麦〉")}</Link>}
            <Link className="walk-exit" data-walk="exit" to={localePath("/chronicle", locale)} hidden>{tx("看今天的加速史")}</Link>
            <button type="button" className="walk-start" data-walk="start" ref={startButton}
              disabled={!ready} aria-busy={loading} aria-disabled={stage ? true : undefined} onClick={() => void enter()}>
              {tx(stage ? "正在打开世界" : error ? "重试" : "开始行走")}
            </button>
            <a className="walk-guide-jump walk-intro-only" href="#walk-guide">{tx("阅读图文路线")} <IconChevronDown size={15} /></a>
            <button type="button" className="walk-share" data-walk="share" hidden>{tx("分享这条路")}</button>
          </div>
          <div className="walk-loading" data-walk="loading" hidden={!loading}>
            <div className="walk-load-row">
              <span role="status" aria-atomic="true">{tx(stage ? stages[stage] : "正在准备入口")}</span>
              <span hidden={!stage} aria-hidden="true">{String(step).padStart(2, "0")} / 05</span>
              <button type="button" data-walk="cancel" hidden={!stage} onClick={cancel}>{tx("取消")}</button>
            </div>
            <progress max={5} value={step > 1 ? step - 1 : undefined} aria-label={tx("场景准备进度")} />
          </div>
          <p className="walk-error" data-walk="error" role="alert" hidden={!error}>{tx("三维场景未能打开。可以重试，或阅读下方图文路线。")}</p>
          <p className="walk-keys walk-intro-only" data-walk="cover-keys" hidden={loading || error}>
            <span className="walk-keyboard">{tx("W A S D 行走 · 拖动环视 · Shift 加快 · E 互动")}</span>
            <span className="walk-touch">{tx("拖动环视 · 按住下方按钮前行 · 或开自动前行")}</span>
          </p>
        </div>
        <nav className="walk-index walk-intro-only" aria-label={tx("沿途三幕")}>
          {route.map(([id, numeral, name, time]) => <a href={`#${id}`} key={id}>
            <span className="walk-index-num" aria-hidden="true">{numeral}</span>
            <span className="walk-index-copy"><strong>{tx(name)}</strong><small>{tx(time)}</small></span>
            <IconArrowRight size={14} />
          </a>)}
        </nav>
      </div>
      <div className="walk-intro-only"><WalkGuide tx={tx} /></div>
    </section>
  </main>;
}
