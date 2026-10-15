// The picture of the 视频号 「AI 早报」 video as a HyperFrames composition (HTML and a paused GSAP timeline,
// rendered frame by frame in headless Chrome by `npx hyperframes render`): a title card, the lead's card
// with its points coming up as they are said, one card listing the quick hits that lights each as it is
// read, a card for the last word and a closing card, with the words subtitled as they are said. Laid out
// on the deck of the issue's theme like the 公众号 cover, and kept clear of the top and bottom bands 视频号
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

type Span = { start: number; end: number };

/** The video's timing, in seconds from its start, worked out from the voice. */
export interface Cut {
  spec: WechatVideoSpec;
  duration: number;
  /**
   * One per card, in order: the opening, the lead, the quick hits (when there are any), the last word
   * (when there is one), the closing.
   */
  scenes: Span[];
  /** When each of the lead's points comes up. */
  points: number[];
  /** While each quick hit is read. */
  briefs: Span[];
  subtitles: Array<Span & { tokens: Array<{ text: string; at: number }> }>;
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
  return n <= 26 ? 68 : n <= 40 ? 58 : 52;
}

function picture(src: string | undefined, label: string): string {
  return src ? `<div class="pic"><img src="${esc(src)}" alt=""></div>` : `<div class="pic none"><span>${esc(label)}</span></div>`;
}

function opening(spec: WechatVideoSpec): string {
  const [, m, d] = spec.date.split("-");
  const [lead, ...briefs] = spec.segments;
  return `<div class="stage push">
      <div class="kicker">第 ${spec.issueNumber} 期</div>
      <h1 class="column">${spans(WECHAT_COLUMN, "tk")}</h1>
      <div class="date">${m}.${d}</div>
      <ol class="heads">
        <li class="lead"><b>重点</b><span>${esc(lead!.title)}</span></li>
        ${briefs.map((s, k) => `<li><b>${pad(k + 1)}</b><span>${esc(s.title)}</span></li>`).join("")}
        ${spec.egg ? `<li class="egg"><b>彩蛋</b><span>最后见</span></li>` : ""}
      </ol>
    </div>`;
}

function leadCard(s: WechatVideoSpec["segments"][number], image: string | undefined): string {
  return `<div class="stage push">
      <div class="row">
        <span class="badge">今日重点</span>
        <div class="meta"><span class="chip">${esc(s.section)}</span><span class="src">${esc(s.sourceName)}</span></div>
      </div>
      <h2 class="title" style="font-size:${titleSize(s.title)}px">${spans(s.title, "tk")}</h2>
      ${s.points.length ? `<ul class="points">${s.points.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>` : ""}
      ${picture(image, s.section)}
    </div>`;
}

function briefsCard(briefs: WechatVideoSpec["segments"], images: Record<string, string>): string {
  return `<div class="stage push">
      <div class="row"><span class="badge">快讯</span><span class="count">${briefs.length} 条</span></div>
      <ol class="briefs">${briefs.map((s, k) => `<li>
        <i></i><b>${pad(k + 1)}</b><span class="t">${esc(s.title)}</span>${images[s.key] ? `<img src="${esc(images[s.key]!)}" alt="">` : ""}
      </li>`).join("")}</ol>
    </div>`;
}

function eggCard(egg: NonNullable<WechatVideoSpec["egg"]>, image: string | undefined): string {
  return `<div class="stage push">
      <div class="row"><span class="sticker">彩蛋</span><span class="count">今日 AI 迷惑行为</span></div>
      <h2 class="title" style="font-size:${titleSize(egg.title)}px">${spans(egg.title, "tk")}</h2>
      <div class="src egg-src">${esc(egg.sourceName)}</div>
      ${image ? `<div class="pic tilt"><img src="${esc(image)}" alt=""></div>` : `<div class="pic none tilt"><span>?!</span></div>`}
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
  const [lead, ...briefs] = spec.segments;
  const cards: Array<{ kind: string; html: string }> = [
    { kind: "opening", html: opening(spec) },
    { kind: "lead", html: leadCard(lead!, cut.images[lead!.key]) },
    ...(briefs.length ? [{ kind: "briefs", html: briefsCard(briefs, cut.images) }] : []),
    ...(spec.egg ? [{ kind: "egg", html: eggCard(spec.egg, cut.images[spec.egg.key]) }] : []),
    { kind: "closing", html: closing(spec) },
  ];
  const scenes = cards.map((c, k) => {
    const s = cut.scenes[k]!;
    return `<section id="scene-${k}" class="clip scene ${c.kind}" data-start="${t(s.start)}" data-duration="${t(s.end - s.start)}" data-track-index="1">
    ${c.html}
  </section>`;
  });
  const subtitles = cut.subtitles.map((s, k) =>
    `<div id="sub-${k}" class="clip sub" data-start="${t(s.start)}" data-duration="${t(s.end - s.start)}" data-track-index="2"><p>${
      s.tokens.map((x) => (/^\s+$/.test(x.text) ? " " : `<span class="w">${esc(x.text)}</span>`)).join("")}</p></div>`);
  const timing = {
    duration: cut.duration,
    kinds: cards.map((c) => c.kind),
    scenes: cut.scenes,
    points: cut.points,
    briefs: cut.briefs,
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
.seg:first-child { flex: 3; }
.seg b { display: block; width: 100%; height: 100%; background: var(--heat); transform-origin: 0 50%; }
.scene { position: absolute; inset: 0; }
.stage { position: absolute; left: 60px; right: 60px; top: ${SAFE_TOP + 140}px; bottom: ${SAFE_BOTTOM + 200}px; display: flex; flex-direction: column; transform-origin: 50% 30%; }
.tk { display: inline-block; }
.kicker { font-size: 38px; letter-spacing: 8px; color: var(--dim); }
.column { margin: 20px 0 0; font-size: 140px; line-height: 1.05; font-weight: 700; letter-spacing: 6px; }
.date { margin-top: 12px; font-size: 200px; line-height: 1; font-weight: 700; color: var(--hi); }
.heads { list-style: none; margin: 44px 0 0; padding: 30px 0 0; border-top: 3px solid var(--brass); }
.heads li { display: flex; font-size: 34px; line-height: 1.4; margin-top: 12px; color: var(--dim); }
.heads li:first-child { margin-top: 0; }
.heads li.lead { font-size: 42px; font-weight: 700; color: var(--ink); margin-bottom: 10px; }
.heads b { width: 100px; flex-shrink: 0; color: var(--heat); }
.heads span { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.row { display: flex; align-items: center; }
.badge { padding: 8px 26px; border-radius: 14px; background: var(--heat); color: var(--deck); font-size: 44px; font-weight: 700; letter-spacing: 6px; }
.count { margin-left: 24px; font-size: 38px; color: var(--dim); letter-spacing: 4px; }
.meta { display: flex; flex-direction: column; align-items: flex-start; margin-left: 28px; font-size: 32px; }
.chip { padding: 2px 16px; border-radius: 10px; background: var(--brass); color: var(--ink); font-weight: 700; }
.src { margin-top: 8px; color: var(--dim); max-width: 560px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.title { margin: 34px 0 0; line-height: 1.3; font-weight: 700; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.points { list-style: none; margin: 28px 0 0; padding: 0; }
.points li { display: flex; align-items: center; margin-top: 14px; font-size: 40px; font-weight: 700; color: var(--hi); }
.points li::before { content: ""; display: block; width: 10px; height: 40px; border-radius: 5px; background: var(--heat); margin-right: 20px; }
.pic { margin-top: 32px; flex: 1; min-height: 300px; width: 960px; border-radius: 28px; overflow: hidden; background: #000; box-shadow: 0 30px 80px rgba(0,0,0,0.45); }
.pic img { display: block; width: 100%; height: 100%; object-fit: cover; }
.pic.none { display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, var(--brass), ${C.deck}); }
.pic.none span { font-size: 120px; font-weight: 700; color: rgba(255,255,255,0.16); letter-spacing: 12px; }
.briefs { list-style: none; margin: 36px 0 0; padding: 0; display: flex; flex-direction: column; gap: 14px; }
.briefs li { position: relative; display: flex; align-items: center; padding: 20px 24px; border-radius: 22px; }
.briefs li i { position: absolute; inset: 0; border-radius: 22px; background: ${C.heat}26; border: 2px solid ${C.heat}66; }
.briefs b { position: relative; width: 76px; flex-shrink: 0; font-size: 40px; color: var(--heat); }
.briefs .t { position: relative; flex: 1; font-size: 40px; line-height: 1.35; font-weight: 700; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.briefs img { position: relative; width: 176px; height: 99px; margin-left: 20px; border-radius: 12px; object-fit: cover; flex-shrink: 0; }
.sticker { display: inline-block; padding: 10px 30px; border-radius: 16px; background: var(--hi); color: var(--deck); font-size: 52px; font-weight: 700; letter-spacing: 8px; }
.egg-src { margin-top: 18px; font-size: 32px; }
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
const fill = (k, from, to) => tl.fromTo(".seg:nth-child(" + k + ") b", { scaleX: 0 }, { scaleX: 1, duration: to - from, ease: "none" }, from);
D.scenes.forEach((s, k) => {
  const scene = "#scene-" + k;
  const kind = D.kinds[k];
  const long = s.end - s.start;
  // Each card rises in and leaves upward, the next one arriving on the same line of motion.
  tl.fromTo(scene + " .stage", { y: 80, opacity: 0 }, { y: 0, opacity: 1, duration: 0.55, ease: "power3.out" }, s.start);
  if (k < last) tl.to(scene + " .stage", { y: -80, opacity: 0, duration: 0.3, ease: "power2.in" }, s.end - 0.3);
  tl.fromTo(scene + " .push", { scale: 1 }, { scale: 1.02, duration: long, ease: "none" }, s.start);
  if (kind === "opening") {
    tl.fromTo(scene + " .column .tk", { yPercent: 60, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 0.5, ease: "power3.out", stagger: 0.06 }, 0.1);
    tl.fromTo(scene + " .date", { clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0% 0 0)", duration: 0.6, ease: "power2.inOut" }, 0.35);
    tl.fromTo(scene + " .heads li", { x: -50, opacity: 0 }, { x: 0, opacity: 1, duration: 0.4, ease: "power2.out", stagger: 0.08 }, 0.7);
  } else if (kind === "lead") {
    tl.fromTo(scene + " .badge", { scale: 0.6, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.45, ease: "back.out(2)" }, s.start + 0.05);
    tl.fromTo(scene + " .meta", { x: -30, opacity: 0 }, { x: 0, opacity: 1, duration: 0.4, ease: "power2.out" }, s.start + 0.2);
    tl.fromTo(scene + " .title .tk", { y: 26, opacity: 0 }, { y: 0, opacity: 1, duration: 0.35, ease: "power2.out", stagger: 0.016 }, s.start + 0.25);
    tl.fromTo(scene + " .pic", { y: 60, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, ease: "power3.out" }, s.start + 0.4);
    tl.fromTo(scene + " .pic img", { scale: 1 }, { scale: 1.12, duration: long, ease: "none" }, s.start);
    document.querySelectorAll(scene + " .points li").forEach((li, j) =>
      tl.fromTo(li, { x: -40, opacity: 0 }, { x: 0, opacity: 1, duration: 0.4, ease: "power3.out" }, D.points[j] ?? s.start + 1));
    fill(1, s.start, s.end);
  } else if (kind === "briefs") {
    tl.fromTo(scene + " .badge", { scale: 0.6, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.45, ease: "back.out(2)" }, s.start + 0.05);
    tl.fromTo(scene + " .briefs li", { x: 60, opacity: 0 }, { x: 0, opacity: 0.4, duration: 0.35, ease: "power2.out", stagger: 0.06 }, s.start + 0.15);
    // The one being read lights up; the others stay back.
    D.briefs.forEach((b, j) => {
      const li = scene + " .briefs li:nth-child(" + (j + 1) + ")";
      tl.to(li, { opacity: 1, scale: 1.03, duration: 0.2, ease: "power2.out" }, b.start);
      tl.fromTo(li + " i", { opacity: 0 }, { opacity: 1, duration: 0.2, ease: "power2.out" }, b.start);
      if (j < D.briefs.length - 1) {
        tl.to(li, { opacity: 0.4, scale: 1, duration: 0.2, ease: "power2.in" }, b.end);
        tl.to(li + " i", { opacity: 0, duration: 0.2, ease: "power2.in" }, b.end);
      }
      fill(j + 2, b.start, b.end);
    });
  } else if (kind === "egg") {
    tl.fromTo(scene + " .sticker", { scale: 2.2, rotation: -18, opacity: 0 }, { scale: 1, rotation: -5, opacity: 1, duration: 0.5, ease: "back.out(2.2)" }, s.start + 0.05);
    tl.fromTo(scene + " .count", { opacity: 0 }, { opacity: 1, duration: 0.3 }, s.start + 0.35);
    tl.fromTo(scene + " .title .tk", { y: 26, opacity: 0 }, { y: 0, opacity: 1, duration: 0.35, ease: "power2.out", stagger: 0.016 }, s.start + 0.3);
    tl.fromTo(scene + " .egg-src", { opacity: 0 }, { opacity: 1, duration: 0.3 }, s.start + 0.5);
    tl.fromTo(scene + " .pic", { y: 60, opacity: 0, rotation: 0 }, { y: 0, opacity: 1, rotation: 2, duration: 0.6, ease: "back.out(1.6)" }, s.start + 0.45);
    tl.fromTo(scene + " .pic", { rotation: 2 }, { rotation: -2, duration: 0.9, ease: "sine.inOut", immediateRender: false, yoyo: true, repeat: Math.max(0, Math.floor((long - 1.1) / 0.9) - 1) }, s.start + 1.05);
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
