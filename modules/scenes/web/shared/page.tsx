import { useEffect, useRef } from "react";
import { Link, useLocation } from "react-router";
import { localeFromMatches, translate, useLocale, useTranslate } from "@aihot/web/lib/i18n";
import { localePath } from "@aihot/web/lib/locale";
import { pageMeta } from "@aihot/web/lib/seo";
import { artSrcSet, artUrl } from "@aihot/web/features/chrono/art";
import type { Screen } from "@aihot/web/components/shell/screens";
import { WORLDS, type World } from "./worlds.ts";
import base from "../difference-engine-1822/workshop.css?url";
import styles from "./world.css?url";

export const handle: Screen = { bare: true };
export const links = () => [{ rel: "stylesheet", href: base }, { rel: "stylesheet", href: styles }];
export function worldMeta(world: World, { matches, location }: { matches?: Array<{ id: string; data?: unknown }>; location?: { search: string } } = {}) {
  const locale = localeFromMatches(matches ?? []);
  return pageMeta({ title: translate(locale, world.title), description: translate(locale, world.subtitle), path: world.path, noindex: new URLSearchParams(location?.search ?? "").has("embed") }, locale);
}

export function WorldPage({ world }: { world: World }) {
  const locale = useLocale();
  return <WorldExperience key={`${world.id}-${locale}`} world={world} />;
}

function WorldExperience({ world }: { world: World }) {
  const tx = useTranslate(), locale = useLocale();
  const embedded = new URLSearchParams(useLocation().search).has("embed");
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = root.current!;
    let active = true, dispose: (() => void) | undefined;
    void import("./experience.ts").then(({ start }) => {
      if (active) dispose = start(element, world, { tx, embedded });
    }).catch((error: unknown) => {
      if (!active) return;
      element.querySelector<HTMLElement>("#loading")!.hidden = true;
      element.querySelector<HTMLElement>("#error")!.hidden = false;
      element.querySelector("#error-detail")!.textContent = error instanceof Error ? error.message : String(error);
    });
    return () => { active = false; dispose?.(); };
  }, [world, embedded]);
  const phase = world.phases[0]!;
  const [figure, unit] = locale === "en" && world.englishDate ? world.englishDate : [world.figure, tx(world.unit)];
  const next = world.next === "difference-engine-1822" ? { path: "/chronicle/difference-engine", title: "差分机工坊" } : WORLDS[world.next];
  // The challenge's controls give way to this card when the workshop is finished (experience.ts fills it).
  const done = <div id="done-card" className="done-card" role="group" aria-labelledby="done-heading" tabIndex={-1} hidden>
    <p className="done-heading"><span aria-hidden="true">✓</span><span id="done-heading">{tx("挑战完成")}</span></p>
    <dl className="done-stats" id="done-stats">
      <div><dt>{tx("用时")}</dt><dd id="done-time">—</dd></div>
      <div><dt>{tx("操作次数")}</dt><dd id="done-steps">—</dd></div>
      <div><dt>{tx("最快")}</dt><dd id="done-best-time">—</dd></div>
      <div><dt>{tx("最少操作")}</dt><dd id="done-best-steps">—</dd></div>
    </dl>
    <p className="done-note" id="done-note" hidden />
    <div className="done-actions">
      <Link className="done-next" to={localePath(next.path, locale)}>{tx("下一站")} · {tx(next.title)} →</Link>
      <button id="done-again" type="button">{tx("再玩一次")}</button>
      <Link to={localePath("/chronicle/workshops", locale)}>{tx("全部工坊")}</Link>
    </div>
  </div>;
  return <div className={`workshop world world-${world.id}${world.challenge ? " is-challenge" : ""}`} ref={root}>
    <main id="experience" aria-label={tx(world.title)}>
      <div id="viewport" aria-label={tx("三维场景：拖动环视，滚轮走近，点击机器操作")}><img className="workshop-plate" src={artUrl(world.plate.replace(/-1600\.webp$/, ""), 1600)} alt="" width={1600} height={1067} /></div>
      <div className="vignette" aria-hidden="true" />
      <header className="masthead">
        <button className="pill" id="back" hidden={!embedded}>← {tx("回到时间线")}</button>
        <Link className="pill brand" to={localePath(`/chronicle?t=${world.time}`, locale)}>← {tx("回到时间线")}</Link>
        <div className="masthead-tools"><button className="pill" id="reference-open">{tx("查看原画")}</button><button className="pill" id="about-open">{tx("关于这一幕")}</button></div>
      </header>
      <section className="intro"><p className="kicker">{tx("加速史 · 可进入的场景")}</p><h1>{figure}<span>{unit}</span></h1><h2>{tx(world.title)}</h2><p className="intro-copy">{tx(world.subtitle)}</p><dl className="readouts"><div><dt>{tx("视角")}</dt><dd id="view-name">{tx("全景")}</dd></div><div><dt>{tx(world.unitLabel)}</dt><dd id="distance">—</dd></div></dl></section>
      <div id="loading" role="status"><span className="loading-ring" /><p>{tx("正在打开场景…")}</p></div>
      <noscript><style>{".world #loading{display:none}"}</style></noscript>
      <div id="error" role="alert" hidden><h2>{tx("三维场景未能启动")}</h2><p>{tx("请使用支持 WebGL 2 的浏览器打开此场景。")}</p><pre id="error-detail" /></div>
      <nav id="hotspots" aria-label={tx("场景探索点")} />
      <div className="sheet">
        <aside className="inspector" id="inspector-panel" aria-labelledby="inspector-title">
          <div className="inspector-head"><span className="kicker">{tx(world.id === "agents-2026" ? "从想法到交付" : "演化手记")}</span><button className="icon-button" id="inspector-toggle" aria-label={tx("收起原理面板")} aria-expanded="true">−</button></div>
          <div id="inspector-body"><p className="phase-index" id="phase-index">01 / 0{world.phases.length}</p><h2 id="inspector-title">{tx(phase.title)}</h2><p id="inspector-copy">{tx(phase.detail)}</p>
            <div className="world-readings">{world.readingLabels.map((label, i) => <div key={label}><span>{tx(label)}</span><strong id={`reading-${i}`}>{tx(phase.readings[i]!)}</strong></div>)}</div>
            {world.challenge && <p className="machine-status"><span className="status-dot" id="machine-dot" /><span id="machine-status" role="status">{tx("点击场景中的标记开始探索")}</span></p>}
            {world.challenge && <div id="game-controls" className="game-controls" role="group" aria-label={tx("工坊操作")} />}
            {world.challenge && done}
            <ol className="phase-track" aria-label={tx("演示阶段")}>{world.phases.map((p, i) => <li key={p.title}><button data-phase={i} disabled={world.challenge} aria-current={i === 0 ? "step" : undefined}><span>{String(i + 1).padStart(2, "0")}</span>{tx(p.readings[0])}</button></li>)}</ol>
            {!world.challenge && <p className="machine-status"><span className="status-dot" id="machine-dot" /><span id="machine-status" role="status">{tx("点击场景中的标记开始探索")}</span></p>}
            {!world.challenge && done}
          </div>
        </aside>
        <div className="dock" role="toolbar" aria-label={tx("场景控制")}>
          <div className="view-controls">{["全景", "走近", "侧看"].map((label, i) => <button id={`view-${["wide", "close", "side"][i]}`} className={`view-button${i === 0 ? " is-active" : ""}`} aria-pressed={i === 0} key={label}>{tx(label)}</button>)}</div>
          <p className="dock-note"><span className="desktop-hint">{tx("拖动环视 · 滚轮走近 · WASD 移动 · 空格推进")}</span><span className="touch-hint">{tx("单指环视 · 双指缩放 · 点击标记操作")}</span><span className="disclaimer">{tx("艺术与原理示意")}</span></p>
          <div className="dock-actions"><button id="reset" className="icon-button reset-button" aria-label={tx("重新开始")}>↺</button><button id="run" className="run-button" aria-pressed="false"><span className="play-icon" aria-hidden="true">▶</span><span id="run-label">{tx("自动演示")}</span></button><button id="step" className="step-button">{tx(world.action)}</button></div>
        </div>
      </div>
      <div id="toast" className="toast" role="status" hidden />
    </main>
    <dialog id="reference-dialog"><button className="dialog-close icon-button" aria-label={tx("关闭原画")}>×</button><img src={artUrl(world.plate.replace(/-1600\.webp$/, ""), 1600)} srcSet={artSrcSet(world.plate.replace(/-1600\.webp$/, ""))} sizes="(min-width: 1142px) 1050px, 92vw" alt={tx(world.title)} width={1600} height={1067} loading="lazy" /><div className="dialog-caption"><h2>{tx("从这幅画，走进空间。")}</h2><p>{tx("原画用于美术方向参照。眼前场景由独立三维几何构成，可以走近、环视并操作。")}</p></div></dialog>
    <dialog id="about-dialog"><button className="dialog-close icon-button" aria-label={tx("关闭说明")}>×</button><div className="about-content"><p className="kicker">{tx("加速史 · 可进入的场景")}</p><h2>{tx(world.title)}</h2><p>{tx(world.note)}</p><a href={world.source} target="_blank" rel="noopener noreferrer">{tx("阅读背景资料")} ↗</a><div className="world-links"><span>{tx("下一站")}</span><Link to={localePath(next.path, locale)}>{tx(next.title)} →</Link></div><div className="world-links"><Link to={localePath("/chronicle/workshops", locale)}>{tx("时代工坊")} →</Link></div></div></dialog>
  </div>;
}
