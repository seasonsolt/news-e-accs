// The observatory's depth: the plate redrawn in WebGL over its <img>, each pixel displaced by its depth
// (an offline map, <slug>-depth.webp from tools/make-depth.py, white = near) against the pointer, so
// near and far slide apart and the plate reads as a window. A touchscreen gets a slow drift instead.
// Decoration only: nothing is drawn on the server, under reduced motion, without WebGL or when either
// image fails, and the static plate underneath stays exactly as it was. Paused off screen.
import { useEffect, useRef, useState } from "react";
import { hasFinePointer, useMotionAllowed } from "../motion/preferences";

/** Displacement at full pointer travel, as a fraction of the image. */
const STRENGTH = 0.02;
/** The depth that stays put: nearer moves one way, farther the other. */
const FOCUS = 0.5;
/** Sampled area shrunk by this, so displacement never reaches the image's edge. */
const ZOOM = 1.04;
/** Matches .observatory-plate's object-position: 50% 38%. */
const POSITION_Y = 0.38;
const MAX_DPR = 1.5;
/** Share of the remaining distance the parallax covers per 1/60 s, whatever the display's refresh rate. */
const EASE = 0.08;

const VERTEX = `
attribute vec2 aPos;
varying vec2 vUv;
void main() { vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FRAGMENT = `
// highp: at mediump (half floats on Apple GPUs) a 1600-px plate can only be sampled in steps of about a
// pixel, and the displaced image visibly ticks along instead of gliding.
precision highp float;
uniform sampler2D uImg, uDepth;
uniform vec2 uPointer;
uniform vec4 uCover;
uniform float uStrength, uFocus;
varying vec2 vUv;
void main() {
  vec2 uv = uCover.zw + vUv * uCover.xy;
  vec2 p = uv;
  for (int i = 0; i < 4; i++) p = uv + uPointer * uStrength * (texture2D(uDepth, p).r - uFocus);
  gl_FragColor = texture2D(uImg, p);
}`;

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

function texture(gl: WebGLRenderingContext, unit: number, image: HTMLImageElement): WebGLTexture {
  const tex = gl.createTexture()!;
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, image);
  // Plates are not powers of two: no mipmaps in WebGL1, so linear and clamped.
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

/** `src` is the plate's path without the width suffix, as <Plate> takes it. */
export function DepthLayer({ src }: { src: string }) {
  const ref = useRef<HTMLDivElement>(null);
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

    let cancelled = false;
    let frame = 0;
    let visible = true;
    let aspect = 0;
    const target = { x: 0, y: 0 };
    const pointer = { x: 0, y: 0 };
    const fine = hasFinePointer();
    let program: WebGLProgram | null = null;
    let buffer: WebGLBuffer | null = null;
    let shaders: WebGLShader[] = [];
    let textures: WebGLTexture[] = [];
    let uPointer: WebGLUniformLocation | null = null;
    let uCover: WebGLUniformLocation | null = null;

    const cover = () => {
      // object-fit: cover, then the zoom margin; y counts from the bottom because textures are flipped.
      const box = canvas.width / canvas.height;
      let sx = box > aspect ? 1 : box / aspect;
      let sy = box > aspect ? aspect / box : 1;
      sx /= ZOOM;
      sy /= ZOOM;
      gl.uniform4f(uCover, sx, sy, (1 - sx) / 2, (1 - sy) * (1 - POSITION_Y));
    };
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      canvas.width = Math.max(1, Math.round(canvas.clientWidth * dpr));
      canvas.height = Math.max(1, Math.round(canvas.clientHeight * dpr));
      gl.viewport(0, 0, canvas.width, canvas.height);
      if (program) cover();
    };
    let previous = 0;
    const draw = (now: number) => {
      frame = 0;
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
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (visible) frame = requestAnimationFrame(draw);
    };
    const start = () => { if (!frame && program && visible) frame = requestAnimationFrame(draw); };

    const onMove = (event: PointerEvent) => {
      const box = stage.getBoundingClientRect();
      target.x = ((event.clientX - box.left) / box.width) * 2 - 1;
      target.y = ((event.clientY - box.top) / box.height) * 2 - 1;
    };
    const onLeave = () => { target.x = 0; target.y = 0; };
    const onLost = () => { cancelled = true; cancelAnimationFrame(frame); setFailed(true); };
    const sizes = new ResizeObserver(resize);
    const view = window.IntersectionObserver ? new IntersectionObserver(([entry]) => {
      visible = !!entry?.isIntersecting;
      if (visible) start();
      else { cancelAnimationFrame(frame); frame = 0; previous = 0; }
    }) : null;

    Promise.all([load(`${src}-1600.webp`), load(`${src}-depth.webp`)]).then(([image, depth]) => {
      if (cancelled) return;
      const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX);
      const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT);
      shaders = [vertex, fragment];
      program = gl.createProgram()!;
      gl.attachShader(program, vertex);
      gl.attachShader(program, fragment);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) { setFailed(true); return; }
      gl.useProgram(program);

      buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const aPos = gl.getAttribLocation(program, "aPos");
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      textures = [texture(gl, 0, image), texture(gl, 1, depth)];
      gl.uniform1i(gl.getUniformLocation(program, "uImg"), 0);
      gl.uniform1i(gl.getUniformLocation(program, "uDepth"), 1);
      gl.uniform1f(gl.getUniformLocation(program, "uStrength"), STRENGTH);
      gl.uniform1f(gl.getUniformLocation(program, "uFocus"), FOCUS);
      uPointer = gl.getUniformLocation(program, "uPointer");
      uCover = gl.getUniformLocation(program, "uCover");
      aspect = image.naturalWidth / image.naturalHeight;

      resize();
      sizes.observe(canvas);
      view?.observe(stage);
      if (fine) {
        stage.addEventListener("pointermove", onMove);
        stage.addEventListener("pointerleave", onLeave);
      }
      draw(performance.now());
      setReady(true);
      start();
    }, () => { if (!cancelled) setFailed(true); });

    canvas.addEventListener("webglcontextlost", onLost);
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      sizes.disconnect();
      view?.disconnect();
      stage.removeEventListener("pointermove", onMove);
      stage.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("webglcontextlost", onLost);
      for (const tex of textures) gl.deleteTexture(tex);
      for (const shader of shaders) gl.deleteShader(shader);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      // Release the context now rather than at garbage collection: switching eras remounts this layer.
      gl.getExtension("WEBGL_lose_context")?.loseContext();
      canvas.remove();
    };
  }, [allowed, src]);

  if (!allowed || failed) return null;
  return <div ref={ref} className={`observatory-depth ${ready ? "is-ready" : ""}`} aria-hidden="true" />;
}
