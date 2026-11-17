// The observatory as a tunnel (desktop only, loaded with three.js on demand by DepthTunnel.tsx): every
// picture on the axis (era openings and milestone plates, in time order) is a relief on the Z axis, and the
// camera's place follows the axis position. Resting on a picture shows it exactly as the <img> under the
// canvas does; between two, the camera is in flight. Each plate is displaced by its offline depth map
// (<slug>-depth.webp, white = near), so near and far part as the pointer moves.
import * as THREE from "three";
import { artUrl, artWidth, loadArtImage } from "./art.ts";

const PLANE_W = 16;
const PLANE_H = PLANE_W * 1067 / 1600;
const FOV = 50;
/** The same gap between every picture: on a log axis, years say nothing about distance. */
const GAP = 40;
/** Pulled toward the resting eye, so a plate is pixel-exact from its resting spot. */
const RELIEF = 0.22;
const FOG_NEAR = 15;
const FOG_FAR = 110;
/** A longer jump starts this many plates short of the target. */
const MAX_FLIGHT = 6;
/** Share of the remaining way the camera covers per second: lower is a slower, softer flight. */
const FOLLOW = 2.4;
/** Plates kept loaded beyond the target. */
const AHEAD = 3;
const DECK = 0x120e0a;
const DUST = 1500;
const DUST_SPAN = 140;

const VERTEX = /* glsl */`
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
const FRAGMENT = /* glsl */`
  uniform sampler2D uColor; uniform float uOpacity; uniform vec3 uFog; uniform vec2 uFogRange;
  varying vec2 vUv; varying float vDepth; varying float vViewDist;
  void main() {
    vec3 c = texture2D(uColor, vUv).rgb;
    // Triangles stretched across a depth cliff smear the plate; let them fade into the dark instead.
    float a = uOpacity * (1.0 - smoothstep(0.035, 0.09, fwidth(vDepth)));
    vec2 e = smoothstep(vec2(0.0), vec2(0.015), vUv) * smoothstep(vec2(0.0), vec2(0.015), 1.0 - vUv);
    a *= e.x * e.y;
    float f = smoothstep(uFogRange.x, uFogRange.y, vViewDist) * 0.8;
    gl_FragColor = vec4(mix(c, uFog, f), a);
    #include <colorspace_fragment>
  }`;

export interface TunnelPicture {
  /** The plate's path without the width suffix, as <Plate> takes it. */
  src: string;
}

export interface Tunnel {
  /** Where the axis is, in pictures: an integer rests on that picture, a fraction is in flight between two. */
  setProgress(progress: number, alt: string): void;
  /** The canvas shows the plate the axis rests on (until then the <img> underneath is in view). */
  readonly ready: boolean;
  dispose(): void;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const smooth = (a: number, b: number, t: number) => { const x = clamp((t - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); };

interface Plate {
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  color: THREE.Texture;
  depth: THREE.Texture;
  loaded: number;
  fade: number;
}

/** Draws into a canvas prepended to `stage`. Returns null without WebGL. `onChange` is told when the first plate is drawn or lost. */
export function createTunnel(stage: HTMLElement, pictures: TunnelPicture[], onChange: () => void): Tunnel | null {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true });
  } catch {
    return null;
  }
  if (renderer.capabilities.maxTextureSize < 800) { renderer.dispose(); return null; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(DECK);
  const canvas = renderer.domElement;
  canvas.className = "observatory-tunnel";
  canvas.setAttribute("role", "img");
  canvas.tabIndex = -1;
  stage.prepend(canvas);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(DECK, FOG_NEAR, 60);
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 400);
  const eye = new THREE.Vector3();
  let restDistance = 12;
  const zOf = (i: number) => -i * GAP;
  const restOf = (i: number) => zOf(i) + restDistance;
  const N = pictures.length;

  // The resting spot frames the plate like object-fit: cover.
  function layout() {
    const w = stage.clientWidth, h = stage.clientHeight;
    if (!w || !h) return;
    clearHigh();
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const tan = Math.tan(THREE.MathUtils.degToRad(FOV) / 2);
    restDistance = Math.min(PLANE_H / 2 / tan, PLANE_W / 2 / (camera.aspect * tan));
    eye.set(0, 0, restDistance);
    // Resizing clears the canvas: draw again now rather than leave it black until the next frame.
    if (progress !== null) draw(0);
  }

  // Only the plates around the camera live on the GPU; the rest load when the flight comes near.
  const loader = new THREE.TextureLoader();
  const geometry = new THREE.PlaneGeometry(PLANE_W, PLANE_H, 200, 134);
  const fogColor = new THREE.Color(DECK);
  const flatDepth = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
  flatDepth.needsUpdate = true;
  const live = new Map<number, Plate>();
  let high: { index: number; texture: THREE.Texture; image: HTMLImageElement } | null = null;
  let highRequest: { index: number; controller: AbortController } | null = null;
  let highAttempted: number | null = null;
  const clearHigh = () => {
    highRequest?.controller.abort();
    highRequest = null;
    highAttempted = null;
    if (!high) return;
    const entry = live.get(high.index);
    if (entry) entry.mesh.material.uniforms.uColor!.value = entry.color;
    high.texture.dispose();
    high.texture.image = null;
    high.image.removeAttribute("src");
    high = null;
  };
  const baseWidth = renderer.capabilities.maxTextureSize >= 1600 ? 1600 : 800;
  let drawn = false;
  function plate(i: number): Plate {
    const existing = live.get(i);
    if (existing) return existing;
    const picture = pictures[i]!;
    const material = new THREE.ShaderMaterial({
      vertexShader: VERTEX, fragmentShader: FRAGMENT, transparent: true,
      uniforms: {
        uColor: { value: null }, uDepth: { value: flatDepth }, uRelief: { value: RELIEF }, uEye: { value: eye },
        uOpacity: { value: 0 }, uFog: { value: fogColor }, uFogRange: { value: new THREE.Vector2(FOG_NEAR, FOG_FAR) },
      },
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.z = zOf(i);
    mesh.renderOrder = -i;   // farther plates draw first
    mesh.visible = false;
    const color = loader.load(artUrl(picture.src, baseWidth), (texture) => {
      // A few plates are not 3:2; keep their proportions instead of stretching them over the frame.
      const image = texture.image as HTMLImageElement;
      mesh.scale.y = (image.height / image.width) / (PLANE_H / PLANE_W);
      entry.loaded++;
    }, undefined, () => { entry.loaded++; });
    color.colorSpace = THREE.SRGBColorSpace;
    color.anisotropy = renderer.capabilities.getMaxAnisotropy();
    material.uniforms.uColor!.value = color;
    // Until its depth map arrives, or without one, the plate is flat, like the page without the tunnel.
    const depth = loader.load(`${picture.src}-depth.webp`, () => {
      material.uniforms.uDepth!.value = depth;
      entry.loaded++;
    }, undefined, () => { entry.loaded++; });
    const entry: Plate = { mesh, color, depth, loaded: 0, fade: 0 };
    scene.add(mesh);
    live.set(i, entry);
    return entry;
  }
  function drop(i: number) {
    if (high?.index === i || highRequest?.index === i) clearHigh();
    const entry = live.get(i);
    if (!entry) return;
    scene.remove(entry.mesh);
    entry.color.dispose();
    entry.depth.dispose();
    entry.mesh.material.dispose();
    live.delete(i);
  }

  // Dust drifting through the tunnel: barely visible at rest, it streaks when you move through time.
  // Each mote keeps its place in the world and wraps around the camera, so the tunnel never runs out.
  const dustBase = new Float32Array(DUST);
  const dustPositions = new Float32Array(DUST * 3);
  for (let i = 0; i < DUST; i++) {
    const r = 3 + Math.random() * 16, a = Math.random() * Math.PI * 2;
    dustPositions.set([Math.cos(a) * r, Math.sin(a) * r * 0.7, 0], i * 3);
    dustBase[i] = Math.random() * DUST_SPAN;
  }
  const dustGeometry = new THREE.BufferGeometry();
  dustGeometry.setAttribute("position", new THREE.BufferAttribute(dustPositions, 3));
  const dust = new THREE.PointsMaterial({ color: 0xe2b867, size: 0.06, transparent: true, opacity: 0.15, blending: THREE.AdditiveBlending, depthWrite: false });
  const dustPoints = new THREE.Points(dustGeometry, dust);
  dustPoints.frustumCulled = false;
  scene.add(dustPoints);
  function placeDust(camZ: number) {
    for (let i = 0; i < DUST; i++) dustPositions[i * 3 + 2] = dustBase[i]! + DUST_SPAN * Math.floor((camZ + 20 - dustBase[i]!) / DUST_SPAN);
    dustGeometry.attributes.position!.needsUpdate = true;
  }

  // Progress runs from 0 to N-1. Nothing is drawn until the page says where on the axis it is.
  let target: number | null = null, progress: number | null = null, velocity = 0;
  function upgradeCurrent() {
    if (target === null || progress === null || Math.abs(target - progress) >= 1e-4) return;
    const i = Math.round(target), entry = live.get(i);
    if (!entry || entry.loaded < 2 || entry.fade < 1) return;
    const image = entry.color.image as HTMLImageElement;
    if (!image?.naturalWidth) return;
    const width = artWidth(stage.clientWidth, stage.clientHeight, window.devicePixelRatio, renderer.capabilities.maxTextureSize, image.naturalWidth / image.naturalHeight);
    if (width !== 3840 || high?.index === i || highRequest?.index === i || highAttempted === i) return;
    const controller = new AbortController(), requestedTarget = target;
    highAttempted = i;
    highRequest = { index: i, controller };
    void loadArtImage(`${pictures[i]!.src}-3840.webp`, controller.signal).then((decoded) => {
      if (controller.signal.aborted || target !== requestedTarget || live.get(i) !== entry) { decoded.removeAttribute("src"); return; }
      const texture = new THREE.Texture(decoded);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
      texture.needsUpdate = true;
      high = { index: i, texture, image: decoded };
      entry.mesh.material.uniforms.uColor!.value = texture;
    }).catch(() => {}).finally(() => { if (highRequest?.controller === controller) highRequest = null; });
  }
  function cameraZ(p: number) {
    if (N < 2) return restOf(0);
    const i = Math.min(Math.floor(p), N - 2), t = p - i;
    // Linger near each plate, rush through the gap between them.
    const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    return THREE.MathUtils.lerp(restOf(i), restOf(i + 1), e);
  }

  // The plate parts into its layers as the pointer moves.
  const mouse = new THREE.Vector2(), mouseSmooth = new THREE.Vector2();
  const onMove = (e: PointerEvent) => {
    const r = stage.getBoundingClientRect();
    mouse.set((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height * 2 - 1));
  };
  const onLeave = () => mouse.set(0, 0);
  stage.addEventListener("pointermove", onMove);
  stage.addEventListener("pointerleave", onLeave);

  const clock = new THREE.Clock();
  let raf = 0, visible = true;
  function draw(dt: number) {
    if (target === null || progress === null) return;
    if (Math.abs(target - progress) > MAX_FLIGHT) progress = target - Math.sign(target - progress) * MAX_FLIGHT;
    const previous = progress;
    progress += (target - progress) * Math.min(1, dt * FOLLOW);
    if (Math.abs(target - progress) < 1e-4) progress = target;
    velocity = THREE.MathUtils.lerp(velocity, Math.abs(progress - previous) / Math.max(dt, 1e-3), 0.15);

    mouseSmooth.lerp(mouse, Math.min(1, dt * 4));
    const t = clock.elapsedTime, camZ = cameraZ(progress);
    camera.position.set(mouseSmooth.x * 1.6 + Math.sin(t * 0.3) * 0.15, mouseSmooth.y * 0.9 + Math.cos(t * 0.23) * 0.1, camZ);
    const ahead = clamp(Math.floor((0.5 - camZ) / GAP) + 1, 0, N - 1);   // the first plate still in front
    camera.lookAt(-mouseSmooth.x * 0.6, -mouseSmooth.y * 0.4, zOf(ahead));

    const lo = Math.max(0, Math.floor(Math.min(progress, target)) - 1), hi = Math.min(N - 1, Math.ceil(Math.max(progress, target)) + AHEAD);
    for (const i of [...live.keys()]) if (i < lo || i > hi) drop(i);
    // A plate still loading hides the ones behind it, so the next era never shows through where this one belongs.
    let blocked = false;
    for (let i = lo; i <= hi; i++) {
      const entry = plate(i), d = camera.position.z - zOf(i);   // distance in front of the plate; negative once flown through
      entry.fade = entry.loaded >= 2 && !blocked ? Math.min(1, entry.fade + dt * 2.5) : 0;
      entry.mesh.material.uniforms.uOpacity!.value = smooth(1.2, 6.5, d) * entry.fade;
      entry.mesh.visible = d > 0.5 && entry.fade > 0;
      if (d > 0.5 && entry.loaded < 2) blocked = true;
    }
    dust.opacity = 0.12 + clamp(velocity * 0.9, 0, 0.75);
    dust.size = 0.06 + clamp(velocity * 0.12, 0, 0.12);
    placeDust(camZ);
    renderer.render(scene, camera);
    upgradeCurrent();
    // The canvas shows once the plate it rests on is drawn; until then the <img> underneath stays in view.
    const resting = live.get(Math.round(target));
    if (!drawn && resting && resting.fade >= 1) { drawn = true; canvas.classList.add("is-ready"); onChange(); }
  }
  function loop() {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(clock.getDelta(), 0.05);
    if (!visible || !stage.clientWidth) return;
    draw(dt);
  }
  const sizes = new ResizeObserver(layout);
  sizes.observe(stage);
  const view = new IntersectionObserver(([entry]) => { visible = !!entry?.isIntersecting; });
  view.observe(stage);
  const onLost = (event: Event) => { event.preventDefault(); clearHigh(); cancelAnimationFrame(raf); drawn = false; canvas.classList.remove("is-ready"); onChange(); };
  canvas.addEventListener("webglcontextlost", onLost);
  layout();
  loop();

  return {
    setProgress(p, alt) {
      const next = clamp(p, 0, N - 1);
      if (target !== next) clearHigh();
      target = next;
      // The first frame opens on the picture itself rather than flying in from the start of the axis.
      if (progress === null) progress = target;
      canvas.setAttribute("aria-label", alt);
    },
    get ready() { return drawn; },
    dispose() {
      cancelAnimationFrame(raf);
      clearHigh();
      sizes.disconnect();
      view.disconnect();
      stage.removeEventListener("pointermove", onMove);
      stage.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("webglcontextlost", onLost);
      for (const i of [...live.keys()]) drop(i);
      geometry.dispose();
      flatDepth.dispose();
      dustGeometry.dispose();
      dust.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}
