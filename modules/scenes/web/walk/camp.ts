import * as THREE from "three";
import { FIRE_S } from "./land.ts";
import { POSES, person as figure, type Point, type Pose } from "./people.ts";
import { blob, flat, limb, lit, merged, of, rock, scorch, scree, triangles } from "./shapes.ts";

export interface Kit {
  scene: THREE.Scene; own: <T extends { dispose(): void }>(item: T) => T; rand: () => number; small: boolean; still: boolean;
  /** The lines that end every custom fragment shader (tone mapping and colour space). */
  out: string;
  /** Height of the drawn ground under a point. */
  floor: (x: number, z: number) => number;
  /** The one material every painted shape shares. */
  matte: THREE.Material;
  /** Turns a shape, sets it on the ground at (x, s) and hands it to the static scenery near there. */
  stand: (shape: THREE.BufferGeometry, x: number, s: number, turn?: number, lift?: number) => void;
  /** Circles the walker cannot step into: [x, s, radius]. */
  blocks: Array<[number, number, number]>;
  fireX: number;
}

/** A round, soft-edged spot drawn on a canvas, for a glow or a puff of smoke. */
export function soft(own: Kit["own"], inner: string, middle: string) {
  const art = document.createElement("canvas"); art.width = art.height = 128; const g = art.getContext("2d")!, r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, inner); r.addColorStop(.3, middle); r.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  const map = own(new THREE.CanvasTexture(art)); map.colorSpace = THREE.SRGBColorSpace; return map;
}

/** The hearth and the people around it: the first sixty metres of the walk. */
export function buildCamp({ scene, own, rand, small, still, out, floor, matte, stand, blocks, fireX }: Kit) {
  const V = (p: Point) => new THREE.Vector3(...p);
  const bark = of(2, lit("#3d3026", "#6b5644", rand)), dead = of(2, lit("#75654f", "#a8957a", rand)), stone = of(1, lit("#4b433b", "#82776a", rand, .1)), dryGrass = of(3, lit("#6c5f38", "#b29a5c", rand, .3)), hide = flat("#7d6245", rand, .22);
  const fireY = floor(fireX, -FIRE_S);
  blocks.push([fireX, FIRE_S, 1.55]);

  // ---------- people ----------
  const person = (pose: Pose, extra: THREE.BufferGeometry[] = []) => own(figure(rand, pose, { extra, skin: "#6a4631", small })); // darker than the day people, as the firelight shows them
  const people: THREE.Mesh[] = [];
  function seat(shape: THREE.BufferGeometry, dx: number, ds: number, size = 1, toward: [number, number] = [0, 0]) {
    const x = fireX + dx, s = FIRE_S + ds, body = new THREE.Mesh(shape, matte);
    body.position.set(x, floor(x, -s) - .01, -s); body.scale.setScalar(size); body.rotation.y = Math.atan2(fireX + toward[0] - x, -(FIRE_S + toward[1]) + s);
    body.castShadow = body.receiveShadow = true; scene.add(body); people.push(body); blocks.push([x, s, .45 * size]);
  }
  seat(person(POSES.warm), 1.25, 2.35); seat(person(POSES.warm), .25, 2.65, .62);
  seat(person(POSES.tend, [limb(V(POSES.tend.hands[1]).add(new THREE.Vector3(0, .02, -.25)), new THREE.Vector3(.12, .2, 1.75), .016, .011, dead, { sides: 4 })]), 2.5, .5);
  // the one on watch stands between the fire and the dark the walker comes out of
  seat(person(POSES.watch, [limb(new THREE.Vector3(.3, 0, .34), new THREE.Vector3(.3, 2.05, .3), .017, .013, dead, { sides: 4 }), blob(rand, [.028, .1, .012], flat("#3b3835", rand), 0, .1).translate(.3, 2.12, .3)]), 1.7, -4.8, 1, [-3, -30]);

  // ---------- the shelter rocks, the windbreak and what lies around the fire ----------
  const strata = of(1, (center, normal) => stone(center, normal, 0).multiplyScalar(1 + .1 * Math.sin(center.y * 9 + center.x * 2)));
  for (const [dx, ds, sx, sy, sz, turn] of [[7.6, 3.4, 3.7, 3.3, 3.1, .4], [6.6, -5.2, 2.7, 2.5, 2.5, 2.1], [11.6, -1.6, 5, 4.5, 4.3, 4.4], [9.8, 8.6, 2.2, 1.6, 2.4, 1.2]] as const) {
    stand(rock(rand, 2, strata).scale(sx, sy, sz), fireX + dx, FIRE_S + ds, turn, -sy * .15); stand(scree(rand, Math.max(sx, sz) * 2.2, stone, of(3, lit("#5e4d3a", "#9a8466", rand)), Math.atan2(-ds, dx)), fireX + dx, FIRE_S + ds); blocks.push([fireX + dx, FIRE_S + ds, Math.max(sx, sz) * .82]);
  }
  { const parts: THREE.BufferGeometry[] = [], thatch: number[] = [], ribs = 9, rows = 5, wide = 1.9, tall = 1.55; // the shelter: bent poles covered with grass, open toward the fire
    const rib = (i: number, t: number) => { const around = i / (ribs - 1) * Math.PI, up = t * 1.36; return new THREE.Vector3(Math.cos(around) * wide * Math.cos(up), tall * Math.sin(up) - .08, -Math.sin(around) * wide * 1.15 * Math.cos(up) + t * .5); };
    const knot = Array.from({ length: ribs }, (_, i) => Array.from({ length: rows + 1 }, (_, row) => rib(i, row / rows).add(new THREE.Vector3((rand() - .5) * .1, (rand() - .5) * .06, (rand() - .5) * .1))));
    for (let i = 0; i < ribs; i++) for (let row = 0; row < rows; row++) parts.push(limb(knot[i]![row]!, knot[i]![row + 1]!, .03 - row * .003, .027 - row * .003, bark, { sides: 4 }));
    for (let i = 0; i < ribs - 1; i++) for (let row = 0; row < rows; row++) { // bundles of grass tied on in rows, each hanging over the one below
      if (rand() < .07) continue;
      const out = (p: THREE.Vector3, more: number) => p.clone().add(new THREE.Vector3(p.x, 0, p.z - .25).normalize().multiplyScalar(.05 + more)).add(new THREE.Vector3(0, .03, 0));
      const a = out(knot[i]![row]!, .07 + rand() * .06), b = out(knot[i + 1]![row]!, .07 + rand() * .06), c = out(knot[i + 1]![row + 1]!, 0), d = out(knot[i]![row + 1]!, 0); a.y -= rand() * .14; b.y -= rand() * .14;
      for (const point of [a, b, c, a, c, d]) thatch.push(point.x, point.y, point.z);
    }
    parts.push(triangles(thatch, dryGrass));
    const bed: number[] = []; for (let i = 0; i < 9; i++) { const a0 = i * .698, a1 = a0 + .698, r0 = .75 + (i % 3) * .14, r1 = .75 + ((i + 1) % 3) * .14; bed.push(0, .04, -.55, Math.cos(a1) * r1 * 1.3, .03, -.55 + Math.sin(a1) * r1 * .7, Math.cos(a0) * r0 * 1.3, .03, -.55 + Math.sin(a0) * r0 * .7); }
    parts.push(triangles(bed, hide));
    const dx = 3.9, ds = 5.3; stand(merged(parts), fireX + dx, FIRE_S + ds, Math.atan2(-dx, ds)); blocks.push([fireX + dx + .4, FIRE_S + ds + .5, 1.7]); }
  { const parts: THREE.BufferGeometry[] = []; // the woodpile
    for (let i = 0; i < 12; i++) { const layer = i < 5 ? 0 : i < 9 ? 1 : 2, k = i - [0, 5, 9][layer]!, z = (k - [2, 1.5, 1][layer]!) * .17 + (rand() - .5) * .04, y = .07 + layer * .13, length = 1.2 + rand() * .5, skew = (rand() - .5) * .25;
      parts.push(limb(new THREE.Vector3(-length / 2, y, z - skew), new THREE.Vector3(length / 2, y + rand() * .04, z + skew), .06 + rand() * .025, .05 + rand() * .02, i % 4 ? dead : bark, { sides: 6, capped: true })); }
    for (let i = 0; i < 4; i++) parts.push(limb(new THREE.Vector3(-.5 + rand(), .05, .7 + i * .12), new THREE.Vector3(.4 + rand() * .9, .2 + rand() * .5, .55 + rand() * .5), .022, .008, dead, { sides: 4, sag: .2, rand }));
    stand(merged(parts), fireX - 1.5, FIRE_S + 2.7, .6); blocks.push([fireX - 1.5, FIRE_S + 2.7, .8]); }
  { const flint = of(1, flat("#3d3a39", rand, .3)), parts = [rock(rand, 1, stone).scale(.6, .26, .45)]; // the work stone, with the hand axes left on it
    for (const [x, z, turn] of [[-.2, .05, .4], [.12, -.1, 2], [.25, .16, 4.1]] as const) parts.push(blob(rand, [.055, .022, .085], flint, 0, .25).rotateY(turn).translate(x, .25, z));
    for (let i = 0; i < 14; i++) parts.push(blob(rand, [.02 + rand() * .02, .008, .03 + rand() * .02], flint, 0, .3).rotateY(rand() * 6).translate(-.9 + rand() * 1.8, .02, .5 + rand() * .7));
    stand(merged(parts), fireX + 3.6, FIRE_S - 2.3, .8, -.03); blocks.push([fireX + 3.6, FIRE_S - 2.3, .6]); }

  // ---------- the hearth ----------
  { const parts: THREE.BufferGeometry[] = [], fire = new THREE.Vector3(0, .35, 0);
    for (let i = 0; i < 11; i++) { const a = i * .571 + rand() * .1, r = 1.02 + rand() * .12; parts.push(scorch(rock(rand, 1, stone).scale(.2 + rand() * .09, .2 + rand() * .1, .2 + rand() * .09).rotateY(rand() * 6).translate(Math.cos(a) * r, -.07, Math.sin(a) * r), fire)); } // sooted on the side toward the fire
    stand(merged(parts), fireX, FIRE_S); }
  const hearth = new THREE.Group(); hearth.position.set(fireX, fireY, -FIRE_S); scene.add(hearth);
  const charred = of(2, lit("#0f0d0c", "#2a221d", rand)), logs: THREE.Mesh[] = [];
  for (let i = 0; i < 6; i++) {
    const a = i * 1.05 + .3, foot = new THREE.Vector3(Math.cos(a) * .74, .03, Math.sin(a) * .74), head = new THREE.Vector3(-Math.cos(a) * .12, .74 + rand() * .22, -Math.sin(a) * .12);
    const log = new THREE.Mesh(own(limb(foot, head, .085 + rand() * .03, .065, i < 2 ? charred : bark, { sides: 6, capped: true })), matte); log.receiveShadow = true; hearth.add(log); logs.push(log);
  }
  const showLogs = (fed: number) => logs.forEach((log, i) => { log.visible = i < 2 + fed * 2; });
  const coalGlow = own(new THREE.MeshBasicMaterial({ color: 0xffffff })), coals: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 16; i++) { const a = rand() * 6.3, r = Math.sqrt(rand()) * .62; coals.push(rock(rand, 0, flat("#ffffff", rand, .7)).scale(.1 + rand() * .07, .07, .1 + rand() * .07).translate(Math.cos(a) * r, .02, Math.sin(a) * r)); }
  coalGlow.vertexColors = true; hearth.add(new THREE.Mesh(own(merged(coals)), coalGlow));

  const flameShape = own(merged([0, 1, 2].map((i) => new THREE.PlaneGeometry(1.5, 2.2).translate(0, 1.1, 0).rotateY(i * Math.PI / 3)))), flameUniforms: Array<{ time: { value: number } }> = [];
  /** A fire drawn in four flat colours, its edge cut by drifting noise. */
  function flame() {
    const uniforms = { time: { value: 0 }, seed: { value: rand() * 9 } }; flameUniforms.push(uniforms);
    return new THREE.Mesh(flameShape, own(new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, uniforms,
      vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }",
      fragmentShader: `uniform float time, seed; varying vec2 vUv;
        float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f); return mix(mix(h(i), h(i + vec2(1., 0.)), f.x), mix(h(i + vec2(0., 1.)), h(i + vec2(1., 1.)), f.x), f.y); }
        float fbm(vec2 p){ return n(p) * .5 + n(p * 2.03) * .3 + n(p * 4.1) * .2; }
        void main(){ float t = time * 1.9 + seed, x = vUv.x - .5;
          x += (fbm(vec2(vUv.x * 3.2 + seed, vUv.y * 2.4 - t)) - .5) * .34 * vUv.y;
          float width = mix(.46, .02, pow(vUv.y, .7)), body = smoothstep(width, width * .2, abs(x));
          float lick = smoothstep(.2, .7, fbm(vec2(vUv.x * 5. - seed, vUv.y * 3.4 - t * 1.6)) + (1. - vUv.y) * .8 - .32);
          float heat = body * lick * smoothstep(0., .06, vUv.y) * (1.25 - vUv.y);
          vec3 c = mix(vec3(1.5, .2, .03), vec3(2.3, .75, .1), smoothstep(.3, .34, heat)); c = mix(c, vec3(2.8, 1.6, .4), smoothstep(.55, .6, heat)); c = mix(c, vec3(3., 2.6, 1.7), smoothstep(.85, .9, heat));
          gl_FragColor = vec4(c * .8, smoothstep(.1, .15, heat) * .75); ${out} }`,
    })));
  }
  const flames = [flame(), flame(), flame()]; flames[1]!.rotation.y = .5; flames[2]!.rotation.y = 1; hearth.add(...flames);
  const halo = new THREE.Sprite(own(new THREE.SpriteMaterial({ map: soft(own, "rgba(255,190,110,.9)", "rgba(255,130,50,.3)"), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: .28 }))); halo.position.y = 1; hearth.add(halo);
  const puffMap = soft(own, "rgba(255,255,255,.9)", "rgba(255,255,255,.4)"), smoke = Array.from({ length: small ? 4 : 7 }, () => { const puff = new THREE.Sprite(own(new THREE.SpriteMaterial({ map: puffMap, color: "#5a4a44", depthWrite: false, transparent: true, opacity: 0 }))); hearth.add(puff); return puff; });
  const fireLight = new THREE.PointLight(0xff8a3c, 1, 90, 2); fireLight.position.set(fireX, fireY + .75, -FIRE_S); scene.add(fireLight);
  if (!small) { fireLight.castShadow = true; fireLight.shadow.mapSize.set(2048, 2048); fireLight.shadow.radius = 3; fireLight.shadow.camera.near = .2; fireLight.shadow.camera.far = 60; fireLight.shadow.bias = -.004; fireLight.shadow.normalBias = .04; }
  const SPARKS = small ? 40 : 90, sparkAt = new Float32Array(SPARKS * 3), sparkLife = Array.from({ length: SPARKS }, () => rand());
  const sparkGeometry = own(new THREE.BufferGeometry()), sparkMaterial = own(new THREE.PointsMaterial({ color: new THREE.Color(3, 1.5, .5), size: .035, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  sparkGeometry.setAttribute("position", new THREE.BufferAttribute(sparkAt, 3));
  const sparks = new THREE.Points(sparkGeometry, sparkMaterial); sparks.frustumCulled = false; hearth.add(sparks);

  // ---------- eyes at the edge of the light ----------
  const watchers: number[] = [];
  for (const [angle, reach] of [[2.5, 19], [3.2, 24], [3.9, 17], [4.6, 27], [1.7, 23], [5.3, 21]] as const) {
    const x = fireX + Math.cos(angle) * reach, s = FIRE_S + Math.sin(angle) * reach, y = floor(x, -s) + .5 + rand() * .25;
    watchers.push(x - Math.sin(angle) * .06, y, -s - Math.cos(angle) * .06, x + Math.sin(angle) * .06, y, -s + Math.cos(angle) * .06);
  }
  const eyeMaterial = own(new THREE.PointsMaterial({ color: new THREE.Color(1.6, 1.9, .8), size: .07, transparent: true, depthWrite: false, fog: false }));
  const eyes = new THREE.Points(own(new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(watchers, 3))), eyeMaterial); eyes.frustumCulled = false; scene.add(eyes);

  /** One frame of the fire and everyone near it. Returns how brightly the fire burns, for whatever else it lights. */
  function frame(clock: number, dt: number, fed: number, feedGlow: number) {
    const flicker = still ? .9 : .82 + .18 * Math.sin(clock * 11) * Math.sin(clock * 6.3) + .06 * Math.sin(clock * 23), level = [.5, .95, 1.5, 2.1][fed]! * feedGlow;
    fireLight.intensity = level * 190 * flicker; if (!still) fireLight.position.x = fireX + Math.sin(clock * 7.3) * .04;
    halo.scale.setScalar((5 + fed * 2.5) * flicker * Math.min(1.3, feedGlow)); coalGlow.color.setRGB(2.8, .62, .1).multiplyScalar((.55 + fed * .2) * (.8 + .2 * Math.sin(clock * 3.1)));
    for (const uniforms of flameUniforms) uniforms.time.value = clock;
    flames.forEach((f, i) => { const k = [1, .7, .45][i]! * (.8 + fed * .32) * (.92 + .08 * Math.sin(clock * 9 + i)) * Math.min(1.25, feedGlow); f.scale.set(k, k * 1.15, k); });
    for (let i = 0; i < SPARKS; i++) {
      sparkLife[i] = (sparkLife[i]! + dt * (.2 + (i % 7) * .035)) % 1; const t = sparkLife[i]!, a = i * 2.4;
      sparkAt[i * 3] = Math.cos(a + t * 3) * (.12 + t * .7) + t * t * .9; sparkAt[i * 3 + 1] = .5 + t * (2.6 + fed * 1.1 + (i % 5) * .4); sparkAt[i * 3 + 2] = Math.sin(a + t * 2) * (.12 + t * .7);
    }
    sparkGeometry.attributes.position!.needsUpdate = true; sparkMaterial.opacity = .4 + fed * .2;
    smoke.forEach((puff, i) => { const t = (clock * .07 + i / smoke.length) % 1; puff.position.set(t * t * 2.6 + Math.sin(i * 2.4 + t * 4) * .3, 1.6 + t * 9, Math.cos(i * 1.7 + t * 3) * .3); puff.scale.setScalar(.9 + t * 4.2); puff.material.opacity = Math.sin(t * Math.PI) * .16; });
    if (!still) people.forEach((body, i) => { body.rotation.z = Math.sin(clock * .7 + i * 1.9) * .012; body.scale.y = body.scale.x * (1 + Math.sin(clock * 1.5 + i * 2.3) * .008); });
    eyeMaterial.opacity = Math.max(0, 1 - fed * .34) * (Math.sin(clock * .4) > -.92 ? .9 : 0); // the more wood on the fire, the fewer eyes; now and then they blink
    return { glow: level * flicker, flicker };
  }
  return { fireY, showLogs, flame, frame };
}
