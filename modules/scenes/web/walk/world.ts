import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { GTAOPass } from "three/examples/jsm/postprocessing/GTAOPass.js";
import { reducedMotion } from "@aihot/web/lib/motion";
import { recordEngagement } from "@aihot/web/lib/engagement";
import { buildClouds } from "./clouds.ts";
import { buildGrass } from "./grass.ts";
import { buildLitter, soil } from "./groundcover.ts";
import { buildProps } from "./props.ts";
import { startSound, type Sound } from "./sound.ts";
import { buildVerge } from "./verge.ts";
import { CANAL, CLEARINGS, END_S, FIELD_S, FIRE_S, LAND, LINES, MONO_S, SOW_S, chapterAt, clamp, cleared, fbm, ground, mix, roadX, sequence, sheet, smooth, yearReading, yearsAgo } from "./land.ts";

const PATH = "/chronicle/walk";
// The hour at points along the road: [s, zenith, horizon, fog, sun colour, sun strength, sky light, stars, sun height, fog density].
const HOURS = ([
  [0, "#050a1e", "#1b3358", "#0f1c30", "#a9c1f2", .62, .5, 1, -.25, .0098],
  [170, "#0a1024", "#26335a", "#141d31", "#a9c1f2", .58, .55, 1, -.16, .0098],
  [255, "#1c2a52", "#c0624a", "#4a3540", "#ff9a66", .6, .62, .3, .02, .0085],
  [340, "#3f6aa6", "#f0b98a", "#b9a08d", "#ffd2a0", .95, .7, 0, .2, .0062],
  [450, "#2f6fc9", "#a9cbe8", "#c9d8de", "#fff0cf", .9, .68, 0, .46, .0038],
  [560, "#3a6db6", "#f3d9a4", "#dcc594", "#ffd58a", .95, .68, 0, .34, .0046],
  [650, "#6a6f9a", "#f6b765", "#dba566", "#ffb963", 1.05, .72, 0, .255, .0046],
] as const).map(([s, top, horizon, fog, sun, power, sky, stars, height, density]) => ({ s, top: new THREE.Color(top), horizon: new THREE.Color(horizon), fog: new THREE.Color(fog), sun: new THREE.Color(sun), power, sky, stars, height, density }));
const OUT = "\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n"; // an #include has to start its own line

export async function start(root: HTMLElement, { tx, locale }: { tx: (text: string) => string; locale: "zh" | "en" }): Promise<() => void> {
  const part = <T extends HTMLElement = HTMLElement>(name: string) => root.querySelector<T>(`[data-walk="${name}"]`)!;
  const small = matchMedia("(max-width: 640px), (pointer: coarse)").matches, still = reducedMotion(), density = small ? .42 : 1;
  const query = new URLSearchParams(location.search), useAO = !small && query.get("ao") !== "0", useSky = !small && query.get("env") !== "0"; // ?ao=0 and ?env=0 turn off the occlusion and the sky's light, to compare
  const stop = new AbortController(), listen = { signal: stop.signal }, rand = sequence(7);
  const owned: Array<{ dispose(): void }> = [];
  const own = <T extends { dispose(): void }>(item: T) => { owned.push(item); return item; };

  const renderer = new THREE.WebGLRenderer({ antialias: !small, powerPreference: "high-performance" });
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
  const canvas = renderer.domElement; canvas.tabIndex = 0; canvas.setAttribute("aria-label", tx("可行走的三维世界：从火堆穿过麦田走到巨石")); part("viewport").append(canvas);
  let ratio = Math.min(devicePixelRatio || 1, small ? 1.25 : 1.6);
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(62, 1, .1, 1600), fog = new THREE.FogExp2(0x0b0d12, .012);
  scene.fog = fog;
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: small ? 0 : 4 })), bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), .34, .6, 1);
  composer.addPass(new RenderPass(scene, camera));
  if (useAO) { // contact shadows at half resolution, over the opaque lit scenery only
    const ao = own(new GTAOPass(scene, camera)), render = ao.render.bind(ao), size = ao.setSize.bind(ao), hidden: THREE.Object3D[] = [];
    ao.updateGtaoMaterial({ radius: .6, distanceFallOff: 1, thickness: 1, samples: 12 }); ao.updatePdMaterial({ samples: 8, radius: 6 }); ao.blendIntensity = .85;
    ao.setSize = (w, h) => size(Math.ceil(w / 2), Math.ceil(h / 2));
    ao.render = (...args) => { // its depth and normals come from drawing the scene again with one plain material, which cannot follow a custom shader, a sprite or a see-through surface
      scene.traverseVisible((o) => {
        const mesh = o as THREE.Mesh, m = mesh.material as THREE.Material | undefined;
        if ((o as THREE.Sprite).isSprite || (mesh.isMesh && (!m || Array.isArray(m) || m.transparent || m.alphaTest > 0 || (m as THREE.ShaderMaterial).isShaderMaterial || ((mesh.geometry as THREE.InstancedBufferGeometry).isInstancedBufferGeometry && !(o as THREE.InstancedMesh).isInstancedMesh)))) { o.visible = false; hidden.push(o); }
      });
      renderer.shadowMap.autoUpdate = false; render(...args); renderer.shadowMap.autoUpdate = true; // the shadow maps were drawn for this frame already
      for (const o of hidden) o.visible = true; hidden.length = 0;
    };
    composer.addPass(ao);
  }
  composer.addPass(bloom); composer.addPass(new OutputPass());
  const release = () => { for (const item of owned) item.dispose(); composer.dispose(); renderer.dispose(); renderer.forceContextLoss(); canvas.remove(); };
  if (!small) { renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap; }

  // ---------- the land ----------
  // One sheet of ground for the whole walk, coloured point by point: dry earth, the worn road, the trodden camp, then tilled soil from the first sowing on.
  const across = small ? 110 : 170, along = small ? 300 : 440, floor = sheet(across, along), fireX = roadX(FIRE_S) + 2.6, stoneX = roadX(MONO_S);
  const land = own(new THREE.PlaneGeometry(LAND.width, LAND.depth, across, along).rotateX(-Math.PI / 2).translate(0, 0, LAND.behind - LAND.depth / 2));
  {
    const p = land.attributes.position!, colors = new Float32Array(p.count * 3), soils = new Float32Array(p.count * 4), c = new THREE.Color(), b = new THREE.Color();
    const inside = (x: number, s: number, [cs, off, r]: readonly [number, number, number]) => Math.hypot(x - roadX(cs) - off, s - cs) / r; // 1 on a clearing's edge
    const toSegment = (x: number, s: number, ax: number, as: number, bx: number, bs: number) => { const dx = bx - ax, ds = bs - as, t = clamp(((x - ax) * dx + (s - as) * ds) / (dx * dx + ds * ds), 0, 1); return Math.hypot(x - ax - dx * t, s - as - ds * t); };
    const paths = [[1.5, 327, 16.5, 334], [16.5, 334, 11.5, 322.6], [16.5, 334, 17.6, 330.6], [16.5, 334, 10.9, 340.7], [16.5, 334, 21.9, 344.2], [16.5, 334, 10.6, 333.6]] as const; // in the village, from the road and from the fire to each door: [offset, s] to [offset, s]
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i), s = -z, d = Math.abs(x - roadX(s)), n = fbm(x * .09, z * .09);
      p.setY(i, ground(x, z));
      c.set("#6b5a45").lerp(b.set("#94805f"), n).lerp(b.set("#7a7f4a"), smooth(170, 250, s) * smooth(.35, .7, n) * .5); // dry earth, greener toward the first field
      const road = 1 - smooth(.8, 3.4, d), camp = 1 - smooth(4, 13, Math.hypot(x - fireX - 2.5, s - FIRE_S - 1));
      c.lerp(b.set("#a08a6a"), road * .55).lerp(b.set("#8f7658"), camp); // the road and the camp are packed pale by feet
      const tilled = smooth(238, 262, s) * (1 - (1 - smooth(1.2, 2.6, d)) * (s < 470 ? .55 : 0));
      c.lerp(b.set("#5c4630").lerp(new THREE.Color("#a88a4c"), smooth(400, 480, s)).multiplyScalar(.9 + n * .25), tilled); // the furrows are drawn by the ground shader
      const off = x - roadX(s); let path = 0; // the village yard is trodden pale, with paths worn paler still
      if (s > 310 && s < 356) for (const [ax, as, bx, bs] of paths) path = Math.max(path, 1 - smooth(.5, 1.5, toSegment(off, s, ax, as, bx, bs)));
      const yard = smooth(314, 319, s) * (1 - smooth(349, 354, s)) * smooth(6.5, 9.5, off) * (1 - smooth(28, 31, off)), calendar = 1 - smooth(.85, 1.1, inside(x, s, CLEARINGS.calendar));
      c.lerp(b.set("#a99272").multiplyScalar(.92 + n * .16), yard).lerp(b.set("#bca783"), path * .85);
      c.lerp(b.set("#c4ab6c").multiplyScalar(.9 + n * .2), 1 - smooth(.85, 1.1, inside(x, s, CLEARINGS.reaped))).lerp(b.set("#b49d7b"), calendar); // stubble where it is reaped, packed earth at the calendar
      const canal = s > CANAL.from && s < CANAL.to ? Math.abs(off - CANAL.offset) : 99, channel = Math.min(...CANAL.channels.map(([a, z, end]) => toSegment(off, s, CANAL.offset, a, end, z)));
      const damp = Math.max(1 - smooth(1.2, 2.6, canal), 1 - smooth(.6, 1.8, channel), 1 - smooth(.9, 1.4, inside(x, s, CLEARINGS.pond)));
      c.lerp(b.set("#3f3224"), damp * .8); // damp earth by the water
      colors.set([c.r, c.g, c.b], i * 3); soils.set([Math.max(road * (1 - tilled), camp, yard * .8, path, calendar), damp, tilled, 0], i * 4); // what the ground shader makes of it: packed, damp, tilled; the grass cover is added once the grass is placed
    }
    land.setAttribute("color", new THREE.BufferAttribute(colors, 3)); land.setAttribute("soil", new THREE.BufferAttribute(soils, 4)); land.computeVertexNormals();
  }
  const earth = new THREE.Mesh(land, own(soil(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .95, metalness: 0 }), small, new THREE.Vector2(fireX, -FIRE_S)))); earth.receiveShadow = true; scene.add(earth); // smooth-shaded: the drawn height is unchanged, `floor` still holds

  // ---------- sky, sun and the hour ----------
  const hour = { top: new THREE.Color(), horizon: new THREE.Color(), fog: new THREE.Color(), sun: new THREE.Color(), power: 0, sky: 0, stars: 0, height: 0, density: 0 };
  function setHour(s: number) {
    let i = 0; while (i < HOURS.length - 2 && s > HOURS[i + 1]!.s) i++;
    const a = HOURS[i]!, b = HOURS[i + 1]!, t = smooth(a.s, b.s, s);
    for (const key of ["top", "horizon", "fog", "sun"] as const) hour[key].copy(a[key]).lerp(b[key], t);
    for (const key of ["power", "sky", "stars", "height", "density"] as const) hour[key] = mix(a[key], b[key], t);
  }
  const sunDir = new THREE.Vector3(), moon = new THREE.Vector3(-Math.sin(.5) * Math.cos(.3), Math.sin(.3), -Math.cos(.5) * Math.cos(.3)), nightSky = new THREE.Color("#04050c"), nightHorizon = new THREE.Color("#1a1530");
  const skyUniforms = { top: { value: new THREE.Color() }, horizon: { value: new THREE.Color() }, sun: { value: new THREE.Color() }, sunDir: { value: sunDir }, moonDir: { value: moon }, stars: { value: 1 }, time: { value: 0 }, day: { value: 0 } };
  const sky = new THREE.Mesh(own(new THREE.SphereGeometry(1200, 32, 20)), own(new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, uniforms: skyUniforms,
    vertexShader: "varying vec3 v; void main(){ v = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }",
    fragmentShader: `varying vec3 v; uniform vec3 top, horizon, sun, sunDir, moonDir; uniform float stars, time, day;
      float h(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
      float cloud(vec3 p){ vec3 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
        return mix(mix(mix(h(i), h(i + vec3(1., 0., 0.)), f.x), mix(h(i + vec3(0., 1., 0.)), h(i + vec3(1., 1., 0.)), f.x), f.y), mix(mix(h(i + vec3(0., 0., 1.)), h(i + vec3(1., 0., 1.)), f.x), mix(h(i + vec3(0., 1., 1.)), h(i + vec3(1., 1., 1.)), f.x), f.y), f.z); }
      void main(){ vec3 d = normalize(v); float up = max(d.y, 0.);
        vec3 c = mix(horizon, top, pow(up, .65)); if (d.y < 0.) c = mix(horizon, horizon * .55, min(1., -d.y * 6.));
        float g = max(dot(d, sunDir), 0.); c += sun * (pow(g, mix(8., 64., day)) * mix(.22, .075, day) + pow(g, mix(120., 360., day)) * .6) * step(-.08, sunDir.y) + sun * smoothstep(mix(.9992, .9995, day), mix(.9996, .9998, day), g) * 6.; // by day the glow keeps close to the disc, so the blue holds beside it
        vec3 cell = d * 300.; float s = h(floor(cell)); float twinkle = .65 + .35 * sin(time * 2. + s * 90.);
        float river = exp(-pow(dot(d, normalize(vec3(.62, .38, .68))) * 4.5, 2.)) * (.35 + .65 * cloud(d * 7.)) * (.6 + .4 * cloud(d * 19.)), low = smoothstep(.02, .3, d.y); // the Milky Way
        c += vec3(.34, .42, .66) * river * .2 * stars * low;
        float limit = .9975 - river * .004; c += vec3(.9, .93, 1.) * step(limit, s) * smoothstep(.5, .12, length(fract(cell) - .5)) * (.6 + 300. * (s - limit)) * twinkle * stars * low;
        float m = length(d - moonDir), lit = (1. - smoothstep(.03, .032, m)) * smoothstep(.029, .031, length(d - normalize(moonDir + vec3(.013, .007, 0.)))); // a thin old moon, low where the sun will rise
        c += vec3(1., .95, .82) * (lit * 4. + (1. - smoothstep(.03, .032, m)) * .05 + .05 / (1. + m * m * 260.)) * stars;
        gl_FragColor = vec4(c, 1.); ${OUT} }`,
  })));
  scene.add(sky);
  const skyLight = new THREE.HemisphereLight(0xffffff, 0x3a3026, .3), sunLight = new THREE.DirectionalLight(0xffffff, .2);
  scene.add(skyLight, sunLight, sunLight.target);
  if (!small) { // one shadow map that follows the walker
    sunLight.castShadow = true; sunLight.shadow.mapSize.set(2048, 2048); sunLight.shadow.bias = -.0005; sunLight.shadow.normalBias = .05; sunLight.shadow.radius = 2;
    Object.assign(sunLight.shadow.camera, { left: -46, right: 46, top: 46, bottom: -46, near: 1, far: 330 }); sunLight.shadow.camera.updateProjectionMatrix();
  }
  // the sky's own light on standard materials: the dome, over ground lit by the hour, drawn into a blurred cube; redrawn when the hour has moved on
  const pmrem = useSky ? own(new THREE.PMREMGenerator(renderer)) : null, skyScene = new THREE.Scene(), below = own(new THREE.MeshBasicMaterial({ color: 0 })), soilTone = new THREE.Color("#6b5a45"), lowLight = new THREE.Color();
  skyScene.add(new THREE.Mesh(sky.geometry, sky.material), new THREE.Mesh(own(new THREE.CircleGeometry(1100, 24).rotateX(-Math.PI / 2).translate(0, -30, 0)), below));
  const skySeen = [new THREE.Color(), new THREE.Color(), new THREE.Color(), new THREE.Vector3()] as const; let skyTarget: THREE.WebGLRenderTarget | null = null, skyAt = -1;
  own({ dispose: () => skyTarget?.dispose() });

  // ---------- grass and wheat: one instanced field for the whole walk ----------
  const blades: number[] = [], tint = new THREE.Color();
  const young = new THREE.Color("#7c9a3e"), ripe = new THREE.Color("#d9aa45"), pale = new THREE.Color("#ecc766");
  const blade = (x: number, s: number, height: number, width: number, head: number, sown: number) => { blades.push(x, ground(x, -s), -s, height, width, rand() * 6.283, head, tint.r, tint.g, tint.b, sown); };
  for (let s = FIELD_S; s < 478; s += (s < 380 ? .34 : .62) / density) for (let row = -34; row <= 34; row++) { // sown rows, greening then ripening; the young crop stands close in its rows
    if (Math.abs(row) < 2 || (s > 316 && s < 352 && row > 8 && row < 30)) continue;
    const ripeness = smooth(330, 470, s), x = roadX(s) + row * .92 + (rand() - .5) * .22, at = s + (rand() - .5) * .4;
    if (cleared(x, at)) continue;
    tint.copy(young).lerp(ripe, ripeness).multiplyScalar(.8 + rand() * .35);
    blade(x, at, .5 + ripeness * .55 + rand() * .2, .55, smooth(300, 380, s), s);
  }
  for (let i = 0; i < 96000 * density; i++) { // the open field, out to the stone and past it
    const s = 474 + rand() * 250, off = (rand() - .5) * (rand() < .62 ? 48 : 170), x = roadX(Math.min(s, MONO_S)) + off;
    if ((Math.abs(off) < 1.25 && s < MONO_S) || Math.hypot(x - stoneX, s - MONO_S) < 9.5 || cleared(x, s)) continue;
    tint.copy(ripe).lerp(pale, rand()).multiplyScalar(.82 + rand() * .3);
    blade(x, s, 1.05 + rand() * .4, .8, 1, s);
  }
  const STRIDE = 11, bladeData = new THREE.InstancedInterleavedBuffer(new Float32Array(blades), STRIDE);
  const card = own(new THREE.PlaneGeometry(1, 1, 1, 4).translate(0, .5, 0)), fieldGeometry = own(new THREE.InstancedBufferGeometry());
  fieldGeometry.index = card.index; fieldGeometry.setAttribute("position", card.attributes.position!); fieldGeometry.setAttribute("uv", card.attributes.uv!);
  fieldGeometry.setAttribute("at", new THREE.InterleavedBufferAttribute(bladeData, 3, 0)); fieldGeometry.setAttribute("shape", new THREE.InterleavedBufferAttribute(bladeData, 4, 3));
  fieldGeometry.setAttribute("tint", new THREE.InterleavedBufferAttribute(bladeData, 3, 7)); fieldGeometry.setAttribute("sown", new THREE.InterleavedBufferAttribute(bladeData, 1, 10));
  fieldGeometry.instanceCount = blades.length / STRIDE;
  const fieldUniforms = {
    time: { value: 0 }, front: { value: -1e4 }, wind: { value: still ? .25 : 1 }, sky: { value: new THREE.Color() }, sun: { value: new THREE.Color() }, fogColor: { value: new THREE.Color() }, fogDensity: { value: .01 },
    fire: { value: new THREE.Vector4(fireX, 0, -FIRE_S, 0) }, shadow: { value: new THREE.Vector4(stoneX, -MONO_S, 4.6, 70) }, backlit: { value: 0 },
  };
  const field = new THREE.Mesh(fieldGeometry, own(new THREE.ShaderMaterial({
    side: THREE.DoubleSide, uniforms: fieldUniforms,
    vertexShader: `attribute vec3 at; attribute vec4 shape; attribute vec3 tint; attribute float sown;
      uniform float time, front, wind; varying vec2 vUv; varying vec3 vTint, vWorld; varying float vHead, vFog;
      void main(){ float grow = sown < 0. ? 1. : smoothstep(0., 1., (front - sown) / 16.);
        vec3 p = position; p.x *= shape.y; p.y *= shape.x * grow; float c = cos(shape.z), s = sin(shape.z); p = vec3(p.x * c, p.y, p.x * s);
        float gust = sin(time * 1.5 + at.x * .31 + at.z * .27 + shape.z) * .6 + sin(time * .6 + at.z * .09 + at.x * .05) * .9;
        p.xz += vec2(1., .35) * gust * .11 * uv.y * uv.y * shape.x * wind;
        vec4 world = vec4(at + p, 1.); vWorld = world.xyz; vUv = uv; vTint = tint; vHead = shape.w;
        vec4 mv = viewMatrix * world; vFog = -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 sky, sun, fogColor; uniform float fogDensity, backlit; uniform vec4 fire, shadow; varying vec2 vUv; varying vec3 vTint, vWorld; varying float vHead, vFog;
      void main(){ float a = 0., ear = 0.;
        for (int i = 0; i < 5; i++) { float k = float(i); float x = .12 + .19 * k + (k - 2.) * .07 * vUv.y * vUv.y; float top = .8 + .05 * mod(k * 3., 5.);
          float d = abs(vUv.x - x), base = top - .1 - .17 * vHead, t = clamp((vUv.y - base) / (top - .1 - base + .001), 0., 1.);
          float stem = step(vUv.y, base + .02) * step(d, .011 * (1.2 - vUv.y * .5));
          float grain = vHead * step(base, vUv.y) * step(vUv.y, top - .1) * step(d, .019 * pow(sin(t * 3.1416), .55) * (.82 + .18 * sin(t * 44.)));
          float beard = (vUv.y - (top - .13)) / .13, awn = vHead * step(0., beard) * step(beard, 1.) * (step(d, .0035) + step(abs(d - beard * .03), .003));
          if (vHead < .5) stem = step(vUv.y, top) * step(d, mix(.03, .013, vHead * 2.) * (1.2 - vUv.y)); // young wheat: leaves, not stalks
          if (stem + grain + awn > 0.) { a = 1.; ear = max(ear, grain * (.7 + .5 * sin(t * 44.)) + awn * .8); } }
        if (a < .5) discard;
        vec3 c = vTint * mix(.42, 1.05, vUv.y) * (1. + ear * .3);
        vec3 lit = c * (sky + sun * (.75 + backlit * vUv.y * .55));
        float inShade = smoothstep(shadow.z + .8, shadow.z - .8, abs(vWorld.x - shadow.x)) * step(shadow.y, vWorld.z) * smoothstep(shadow.y + shadow.w, shadow.y + shadow.w - 14., vWorld.z);
        lit *= 1. - .5 * inShade * backlit;
        float d = distance(vWorld, fire.xyz); lit += c * vec3(1.5, .5, .12) * fire.w / (1. + d * d * .035);
        float f = 1. - exp(-fogDensity * fogDensity * vFog * vFog); gl_FragColor = vec4(mix(lit, fogColor, f), 1.); ${OUT} }`,
  })));
  field.frustumCulled = false; scene.add(field);

  // ---------- things along the way ----------
  const { fireY, showLogs, frame: tendFire, village, basketX, blocks, fields } = buildProps({ scene, own, rand, small, still, out: OUT, floor, fireX, stoneX, wind: fieldUniforms });
  const { tallGrass } = buildVerge({ scene, own, rand, small, floor, blocks }, fieldUniforms);
  const clouds = buildClouds({ scene, own, rand, small, out: OUT }), cloudSun = new THREE.Color(), cloudSky = new THREE.Color();

  // ---------- wild grass and what lies on the ground ----------
  const grass = buildGrass({ scene, own, still, small, floor, blocks, fireX }, tallGrass);
  { const p = land.attributes.position!, soils = land.attributes.soil!; // the soil darkens where grass grows thick and under trees and stones
    for (let i = 0; i < p.count; i++) { const cover = grass.cover(p.getX(i), -p.getZ(i)); soils.setW(i, cover < 0 ? 1 : cover); } }
  buildLitter({ scene, own, rand, small, floor, blocks, fireX });

  // ---------- walking ----------
  const me = { x: roadX(4) - 1.5, s: 4, yaw: .12, pitch: -.02, bob: 0 }, keys = new Set<string>();
  { const jump = /^#s(\d+)$/.exec(location.hash); if (jump) { me.s = Math.min(END_S, Number(jump[1])); me.x = roadX(me.s) - 1; me.yaw = 0; } } // #s300 opens further along the road
  let clock = 0, started = false, begun = false, auto = false, drag: { x: number; y: number } | null = null, holdGo = false, wheelPush = 0, fed = 0, feedGlow = 1, ended = false, pace = 0;
  let sound: Sound | null = null, soundOn = true; try { soundOn = localStorage.getItem("walk-sound") !== "off"; } catch { /* storage may be blocked */ }
  let sownAt: number | null = me.s > FIELD_S ? -100 : null, touched: number | null = null, sayUntil = 0;
  const say = part("say"), use = part<HTMLButtonElement>("use"), cover = part("cover"), startButton = part<HTMLButtonElement>("start"), autoButton = part("auto"), go = part("go"), said = new Set<string>();
  function speak(id: string, text: string, seconds = 7) { if (said.has(id)) return; said.add(id); say.textContent = tx(text); say.classList.add("is-on"); sayUntil = clock + seconds; }
  function nearby(): ["feed" | "sow" | "touch", string] | null {
    if (ended) return null;
    if (fed < 3 && Math.hypot(me.x - fireX, me.s - FIRE_S) < 7.5) return ["feed", "添柴"];
    if (sownAt === null && Math.hypot(me.x - basketX, me.s - SOW_S) < 7) return ["sow", "播种"];
    if (touched === null && me.s > MONO_S - 16) return ["touch", "触碰巨石"];
    return null;
  }
  function sow(byHand: boolean) { if (sownAt !== null) return; sownAt = clock; speak("sown", byHand ? "种子落进土里。田，自己向前铺开。" : "在你之前，已经有人播下了种子。", 8); }
  function act() {
    const what = nearby(); if (!what) return;
    if (what[0] === "feed") { sound?.cue("feed"); fed++; feedGlow = 2.2; showLogs(fed); if (fed === 3) speak("fed", "火光把夜晚推远了一点。一天，变长了。", 8); }
    else if (what[0] === "sow") { sound?.cue("sow"); sow(true); }
    else { sound?.cue("touch"); touched = clock; auto = false; autoButton.setAttribute("aria-pressed", "false"); speak("touch", "石头是凉的。天，暗了下来。", 6); recordEngagement("workshop_finish", PATH); }
  }
  function begin() {
    if (ended) { ended = false; touched = null; fed = 0; sownAt = null; said.clear(); me.x = roadX(4) - 1.5; me.s = 4; me.yaw = .12; me.pitch = 0; fieldUniforms.front.value = -1e4; showLogs(0); }
    started = true; cover.classList.add("is-gone"); canvas.focus(); sound ??= startSound(!soundOn); // audio may only start from a click
    if (!begun) { begun = true; recordEngagement("workshop_start", PATH); }
  }
  showLogs(0);
  use.addEventListener("click", act, listen); startButton.addEventListener("click", begin, listen);
  addEventListener("keydown", e => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase(); if (!started) return;
    if (k === "e") act(); keys.add(k); if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(k)) e.preventDefault();
  }, listen);
  addEventListener("keyup", e => keys.delete(e.key.toLowerCase()), listen); addEventListener("blur", () => keys.clear(), listen);
  canvas.addEventListener("pointerdown", e => { drag = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); }, listen);
  canvas.addEventListener("pointermove", e => { if (!drag) return; me.yaw -= (e.clientX - drag.x) * .0042; me.pitch = clamp(me.pitch - (e.clientY - drag.y) * .003, -.7, .7); drag = { x: e.clientX, y: e.clientY }; }, listen);
  for (const type of ["pointerup", "pointercancel"] as const) { canvas.addEventListener(type, () => { drag = null; }, listen); go.addEventListener(type, () => { holdGo = false; }, listen); }
  canvas.addEventListener("wheel", e => { e.preventDefault(); wheelPush = clamp(wheelPush - e.deltaY * .012, -6, 14); }, { passive: false, signal: stop.signal });
  go.addEventListener("pointerdown", e => { holdGo = true; go.setPointerCapture(e.pointerId); }, listen);
  autoButton.addEventListener("click", () => { auto = !auto; autoButton.setAttribute("aria-pressed", String(auto)); }, listen);
  const soundButton = part("sound"); soundButton.setAttribute("aria-pressed", String(soundOn));
  soundButton.addEventListener("click", () => { soundOn = !soundOn; soundButton.setAttribute("aria-pressed", String(soundOn)); sound?.setMuted(!soundOn); try { localStorage.setItem("walk-sound", soundOn ? "on" : "off"); } catch { /* storage may be blocked */ } }, listen);

  function walk(dt: number) {
    let forward = 0, strafe = 0; const fast = keys.has("shift") ? 2.3 : 1;
    if (keys.has("w") || keys.has("arrowup") || holdGo) forward += 1; if (keys.has("s") || keys.has("arrowdown")) forward -= 1;
    if (keys.has("a")) strafe -= 1; if (keys.has("d")) strafe += 1;
    if (keys.has("arrowleft")) me.yaw += dt * 1.6; if (keys.has("arrowright")) me.yaw -= dt * 1.6;
    forward += wheelPush * .12; wheelPush *= Math.pow(.02, dt);
    if (auto && touched === null) {
      const want = Math.atan2(-(roadX(me.s + 6) - me.x), 6);
      if (!drag) { me.yaw += Math.atan2(Math.sin(want - me.yaw), Math.cos(want - me.yaw)) * Math.min(1, dt * 1.4); me.pitch -= me.pitch * Math.min(1, dt); }
      if (!forward && me.s < END_S - 1) forward = .85;
    }
    const speed = 7.2 * fast, sin = Math.sin(me.yaw), cos = Math.cos(me.yaw);
    me.x += (-sin * forward + cos * strafe) * speed * dt; me.s += (cos * forward + sin * strafe) * speed * dt;
    me.s = clamp(me.s, -12, END_S); me.x = clamp(me.x, roadX(me.s) - 48, roadX(me.s) + 48);
    for (const [x, s, r] of blocks) { const gap = Math.hypot(me.x - x, me.s - s), room = r + .35; if (gap < room && gap > 0) { me.x = x + (me.x - x) / gap * room; me.s = s + (me.s - s) / gap * room; } }
    if (forward || strafe) me.bob += dt * speed * 1.25;
    pace = Math.min(1, Math.hypot(forward, strafe)) * fast;
  }

  // ---------- frame ----------
  const yearFigure = part("year"), yearUnit = part("unit"), yearLabel = part("year-label"), chapter = part("chapter"), dot = part("dot"), useLabel = part("use-label");
  let shown = "", last = performance.now(), slow = 0, raf = 0;
  let pixel = .001; // the height of one pixel one metre from the eye
  function resize() {
    const w = Math.max(1, root.clientWidth), h = Math.max(1, root.clientHeight);
    renderer.setPixelRatio(ratio); renderer.setSize(w, h, false); composer.setPixelRatio(ratio); composer.setSize(w, h);
    camera.aspect = w / h; camera.fov = w < h ? 74 : 62; camera.updateProjectionMatrix();
    pixel = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) / (h * ratio);
  }
  const observer = new ResizeObserver(resize); observer.observe(root);
  function frame(now: number) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(.05, (now - last) / 1000); last = now; clock += dt;
    if (dt > .03 && ratio > 1) { if (++slow > 50) { ratio = Math.max(1, ratio - .25); slow = 0; resize(); } } else slow = Math.max(0, slow - 1);
    if (started) { walk(dt); for (const [at, text] of LINES) if (me.s >= at && me.s < at + 40) speak(`line-${at}`, text); }
    else if (!ended) me.yaw = .12 + (still ? 0 : Math.sin(clock * .12) * .05);
    if (sownAt === null && me.s > FIELD_S + 6) sow(false);
    if (sownAt !== null) fieldUniforms.front.value = SOW_S + (clock - sownAt) * 34;
    if (clock > sayUntil) say.classList.remove("is-on");

    setHour(me.s);
    const dusk = touched === null ? 0 : smooth(0, 5, clock - touched); // touching the stone turns the afternoon into the night it came from
    sound?.frame({ s: me.s, pace: started ? pace : 0, fed, fireGap: Math.hypot(me.x - fireX, me.s - FIRE_S), night: hour.stars, dusk }, dt);
    hour.top.lerp(nightSky, dusk * .94); hour.horizon.lerp(nightHorizon, dusk * .8); hour.fog.lerp(nightHorizon, dusk * .75);
    const height = hour.height, turn = mix(-.42, 0, smooth(250, 600, me.s));
    sunDir.set(Math.sin(turn) * Math.cos(height), Math.sin(height), -Math.cos(turn) * Math.cos(height)).normalize();
    skyUniforms.top.value.copy(hour.top); skyUniforms.horizon.value.copy(hour.horizon); skyUniforms.sun.value.copy(hour.sun).multiplyScalar(1 - dusk * .35); skyUniforms.stars.value = Math.max(hour.stars, dusk); skyUniforms.time.value = clock; skyUniforms.day.value = smooth(330, 410, me.s) * (1 - dusk);
    fog.color.copy(hour.fog); fog.density = hour.density;
    const power = hour.power * (1 - dusk * .7), skyPower = hour.sky * (1 - dusk * .6);
    skyLight.color.copy(hour.top).lerp(hour.horizon, .6); skyLight.intensity = skyPower * 1.6 * (1 + hour.stars * 4); // the night is drawn blue, not black
    sunLight.color.copy(hour.sun); sunLight.intensity = power * (height > .03 ? 3.2 : 2.6);
    sunLight.target.position.set(me.x - Math.sin(me.yaw) * 22, ground(me.x, -me.s), -me.s - Math.cos(me.yaw) * 22);
    sunLight.position.copy(sunLight.target.position).addScaledVector(height > .03 ? sunDir : moon, 160); // by night the light is the moon's, from behind
    const [seenTop, seenHorizon, seenSun, seenDir] = skySeen, skySun = skyUniforms.sun.value;
    const moved = Math.abs(seenTop.r - hour.top.r) + Math.abs(seenTop.g - hour.top.g) + Math.abs(seenTop.b - hour.top.b) + Math.abs(seenHorizon.r - hour.horizon.r) + Math.abs(seenHorizon.g - hour.horizon.g) + Math.abs(seenHorizon.b - hour.horizon.b)
      + Math.abs(seenSun.r - skySun.r) + Math.abs(seenSun.g - skySun.g) + Math.abs(seenSun.b - skySun.b) + seenDir.distanceTo(sunDir);
    if (pmrem && clock - skyAt > .5 && moved > .015) { // at most twice a second, and only once the sky has visibly changed
      skyAt = clock; seenTop.copy(hour.top); seenHorizon.copy(hour.horizon); seenSun.copy(skySun); seenDir.copy(sunDir);
      below.color.copy(hour.sun).multiplyScalar(power * Math.max(0, Math.sin(height))).add(lowLight.copy(skyLight.color).multiplyScalar(skyPower * .5)).multiply(soilTone);
      const old = skyTarget; skyTarget = pmrem.fromScene(skyScene, 0, 1, 1500, { size: 128 }); scene.environment = skyTarget.texture; old?.dispose();
    }
    scene.environmentIntensity = mix(.4, 1.3, Math.max(hour.stars, dusk)); // by day a touch beside the sun and sky lights; by night it carries the blue
    fieldUniforms.time.value = clock; fieldUniforms.sky.value.copy(skyLight.color).multiplyScalar(skyPower * 1.3); fieldUniforms.sun.value.copy(hour.sun).multiplyScalar(power * .75);
    fieldUniforms.fogColor.value.copy(hour.fog); fieldUniforms.fogDensity.value = hour.density; fieldUniforms.backlit.value = smooth(430, 600, me.s) * (1 - dusk * .5);

    feedGlow += (1 - feedGlow) * Math.min(1, dt * 1.5);
    const fire = tendFire(clock, dt, fed, feedGlow);
    fieldUniforms.fire.value.set(fireX, fireY + .8, -FIRE_S, fire.glow * .5); village.villageLight.intensity = 14 * fire.flicker; village.frame(clock);
    fields.frame(clock, dt, me.s); fields.water.color.copy(hour.top).lerp(hour.horizon, .18).multiplyScalar(.55 + power * .35); fields.waterSun.copy(sunDir); // open water shows the sky overhead, darker than the sky at the horizon

    camera.position.set(me.x, ground(me.x, -me.s) + 1.66 + (still ? 0 : Math.sin(me.bob) * .035), -me.s);
    camera.rotation.set(me.pitch + dusk * .32 * (1 - Math.abs(me.pitch)), me.yaw, 0, "YXZ"); sky.position.copy(camera.position);
    grass.frame(clock, camera.position, hour.density, pixel);
    clouds.frame(camera.position, still ? 0 : clock, me.s, sunDir, cloudSun.copy(hour.sun).multiplyScalar(power), cloudSky.copy(skyLight.color).multiplyScalar(skyPower), dusk);
    const [figure, unit] = yearReading(me.s, locale), about = yearsAgo(me.s) > 126, reading = `${figure}|${unit}|${chapterAt(me.s)}`;
    if (reading !== shown) { shown = reading; yearFigure.textContent = figure; yearUnit.textContent = unit; yearLabel.textContent = tx(about ? "此刻走到 · 约" : "此刻走到"); chapter.textContent = tx(chapterAt(me.s)); }
    dot.style.top = `${clamp(me.s / MONO_S, 0, 1) * 100}%`;
    const what = started ? nearby() : null; use.hidden = !what; if (what) useLabel.textContent = tx(what[1]);
    if (touched !== null && !ended && clock - touched > 9) {
      ended = true; started = false; part("cover-title").textContent = tx("这一段到此为止"); part("cover-text").textContent = tx("下一段从这块石头出发，走向推测的未来。火、田和碑会留在身后，回头还看得见。");
      part("cover-keys").hidden = true; startButton.textContent = tx("再走一遍"); cover.classList.remove("is-gone"); startButton.focus();
    }
    composer.render();
  }
  resize();
  part("cover-keys").textContent = tx(small ? "拖动环视 · 按住下方按钮前行 · 或开自动前行" : "W A S D 行走 · 拖动环视 · Shift 加快 · E 互动");
  startButton.textContent = tx("开始行走"); startButton.disabled = false; root.classList.add("is-live");
  raf = requestAnimationFrame(frame);

  return () => {
    cancelAnimationFrame(raf); stop.abort(); observer.disconnect(); sound?.close();
    release();
  };
}
