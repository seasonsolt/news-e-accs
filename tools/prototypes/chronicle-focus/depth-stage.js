import * as THREE from "three";

// The stage as a tunnel: every picture on the axis (era openings and milestone plates, in time order) is a
// relief on the Z axis, and the camera's place follows the axis position. Adapted from
// ../chronicle-tunnel/tunnel.js; the plates and depth maps are the site's own (white = near).

const PLANE_W = 16, PLANE_H = PLANE_W * 1067 / 1600;
const FOV = 50;
const GAP = 40;                 // the same gap between every picture: on a log axis, years say nothing about distance
const RELIEF = .22;             // pulled toward the resting eye, so a plate is pixel-exact from its resting spot
const FOG_NEAR = 15, FOG_FAR = 110;
const MAX_FLIGHT = 6;           // a longer jump starts this many plates short of the target
const AHEAD = 3;                // plates kept loaded beyond the target
const DECK = 0x120e0a;
const DUST = 1500, DUST_SPAN = 140;

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
    float f = smoothstep(uFogRange.x, uFogRange.y, vViewDist) * 0.8;
    gl_FragColor = vec4(mix(c, uFog, f), a);
    #include <colorspace_fragment>
  }`;

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = (a, b, t) => { t = clamp((t - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/**
 * pictures: [{ key, src, alt, scene? }] in axis order; src without the "-1600.webp" suffix.
 * Returns null when WebGL is unavailable, so the caller keeps the flat plates.
 */
export function createDepthStage(stage, pictures, { onModeChange = () => {}, onSceneReady = () => {} } = {}) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true });
  } catch {
    return null;
  }
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(DECK);
  const canvas = renderer.domElement;
  canvas.className = "plate depth";
  canvas.setAttribute("role", "img");
  canvas.tabIndex = -1;
  stage.prepend(canvas);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(DECK, FOG_NEAR, 60);
  const camera = new THREE.PerspectiveCamera(FOV, 1, .1, 400);
  const eye = new THREE.Vector3();
  let restDistance = 12;
  const zOf = (i) => -i * GAP;
  const restOf = (i) => zOf(i) + restDistance;

  // The resting spot frames the plate like object-fit: cover, the same crop the workshop's plate camera uses.
  function layout() {
    const w = stage.clientWidth, h = stage.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const tan = Math.tan(THREE.MathUtils.degToRad(FOV) / 2);
    restDistance = Math.min(PLANE_H / 2 / tan, PLANE_W / 2 / (camera.aspect * tan));
    eye.set(0, 0, restDistance);
  }
  new ResizeObserver(layout).observe(stage);
  layout();

  // Only the plates around the camera live on the GPU; the rest load when the flight comes near.
  const loader = new THREE.TextureLoader();
  const geometry = new THREE.PlaneGeometry(PLANE_W, PLANE_H, 200, 134);
  const fogColor = new THREE.Color(DECK);
  const live = new Map();
  function plateMesh(i) {
    if (live.has(i)) return live.get(i);
    const picture = pictures[i];
    const material = new THREE.ShaderMaterial({
      vertexShader: vert, fragmentShader: frag, transparent: true,
      uniforms: {
        uColor: { value: null }, uDepth: { value: null }, uRelief: { value: RELIEF }, uEye: { value: eye },
        uOpacity: { value: 0 }, uFog: { value: fogColor }, uFogRange: { value: new THREE.Vector2(FOG_NEAR, FOG_FAR) },
      },
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.z = zOf(i);
    mesh.renderOrder = -i;                 // farther plates draw first
    mesh.visible = false;
    mesh.userData.loaded = 0;
    const loaded = () => { mesh.userData.loaded++; };
    material.uniforms.uColor.value = loader.load(`${picture.src}-1600.webp`, (texture) => {
      // A few plates are not 3:2; keep their proportions instead of stretching them over the frame.
      mesh.scale.y = (texture.image.height / texture.image.width) / (PLANE_H / PLANE_W);
      loaded();
    }, undefined, loaded);
    material.uniforms.uColor.value.colorSpace = THREE.SRGBColorSpace;
    material.uniforms.uColor.value.anisotropy = renderer.capabilities.getMaxAnisotropy();
    material.uniforms.uDepth.value = loader.load(`${picture.src}-depth.webp`, loaded, undefined, () => {
      // No depth map: a flat plate, like the page without the tunnel.
      material.uniforms.uDepth.value = flatDepth;
      loaded();
    });
    scene.add(mesh);
    live.set(i, mesh);
    return mesh;
  }
  const flatDepth = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
  flatDepth.needsUpdate = true;
  function drop(i) {
    const mesh = live.get(i);
    scene.remove(mesh);
    mesh.material.uniforms.uColor.value?.dispose();
    if (mesh.material.uniforms.uDepth.value !== flatDepth) mesh.material.uniforms.uDepth.value?.dispose();
    mesh.material.dispose();
    live.delete(i);
  }

  // Dust drifting through the tunnel: barely visible at rest, it streaks when you move through time.
  // Each mote keeps its place in the world and wraps around the camera, so the tunnel never runs out.
  const dustBase = new Float32Array(DUST);
  const dustPositions = new Float32Array(DUST * 3);
  for (let i = 0; i < DUST; i++) {
    const r = 3 + Math.random() * 16, a = Math.random() * Math.PI * 2;
    dustPositions.set([Math.cos(a) * r, Math.sin(a) * r * .7, 0], i * 3);
    dustBase[i] = Math.random() * DUST_SPAN;
  }
  const dustGeometry = new THREE.BufferGeometry();
  dustGeometry.setAttribute("position", new THREE.BufferAttribute(dustPositions, 3));
  const dust = new THREE.PointsMaterial({ color: 0xe2b867, size: .06, transparent: true, opacity: .15, blending: THREE.AdditiveBlending, depthWrite: false });
  const dustPoints = new THREE.Points(dustGeometry, dust);
  dustPoints.frustumCulled = false;
  scene.add(dustPoints);
  function placeDust(camZ) {
    for (let i = 0; i < DUST; i++) dustPositions[i * 3 + 2] = dustBase[i] + DUST_SPAN * Math.floor((camZ + 20 - dustBase[i]) / DUST_SPAN);
    dustGeometry.attributes.position.needsUpdate = true;
  }

  // Progress runs from 0 to N-1; an integer means resting in front of that picture.
  const N = pictures.length;
  let target = null, progress = null, velocity = 0;   // nothing to draw until the page says where on the axis it is
  function cameraZ(p) {
    const i = Math.min(Math.floor(p), N - 2), t = p - i;
    if (N < 2) return restOf(0);
    // Linger near each plate, rush through the gap between them.
    const e = t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    return THREE.MathUtils.lerp(restOf(i), restOf(i + 1), e);
  }

  // ---- Walking into a plate: its scene waits in an iframe, framed exactly like the plate. ----
  // stage → entering (camera settles on the resting spot) → inside (scene on top, stage idle) → leaving → stage
  let mode = "stage", settleStarted = 0, frame = null;
  const sceneFrame = { el: null, src: "", ready: false };
  const setMode = (next) => {
    mode = next;
    stage.classList.toggle("is-entering", next === "entering");
    stage.classList.toggle("is-inside", next === "inside");
    onModeChange(next);
  };
  function prepareScene(src) {
    if (sceneFrame.src === src) return;
    sceneFrame.el?.remove();
    const iframe = document.createElement("iframe");
    iframe.className = "scene-frame";
    iframe.title = "1822 差分机工坊";
    iframe.src = src;
    stage.append(iframe);
    Object.assign(sceneFrame, { el: iframe, src, ready: false });
  }
  const tellScene = (type) => sceneFrame.el.contentWindow.postMessage({ source: "chronicle-tunnel", type }, location.origin);
  addEventListener("message", (event) => {
    if (event.origin !== location.origin || event.source !== sceneFrame.el?.contentWindow || event.data?.source !== "workshop-1822") return;
    if (event.data.type === "ready") { sceneFrame.ready = true; onSceneReady(); }
    if (event.data.type === "entered") {
      sceneFrame.el.classList.add("is-open");
      setTimeout(() => { if (mode === "entering") { setMode("inside"); sceneFrame.el.focus(); } }, reducedMotion.matches ? 0 : 800);
    }
    if (event.data.type === "exit") {
      // Take the keyboard back from the iframe, or the arrow keys keep going to the scene.
      setMode("leaving"); sceneFrame.el.classList.remove("is-open"); canvas.focus({ preventScroll: true });
      setTimeout(() => { if (mode === "leaving") setMode("stage"); }, reducedMotion.matches ? 0 : 800);
    }
  });

  // ---- Pointer: the plate parts into its layers as the pointer moves ----
  const mouse = new THREE.Vector2(), mouseSmooth = new THREE.Vector2(), CENTER = new THREE.Vector2();
  let swayAmount = 1;
  stage.addEventListener("pointermove", (e) => {
    const r = stage.getBoundingClientRect();
    mouse.set((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height * 2 - 1));
  });
  stage.addEventListener("pointerleave", () => mouse.set(0, 0));

  const clock = new THREE.Clock();
  function render() {
    frame = requestAnimationFrame(render);
    const dt = Math.min(clock.getDelta(), .05), now = performance.now();
    if (mode === "inside" || !stage.clientWidth || target === null) return;   // the scene is on top; the stage holds still underneath

    // The first frame opens on the picture itself rather than flying in from the start of the axis.
    if (progress === null || reducedMotion.matches) progress = target;
    if (Math.abs(target - progress) > MAX_FLIGHT) progress = target - Math.sign(target - progress) * MAX_FLIGHT;
    const previous = progress;
    progress += (target - progress) * Math.min(1, dt * 4);
    if (Math.abs(target - progress) < 1e-4) progress = target;
    velocity = THREE.MathUtils.lerp(velocity, Math.abs(progress - previous) / Math.max(dt, 1e-3), .15);

    // Entering: let go of the pointer and the sway until the camera sits exactly on the resting spot.
    const still = mode !== "stage";
    mouseSmooth.lerp(still ? CENTER : mouse, Math.min(1, dt * (still ? 6 : 4)));
    swayAmount = THREE.MathUtils.lerp(swayAmount, still || reducedMotion.matches ? 0 : 1, Math.min(1, dt * 6));
    const t = clock.elapsedTime, camZ = cameraZ(progress);
    camera.position.set(mouseSmooth.x * 1.6 + Math.sin(t * .3) * .15 * swayAmount, mouseSmooth.y * .9 + Math.cos(t * .23) * .1 * swayAmount, camZ);
    const ahead = clamp(Math.floor((.5 - camZ) / GAP) + 1, 0, N - 1);   // the first plate still in front
    camera.lookAt(-mouseSmooth.x * .6, -mouseSmooth.y * .4, zOf(ahead));
    if (mode === "entering" && settleStarted && now - settleStarted > (reducedMotion.matches ? 0 : 700)) {
      // Snap the last few percent so this frame is the plate exactly as the scene's plate camera frames it.
      progress = target; settleStarted = 0; mouseSmooth.set(0, 0); swayAmount = 0;
      camera.position.set(0, 0, restOf(target)); camera.lookAt(0, 0, zOf(target));
      tellScene("enter");
    }

    const lo = Math.max(0, Math.floor(Math.min(progress, target)) - 1), hi = Math.min(N - 1, Math.ceil(Math.max(progress, target)) + AHEAD);
    for (const i of [...live.keys()]) if (i < lo || i > hi) drop(i);
    // A plate still loading hides the ones behind it, so the next era never shows through where this one belongs.
    let blocked = false;
    for (let i = lo; i <= hi; i++) {
      const mesh = plateMesh(i), d = camera.position.z - zOf(i);   // distance in front of the plate; negative once flown through
      const ready = mesh.userData.loaded >= 2 && !blocked;
      mesh.userData.fade = ready ? Math.min(1, (mesh.userData.fade ?? 0) + dt * 2.5) : 0;
      mesh.material.uniforms.uOpacity.value = smooth(1.2, 6.5, d) * mesh.userData.fade;
      mesh.visible = d > .5 && mesh.userData.fade > 0;
      if (d > .5 && mesh.userData.loaded < 2) blocked = true;
    }
    dust.opacity = .12 + clamp(velocity * .9, 0, .75);
    dust.size = .06 + clamp(velocity * .12, 0, .12);
    placeDust(camZ);
    renderer.render(scene, camera);
  }
  render();

  return {
    canvas,
    /** Where the axis is, in pictures: an integer rests on that picture, a fraction is in flight between two. */
    setProgress(p, alt) {
      target = clamp(p, 0, N - 1);
      canvas.setAttribute("aria-label", alt);
      const near = pictures[Math.round(target)];
      if (near?.scene && Math.abs(target - Math.round(target)) < .02) prepareScene(near.scene);
    },
    /** True while the camera rests on a picture whose scene has loaded. */
    canEnter() {
      const i = Math.round(target);
      return mode === "stage" && Math.abs(target - i) < .02 && pictures[i].scene === sceneFrame.src && sceneFrame.ready;
    },
    enter() {
      if (!this.canEnter()) return;
      target = Math.round(target); settleStarted = performance.now(); setMode("entering");
    },
    get busy() { return mode !== "stage"; },    dispose() { cancelAnimationFrame(frame); },
  };
}
