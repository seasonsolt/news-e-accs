import * as THREE from "three";
import type { Kit } from "./camp.ts";
import { mix, sequence, smooth } from "./land.ts";

// Trees and bushes grown in code. The wood branches the way wood does: each limb a smooth tube, as thick as all the twigs it carries need (the pipe model).
// The leaves are small cards whose outline is cut in the shader, lit from both sides, glowing when the light is behind them, and moving with the grass's wind.

export type Species = "acacia" | "fig" | "poplar" | "bush" | "deadbush";
export interface Wind { time: { value: number }; wind: { value: number } }
/** Grows a plant of `species` at (x, s): `size` is a tree's height or a bush's spread in metres, `detail` 0…1 how closely the walker will see it. */
export type Plant = (species: Species, x: number, s: number, size: number, detail?: number) => void;

interface Branch { points: THREE.Vector3[]; level: number; at: number; kids: Branch[]; radii: number[] }
/** Bends a growing branch at a point; returning true ends it there. */
type Steer = (p: THREE.Vector3, dir: THREE.Vector3) => boolean | void;

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z), UP = V(0, 1, 0);
/** A direction `angle` away from `dir`, turned by `roll` around it. */
function spread(dir: THREE.Vector3, angle: number, roll: number) {
  const a = (Math.abs(dir.y) < .95 ? V(0, 1, 0) : V(1, 0, 0)).cross(dir).normalize(), b = dir.clone().cross(a);
  return dir.clone().multiplyScalar(Math.cos(angle)).addScaledVector(a, Math.sin(angle) * Math.cos(roll)).addScaledVector(b, Math.sin(angle) * Math.sin(roll)).normalize();
}
const heading = (b: Branch, i = b.points.length - 1) => b.points[Math.min(i + 1, b.points.length - 1)]!.clone().sub(b.points[Math.max(i - 1, 0)]!).normalize();

// What each kind of plant is made of. `girth` is the trunk's radius per metre of height (per metre of spread for bushes); `cards` the leaf cards at `ref` size and full detail, each `cluster` leaves across;
// `depth` how much a card deep in the crown is darkened (bushes little, so they still catch the moon).
const SPECIES = {
  acacia: { bark: ["#2b231d", "#6b5a49", "#86735e"], leaf: ["#3a4720", "#7f8b40"], girth: .042, twig: .006, ref: 6.6, cards: 4800, cluster: 1.38, length: .27, width: .24, outward: .45, depth: 1,
    shader: { KIND: 0, FLUTTER: 2.6, FLAP: .02, SHIMMER: .1, BACK: 1.05, THROUGH: .8 }, sway: .08 },
  fig: { bark: ["#39342d", "#8a8273", "#7d715f"], leaf: ["#203d17", "#5d8a2f"], girth: .04, twig: .01, ref: 7, cards: 2900, cluster: 1.72, length: .24, width: .17, outward: .6, depth: 1,
    shader: { KIND: 1, FLUTTER: 2.2, FLAP: .025, SHIMMER: .15, BACK: 1.08, THROUGH: .6 }, sway: .06 },
  poplar: { bark: ["#57594d", "#aaad9c", "#9c9f8c"], leaf: ["#4d6e2c", "#a3b655"], girth: .025, twig: .008, ref: 13, cards: 3500, cluster: 2.55, length: .16, width: .11, outward: .45, depth: .9,
    shader: { KIND: 2, FLUTTER: 8.5, FLAP: .03, SHIMMER: .55, BACK: 1.3, THROUGH: .7 }, sway: .2 },
  bush: { bark: ["#3a342c", "#6e665a", "#857b6c"], leaf: ["#3f4a2e", "#8a9168"], girth: .03, twig: .004, ref: .8, cards: 460, cluster: 1.6, length: .13, width: .095, outward: .55, depth: .45,
    shader: { KIND: 3, FLUTTER: 4, FLAP: .012, SHIMMER: .1, BACK: 1.05, THROUGH: .5 }, sway: .03 },
  deadbush: { bark: ["#7a7468", "#b3ab9c", "#c6beb0"], girth: .018, twig: .003 },
} as const;
type Leafy = Exclude<Species, "deadbush">;

/** Grows one plant in its own frame, trunk foot at the origin. `size` is the height of a tree, the spread of a bush; `ground` the height of the land at a point in that frame. */
function grow(species: Species, size: number, detail: number, rand: () => number, ground: (x: number, z: number) => number) {
  const spec = SPECIES[species], R = (a: number, b: number) => a + rand() * (b - a), all: Branch[] = [], roots: Branch[] = [], bearers: Branch[] = [], H = size, scale = "ref" in spec ? H / spec.ref : 1;
  function shoot(from: THREE.Vector3, dir: THREE.Vector3, length: number, level: number, steps: number, steer: Steer, wobble: number, parent?: Branch, at = 0) {
    const points = [from.clone()], d = dir.clone(), step = length / steps;
    for (let k = 1; k <= steps; k++) {
      d.x += (rand() - .5) * wobble; d.y += (rand() - .5) * wobble; d.z += (rand() - .5) * wobble;
      const stop = steer(points[k - 1]!, d); d.normalize(); points.push(points[k - 1]!.clone().addScaledVector(d, step)); if (stop && k > 1) break;
    }
    const b: Branch = { points, level, at, kids: [], radii: [] }; all.push(b); if (parent) parent.kids.push(b); else roots.push(b); return b;
  }
  const many = (n: number) => { const whole = Math.floor(n); return whole + (rand() < n - whole ? 1 : 0); }; // n on average
  const fill = .3 + .7 * detail * detail; // fewer twigs on trees seen from afar

  if (species === "acacia") {
    // A leaning trunk that forks low; limbs that fork and fork again, levelling out into one flat, layered top.
    const steer = (top: number): Steer => (p, d) => {
      const out = V(p.x, 0, p.z); if (out.lengthSq() > 1e-4) d.addScaledVector(out.normalize(), .07);
      d.y = mix(d.y, .05, smooth(top - H * .3, top, p.y) * .5); if (p.y > top) d.y = Math.min(d.y, -.04);
    };
    const flat: Steer = (_p, d) => { d.y = d.y * .6 + .03; };
    const twig = (b: Branch, i: number) => {
      const d = spread(heading(b, i), R(.8, 1.4), R(0, 6.28)); d.y = d.y * .3 + .06;
      const t = shoot(b.points[i]!, d.normalize(), R(.3, .6) * scale, 5, 2, flat, .3, b, i); bearers.push(t);
      for (let k = 1; k < t.points.length; k++) if (rand() < .8 * fill * fill) bearers.push(shoot(t.points[k]!, spread(heading(t, k), R(.5, 1), R(0, 6.28)), R(.12, .24) * scale, 6, 1, flat, .2, t, k));
    };
    const fork = (parent: Branch, at: number, dir: THREE.Vector3, length: number, level: number, top: number) => {
      const b = shoot(parent.points[at]!, dir, length, level, level < 3 ? 4 : 3, steer(top), .12, parent, at), end = b.points.length - 1;
      if (level < 4) { const e = heading(b), n = level < 3 && rand() < .3 ? 3 : 2, roll = R(0, 6.28);
        for (let j = 0; j < n; j++) fork(b, end, spread(e, R(.3, .55), roll + j * 6.283 / n), length * R(.66, .8), level + 1, top + R(-.05, .05) * H); }
      if (level >= 3) for (let i = 1; i <= end; i++) for (let k = many(R(1.6, 3) * fill); k > 0; k--) twig(b, i);
    };
    const trunk = shoot(V(0, -.3, 0), spread(UP, R(.08, .28), R(0, 6.28)), H * R(.18, .28) + .3, 0, 6, (_p, d) => { d.y += .03; }, .06);
    const limbs = rand() < .7 ? 3 : 2, spin = R(0, 6.28);
    for (let i = 0; i < limbs; i++) fork(trunk, trunk.points.length - 1, spread(UP, R(.4, .7), spin + i * 6.283 / limbs + R(-.4, .4)), H * R(.3, .38), 1, H * R(.84, 1.02));
  } else if (species === "fig") {
    // A short thick trunk, heavy boughs, side branches all the way out to a domed outline.
    const cy = H * .6, rx = H * R(.4, .48), ry = H * .4;
    const steer = (rise: number): Steer => (p, d) => { d.y += rise; return (p.x / rx) ** 2 + ((p.y - cy) / ry) ** 2 + (p.z / rx) ** 2 > 1; };
    const lengths = [0, H * .5, H * .24, H * .11, H * .05], last = detail < .6 ? 3 : 4; // far off, the finest twigs are left out
    const sides = (b: Branch, level: number) => {
      const n = b.points.length; let roll = R(0, 6.28);
      for (let i = level === 2 ? 2 : 1; i < n; i++) for (let k = many((level < 4 ? 1.5 : 1.2) * (level > 2 ? fill : 1)); k > 0; k--) {
        roll += 2.4; const c = shoot(b.points[i]!, spread(heading(b, i), R(.6, 1.05), roll), lengths[level]! * R(.7, 1.2) * (1 - .4 * i / n), level, level < 4 ? 3 : 2, steer(level < 4 ? .03 : 0), .18, b, i);
        if (level >= 3) bearers.push(c); if (level < last) sides(c, level + 1);
      }
    };
    const trunk = shoot(V(0, -.3, 0), spread(UP, R(0, .1), R(0, 6.28)), H * R(.3, .38) + .3, 0, 8, (_p, d) => { d.y += .05; }, .05);
    const boughs = 3 + Math.floor(rand() * 3), spin = R(0, 6.28), top = trunk.points.length - 1;
    for (let i = 0; i <= boughs; i++) { // the last one is the leader, carrying on upward
      const d = i < boughs ? spread(UP, R(.55, .9), spin + i * 6.283 / boughs + R(-.3, .3)) : spread(UP, R(0, .2), R(0, 6.28));
      sides(shoot(trunk.points[top]!, d, lengths[1]! * R(.85, 1.1), 1, 6, steer(.02), .1, trunk, top), 2);
    }
  } else if (species === "poplar") {
    // One straight leader to the top and branches held steeply up along it (fastigiate), so the leaves close into one narrow column.
    const leader = shoot(V(0, -.3, 0), spread(UP, R(0, .04), R(0, 6.28)), H + .3, 0, Math.round(H * .8), (_p, d) => { d.y += .1; }, .04), n = leader.points.length;
    const up: Steer = (_p, d) => { d.y += .12; };
    let roll = R(0, 6.28);
    for (let i = Math.round(n * .14); i < n; i++) for (let k = many(R(2.4, 3.4) * fill); k > 0; k--) {
      const t = i / (n - 1), length = H * .26 * Math.pow(Math.sin(Math.PI * Math.min(1, (t - .04) / .98)), .6) * R(.75, 1.15) + .3; roll += 2.4;
      const side = shoot(leader.points[i]!, spread(UP, R(.28, .55), roll), length, 1, 2, up, .1, leader, i); bearers.push(side);
      for (let j = 1; j < side.points.length; j++) for (let m = many(fill); m > 0; m--) bearers.push(shoot(side.points[j]!, spread(heading(side, j), R(.3, .6), R(0, 6.28)), R(.3, .6), 2, 1, up, .2, side, j));
    }
  } else {
    // Many stems from one root: thorny scrub in leaf, or the bare sticks of a dead one.
    const dead = species === "deadbush", stems = many(R(5, 8)), spin = R(0, 6.28);
    for (let i = 0; i < stems; i++) {
      const stem = shoot(V(R(-.05, .05), -.05, R(-.05, .05)), spread(UP, R(.25, dead ? .8 : .95), spin + i * 2.4), size * R(dead ? 1 : .9, dead ? 1.6 : 1.4), 0, 3, (_p, d) => { d.y += .02; }, .3);
      for (let j = 1; j < stem.points.length; j++) for (let k = many(dead ? .6 : 1.5); k > 0; k--) {
        const side = shoot(stem.points[j]!, spread(heading(stem, j), R(.6, 1.1), R(0, 6.28)), size * R(.3, .5), 1, 2, () => {}, .4, stem, j); if (!dead) bearers.push(side);
        if (!dead) for (let m = 1; m < side.points.length; m++) if (rand() < .65) bearers.push(shoot(side.points[m]!, spread(heading(side, m), R(.6, 1.2), R(0, 6.28)), size * R(.12, .22), 2, 1, () => {}, .3, side, m));
      }
    }
  }

  // The pipe model: a branch is as thick as all the twigs above it need, so the limbs on either side of a fork add up to the one below.
  const tips = (b: Branch): number[] => {
    const n = b.points.length, count = Array<number>(n).fill(b.kids.some((k) => k.at === n - 1) ? 0 : 1);
    for (const kid of b.kids) { const c = tips(kid)[0]!; for (let i = 0; i <= kid.at; i++) count[i]! += c; }
    b.radii = count; return count;
  };
  const most = Math.max(...roots.map((b) => tips(b)[0]!)), pipe = spec.girth * size / Math.sqrt(most);
  for (const b of all) { b.radii = b.radii.map((c) => Math.max(spec.twig, pipe * Math.sqrt(c))); b.radii[b.radii.length - 1]! *= .5; }
  const trunk = roots[0]!.radii[0]!;
  if (species === "acacia" || species === "fig" || species === "poplar") {
    // Roots spreading from the foot and diving into the soil, so the trunk does not stand on the ground like a post.
    const count = species === "fig" ? 6 : 4, spin = R(0, 6.28);
    for (let i = 0; i < count; i++) {
      const a = spin + i * 6.283 / count + R(-.3, .3), reach = trunk * (species === "fig" ? R(3, 5) : R(2.2, 3.6)) + .15, end = V(Math.cos(a) * reach, 0, Math.sin(a) * reach);
      end.y = ground(end.x, end.z) - .12;
      const root = shoot(V(Math.cos(a) * trunk * .4, trunk * .9, Math.sin(a) * trunk * .4), end.clone().sub(V(0, trunk * .9, 0)).normalize(), reach, -1, 3, (p, d) => { d.y -= .1; }, .1);
      root.radii = root.points.map((_, k) => trunk * mix(.5, .12, k / (root.points.length - 1)));
    }
    // A few dry twigs fallen under the crown, lying on the land.
    if (detail > .7) for (let i = species === "acacia" ? 10 : 5; i > 0; i--) {
      const a = R(0, 6.28), from = V(Math.cos(a) * R(.6, .45 * H), 0, Math.sin(a) * R(.6, .45 * H)), twig = shoot(from, spread(V(0, 1, 0), 1.5, R(0, 6.28)), R(.3, .9) * scale, 6, 2, (_p, d) => { d.y = 0; }, .3);
      for (const p of twig.points) p.y = ground(p.x, p.z) + .01;
      twig.radii = twig.points.map((_, k) => mix(.011, .004, k / (twig.points.length - 1)));
    }
  }
  return { all, bearers, trunk };
}

/** One plant's wood as unindexed triangles with `position`, `normal`, `color` and `surface` = 2 (bark), in its own frame. */
function wood(species: Species, all: Branch[], detail: number, rand: () => number, ground: (x: number, z: number) => number) {
  const sidesOf = (b: Branch) => Math.max(3, Math.min(16, Math.round((3 + b.radii[0]! * 55) * (.55 + .45 * detail))));
  let count = 0; for (const b of all) count += (b.points.length - 1) * sidesOf(b) * 6;
  const position = new Float32Array(count * 3), normal = new Float32Array(count * 3), color = new Float32Array(count * 3);
  const [low, high, pale] = SPECIES[species].bark.map((hex) => new THREE.Color(hex)), tone = new THREE.Color(), thin = SPECIES[species].twig, earth = new THREE.Color("#55473a");
  const flare = species === "fig" ? .6 : species === "acacia" ? .35 : species === "poplar" ? .25 : 0, lobes = species === "fig" ? 5 : 3, buttress = species === "fig" ? .9 : .4;
  const T = new THREE.Vector3(), N = new THREE.Vector3(), B = new THREE.Vector3(), dir = new THREE.Vector3(), ring: number[] = [];
  let o = 0;
  for (const b of all) {
    const sides = sidesOf(b), n = b.points.length, shade = .88 + rand() * .24, phase = rand() * 6.28, base = b.level === 0 && flare > 0;
    ring.length = 0;
    for (let i = 0; i < n; i++) {
      const P = b.points[i]!; T.copy(heading(b, i));
      if (i === 0) N.copy(Math.abs(T.y) < .95 ? UP : V(1, 0, 0)).cross(T).normalize(); else N.addScaledVector(T, -N.dot(T)).normalize(); // carried along the branch so the tube does not twist
      B.copy(T).cross(N);
      const crotch = b.level > 0 ? (i === 0 ? .55 : i === 1 ? .82 : 1) : 1, fine = 1 - smooth(thin, thin * 6, b.radii[i]!);
      const soil = b.level <= 0 ? 1 - smooth(-.05, .3 + flare * .5, P.y - ground(P.x, P.z)) : 0; // dusted with earth where it goes into the ground
      for (let j = 0; j <= sides; j++) {
        const a = j / sides * 6.2832; dir.copy(N).multiplyScalar(Math.cos(a)).addScaledVector(B, Math.sin(a));
        const swell = base ? 1 + flare * Math.exp(-Math.max(0, P.y) / (.1 + b.radii[0]! * .6)) * (1 + buttress * Math.pow(Math.max(0, Math.cos(lobes * a + phase)), 3)) : 1;
        const r = b.radii[i]! * swell;
        tone.copy(low!).lerp(high!, .1 + .8 * (dir.y * .5 + .5)).lerp(pale!, fine * .7).multiplyScalar(shade * crotch).lerp(earth, soil * .75);
        ring.push(P.x + dir.x * r, P.y + dir.y * r, P.z + dir.z * r, dir.x, dir.y, dir.z, tone.r, tone.g, tone.b);
      }
    }
    const put = (i: number, j: number) => { const k = (i * (sides + 1) + j) * 9; for (let m = 0; m < 3; m++) { position[o * 3 + m] = ring[k + m]!; normal[o * 3 + m] = ring[k + 3 + m]!; color[o * 3 + m] = ring[k + 6 + m]!; } o++; };
    for (let i = 0; i < n - 1; i++) for (let j = 0; j < sides; j++) { put(i, j); put(i, j + 1); put(i + 1, j + 1); put(i, j); put(i + 1, j + 1); put(i + 1, j); }
  }
  return new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(position, 3)).setAttribute("normal", new THREE.BufferAttribute(normal, 3))
    .setAttribute("color", new THREE.BufferAttribute(color, 3)).setAttribute("surface", new THREE.BufferAttribute(new Float32Array(count).fill(2), 1));
}

interface Cards { position: Float32Array; normal: Float32Array; uv: Float32Array; color: Float32Array; leaf: Float32Array; count: number }
/** Leaf cards scattered along the twigs, and under a tree a litter of dry ones on the `ground`; already turned by `turn` and moved to `at`.
 * Each card carries [flutter phase, sway in metres, leaves across] in `leaf`. */
function cards(species: Leafy, bearers: Branch[], size: number, detail: number, rand: () => number, turn: number, at: THREE.Vector3, ground: (x: number, z: number) => number): Cards {
  const spec = SPECIES[species], share = .15 + .85 * detail * detail, growing = Math.round(spec.cards * (size / spec.ref) ** 2 * share), count = growing + (species === "bush" || detail < .5 ? 0 : Math.round(growing * .07)), grain = spec.cluster / Math.sqrt(share); // far off, fewer and larger cards, each holding several leaves
  const position = new Float32Array(count * 12), normal = new Float32Array(count * 12), uv = new Float32Array(count * 8), color = new Float32Array(count * 12), leaf = new Float32Array(count * 12);
  // The crown as an ellipsoid around the twigs: how deep a card sits in it darkens it, and its outward direction softens the cards' normals.
  const lo = V(1e9, 1e9, 1e9), hi = V(-1e9, -1e9, -1e9); for (const b of bearers) for (const p of b.points) { lo.min(p); hi.max(p); }
  const centre = lo.clone().add(hi).multiplyScalar(.5), rx = Math.max(.2, hi.x - lo.x, hi.z - lo.z) / 2, ry = Math.max(.2, (hi.y - lo.y) / 2);
  const weights: number[] = []; let total = 0; for (const b of bearers) { total += b.points[0]!.distanceTo(b.points[b.points.length - 1]!) + .01; weights.push(total); }
  const phases = bearers.map(() => rand()), [dark, light] = spec.leaf.map((hex) => new THREE.Color(hex)), dry = new THREE.Color("#9a8a3e"), fallen = new THREE.Color("#6e5f42"), tint = new THREE.Color();
  const p = new THREE.Vector3(), u = new THREE.Vector3(), n = new THREE.Vector3(), v = new THREE.Vector3(), out = new THREE.Vector3(), nn = new THREE.Vector3(), corner = new THREE.Vector3(), c = Math.cos(turn), s = Math.sin(turn);
  for (let k = 0; k < count; k++) {
    let lowIndex = 0, highIndex = bearers.length - 1; const pick = rand() * total; while (lowIndex < highIndex) { const m = (lowIndex + highIndex) >> 1; if (weights[m]! < pick) lowIndex = m + 1; else highIndex = m; }
    const b = bearers[lowIndex]!, t = rand() * (b.points.length - 1), i = Math.min(Math.floor(t), b.points.length - 2), along = heading(b, i);
    p.copy(b.points[i]!).lerp(b.points[i + 1]!, t - i);
    const litter = k >= growing; // fallen leaves lie flat on the land under the crown
    if (litter) { const a = rand() * 6.283, r = Math.sqrt(rand()) * rx; p.set(centre.x + Math.cos(a) * r, 0, centre.z + Math.sin(a) * r); p.y = ground(p.x, p.z) + .012; }
    out.set((p.x - centre.x) / rx, (p.y - centre.y) / ry, (p.z - centre.z) / rx); const depth = out.length(); out.set(out.x / rx, out.y / ry, out.z / rx).normalize();
    if (species === "acacia") { // sprays held flat, reaching out along the twig
      u.set(along.x + (rand() - .5) * 1.2, 0, along.z + (rand() - .5) * 1.2).normalize(); u.y = (rand() - .4) * .4; n.set((rand() - .5) * .9, 1, (rand() - .5) * .9);
      p.x += (rand() - .5) * .14; p.y += (rand() - .5) * .06; p.z += (rand() - .5) * .14;
    } else if (species === "poplar") { // round leaves hanging on long stalks, turned every way
      u.set((rand() - .5) * 2, -.6 - rand(), (rand() - .5) * 2); n.set(rand() - .5, rand() - .5, rand() - .5).addScaledVector(out, .5);
      p.x += (rand() - .5) * .5; p.y += (rand() - .5) * .4; p.z += (rand() - .5) * .5; // filling the column between the branchlets
    } else { // broad leaves tipped outward and drooping a little
      u.copy(out).multiplyScalar(.8).add(V((rand() - .5) * 1.4, (rand() - .5) * 1.2 - .35, (rand() - .5) * 1.4)); n.copy(out).add(V((rand() - .5) * 1.2, .5 + (rand() - .5) * 1.2, (rand() - .5) * 1.2));
      const jitter = species === "fig" ? .32 : .06; p.x += (rand() - .5) * jitter; p.y += (rand() - .5) * jitter; p.z += (rand() - .5) * jitter;
    }
    if (litter) { u.set(rand() - .5, 0, rand() - .5); n.set((rand() - .5) * .3, 1, (rand() - .5) * .3); }
    u.normalize(); if (n.dot(out) < 0 && species !== "acacia" && !litter) n.negate();
    v.copy(u).cross(n).normalize(); n.copy(v).cross(u).normalize(); v.copy(u).cross(n); // u along the leaf, n its upper face, v across it, so the front face looks along n
    const sizeK = (.75 + rand() * .5) * grain, length = spec.length * sizeK, width = spec.width * sizeK;
    nn.copy(n).lerp(out, litter ? 0 : spec.outward).normalize();
    const ao = litter ? .75 : 1 - spec.depth * (1 - (.42 + .58 * smooth(.2, 1, depth)) * (.75 + .25 * Math.min(1, Math.max(0, out.y * .5 + .5))));
    tint.copy(dark!).lerp(light!, rand()); if (rand() < .06 || litter) tint.lerp(litter ? fallen : dry, litter ? .5 + rand() * .4 : .6); tint.multiplyScalar((.85 + rand() * .3) * ao);
    if (!litter) tint.multiplyScalar(1 + .25 * Math.sin(p.x * 1.7 + p.y * .9) * Math.sin(p.z * 1.9 - p.y * 1.3 + 1.7)); // clumps of light and shade, still seen when single leaves are not
    const sway = spec.sway * Math.pow(Math.min(1.2, Math.max(0, p.y / (species === "bush" ? .6 * size : size))), 2) * (species === "bush" ? 1 : size / spec.ref), phase = phases[lowIndex]! + rand() * .15, moves = litter ? 0 : sway;
    for (let q = 0; q < 4; q++) {
      const across = q === 1 || q === 2 ? .5 : -.5, up = q >= 2 ? 1 : 0;
      corner.copy(p).addScaledVector(v, across * width).addScaledVector(u, up * length);
      position.set([corner.x * c + corner.z * s + at.x, corner.y + at.y, -corner.x * s + corner.z * c + at.z], (k * 4 + q) * 3);
      normal.set([nn.x * c + nn.z * s, nn.y, -nn.x * s + nn.z * c], (k * 4 + q) * 3);
      uv.set([across + .5, up], (k * 4 + q) * 2); color.set([tint.r, tint.g, tint.b], (k * 4 + q) * 3); leaf.set([phase, moves, grain], (k * 4 + q) * 3);
    }
  }
  return { position, normal, uv, color, leaf, count };
}

// The leaf shader, added to a standard material and to the matching shadow materials so shadows fall through the same holes.
const LEAF_VERTEX = `uniform float time, wind; attribute vec3 leaf; varying vec4 vCard;
  float leafFlap(){ return sin(time * float(FLUTTER) + leaf.x * 6.283) * (.55 + .45 * sin(time * 2.3 + leaf.x * 40.)); }
  vec3 leafMove(){ float gust = sin(time * 1.5 + position.x * .31 + position.z * .27) * .6 + sin(time * .6 + position.z * .09 + position.x * .05) * .9;
    return (vec3(1., 0., .35) * (gust * .6 + .5) * leaf.y + normal * leafFlap() * float(FLAP) * uv.y) * wind; }`;
const LEAF_FRAGMENT = `varying vec4 vCard; float leafVein;
  float leafHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  // Coverage of the card at this point: above .5 is leaf. A card may hold several leaves (vCard.z across), a few left out while they are big enough to see.
  float leafMask(){
    vec2 q = vCard.xy * vCard.z, u = fract(q); leafVein = 0.;
    float px = fwidth(q.y), blur = smoothstep(.35, .8, px * 8.), tiny = smoothstep(.12, .45, px); // leaves per pixel, taken before any branch, where derivatives are still defined
    if (vCard.z > 1.01) { float k = leafHash(floor(q) + vCard.w * 7.); if (k < .2 * (1. - tiny)) return 0.; u = (u - .5) * mix(1.1 + .3 * k, 1., tiny) + .5; if (k > .6) u.x = 1. - u.x; }
    float x = abs(u.x - .5), y = u.y, d;
  #if KIND == 0
    float env = .45 * sin(3.1416 * clamp(y * 1.05 - .02, 0., 1.)), r = y * 8. - x * 5., band = abs(fract(r) - .5) / 8.; // a stalk with rows of fine leaflets swept toward the tip
    d = max(min(.028 * (1. - .5 * x / max(env, .01)) - band, env - x), .014 - x);
    d = mix(d, env * .7 - x, blur); // too small to see the leaflets: only the outline of the spray
  #elif KIND == 1
    float t = (y - .1) / .9, w = .47 * pow(max(sin(PI * pow(clamp(t, 0., 1.), .72)), 0.), .85); // a broad leaf with a pointed tip on a short stalk; sin(PI) is a hair below 0 and pow of it is NaN
    d = y < .1 ? .028 - x : w - x; leafVein = (1. - smoothstep(0., .02, x)) * step(.1, y);
  #elif KIND == 2
    float t = (y - .34) / .66, w = .5 * max(sin(PI * pow(clamp(t, 0., 1.), .58)), 0.); // a round leaf, broadest near its base, on a long stalk
    d = y < .34 ? .022 - x : w - x; leafVein = (1. - smoothstep(0., .02, x)) * step(.34, y) * .6;
  #else
    d = .34 * sin(3.1416 * clamp(y, 0., 1.)) - x; // small narrow leaves
  #endif
    d = mix(d, .42 - length(vec2(x, (y - .5) * 1.1)), tiny); // a leaf only a few pixels across is drawn as the blob it would blur to, so far crowns keep their mass
    // The edge ramps over about two pixels however small the leaf: a steeper ramp jumps by more than 1 between neighbouring pixels, and
    // alpha to coverage, which spreads alpha over fwidth(alpha), then leaves only a sample or two of a far leaf.
    return .5 + min(d, min(y, 1. - y)) / max(2. * px, 1. / 6.);
  }`;
// The physical direct light, with a soft wrap on the diffuse part and the light that comes through a leaf from behind. The wrap must not reach the
// specular part: there light past the terminator meets a view at a grazing angle, and the GGX visibility term (1 / dotNV) runs away to white.
const LEAF_LIGHT = THREE.ShaderChunk.lights_physical_pars_fragment
  .replace("float dotNL = saturate( dot( geometryNormal, directLight.direction ) );", "float facing = dot( geometryNormal, directLight.direction ), dotNL = saturate( ( facing + .3 ) / 1.3 );")
  .replace("reflectedLight.directSpecular += irradiance * BRDF_GGX(", "reflectedLight.directSpecular += saturate( facing ) * directLight.color * BRDF_GGX(")
  .replace("reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );", `reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
    reflectedLight.directDiffuse += directLight.color * (saturate(-facing) * .6 + pow(saturate(-dot(geometryViewDir, directLight.direction)), 3.)) * float(THROUGH) * BRDF_Lambert(material.diffuseColor * vec3(1.05, 1.2, .45));`);
// Far trees take on a little haze beyond the fog, so a distant crown against the dawn is not a black cut-out; but however the haze,
// fog and fill stack, a far crown stays below 80% of the fog's brightness, a green clearly darker than the sky behind it.
const LEAF_HAZE = `#ifdef USE_FOG
float leafFar = 1. - exp(-vFogDepth * .01);
gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor + .01, .15 * leafFar);
#endif
#include <fog_fragment>
#ifdef USE_FOG
float leafLum = dot(gl_FragColor.rgb, vec3(.2126, .7152, .0722)), leafCap = .8 * dot(fogColor, vec3(.2126, .7152, .0722)) + .002;
gl_FragColor.rgb *= mix(1., min(1., leafCap / max(leafLum, 1e-5)), leafFar);
#endif`;

function leafMaterials(species: Leafy, kit: Kit, wind: Wind, fill: { value: number }) {
  const time = kit.still ? { value: 0 } : wind.time, defines = Object.fromEntries(Object.entries(SPECIES[species].shader).map(([k, v]) => [k, k === "KIND" ? String(v) : v.toFixed(3)]));
  const hook = (material: THREE.Material & { defines?: Record<string, string> }, lit: boolean) => {
    material.defines = defines; material.customProgramCacheKey = () => `leaf-${species}-${lit}`;
    material.onBeforeCompile = (shader) => {
      shader.uniforms.time = time; shader.uniforms.wind = wind.wind; shader.uniforms.fill = fill;
      shader.vertexShader = shader.vertexShader.replace("#include <common>", `#include <common>\n${LEAF_VERTEX}`)
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvCard = vec4(uv, leaf.z, leaf.x); transformed += leafMove();")
        .replace("#include <beginnormal_vertex>", lit ? "#include <beginnormal_vertex>\nobjectNormal = normalize(objectNormal + vec3(.7, .3, -.6) * leafFlap() * float(SHIMMER) * wind);" : "#include <beginnormal_vertex>");
      shader.fragmentShader = shader.fragmentShader.replace("#include <common>", `#include <common>\n${LEAF_FRAGMENT}`);
      shader.fragmentShader = lit
        ? shader.fragmentShader.replace("#include <lights_physical_pars_fragment>", LEAF_LIGHT).replace("#include <fog_fragment>", LEAF_HAZE)
          .replace("#include <color_fragment>", "#include <color_fragment>\nfloat leafA = leafMask(); diffuseColor.rgb *= (1. - .3 * leafVein) * (gl_FrontFacing ? 1. : float(BACK)); diffuseColor.a = leafA;")
          .replace("#include <normal_fragment_begin>", "#include <normal_fragment_begin>\nnormal = normalize(vNormal); // both faces lit as the outside of the crown")
          .replace("#include <lights_physical_fragment>", "#include <lights_physical_fragment>\nmaterial.specularColor *= .5; material.specularF90 = .3; // a leaf is not a mirror, even edge on")
          .replace("#include <lights_fragment_end>", "#include <lights_fragment_end>\nreflectedLight.indirectDiffuse *= fill;").replace("void main() {", "uniform float fill;\nvoid main() {")
          .replace("#include <opaque_fragment>", "outgoingLight = all(lessThan(abs(outgoingLight), vec3(1e4))) ? min(outgoingLight, vec3(6.)) : vec3(0.); // never a hot or broken pixel\n#include <opaque_fragment>")
        : shader.fragmentShader.replace("#include <alphatest_fragment>", "diffuseColor.a = leafMask();\n#include <alphatest_fragment>");
    };
    return kit.own(material);
  };
  return {
    material: hook(new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: .85, metalness: 0, alphaTest: .5, alphaToCoverage: !kit.small }), true),
    depth: hook(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }), false),
    distance: hook(new THREE.MeshDistanceMaterial(), false),
  };
}

/** Plants trees and bushes. Wood joins the static scenery through `kit.stand`; leaves are gathered by species and stretch of road and drawn by `finish`. */
export function buildForest(kit: Kit, wind: Wind = { time: { value: 0 }, wind: { value: 1 } }) {
  const groups = new Map<string, { species: Leafy; parts: Cards[] }>();
  const plant: Plant = (species, x, s, size, detail = 1) => {
    const rand = sequence(Math.floor(x * 7919 + s * 104729) >>> 0), d = kit.small ? detail * .5 : detail, turn = rand() * 6.283, c = Math.cos(turn), sn = Math.sin(turn), base = kit.floor(x, -s);
    const ground = (lx: number, lz: number) => kit.floor(x + c * lx + sn * lz, -s - sn * lx + c * lz) - base; // as kit.stand turns and places it
    const tree = grow(species, size, d, rand, ground);
    kit.stand(wood(species, tree.all, d, rand, ground), x, s, turn);
    if (species !== "bush" && species !== "deadbush") kit.blocks.push([x, s, tree.trunk * 1.6 + .25]);
    if (species === "deadbush") return;
    const key = `${species}:${Math.floor(s / 90)}`, group = groups.get(key) ?? { species, parts: [] }; groups.set(key, group);
    group.parts.push(cards(species, tree.bearers, size, d, rand, turn, V(x, base, -s), ground));
  };
  function finish() {
    // three gives a standard material without its own map the scene's environmentIntensity, which world.ts keeps at .4 by day: too little sky light under a
    // crown seen against the sun. The leaves take up to half as much again by day (by night the scene's own 1.3 stands).
    const materials = new Map<Leafy, ReturnType<typeof leafMaterials>>(), fill = { value: 1 }, lift = () => { fill.value = Math.min(1.5,Math.max(1, 1.1 / Math.max(kit.scene.environmentIntensity, .01))); };
    for (const { species, parts } of groups.values()) {
      const count = parts.reduce((sum, part) => sum + part.count, 0), geometry = kit.own(new THREE.BufferGeometry());
      for (const [name, size] of [["position", 3], ["normal", 3], ["uv", 2], ["color", 3], ["leaf", 3]] as const) {
        const data = new Float32Array(count * 4 * size); let o = 0; for (const part of parts) { data.set(part[name], o); o += part[name].length; }
        geometry.setAttribute(name, new THREE.BufferAttribute(data, size));
      }
      const index = new Uint32Array(count * 6); for (let k = 0; k < count; k++) index.set([k * 4, k * 4 + 1, k * 4 + 2, k * 4, k * 4 + 2, k * 4 + 3], k * 6);
      geometry.setIndex(new THREE.BufferAttribute(index, 1)); geometry.computeBoundingSphere();
      const look = materials.get(species) ?? leafMaterials(species, kit, wind, fill); materials.set(species, look);
      const mesh = new THREE.Mesh(geometry, look.material); mesh.customDepthMaterial = look.depth; mesh.customDistanceMaterial = look.distance;
      mesh.castShadow = mesh.receiveShadow = true; mesh.onBeforeRender = lift; kit.scene.add(mesh);
    }
    groups.clear();
  }
  return { plant, finish };
}
