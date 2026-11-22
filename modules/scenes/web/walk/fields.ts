import * as THREE from "three";
import type { Kit } from "./camp.ts";
import { BRIDGE, CANAL, CLEARINGS, MACHINES_S, MONO_S, clamp, fromCanal, mix, noise, roadX, smooth } from "./land.ts";
import { POSES, person } from "./people.ts";
import { blob, faceted, flat, limb, lit, merged, of, rock, triangles, turned, type Paint } from "./shapes.ts";
import type { Plant } from "./trees.ts";

type Profile = ReadonlyArray<readonly [across: number, lift: number, onGround: boolean]>;
/** A bird of one of three kinds: 0 wheels high over the open field, 1 small and far out over the village fields at dawn, 2 a swift skimming the wheat. */
interface Bird { kind: 0 | 1 | 2; r: number; h: number; speed: number; phase: number; beat: number; size: number }

/** The irrigation works, harvest and calendar, then the power and cooling infrastructure on the way to the stone. */
export function buildFields({ scene, own, rand, small, still, floor, matte, stand, blocks }: Kit, plant: Plant) {
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z), at = (off: number, s: number) => roadX(s) + off, tone = new THREE.Color(), other = new THREE.Color();
  const straw = of(3, lit("#8d7442", "#dcbd6a", rand, .24)), wood = of(2, lit("#4a3a2c", "#8c7558", rand)), bark = of(2, lit("#45372a", "#7a6450", rand)), stone = of(1, lit("#5a534b", "#8f8577", rand, .1));
  const clay = flat("#a5653f", rand, .2), flint = of(1, flat("#2e2b29", rand, .25)), cable = flat("#2a2b2d", rand, .05), lash = flat("#6b5a40", rand);
  const linen = ["#e0d6bd", "#d6cbb0", "#cfc2a2", "#ddd2b6"], skins = ["#a87556", "#9c6b4d", "#b5845f", "#a2704f"];
  // dry earth near the colour of the tilled soil around it, broken face by face, with muted olive where grass has taken hold; the clumps carry the green
  const sod = of(3, (center, normal) => (normal.y > .4 && noise(center.x * 1.3, center.z * 1.3) + rand() * .35 > .8 ? tone.set("#6f7343").lerp(other.set("#8a8452"), rand()) : tone.set("#55432e").lerp(other.set("#7a6748"), clamp(normal.y, 0, 1) * .6 + rand() * .4)).multiplyScalar(.9 + rand() * .16));
  const { water, waterSun, waterTime } = openWater(own), placed: THREE.BufferGeometry[] = [], wet: number[] = [], stems: number[] = [];
  /** Turns a point of a shape stood at (x, s) into the world, the way `stand` moves the shape. */
  const world = (local: THREE.Vector3, x: number, s: number, turn: number, lift = 0) => local.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), turn).add(V(x, floor(x, -s) + lift, -s));
  const facing = (x: number, s: number, toX: number, toS: number) => Math.atan2(toX - x, s - toS); // the turn that points a shape's +z at a spot
  const pot = () => turned([[0, 0], [.15, 0], [.3, .13], [.37, .32], [.33, .5], [.2, .62], [.17, .7], [.22, .76]], 9, clay);

  /** Triangles laid along a path of (x, s): a profile point sits `lift` above the ground there, or above the water level when it is not `onGround`. Stretches `keep` turns down are left out, and each run is closed at its ends. */
  function sweep(path: Array<[number, number]>, level: number[], profile: (i: number) => Profile, keep: (x: number, s: number) => boolean = () => true) {
    const sections = path.map(([x, s], i) => {
      const [ax, as] = path[Math.max(0, i - 1)]!, [bx, bs] = path[Math.min(path.length - 1, i + 1)]!, l = Math.hypot(bx - ax, bs - as), nx = (bs - as) / l, ns = (ax - bx) / l;
      return profile(i).map(([across, lift, onGround]) => { const px = x + nx * across, ps = s + ns * across; return V(px, (onGround ? floor(px, -ps) : level[i]!) + lift, -ps); });
    });
    const out: number[] = [], push = (...points: THREE.Vector3[]) => { for (const p of points) out.push(p.x, p.y, p.z); };
    const cap = (section: THREE.Vector3[]) => { for (let k = 1; k < section.length - 1; k++) push(section[0]!, section[k]!, section[k + 1]!); };
    let open = false;
    for (let i = 0; i < path.length - 1; i++) {
      const a = sections[i]!, b = sections[i + 1]!, on = keep((path[i]![0] + path[i + 1]![0]) / 2, (path[i]![1] + path[i + 1]![1]) / 2);
      if (on !== open) cap(a); open = on; if (!on) continue;
      for (let k = 0; k < a.length - 1; k++) push(a[k]!, a[k + 1]!, b[k + 1]!, a[k]!, b[k + 1]!, b[k]!);
    }
    if (open) cap(sections[path.length - 1]!);
    return out;
  }
  const mirror = (profile: Profile): Profile => profile.map(([across, lift, onGround]) => [-across, lift, onGround] as const);
  /** A clump of reeds or grass: thin leaning blades, some of the reeds carrying a dark seed head. */
  const seedHead = of(3, flat("#3b2a1c", rand, .15));
  function clump(x: number, s: number, count: number, tall: number, seeds: boolean) {
    const y = floor(x, -s) - .02;
    for (let k = 0; k < count; k++) {
      const a = rand() * 6.283, r = rand() * .25, bx = x + Math.cos(a) * r, bz = -s + Math.sin(a) * r, h = tall * (.55 + rand() * .5), lean = h * (k % 3 ? .08 + rand() * .1 : .3 + rand() * .2), la = rand() * 6.283, w = .012 + rand() * .012;
      const tx = bx + Math.cos(la) * lean, tz = bz + Math.sin(la) * lean, c = Math.cos(a) * w, n = Math.sin(a) * w;
      stems.push(bx - n, y, bz + c, bx + n, y, bz - c, tx, y + h, tz);
      if (seeds && k % 3 === 1) placed.push(limb(V(mix(bx, tx, .74), y + h * .74, mix(bz, tz, .74)), V(mix(bx, tx, .9), y + h * .9, mix(bz, tz, .9)), .026, .02, seedHead, { sides: 4, capped: true }));
    }
  }

  // ---------- the pond: dug, not built up; the ground that stands higher makes its own shore ----------
  const [pondS, pondOff] = CLEARINGS.pond, pondX = at(pondOff, pondS);
  const shore = (a: number) => 3.3 * (.74 + .5 * noise(Math.cos(a) * 1.8 + 5, Math.sin(a) * 1.8 + 2) + .14 * Math.cos(2 * a + .8) + .1 * Math.cos(3 * a + 2));
  const toPond = (x: number, s: number) => Math.hypot(x - pondX, s - pondS) / shore(Math.atan2(s - pondS, x - pondX)); // under 1 inside the outline
  let ground = 0; for (let i = 0; i < 40; i++) { const a = i * 2.4, r = Math.sqrt(i / 40) * shore(a); ground += floor(pondX + Math.cos(a) * r, -pondS - Math.sin(a) * r); }
  const pondLevel = ground / 40 + .04, SECTORS = 28, RINGS = 4;
  const ring = (k: number, j: number): [number, number] => { const a = k / SECTORS * Math.PI * 2, r = shore(a) * (j < RINGS ? j / RINGS : 1.08); return [pondX + Math.cos(a) * r, pondS + Math.sin(a) * r]; };
  for (let j = 0; j < RINGS; j++) for (let k = 0; k < SECTORS; k++) {
    const corners = [ring(k, j), ring(k + 1, j), ring(k + 1, j + 1), ring(k, j + 1)];
    for (const i of j ? [0, 1, 2, 0, 2, 3] : [0, 2, 3]) wet.push(corners[i]![0], pondLevel, -corners[i]![1]);
  }
  const pondVerts = wet.length / 3;
  const lip = Array.from({ length: SECTORS * 2 + 1 }, (_, k): [number, number] => { const a = k / SECTORS / 2 * Math.PI * 2, r = shore(a); return [pondX + Math.cos(a) * r, pondS + Math.sin(a) * r]; });
  const lumpy = (i: number, k: number) => noise(i * .7 + k * 3.1, k * 1.7); // the bank rises and settles unevenly all the way round
  placed.push(triangles(sweep(lip, lip.map(() => pondLevel), (i) => [[-.5, -.06, false], [.15, .03 + .03 * lumpy(i, 1), false], [.55, .01 + .04 * lumpy(i, 2), true], [1, .04 * lumpy(i, 3), true], [1.45, .03 * lumpy(i, 4), true], [1.9, -.02, true]], (x, s) => fromCanal(x, s) > 1.5), sod));
  const outletAngle = Math.atan2(CANAL.from - pondS, at(CANAL.offset, CANAL.from) - pondX);
  for (let k = 0; k < 18; k++) { // reeds around most of the shore, none where the shaduf stands or the canal leaves
    const a = k / 18 * Math.PI * 2 + rand() * .25;
    if (Math.abs(a - Math.PI / 2) < .5 || Math.abs(a - outletAngle) < .35) continue;
    const r = shore(a) * (.94 + rand() * .16); clump(pondX + Math.cos(a) * r, pondS + Math.sin(a) * r, 8 + Math.floor(rand() * 6), 1.2 + rand() * .5, true);
  }
  for (const a of [3.4, 4.3, 5.6, .3, 2.5]) { const r = shore(a) * 1.02, size = .25 + rand() * .2; stand(rock(rand, 1, stone).scale(size * 1.3, size, size), pondX + Math.cos(a) * r, pondS + Math.sin(a) * r, rand() * 6.3, -size * .55); } // half sunk

  // ---------- the canal and the channels it lets into the wheat ----------
  const stream: Array<[number, number]> = [], exitX = at(CANAL.offset, CANAL.from);
  for (let k = 0; k < 9; k++) stream.push([mix(pondX, exitX, k / 9), mix(pondS, CANAL.from, k / 9)]);
  const first = stream.length; for (let s = CANAL.from; s <= CANAL.to; s += .9) stream.push([at(CANAL.offset, s), s]);
  const inPond = (x: number, s: number) => toPond(x, s) < 1.05;
  const bed = stream.map(([x, s]) => inPond(x, s) ? pondLevel : Math.max(floor(x - .6, -s), floor(x, -s), floor(x + .6, -s)) + .05);
  const level = stream.map(([x, s], i) => inPond(x, s) ? pondLevel : Math.max(bed[i - 1] ?? -Infinity, bed[i]!, bed[i + 1] ?? -Infinity)); // no step down where the ground dips for a sample
  const bank = (seed: number) => (i: number): Profile => { const h = .7 + .6 * noise(stream[i]![1] * .35, seed); return [[.5, -.05, false], [.66, .1 * h, false], [.92, .11 * h, false], [1.15, .03 * noise(i * .9, seed + 4), true], [1.4, -.03, true]]; }; // low, and uneven along its length
  wet.push(...sweep(stream, level, () => [[-.7, 0, false], [0, 0, false], [.7, 0, false]]));
  placed.push(triangles(sweep(stream, level, bank(3), (x, s) => !inPond(x, s)), sod));
  placed.push(triangles(sweep(stream, level, (i) => mirror(bank(8)(i)), (x, s) => !inPond(x, s) && !CANAL.channels.some(([from]) => s > from - .5 && s < from + 1)), sod)); // the left bank opens where a channel leaves
  for (const [from, to, end] of CANAL.channels) {
    const path = Array.from({ length: 12 }, (_, k): [number, number] => { const s = mix(from, to, k / 11); return [at(mix(CANAL.offset, end, k / 11), s), s]; });
    const start = level[first + Math.round((from - CANAL.from) / .9)]!, low = path.map(([x, s], k) => k < 2 ? start : Math.max(floor(x, -s - .3), floor(x, -s), floor(x, -s + .3)) + .04);
    const ditch: Profile = [[.2, -.04, false], [.3, .07, false], [.55, -.03, true]], outside = (x: number, s: number) => fromCanal(x, s) > 1.4;
    wet.push(...sweep(path, low, () => [[-.24, 0, false], [.24, 0, false]]));
    placed.push(triangles(sweep(path, low, () => ditch, outside), sod), triangles(sweep(path, low, () => mirror(ditch), outside), sod));
  }
  for (let k = 0; k < 30; k++) { // reeds and grass on the banks, here and there
    const s = CANAL.from + 2 + rand() * (CANAL.to - CANAL.from - 4), side = rand() < .5 ? -1 : 1;
    if (Math.abs(s - BRIDGE.s) < 2.5 || CANAL.channels.some(([from]) => Math.abs(s - from) < 1.5)) continue;
    clump(at(CANAL.offset + side * (.75 + rand() * .3), s), s, k % 2 ? 10 : 7, k % 2 ? .45 : 1.1 + rand() * .4, k % 2 === 0);
  }
  // the water: deeper in the middle, paler at the edges, around white so the sky can tint it
  const shade = new Float32Array(wet.length);
  for (let i = 0; i < wet.length; i += 3) {
    const x = wet[i]!, s = -wet[i + 2]!, from = fromCanal(x, s), depth = i < pondVerts * 3 ? 1 - clamp(toPond(x, s), 0, 1) : from < 1 ? clamp(1 - from / .7, 0, 1) * .85 : .35, c = mix(1.14, .74, depth) * (.96 + rand() * .08);
    shade.set([c * .97, c, c * 1.03], i);
  }
  const calm = shade.slice(0, pondVerts * 3), wave = new THREE.BufferAttribute(shade, 3), reach = Float32Array.from({ length: pondVerts }, (_, v) => Math.hypot(wet[v * 3]! - pondX - .8, wet[v * 3 + 2]! + pondS - .5)); // rings spread from a little off the middle
  scene.add(new THREE.Mesh(own(new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(wet, 3)).setAttribute("color", wave)), water));
  const GLINTS = 24, sparkle = new Float32Array(GLINTS * 3), sparkleTone = new Float32Array(GLINTS * 3), glintShape = own(new THREE.BufferGeometry());
  const glints = Array.from({ length: GLINTS }, () => ({ along: rand(), across: (rand() - .5) * .9, speed: .005 + rand() * .004, blink: .2 + rand() * .3, phase: rand() }));
  glintShape.setAttribute("position", new THREE.BufferAttribute(sparkle, 3)); glintShape.setAttribute("color", new THREE.BufferAttribute(sparkleTone, 3));
  const shine = new THREE.Points(glintShape, own(new THREE.PointsMaterial({ size: .12, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }))); shine.frustumCulled = false; scene.add(shine);
  /** Sun glints drifting downstream, each flaring and fading on its own beat. */
  function glide(clock: number) {
    for (let g = 0; g < GLINTS; g++) {
      const glint = glints[g]!, u = (glint.along + clock * glint.speed) % 1, s = mix(CANAL.from, CANAL.to, u), i = Math.min(level.length - 1, first + Math.round((s - CANAL.from) / .9));
      sparkle[g * 3] = at(CANAL.offset, s) + glint.across; sparkle[g * 3 + 1] = level[i]! + .015; sparkle[g * 3 + 2] = -s;
      sparkleTone.fill(Math.pow(Math.max(0, Math.sin((glint.phase + clock * glint.blink) * Math.PI * 2)), 6) * Math.sin(u * Math.PI) * 1.5, g * 3, g * 3 + 3);
    }
    glintShape.attributes.position!.needsUpdate = glintShape.attributes.color!.needsUpdate = true;
  }
  /** Slow rings spreading over the pond, drawn as light and shade on its water. */
  function ripple(clock: number) {
    for (let v = 0; v < pondVerts; v++) { const k = 1 + .07 * Math.sin(reach[v]! * 4.2 - clock * 1.3); shade[v * 3] = calm[v * 3]! * k; shade[v * 3 + 1] = calm[v * 3 + 1]! * k; shade[v * 3 + 2] = calm[v * 3 + 2]! * k; }
    wave.needsUpdate = true;
  }
  glide(0);

  // ---------- the shaduf on the far shore, side-on to the road: an upright, a rocking beam with a stone lashed on, a pot on a rope ----------
  let beam: THREE.Mesh, bucket: THREE.Mesh, puller: THREE.Mesh, pullerY = 0;
  const LONG = 3.3;
  { const x = pondX, s = pondS + shore(Math.PI / 2) - .45 + LONG, turn = facing(x, s, pondX, pondS), wl = pondLevel - floor(x, -s), rope = 1.33 - wl;
    stand(merged([limb(V(0, -.3, 0), V(0, 2.25, 0), .1, .085, wood, { sides: 6 }), ...[-1, 1].map((side) => limb(V(0, 2.12, 0), V(side * .17, 2.66, 0), .055, .045, wood, { sides: 5, capped: true })),
      limb(V(-.24, 2.5, 0), V(.24, 2.5, 0), .03, .03, wood, { sides: 4, capped: true })]), x, s, turn);
    const pivot = new THREE.Group(); pivot.position.copy(world(V(0, 2.5, 0), x, s, turn)); pivot.rotation.y = turn; scene.add(pivot);
    beam = new THREE.Mesh(own(merged([limb(V(0, 0, -1.6), V(0, 0, LONG), .08, .055, wood, { sides: 5, capped: true }), rock(rand, 1, stone).scale(.3, .34, .28).translate(0, -.5, -1.5),
      ...[-1.38, -1.62].map((z) => faceted(new THREE.TorusGeometry(.27, .016, 3, 8), lash).translate(0, -.2, z))])), matte);
    bucket = new THREE.Mesh(own(merged([limb(V(0, 0, 0), V(0, -rope, 0), .013, .013, lash, { sides: 3 }), pot().scale(.55, .55, .55).translate(0, -rope - .42, 0)])), matte);
    beam.castShadow = bucket.castShadow = true; pivot.add(beam, bucket); blocks.push([x, s, .35]);
    const spot = world(V(-.3, 0, LONG - .42), x, s, turn), ps = -spot.z, lift = Math.max(0, pondLevel + .04 - floor(spot.x, spot.z)); // the one working it stands on the shore beside the rope
    pullerY = floor(spot.x, spot.z) + lift - .01;
    puller = new THREE.Mesh(own(person(rand, POSES.pull, { cloth: linen[0], skin: skins[0], dress: "tunic", small }).rotateY(.3)), matte);
    puller.position.set(spot.x, pullerY, spot.z); puller.rotation.set(0, turn, 0, "YXZ"); puller.castShadow = puller.receiveShadow = true; scene.add(puller);
    blocks.push([spot.x, ps, .4]);
  }
  /** The beam tilted by `angle` (long arm down), the rope hanging straight from its tip, and the worker hauling in time with it. */
  const swing = (angle: number) => {
    beam.rotation.x = angle; bucket.position.set(0, -LONG * Math.sin(angle), LONG * Math.cos(angle));
    puller.rotation.x = (angle - .1) * .78; puller.position.y = pullerY - Math.max(0, angle) * .22;
  };
  swing(-.02);
  { // a plank bridge over the canal into the harvest, someone crossing it toward the road with a sheaf
    const i = first + Math.round((BRIDGE.s - CANAL.from) / .9), [x, s] = stream[i]!, plank = of(2, lit("#6a5640", "#a88f6c", rand)), parts = [-.36, .36].map((z) => limb(V(-1.75, .2, z), V(1.75, .22, z), .07, .065, wood, { capped: true }));
    for (let k = 0; k < 10; k++) parts.push(faceted(new THREE.BoxGeometry(.3, .05, .95 + rand() * .1), plank).rotateY((rand() - .5) * .06).translate(-1.5 + k * .335, .3, (rand() - .5) * .06));
    stand(merged(parts), x, s, 0, level[i]! - floor(x, -s));
    stand(person(rand, POSES.carry, { cloth: linen[1], skin: skins[2], dress: "tunic", small, extra: [sheaf().rotateZ(Math.PI / 2).translate(.5, 1.84, 0)] }), x + .5, s + .1, Math.PI / 2, level[i]! + .33 - floor(x + .5, -s - .1)); blocks.push([x + .5, s + .1, .4]);
  }

  // ---------- the harvest: stubble, reapers bent over the standing wheat, sheaves stood in stooks ----------
  function sheaf() {
    const tied = of(3, (center, normal) => straw(center, normal, 0).multiplyScalar(center.y > .4 && center.y < .5 ? .55 : 1)); // the band of twisted straw that ties it
    return merged([turned([[.02, 0], [.11, .02], [.085, .3], [.075, .45], [.1, .62], [.15, .8], [.12, .92], [.03, 1]], 7, tied), blob(rand, [.14, .1, .14], straw, 0, .5).translate(0, .95, 0)]);
  }
  const stook = () => merged(Array.from({ length: 6 }, (_, k) => { const a = k / 6 * Math.PI * 2 + rand() * .3; return sheaf().scale(1, .9 + rand() * .2, 1).rotateX(.22 + rand() * .08).rotateY(Math.atan2(-Math.cos(a), -Math.sin(a))).translate(Math.cos(a) * .24, 0, Math.sin(a) * .24); }));
  const [cutS, cutOff, cutR] = CLEARINGS.reaped, cutX = at(cutOff, cutS), edge = (a: number) => cutR * (.86 + noise(Math.cos(a) * 1.5 + 3, Math.sin(a) * 1.5) * .13);
  const inField = (x: number, s: number, room: number) => Math.hypot(x - cutX, s - cutS) < edge(Math.atan2(s - cutS, x - cutX)) - room && fromCanal(x, s) > 1.5 + room;
  { const sectors = 22, rings = 6, cover: number[] = [], stalks: number[] = [];
    const point = (ring: number, k: number) => { const a = k / sectors * Math.PI * 2, r = edge(a) * ring / rings, s = cutS + Math.sin(a) * r, x = Math.min(cutX + Math.cos(a) * r, at(CANAL.offset - 1.5, s)); return [x, floor(x, -s) + .04, -s]; };
    for (let ring = 0; ring < rings; ring++) for (let k = 0; k < sectors; k++) {
      const a = point(ring, k), b = point(ring, k + 1), c = point(ring + 1, k + 1), d = point(ring + 1, k);
      cover.push(...a, ...d, ...c); if (ring) cover.push(...a, ...c, ...b);
    }
    for (let s = cutS - cutR; s < cutS + cutR; s += small ? .5 : .3) for (let row = -30; row < 0; row++) { // the stubble keeps the rows it was sown in
      const x = roadX(s) + row * .92 + (rand() - .5) * .2; if (!inField(x, s, .1)) continue;
      const y = floor(x, -s), turn = rand() * 3.1, height = .1 + rand() * .1, c = Math.cos(turn) * .035, w = Math.sin(turn) * .035;
      stalks.push(x - c, y, -s - w, x + c, y, -s + w, x + (rand() - .5) * .06, y + height, -s + (rand() - .5) * .06);
    }
    placed.push(triangles(cover, of(3, flat("#a48a52", rand, .2))), triangles(stalks, of(3, lit("#8a7444", "#d8bb70", rand, .2))));
  }
  // one reaper close to the canal cutting ahead, two further in facing the far edge, so the walker sees their backs
  for (const [i, a, ahead] of [[0, 1.05, true], [1, 2.75, false], [2, 3.55, false]] as const) {
    const r = cutR - .55, x = cutX + Math.cos(a) * r, s = cutS + Math.sin(a) * r, pose = POSES.bend, hand = V(...pose.hands[1]), grip = hand.clone().add(V(0, -.03, .1)), held = V(...pose.hands[0]);
    const tools = [limb(hand.clone().add(V(0, .03, -.07)), grip, .022, .02, wood, { sides: 4 })];
    for (let k = 0; k < 4; k++) { const arc = (n: number) => grip.clone().add(V(.15 - Math.cos(n * .62) * .15, -n * .012, Math.sin(n * .62) * .15)); tools.push(limb(arc(k), arc(k + 1), .016 - k * .002, .014 - k * .002, flint, { sides: 3 })); }
    for (let k = 0; k < 5; k++) tools.push(limb(held.clone().add(V(0, -.12, 0)), held.clone().add(V((rand() - .5) * .14, .3 + rand() * .1, .1 + rand() * .08)), .008, .006, straw, { sides: 3 })); // a fistful of cut stalks
    stand(person(rand, pose, { extra: tools, cloth: linen[i + 1], skin: skins[i + 1], dress: "tunic", hat: "straw", small }), x, s, ahead ? facing(x, s, x, s + 10) : facing(x, s, cutX + Math.cos(a) * 30, cutS + Math.sin(a) * 30)); blocks.push([x, s, .45]);
    for (let k = 0; k < 2; k++) { const back = r - 1 - rand() * 1.4, b = a + (rand() - .5) * .3, bx = cutX + Math.cos(b) * back, bs = cutS + Math.sin(b) * back; if (inField(bx, bs, 0)) stand(sheaf().rotateZ(Math.PI / 2).translate(.5, .09, 0), bx, bs, rand() * 6.3); } // bundles left where they fell
  }
  for (const [across, alongs] of [[-9.3, [-5.6, -3.4, 1.5, 3.8]], [-13.2, [-6.5, -3, 3.5, 6.8]], [-16.6, [-5.5, -1.6, 2.6]]] as const) for (const along of alongs) {
    const s = cutS + along + (rand() - .5) * .5, x = at(across, s) + (rand() - .5) * .5;
    if (!inField(x, s, .9)) continue;
    stand(stook(), x, s, rand() * 6.3); blocks.push([x, s, .45]);
  }
  { const wicker: Paint = (center) => tone.set((Math.floor(center.y * 14) + Math.floor(Math.atan2(center.z, center.x) * 5)) % 2 ? "#8a6a3c" : "#5f4827"); // a water jar and a basket by the bridge
    stand(turned([[0, 0], [.12, 0], [.2, .12], [.22, .3], [.16, .48], [.09, .56], [.1, .62]], 9, clay), at(-7.6, BRIDGE.s - 2.2), BRIDGE.s - 2.2, 0, -.02);
    stand(turned([[0, 0], [.2, 0], [.27, .12], [.3, .26], [.32, .3]], 12, wicker), at(-7.9, BRIDGE.s + 2.4), BRIDGE.s + 2.4, 0, -.02);
  }

  // ---------- the calendar: a ring of heavy stones, a pole whose shadow is marked, someone reading the sky ----------
  { const [s0, off, r] = CLEARINGS.calendar, x0 = at(off, s0);
    const weathered = of(1, (center, normal) => stone(center, normal, 0).multiplyScalar(normal.y > .5 ? 1.12 : 1)); // tops a little paler; the lichen is in the shader
    for (let k = 0; k < 8; k++) {
      const a = k / 8 * Math.PI * 2 + (rand() - .5) * .14, out = r - 1.3 + (rand() - .5) * .3, x = x0 + Math.cos(a) * out, s = s0 + Math.sin(a) * out, wide = .5 + rand() * .3, tall = 1.3 + rand() * .6;
      const shape = k === 5 ? rock(rand, 1, weathered).scale(.85, .38, .34) : rock(rand, 1, weathered).scale(wide / 1.9, tall / 1.45, wide / 2.6); // one has fallen
      if (k === 2) shape.rotateZ(.32); // one leans
      stand(shape, x, s, facing(x, s, x0, s0) + (k === 5 ? 1.2 : 0), k === 5 ? -.1 : -.12); blocks.push([x, s, .5]);
    }
    stand(merged([limb(V(0, -.3, 0), V(.02, 3.1, 0), .08, .06, wood, { sides: 6, capped: true }), ...Array.from({ length: 6 }, (_, k) => rock(rand, 0, stone).scale(.16, .14, .16).translate(Math.cos(k) * .24, -.03, Math.sin(k) * .24))]), x0, s0); blocks.push([x0, s0, .35]);
    for (let k = 0; k < 7; k++) { const d = .8 + k * .45, size = k === 6 ? .2 : .11; stand(rock(rand, 0, stone).scale(size, size * .7, size), x0 + d * .15, s0 - d * .99, rand() * 6.3, -.02); } // where the noon shadow falls, back toward the walker
    const x = x0 - 1.2, s = s0 - .7; stand(person(rand, POSES.point, { cloth: linen[3], skin: skins[1], dress: "tunic", small }), x, s, facing(x, s, x - .6, s + .8)); blocks.push([x, s, .4]);
  }

  // ---------- time passing: each machine its own mesh, revealed when the walker reaches its period ----------
  const eras: Array<{ mesh: THREE.Mesh; from: number; to: number }> = [];
  /** Shapes gathered in world space, drawn as one mesh that rises from `base` as the walk goes from `from` to `to`. */
  function era(parts: THREE.BufferGeometry[], base: number, from: number, to: number) {
    const mesh = new THREE.Mesh(own(merged(parts).translate(0, -base, 0)), matte); mesh.position.y = base; mesh.castShadow = mesh.receiveShadow = true; mesh.visible = false;
    scene.add(mesh); eras.push({ mesh, from, to }); return mesh;
  }
  const put = (list: THREE.BufferGeometry[], shape: THREE.BufferGeometry, x: number, s: number, turn = 0, lift = 0) => list.push(shape.rotateY(turn).translate(x, floor(x, -s) + lift, -s));
  /** A point `t` of the way along a wire hung between two points, sagging in the middle; and the wire itself. */
  const sagging = (a: THREE.Vector3, b: THREE.Vector3, sag: number, t: number) => a.clone().lerp(b, t).add(V(0, -sag * 4 * t * (1 - t), 0));
  const wire = (a: THREE.Vector3, b: THREE.Vector3, sag: number, radius: number) => faceted(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(Array.from({ length: 9 }, (_, k) => sagging(a, b, sag, k / 8))), 12, radius, 3), cable);

  { const rag = flat("#5d6a7a", rand, .2), parts = [limb(V(0, -.3, 0), V(0, 2.25, 0), .05, .04, wood), limb(V(-.75, 1.66, 0), V(.75, 1.69, 0), .035, .03, wood, { capped: true }), blob(rand, [.17, .2, .16], flat("#a38d63", rand), 1, .2).translate(0, 2.05, 0)];
    parts.push(turned([[0, 0], [.36, 0], [.36, .03], [.16, .05], [.15, .22], [0, .25]], 9, flat("#4f412d", rand)).rotateZ(.12).translate(0, 2.17, 0));
    for (const z of [.07, -.07]) { // a coat hung on the cross, torn at the hem and the sleeves
      const coat: number[] = []; for (let k = 0; k < 6; k++) { const x0 = -.42 + k * .14, x1 = x0 + .14, h0 = .95 + rand() * .2, h1 = .95 + rand() * .2; coat.push(x0, 1.7, z, x0, h0, z, x1, h1, z, x0, 1.7, z, x1, h1, z, x1, 1.7, z); }
      for (const side of [-1, 1]) for (let k = 0; k < 3; k++) { const x0 = side * (.42 + k * .1), x1 = x0 + side * .1, h = 1.32 + rand() * .15; coat.push(x0, 1.72, z, x0, h, z, x1, h + .06, z, x0, 1.72, z, x1, h + .06, z, x1, 1.72, z); }
      parts.push(triangles(coat, rag));
    }
    const s = 395, x = at(7, s); stand(merged(parts), x, s, facing(x, s, roadX(s), s)); blocks.push([x, s, .35]);
  }
  let sails: THREE.Mesh, rotor: THREE.Mesh;
  { const [s, off, r] = CLEARINGS.mill, x = at(off, s), turn = facing(x, s, roadX(s - 10), s - 10), mill = of(1, lit("#6f675a", "#c2b7a0", rand)), dark = flat("#14100c", rand, .1);
    const radius = (y: number) => 2.6 - (y + .3) / 9 * .7, onWall = (u: number, y: number) => Math.sqrt(radius(y) ** 2 - u * u) + .03;
    const wall = new THREE.CylinderGeometry(1.9, 2.6, 9, 16, 6, true), p = wall.attributes.position!;
    for (let i = 0; i < p.count; i++) { const k = 1 + (noise(p.getX(i) * 1.6 + p.getY(i), p.getZ(i) * 1.6) - .5) * .05; p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); }
    const quad = (x0: number, x1: number, y0: number, y1: number) => [x0, y0, onWall(x0, y0), x1, y0, onWall(x1, y0), x1, y1, onWall(x1, y1), x0, y0, onWall(x0, y0), x1, y1, onWall(x1, y1), x0, y1, onWall(x0, y1)];
    const list: THREE.BufferGeometry[] = [], base = floor(x, -s) - .2;
    put(list, merged([
      faceted(wall.translate(0, 4.2, 0), (center, normal) => mill(center, normal, 0).multiplyScalar(.93 + .07 * Math.sin(center.y * 6.5)), 1),
      turned([[2.15, 0], [2.2, .35], [1.85, 1.3], [1, 2.1], [0, 2.45]], 14, of(3, lit("#3c2f24", "#6d5640", rand))).translate(0, 8.6, 0),
      triangles(quad(-.5, .5, -.3, 2), flat("#3b2a1d", rand, .1)), triangles([...quad(-.2, .2, 4.1, 4.7), ...quad(.25, .6, 6.4, 6.9)], dark),
      limb(V(0, 9.3, 1.2), V(0, 9.3, 2.55), .14, .12, wood, { sides: 6, capped: true }),
    ]), x, s, turn, -.2);
    const tower = era(list, base, MACHINES_S, 452); blocks.push([x, s, r * .48]);
    const lattice = of(2, lit("#6b5a46", "#b7a283", rand)), canvas = of(6, lit("#9b927f", "#d1c7ad", rand, .12)), arms: THREE.BufferGeometry[] = [];
    for (let k = 0; k < 4; k++) {
      const a = k * Math.PI / 2 + .3, d = V(Math.cos(a), Math.sin(a), 0), q = V(-Math.sin(a), Math.cos(a), 0), along = (n: number, wide: number) => d.clone().multiplyScalar(n).addScaledVector(q, wide);
      arms.push(limb(V(0, 0, 0), along(6.6, 0), .11, .06, lattice, { sides: 4 }), limb(along(1.5, .85), along(6.4, .8), .04, .035, lattice, { sides: 3 }), limb(along(1.5, -.15), along(6.4, -.15), .035, .03, lattice, { sides: 3 }));
      for (let n = 0; n < 9; n++) arms.push(limb(along(1.5 + n * .61, -.15), along(1.5 + n * .61, .84), .028, .028, lattice, { sides: 3 }));
      const cloth: number[] = [], foot = (span: number, width: number) => along(2.1 + span * 4.1, -.08 + width * .83)
        .add(V(0, 0, .045 + Math.sin(span * Math.PI) * Math.sin(width * Math.PI) * .105));
      for (let row = 0; row < 6; row++) for (let col = 0; col < 2; col++) {
        const p = foot(row / 6, col / 2), q = foot((row + 1) / 6, col / 2), r = foot((row + 1) / 6, (col + 1) / 2), s = foot(row / 6, (col + 1) / 2);
        for (const point of [p, q, r, p, r, s]) cloth.push(point.x, point.y, point.z);
      }
      arms.push(triangles(cloth, canvas));
      for (const width of [0, 1]) arms.push(limb(foot(0, width), foot(1, width), .009, .009, lash, { sides: 3 }));
    }
    const hub = new THREE.Group(); hub.position.copy(world(V(0, 9.3, 2.6), x, s, turn, -.2)).y -= base; hub.rotation.y = turn; tower.add(hub);
    sails = new THREE.Mesh(own(merged(arms)), matte); sails.castShadow = true; hub.add(sails);
  }
  { const poles = [511, 526, 539].map((s) => [at(-18, s), s] as const), arm = [-.6, -.2, .2, .6].map((x) => V(x, 5.78, 0)), insulator = flat("#cfd6cf", rand, .1), list: THREE.BufferGeometry[] = [];
    const turns = poles.map((_, i) => { const [ax, as] = poles[Math.max(0, i - 1)]!, [bx, bs] = poles[Math.min(poles.length - 1, i + 1)]!; return Math.atan2(bx - ax, as - bs); });
    poles.forEach(([x, s], i) => {
      put(list, merged([limb(V(0, -.3, 0), V(0, 6.1, 0), .11, .085, bark, { sides: 6, capped: true }), limb(V(-.75, 5.62, 0), V(.75, 5.62, 0), .05, .05, bark, { sides: 4, capped: true }),
        ...arm.map((p) => blob(rand, [.045, .08, .045], insulator, 0, .1).translate(p.x, 5.72, 0))]), x, s, turns[i]!);
      blocks.push([x, s, .3]);
    });
    const ends = (i: number, p: THREE.Vector3) => [world(p, ...poles[i]!, turns[i]!), world(p, ...poles[i + 1]!, turns[i + 1]!)] as const;
    for (let i = 0; i < poles.length - 1; i++) for (const p of arm) list.push(wire(...ends(i, p), .35, .02));
    const perch = flat("#1f1c1a", rand, .1);
    for (const [span, k, t] of [[0, 1, .3], [0, 1, .36], [0, 2, .62], [1, 3, .45]] as const) { // a few birds sitting on the wires
      const p = sagging(...ends(span, arm[k]!), .35, t), turn = rand() * 6.3;
      list.push(merged([blob(rand, [.06, .065, .11], perch, 0, .1).translate(0, .07, 0), blob(rand, [.04, .042, .045], perch, 0, .1).translate(0, .14, .07), limb(V(0, .06, -.08), V(0, .02, -.2), .03, .005, perch, { sides: 3 })]).rotateY(turn).translate(p.x, p.y, p.z));
    }
    era(list, floor(poles[1]![0], -poles[1]![1]), 502, 513);
  }
  { const steel = of(13, lit("#5c6166", "#a9afb3", rand, .08)), glass = flat("#7e8a86", rand, .1), wide = (y: number) => mix(3.2, .9, clamp((y + .6) / 20.6, 0, 1));
    const corner = (y: number, i: number) => V(i & 1 ? wide(y) : -wide(y), y, i & 2 ? wide(y) : -wide(y)), levels = [-.6, 3.5, 7.5, 11, 14, 17, 20], around = [0, 1, 3, 2];
    const parts: THREE.BufferGeometry[] = [], bar = (a: THREE.Vector3, b: THREE.Vector3, r: number) => parts.push(limb(a, b, r, r, steel, { sides: 3 }));
    for (let k = 0; k < levels.length - 1; k++) for (let f = 0; f < 4; f++) { // four legs braced crosswise on every face
      const y0 = levels[k]!, y1 = levels[k + 1]!, c0 = around[f]!, c1 = around[(f + 1) % 4]!;
      bar(corner(y0, c0), corner(y1, c0), .17 - k * .015); bar(corner(y0, c0), corner(y1, c1), .06); bar(corner(y0, c1), corner(y1, c0), .06); bar(corner(y1, c0), corner(y1, c1), .07);
    }
    for (let i = 0; i < 4; i++) bar(corner(20, i), V(0, 24, 0), .08);
    const hangs: THREE.Vector3[] = [V(0, 24, 0)];
    for (const [y, reach] of [[16, 6.5], [20, 4.5]] as const) for (const side of [-1, 1]) {
      bar(V(side * wide(y), y, -wide(y)), V(side * reach, y, 0), .07); bar(V(side * wide(y), y, wide(y)), V(side * reach, y, 0), .07); bar(V(side * wide(y + 1.6), y + 1.6, 0), V(side * reach, y, 0), .05);
      parts.push(limb(V(side * reach, y, 0), V(side * reach, y - 1.6, 0), .1, .1, glass, { sides: 5 })); hangs.push(V(side * reach, y - 1.6, 0));
    }
    // far out on the right, a line marching away toward the horizon
    const tower = merged(parts), spots = [540, 596, 652, 708].map((s) => [at(120, Math.min(s, MONO_S)), s] as const), list: THREE.BufferGeometry[] = [];
    const turns = spots.map((_, i) => { const [ax, as] = spots[Math.max(0, i - 1)]!, [bx, bs] = spots[Math.min(spots.length - 1, i + 1)]!; return Math.atan2(bx - ax, as - bs); });
    const copies = spots.map((_, i) => i ? tower.clone() : tower); // copied before any is turned
    spots.forEach(([x, s], i) => put(list, copies[i]!, x, s, turns[i]!, -.2));
    for (let i = 0; i < spots.length - 1; i++) for (const hang of hangs) list.push(wire(world(hang, ...spots[i]!, turns[i]!, -.2), world(hang, ...spots[i + 1]!, turns[i + 1]!, -.2), 1.6, hang.y > 23 ? .05 : .07));
    era(list, floor(spots[0]![0], -spots[0]![1]) - .2, 525, 538);
  }
  { const s = 612, x = at(-85, s), turn = facing(x, s, roadX(580), 580), white = lit("#a7aaab", "#f1f2ef", rand, .04), list: THREE.BufferGeometry[] = [], base = floor(x, -s) - .3;
    put(list, merged([faceted(new THREE.CylinderGeometry(1.05, 1.9, 36, 12, 3, true).translate(0, 17.7, 0), white), turned([[3, 0], [3, .5], [0, .5]], 12, flat("#9a9a94", rand, .08)).translate(0, -.3, 0),
      faceted(new THREE.BoxGeometry(2.2, 2.3, 5.5), white).translate(0, 36.6, -.8)]), x, s, turn, -.3);
    const mast = era(list, base, 555, 572);
    const blades: THREE.BufferGeometry[] = [turned([[.95, 0], [.9, .7], [.55, 1.4], [0, 1.85]], 10, white).rotateX(Math.PI / 2).translate(0, 0, -.4)];
    const stations = [[1, 1], [3, 1.6], [6, 1.3], [10, .9], [14, .6], [17, .25]] as const;
    for (let k = 0; k < 3; k++) {
      const loop = stations.map(([r, chord]) => { const pitch = .35 * (1 - r / 17), c = Math.cos(pitch), sn = Math.sin(pitch); return [[.35 * chord, 0], [0, .12 * chord], [-.65 * chord, 0], [0, -.08 * chord]].map(([u, w]) => V(u! * c - w! * sn, r, u! * sn + w! * c)); });
      const skin: number[] = [], push = (...points: THREE.Vector3[]) => { for (const p of points) skin.push(p.x, p.y, p.z); };
      for (let i = 0; i < loop.length - 1; i++) for (let e = 0; e < 4; e++) { const a = loop[i]![e]!, b = loop[i]![(e + 1) % 4]!, c = loop[i + 1]![(e + 1) % 4]!, d = loop[i + 1]![e]!; push(a, b, c, a, c, d); }
      const tip = loop[loop.length - 1]!; push(tip[0]!, tip[1]!, tip[2]!, tip[0]!, tip[2]!, tip[3]!);
      blades.push(triangles(skin, white).rotateZ(k * Math.PI * 2 / 3));
    }
    const hub = new THREE.Group(); hub.position.copy(world(V(0, 36.6, 2.3), x, s, turn, -.3)).y -= base; hub.rotation.y = turn; mast.add(hub);
    rotor = new THREE.Mesh(own(merged(blades)), matte); rotor.castShadow = true; hub.add(rotor);
  }
  let dishHead: THREE.Group, telemetry: THREE.MeshBasicMaterial;
  { // a parabolic radio telescope listening to the sky (late 20th century)
    const [s, off] = CLEARINGS.dish, x = at(off, s), turn = facing(x, s, roadX(545), 545) - .25, base = floor(x, -s) - .2;
    const concrete = of(9, lit("#77746d", "#b5b0a6", rand, .08)), dishWhite = of(12, lit("#9da3a8", "#e8ecee", rand, .04)), strut = of(13, lit("#5d6369", "#9aa1a7", rand, .06));
    const pier: THREE.BufferGeometry[] = [];
    put(pier, merged([
      turned([[2.7, 0], [2.6, .5], [1.8, .7], [1.35, 6.2], [1.6, 6.8], [0, 6.8]], small ? 10 : 16, concrete),
      faceted(new THREE.BoxGeometry(2.3, 1.5, 2.0), strut).translate(0, 7.45, 0),
    ]), x, s, turn, -.2);
    const mount = era(pier, base, 537, 548); blocks.push([x, s, 2.9]);
    dishHead = new THREE.Group(); dishHead.position.copy(world(V(0, 8.2, 0), x, s, turn, -.2)).y -= base; dishHead.rotation.y = turn; mount.add(dishHead);
    const profile: Array<[number, number]> = Array.from({ length: 8 }, (_, i) => { const r = i / 7 * 6.8; return [r, r * r / 17]; });
    const reflector: THREE.BufferGeometry[] = [
      turned(profile, small ? 14 : 24, dishWhite),
      turned([[.6, -.65], [.7, .05], [0, .05]], 10, strut),
      turned([[.3, 4.3], [.35, 4.9], [.22, 5.1], [0, 5.1]], 10, strut), // prime-focus receiver
    ];
    for (let k = 0; k < 4; k++) {
      const a = k * Math.PI / 2 + Math.PI / 4, r = 5.4, y = r * r / 17;
      reflector.push(limb(V(Math.cos(a) * r, y, Math.sin(a) * r), V(0, 4.6, 0), .06, .045, strut, { sides: 4 }));
    }
    for (let k = 0; k < 8; k++) {
      const a = k * Math.PI / 4, r = 6.4, y = r * r / 17;
      reflector.push(limb(V(Math.cos(a) * .65, -.35, Math.sin(a) * .65), V(Math.cos(a) * r, y - .12, Math.sin(a) * r), .075, .05, strut, { sides: 4 }));
    }
    const bowl = new THREE.Mesh(own(merged(reflector).rotateX(.96)), matte); bowl.castShadow = bowl.receiveShadow = true; dishHead.add(bowl);
  }
  { // A service yard leads off the paved road to the compute hall's coolers.
    const [s, off] = CLEARINGS.compute, x = at(off, s), turn = facing(x, s, roadX(578), 578), base = floor(x, -s) - .25;
    const pad = of(9, lit("#605e58", "#949088", rand, .06)), slate = of(12, lit("#171b22", "#2b323d", rand, .05)), trim = of(12, flat("#101318", rand, .04)), alloy = of(13, lit("#4c535b", "#8a929a", rand, .06));
    const hall: THREE.BufferGeometry[] = [
      faceted(new THREE.BoxGeometry(14.2, .45, 8.6), pad).translate(0, .1, 0),
      faceted(new THREE.BoxGeometry(12.8, 5.4, 7.0), slate).translate(0, 3.0, 0),
      faceted(new THREE.BoxGeometry(13.4, .32, 7.5), trim).translate(0, 5.82, 0),
      faceted(new THREE.BoxGeometry(10.2, .22, .18), trim).translate(0, 3.9, 3.52), // recessed telemetry channel
      faceted(new THREE.BoxGeometry(8.8, .24, 7), pad).translate(4.1, .13, 5.1),
      faceted(new THREE.BoxGeometry(1.45, 2.52, .12), alloy).translate(.9, 1.57, 3.56),
      faceted(new THREE.BoxGeometry(.27, .055, .08), trim).translate(1.32, 1.54, 3.66),
      faceted(new THREE.BoxGeometry(1.95, .09, 1.2), alloy).translate(.9, 3.15, 3.99),
    ];
    for (const u of [2.5, 3.1]) {
      hall.push(limb(V(u, .35, 6.15), V(u, 1.6, 6.15), .12, .12, alloy, { sides: 8 }),
        limb(V(u, 1.6, 6.15), V(u, 1.6, 3.52), .12, .12, alloy, { sides: 8 }));
    }
    for (let i = -5; i <= 5; i++) if (Math.abs(i) > 1) hall.push(faceted(new THREE.BoxGeometry(.12, 3.8, .28), trim).translate(i * 1.0, 2.45, 3.56)); // cooling intake louvers
    for (let i = -1; i <= 1; i++) { // three dry-cooler fan stacks on the side pad
      hall.push(faceted(new THREE.BoxGeometry(1.6, 1.6, 1.6), alloy).translate(7.4, 1.1, i * 2.0));
      hall.push(turned([[.66, 0], [.66, .32], [.58, .36], [0, .28]], small ? 8 : 12, trim).translate(7.4, 1.9, i * 2.0));
    }
    const list: THREE.BufferGeometry[] = []; put(list, merged(hall), x, s, turn, -.25);
    const building = era(list, base, 563, 578); blocks.push([x, s, 7.5]);
    telemetry = own(new THREE.MeshBasicMaterial({ color: new THREE.Color("#dfa855"), side: THREE.DoubleSide }));
    const strip = new THREE.Mesh(own(merged([-4.1, -2.6, -1.2, .4, 2.0, 3.6].map((u, i) => new THREE.PlaneGeometry(i % 2 ? .6 : 1.05, .07).translate(u, 0, 0)))), telemetry);
    const slit = world(V(0, 3.9, 3.63), x, s, turn, -.25); strip.position.set(slit.x, slit.y - base, slit.z); strip.rotation.y = turn; building.add(strip);
  }

  // ---------- life: trees along the field margins, poplars by the mill, lone trees out in the open field ----------
  for (let i = 0; i < (small ? 8 : 14); i++) { const s = 270 + rand() * 200; plant("fig", at((rand() < .5 ? -1 : 1) * (37 + rand() * 12), s), s, 6 + rand() * 3, .45); }
  for (const [s, off, height] of [[528, -20, 8.5], [544, -9, 6], [568, -9, 7], [573, 10, 7.5], [563, 27, 9.5], [596, -38, 8]] as const) plant("fig", at(off, s), s, height, .6);
  for (const [s, off, height] of [[481, 41, 13], [489, 43.5, 15], [494, 39, 12]] as const) plant("poplar", at(off, s), s, height, .7);

  // The wheat ends in two low folds of land. Their saddles leave open sky behind the slab on the approach.
  const ridgeStone = new THREE.Color("#4f555b"), ridgeGrass = new THREE.Color("#74735f"), ridges: THREE.BufferGeometry[] = [];
  for (const [distance, height, saddle] of [[752, 14, -6], [827, 29, 18]] as const) {
    const ridge: number[] = [], steps = small ? 10 : 16;
    let last: THREE.Vector3[] | undefined;
    for (let x = -300; x <= 300; x += small ? 10 : 6) {
      const offset = x - roadX(MONO_S), flank = smooth(12, 100, Math.abs(offset - saddle));
      const relief = .36 + .52 * noise(x * .015, saddle) + .12 * noise(x * .07, saddle);
      const peak = 2 + height * flank * relief, center = distance + noise(x * .022, saddle + 1) * 18, row: THREE.Vector3[] = [];
      for (let j = 0; j <= steps; j++) {
        const across = j / steps * 2 - 1, s = center + across * 76;
        const shoulder = Math.pow(Math.max(0, 1 - across * across), 1.65);
        // Branching shallow gullies run down the flank, breaking the silhouette without raising the saddle behind the slab.
        const channel = Math.pow(noise(x * .055 + across * 1.6, saddle + across * .8), 4);
        const spur = (noise(x * .11 + across * .7, s * .035) - .5) * height * .12 * flank;
        const y = -3 + shoulder * (peak + 3 + spur - channel * height * .34 * flank);
        row.push(V(x, y, -s));
      }
      if (last) for (let k = 0; k < row.length - 1; k++) {
        for (const p of [last[k]!, row[k]!, row[k + 1]!, last[k]!, row[k + 1]!, last[k + 1]!]) ridge.push(p.x, p.y, p.z);
      }
      last = row;
    }
    ridges.push(faceted(new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(ridge, 3)),
      (center, normal) => tone.copy(ridgeStone).lerp(ridgeGrass, clamp(normal.y * .4 + noise(center.x * .028, center.z * .015 + saddle) * .2, 0, 1))));
  }

  scene.add(new THREE.Mesh(own(merged(ridges)), matte)); // keep the village and irrigation works culled once they are behind the walker
  placed.push(triangles(stems, of(3, lit("#5f6b34", "#b4b56a", rand, .25))));
  const fixed = new THREE.Mesh(own(merged(placed)), matte); fixed.castShadow = fixed.receiveShadow = true; scene.add(fixed);

  // ---------- birds: a flock high over the open field, a smaller one farther out over the village fields, swifts over the wheat ----------
  const birds: Bird[] = [
    ...Array.from({ length: 9 }, (): Bird => ({ kind: 0, r: 6 + rand() * 9, h: 15 + rand() * 15, speed: .22 + rand() * .14, phase: rand() * 6.283, beat: 7 + rand() * 3, size: 1.1 + rand() * .5 })),
    ...Array.from({ length: 6 }, (): Bird => ({ kind: 1, r: 8 + rand() * 8, h: 12 + rand() * 8, speed: .25 + rand() * .1, phase: rand() * 6.283, beat: 8 + rand() * 3, size: .32 + rand() * .12 })),
    ...Array.from({ length: 3 }, (): Bird => ({ kind: 2, r: 0, h: 1.9 + rand() * .4, speed: .9 + rand() * .3, phase: rand() * 6.283, beat: 15 + rand() * 4, size: .55 })),
  ];
  const flock = new Float32Array(birds.length * 81), birdShape = own(new THREE.BufferGeometry());
  // one bird, as [across, which height (0 the body, 1 the wrist, 2 the wingtip), forward]: a short body, the tail, then each wing bent at the wrist like a gull's
  const BIRD = [0, 0, .2, .05, 0, 0, 0, 0, -.16, 0, 0, .2, 0, 0, -.16, -.05, 0, 0, 0, 0, -.12, .07, 0, -.28, -.07, 0, -.28,
    ...[1, -1].flatMap((side) => [.04 * side, 0, .07, .04 * side, 0, -.06, .27 * side, 1, -.07, .04 * side, 0, .07, .27 * side, 1, -.07, .27 * side, 1, .06, .27 * side, 1, .06, .27 * side, 1, -.07, .58 * side, 2, -.2])];
  birdShape.setAttribute("position", new THREE.BufferAttribute(flock, 3));
  birdShape.setAttribute("color", new THREE.BufferAttribute(Float32Array.from({ length: flock.length }, (_, i) => i % 81 < 27 ? .09 : .12), 3));
  birdShape.setAttribute("normal", new THREE.BufferAttribute(Float32Array.from({ length: flock.length }, (_, i) => i % 3 === 1 ? 1 : 0), 3));
  birdShape.setAttribute("surface", new THREE.BufferAttribute(new Float32Array(flock.length / 3), 1)); // plain, for the shared material
  const flight = new THREE.Mesh(birdShape, matte); flight.frustumCulled = false; scene.add(flight);
  let px = 0, py = 0, pz = 0;
  /** Where a bird is at a moment, left in px, py, pz. */
  function where(bird: Bird, t: number) {
    if (bird.kind === 2) { const cs = 560 + 17 * Math.sin(t * .37 + bird.phase); px = roadX(cs) + 13 * Math.sin(t * .61 * bird.speed + bird.phase * 2); py = bird.h + .35 * Math.sin(t * 1.7 + bird.phase); pz = -cs; return; }
    const cs = bird.kind ? 326 + 9 * Math.sin(t * .027) : 485 + 28 * Math.sin(t * .021), cx = roadX(cs) + (bird.kind ? -24 + 6 * Math.sin(t * .05) : 8 * Math.sin(t * .033)), a = bird.phase + t * bird.speed;
    px = cx + Math.cos(a) * bird.r; pz = -cs - Math.sin(a) * bird.r * .7; py = bird.h + Math.sin(t * .3 + bird.phase) * (bird.kind ? .5 : 1.5);
  }
  function fly(clock: number) {
    for (let b = 0; b < birds.length; b++) {
      const bird = birds[b]!; where(bird, clock + .05); const nx = px, nz = pz; where(bird, clock);
      const l = Math.hypot(nx - px, nz - pz) || 1, fx = (nx - px) / l, fz = (nz - pz) / l; // heading
      const glide = .2 + .8 * clamp(Math.sin(clock * .45 + bird.phase * 2) * 3 + .5, 0, 1), beat = Math.sin(clock * bird.beat + bird.phase) * glide, elbow = beat * .18, wingtip = beat * .42 + elbow;
      for (let v = 0; v < 27; v++) {
        const across = BIRD[v * 3]! * bird.size, ahead = BIRD[v * 3 + 2]! * bird.size, kind = BIRD[v * 3 + 1]!, o = b * 81 + v * 3;
        flock[o] = px - fz * across + fx * ahead; flock[o + 1] = py + (kind === 1 ? .09 + elbow : kind === 2 ? wingtip - .03 : 0) * bird.size; flock[o + 2] = pz + fx * across + fz * ahead;
      }
    }
    birdShape.attributes.position!.needsUpdate = true;
  }
  fly(0);

  /** One frame out here: the machines rise as the walker `s` reaches their years; sails, rotor, dish, shaduf, birds and water move. Allocates nothing. */
  const dishBaseTurn = dishHead.rotation.y;
  function frame(clock: number, _dt: number, s: number) {
    for (let i = 0; i < eras.length; i++) { const { mesh, from, to } = eras[i]!, k = smooth(from, to, s); mesh.visible = k > 0; mesh.scale.y = Math.max(k, .001); }
    const turning = smooth(452, 458, s); sails.visible = turning > 0; sails.scale.setScalar(Math.max(turning, .001)); // the sails go up only once the tower stands
    const nearCanal = s > 315 && s < 495; shine.visible = nearCanal;
    if (still) return;
    sails.rotation.z = -clock * .45; rotor.rotation.z = -clock * .8; swing(.12 - .14 * Math.cos(clock * 1.047)); // the pot dips every six seconds
    dishHead.rotation.y = dishBaseTurn + Math.sin(clock * .09) * .22;
    const pulse = .72 + .28 * Math.sin(clock * 2.1) * Math.cos(clock * .7); telemetry.color.setRGB(.92 * pulse, .68 * pulse, .34 * pulse);
    fly(clock); if (nearCanal) glide(clock); if (Math.abs(s - pondS) < 90) ripple(clock); waterTime.value = clock;
  }
  return { water, waterSun, frame };
}

/** Open water: the sky reflected more the flatter you look across it (Fresnel), murky green-brown looking down into it, small moving ripples and sun glints,
 * shallow and muddy at its edges. The vertex colour carries the depth (about 1.14 at the bank, .74 in the middle). `water.color` is the sky overhead and
 * `waterSun` the sun's direction, both set by world.ts each frame. */
function openWater(own: Kit["own"]) {
  const waterSun = new THREE.Vector3(0, 1, 0), waterTime = { value: 0 }, water = own(new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, transparent: true }));
  water.onBeforeCompile = (shader) => {
    shader.uniforms.sunDir = { value: waterSun }; shader.uniforms.time = waterTime;
    shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vSpot;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvSpot = (modelMatrix * vec4(transformed, 1.)).xyz;");
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec3 vSpot; uniform vec3 sunDir; uniform float time;")
      .replace("#include <color_fragment>", `#include <color_fragment>
        float deep = clamp((1.14 - vColor.g) / .4, 0., 1.);
        vec2 p = vSpot.xz, slope = vec2(0.);
        slope += vec2(.6, .8) * cos(dot(p, vec2(.6, .8)) * 3.1 - time * 1.3) * .035; // ripples running every way, a few sizes
        slope += vec2(-.9, .4) * cos(dot(p, vec2(-.9, .4)) * 5.3 - time * 1.9) * .025;
        slope += vec2(.2, -1.) * cos(dot(p, vec2(.2, -1.)) * 9.7 - time * 2.7) * .015;
        slope += vec2(-.7, -.7) * cos(dot(p, vec2(-.7, -.7)) * 17.3 - time * 3.6) * .008;
        vec3 N = normalize(vec3(-slope.x, 1., -slope.y)), V = normalize(cameraPosition - vSpot), R = reflect(-V, N);
        vec3 overhead = mix(vec3(dot(diffuse, vec3(.3, .59, .11))), diffuse, .5); // the sky, much less blue than paint
        vec3 near = overhead * 1.5 + vec3(.05, .05, .045); // paler toward the horizon
        vec3 sky = mix(near, overhead, smoothstep(.02, .5, R.y));
        float level = dot(overhead, vec3(.33)) * 2.2 + .02, fresnel = .03 + .97 * pow(1. - clamp(dot(N, V), 0., 1.), 5.);
        vec3 murk = mix(vec3(.16, .14, .09), vec3(.07, .08, .05), deep) * level; // mud showing through the shallows, dark green-brown in the deep
        vec3 c = mix(murk, sky, fresnel) + vec3(1., .92, .78) * pow(max(dot(R, sunDir), 0.), 400.) * 5. * step(0., sunDir.y);
        diffuseColor = vec4(min(c, vec3(4.)), mix(.6, .96, smoothstep(0., .35, deep)));`);
  };
  return { water, waterSun, waterTime };
}
