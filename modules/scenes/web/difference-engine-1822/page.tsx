import { useEffect, useRef } from "react";
import { Link, useLocation } from "react-router";
import { localeFromMatches, translate, useLocale, useTranslate } from "@aihot/web/lib/i18n";
import { localePath } from "@aihot/web/lib/locale";
import { pageMeta } from "@aihot/web/lib/seo";
import type { Screen } from "@aihot/web/components/shell/screens";
import styles from "./workshop.css?url";

// The chronicle's own plate of this milestone (difference-engine, t = 1822): the engraving is calibrated against it,
// and it stands in for the scene without JavaScript or WebGL 2.
const PLATE = "/media/art/moments/difference-engine-1600.webp";
const CHRONICLE = "/chronicle?t=1822";

export const handle: Screen = { bare: true };
export const links = () => [{ rel: "stylesheet", href: styles }];

export function meta({ matches, location }: { matches?: Array<{ id: string; data?: unknown }>; location?: { search: string } } = {}) {
  const locale = localeFromMatches(matches ?? []);
  // Inside the chronicle's frame the page is a part of the chronicle, not a page of its own.
  const embedded = new URLSearchParams(location?.search ?? "").has("embed");
  return pageMeta({ title: translate(locale, "1822 · 差分机工坊"), description: translate(locale, "走进 1822 年的差分机工坊：转动手柄，只用加法算出平方数表。"), path: "/chronicle/difference-engine", noindex: embedded }, locale);
}

function supportsWebGL2() {
  const context = document.createElement("canvas").getContext("webgl2");
  context?.getExtension("WEBGL_lose_context")?.loseContext();
  return !!context;
}

export default function DifferenceEnginePage() {
  const locale = useLocale();
  // A new language is a new scene: its copy is written into the DOM the scene owns.
  return <Workshop key={locale} />;
}

function Workshop() {
  const tx = useTranslate();
  const locale = useLocale();
  const embedded = new URLSearchParams(useLocation().search).has("embed");
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = root.current!;
    if (!supportsWebGL2()) {
      element.querySelector<HTMLElement>("#loading")!.hidden = true;
      element.querySelector<HTMLElement>("#error")!.hidden = false;
      return;
    }
    let dispose: (() => void) | null = null, active = true;
    // three.js is its own chunk, fetched only here.
    void import("./scene.ts").then(({ start }) => { if (active) dispose = start(element, { tx, embedded, plate: PLATE }); }).catch((error: unknown) => {
      if (!active) return;
      element.querySelector<HTMLElement>("#loading")!.hidden = true;
      element.querySelector("#error-detail")!.textContent = error instanceof Error ? error.message : String(error);
      element.querySelector<HTMLElement>("#error")!.hidden = false;
    });
    return () => { active = false; dispose?.(); };
    // The scene reads `tx` once; a language change remounts the page (key above).
  }, [embedded]);
  return <div className="workshop" ref={root}>
    <main id="experience" aria-label={tx("1822 年差分机三维工坊")}>
      {/* The plate stands in until the canvas covers it, and stays when there is no WebGL 2 or no script. */}
      <div id="viewport" aria-label={tx("三维场景：拖动环视，滚轮走近，点击机器操作")}><img className="workshop-plate" src={PLATE} alt="" width={1600} height={1067} /></div>
      <div className="vignette" aria-hidden="true"></div>
      <header className="masthead">
        <button className="pill" id="back" hidden={!embedded}><span aria-hidden="true">←</span> {tx("回到时间线")}</button>
        <Link className="pill brand" to={localePath(CHRONICLE, locale)}><span aria-hidden="true">←</span> {tx("回到时间线")}</Link>
        <div className="masthead-tools">
          <button className="pill" id="reference-open">{tx("查看原画")}</button>
          <button className="pill" id="style-toggle" aria-pressed="true">{tx("画风：原画")}</button>
          <button className="pill" id="about-open">{tx("关于这一幕")}</button>
        </div>
      </header>
      <section className="intro">
        <p className="kicker">{tx("加速史 · 可进入的场景")}</p>
        <h1>1822{locale === "zh" ? <span>年</span> : null}</h1>
        <h2>{tx("差分机工坊")}</h2>
        <p className="intro-copy">{[tx("当计算，第一次有了形状。"), tx("走进黄铜与齿轮之间，"), tx("用一次转动，算出下一行未来。")].join(locale === "zh" ? "" : " ")}</p>
        <dl className="readouts" aria-live="polite">
          <div><dt>{tx("视角")}</dt><dd id="view-name">{tx("工坊全景")}</dd></div>
          <div><dt>{tx("距离")}</dt><dd id="distance">— m</dd></div>
        </dl>
      </section>
      <div id="loading" role="status"><span className="loading-ring"></span><p>{tx("正在打开工坊")}</p></div>
      <noscript><style>{".workshop #loading{display:none}"}</style></noscript>
      <div id="error" role="alert" hidden><h2>{tx("三维场景未能启动")}</h2><p>{tx("请使用支持 WebGL 2 的浏览器打开此场景。")}</p><pre id="error-detail"></pre></div>

      <nav id="hotspots" aria-label={tx("机器上的操作点")}>
        <button className="hotspot" id="spot-crank" data-action="crank" aria-label={tx("转动手柄")}><span className="spot-circle">↻</span><span className="spot-label">{tx("转动手柄")}</span></button>
        <button className="hotspot" id="spot-columns" data-action="columns" aria-label={tx("查看计算柱")}><span className="spot-circle">＋</span><span className="spot-label">{tx("计算柱")}</span></button>
        <button className="hotspot" id="spot-paper" data-action="paper" aria-label={tx("查看数表")}><span className="spot-circle">≡</span><span className="spot-label">{tx("查看数表")}</span></button>
      </nav>

      {/* On a phone the explanation and the controls share one sheet under the scene; on a desktop each has its own place. */}
      <div className="sheet">
        <aside className="inspector" aria-labelledby="inspector-title">
          <div className="inspector-head"><span className="kicker" id="inspector-kicker">{tx("有限差分")}</span><button className="icon-button" id="inspector-toggle" aria-label={tx("收起原理面板")} aria-expanded="true">−</button></div>
          <div id="inspector-body">
            <h2 id="inspector-title">{tx("只用加法，计算平方。")}</h2>
            <p id="inspector-copy">{tx("手柄带动计算柱。每一轮先把一阶差分加到结果，再把恒定的二阶差分加到一阶差分。")}</p>
            <div className="registers" aria-label={tx("差分寄存器")}>
              <div><span>{tx("结果 A")}</span><strong id="register-a">0</strong></div>
              <div><span>{tx("一阶差分 B")}</span><strong id="register-b">1</strong></div>
              <div><span>{tx("二阶差分 C")}</span><strong className="is-constant">2</strong></div>
            </div>
            <div className="ledger"><div className="ledger-head"><span>n</span><span>n²</span><span>{tx("运算")}</span></div><div id="ledger-rows" aria-live="polite"><div><span>0</span><strong>0</strong><span>{tx("初始值")}</span></div></div></div>
            <p className="machine-status"><span id="machine-dot" className="status-dot"></span><span id="machine-status" role="status">{tx("等待转动手柄")}</span></p>
          </div>
        </aside>
        <div className="dock" role="toolbar" aria-label={tx("场景控制")}>
          <div className="view-controls">
            <button id="view-wide" className="view-button is-active" aria-pressed="true">{tx("全景")}</button>
            <button id="view-close" className="view-button" aria-pressed="false">{tx("走近")}</button>
            <button id="view-side" className="view-button" aria-pressed="false">{tx("侧看")}</button>
          </div>
          <p className="dock-note"><span className="desktop-hint">{tx("拖动环视 · 滚轮走近 · WASD 行走 · 空格转动")}</span><span className="touch-hint">{tx("单指环视 · 双指缩放 · 点击标记操作")}</span><span className="disclaimer">{tx("交互概念复原 · 非 1822 年实物复刻")}</span></p>
          <div className="dock-actions">
            <button id="reset" className="icon-button reset-button" aria-label={tx("复位数表")} title={tx("复位数表")}>↺</button>
            <button id="run" className="run-button" aria-pressed="false"><span className="play-icon" aria-hidden="true">▶</span><span id="run-label">{tx("连续运转")}</span></button>
            <button id="step" className="step-button" title={tx("计算下一项（空格键）")}>{tx("转动一轮")}</button>
          </div>
        </div>
      </div>
      <div className="toast" id="toast" role="status" hidden></div>
    </main>
    <dialog id="reference-dialog"><button className="dialog-close icon-button" aria-label={tx("关闭原画")}>×</button><img src={PLATE} alt={tx("现有加速史的差分机工坊原画，黄铜计算柱与高窗工坊")} width={1600} height={1067} loading="lazy" /><div className="dialog-caption"><h2>{tx("从这幅画，走进空间。")}</h2><p>{tx("原画用于美术方向参照。眼前场景由独立三维几何构成，可以走近、环视并操作。")}</p></div></dialog>
    <dialog id="about-dialog"><button className="dialog-close icon-button" aria-label={tx("关闭说明")}>×</button><div className="about-content"><p className="kicker">{tx("加速史 · 可进入的场景")}</p><h2>{tx("让历史成为可以探索的空间。")}</h2><p>{tx("1822 年，巴贝奇提出差分机。这一幕以现有插画为美术参考，用三维机架、数轮、传动齿轮和手柄搭建一间可探索的工坊。")}</p><p>{tx("演示计算 n²：从 A = 0、B = 1、C = 2 出发，每轮依次执行 A ← A + B、B ← B + C。寄存器、机械数轮和数表保持一致。齿轮与传动动画是原理示意，未复刻完整历史机构。")}</p><p>{tx("场景为艺术概念复原；1822 年对应差分机的提出，完整工坊和机器不代表当年已存在的实物。")}</p><a href="https://www.sciencemuseum.org.uk/sites/default/files/2023-09/DE2_Technical_Description.pdf" target="_blank" rel="noopener noreferrer">{tx("阅读科学博物馆的技术说明")} ↗</a><p className="about-small">{tx("Three.js r180 · 浏览时不调用模型")}</p></div></dialog>
  </div>;
}
