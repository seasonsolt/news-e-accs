// The observatory's depth: the plate redrawn in WebGL over its <img>, each pixel displaced by its depth
// (an offline map, <slug>-depth.webp from tools/make-depth.py, white = near) against the pointer, so
// near and far slide apart and the plate reads as a window. A touchscreen gets a slow drift instead.
// Near surfaces cover far ones at their edges, and every surface keeps in one piece as it slides.
// Changing plates is a jump: the current one accelerates into streaks along the rays from the vanishing
// point, a white-hot flash covers the cut, and the next arrives streaking and slows to rest; going back in
// time plays the jump in reverse. A plate without a depth map is one flat layer (no parallax, still the jump).
// Decoration only: nothing is drawn on the server, under reduced motion, without WebGL or when a plate
// fails to load, and the static plate underneath stays exactly as it was. Paused off screen.
import { useEffect, useRef, useState } from "react";
import { hasFinePointer, useMotionAllowed } from "../motion/preferences";
import { artUrl, artWidth, loadArtImage } from "./art";

/** How far a layer at the extreme of the depth range moves at full pointer travel, per unit of depth. */
const STRENGTH = 0.024;
/** The depth that stays put: nearer layers move one way, farther ones the other. */
const FOCUS = 0.5;
/** Sampled area shrunk by this, so displacement never reaches the image's edge. */
const ZOOM = 1.04;
/** Matches .observatory-plate's object-position: 50% 38%. */
const POSITION_Y = 0.38;
const MAX_DPR = 2;
/** Share of the remaining distance the parallax covers per 1/60 s, whatever the display's refresh rate. */
const EASE = 0.08;
const FLIGHT_MS = 900;
/** How long a plate waits for its depth map before setting off flat; a late map is filled in on arrival. */
const DEPTH_GRACE_MS = 150;
/** Decoded plates kept at hand: the current one, the way back and the ones ahead. */
const CACHE_SIZE = 6;
/** Neighbours are fetched once the current plate has had a moment to load first. */
const NEARBY_DELAY_MS = 400;

const VERTEX = `
attribute vec2 aPos;
varying vec2 vUv;
void main() { vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;

// A is the plate left behind on a jump forward, B the one arrived at; uWarp 0 shows A alone, 1 B alone.
// highp: at mediump (half floats on Apple GPUs) a 1600-px plate can only be sampled in steps of about a
// pixel, and the displaced image visibly ticks along instead of gliding.
const FRAGMENT = `
precision highp float;
uniform sampler2D uImgA, uDepthA, uImgB, uDepthB;
uniform vec4 uCoverA, uCoverB;
uniform vec2 uPointer;
uniform float uStrength, uFocus, uWarp;
varying vec2 vUv;
const vec2 VANISH = vec2(0.5, 0.55);
// Occlusion search: march the sight line from the nearest depth to the farthest and stop at the first
// surface it meets, refined between the last two steps. Each point moves by its own depth, so a surface
// spanning many depths stays in one piece (cutting depth into cards tore such surfaces where a cut ran
// through them), and the nearest surface wins at an edge, so edges stay hard instead of rippling.
const int STEPS = 24;
vec2 layered(sampler2D depth, vec2 uv) {
  vec2 travel = uPointer * uStrength;
  float before = 1.0;
  float gap = texture2D(depth, uv + travel * (1.0 - uFocus)).r - 1.0;
  if (gap >= 0.0) return uv + travel * (1.0 - uFocus);
  for (int i = 1; i <= STEPS; i++) {
    float d = 1.0 - float(i) / float(STEPS);
    float next = texture2D(depth, uv + travel * (d - uFocus)).r - d;
    if (next >= 0.0) return uv + travel * (mix(d, before, next / (next - gap)) - uFocus);
    before = d;
    gap = next;
  }
  return uv - travel * uFocus;
}
// The plate at a given speed: magnified toward the vanishing point and smeared along the rays from it.
vec3 plate(sampler2D img, sampler2D depth, vec4 cover, float speed) {
  vec2 s = VANISH + (vUv - VANISH) / (1.0 + 0.25 * speed);
  vec2 tex = cover.zw + s * cover.xy;
  vec2 shift = layered(depth, tex) - tex;
  if (speed <= 0.0) return texture2D(img, tex + shift).rgb;
  vec3 sum = vec3(0.0);
  for (int i = 0; i < 12; i++) {
    vec2 q = VANISH + (s - VANISH) * (1.0 - 0.3 * speed * float(i) / 11.0);
    sum += texture2D(img, cover.zw + q * cover.xy + shift).rgb;
  }
  return sum / 12.0 * (1.0 + 0.25 * speed);
}
void main() {
  float t = uWarp;
  // A accelerates away until the cut at the midpoint, B arrives at full speed and slows to rest.
  vec3 colour = t < 0.5
    ? plate(uImgA, uDepthA, uCoverA, pow(t / 0.5, 3.0))
    : plate(uImgB, uDepthB, uCoverB, pow(1.0 - (t - 0.5) / 0.5, 3.0));
  // The jump itself: a warm flash over the cut, short of white so it does not glare.
  float flash = exp(-pow((t - 0.5) / 0.06, 2.0));
  gl_FragColor = vec4(mix(colour, vec3(1.0, 0.9, 0.76), 0.6 * flash), 1.0);
}`;

/** A plate's image and depth textures and its aspect ratio. */
interface Slot {
  src: string;
  image: WebGLTexture;
  depth: WebGLTexture;
  base: HTMLImageElement;
  high?: boolean;
  aspect: number;
  dropped?: boolean;
}

function load(url: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.src = url;
  return image.decode().then(() => image);
}

function compile(gl: WebGLRenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  return shader;
}

function texture(gl: WebGLRenderingContext, source: HTMLImageElement | null): WebGLTexture {
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  // No depth map: one mid-grey pixel, the focus depth everywhere, so nothing moves with the pointer.
  if (source) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, source);
  else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([128, 128, 128, 255]));
  // Plates are not powers of two: no mipmaps in WebGL1, so linear and clamped.
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

/** A plate's images, decoding; a missing depth map settles as null. */
interface Pictures {
  image: Promise<HTMLImageElement>;
  depth: Promise<HTMLImageElement | null>;
}

/** Fetches and decodes a plate once, keeping the most recently used few. */
function fetchPlate(cache: Map<string, Pictures>, src: string, width: 800 | 1600 = 1600): Pictures {
  const key = artUrl(src, width);
  let entry = cache.get(key);
  if (entry) cache.delete(key);
  else {
    const fresh: Pictures = { image: load(key), depth: load(`${src}-depth.webp`).catch(() => null) };
    // A failed plate is forgotten, so that coming back to it tries again.
    fresh.image.catch(() => { if (cache.get(key) === fresh) cache.delete(key); });
    entry = fresh;
  }
  cache.set(key, entry);
  for (const key of cache.keys()) if (cache.size > CACHE_SIZE) cache.delete(key);
  return entry;
}

/**
 * `src` is the plate's path without the width suffix, as <Plate> takes it; `at` is the plate's time;
 * `nearby` are the plates one step either way, fetched ahead so that the jump to them starts at once.
 */
export function DepthLayer({ src, at, nearby }: { src: string; at: number; nearby: string[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const cache = useRef(new Map<string, Pictures>());
  const prefetchWidth = useRef<800 | 1600>(1600);
  const show = useRef<((src: string, at: number) => void) | null>(null);
  const allowed = useMotionAllowed();
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const layer = ref.current;
    const stage = layer?.parentElement;
    if (!allowed || !layer || !stage) return;
    // A fresh canvas per run: its context is released on cleanup and a released one cannot come back
    // (StrictMode runs this twice on the same element).
    const canvas = document.createElement("canvas");
    layer.append(canvas);
    const gl = canvas.getContext("webgl", { alpha: false, antialias: false, depth: false, stencil: false });
    if (!gl) { canvas.remove(); setFailed(true); return; }
    const textureLimit = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
    const baseWidth = textureLimit >= 1600 ? 1600 : 800;
    if (textureLimit < baseWidth) { gl.getExtension("WEBGL_lose_context")?.loseContext(); canvas.remove(); setFailed(true); return; }
    prefetchWidth.current = baseWidth;

    const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX);
    const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT);
    const program = gl.createProgram()!;
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    const buffer = gl.createBuffer();
    const release = () => {
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
      // Release the context now rather than at garbage collection.
      gl.getExtension("WEBGL_lose_context")?.loseContext();
      canvas.remove();
    };
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) { release(); setFailed(true); return; }
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(program, "aPos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    const uniform = (name: string) => gl.getUniformLocation(program, name);
    ["uImgA", "uDepthA", "uImgB", "uDepthB"].forEach((name, unit) => gl.uniform1i(uniform(name), unit));
    gl.uniform1f(uniform("uStrength"), STRENGTH);
    gl.uniform1f(uniform("uFocus"), FOCUS);
    const uPointer = uniform("uPointer");
    const uCoverA = uniform("uCoverA");
    const uCoverB = uniform("uCoverB");
    const uWarp = uniform("uWarp");

    let cancelled = false;
    let frame = 0;
    let visible = true;
    let previous = 0;
    let request = 0;
    let highRequest: AbortController | null = null;
    let currentSrc = "";
    let shownAt: number | null = null;
    // Idle: `front` alone. In flight: `front` is A and `back` is B, warp running from `from` to `to`.
    let front: Slot | null = null;
    let back: Slot | null = null;
    let flight: { start: number; from: number; to: number } | null = null;
    const target = { x: 0, y: 0 };
    const pointer = { x: 0, y: 0 };
    const fine = hasFinePointer();

    const drop = (slot: Slot | null) => {
      if (!slot) return;
      slot.dropped = true;
      gl.deleteTexture(slot.image);
      gl.deleteTexture(slot.depth);
    };
    const cover = (location: WebGLUniformLocation | null, slot: Slot) => {
      // object-fit: cover, then the zoom margin; y counts from the bottom because textures are flipped.
      const box = canvas.width / canvas.height;
      const sx = (box > slot.aspect ? 1 : box / slot.aspect) / ZOOM;
      const sy = (box > slot.aspect ? slot.aspect / box : 1) / ZOOM;
      gl.uniform4f(location, sx, sy, (1 - sx) / 2, (1 - sy) * (1 - POSITION_Y));
    };
    const bind = () => {
      if (!front) return;
      const b = back ?? front;
      [front.image, front.depth, b.image, b.depth].forEach((tex, unit) => {
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, tex);
      });
      cover(uCoverA, front);
      cover(uCoverB, b);
    };
    const clearHigh = () => {
      highRequest?.abort();
      highRequest = null;
      if (front?.high) {
        gl.deleteTexture(front.image);
        front.image = texture(gl, front.base);
        front.high = false;
        bind();
      }
    };
    const upgrade = () => {
      const slot = front;
      if (!slot || slot.src !== currentSrc || slot.high || flight || highRequest) return;
      const width = artWidth(canvas.clientWidth, canvas.clientHeight, window.devicePixelRatio, textureLimit, slot.aspect);
      if (width !== 3840) return;
      const controller = new AbortController();
      highRequest = controller;
      void loadArtImage(`${slot.src}-3840.webp`, controller.signal).then((image) => {
        if (cancelled || controller.signal.aborted || front !== slot || flight) { image.removeAttribute("src"); return; }
        const high = texture(gl, image);
        image.removeAttribute("src");
        gl.deleteTexture(slot.image);
        slot.image = high;
        slot.high = true;
        bind();
        start();
      }).catch(() => {}).finally(() => { if (highRequest === controller) highRequest = null; });
    };
    /** Ends a flight where it was heading: the plate it arrives at becomes the only one. */
    const land = () => {
      if (!flight) return;
      if (flight.to === 1) { drop(front); front = back; } else drop(back);
      back = null;
      flight = null;
      gl.uniform1f(uWarp, 0);
      bind();
      upgrade();
    };
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      canvas.width = Math.max(1, Math.round(canvas.clientWidth * dpr));
      canvas.height = Math.max(1, Math.round(canvas.clientHeight * dpr));
      gl.viewport(0, 0, canvas.width, canvas.height);
      clearHigh();
      bind();
      upgrade();
    };
    const draw = (now: number) => {
      frame = 0;
      if (!front) return;
      const ease = 1 - (1 - EASE) ** Math.min(4, previous ? (now - previous) / (1000 / 60) : 1);
      previous = now;
      if (!fine) {
        target.x = 0.5 * Math.sin(now * 0.00021);
        target.y = 0.5 * Math.sin(now * 0.00013 + 1);
      }
      pointer.x += (target.x - pointer.x) * ease;
      pointer.y += (target.y - pointer.y) * ease;
      // Screen y runs down, texture y up: moving the pointer down lifts what is near.
      gl.uniform2f(uPointer, pointer.x, -pointer.y);
      const u = flight ? Math.min(1, (now - flight.start) / FLIGHT_MS) : 0;
      if (flight) gl.uniform1f(uWarp, flight.from + (flight.to - flight.from) * u);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (u === 1) land();
      if (visible) frame = requestAnimationFrame(draw);
    };
    const start = () => { if (!frame && front && visible) frame = requestAnimationFrame(draw); };

    show.current = (next, nextAt) => {
      const id = ++request;
      clearHigh();
      currentSrc = next;
      const { image: imageLoad, depth: depthLoad } = fetchPlate(cache.current, next, baseWidth);
      // A missing map is a 404 page, which can take seconds; it must not hold the jump up.
      const grace = new Promise<undefined>((resolve) => setTimeout(resolve, DEPTH_GRACE_MS));
      Promise.all([imageLoad, Promise.race([depthLoad, grace])]).then(([image, depth]) => {
        if (cancelled || id !== request) return;
        land();
        const slot: Slot = { src: next, image: texture(gl, image), depth: texture(gl, depth ?? null), base: image, aspect: image.naturalWidth / image.naturalHeight };
        if (depth === undefined) {
          void depthLoad.then((late) => {
            if (!late || cancelled || slot.dropped) return;
            gl.bindTexture(gl.TEXTURE_2D, slot.depth);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, late);
            bind();
          });
        }
        const forward = shownAt === null || nextAt >= shownAt;
        shownAt = nextAt;
        if (!front) {
          front = slot;
          bind();
          draw(performance.now());
          setReady(true);
          upgrade();
          return;
        }
        // Forward: the current plate is A and jumps away. Back: the arriving plate is A, the jump played in reverse.
        if (forward) { back = slot; flight = { start: performance.now(), from: 0, to: 1 }; }
        else { back = front; front = slot; flight = { start: performance.now(), from: 1, to: 0 }; }
        bind();
        start();
      }, () => {
        // The plate itself is missing: show the static <img> (its own empty state) until the next one.
        if (cancelled || id !== request) return;
        land();
        drop(front);
        front = null;
        shownAt = null;
        setReady(false);
      });
    };

    const onMove = (event: PointerEvent) => {
      const box = stage.getBoundingClientRect();
      target.x = ((event.clientX - box.left) / box.width) * 2 - 1;
      target.y = ((event.clientY - box.top) / box.height) * 2 - 1;
    };
    const onLeave = () => { target.x = 0; target.y = 0; };
    const onLost = () => { cancelled = true; highRequest?.abort(); highRequest = null; cancelAnimationFrame(frame); setFailed(true); };
    const sizes = new ResizeObserver(resize);
    const view = window.IntersectionObserver ? new IntersectionObserver(([entry]) => {
      visible = !!entry?.isIntersecting;
      if (visible) start();
      else { cancelAnimationFrame(frame); frame = 0; previous = 0; land(); }
    }) : null;
    resize();
    sizes.observe(canvas);
    view?.observe(stage);
    if (fine) {
      stage.addEventListener("pointermove", onMove);
      stage.addEventListener("pointerleave", onLeave);
    }
    canvas.addEventListener("webglcontextlost", onLost);
    return () => {
      cancelled = true;
      highRequest?.abort();
      highRequest = null;
      show.current = null;
      cancelAnimationFrame(frame);
      sizes.disconnect();
      view?.disconnect();
      stage.removeEventListener("pointermove", onMove);
      stage.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("webglcontextlost", onLost);
      drop(front);
      drop(back);
      release();
      setReady(false);
    };
  }, [allowed]);

  // Declared after the setup effect, so on the first run and after a reset it finds `show` in place.
  useEffect(() => { show.current?.(src, at); }, [allowed, src, at]);

  // Only while the layer is drawing: the static plate needs none of this.
  const ahead = nearby.join("\n");
  useEffect(() => {
    if (!allowed || !ahead) return;
    const timer = setTimeout(() => { for (const next of ahead.split("\n")) fetchPlate(cache.current, next, prefetchWidth.current); }, NEARBY_DELAY_MS);
    return () => clearTimeout(timer);
  }, [allowed, ahead]);

  if (!allowed || failed) return null;
  return <div ref={ref} className={`observatory-depth ${ready ? "is-ready" : ""}`} aria-hidden="true" />;
}
