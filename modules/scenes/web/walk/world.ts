import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { GTAOPass } from "three/examples/jsm/postprocessing/GTAOPass.js";
import { shareOrCopy } from "@aihot/web/features/item/share";
import { recordEngagement } from "@aihot/web/lib/engagement";
import { localePath } from "@aihot/web/lib/locale";
import { reducedMotion } from "@aihot/web/lib/motion";
import { buildClouds } from "./clouds.ts";
import { skyFragment, skyVertex } from "./sky.ts";
import { loadOrbit, orbitUniforms } from "./orbit.ts";
import { buildGrass } from "./grass.ts";
import { buildWheat } from "./wheat.ts";
import { buildLitter, soil } from "./groundcover.ts";
import { loadRelief } from "./relief.ts";
import { buildEnvironment } from "./environment.ts";
import { buildProps } from "./props.ts";
import { startSound, type Sound } from "./sound.ts";
import { buildVerge } from "./verge.ts";
import { CANAL, CLEARINGS, END_S, FIELD_S, FIRE_S, LAND, LINES, MILESTONES, MONOLITH, MONO_S, REACH_S, ROADSIDE, SOW_S, START_S, bridgeLift, chapterAt, clamp, cropCover, fbm, ground, keepDry, mix, roadsideStops, roadX, sequence, sheet, smooth, yearReading, yearsAgo } from "./land.ts";

// The hour at points along the road: [s, zenith, horizon, fog, sun colour, sun strength, sky light, stars, sun height, fog density].
const HOURS = ([
  [0, "#0b1628", "#293b52", "#0f1d2e", "#9db8ec", .64, .5, 1, -.25, .0076],
  [170, "#0a172b", "#343c54", "#172438", "#a6c0f4", .6, .55, 1, -.16, .0076],
  [255, "#18274d", "#c46248", "#48323e", "#ff9960", .62, .62, .3, .02, .0083],
  [340, "#2d4d70", "#e3b182", "#8797a2", "#ffd59e", .82, .56, 0, .2, .0053],
  [450, "#325478", "#afc1cb", "#92a7b3", "#ffe7c2", .86, .58, 0, .46, .0038],
  [560, "#1f3954", "#d6b27f", "#768997", "#ffcf94", .86, .5, 0, .335, .004],
  [650, "#122740", "#e69a5c", "#6c7884", "#ffb872", .96, .48, 0, .25, .0038],
] as const).map(([s, top, horizon, fog, sun, power, sky, stars, height, density]) => ({ s, top: new THREE.Color(top), horizon: new THREE.Color(horizon), fog: new THREE.Color(fog), sun: new THREE.Color(sun), power, sky, stars, height, density }));
const OUT = "\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n"; // an #include has to start its own line

export type WalkStage = "terrain" | "fields" | "landmarks" | "light";

interface WalkOptions {
  tx: (text: string) => string;
  locale: "zh" | "en";
  signal: AbortSignal;
  audioContext?: AudioContext;
  onContextLost?: () => void;
  onProgress?: (stage: WalkStage) => void;
}

export async function start(root: HTMLElement, options: WalkOptions): Promise<() => void> {
  const stop = new AbortController(), dispose = () => stop.abort();
  if (options.signal.aborted) return dispose;
  options.signal.addEventListener("abort", dispose, { once: true, signal: stop.signal });
  try {
    await build(root, options, stop.signal);
    return dispose;
  } catch (error) {
    dispose();
    throw error;
  }
}

async function build(root: HTMLElement, { tx, locale, audioContext, onContextLost, onProgress }: WalkOptions, signal: AbortSignal) {
  const part = <T extends HTMLElement = HTMLElement>(name: string) => root.querySelector<T>(`[data-walk="${name}"]`)!;
  const small = matchMedia("(max-width: 640px), (pointer: coarse)").matches, still = reducedMotion();
  const query = new URLSearchParams(location.search), useAO = !small && query.get("ao") === "1", useSky = !small && query.get("env") !== "0"; // ?ao=1 enables screen-space AO; ?env=0 turns off sky IBL
  const listen = { signal }, rand = sequence(7);
  const pause = (stage?: WalkStage) => {
    if (stage) onProgress?.(stage);
    if (signal.aborted) return Promise.resolve();
    // Let the browser actually paint the updated loading stage before constructing its geometry.
    return new Promise<void>(resolve => {
      const frame = requestAnimationFrame(() => {
        signal.removeEventListener("abort", cancel);
        setTimeout(resolve, 0);
      });
      function cancel() { cancelAnimationFrame(frame); resolve(); }
      signal.addEventListener("abort", cancel, { once: true });
    });
  };
  await pause("terrain"); if (signal.aborted) return;
  const owned: Array<{ dispose(): void }> = [];
  const own = <T extends { dispose(): void }>(item: T) => { owned.push(item); return item; };

  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
  const canvas = renderer.domElement;
  signal.addEventListener("abort", () => {
    for (const item of owned) item.dispose();
    renderer.dispose(); renderer.forceContextLoss(); canvas.remove();
  }, { once: true });
  const anisotropy = renderer.capabilities.getMaxAnisotropy();
  const trackScan = loadRelief("track", anisotropy, signal, own);
  const stoneScan = loadRelief("stone", anisotropy, signal, own);
  // Transfer the critical artwork while geometry is built. Capturing failure now
  // avoids an unhandled rejection before the first-frame readiness check below.
  const orbitReady = loadOrbit(signal, own).then(texture => ({ texture }), (error: unknown) => ({ error }));
  const scans = {
    stone: stoneScan, oak: loadRelief("oak", anisotropy, signal, own, orbitReady),
    plaster: loadRelief("plaster", anisotropy, signal, own, orbitReady),
  };
  canvas.addEventListener("webglcontextlost", () => { if (!signal.aborted) onContextLost?.(); }, listen);
  canvas.inert = true; canvas.tabIndex = 0; canvas.setAttribute("aria-label", tx("可行走的三维世界：从火堆穿过麦田走到巨石")); part("viewport").append(canvas);
  let ratio = Math.min(devicePixelRatio || 1, small ? 1.15 : 1.5);
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(62, 1, .1, 1600), fog = new THREE.FogExp2(0x0b0d12, .012);
  scene.fog = fog;
  const composer = own(new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: small ? 0 : 2 })));
  composer.addPass(new RenderPass(scene, camera));
  const aoSkip: THREE.Object3D[] = [];
  if (useAO) { // contact shadows at half resolution, over the opaque lit scenery only
    const ao = own(new GTAOPass(scene, camera)), render = ao.render.bind(ao), size = ao.setSize.bind(ao), hidden: THREE.Object3D[] = [];
    ao.updateGtaoMaterial({ radius: .6, distanceFallOff: 1, thickness: 1, samples: 12 }); ao.updatePdMaterial({ samples: 8, radius: 6 }); ao.blendIntensity = .85;
    ao.setSize = (w, h) => size(Math.ceil(w / 2), Math.ceil(h / 2));
    ao.render = (...args) => { // its depth and normals come from drawing the scene again with one plain material, skipping cached sprites, transparents and custom shaders
      for (let i = 0; i < aoSkip.length; i++) { const o = aoSkip[i]!; if (o.visible) { o.visible = false; hidden.push(o); } }
      renderer.shadowMap.autoUpdate = false; render(...args); renderer.shadowMap.autoUpdate = true; // the shadow maps were drawn for this frame already
      for (let i = 0; i < hidden.length; i++) hidden[i]!.visible = true; hidden.length = 0;
    };
    composer.addPass(ao);
  }
  composer.addPass(own(new UnrealBloomPass(new THREE.Vector2(1, 1), .26, .68, .92)));
  const output = own(new OutputPass()), gradeTime = { value: 0 };
  Object.assign(output.uniforms, { gradeTime, grain: { value: still ? 0 : .014 } });
  // Grade the display-space colour after tone mapping in the same fullscreen pass.
  output.material.fragmentShader = output.material.fragmentShader.replace("void main()", `
    uniform float gradeTime, grain;
    float gradeHash(vec2 p) { vec3 q = fract(vec3(p.xyx) * .1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
    void main()`).replace(/}\s*$/, `
      vec2 centered = vUv - .5;
      float vig = 1. - smoothstep(.34, .92, dot(centered, centered) * 2.15) * .16;
      vec3 col = gl_FragColor.rgb * vig;
      float luma = dot(col, vec3(.299, .587, .114));
      col += mix(vec3(-.006, -.002, .009) * smoothstep(.015, .18, luma), vec3(.007, .003, -.004), smoothstep(.22, .78, luma));
      float g = (gradeHash(vUv * 980. + fract(gradeTime * 17.3) * 113.) - .5) * grain;
      gl_FragColor.rgb = clamp(col + g, 0., 1.);
    }`);
  composer.addPass(output);
  if (!small) { renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap; }

  // ---------- the land ----------
  // One sheet of ground for the whole walk, coloured point by point: dry earth, the worn road, the trodden camp, then tilled soil from the first sowing on.
  const across = small ? 110 : 170, along = small ? 300 : 440, fireX = roadX(FIRE_S) + 2.6, stoneX = roadX(MONO_S);
  const land = own(new THREE.PlaneGeometry(LAND.width, LAND.depth, across, along).rotateX(-Math.PI / 2).translate(0, 0, LAND.behind - LAND.depth / 2));
  {
    // Parse the palette once. Each point on the sheet blends the same pigments.
    const palette = {
      dry: new THREE.Color("#6b5a45"), dust: new THREE.Color("#94805f"), green: new THREE.Color("#7a7f4a"),
      road: new THREE.Color("#a08a6a"), camp: new THREE.Color("#8f7658"), tilled: new THREE.Color("#5c4630"),
      ripe: new THREE.Color("#a88a4c"), yard: new THREE.Color("#a99272"), path: new THREE.Color("#bca783"),
      stubble: new THREE.Color("#c4ab6c"), calendar: new THREE.Color("#b49d7b"), damp: new THREE.Color("#3f3224"),
    };
    const p = land.attributes.position!, colors = new Float32Array(p.count * 3), soils = new Float32Array(p.count * 4), c = new THREE.Color(), b = new THREE.Color();
    const inside = (x: number, s: number, [cs, off, r]: readonly [number, number, number]) => Math.hypot(x - roadX(cs) - off, s - cs) / r; // 1 on a clearing's edge
    const toSegment = (x: number, s: number, ax: number, as: number, bx: number, bs: number) => { const dx = bx - ax, ds = bs - as, t = clamp(((x - ax) * dx + (s - as) * ds) / (dx * dx + ds * ds), 0, 1); return Math.hypot(x - ax - dx * t, s - as - ds * t); };
    const paths = [[1.5, 327, 16.5, 334], [16.5, 334, 11.5, 322.6], [16.5, 334, 17.6, 330.6], [16.5, 334, 10.9, 340.7], [16.5, 334, 21.9, 344.2], [16.5, 334, 10.6, 333.6]] as const; // in the village, from the road and from the fire to each door: [offset, s] to [offset, s]
    const workyards = roadsideStops.filter(([s]) => s > FIELD_S);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i), s = -z, d = Math.abs(x - roadX(s)), n = fbm(x * .09, z * .09);
      p.setY(i, ground(x, z));
      c.copy(palette.dry).lerp(palette.dust, n).lerp(palette.green, smooth(170, 250, s) * smooth(.35, .7, n) * .5); // dry earth, greener toward the first field
      const lowland = smooth(330, 345, s) * (1 - smooth(359, 372, s));
      c.lerp(b.set("#ae8965").multiplyScalar(.82 + n * .32), lowland);
      const upland = smooth(402, 420, s) * (1 - smooth(611, 624, s));
      c.lerp(b.set("#697467").multiplyScalar(.65 + n * .6), upland);
      const road = 1 - smooth(.8, 3.4, d), camp = 1 - smooth(4, 13, Math.hypot(x - fireX - 2.5, s - FIRE_S - 1));
      c.lerp(palette.road, road * .55).lerp(palette.camp, camp); // the road and the camp are packed pale by feet
      const tilled = cropCover(x - roadX(s), s) * (1 - (1 - smooth(1.2, 2.6, d)) * (s < 470 ? .55 : 0));
      c.lerp(b.copy(palette.tilled).lerp(palette.ripe, smooth(310, 400, s)).multiplyScalar(.9 + n * .25), tilled); // the furrows are drawn by the ground shader
      const off = x - roadX(s); let path = 0; // the village yard is trodden pale, with paths worn paler still
      if (s > 310 && s < 356) for (const [ax, as, bx, bs] of paths) path = Math.max(path, 1 - smooth(.5, 1.5, toSegment(off, s, ax, as, bx, bs)));
      // Feet wear a short approach from the road to each workbench.
      for (const [at, side, r] of workyards) if (Math.abs(at - s) < r + 2) {
        const worn = toSegment(off, s, side * .2, at - 2, side, at);
        path = Math.max(path, 1 - smooth(r * .45, r, worn));
      }
      const yard = smooth(314, 319, s) * (1 - smooth(349, 354, s)) * smooth(6.5, 9.5, off) * (1 - smooth(28, 31, off)), calendar = 1 - smooth(.85, 1.1, inside(x, s, CLEARINGS.calendar));
      c.lerp(b.copy(palette.yard).multiplyScalar(.92 + n * .16), yard).lerp(palette.path, path * .85);
      c.lerp(b.copy(palette.stubble).multiplyScalar(.9 + n * .2), 1 - smooth(.85, 1.1, inside(x, s, CLEARINGS.reaped))).lerp(palette.calendar, calendar); // stubble where it is reaped, packed earth at the calendar
      const canal = s > CANAL.from && s < CANAL.to ? Math.abs(off - CANAL.offset) : 99, channel = Math.min(...CANAL.channels.map(([a, z, end]) => toSegment(off, s, CANAL.offset, a, end, z)));
      const damp = Math.max(1 - smooth(1.2, 2.6, canal), 1 - smooth(.6, 1.8, channel), 1 - smooth(.9, 1.4, inside(x, s, CLEARINGS.pond)));
      c.lerp(palette.damp, damp * .8); // damp earth by the water
      colors.set([c.r, c.g, c.b], i * 3); soils.set([Math.max(road * (1 - tilled), camp, yard * .8, path, calendar), damp, tilled, 0], i * 4); // what the ground shader makes of it: packed, damp, tilled; the grass cover is added once the grass is placed
    }
    land.setAttribute("color", new THREE.BufferAttribute(colors, 3)); land.setAttribute("soil", new THREE.BufferAttribute(soils, 4)); land.computeVertexNormals();
  }
  const positions = land.attributes.position!, floor = sheet(across, along, index => positions.getY(index));
  const earth = new THREE.Mesh(land, own(soil(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .95, metalness: 0 }), trackScan, small, new THREE.Vector2(fireX, -FIRE_S)))); earth.receiveShadow = true; scene.add(earth); // smooth-shaded: the drawn height is unchanged, `floor` still holds
  await pause(); if (signal.aborted) return;

  // ---------- sky, sun and the hour ----------
  const hour = { top: new THREE.Color(), horizon: new THREE.Color(), fog: new THREE.Color(), sun: new THREE.Color(), power: 0, sky: 0, stars: 0, height: 0, density: 0 };
  function setHour(s: number) {
    let i = 0; while (i < HOURS.length - 2 && s > HOURS[i + 1]!.s) i++;
    const a = HOURS[i]!, b = HOURS[i + 1]!, t = smooth(a.s, b.s, s);
    for (const key of ["top", "horizon", "fog", "sun"] as const) hour[key].copy(a[key]).lerp(b[key], t);
    for (const key of ["power", "sky", "stars", "height", "density"] as const) hour[key] = mix(a[key], b[key], t);
  }
  const sunDir = new THREE.Vector3(), moon = new THREE.Vector3(-Math.sin(.5) * Math.cos(.3), Math.sin(.3), -Math.cos(.5) * Math.cos(.3)), nightSky = new THREE.Color("#030616"), nightHorizon = new THREE.Color("#251f3c"), fieldAfterglow = new THREE.Color("#566a85");
  const orbit = orbitUniforms(renderer.toneMappingExposure);
  const skyUniforms = { ...orbit, top: { value: new THREE.Color() }, horizon: { value: new THREE.Color() }, haze: { value: hour.fog }, sun: { value: new THREE.Color() }, sunDir: { value: sunDir }, stars: { value: 1 }, time: { value: 0 }, day: { value: 0 } };
  const sky = new THREE.Mesh(own(new THREE.SphereGeometry(1200, 32, 20)), own(new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, uniforms: skyUniforms,
    vertexShader: skyVertex,
    fragmentShader: skyFragment(OUT),
  })));
  scene.add(sky);
  const skyLight = new THREE.HemisphereLight(0xffffff, 0x3a3026, .3), sunLight = new THREE.DirectionalLight(0xffffff, .2);
  const nightSoil = skyLight.groundColor.clone(), sunlitStraw = new THREE.Color("#cbb18b"), flagstone = new THREE.Color("#b3aaa0");
  scene.add(skyLight, sunLight, sunLight.target);
  if (!small) { // one shadow map that follows the walker
    own(sunLight.shadow);
    sunLight.castShadow = true; sunLight.shadow.mapSize.set(2048, 2048); sunLight.shadow.bias = -.0005; sunLight.shadow.normalBias = .023; sunLight.shadow.radius = 2;
    Object.assign(sunLight.shadow.camera, { left: -46, right: 46, top: 46, bottom: -46, near: 1, far: 330 }); sunLight.shadow.camera.updateProjectionMatrix();
  }
  const camDir = new THREE.Vector3();
  function sunBearing(at: number, elevation: number, direction: THREE.Vector3) {
    const turn = mix(-.42, .125, smooth(250, 574, at));
    return direction.set(Math.sin(turn) * Math.cos(elevation), Math.sin(elevation), -Math.cos(turn) * Math.cos(elevation));
  }

  await pause("fields"); if (signal.aborted) return;
  // Shared light and sowing uniforms also drive the roadside plants and props.
  const { uniforms: fieldUniforms, fieldChunks, frame: updateWheat } = buildWheat({ scene, own, rand, floor, small, still, fireX, fireS: FIRE_S, stoneX, sunDirection: sunDir, output: OUT });
  await pause("landmarks"); if (signal.aborted) return;

  // ---------- things along the way ----------
  const { fireY, showLogs, frame: tendFire, village, basketX, sowLight, blocks, fields, propsFrame } = buildProps({ scene, own, rand, small, still, out: OUT, floor, fireX, stoneX, scans, wind: fieldUniforms });
  await pause(); if (signal.aborted) return;
  const { tallGrass } = buildVerge({ scene, own, rand, small, floor, blocks }, fieldUniforms, trackScan);
  const clouds = buildClouds({ scene, own, rand, small, out: OUT }), cloudSun = new THREE.Color(), cloudSky = new THREE.Color();

  // ---------- wild grass and what lies on the ground ----------
  await pause(); if (signal.aborted) return;
  const grass = buildGrass({ scene, own, still, small, floor, blocks, fireX }, tallGrass);
  { const p = land.attributes.position!, soils = land.attributes.soil!; // the soil darkens where grass grows thick and under trees and stones
    for (let i = 0; i < p.count; i++) { const cover = grass.cover(p.getX(i), -p.getZ(i)); soils.setW(i, cover < 0 ? 1 : cover); }
    soils.needsUpdate = true; }
  buildLitter({ scene, own, rand, small, floor, blocks, fireX });
  await pause("light"); if (signal.aborted) return;
  const loadedOrbit = await orbitReady;
  if (signal.aborted) return;
  if ("error" in loadedOrbit) throw loadedOrbit.error;
  orbit.orbitMap.value = loadedOrbit.texture;
  orbit.orbitTangent.value.y = orbit.orbitTangent.value.x * loadedOrbit.texture.image.height / loadedOrbit.texture.image.width;

  const environment = useSky ? await buildEnvironment({
    renderer, signal, pause,
    anchors: [
      ...[HOURS[0], HOURS[2], HOURS[3], HOURS[4], HOURS[6]].map(anchor => ({
        ...anchor, sunDir: sunBearing(anchor.s, anchor.height, new THREE.Vector3()),
      })),
      {
        ...HOURS[6], ending: true,
        top: HOURS[6].top.clone().lerp(nightSky, .35), horizon: HOURS[6].horizon.clone().lerp(nightHorizon, .12),
        sun: HOURS[6].sun.clone().multiplyScalar(.8), sunDir: sunBearing(MONO_S, .018, new THREE.Vector3()),
        power: HOURS[6].power * .65, sky: HOURS[6].sky * .7, stars: .18,
      },
    ],
  }) : undefined;
  if (signal.aborted) return;
  if (environment) scene.environment = own(environment).texture;

  // Chapter-morphing atmospheric motes: embers at the camp, sunlit chaff in the fields, rising dusk sparks near the monolith.
  const MOTE_COUNT = small ? 110 : 220;
  const motePos = new Float32Array(MOTE_COUNT * 3), moteSeed = new Float32Array(MOTE_COUNT * 3);
  for (let i = 0; i < MOTE_COUNT; i++) {
    motePos[i * 3] = (rand() - .5) * 28; motePos[i * 3 + 1] = rand() * 11; motePos[i * 3 + 2] = (rand() - .5) * 28;
    moteSeed[i * 3] = rand(); moteSeed[i * 3 + 1] = rand(); moteSeed[i * 3 + 2] = rand();
  }
  const moteGeo = own(new THREE.BufferGeometry());
  moteGeo.setAttribute("position", new THREE.BufferAttribute(motePos, 3));
  moteGeo.setAttribute("aSeed", new THREE.BufferAttribute(moteSeed, 3));
  const moteUniforms = { uTime: { value: 0 }, uCenter: { value: new THREE.Vector3() }, uS: { value: 0 }, uDusk: { value: 0 }, uScale: { value: 1 } };
  const motes = new THREE.Points(moteGeo, own(new THREE.ShaderMaterial({
    uniforms: moteUniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute vec3 aSeed; uniform float uTime, uS, uDusk, uScale; uniform vec3 uCenter; varying float vAlpha; varying vec3 vTint;
      void main(){
        float liftSpeed = mix(.42, .68, smoothstep(520., 610., uS)) * (.45 + aSeed.x * .9);
        float driftX = sin(uTime * (.35 + aSeed.y * .4) + aSeed.z * 6.283) * 1.4;
        vec3 span = vec3(28., 11., 28.);
        vec3 rel = mod(position + vec3(driftX + uTime * .35 * smoothstep(230., 360., uS), uTime * liftSpeed, sin(uTime * .25 + aSeed.x * 6.283)) - uCenter, span) - span * .5;
        vec3 world = uCenter + rel;
        world.y = max(world.y, uCenter.y - 1.3);
        vec4 mv = viewMatrix * vec4(world, 1.);
        float night = 1. - smoothstep(200., 290., uS), dusk = smoothstep(535., 605., uS);
        vTint = mix(vec3(.92, .80, .48), vec3(1.0, .58, .22), max(night, dusk * .85));
        vTint = mix(vTint, vec3(1.0, .74, .34), dusk * (1. - night * .5));
        float distFade = (1. - smoothstep(9., 14.5, length(rel))) * smoothstep(1.2, 2.8, length(rel));
        vAlpha = distFade * mix(.28, .66, max(night, dusk + uDusk * .3)) * (.55 + .45 * sin(uTime * (1.4 + aSeed.y * 2.) + aSeed.z * 12.));
        gl_PointSize = clamp((3.2 + aSeed.y * 2.4) * uScale * (9. / max(1., -mv.z)), 1.5, 7.);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `varying float vAlpha; varying vec3 vTint;
      void main(){
        vec2 c = gl_PointCoord - .5;
        float r = smoothstep(.5, .04, length(c));
        if (r < .01 || vAlpha < .01) discard;
        gl_FragColor = vec4(vTint * (1.1 + r * .6), r * vAlpha);
      }`,
  })));
  motes.frustumCulled = false; scene.add(motes); aoSkip.push(motes);

  // A carried ember that lights the road ahead through the night country, and a handful of golden seed scattered when sowing by hand.
  // A single local light serves the carried ember, window bounce and the fluorescent fitting.
  // Daylight enters from the opening. Its source stays fixed as the observer moves past.
  const localLight = new THREE.PointLight(0xff8e42, 0, 12, 2); scene.add(localLight);
  const rooms = [
    { stop: ROADSIDE.press, dx: -2.25, ds: -1.1, height: 2.65, tint: 0xffdcad, power: 13 },
    { stop: ROADSIDE.loom, dx: -1.8, ds: 1.2, height: 3.65, tint: 0xe1ebf6, power: 14 },
    { stop: ROADSIDE.terminal, dx: -.12, ds: .30, height: 2.56, tint: 0xf2faee, power: 12 },
  ].map(({ stop: [s, offset], dx, ds, height, tint, power }) => {
    const x = roadX(s) + offset;
    return { s, tint, power, position: new THREE.Vector3(x + dx, floor(x, -s) + height, -s - ds) };
  });
  const SEEDS = 48, seedAt = new Float32Array(SEEDS * 3), seedVel = new Float32Array(SEEDS * 3), seedGeometry = own(new THREE.BufferGeometry());
  seedGeometry.setAttribute("position", new THREE.BufferAttribute(seedAt, 3));
  const seedMaterial = own(new THREE.PointsMaterial({ color: "#e8c060", size: .038, transparent: true, opacity: 0, depthWrite: false }));
  const seedBurst = new THREE.Points(seedGeometry, seedMaterial); seedBurst.visible = false; seedBurst.frustumCulled = false; scene.add(seedBurst);
  let seedT = -1;

  if (useAO) scene.traverse((o) => {
    const mesh = o as THREE.Mesh, m = mesh.material as THREE.Material | undefined;
    if ((o as THREE.Sprite).isSprite || (o as THREE.Points).isPoints || (mesh.isMesh && (!m || Array.isArray(m) || m.transparent || m.alphaTest > 0 || (m as THREE.ShaderMaterial).isShaderMaterial || ((mesh.geometry as THREE.InstancedBufferGeometry).isInstancedBufferGeometry && !(o as THREE.InstancedMesh).isInstancedMesh)))) aoSkip.push(o);
  });

  // ---------- walking ----------
  // Frame the lit limb above the shelter. In portrait the hearth sits left of it.
  const entryS = small ? START_S + 8 : START_S;
  const entryX = roadX(entryS) - 1.5;
  const fireBearing = Math.atan2(entryX - fireX, FIRE_S - entryS);
  const entrance = { x: entryX, s: entryS, yaw: fireBearing - (matchMedia("(orientation: portrait)").matches ? .18 : 0), pitch: .055, bob: 0 };
  const me = { ...entrance }, keys = new Set<string>();
  const jump = /^#s(\d+)$/.exec(location.hash), jumped = Boolean(jump);
  if (jump) {
    me.s = Math.min(END_S, Number(jump[1]));
    me.x = roadX(me.s) - 1;
    const gap = MONO_S - me.s, arrival = MONO_S - REACH_S - .5;
    // Deep links inside the clearing open on the arc where the stone fits in view.
    if (gap < arrival) me.x = Math.min(me.x, stoneX - Math.sqrt(arrival * arrival - gap * gap));
    const reveal = smooth(610, REACH_S, me.s);
    me.yaw = reveal * Math.atan2(me.x - stoneX, gap);
    me.pitch = reveal * arrivalPitch(Math.hypot(me.x - stoneX, gap));
  } // #s300 opens further along the road without counting in analytics
  let clock = 0, started = false, begun = false, auto = false, drag: { pointer: number; x: number; y: number } | null = null, holdGo = false, wheelPush = 0, fed = 0, feedGlow = 1, ended = false, pace = 0, velForward = 0, velStrafe = 0;
  let sound: Sound | null = null, soundOn = true; try { soundOn = localStorage.getItem("walk-sound") !== "off"; } catch { /* storage may be blocked */ }
  let sownAt: number | null = me.s > FIELD_S ? -100 : null, touched: number | null = null, sayUntil = 0;
  const say = part("say"), use = part<HTMLButtonElement>("use"), cover = part("cover"), hud = part("hud"), startButton = part<HTMLButtonElement>("start"), autoButton = part("auto"), go = part("go"), said = new Set<string>();
  const viewport = part("viewport");
  const exitLink = part<HTMLAnchorElement>("exit"), shareButton = part<HTMLButtonElement>("share"), manifestoLink = root.querySelector<HTMLAnchorElement>('[data-walk="manifesto"]');
  const backLink = root.querySelector<HTMLAnchorElement>(".walk-back")!, chronicleBase = localePath("/chronicle", locale);
  function speak(id: string, text: string, seconds = 7) { if (said.has(id)) return; said.add(id); say.textContent = tx(text); say.classList.add("is-on"); sayUntil = clock + seconds; }
  function nearby(): ["feed" | "sow" | "touch", string] | null {
    if (ended) return null;
    if (fed < 3 && Math.hypot(me.x - fireX, me.s - FIRE_S) < 7.5) return ["feed", "添柴"];
    if (sownAt === null && Math.hypot(me.x - basketX, me.s - SOW_S) < 9.5) return ["sow", "播种"];
    if (touched === null && Math.hypot(me.x - stoneX, me.s - MONO_S) < MONO_S - REACH_S) return ["touch", "触碰巨石"];
    return null;
  }
  // Anonymous counts of how the walk goes (docs/analytics.md): each name and place at most once per page open; debug #s jumps are skipped.
  const counted = new Set<string>(), count = (event: string, target = "") => { if (jumped) return; const key = `${event}:${target}`; if (!counted.has(key)) { counted.add(key); recordEngagement(event, target); } };
  let passed = MILESTONES.filter(([, at]) => at <= me.s).length, startedAt = 0, left = false;
  /** Once, the first time the page is hidden or closed after the walk began: the furthest place passed and roughly how long it lasted. */
  function leave() {
    if (jumped || !begun || left) return; left = true;
    const minutes = (performance.now() - startedAt) / 60000;
    recordEngagement("walk_leave", passed ? MILESTONES[passed - 1]![0] : "start");
    recordEngagement("walk_time", minutes < 1 ? "0-1m" : minutes < 2 ? "1-2m" : minutes < 4 ? "2-4m" : "4m+");
  }
  function scatterSeeds() {
    const fwdX = -Math.sin(me.yaw), fwdZ = -Math.cos(me.yaw), rightX = Math.cos(me.yaw), rightZ = -Math.sin(me.yaw);
    const handY = ground(me.x, -me.s) + 1.18;
    for (let i = 0; i < SEEDS; i++) {
      const spread = (rand() - .5) * 1.1, throwSpeed = 1.8 + rand() * 2.4;
      seedAt[i * 3] = me.x + rightX * .22 + fwdX * .35; seedAt[i * 3 + 1] = handY; seedAt[i * 3 + 2] = -me.s + rightZ * .22 + fwdZ * .35;
      seedVel[i * 3] = (fwdX + rightX * spread) * throwSpeed; seedVel[i * 3 + 1] = .9 + rand() * 1.1; seedVel[i * 3 + 2] = (fwdZ + rightZ * spread) * throwSpeed;
    }
    seedT = 0; seedBurst.visible = true; seedMaterial.opacity = .95; seedGeometry.attributes.position!.needsUpdate = true;
  }
  function sow(byHand: boolean) {
    if (sownAt !== null) return; sownAt = clock;
    if (byHand && !still) scatterSeeds();
    speak("sown", byHand ? "你撒下这把麦种。到了收割的时候，人还得回来。" : "在你之前，已经有人播下了种子。", 8);
  }
  function act() {
    if (!started) return;
    const what = nearby(); if (!what) return;
    if (what[0] === "feed") { sound?.cue("feed"); count("walk_act", "feed"); fed++; feedGlow = 2.2; showLogs(fed); if (fed === 3) speak("fed", "火光把夜晚推远了一点。一天，变长了。", 8); }
    else if (what[0] === "sow") { sound?.cue("sow"); count("walk_act", "sow"); sow(true); }
    else { sound?.cue("touch"); touched = clock; clearInput(); setAuto(false); root.classList.add("is-finishing"); speak("touch", "石头是凉的。", 2.2); count("walk_finish"); }
  }
  function clearInput() { keys.clear(); wheelPush = 0; holdGo = false; drag = null; velForward = 0; velStrafe = 0; }
  function setAuto(on: boolean) { auto = on; autoButton.setAttribute("aria-pressed", String(on)); }
  let shown = "";
  function begin() {
    if (ended) {
      count("walk_act", "replay"); ended = false; touched = null; fed = 0; feedGlow = 1; sownAt = null; seedT = -1; seedBurst.visible = false;
      clearInput(); sayUntil = 0; say.classList.remove("is-on"); said.clear(); shown = "";
      Object.assign(me, entrance); fieldUniforms.front.value = -1e4;
      for (const chunk of fieldChunks) chunk.mesh.visible = false;
      showLogs(0); sound?.cue("replay");
      exitLink.hidden = true; shareButton.hidden = true; if (manifestoLink) manifestoLink.hidden = true; part("cover-keys").hidden = false;
    }
    if (audioContext && !soundButton.disabled) {
      try {
        if (sound) sound.setMuted(!soundOn);
        else sound = startSound(audioContext, !soundOn);
      } catch {
        // A partially supported Web Audio graph must not prevent walking or leave its context running.
        if (audioContext.state !== "closed") void audioContext.close().catch(() => {});
        sound = null; soundButton.disabled = true; soundButton.setAttribute("aria-pressed", "false");
      }
    }
    started = true; hud.hidden = false; canvas.inert = false; cover.inert = true;
    viewport.style.removeProperty("opacity"); root.classList.remove("is-ended", "is-finishing"); root.classList.add("is-live"); cover.classList.add("is-gone");
    canvas.focus({ preventScroll: true });
    last = performance.now(); schedule();
    if (!begun) { begun = true; startedAt = performance.now(); count("walk_start"); }
  }
  showLogs(0);
  use.addEventListener("click", act, listen);
  startButton.addEventListener("click", () => { if (ended) begin(); }, listen);
  const moveKeys = new Set(["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright", "shift"]);
  canvas.addEventListener("keydown", e => {
    if (!started || touched !== null || e.metaKey || e.ctrlKey || e.altKey) return;
    const key = e.key.toLowerCase();
    if (!moveKeys.has(key) && key !== "e") return;
    e.preventDefault(); sound?.wake();
    if (key === "e") { if (!e.repeat) act(); }
    else keys.add(key);
  }, listen);
  canvas.addEventListener("keyup", e => keys.delete(e.key.toLowerCase()), listen);
  canvas.addEventListener("blur", clearInput, listen);
  addEventListener("blur", clearInput, listen);
  canvas.addEventListener("pointerdown", e => {
    if (!started || touched !== null || !e.isPrimary || e.button !== 0) return;
    canvas.focus({ preventScroll: true }); sound?.wake();
    drag = { pointer: e.pointerId, x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId);
  }, listen);
  canvas.addEventListener("pointermove", e => {
    if (e.pointerId !== drag?.pointer) return;
    me.yaw -= (e.clientX - drag.x) * .0042; me.pitch = clamp(me.pitch - (e.clientY - drag.y) * .003, -.7, .7);
    drag.x = e.clientX; drag.y = e.clientY;
  }, listen);
  canvas.addEventListener("lostpointercapture", e => { if (e.pointerId === drag?.pointer) drag = null; }, listen);
  canvas.addEventListener("wheel", e => {
    if (!started || touched !== null || e.ctrlKey) return;
    e.preventDefault(); wheelPush = clamp(wheelPush - e.deltaY * .012, -6, 14);
  }, { passive: false, signal });
  go.addEventListener("pointerdown", e => {
    if (!e.isPrimary || e.button !== 0) return;
    sound?.wake(); holdGo = true; go.setPointerCapture(e.pointerId);
  }, listen);
  go.addEventListener("lostpointercapture", () => { holdGo = false; }, listen);
  go.addEventListener("keydown", e => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); holdGo = true; } }, listen);
  go.addEventListener("keyup", e => { if (e.key === " " || e.key === "Enter") holdGo = false; }, listen);
  go.addEventListener("blur", () => { holdGo = false; }, listen);
  autoButton.addEventListener("click", () => {
    if (touched !== null) return;
    sound?.wake(); setAuto(!auto); if (auto) count("walk_act", "auto");
  }, listen);
  exitLink.addEventListener("click", () => count("walk_act", "exit"), listen);
  manifestoLink?.addEventListener("click", () => count("walk_act", "manifesto"), listen);
  shareButton.addEventListener("click", () => {
    count("walk_act", "share");
    void shareOrCopy(tx("从火堆到巨石"), `${location.origin}${localePath("/chronicle/walk", locale)}`).then((result) => {
      if (result !== "copied" || signal.aborted) return;
      shareButton.textContent = tx("链接已复制");
      setTimeout(() => { if (!signal.aborted) shareButton.textContent = tx("分享这条路"); }, 2000);
    });
  }, listen);
  addEventListener("pagehide", leave, listen);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { clearInput(); setAuto(false); cancelAnimationFrame(raf); raf = 0; leave(); }
    else if (started) { last = performance.now(); schedule(); }
  }, listen);
  const soundButton = part<HTMLButtonElement>("sound"); soundButton.disabled = !audioContext; soundButton.setAttribute("aria-pressed", String(soundOn && Boolean(audioContext)));
  soundButton.addEventListener("click", () => { soundOn = !soundOn; soundButton.setAttribute("aria-pressed", String(soundOn)); sound?.setMuted(!soundOn); if (soundOn) sound?.wake(); try { localStorage.setItem("walk-sound", soundOn ? "on" : "off"); } catch { /* storage may be blocked */ } }, listen);

  // Bisect the angles to the foot and crown so the full silhouette fits at the first touch prompt.
  function arrivalPitch(distance: number) {
    const nearFace = Math.max(1, distance - Math.hypot(MONOLITH.width, MONOLITH.depth) / 2);
    return (Math.atan2(MONOLITH.height - MONOLITH.burial - 1.66, nearFace) - Math.atan2(1.66, nearFace)) / 2;
  }
  function walk(dt: number) {
    let forward = 0, strafe = 0; const fast = keys.has("shift") ? 2.3 : 1;
    if (keys.has("w") || keys.has("arrowup") || holdGo) forward += 1; if (keys.has("s") || keys.has("arrowdown")) forward -= 1;
    if (keys.has("a")) strafe -= 1; if (keys.has("d")) strafe += 1;
    if (keys.has("arrowleft")) me.yaw += dt * 1.6; if (keys.has("arrowright")) me.yaw -= dt * 1.6;
    forward += wheelPush * .12; wheelPush *= Math.pow(.02, dt);
    let heading = me.yaw;
    if (auto) {
      const ahead = Math.min(me.s + 6, END_S);
      const trackX = roadX(ahead) - 4.4 * smooth(595, REACH_S, ahead);
      const want = Math.atan2(me.x - trackX, Math.max(.1, ahead - me.s));
      // Look across the verge on approach while the walker's feet continue along the road.
      const stop = roadsideStops.find(([s]) => s - me.s > -3 && s - me.s < 27);
      const gap = stop ? stop[0] - me.s : 0;
      const attention = stop ? smooth(-3, 3, gap) * (1 - smooth(14, 27, gap)) : 0;
      if (!drag) {
        // Keep following the road underfoot as the stone rises into view above the horizon.
        const reveal = smooth(548, 610, me.s);
        const stoneYaw = Math.atan2(me.x - (stoneX - .7), MONO_S - me.s);
        let view = mix(want, stoneYaw, reveal);
        let lift = reveal * arrivalPitch(Math.hypot(me.x - stoneX, MONO_S - me.s));
        if (stop && !still) {
          const targetX = roadX(stop[0]) + stop[1];
          view = mix(view, Math.atan2(me.x - targetX, Math.max(3.5, gap)), attention);
          const targetY = floor(targetX, -stop[0]) + 1.1 - floor(me.x, -me.s) - 1.66;
          lift = mix(lift, Math.atan2(targetY, Math.max(4, Math.hypot(gap, targetX - me.x))), attention);
        }
        me.yaw += Math.atan2(Math.sin(view - me.yaw), Math.cos(view - me.yaw)) * Math.min(1, dt * 1.4);
        me.pitch += (lift - me.pitch) * Math.min(1, dt);
      }
      const nearSow = sownAt === null && Math.abs(me.s - SOW_S) < 8.5;
      // Follow the road even when the walker turns the camera to look at a landmark.
      if (!forward && !strafe) { heading = want; forward = nearSow ? .52 : mix(.85, .48, attention); }
      if (me.s >= REACH_S + 1.6 && nearby()?.[0] === "touch") { forward = 0; setAuto(false); }
    }
    const speed = 7.2 * fast, sin = Math.sin(heading), cos = Math.cos(heading);
    const blend = still ? 1 : 1 - Math.exp(-16 * dt);
    velForward += (forward - velForward) * blend;
    velStrafe += (strafe - velStrafe) * blend;
    me.x += (-sin * velForward + cos * velStrafe) * speed * dt; me.s += (cos * velForward + sin * velStrafe) * speed * dt;
    me.s = clamp(me.s, -12, END_S); me.x = clamp(me.x, roadX(me.s) - 48, roadX(me.s) + 48);
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < blocks.length; i++) {
        const [x, s, r] = blocks[i]!; if (Math.abs(s - me.s) > r + 6) continue;
        const gap = Math.hypot(me.x - x, me.s - s), room = r + .35;
        if (gap < room && gap > 0) { me.x = x + (me.x - x) / gap * room; me.s = s + (me.s - s) / gap * room; }
      }
      [me.x, me.s] = keepDry(me.x, me.s);
    }
    const moveMag = Math.hypot(velForward, velStrafe);
    if (moveMag > .04) me.bob += dt * speed * 1.25 * Math.min(1, moveMag);
    pace = Math.min(1, moveMag) * fast;
  }

  // ---------- frame ----------
  const yearFigure = part("year"), yearUnit = part("unit"), yearLabel = part("year-label"), chapter = part("chapter"), dot = part("dot"), useLabel = part("use-label");
  let last = performance.now(), slow = 0, raf = 0;
  function schedule() { if (!raf && !document.hidden) raf = requestAnimationFrame(frame); }
  let drawnWidth = 0, drawnHeight = 0, drawnRatio = 1;
  let pixel = .001; // the height of one pixel one metre from the eye
  function resize() {
    const w = Math.max(1, root.clientWidth), h = Math.max(1, root.clientHeight);
    if (w === drawnWidth && h === drawnHeight && ratio === drawnRatio) return;
    renderer.setDrawingBufferSize(w, h, ratio);
    if (ratio !== drawnRatio) composer.setPixelRatio(ratio);
    if (w !== drawnWidth || h !== drawnHeight) composer.setSize(w, h);
    drawnWidth = w; drawnHeight = h; drawnRatio = ratio;
    moteUniforms.uScale.value = ratio;
    camera.aspect = w / h; camera.fov = w < h ? 74 : 62; camera.updateProjectionMatrix();
    pixel = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) / (h * ratio);
    if (begun) schedule();
  }
  const observer = new ResizeObserver(resize); observer.observe(root);
  function frame(now: number, draw = true) {
    raf = 0;
    if (document.hidden) return;
    const elapsed = clamp((now - last) / 1000, 0, .5), dt = Math.min(.05, elapsed); last = now; clock += elapsed;
    if (started && ratio > .75) {
      slow = Math.max(0, slow + (elapsed > .04 ? elapsed : -elapsed));
      if (slow > 2) { ratio = Math.max(.75, ratio - .25); slow = 0; resize(); }
    }
    if (started) {
      // Discard excess time after a stall rather than jumping past interactions.
      if (touched === null) for (let t = Math.min(.10, elapsed); t > 0; t -= .05) walk(Math.min(.05, t));
      else pace = 0;
      for (const [at, text] of LINES) if (me.s >= at && me.s < at + 36) speak(`line-${at}`, text);
      while (passed < MILESTONES.length && me.s >= MILESTONES[passed]![1]) count("walk_reach", MILESTONES[passed++]![0]);
    }
    if (sownAt === null && me.s > FIELD_S + 12) sow(false);
    if (sownAt !== null) {
      // The last field reappears beyond the campus, growing into view as the road leaves the data hall.
      const front = Math.min(SOW_S + (clock - sownAt) * 34, mix(605, 760, smooth(558, 601, me.s)));
      fieldUniforms.front.value = front;
      for (const chunk of fieldChunks) chunk.mesh.visible = front > chunk.minS - 4;
    }
    if (seedT >= 0) {
      seedT += dt;
      if (seedT > 1.35) { seedT = -1; seedBurst.visible = false; }
      else {
        for (let i = 0; i < SEEDS; i++) {
          seedVel[i * 3 + 1] = seedVel[i * 3 + 1]! - 5.4 * dt;
          seedAt[i * 3] = seedAt[i * 3]! + seedVel[i * 3]! * dt;
          seedAt[i * 3 + 2] = seedAt[i * 3 + 2]! + seedVel[i * 3 + 2]! * dt;
          seedAt[i * 3 + 1] = Math.max(ground(seedAt[i * 3]!, seedAt[i * 3 + 2]!) + .02, seedAt[i * 3 + 1]! + seedVel[i * 3 + 1]! * dt);
        }
        seedMaterial.opacity = 1 - smooth(.75, 1.35, seedT); seedGeometry.attributes.position!.needsUpdate = true;
      }
    }
    if (clock > sayUntil) say.classList.remove("is-on");

    setHour(me.s);
    const sinceTouch = touched === null ? 0 : clock - touched;
    const dusk = touched === null ? 0 : still ? 1 : smooth(.4, 4.8, sinceTouch); // the light settles into evening during the cut to the field
    if (sound) {
      const dx = fireX - me.x, dz = me.s - FIRE_S, fireGap = Math.hypot(dx, dz);
      const firePan = (Math.cos(me.yaw) * dx - Math.sin(me.yaw) * dz) / Math.max(1, fireGap);
      sound.frame({ s: me.s, pace: started ? pace : 0, fed, fireGap, firePan, night: hour.stars, dusk }, dt);
    }
    hour.top.lerp(nightSky, dusk * .35); hour.horizon.lerp(nightHorizon, dusk * .12); hour.fog.lerp(nightHorizon, dusk * .18);
    // From the road by the dish, the low sun meets the top of the stone before the walker passes into its shadow.
    const height = mix(hour.height, .018, dusk);
    sunBearing(me.s, height, sunDir);
    skyUniforms.top.value.copy(hour.top); skyUniforms.horizon.value.copy(hour.horizon); skyUniforms.sun.value.copy(hour.sun).multiplyScalar(1 - dusk * .2); skyUniforms.stars.value = Math.max(hour.stars, dusk * .18); skyUniforms.time.value = still ? 0 : clock; skyUniforms.day.value = smooth(330, 410, me.s) * (1 - dusk * .5);
    orbit.orbitVisibility.value = Math.max(1 - smooth(170, 320, me.s), .74 * smooth(.32, 1, dusk));
    fog.color.copy(hour.fog); fog.density = hour.density;
    const power = hour.power * (1 - dusk * .35), skyPower = hour.sky * (1 - dusk * .3);
    skyLight.color.copy(hour.top).lerp(hour.horizon, .6); skyLight.intensity = skyPower * 1.35 * (1 + hour.stars * 2.7); // the night is drawn blue, not black
    // Straw and packed earth return warm light onto the shaded faces of the workbenches.
    const reflected = smooth(290, 355, me.s) * (1 - smooth(558, 604, me.s));
    skyLight.groundColor.copy(nightSoil).lerp(sunlitStraw, reflected).lerp(flagstone, reflected * smooth(403, 430, me.s));
    skyLight.intensity *= 1 + reflected * .52;
    sunLight.color.copy(hour.sun); sunLight.intensity = power * (hour.stars > .5 ? 2. : 3.2);
    sunLight.target.position.set(me.x - Math.sin(me.yaw) * 22, ground(me.x, -me.s), -me.s - Math.cos(me.yaw) * 22);
    sunLight.position.copy(sunLight.target.position).addScaledVector(hour.stars > .5 ? moon : sunDir, 160); // the setting sun stays warm and low; the night uses a cool fill
    environment?.update(me.s, dusk);
    scene.environmentIntensity = mix(.4, 1.3, hour.stars) + dusk * .1; // the sunset keeps a little reflected sky beside the warm grazing light
    fieldUniforms.time.value = clock; fieldUniforms.sky.value.copy(skyLight.color).multiplyScalar(skyPower * 1.3).lerp(fieldAfterglow, dusk * .60); fieldUniforms.sun.value.copy(hour.sun).multiplyScalar(power * .75);
    fieldUniforms.fogColor.value.copy(hour.fog); fieldUniforms.fogDensity.value = hour.density; fieldUniforms.backlit.value = smooth(430, 600, me.s) * (1 - dusk * .15);

    feedGlow += (1 - feedGlow) * Math.min(1, dt * 1.5);
    const fire = tendFire(clock, dt, fed, feedGlow, me.s);
    fieldUniforms.fire.value.set(fireX, fireY + .8, -FIRE_S, fire.glow * .5);
    village.villageLight.intensity = 14 * fire.flicker; village.frame(clock, me.s);
    sowLight.intensity = Math.abs(me.s - SOW_S) < 85 && me.s < 335 ? 5.5 * (.9 + .1 * fire.flicker) : 0;
    propsFrame(me.s);
    fields.frame(clock, dt, me.s); fields.water.color.copy(hour.top).lerp(hour.horizon, .18).multiplyScalar(.55 + power * .35); fields.waterSun.copy(sunDir); // open water shows the sky overhead, darker than the sky at the horizon

    const eyeY = ground(me.x, -me.s) + bridgeLift(me.x, me.s) + 1.66 + (still ? 0 : Math.sin(me.bob) * .035);
    if (touched !== null && (still || sinceTouch >= 2.05)) {
      // Cut to the view from the wheat. The reader's position stays at the stone.
      const portrait = camera.aspect < 1, distance = portrait ? 34 : 35;
      const shotX = stoneX - (portrait ? .85 : 4.7), shotZ = -MONO_S + distance;
      camera.position.set(shotX, floor(shotX, shotZ) + 1.75, shotZ);
      const halfWidth = distance * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect;
      camera.lookAt(stoneX + halfWidth * (portrait ? .29 : -.27), floor(stoneX, -MONO_S) + (portrait ? 5.3 : 8.8), -MONO_S);
    } else {
      camera.position.set(me.x, eyeY, -me.s);
      camera.rotation.set(me.pitch, me.yaw, 0, "YXZ");
    }
    if (touched !== null && !still) {
      const curtain = smooth(.8, 1.85, sinceTouch) * (1 - smooth(2.25, 3.95, sinceTouch));
      viewport.style.opacity = String(1 - curtain);
    }
    sky.position.copy(camera.position);
    const carry = started && dusk === 0 ? smooth(FIRE_S + 3, FIRE_S + 14, me.s) * (1 - smooth(205, 248, me.s)) * (.72 + fed * .22) : 0;
    const room = rooms.find(room => Math.abs(me.s - room.s) < 23);
    if (room) {
      localLight.position.copy(room.position);
      localLight.color.setHex(room.tint);
      localLight.intensity = room.power * (1 - smooth(13, 23, Math.abs(me.s - room.s)));
    } else if (carry > .01) {
      localLight.color.setHex(0xff8e42);
      localLight.position.set(me.x + Math.cos(me.yaw) * .28 - Math.sin(me.yaw) * .55, eyeY - .24, -me.s - Math.cos(me.yaw) * .55 - Math.sin(me.yaw) * .28);
      localLight.intensity = carry * 5.2 * fire.flicker;
    } else localLight.intensity = 0;
    camera.getWorldDirection(camDir);
    const fwdLen = Math.hypot(camDir.x, camDir.z) || 1;
    updateWheat(camera);
    grass.frame(clock, camera.position, hour.density, pixel, camDir.x / fwdLen, camDir.z / fwdLen);
    clouds.frame(camera.position, still ? 0 : clock, me.s, sunDir, cloudSun.copy(hour.sun).multiplyScalar(power), cloudSky.copy(skyLight.color).multiplyScalar(skyPower), dusk);
    gradeTime.value = still ? 0 : clock;
    moteUniforms.uTime.value = still ? 0 : clock; moteUniforms.uCenter.value.copy(camera.position); moteUniforms.uS.value = me.s; moteUniforms.uDusk.value = dusk;
    const [figure, unit] = yearReading(me.s, locale), ago = yearsAgo(me.s), about = ago > 126, reading = `${figure}|${unit}|${chapterAt(me.s)}`;
    if (reading !== shown) {
      shown = reading; yearFigure.textContent = figure; yearUnit.textContent = unit; yearLabel.textContent = tx(about ? "此刻走到 · 约" : "此刻走到");
      const nextChapter = tx(chapterAt(me.s)); if (chapter.textContent !== nextChapter) chapter.textContent = nextChapter;
      backLink.href = started && me.s > 24 && ago > 2 ? `${chronicleBase}?t=${Math.round(2026 - ago)}` : chronicleBase;
    }
    dot.style.left = touched !== null ? "100%" : `${clamp((me.s - START_S) / (END_S - START_S), 0, 1) * 100}%`;
    const what = started ? nearby() : null;
    if (what) {
      const label = tx(what[1]); if (useLabel.textContent !== label) useLabel.textContent = label;
    } else if (document.activeElement === use) canvas.focus({ preventScroll: true });
    use.hidden = !what;
    if (touched !== null && !ended && sinceTouch > (still ? 2.7 : 7)) {
      ended = true; started = false; backLink.href = chronicleBase;
      part("cover-title").textContent = tx("我们立起的碑");
      part("cover-text").textContent = tx("AI 读过人写的程序。如今，写程序的人也会停下来，读它续上的下一行。");
      hud.hidden = true; canvas.inert = true; cover.inert = false; root.classList.add("is-ended"); sound?.setMuted(true);
      part("cover-keys").hidden = true; exitLink.hidden = false; shareButton.hidden = false; if (manifestoLink) manifestoLink.hidden = false;
      startButton.textContent = tx("再走一遍"); cover.classList.remove("is-gone"); cover.scrollTop = 0;
      requestAnimationFrame(() => { if (ended && !signal.aborted) part("cover-title").focus({ preventScroll: true }); });
    }
    if (draw) composer.render();
    if (started) schedule();
  }
  signal.addEventListener("abort", () => {
    leave();
    cancelAnimationFrame(raf); observer.disconnect(); sound?.close();
    hud.hidden = true; cover.inert = false; cover.classList.remove("is-gone"); root.classList.remove("is-live", "is-ended", "is-finishing"); viewport.style.removeProperty("opacity");
  }, { once: true });
  resize();
  frame(performance.now(), false);
  // Compile with the same lights, environment and linear render target as the
  // walk. Three visits even the meshes that are still hidden in later eras.
  renderer.setRenderTarget(composer.readBuffer);
  try {
    renderer.compile(scene, camera);
  } finally {
    renderer.setRenderTarget(null);
  }
  const parallel = renderer.extensions.get("KHR_parallel_shader_compile") as KHR_parallel_shader_compile | null;
  const context = renderer.getContext();
  // Poll from the loading loop so cancel or a lost context also stops the wait.
  if (parallel) {
    while (!signal.aborted && !context.isContextLost() && renderer.info.programs?.some(({ program }) =>
      !context.getProgramParameter(program, parallel.COMPLETION_STATUS_KHR))) await pause();
  }
  if (signal.aborted || context.isContextLost()) return;
  frame(performance.now());
  startButton.disabled = false;
  begin();
}
