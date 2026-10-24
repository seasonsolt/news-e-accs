import * as THREE from "three";

// The site's own plates and depth maps (white = near, from tools/make-depth.py), served from the repository root.
const ART = "../../../apps/web/public/media/art/moments/";
const MILESTONES = [
  { key: "voltaic-pile", year: 1800, date: "1800", tag: "能源", title: "伏打电堆", desc: "第一块能持续输出电流的电池。" },
  { key: "difference-engine", year: 1822, date: "1822", tag: "计算", title: "差分机", desc: "巴贝奇提出一台能自动计算数表的机器。", scene: "../difference-engine-1822/?embed" },
  { key: "liverpool-manchester-railway", year: 1830.7, date: "1830-09-15", tag: "能源", title: "第一条城际铁路", desc: "利物浦—曼彻斯特铁路通车，全程蒸汽机车、按时刻表运行。" },
  { key: "electromagnetic-induction", year: 1831, date: "1831", tag: "能源", title: "电磁感应", desc: "法拉第发现变化的磁场能产生电流，这正是发电机的原理。" },
  { key: "daguerreotype", year: 1839.6, date: "1839-08-19", tag: "文化", title: "摄影术公布", desc: "法国科学院公布达盖尔的银版摄影法。" },
  { key: "morse-telegraph", year: 1844.4, date: "1844-05-24", tag: "计算", title: "电报线路开通", desc: "莫尔斯从华盛顿向巴尔的摩发出：“上帝创造了何等奇迹！”" },
];
const Y0 = 1800, Y1 = 1845;
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");

// Each plate is a relief on the Z axis; gaps grow with the years between plates, so a long wait is a longer flight.
const PLANE_W = 16, PLANE_H = PLANE_W * 1067 / 1600;
const FOV = 50;
// How far toward the resting eye the nearest pixel is pulled. Pulling along the line of sight keeps the plate
// pixel-exact from the resting spot (so it hands over cleanly to the 3D scene) and lets it part only as you move.
const RELIEF = .22;
const FOG_NEAR = 15, FOG_FAR = 110;
let z = 0;
MILESTONES.forEach((m, i) => {
  if (i > 0) z -= 46 + Math.sqrt(m.year - MILESTONES[i - 1].year) * 9;
  m.z = z;
});

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.setClearColor(0x0d0a07);
renderer.domElement.tabIndex = -1;           // focusable from script, so the keyboard can return from the workshop
renderer.domElement.style.outline = "none";
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(FOV, innerWidth / innerHeight, .1, 400);
const eye = new THREE.Vector3();
let restDistance = 12;

// The resting spot frames the plate like object-fit: cover, the same crop the workshop's plate camera uses.
function layout() {
  const tan = Math.tan(THREE.MathUtils.degToRad(FOV) / 2);
  restDistance = Math.min(PLANE_H / 2 / tan, PLANE_W / 2 / (camera.aspect * tan));
  eye.set(0, 0, restDistance);
  for (const m of MILESTONES) m.rest = m.z + restDistance;
}
layout();

const vert = /* glsl */`
  uniform sampler2D uDepth; uniform float uRelief; uniform vec3 uEye;
  varying vec2 vUv; varying float vDepth; varying float vViewDist;
  void main() {
    vUv = uv;
    float d = texture2D(uDepth, uv).r;
    vDepth = d;
    vec3 p = mix(position, uEye, d * uRelief);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vViewDist = -mv.z;
    gl_Position = projectionMatrix * mv;
  }`;
const frag = /* glsl */`
  uniform sampler2D uColor; uniform float uOpacity; uniform vec3 uFog; uniform vec2 uFogRange;
  varying vec2 vUv; varying float vDepth; varying float vViewDist;
  void main() {
    vec3 c = texture2D(uColor, vUv).rgb;
    // Triangles stretched across a depth cliff smear the plate; let them fade into the dark instead.
    float a = uOpacity * (1.0 - smoothstep(0.035, 0.09, fwidth(vDepth)));
    vec2 e = smoothstep(vec2(0.0), vec2(0.015), vUv) * smoothstep(vec2(0.0), vec2(0.015), 1.0 - vUv);
    a *= e.x * e.y;
    // Plates far down the tunnel show as a dim window, the way a distant era appears ahead.
    float f = smoothstep(uFogRange.x, uFogRange.y, vViewDist) * 0.8;
    gl_FragColor = vec4(mix(c, uFog, f), a);
    #include <colorspace_fragment>
  }`;

const loader = new THREE.TextureLoader();
const fogColor = new THREE.Color(0x0d0a07);
const meshes = MILESTONES.map((m, i) => {
  const color = loader.load(`${ART}${m.key}-1600.webp`);
  color.colorSpace = THREE.SRGBColorSpace;
  color.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const material = new THREE.ShaderMaterial({
    vertexShader: vert, fragmentShader: frag, transparent: true,
    uniforms: {
      uColor: { value: color }, uDepth: { value: loader.load(`${ART}${m.key}-depth.webp`) }, uRelief: { value: RELIEF }, uEye: { value: eye },
      uOpacity: { value: 1 }, uFog: { value: fogColor }, uFogRange: { value: new THREE.Vector2(FOG_NEAR, FOG_FAR) },
    },
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(PLANE_W, PLANE_H, 320, 214), material);
  mesh.position.z = m.z;
  mesh.renderOrder = -i;                   // farther plates draw first
  scene.add(mesh);
  return mesh;
});

// Dust drifting through the tunnel: barely visible at rest, it streaks when you move through time.
const DUST = 2400;
const dustPositions = new Float32Array(DUST * 3);
const zMax = MILESTONES[0].z + 40, zMin = MILESTONES.at(-1).z - 40;
for (let i = 0; i < DUST; i++) {
  const r = 3 + Math.random() * 16, a = Math.random() * Math.PI * 2;
  dustPositions.set([Math.cos(a) * r, Math.sin(a) * r * .7, zMin + Math.random() * (zMax - zMin)], i * 3);
}
const dustGeometry = new THREE.BufferGeometry();
dustGeometry.setAttribute("position", new THREE.BufferAttribute(dustPositions, 3));
const dust = new THREE.PointsMaterial({ color: 0xe2b867, size: .06, transparent: true, opacity: .15, blending: THREE.AdditiveBlending, depthWrite: false });
scene.add(new THREE.Points(dustGeometry, dust));
scene.fog = new THREE.Fog(0x0d0a07, FOG_NEAR, 60);

// Progress runs from 0 to N-1; an integer means resting in front of that milestone.
const N = MILESTONES.length;
const startYear = Number(new URLSearchParams(location.search).get("t") || Y0);
const startIndex = Math.max(0, MILESTONES.findIndex(m => m.year >= startYear));
let target = startIndex, progress = startIndex, velocity = 0, lastInput = 0;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = (a, b, t) => { t = clamp((t - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

function cameraZ(p) {
  const i = Math.min(Math.floor(p), N - 2), t = p - i;
  // Linger near each plate, rush through the gap between them.
  const e = t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  return THREE.MathUtils.lerp(MILESTONES[i].rest, MILESTONES[i + 1].rest, e);
}
function yearAt(p) {
  const i = Math.min(Math.floor(p), N - 2);
  return THREE.MathUtils.lerp(MILESTONES[i].year, MILESTONES[i + 1].year, p - i);
}

// ---- Walking into a plate: the plate's own scene waits in an iframe, framed exactly like the plate. ----
// tunnel → entering (camera settles on the resting spot) → inside (scene on top, tunnel idle) → leaving → tunnel
let mode = "tunnel", workshopReady = false, settleStarted = 0;
const workshop = document.createElement("iframe");
workshop.id = "workshop"; workshop.title = "1822 差分机工坊"; workshop.setAttribute("allow", "fullscreen");
const sceneMilestone = MILESTONES.find(m => m.scene);
workshop.src = sceneMilestone.scene;
document.body.append(workshop);
const tellWorkshop = (type) => workshop.contentWindow.postMessage({ source: "chronicle-tunnel", type }, location.origin);
const setMode = (next) => { mode = next; document.body.classList.toggle("is-entering", next === "entering"); document.body.classList.toggle("is-inside", next === "inside"); };

addEventListener("message", (event) => {
  if (event.origin !== location.origin || event.source !== workshop.contentWindow || event.data?.source !== "workshop-1822") return;
  if (event.data.type === "ready") { workshopReady = true; shown = -1; }
  if (event.data.type === "entered") {
    workshop.classList.add("is-open");
    setTimeout(() => { if (mode === "entering") { setMode("inside"); workshop.focus(); } }, reducedMotion.matches ? 0 : 800);
  }
  if (event.data.type === "exit") {
    // Take the keyboard back from the iframe, or the arrow keys keep going to the workshop.
    setMode("leaving"); workshop.classList.remove("is-open"); lastInput = 0; renderer.domElement.focus({ preventScroll: true });
    setTimeout(() => { if (mode === "leaving") { setMode("tunnel"); shown = -1; } }, reducedMotion.matches ? 0 : 800);
  }
});
function enterScene() {
  const i = Math.round(progress);
  if (mode !== "tunnel" || !MILESTONES[i].scene || !workshopReady || Math.abs(progress - i) > .02) return;
  target = i; settleStarted = performance.now(); setMode("entering");
}

// ---- Input ----
const interactive = () => mode === "tunnel";
function nudge(d) { if (!interactive()) return; target = clamp(target + d, 0, N - 1); lastInput = performance.now(); }
addEventListener("wheel", e => { e.preventDefault(); nudge(e.deltaY * .0012); }, { passive: false });
addEventListener("keydown", e => {
  if (!interactive()) return;
  if (e.key === "ArrowRight" || e.key === "ArrowDown") { target = clamp(Math.round(target) + 1, 0, N - 1); lastInput = 0; }
  if (e.key === "ArrowLeft" || e.key === "ArrowUp") { target = clamp(Math.round(target) - 1, 0, N - 1); lastInput = 0; }
  if (e.key === "Enter" && !(document.activeElement instanceof HTMLButtonElement)) enterScene();
});
let dragY = null;
renderer.domElement.addEventListener("pointerdown", e => { dragY = e.clientY; });
addEventListener("pointerup", () => { dragY = null; });
const mouse = new THREE.Vector2(), mouseSmooth = new THREE.Vector2(), CENTER = new THREE.Vector2();
let swayAmount = 1;
addEventListener("pointermove", e => {
  mouse.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight * 2 - 1));
  if (dragY !== null) { nudge((dragY - e.clientY) * .004); dragY = e.clientY; }
});

// ---- Timeline bar, positioned by real years ----
const bar = document.getElementById("bar"), cursor = document.getElementById("cursor");
const xOf = y => (y - Y0) / (Y1 - Y0) * 100;
const ticks = MILESTONES.map((m, i) => {
  const tick = document.createElement("div");
  tick.className = "tick" + (m.scene ? " scene" : ""); tick.style.left = xOf(m.year) + "%";
  tick.innerHTML = `<span>${Math.floor(m.year)}</span>`;
  // Two milestones a year apart would print on top of each other; lift the later label above the track.
  if (i > 0 && m.year - MILESTONES[i - 1].year < 3) tick.firstChild.style.top = "-20px";
  bar.appendChild(tick);
  return tick;
});
bar.addEventListener("click", e => {
  if (!interactive()) return;
  const r = bar.getBoundingClientRect(), y = Y0 + (e.clientX - r.left) / r.width * (Y1 - Y0);
  let best = 0;
  MILESTONES.forEach((m, i) => { if (Math.abs(m.year - y) < Math.abs(MILESTONES[best].year - y)) best = i; });
  target = best; lastInput = 0;
});

const el = id => document.getElementById(id);
const enterButton = el("enter");
enterButton.addEventListener("click", enterScene);
let shown = -1;
function updateHud(p) {
  const i = Math.round(p), near = Math.abs(p - i) < .12;
  el("year").textContent = Math.floor(yearAt(p));
  el("hud").style.opacity = near ? 1 : .55;
  cursor.style.left = xOf(yearAt(p)) + "%";
  enterButton.hidden = !(MILESTONES[i].scene && near);
  if (i !== shown) {
    shown = i;
    const m = MILESTONES[i];
    el("meta").textContent = `蒸汽时代 · ${m.date} · ${m.tag}`;
    el("title").textContent = m.title;
    el("desc").textContent = m.desc;
    enterButton.disabled = !workshopReady;
    enterButton.firstChild.textContent = workshopReady ? "走进工坊 " : "正在打开工坊… ";
    ticks.forEach((t, k) => t.classList.toggle("on", k === i));
  }
}

const clock = new THREE.Clock();
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), .05), now = performance.now();
  if (mode === "inside") return;          // the scene is on top; the tunnel holds still underneath

  // After the user stops scrolling, settle on the nearest milestone.
  if (now - lastInput > 220) target += (Math.round(target) - target) * Math.min(1, dt * 6);
  const previous = progress;
  progress += (target - progress) * Math.min(1, dt * 3.2);
  velocity = THREE.MathUtils.lerp(velocity, Math.abs(progress - previous) / Math.max(dt, 1e-3), .15);

  // Entering: let go of the pointer and the sway until the camera sits exactly on the resting spot.
  const still = mode !== "tunnel";
  mouseSmooth.lerp(still ? CENTER : mouse, Math.min(1, dt * (still ? 6 : 4)));
  swayAmount = THREE.MathUtils.lerp(swayAmount, still ? 0 : 1, Math.min(1, dt * 6));
  if (mode === "entering" && !settleStarted) mouseSmooth.set(0, 0);
  const t = clock.elapsedTime, sway = swayAmount, camZ = cameraZ(progress);
  camera.position.set(mouseSmooth.x * 1.6 + Math.sin(t * .3) * .15 * sway, mouseSmooth.y * .9 + Math.cos(t * .23) * .1 * sway, camZ);
  const ahead = MILESTONES.find(m => m.z < camZ - .5) ?? MILESTONES.at(-1);
  camera.lookAt(-mouseSmooth.x * .6, -mouseSmooth.y * .4, ahead.z);
  if (mode === "entering" && settleStarted && now - settleStarted > (reducedMotion.matches ? 0 : 700)) {
    // Snap the last few percent so this frame is the plate exactly as the workshop's plate camera frames it.
    progress = target; settleStarted = 0; mouseSmooth.set(0, 0); swayAmount = 0;
    camera.position.set(0, 0, MILESTONES[target].rest); camera.lookAt(0, 0, MILESTONES[target].z);
    tellWorkshop("enter");
  }

  MILESTONES.forEach((m, i) => {
    const d = camZ - m.z;                  // distance in front of the plate; negative once flown through
    meshes[i].material.uniforms.uOpacity.value = smooth(1.2, 6.5, d);
    meshes[i].visible = d > .5;
  });
  dust.opacity = .12 + clamp(velocity * .9, 0, .75);
  dust.size = .06 + clamp(velocity * .12, 0, .12);

  updateHud(progress);
  renderer.render(scene, camera);
}
addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  layout();
});
frame();
