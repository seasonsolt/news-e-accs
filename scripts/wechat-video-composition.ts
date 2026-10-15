// The picture of the 视频号 「AI 早报」 video as a HyperFrames composition (HTML and a paused GSAP timeline,
// rendered frame by frame in headless Chrome by `npx hyperframes render`): a title card, one card per
// entry and a closing card, cut on the voice, with the words subtitled as they are said. Laid out on the
// deck of the issue's theme like the 公众号 cover, and kept clear of the top and bottom bands 视频号
// covers with its own name, caption and buttons. The sound is mixed apart by scripts/wechat-video.ts.
import { SITE } from "@aihot/site";
import { WECHAT_COLUMN, WECHAT_THEMES } from "../packages/backend/src/newsletter/wechat.ts";
import type { WechatVideoSpec } from "../packages/backend/src/newsletter/wechat-video.ts";

export const VIDEO_SIZE = { width: 1080, height: 1920 } as const;
/** The bands 视频号 lays its own controls over; nothing that must be read goes there. */
const SAFE_TOP = 170;
const SAFE_BOTTOM = 420;
/** Pinned so a cut renders the same next month; HyperFrames' own examples load it from here. */
const GSAP = "https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js";

/** The video's timing, in seconds from its start, worked out from the voice. */
export interface Cut {
  spec: WechatVideoSpec;
  duration: number;
  /** One per card, in order: the opening, each entry, the closing. */
  scenes: Array<{ start: number; end: number }>;
  subtitles: Array<{ start: number; end: number; tokens: Array<{ text: string; at: number }> }>;
  /** Each entry's picture, by entry key, as a path inside the composition's folder. */
  images: Record<string, string>;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Text cut into what animates as one piece: a Latin word or number whole (so it wraps whole), any other
 * character alone, spaces kept between.
 */
export function tokens(text: string): string[] {
  return text.match(/[A-Za-z0-9][A-Za-z0-9.%+@'’-]*|\s+|[^\s]/gu) ?? [];
}

const spans = (text: string, cls: string) => tokens(text).map((t) => (/^\s+$/.test(t) ? " " : `<span class="${cls}">${esc(t)}</span>`)).join("");

function titleSize(title: string): number {
  const n = Array.from(title).length;
  return n <= 26 ? 72 : n <= 40 ? 62 : 54;
}

function opening(spec: WechatVideoSpec): string {
  const [, m, d] = spec.date.split("-");
  return `<div class="stage push">
      <div class="kicker">第 ${spec.issueNumber} 期 · ${spec.segments.length} 条</div>
      <h1 class="column">${spans(WECHAT_COLUMN, "tk")}</h1>
      <div class="date">${m}.${d}</div>
      <ol class="heads">${spec.segments.map((s) => `<li><b>${pad(s.number)}</b><span>${esc(s.title)}</span></li>`).join("")}</ol>
    </div>`;
}

function entry(s: WechatVideoSpec["segments"][number], total: number, image: string | undefined): string {
  const picture = image
    ? `<div class="pic"><img src="${esc(image)}" alt=""></div>`
    : `<div class="pic none"><span>${esc(s.section)}</span></div>`;
  return `<div class="stage push">
      <div class="row">
        <div class="num">${pad(s.number)}</div>
        <div class="meta"><span class="chip">${esc(s.section)}</span><span class="src">${esc(s.sourceName)}</span></div>
        <div class="of">/ ${pad(total)}</div>
      </div>
      <h2 class="title" style="font-size:${titleSize(s.title)}px">${spans(s.title, "tk")}</h2>
      ${picture}
    </div>`;
}

function closing(spec: WechatVideoSpec): string {
  return `<div class="stage push end">
      <div class="mark big"><i></i>${esc(SITE.name)}</div>
      <div class="host">${esc(spec.site)}</div>
      <div class="note">${esc(WECHAT_COLUMN)}每天 08:00 更新</div>
    </div>`;
}

/** The composition's index.html; `fonts` is the folder of the Noto Sans SC files inside the project. */
export function composition(cut: Cut, fonts: string): string {
  const C = WECHAT_THEMES[cut.spec.theme].palette;
  const { spec } = cut;
  const [, m, d] = spec.date.split("-");
  const t = (n: number) => n.toFixed(3);
  const cards = [opening(spec), ...spec.segments.map((s) => entry(s, spec.segments.length, cut.images[s.key])), closing(spec)];
  const scenes = cards.map((html, k) => {
    const s = cut.scenes[k]!;
    return `<section id="scene-${k}" class="clip scene" data-start="${t(s.start)}" data-duration="${t(s.end - s.start)}" data-track-index="1">
    ${html}
  </section>`;
  });
  const subtitles = cut.subtitles.map((s, k) =>
    `<div id="sub-${k}" class="clip sub" data-start="${t(s.start)}" data-duration="${t(s.end - s.start)}" data-track-index="2"><p>${
      s.tokens.map((x) => (/^\s+$/.test(x.text) ? " " : `<span class="w">${esc(x.text)}</span>`)).join("")}</p></div>`);
  const timing = {
    duration: cut.duration,
    scenes: cut.scenes,
    entries: spec.segments.length,
    subtitles: cut.subtitles.map((s) => s.tokens.filter((x) => !/^\s+$/.test(x.text)).map((x) => x.at)),
  };
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=${VIDEO_SIZE.width}, height=${VIDEO_SIZE.height}">
<title>${esc(WECHAT_COLUMN)} ${esc(spec.date)}</title>
<script src="${GSAP}"></script>
<style>
@font-face { font-family: "Noto Sans SC"; font-weight: 400; src: url("${fonts}/noto-sans-sc-400.ttf"); }
@font-face { font-family: "Noto Sans SC"; font-weight: 700; src: url("${fonts}/noto-sans-sc-700.ttf"); }
:root { --deck: ${C.deck}; --ink: ${C.deckInk}; --dim: ${C.deckDim}; --heat: ${C.heat}; --hi: ${C.heatHi}; --brass: ${C.brass}; }
* { box-sizing: border-box; }
body { margin: 0; background: var(--deck); color: var(--ink); font-family: "Noto Sans SC", sans-serif; }
#root { position: relative; width: ${VIDEO_SIZE.width}px; height: ${VIDEO_SIZE.height}px; overflow: hidden; background: var(--deck); }
.glow { position: absolute; width: 1500px; height: 1500px; border-radius: 50%; }
.glow.a { left: 240px; top: -760px; background: radial-gradient(circle, ${C.heat}40 0%, ${C.heat}00 62%); }
.glow.b { left: -760px; top: 1100px; background: radial-gradient(circle, ${C.heat}30 0%, ${C.heat}00 60%); }
.dots { position: absolute; inset: 0; background-image: radial-gradient(circle, rgba(255,255,255,0.07) 1.6px, transparent 1.6px); background-size: 54px 54px;
  -webkit-mask-image: linear-gradient(180deg, transparent 0%, #000 30%, #000 70%, transparent 100%); }
.top { position: absolute; top: ${SAFE_TOP}px; left: 60px; right: 60px; display: flex; align-items: center; justify-content: space-between; }
.mark { display: flex; align-items: center; font-size: 40px; font-weight: 700; color: var(--ink); }
.mark i { display: block; width: 15px; height: 15px; border-radius: 50%; background: var(--heat); margin-right: 12px; }
.issue { font-size: 32px; font-weight: 700; letter-spacing: 4px; color: var(--dim); }
.bar { position: absolute; top: ${SAFE_TOP + 78}px; left: 60px; right: 60px; display: flex; gap: 10px; }
.seg { flex: 1; height: 6px; border-radius: 3px; background: rgba(255,255,255,0.14); overflow: hidden; }
.seg b { display: block; width: 100%; height: 100%; background: var(--heat); transform-origin: 0 50%; }
.scene { position: absolute; inset: 0; }
.stage { position: absolute; left: 60px; right: 60px; top: ${SAFE_TOP + 140}px; bottom: ${SAFE_BOTTOM + 200}px; display: flex; flex-direction: column; transform-origin: 50% 30%; }
.tk { display: inline-block; }
.kicker { font-size: 38px; letter-spacing: 8px; color: var(--dim); }
.column { margin: 26px 0 0; font-size: 150px; line-height: 1.05; font-weight: 700; letter-spacing: 6px; }
.date { margin-top: 18px; font-size: 230px; line-height: 1; font-weight: 700; color: var(--hi); }
.heads { list-style: none; margin: 56px 0 0; padding: 34px 0 0; border-top: 3px solid var(--brass); }
.heads li { display: flex; font-size: 38px; line-height: 1.4; margin-top: 16px; }
.heads li:first-child { margin-top: 0; }
.heads b { width: 76px; flex-shrink: 0; color: var(--heat); }
.heads span { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.row { display: flex; align-items: center; }
.num { font-size: 150px; line-height: 1; font-weight: 700; color: var(--hi); }
.meta { display: flex; flex-direction: column; align-items: flex-start; margin-left: 30px; font-size: 34px; }
.chip { padding: 4px 18px; border-radius: 12px; background: var(--brass); color: var(--ink); font-weight: 700; }
.src { margin-top: 12px; color: var(--dim); max-width: 520px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.of { margin-left: auto; align-self: flex-end; font-size: 44px; color: var(--dim); }
.title { margin: 40px 0 0; line-height: 1.3; font-weight: 700; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.pic { margin-top: auto; width: 960px; height: 540px; border-radius: 28px; overflow: hidden; background: #000; box-shadow: 0 30px 80px rgba(0,0,0,0.45); }
.pic img { display: block; width: 100%; height: 100%; object-fit: cover; }
.pic.none { display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, var(--brass), ${C.deck}); }
.pic.none span { font-size: 120px; font-weight: 700; color: rgba(255,255,255,0.16); letter-spacing: 12px; }
.end { align-items: center; justify-content: center; text-align: center; }
.mark.big { font-size: 120px; }
.mark.big i { width: 40px; height: 40px; margin-right: 30px; }
.host { margin-top: 48px; font-size: 56px; letter-spacing: 4px; color: var(--hi); }
.note { margin-top: 30px; font-size: 40px; color: var(--dim); }
.sub { position: absolute; left: 60px; right: 60px; bottom: ${SAFE_BOTTOM + 30}px; display: flex; justify-content: center; }
.sub p { margin: 0; max-width: 960px; text-align: center; font-size: 56px; line-height: 1.4; font-weight: 700; color: #fff;
  text-shadow: 0 2px 6px rgba(0,0,0,0.85), 0 0 22px rgba(0,0,0,0.6); }
</style>
</head>
<body>
<div id="root" data-composition-id="main" data-start="0" data-width="${VIDEO_SIZE.width}" data-height="${VIDEO_SIZE.height}" data-duration="${t(cut.duration)}">
  <div class="glow a"></div>
  <div class="glow b"></div>
  <div class="dots"></div>
  <div class="top"><div class="mark"><i></i>${esc(SITE.name)}</div><div class="issue">${esc(WECHAT_COLUMN)} · ${m}.${d}</div></div>
  <div class="bar">${spec.segments.map(() => `<div class="seg"><b></b></div>`).join("")}</div>
  ${scenes.join("\n  ")}
  ${subtitles.join("\n  ")}
</div>
<script>
const D = ${JSON.stringify(timing)};
const tl = gsap.timeline({ paused: true });
const last = D.scenes.length - 1;
tl.fromTo(".glow.a", { x: 0, y: 0 }, { x: -180, y: 240, duration: D.duration, ease: "none" }, 0);
tl.fromTo(".glow.b", { x: 0, y: 0 }, { x: 200, y: -280, duration: D.duration, ease: "none" }, 0);
D.scenes.forEach((s, k) => {
  const scene = "#scene-" + k;
  const long = s.end - s.start;
  // Each card rises in and leaves upward, the next one arriving on the same line of motion.
  tl.fromTo(scene + " .stage", { y: 80, opacity: 0 }, { y: 0, opacity: 1, duration: 0.55, ease: "power3.out" }, s.start);
  if (k < last) tl.to(scene + " .stage", { y: -80, opacity: 0, duration: 0.3, ease: "power2.in" }, s.end - 0.3);
  tl.fromTo(scene + " .push", { scale: 1 }, { scale: 1.025, duration: long, ease: "none" }, s.start);
  if (k === 0) {
    tl.fromTo(scene + " .column .tk", { yPercent: 60, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 0.5, ease: "power3.out", stagger: 0.06 }, 0.1);
    tl.fromTo(scene + " .date", { clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0% 0 0)", duration: 0.6, ease: "power2.inOut" }, 0.35);
    tl.fromTo(scene + " .heads li", { x: -50, opacity: 0 }, { x: 0, opacity: 1, duration: 0.4, ease: "power2.out", stagger: 0.09 }, 0.7);
  } else if (k < last) {
    tl.fromTo(scene + " .num", { yPercent: 40, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 0.45, ease: "back.out(1.6)" }, s.start + 0.05);
    tl.fromTo(scene + " .meta", { x: -30, opacity: 0 }, { x: 0, opacity: 1, duration: 0.4, ease: "power2.out" }, s.start + 0.2);
    tl.fromTo(scene + " .title .tk", { y: 26, opacity: 0 }, { y: 0, opacity: 1, duration: 0.35, ease: "power2.out", stagger: 0.016 }, s.start + 0.25);
    tl.fromTo(scene + " .pic", { y: 60, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, ease: "power3.out" }, s.start + 0.4);
    tl.fromTo(scene + " .pic img", { scale: 1 }, { scale: 1.12, duration: long, ease: "none" }, s.start);
    tl.fromTo(".seg:nth-child(" + k + ") b", { scaleX: 0 }, { scaleX: 1, duration: long, ease: "none" }, s.start);
  } else {
    tl.fromTo(scene + " .mark", { scale: 0.8, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.6, ease: "back.out(1.4)" }, s.start + 0.1);
    tl.fromTo(scene + " .host, " + scene + " .note", { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.45, ease: "power2.out", stagger: 0.15 }, s.start + 0.45);
  }
});
// Subtitles: each line pops in, and its words light up as they are said.
D.subtitles.forEach((times, k) => {
  const sub = "#sub-" + k;
  const words = document.querySelectorAll(sub + " .w");
  tl.fromTo(sub + " p", { y: 14, opacity: 0 }, { y: 0, opacity: 1, duration: 0.15, ease: "power2.out" }, times[0] ?? 0);
  words.forEach((w, j) => tl.fromTo(w, { opacity: 0.45 }, { opacity: 1, duration: 0.12, ease: "none" }, times[j]));
});
window.__timelines["main"] = tl;
</script>
</body>
</html>
`;
}
