// Focused chronicle layout: the first screen is the plate, the axis and three readouts; everything else
// opens in one side layer. Data comes from the site's /api/site/chronicle through preview.py.
// The plates sit in a depth tunnel (depth-stage.js) that the axis flies through; ?flat keeps the flat plates.

// ---------------------------------------------------------------------------
// Mirrors packages/contracts/src/chronicle.ts and apps/web/app/features/chrono/format.ts (copied, not
// imported, so the prototype runs without a build). Keep them in step if this layout ships.
// ---------------------------------------------------------------------------

const AXIS_LINEAR_YEARS = 0.01;
const BIG_BANG = -13.787e9;
const AXIS_FUTURE_YEARS = 100;
const MIN_AXIS_SPAN = 0.0015;
const SUPERSCRIPT = "⁰¹²³⁴⁵⁶⁷⁸⁹";

function yearStart(y) {
  const d = new Date(0);
  d.setUTCFullYear(y, 0, 1);
  return d.getTime();
}
function decimalYear(instant) {
  const d = new Date(instant);
  const y = d.getUTCFullYear();
  const start = yearStart(y);
  return y + (d.getTime() - start) / (yearStart(y + 1) - start);
}
const symlog = (d) => Math.sign(d) * Math.log10(1 + Math.abs(d) / AXIS_LINEAR_YEARS);
const symexp = (x) => Math.sign(x) * AXIS_LINEAR_YEARS * (10 ** Math.abs(x) - 1);
function toAxis(t, now) {
  const lo = symlog(BIG_BANG - now);
  const hi = symlog(AXIS_FUTURE_YEARS);
  return (symlog(Math.min(Math.max(t, BIG_BANG), now + AXIS_FUTURE_YEARS) - now) - lo) / (hi - lo);
}
function fromAxis(u, now) {
  if (u <= 0) return BIG_BANG;
  if (u >= 1) return now + AXIS_FUTURE_YEARS;
  const lo = symlog(BIG_BANG - now);
  const hi = symlog(AXIS_FUTURE_YEARS);
  return now + symexp(lo + u * (hi - lo));
}
function trim(n) {
  return n >= 100 ? String(Math.round(n)) : String(Math.round(n * 10) / 10);
}
function agoLabel(years) {
  if (years >= 1e8) return `${trim(years / 1e8)}亿年`;
  if (years >= 1e4) return `${trim(years / 1e4)}万年`;
  if (years >= 1) return `${trim(years)}年`;
  if (years >= 1 / 12) return `${Math.round(years * 12)}个月`;
  return `${Math.max(1, Math.round(years * 365.2425))}天`;
}
function axisTicks(now) {
  const ticks = [];
  for (let p = 10; p >= -1; p--) ticks.push([now - 10 ** p, `${agoLabel(10 ** p)}前`]);
  ticks.push([now, "现在"]);
  for (let p = 0; p <= 2; p++) ticks.push([now + 10 ** p, `${agoLabel(10 ** p)}后`]);
  return ticks;
}
function timeLabel(t, now, precision, date) {
  if (date && (precision === "day" || precision === "month")) {
    const [y, m, d] = date.split("-");
    return precision === "day" && d ? `${Number(y)}年${Number(m)}月${Number(d)}日` : `${Number(y)}年${Number(m)}月`;
  }
  if (t < -10000 || precision === "ga" || precision === "ma" || precision === "ka") {
    const ago = now - t;
    return ago >= 1e4 ? `${agoLabel(ago)}前` : `约${Math.round(ago)}年前`;
  }
  if (t < 1) return `公元前${1 - Math.floor(t)}年`;
  return `${Math.floor(t)}年`;
}
function interpolateMetric(points, t, now, forecastFrom) {
  if (!points.length || !Number.isFinite(t) || t < points[0][0]) return null;
  const last = points[points.length - 1];
  if (t > now && (forecastFrom === undefined || t > last[0])) return null;
  if (t >= last[0]) return last[1];
  let i = 1;
  while (points[i][0] < t) i++;
  const [t0, v0] = points[i - 1];
  const [t1, v1] = points[i];
  if (t1 === t0) return v1;
  const f = (t - t0) / (t1 - t0);
  return 10 ** (Math.log10(v0) + f * (Math.log10(v1) - Math.log10(v0)));
}
const kardashev = (watts) => (Math.log10(watts) - 6) / 10;
function eraAt(eras, t) {
  let found = null;
  for (const e of eras) {
    if (e.from > t) break;
    found = e;
  }
  return found ?? eras[0] ?? null;
}
function capabilitiesAt(milestones, t, upcoming = 6) {
  const withCap = milestones.filter((m) => m.capability && !m.forecast);
  return { held: withCap.filter((m) => m.t <= t), next: withCap.filter((m) => m.t > t).slice(0, upcoming) };
}
const trimFixed = (v, digits) => String(Number(v.toFixed(digits)));
function scientific(v, digits = 1) {
  if (v === 0) return "0";
  const e = Math.floor(Math.log10(Math.abs(v)));
  if (e >= -2 && e <= 3) return trimFixed(v, e < 0 ? 3 : digits);
  const exp = String(e).replace("-", "⁻").replace(/\d/g, (d) => SUPERSCRIPT[Number(d)]);
  return `${trimFixed(v / 10 ** e, digits)}×10${exp}`;
}
function chineseCount(v) {
  if (v >= 1e8) return `${trimFixed(v / 1e8, v >= 1e9 ? 1 : 2)} 亿`;
  if (v >= 1e4) return `${trimFixed(v / 1e4, v >= 1e6 ? 0 : 1)} 万`;
  return Math.round(v).toLocaleString("en-US");
}
function duration(s) {
  if (s < 1) return `${trimFixed(s, 2)} 秒`;
  if (s < 60) return `${trimFixed(s, 0)} 秒`;
  if (s < 3600) return `${trimFixed(s / 60, 0)} 分钟`;
  if (s < 86400) return `${trimFixed(s / 3600, 1)} 小时`;
  if (s < 86400 * 45) return `${trimFixed(s / 86400, 0)} 天`;
  if (s < 86400 * 365) return `${trimFixed(s / 86400 / 30.44, 0)} 个月`;
  return `${trimFixed(s / 86400 / 365.2425, 1)} 年`;
}
function metricValue(metric, v) {
  switch (metric.key) {
    case "population": {
      const [value, unit] = chineseCount(v).split(" ");
      return { value, unit: `${unit ?? ""}人` };
    }
    case "energy":
      return { value: scientific(v), unit: "瓦" };
    case "messaging": {
      const [value, unit] = duration(v).split(" ");
      return { value, unit };
    }
    case "travel":
      return { value: Math.round(v).toLocaleString("en-US"), unit: "千米/时" };
    default:
      return { value: scientific(v), unit: "FLOP/s·$" };
  }
}
function versusToday(metric, v, today) {
  if (today === null || v <= 0 || today <= 0) return null;
  const ratio = v / today;
  if (ratio > 0.95 && ratio < 1.05) return "与今天相当";
  if (metric.key === "messaging") return ratio > 1 ? `比今天慢 ${chineseCount(ratio)} 倍` : `比今天快 ${chineseCount(1 / ratio)} 倍`;
  return ratio < 1 ? `今天的 1/${chineseCount(1 / ratio)}` : `今天的 ${chineseCount(ratio)} 倍`;
}
function stepPicture(eras, milestones, t, direction) {
  const pictures = [...new Set([...eras.map((e) => e.from + 1e-9), ...milestones.filter((m) => m.art).map((m) => m.t)])].sort((a, b) => a - b);
  return (direction === 1 ? pictures.find((x) => x > t + 1e-6) : pictures.findLast((x) => x < t - 1e-6)) ?? t;
}
function focusAt(milestones, t, now) {
  const u = toAxis(t, now);
  return milestones.reduce((best, m) => {
    const d = Math.abs(toAxis(m.t, now) - u);
    return d < 0.0008 && (!best || d < Math.abs(toAxis(best.t, now) - u)) ? m : best;
  }, null);
}
function plateOf(era, focus) {
  const moment = focus?.art ? focus : null;
  return moment
    ? { key: `m-${moment.id}`, src: `/media/art/moments/${moment.art}`, alt: `${moment.title}（${moment.artStyle ?? era.artStyle}）`, style: moment.artStyle ?? era.artStyle }
    : { key: `e-${era.id}`, src: `/media/art/epochs/${era.art}`, alt: `${era.title}（${era.artStyle}）`, style: era.artStyle };
}
function distanceLabel(t, now) {
  const d = now - t;
  const abs = Math.abs(d);
  if (abs < 1 / 365) return "就是现在";
  const words = abs >= 1e8 ? `${trimFixed(abs / 1e8, 1)} 亿年` : abs >= 1e4 ? `${trimFixed(abs / 1e4, 1)} 万年` : abs >= 1 ? `${Math.round(abs)} 年` : abs >= 1 / 12 ? `${Math.round(abs * 12)} 个月` : `${Math.round(abs * 365.2425)} 天`;
  return d > 0 ? `距今 ${words}` : `${words}后`;
}
const untilLabel = (from, to) => (to - from < 1 / 365 ? "即将出现" : `${distanceLabel(to, from)}出现`);

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

const CATEGORY_COLOR = { cosmos: "#9fb0d6", life: "#86c79a", human: "#e2b468", energy: "#ef8458", compute: "#d9a441", ai: "#f6dc96", culture: "#cbb99c" };
// The three readouts on the stage: how many of us, how much power, how fast word travels.
const STAGE_METRICS = ["population", "energy", "messaging"];
const SHORT_LABEL = { population: "世界人口", energy: "一次能源功率", compute: "每美元算力", messaging: "伦敦→纽约消息", travel: "最快移动速度" };
const SNAP_PX = 9;
// Plates you can walk into: the plate's art key → its scene, which opens from the same framing as the plate.
const SCENES = { "difference-engine": "/difference-engine-1822/?embed" };
const WHEEL_STEP = 120;

const $ = (id) => document.getElementById(id);
const present = (nodes) => nodes.filter((c) => c !== null && c !== undefined);
const el = (tag, { dataset, style, ...props } = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  if (dataset) Object.assign(node.dataset, dataset);
  if (style) node.style.cssText = style;
  node.append(...present(children));
  return node;
};

const now = decimalYear(Date.now());
// Load the tunnel while the data is on its way, not after it.
const depthModule = new URLSearchParams(location.search).has("flat") ? null : import("./depth-stage.js");
const data = await fetch("/api/site/chronicle").then((r) => r.json());
const eras = [...data.eras].sort((a, b) => a.from - b.from);
const milestones = [...data.milestones].sort((a, b) => a.t - b.t);
const metrics = data.metrics;
const metricByKey = Object.fromEntries(metrics.map((m) => [m.key, m]));
const todayOf = (m) => interpolateMetric(m.points, now, now, m.forecastFrom);

const initialT = Number(new URLSearchParams(location.search).get("t"));
const state = {
  t: Number.isFinite(initialT) && new URLSearchParams(location.search).has("t") ? initialT : now,
  view: null,
  layer: null,
  opener: null,
};
{
  const u = toAxis(state.t, now);
  const span = 0.22;
  const lo = Math.min(1 - span, Math.max(0, u - span * 0.6));
  state.view = { lo, hi: lo + span };
}

const track = $("track");
const project = (u) => (u - state.view.lo) / (state.view.hi - state.view.lo);
const trackX = (t) => project(toAxis(t, now)) * track.clientWidth;

function keepInView(u) {
  const { lo, hi } = state.view;
  const span = hi - lo;
  const pad = span * 0.08;
  if (u < lo + pad) state.view = { lo: Math.max(0, u - pad), hi: Math.max(0, u - pad) + span };
  else if (u > hi - pad) state.view = { lo: Math.min(1 - span, u + pad - span), hi: Math.min(1, u + pad) };
}

function setT(t, { follow = true } = {}) {
  if (depth?.busy) return;
  state.t = Math.min(Math.max(t, BIG_BANG), now + AXIS_FUTURE_YEARS);
  if (follow) keepInView(toAxis(state.t, now));
  scheduleRender();
}

let frame = 0;
function scheduleRender() {
  if (!frame) frame = requestAnimationFrame(() => { frame = 0; render(); });
}

// ---------------------------------------------------------------------------
// Stage
// ---------------------------------------------------------------------------

// Every picture on the axis, in time order: era openings and milestone plates (the stops of ‹ ›).
const pictures = [
  ...eras.map((e) => ({ t: e.from + 1e-9, src: `/media/art/epochs/${e.art}` })),
  ...milestones.filter((m) => m.art).map((m) => ({ t: m.t, src: `/media/art/moments/${m.art}`, scene: SCENES[m.art] })),
].sort((a, b) => a.t - b.t);
const pictureAxis = pictures.map((p) => toAxis(p.t, now));
// The axis position in pictures: an integer on a picture, a fraction in flight between two.
function pictureProgress(t) {
  const u = toAxis(t, now);
  const i = pictureAxis.findLastIndex((x) => x <= u);
  if (i < 0) return 0;
  if (i >= pictures.length - 1) return pictures.length - 1;
  const span = pictureAxis[i + 1] - pictureAxis[i];
  return span > 0 ? i + (u - pictureAxis[i]) / span : i;
}
const depth = depthModule && (await depthModule).createDepthStage($("stage"), pictures, { onModeChange: () => scheduleRender(), onSceneReady: () => scheduleRender() });
document.body.classList.toggle("has-depth", Boolean(depth));

const plates = [$("plate-a"), $("plate-b")];
let plateKey = "";
let front = 0;
function showPlate(plate) {
  if (plate.key === plateKey) return;
  plateKey = plate.key;
  const next = plates[1 - front];
  const img = new Image();
  img.onload = () => {
    if (plate.key !== plateKey) return;
    next.src = img.src;
    next.alt = plate.alt;
    next.style.opacity = "1";
    plates[front].style.opacity = "0";
    front = 1 - front;
  };
  img.src = `${plate.src}-1600.webp`;
}

function splitTime(label) {
  const m = /^(\D*?)([\d.,]+)(.*)$/.exec(label);
  return m ? [m[1], m[2], m[3]] : ["", label, ""];
}

function renderMoment(era, focus) {
  const plate = plateOf(era, focus);
  if (depth) depth.setProgress(pictureProgress(state.t), plate.alt);
  else showPlate(plate);
  const enter = $("enter");
  enter.hidden = !(depth && focus?.art && SCENES[focus.art]);
  enter.disabled = !depth?.canEnter();
  enter.firstChild.textContent = enter.disabled ? "正在打开工坊… " : "走进工坊 ";
  const label = focus ? timeLabel(focus.t, now, focus.precision, focus.date) : timeLabel(state.t, now);
  const [before, figure, after] = splitTime(label);
  $("time").replaceChildren(...present([
    before ? el("span", { className: "time-unit", textContent: before }) : null,
    el("span", { className: "time-figure", textContent: figure }),
    after ? el("span", { className: "time-unit", textContent: after }) : null,
  ]));
  $("kicker").replaceChildren(...present([
    el("span", { textContent: `加速史 · ${distanceLabel(state.t, now)}` }),
    el("span", { className: "chip", textContent: era.title }),
    focus?.forecast ? el("span", { className: "forecast-tag", textContent: `预测 · ${focus.forecast.by}` }) : null,
    el("span", { textContent: `画风 · ${plate.style}`, style: "opacity:.7;letter-spacing:.04em" }),
  ]));
  $("title").textContent = focus ? focus.title : era.title;
  $("detail").textContent = focus ? focus.detail : era.summary;
}

function readoutNote(metric, v) {
  if (v !== null) return versusToday(metric, v, todayOf(metric)) ?? " ";
  const first = metric.points[0]?.[0];
  return state.t < first ? `数据始于${timeLabel(first, now, first < 0 ? "ka" : "year")}` : "尚无可靠数据";
}

function renderReadouts() {
  $("readouts").replaceChildren(...STAGE_METRICS.map((key) => {
    const metric = metricByKey[key];
    const v = interpolateMetric(metric.points, state.t, now, metric.forecastFrom);
    const shown = v === null ? { value: "—", unit: "" } : metricValue(metric, v);
    return el("div", { className: `readout${v === null ? " is-empty" : ""}`, title: metric.note ?? metric.label },
      el("div", { className: "readout-label", textContent: SHORT_LABEL[key] }),
      el("div", { className: "readout-value" }, el("span", { className: "num", textContent: shown.value }), el("span", { className: "unit", textContent: shown.unit })),
      el("div", { className: "readout-note", textContent: readoutNote(metric, v) }),
    );
  }));
  const watts = interpolateMetric(metricByKey.energy.points, state.t, now);
  $("kpill").textContent = watts ? `K = ${kardashev(watts).toFixed(3)}` : "K = —";
}

// ---------------------------------------------------------------------------
// Axis
// ---------------------------------------------------------------------------

let axisViewKey = "";
const cursor = el("div", { className: "cursor" });

function renderAxis() {
  const key = `${state.view.lo}:${state.view.hi}:${track.clientWidth}`;
  const era = eraAt(eras, state.t);
  if (key !== axisViewKey) {
    axisViewKey = key;
    const w = track.clientWidth;
    const nodes = [];
    eras.forEach((e, i) => {
      const x0 = Math.max(0, trackX(e.from));
      const x1 = Math.min(w, i + 1 < eras.length ? trackX(eras[i + 1].from) : w);
      if (x1 <= 0 || x0 >= w || x1 - x0 < 0.5) return;
      nodes.push(el("div", { className: "era-band", title: e.title, style: `left:${x0}px;width:${x1 - x0}px`, dataset: { era: e.id } }));
    });
    const nowX = trackX(now);
    if (nowX >= 0 && nowX <= w) nodes.push(el("div", { className: "now-line", style: `left:${nowX}px` }, el("span", { textContent: "现在" })));
    for (const m of milestones) {
      const x = trackX(m.t);
      if (x < 0 || x > w) continue;
      nodes.push(el("div", { className: `tick${m.art ? " art" : ""}${m.forecast ? " forecast" : ""}`, title: `${timeLabel(m.t, now, m.precision, m.date)} · ${m.title}`, style: `left:${x}px;background:${CATEGORY_COLOR[m.category]}` }));
    }
    nodes.push(cursor);
    track.replaceChildren(...nodes);
    renderScale(w);
  }
  for (const band of track.querySelectorAll(".era-band")) band.classList.toggle("on", band.dataset.era === era.id);
  cursor.style.left = `${trackX(state.t)}px`;
  track.setAttribute("aria-valuetext", timeLabel(state.t, now));
}

function renderScale(w) {
  let ticks = axisTicks(now).map(([t, label]) => [trackX(t), label]).filter(([x]) => x >= 0 && x <= w);
  if (ticks.length < 3) {
    // Zoomed past the powers of ten: label evenly spaced points instead.
    ticks = [0.08, 0.3, 0.52, 0.74, 0.94].map((f) => [f * w, timeLabel(fromAxis(state.view.lo + f * (state.view.hi - state.view.lo), now), now)]);
  }
  const placed = [];
  for (const tick of ticks) if (!placed.length || tick[0] - placed[placed.length - 1][0] > 70) placed.push(tick);
  $("scale").replaceChildren(...placed.map(([x, label]) => el("span", { style: `left:${x}px`, textContent: label })));
}

function tAtClientX(clientX) {
  const rect = track.getBoundingClientRect();
  const x = Math.min(Math.max(clientX - rect.left, 0), rect.width);
  // Snap to a milestone within a few pixels, so a click lands on an event rather than between two.
  let best = null;
  for (const m of milestones) {
    const d = Math.abs(trackX(m.t) - x);
    if (d < SNAP_PX && (!best || d < best.d)) best = { d, t: m.t };
  }
  return best ? best.t : fromAxis(state.view.lo + (x / rect.width) * (state.view.hi - state.view.lo), now);
}

let dragging = false;
track.addEventListener("pointerdown", (event) => {
  dragging = true;
  track.setPointerCapture?.(event.pointerId);
  track.focus({ preventScroll: true });
  setT(tAtClientX(event.clientX), { follow: false });
});
track.addEventListener("pointermove", (event) => {
  if (dragging) setT(tAtClientX(event.clientX), { follow: false });
});
for (const type of ["pointerup", "pointercancel"]) track.addEventListener(type, () => { dragging = false; });
track.addEventListener("wheel", (event) => {
  event.preventDefault();
  const rect = track.getBoundingClientRect();
  const span = state.view.hi - state.view.lo;
  if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
    const lo = Math.min(1 - span, Math.max(0, state.view.lo + (event.deltaX / rect.width) * span));
    state.view = { lo, hi: lo + span };
  } else {
    const anchor = state.view.lo + ((event.clientX - rect.left) / rect.width) * span;
    const next = Math.min(1, Math.max(MIN_AXIS_SPAN, span * Math.exp(event.deltaY * 0.002)));
    const lo = Math.min(1 - next, Math.max(0, anchor - ((anchor - state.view.lo) / span) * next));
    state.view = { lo, hi: lo + next };
  }
  scheduleRender();
}, { passive: false });

$("prev").addEventListener("click", () => setT(stepPicture(eras, milestones, state.t, -1)));
$("next").addEventListener("click", () => setT(stepPicture(eras, milestones, state.t, 1)));
$("today").addEventListener("click", () => setT(now));
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && state.layer) {
    closeLayer();
    return;
  }
  if (event.target.closest?.("input, textarea, .layer") || depth?.busy) return;
  if (event.key === "Enter" && !event.target.closest?.("button, [role=slider]") && !$("enter").hidden) {
    depth.enter();
    return;
  }
  if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
    event.preventDefault();
    setT(stepPicture(eras, milestones, state.t, event.key === "ArrowLeft" ? -1 : 1));
  }
});
new ResizeObserver(() => scheduleRender()).observe(track);
$("enter").addEventListener("click", () => depth.enter());

// The wheel over the plate flies to the next or previous picture; over the axis it still zooms.
let wheelSum = 0, wheelAt = 0;
$("stage").addEventListener("wheel", (event) => {
  if (!depth || depth.busy || event.target.closest(".axis, .layers")) return;
  event.preventDefault();
  if (event.timeStamp - wheelAt > 300) wheelSum = 0;
  wheelAt = event.timeStamp;
  wheelSum += event.deltaY;
  if (Math.abs(wheelSum) < WHEEL_STEP) return;
  setT(stepPicture(eras, milestones, state.t, Math.sign(wheelSum)));
  wheelSum = 0;
}, { passive: false });

// ---------------------------------------------------------------------------
// Side layer: all gauges, what is near this moment, the era gallery
// ---------------------------------------------------------------------------

const shell = $("shell");
const layer = $("layer");
const layerBody = $("layer-body");
const panels = { gauges: el("div", { hidden: true }), nearby: el("div", { hidden: true }), eras: el("div", { hidden: true }) };
layerBody.append(...Object.values(panels));

function openLayer(name, opener) {
  if (state.layer === name) return opener?.closest(".layer-head") ? undefined : closeLayer();
  if (!state.layer) state.opener = opener;
  state.layer = name;
  shell.classList.add("has-layer");
  syncLayerControls();
  renderLayer();
  if (opener?.closest(".layer-head") === null) layer.focus({ preventScroll: true });
  // The stage narrows: the axis and scale have to be laid out again for the new width.
  setTimeout(scheduleRender, 470);
}
function closeLayer() {
  state.layer = null;
  shell.classList.remove("has-layer");
  syncLayerControls();
  state.opener?.focus({ preventScroll: true });
  state.opener = null;
  setTimeout(scheduleRender, 470);
}
function syncLayerControls() {
  for (const b of document.querySelectorAll(".layers [data-layer]")) b.setAttribute("aria-expanded", String(b.dataset.layer === state.layer));
  for (const b of document.querySelectorAll(".layer-tab")) b.setAttribute("aria-selected", String(b.dataset.layer === state.layer));
  for (const [name, panel] of Object.entries(panels)) panel.hidden = name !== state.layer;
}
for (const b of document.querySelectorAll("[data-layer]")) b.addEventListener("click", () => openLayer(b.dataset.layer, b));
$("layer-close").addEventListener("click", closeLayer);

function trace(metric) {
  const xs = metric.points.map(([pt]) => toAxis(pt, now));
  const ys = metric.points.map(([, pv]) => Math.log10(pv));
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
  const [y0, y1] = [Math.min(...ys), Math.max(...ys)];
  const sx = (x) => (x1 === x0 ? 50 : ((x - x0) / (x1 - x0)) * 100);
  const sy = (y) => (y1 === y0 ? 16 : 30 - ((y - y0) / (y1 - y0)) * 28);
  const v = interpolateMetric(metric.points, state.t, now, metric.forecastFrom);
  const ux = toAxis(state.t, now);
  const fx = metric.forecastFrom !== undefined ? sx(toAxis(metric.forecastFrom, now)) : null;
  const parts = [];
  if (fx !== null && fx < 100) parts.push(`<rect x="${fx}" y="0" width="${100 - fx}" height="32" class="trace-forecast"/>`);
  parts.push(`<polyline class="trace-line" vector-effect="non-scaling-stroke" points="${xs.map((x, i) => `${sx(x).toFixed(2)},${sy(ys[i]).toFixed(2)}`).join(" ")}"/>`);
  if (v !== null && ux >= x0 && ux <= x1) {
    parts.push(`<line class="trace-cursor" vector-effect="non-scaling-stroke" x1="${sx(ux)}" x2="${sx(ux)}" y1="0" y2="32"/>`);
    parts.push(`<circle class="trace-dot" cx="${sx(ux)}" cy="${sy(Math.log10(v))}" r="1.6"/>`);
  }
  const svg = el("div");
  svg.innerHTML = `<svg viewBox="0 0 100 32" preserveAspectRatio="none" aria-hidden="true">${parts.join("")}</svg>`;
  return svg.firstChild;
}

function renderGauges() {
  const watts = interpolateMetric(metricByKey.energy.points, state.t, now);
  const k = watts ? kardashev(watts) : null;
  panels.gauges.replaceChildren(
    el("p", { className: "layer-note", textContent: `卡尔达肖夫指数 ${k === null ? "—" : k.toFixed(3)}（今天 ${kardashev(todayOf(metricByKey.energy)).toFixed(3)}）。指标在有来源的数据点之间按对数插值，悬停看口径说明。` }),
    el("div", { className: "gauges" }, ...metrics.map((metric) => {
      const v = interpolateMetric(metric.points, state.t, now, metric.forecastFrom);
      const shown = v === null ? { value: "—", unit: "" } : metricValue(metric, v);
      return el("article", { className: "gauge", title: metric.note ?? "" },
        el("div", { className: "gauge-label", textContent: SHORT_LABEL[metric.key] }),
        el("div", { className: "gauge-value" }, el("span", { className: "num", textContent: shown.value }), el("span", { className: "unit", textContent: shown.unit })),
        el("div", { className: "gauge-note", textContent: readoutNote(metric, v) }),
        trace(metric),
      );
    })),
  );
}

function jumpButton(m, on) {
  const button = el("button", { type: "button", className: on ? "on" : "" },
    el("span", { className: "when", textContent: timeLabel(m.t, now, m.precision, m.date) }),
    el("span", { className: "what", textContent: m.title }, el("span", { className: "why", textContent: m.detail })),
  );
  button.addEventListener("click", () => setT(m.t));
  return button;
}

function renderNearby(focus) {
  const u = toAxis(state.t, now);
  const near = [...milestones].sort((a, b) => Math.abs(toAxis(a.t, now) - u) - Math.abs(toAxis(b.t, now) - u)).slice(0, 8).sort((a, b) => a.t - b.t);
  const caps = capabilitiesAt(milestones, state.t, 4);
  panels.nearby.replaceChildren(
    el("ul", { className: "list" }, ...near.map((m) => el("li", {}, jumpButton(m, m === focus)))),
    el("h3", { className: "sub", textContent: `此刻已有的能力 · ${caps.held.length} 项` }),
    el("div", { className: "caps" }, ...caps.held.slice(-10).reverse().map((m) => el("span", { className: "cap", textContent: m.capability, title: timeLabel(m.t, now, m.precision, m.date) }))),
    caps.next.length ? el("h3", { className: "sub", textContent: "接下来会出现" }) : null,
    el("div", { className: "caps" }, ...caps.next.map((m) => el("span", { className: "cap next" }, m.capability, el("small", { textContent: untilLabel(state.t, m.t) })))),
  );
}

function renderEras() {
  const current = eraAt(eras, state.t);
  if (panels.eras.childElementCount) {
    for (const b of panels.eras.querySelectorAll(".era")) b.classList.toggle("on", b.dataset.era === current.id);
    return;
  }
  panels.eras.replaceChildren(
    el("p", { className: "layer-note", textContent: `${eras.length} 个时代，各按当时的画风绘制。点一幅跳到那个时代的开端。` }),
    el("div", { className: "eras" }, ...eras.map((e) => {
      const b = el("button", { type: "button", className: `era${e === current ? " on" : ""}`, dataset: { era: e.id } },
        el("img", { src: `/media/art/epochs/${e.art}-800.webp`, alt: "", loading: "lazy" }),
        el("span", { textContent: e.title }),
      );
      b.addEventListener("click", () => setT(e.from + 1e-9));
      return b;
    })),
  );
}

function renderLayer(focus = focusAt(milestones, state.t, now)) {
  if (state.layer === "gauges") renderGauges();
  if (state.layer === "nearby") renderNearby(focus);
  if (state.layer === "eras") renderEras();
}

// ---------------------------------------------------------------------------

let urlTimer = 0;
function render() {
  const era = eraAt(eras, state.t);
  const focus = focusAt(milestones, state.t, now);
  renderMoment(era, focus);
  renderReadouts();
  renderAxis();
  renderLayer(focus);
  $("prev").disabled = stepPicture(eras, milestones, state.t, -1) === state.t;
  $("next").disabled = stepPicture(eras, milestones, state.t, 1) === state.t;
  clearTimeout(urlTimer);
  urlTimer = setTimeout(() => {
    const url = new URL(location.href);
    url.searchParams.set("t", Number(state.t.toPrecision(15)).toString().replace("e+", "e"));
    history.replaceState(null, "", url);
  }, 200);
}

render();
window.chronicleFocus = { state, setT, openLayer, closeLayer, depth };
