import * as THREE from "three";
import { CAVE_S, FIRE_S, noise, roadX } from "./land.ts";
import { POSES, person as figure, type Point, type Pose } from "./people.ts";
import { campShelter, cutLog } from "./camp-models.ts";
import { blob, faceted, flat, limb, lit, merged, of, rock, scorch, scree, triangles } from "./shapes.ts";

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
  const person = (pose: Pose, extra: THREE.BufferGeometry[] = [], child = false) => own(figure(rand, pose, { extra, skin: "#795640", small, child })); // darker than the day people, as the firelight shows them
  const people: THREE.Mesh[] = [];
  function seat(shape: THREE.BufferGeometry, dx: number, ds: number, size = 1, toward: [number, number] = [0, 0]) {
    const x = fireX + dx, s = FIRE_S + ds, body = new THREE.Mesh(shape, matte);
    body.position.set(x, floor(x, -s) - .01, -s); body.scale.setScalar(size); body.rotation.y = Math.atan2(fireX + toward[0] - x, -(FIRE_S + toward[1]) + s);
    body.castShadow = body.receiveShadow = true; scene.add(body); people.push(body); blocks.push([x, s, .45 * size]);
  }
  // Leave a gap around the flame from the path: the child and adult share one side and the fire tender the other.
  seat(person(POSES.warm), -.96, 2.28, 1.04, [.1, -.2]);
  seat(person(POSES.warm, [], true), -1.72, 1.88, .69, [-.35, -.05]);
  seat(person(POSES.tend, [limb(V(POSES.tend.hands[1]).add(new THREE.Vector3(0, .02, -.25)), new THREE.Vector3(.12, .2, 1.75), .016, .011, dead, { sides: 4 })]), 2.15, 1.15);
  // the one on watch stands between the fire and the dark the walker comes out of
  seat(person(POSES.watch, [limb(new THREE.Vector3(.3, 0, .34), new THREE.Vector3(.3, 2.05, .3), .017, .013, dead, { sides: 4 }), blob(rand, [.028, .1, .012], flat("#3b3835", rand), 0, .1).translate(.3, 2.12, .3)]), 2.74, -3.45, 1.05, [-4, -12]);

  // ---------- the shelter rocks, the windbreak and what lies around the fire ----------
  const strata = of(1, (center, normal) => stone(center, normal, 0).multiplyScalar(1 + .1 * Math.sin(center.y * 9 + center.x * 2)));
  for (const [dx, ds, sx, sy, sz, turn] of [[7.6, 3.4, 3.7, 3.3, 3.1, .4], [6.6, -5.2, 2.7, 2.5, 2.5, 2.1], [11.6, -1.6, 5, 4.5, 4.3, 4.4], [9.8, 8.6, 2.2, 1.6, 2.4, 1.2]] as const) {
    const detail = small && sx < 3 ? 1 : 2;
    stand(rock(rand, detail, strata).scale(sx, sy, sz), fireX + dx, FIRE_S + ds, turn, -sy * .15); stand(scree(rand, Math.max(sx, sz) * 2.2, stone, of(3, lit("#5e4d3a", "#9a8466", rand)), Math.atan2(-ds, dx)), fireX + dx, FIRE_S + ds); blocks.push([fireX + dx, FIRE_S + ds, Math.max(sx, sz) * .82]);
  }
  // A shelf of sandstone reaches out from the right-hand outcrop. Its thin lip silhouettes the fire circle;
  // the heavy end beds into two boulders and leaves the approach and sightline to the people open.
  const shelf: number[] = [];
  const sections = [
    [-5.3, 2.82, .26, .17, .25], [-4.5, 2.92, .92, .32, .02], [-3.1, 3.12, 1.65, .48, -.16],
    [-1.7, 3.37, 2.04, .61, -.28], [.05, 3.55, 2.28, .86, -.54], [1.5, 3.35, 2.14, .94, -.74], [2.8, 2.75, 1.35, .7, -.85],
  ] as const;
  const crossSection = [
    [.68, .22], [1, -.08], [.91, -.52], [.57, -.69], [.44, -.95], [-.45, -1], [-.95, -.58], [-1, .02], [-.42, .4],
  ] as const;
  const steps = small ? 2 : 4, edgeSteps = small ? 2 : 3, rims: THREE.Vector3[][] = [];
  for (let section = 0; section < (sections.length - 1) * steps + 1; section++) {
    const i = Math.min(sections.length - 2, Math.floor(section / steps)), t = section / steps - i;
    const a = sections[i]!, b = sections[i + 1]!, values = a.map((v, k) => THREE.MathUtils.lerp(v, b[k]!, t));
    const [x, y, width, depth, bend] = values as [number, number, number, number, number], rim: THREE.Vector3[] = [];
    for (let edgeIndex = 0; edgeIndex < crossSection.length * edgeSteps; edgeIndex++) {
      const j = Math.floor(edgeIndex / edgeSteps), f = edgeIndex / edgeSteps - j, p = crossSection[j]!, q = crossSection[(j + 1) % crossSection.length]!;
      const edge = THREE.MathUtils.lerp(p[0], q[0], f), bed = THREE.MathUtils.lerp(p[1], q[1], f), chip = noise(x * 4.1 + 9, edge * 8.7 + bed) - .5;
      // The shelf keeps its broad bedding planes, with small chips and recessed joints along their edges.
      const joint = Math.max(0, .1 - Math.abs((y + depth * bed) * 5 % 1 - .5)) * .45;
      rim.push(new THREE.Vector3(x + .12 * Math.sin(x * 1.5 + edge * 2), y + depth * bed + edge * .11 + chip * .065, bend + (width - joint) * edge + chip * .035));
    }
    rims.push(rim);
  }
  function facet(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) {
    shelf.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  }
  for (let i = 1; i < rims.length; i++) {
    const near = rims[i - 1]!, far = rims[i]!;
    for (let k = 0; k < near.length; k++) {
      const next = (k + 1) % near.length;
      facet(near[k]!, far[next]!, far[k]!); facet(near[k]!, near[next]!, far[next]!);
    }
  }
  const tip = rims[0]!, root = rims[rims.length - 1]!;
  for (let i = 1; i < tip.length - 1; i++) {
    facet(tip[0]!, tip[i + 1]!, tip[i]!); facet(root[0]!, root[i]!, root[i + 1]!);
  }
  const sandTop = new THREE.Color("#a19683"), sandFace = new THREE.Color("#82654d"), soot = new THREE.Color("#4e3930"), bedTint = new THREE.Color();
  const shelfPaint = of(1, (p, n) => bedTint.copy(sandFace).lerp(n.y > 0 ? sandTop : soot, Math.abs(n.y))
    .multiplyScalar(.96 + .14 * Math.sin(p.y * 17 - p.x * 1.7 + p.z)));
  stand(triangles(shelf, shelfPaint), fireX + 5.74, FIRE_S + 4.25);
  { const dx = 3.9, ds = 5.3;
    stand(campShelter(rand, small, bark, dryGrass, hide, stone), fireX + dx, FIRE_S + ds, Math.atan2(-dx, ds));
    blocks.push([fireX + dx + .4, FIRE_S + ds + .5, 1.7]); }
  { const parts: THREE.BufferGeometry[] = []; // the woodpile
    for (let i = 0; i < 12; i++) { const layer = i < 5 ? 0 : i < 9 ? 1 : 2, k = i - [0, 5, 9][layer]!, z = (k - [2, 1.5, 1][layer]!) * .17 + (rand() - .5) * .04, y = .07 + layer * .13, length = 1.2 + rand() * .5, skew = (rand() - .5) * .25;
      parts.push(cutLog(new THREE.Vector3(-length / 2, y, z - skew), new THREE.Vector3(length / 2, y + rand() * .04, z + skew), .06 + rand() * .025, .05 + rand() * .02, i % 4 ? dead : bark)); }
    for (let i = 0; i < 4; i++) parts.push(limb(new THREE.Vector3(-.5 + rand(), .05, .7 + i * .12), new THREE.Vector3(.4 + rand() * .9, .2 + rand() * .5, .55 + rand() * .5), .022, .008, dead, { sides: 4, sag: .2, rand }));
    stand(merged(parts), fireX - 1.5, FIRE_S + 2.7, .6); blocks.push([fireX - 1.5, FIRE_S + 2.7, .8]); }
  { const flint = of(1, flat("#3d3a39", rand, .3)), parts = [rock(rand, 1, stone).scale(.6, .26, .45)]; // the work stone, with the hand axes left on it
    for (const [x, z, turn] of [[-.2, .05, .4], [.12, -.1, 2], [.25, .16, 4.1]] as const) parts.push(blob(rand, [.055, .022, .085], flint, 0, .25).rotateY(turn).translate(x, .25, z));
    for (let i = 0; i < 14; i++) parts.push(blob(rand, [.02 + rand() * .02, .008, .03 + rand() * .02], flint, 0, .3).rotateY(rand() * 6).translate(-.9 + rand() * 1.8, .02, .5 + rand() * .7));
    stand(merged(parts), fireX + 3.6, FIRE_S - 2.3, .8, -.03); blocks.push([fireX + 3.6, FIRE_S - 2.3, .6]); }

  // ---------- the hearth ----------
  { const parts: THREE.BufferGeometry[] = [], fire = new THREE.Vector3(0, .35, 0);
    const ashPaint = of(3, lit("#37322c", "#70695b", rand, .24));
    parts.push(blob(rand, [.94, .035, .83], ashPaint, 2, .3, -.5).translate(0, -.015, 0));
    for (let i = 0; i < (small ? 12 : 24); i++) {
      const angle = rand() * Math.PI * 2, reach = .55 + rand() * .65, size = .025 + rand() * .045;
      parts.push(rock(rand, 0, of(1, flat(i % 3 ? "#272521" : "#898073", rand, .25))).scale(size * 1.7, size * .4, size).rotateY(rand() * Math.PI).translate(Math.cos(angle) * reach, .006, Math.sin(angle) * reach));
    }
    for (let i = 0; i < 11; i++) { const a = i * .571 + rand() * .1, r = 1.02 + rand() * .12; parts.push(scorch(rock(rand, 1, stone).scale(.2 + rand() * .09, .2 + rand() * .1, .2 + rand() * .09).rotateY(rand() * 6).translate(Math.cos(a) * r, -.07, Math.sin(a) * r), fire)); } // sooted on the side toward the fire
    stand(merged(parts), fireX, FIRE_S); }
  const hearth = new THREE.Group(); hearth.position.set(fireX, fireY, -FIRE_S); scene.add(hearth);
  const charred = of(2, lit("#0f0d0c", "#2a221d", rand)), logs: THREE.Mesh[] = [];
  for (let i = 0; i < 6; i++) {
    const a = i * 1.05 + .3, foot = new THREE.Vector3(Math.cos(a) * .74, .03, Math.sin(a) * .74), head = new THREE.Vector3(-Math.cos(a) * .12, .74 + rand() * .22, -Math.sin(a) * .12);
    const log = new THREE.Mesh(own(cutLog(foot, head, .085 + rand() * .03, .065, i < 2 ? charred : bark, i < 2)), matte); log.receiveShadow = true; hearth.add(log); logs.push(log);
  }
  const showLogs = (fed: number) => logs.forEach((log, i) => { log.visible = i < 2 + fed * 2; });
  const coalGlow = own(new THREE.MeshBasicMaterial({ vertexColors: true })), coals: THREE.BufferGeometry[] = [];
  const ash = new THREE.Color("#342c2a"), ember = new THREE.Color("#ff9950"), coalTint = new THREE.Color();
  for (let i = 0; i < 16; i++) {
    const a = rand() * 6.3, r = Math.sqrt(rand()) * .62;
    // Broken crust shields the top of each coal. The open seams below it glow hottest toward the centre.
    const crust = (p: THREE.Vector3, n: THREE.Vector3) => {
      const heat = (.35 + .65 * Math.abs(Math.sin(p.x * 6 + p.z * 4 + i))) * (1 - r * .7) * (1 - Math.max(0, n.y) * .65);
      return coalTint.copy(ash).lerp(ember, heat);
    };
    coals.push(rock(rand, 0, crust).scale(.1 + rand() * .07, .07, .1 + rand() * .07).translate(Math.cos(a) * r, .02, Math.sin(a) * r));
  }
  hearth.add(new THREE.Mesh(own(merged(coals)), coalGlow));

  const flameShape = own(merged([0, 1, 2].map((i) => {
    const tongue = new THREE.PlaneGeometry(1.55, 2.1, small ? 4 : 6, small ? 6 : 8).translate(0, 1.05, 0), p = tongue.attributes.position!;
    for (let k = 0; k < p.count; k++) {
      const x = p.getX(k), y = p.getY(k);
      p.setZ(k, Math.sin(y * 2.7 + x * 2.1 + i) * .14 * y);
    }
    return tongue.rotateY(i * Math.PI / 3);
  })));
  const flameTime = { value: 0 };
  function flame() {
    return new THREE.Mesh(flameShape, own(new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, forceSinglePass: true,
      uniforms: { time: flameTime, seed: { value: rand() * 9 } },
      vertexShader: "uniform float time, seed; varying vec2 vUv; void main(){ vUv = uv; vec3 p = position; float bend = uv.y * uv.y; p.x += sin(time * .83 + uv.y * 3.4 + seed) * bend * .12; p.z += cos(time * .67 + uv.y * 2.7 + seed) * bend * .09; gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.); }",
      fragmentShader: `uniform float time, seed; varying vec2 vUv;
        float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float grain(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
          return mix(mix(h(i),h(i+vec2(1.,0.)),f.x),mix(h(i+vec2(0.,1.)),h(i+vec2(1.)),f.x),f.y); }
        void main(){
          float y = vUv.y, t = time * .74 + seed;
          float eddy = grain(vec2(vUv.x*4.+seed, y*4.-t));
          float x = vUv.x-.5 - y*y*(.13+.23*sin(t*.8+y*3.)) - y*(eddy-.5)*.36;
          float mantle = 1.-smoothstep(.03, .38*pow(1.-y,.78)+.035, abs(x));
          float side = 1.-smoothstep(.014, .12*(1.-y)+.02, abs(x+.14+.045*sin(t+y*7.)));
          float heat = max(mantle*(1.-smoothstep(.54+.24*eddy,.99,y)), side*(1.-smoothstep(.22,.68+.13*eddy,y)));
          // Small pockets of clear air split the tips and reveal the charred wood behind them.
          float curl = grain(vec2(x * 14. + eddy * 1.7, y * 8. - t * 1.9));
          float holes = smoothstep(.23, .74, curl + .34 - y * .46);
          float density = smoothstep(.04,.78,heat) * smoothstep(.0,.07,y) * mix(1., holes, .28 + .72 * y);
          vec3 c = mix(vec3(1.2,.13,.012), vec3(2.4,.68,.08), smoothstep(.16,.68,heat));
          c = mix(c, vec3(2.8,1.85,.85), smoothstep(.54,.98,heat*(1.-y*.82)));
          gl_FragColor = vec4(c, density*.48); ${out} }`,
    })));
  }
  const fireFlame = flame(); hearth.add(fireFlame);
  const halo = new THREE.Sprite(own(new THREE.SpriteMaterial({ map: soft(own, "rgba(255,176,88,.72)", "rgba(237,103,40,.2)"), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: .3 }))); halo.position.y = .64; hearth.add(halo);
  const puffMap = soft(own, "rgba(255,255,255,.9)", "rgba(255,255,255,.4)"), smoke = Array.from({ length: still ? 0 : small ? 2 : 4 }, () => { const puff = new THREE.Sprite(own(new THREE.SpriteMaterial({ map: puffMap, color: "#665851", depthWrite: false, transparent: true, opacity: 0 }))); hearth.add(puff); return puff; });
  const fireLight = new THREE.PointLight(0xffa269, 1, 62, 2); fireLight.position.set(fireX, fireY + .75, -FIRE_S); scene.add(fireLight);
  if (!small) { fireLight.castShadow = true; fireLight.shadow.mapSize.set(512, 512); fireLight.shadow.radius = 4; fireLight.shadow.intensity = .82; fireLight.shadow.camera.near = .2; fireLight.shadow.camera.far = 60; fireLight.shadow.bias = -.004; fireLight.shadow.normalBias = .04; }
  const SPARKS = still ? 0 : small ? 8 : 18, sparkAt = new Float32Array(SPARKS * 3), sparkLife = Array.from({ length: SPARKS }, () => rand());
  const sparkGeometry = own(new THREE.BufferGeometry()), sparkMaterial = own(new THREE.PointsMaterial({ color: new THREE.Color(3, 1.5, .5), size: .035, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  sparkGeometry.setAttribute("position", new THREE.BufferAttribute(sparkAt, 3));
  const sparks = new THREE.Points(sparkGeometry, sparkMaterial); sparks.frustumCulled = false; sparks.visible = SPARKS > 0; hearth.add(sparks);

  // ---------- eyes at the edge of the light ----------
  const watchers: number[] = [];
  for (const [angle, reach] of [[2.5, 19], [3.2, 24], [3.9, 17], [4.6, 27], [1.7, 23], [5.3, 21]] as const) {
    const x = fireX + Math.cos(angle) * reach, s = FIRE_S + Math.sin(angle) * reach, y = floor(x, -s) + .5 + rand() * .25;
    watchers.push(x - Math.sin(angle) * .06, y, -s - Math.cos(angle) * .06, x + Math.sin(angle) * .06, y, -s + Math.cos(angle) * .06);
  }
  const eyeMaterial = own(new THREE.PointsMaterial({ color: new THREE.Color(1.6, 1.9, .8), size: .07, transparent: true, depthWrite: false, fog: false }));
  const eyes = new THREE.Points(own(new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(watchers, 3))), eyeMaterial); eyes.frustumCulled = false; scene.add(eyes);

  // ---------- the ochre rock shelter halfway through the night (s = 154): hand stencils and leaping game ----------
  const caveX = roadX(CAVE_S) - 5.0, caveTurn = Math.atan2(roadX(CAVE_S - 7) - caveX, 7);
  {
    const wall = new THREE.BoxGeometry(4.4, 3.1, 1.5, 12, 9, 4), wp = wall.attributes.position!;
    for (let i = 0; i < wp.count; i++) {
      const x = wp.getX(i), y = wp.getY(i), z = wp.getZ(i), front = z > .45 ? .28 : 1, arch = Math.max(0, (y + 1.55) / 3.1);
      const narrow = 1 - .24 * arch * arch - .08 * Math.sin(y * 2.7 + 1), crest = y > 1.1 ? -Math.abs(x) * .16 - Math.pow(Math.max(0, Math.abs(x) - 1.1), 2) * .28 : 0;
      wp.setXYZ(i, x * narrow + (noise(y * 1.6, z * 1.6) - .5) * .32, y + crest + (noise(x * 1.4, z * 1.4) - .5) * .22, z + (noise(x * 1.8 + 4, y * 1.8) - .5) * .22 * front + (y > .4 ? (y - .4) * .16 : 0));
    }
    stand(faceted(wall.translate(0, 1.35, 0), strata, 1), caveX, CAVE_S, caveTurn);
    stand(rock(rand, 2, strata).scale(2.6, 2.5, 2.2), caveX - 2.3, CAVE_S + 1.8, caveTurn + .7, -.3);
    stand(rock(rand, 1, strata).scale(1.8, 1.5, 1.7), caveX + 1.4, CAVE_S + 2.4, caveTurn - .5, -.2);
    stand(scree(rand, 5.4, stone, of(3, lit("#5e4d3a", "#9a8466", rand)), caveTurn), caveX, CAVE_S);
    blocks.push([caveX, CAVE_S, 2.5], [caveX - 2.3, CAVE_S + 1.8, 2.1], [caveX + 1.4, CAVE_S + 2.4, 1.5]);
    // Pigment blown and brushed onto the sheltered rock face: three ochre hand stencils, leaping ibex, mineral speckle, and tally marks.
    const art = document.createElement("canvas"); art.width = 1024; art.height = 640; const g = art.getContext("2d")!;
    g.scale(2, 2);
    // Faint mineralwash behind the composition so pigment embeds naturally into the limestone strata.
    const wash = g.createRadialGradient(256, 155, 24, 256, 155, 240);
    wash.addColorStop(0, "rgba(138, 68, 38, .12)"); wash.addColorStop(1, "rgba(40, 26, 18, 0)");
    g.fillStyle = wash; g.fillRect(0, 0, 512, 320);
    const hand = (cx: number, cy: number, tilt: number, scale: number) => {
      g.save(); g.translate(cx, cy); g.rotate(tilt); g.scale(scale, scale);
      const spray = g.createRadialGradient(0, -6, 12, 0, -6, 56);
      spray.addColorStop(0, "rgba(176, 66, 34, .78)"); spray.addColorStop(.52, "rgba(154, 52, 26, .46)"); spray.addColorStop(1, "rgba(154, 52, 26, 0)");
      g.fillStyle = spray; g.beginPath(); g.arc(0, -6, 56, 0, Math.PI * 2); g.fill();
      g.globalCompositeOperation = "destination-out"; g.fillStyle = "rgba(0,0,0,.88)";
      g.beginPath(); g.ellipse(0, 8, 13, 16, 0, 0, Math.PI * 2); g.fill();
      for (const [a, len, w, ox, oy] of [[-.68, 24, 3.5, -11, 2], [-.32, 32, 3.6, -7, -6], [-.04, 35, 3.7, -1, -8], [.24, 31, 3.5, 6, -6], [.54, 24, 3.2, 11, -2]] as const) {
        g.save(); g.translate(ox, oy); g.rotate(a); g.beginPath(); g.roundRect(-w, -len, w * 2, len + 4, w); g.fill(); g.restore();
      }
      g.restore();
    };
    hand(118, 148, -.16, .95); hand(192, 118, .12, 1.02); hand(154, 206, -.05, .74); // two adults and a smaller hand
    const beast = (cx: number, cy: number, scale: number, color: string) => {
      g.save(); g.translate(cx, cy); g.scale(scale, scale); g.strokeStyle = color; g.lineCap = "round"; g.lineJoin = "round";
      g.lineWidth = 5.5; g.beginPath(); g.moveTo(-28, 4); g.quadraticCurveTo(-4, -10, 24, -2); g.quadraticCurveTo(34, -4, 40, -16); g.stroke(); // back and neck
      g.lineWidth = 3.2; g.beginPath(); g.moveTo(39, -16); g.quadraticCurveTo(22, -42, -2, -36); g.moveTo(41, -15); g.quadraticCurveTo(28, -36, 8, -32); g.stroke(); // swept horns
      g.lineWidth = 3; g.beginPath(); g.moveTo(-24, 5); g.lineTo(-42, 26); g.moveTo(-18, 6); g.lineTo(-28, 28); g.moveTo(20, 0); g.lineTo(36, 22); g.moveTo(25, -1); g.lineTo(46, 16); g.stroke();
      g.restore();
    };
    beast(336, 152, 1.05, "rgba(168, 58, 28, .82)"); beast(418, 198, .78, "rgba(38, 28, 22, .76)"); beast(278, 194, .48, "rgba(146, 72, 38, .55)");
    g.fillStyle = "rgba(218, 196, 156, .62)"; for (let i = 0; i < 7; i++) { g.beginPath(); g.arc(285 + i * 14, 248 + (i % 2) * 2, 2.6, 0, Math.PI * 2); g.fill(); }
    for (let i = 0; i < 110; i++) { // fine mineral grain and charcoal dust
      g.fillStyle = i % 3 === 0 ? "rgba(36, 24, 18, .16)" : "rgba(176, 74, 38, .12)";
      g.fillRect(42 + rand() * 430, 56 + rand() * 212, 1 + rand() * 1.6, 1 + rand() * 1.6);
    }
    const map = own(new THREE.CanvasTexture(art)); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4;
    const panel = new THREE.Mesh(own(new THREE.PlaneGeometry(2.9, 1.8)), own(new THREE.MeshStandardMaterial({ map, transparent: true, roughness: .92, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 })));
    const offset = new THREE.Vector3(0, 1.52, .72).applyAxisAngle(new THREE.Vector3(0, 1, 0), caveTurn);
    panel.position.set(caveX + offset.x, floor(caveX, -CAVE_S) + offset.y, -CAVE_S + offset.z); panel.rotation.set(-.08, caveTurn, 0, "YXZ"); scene.add(panel);
    // A small ring of stones, dying embers and an ochre grinding bowl at the foot of the wall.
    const emberSpot = new THREE.Vector3(.4, 0, 1.55).applyAxisAngle(new THREE.Vector3(0, 1, 0), caveTurn), ex = caveX + emberSpot.x, es = CAVE_S - emberSpot.z;
    const ring: THREE.BufferGeometry[] = [blob(rand, [.16, .06, .14], of(1, flat("#8f3820", rand, .15)), 0, .2).translate(-.42, .03, .1)];
    for (let i = 0; i < 7; i++) { const a = i * .9; ring.push(scorch(rock(rand, 0, stone).scale(.13, .11, .13).translate(Math.cos(a) * .36, -.03, Math.sin(a) * .36), new THREE.Vector3(0, .15, 0), .8)); }
    stand(merged(ring), ex, es, caveTurn);
    const emberGlow = new THREE.Mesh(own(merged([0, 1, 2, 3, 4].map((k) => rock(rand, 0, flat("#ff7830", rand, .3)).scale(.07, .05, .07).translate(Math.cos(k * 1.25) * .14, floor(ex, -es) + .02, Math.sin(k * 1.25) * .14)))), coalGlow);
    emberGlow.position.set(ex, 0, -es); scene.add(emberGlow);
  }
  const caveSpot = new THREE.Vector3(.4, .45, 1.55).applyAxisAngle(new THREE.Vector3(0, 1, 0), caveTurn);
  const caveLight = new THREE.PointLight(0xff8438, 12, 19, 2); caveLight.position.set(caveX + caveSpot.x, floor(caveX, -CAVE_S) + caveSpot.y, -CAVE_S + caveSpot.z); scene.add(caveLight);

  /** One frame of the fire and everyone near it. Returns how brightly the fire burns, for whatever else it lights. */
  function frame(clock: number, dt: number, fed: number, feedGlow: number, walkerS: number = FIRE_S) {
    const flicker = still ? .95 : .94 + .045 * Math.sin(clock * 3.2) + .025 * Math.sin(clock * 6.3);
    const level = [.64, .98, 1.34, 1.68][fed]! * Math.min(1.3, feedGlow);
    const nearCave = Math.abs(walkerS - CAVE_S) < 95; caveLight.visible = nearCave; if (nearCave) caveLight.intensity = 13 * (.88 + .12 * flicker);
    const nearCamp = Math.abs(walkerS - FIRE_S) < 115;
    fireLight.visible = hearth.visible = nearCamp; eyes.visible = nearCamp && fed < 3;
    fireLight.castShadow = !small && Math.abs(walkerS - FIRE_S) < 42;
    // The village hearth uses the same shader and keeps burning after this camp is out of view.
    flameTime.value = still ? 0 : clock;
    if (!nearCamp) return { glow: 0, flicker };
    fireLight.intensity = level * 102 * flicker;
    const size = (1 + fed * .19) * Math.min(1.13, feedGlow);
    fireFlame.scale.set(size, size * (1 + (flicker - .94) * .22), size);
    halo.scale.set(4.8 * size, 3.5 * size, 1);
    coalGlow.color.setScalar((1.8 + fed * .3) * flicker);
    for (let i = 0; i < SPARKS; i++) {
      sparkLife[i] = (sparkLife[i]! + dt * (.2 + (i % 7) * .035)) % 1; const t = sparkLife[i]!, a = i * 2.4;
      sparkAt[i * 3] = Math.cos(a + t * 3) * (.12 + t * .7) + t * t * .9; sparkAt[i * 3 + 1] = .5 + t * (2.6 + fed * 1.1 + (i % 5) * .4); sparkAt[i * 3 + 2] = Math.sin(a + t * 2) * (.12 + t * .7);
    }
    sparkGeometry.attributes.position!.needsUpdate = true; sparkMaterial.opacity = .42 + fed * .11;
    smoke.forEach((puff, i) => { const t = (clock * .07 + i / smoke.length) % 1; puff.position.set(t * t * 2.6 + Math.sin(i * 2.4 + t * 4) * .3, 1.6 + t * 9, Math.cos(i * 1.7 + t * 3) * .3); puff.scale.setScalar(.9 + t * 4.2); puff.material.opacity = Math.sin(t * Math.PI) * .16; });
    if (!still) people.forEach((body, i) => { body.rotation.z = Math.sin(clock * .55 + i * 1.9) * .004; body.scale.y = body.scale.x * (1 + Math.sin(clock * 1.15 + i * 2.3) * .003); });
    eyeMaterial.opacity = Math.max(0, 1 - fed * .34) * .68;
    return { glow: level * flicker, flicker };
  }
  return { fireY, showLogs, flame, frame };
}
