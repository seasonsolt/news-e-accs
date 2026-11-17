import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { noise } from "./land.ts";

// The walk's one way of drawing things: shapes made in code, no image files. Faces are painted one by one, then smoothed: normals and colours are shared
// across welded corners except over a crease, so stone is round where it is worn and sharp where it broke. Every shape here comes back with `position`,
// `normal`, `color` and `surface` (what it is made of: 0 plain, 1 stone, 2 bark and wood, 3 earth and thatch, 4 leaf, 5 skin, 6 cloth, 7 hair and fur), so any of them merge into one mesh
// drawn by the shared material in surface.ts, which adds the grain.

/** The colour of a face, from where it is and which way it looks. The returned colour is read at once, so a paint may reuse one. `surface` is what it paints. */
export interface Paint { (center: THREE.Vector3, normal: THREE.Vector3, face: number): THREE.Color; surface?: number }
/** Tags a paint with what it paints (see the list above). */
export const of = (surface: number, paint: Paint): Paint => Object.assign(paint, { surface });

const first = new THREE.Color(), second = new THREE.Color();
/** Runs from `low` on faces turned down to `high` on faces turned up, a little different from face to face. */
export const lit = (low: string, high: string, rand: () => number, vary = .16): Paint =>
  (_center, normal) => first.set(low).lerp(second.set(high), normal.y * .5 + .5).multiplyScalar(1 - vary / 2 + rand() * vary);
export const flat = (color: string, rand: () => number, vary = .14): Paint => () => first.set(color).multiplyScalar(1 - vary / 2 + rand() * vary);

/** Numbers the distinct points among `p`'s corners (to a tenth of a millimetre): `id` is each corner's point. Hashed, so it stays linear. */
function weld(p: ArrayLike<number>) {
  const count = p.length / 3, mask = (1 << Math.ceil(Math.log2(count * 2 + 2))) - 1, table = new Int32Array(mask + 1).fill(-1), keys = new Int32Array(count * 3), id = new Int32Array(count);
  let points = 0;
  for (let i = 0; i < count; i++) {
    const x = Math.round(p[i * 3]! * 1e4), y = Math.round(p[i * 3 + 1]! * 1e4), z = Math.round(p[i * 3 + 2]! * 1e4);
    for (let h = (Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(z, 83492791)) & mask; ; h = (h + 1) & mask) {
      const k = table[h]!;
      if (k < 0) { table[h] = points; keys[points * 3] = x; keys[points * 3 + 1] = y; keys[points * 3 + 2] = z; id[i] = points++; break; }
      if (keys[k * 3] === x && keys[k * 3 + 1] === y && keys[k * 3 + 2] === z) { id[i] = k; break; }
    }
  }
  return { id, points };
}

/** Paints each face, then gives every corner the normal and colour of the faces around it that meet it at under `crease` radians (colours under `blend`).
 * Plain surfaces keep a hard line between faces whose colours differ a lot, so painted bands and weaves stay crisp. Takes over `source`. */
function build(source: THREE.BufferGeometry, paint: Paint, surface: number, crease: number, blend = crease) {
  const g = source.index ? source.toNonIndexed() : source; if (g !== source) source.dispose();
  for (const name of Object.keys(g.attributes)) if (name !== "position") g.deleteAttribute(name);
  const p = g.attributes.position!.array as Float32Array, count = p.length / 3, faces = count / 3;
  const area = new Float32Array(count), unit = new Float32Array(count), tint = new Float32Array(count), center = new THREE.Vector3(), normal = new THREE.Vector3();
  for (let f = 0, o = 0; f < faces; f++, o += 9) {
    const ux = p[o + 3]! - p[o]!, uy = p[o + 4]! - p[o + 1]!, uz = p[o + 5]! - p[o + 2]!, vx = p[o + 6]! - p[o]!, vy = p[o + 7]! - p[o + 1]!, vz = p[o + 8]! - p[o + 2]!;
    normal.set(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx); normal.toArray(area, f * 3); normal.normalize(); normal.toArray(unit, f * 3);
    center.set((p[o]! + p[o + 3]! + p[o + 6]!) / 3, (p[o + 1]! + p[o + 4]! + p[o + 7]!) / 3, (p[o + 2]! + p[o + 5]! + p[o + 8]!) / 3);
    paint(center, normal, f).toArray(tint, f * 3);
  }
  // the faces at each welded point
  const { id, points } = weld(p), start = new Int32Array(points + 1), around = new Int32Array(count);
  for (let i = 0; i < count; i++) start[id[i]! + 1]!++;
  for (let k = 0; k < points; k++) start[k + 1]! += start[k]!;
  const fill = start.slice(0, points); for (let i = 0; i < count; i++) around[fill[id[i]!]!++] = (i / 3) | 0;
  const normals = new Float32Array(count * 3), colors = new Float32Array(count * 3), sharp = Math.cos(crease), soft = Math.cos(blend);
  const near = (a: number, b: number) => { for (let c = 0; c < 3; c++) { const x = tint[a + c]!, y = tint[b + c]!; if ((Math.max(x, y) + .02) / (Math.min(x, y) + .02) > 1.45) return false; } return true; };
  for (let i = 0; i < count; i++) {
    const f = ((i / 3) | 0) * 3; let nx = 0, ny = 0, nz = 0, r = 0, gr = 0, b = 0, n = 0;
    for (let j = start[id[i]!]!; j < start[id[i]! + 1]!; j++) {
      const o = around[j]! * 3, d = unit[f]! * unit[o]! + unit[f + 1]! * unit[o + 1]! + unit[f + 2]! * unit[o + 2]!;
      if (o === f || d >= sharp) { nx += area[o]!; ny += area[o + 1]!; nz += area[o + 2]!; }
      if (o === f || (d >= soft && (surface || near(f, o)))) { r += tint[o]!; gr += tint[o + 1]!; b += tint[o + 2]!; n++; }
    }
    const l = Math.hypot(nx, ny, nz);
    normals.set(l > 0 ? [nx / l, ny / l, nz / l] : [0, 1, 0], i * 3); // only a face with no area has no normal
    colors.set([r / n, gr / n, b / n], i * 3);
  }
  g.setAttribute("normal", new THREE.BufferAttribute(normals, 3)); g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  g.setAttribute("surface", new THREE.BufferAttribute(new Float32Array(count).fill(surface), 1));
  return g;
}

/** Paints a shape face by face and smooths it, keeping edges sharper than about 50° (a box stays a box). Takes over `source`. */
export const faceted = (source: THREE.BufferGeometry, paint: Paint, surface = paint.surface ?? 0) => build(source, paint, surface, .9);
/** The same, smooth wherever faces meet at under about 70°: skin, cloth and fur. Takes over `source`. */
export const smoothed = (source: THREE.BufferGeometry, paint: Paint, surface = paint.surface ?? 0) => build(source, paint, surface, 1.2);
export function merged(parts: THREE.BufferGeometry[]) { const g = mergeGeometries(parts, false)!; for (const part of parts) part.dispose(); return g; }
/** Loose triangles, each lit flat; colours still blend between neighbours that lie nearly level with each other. */
export const triangles = (positions: number[], paint: Paint) => build(new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(positions, 3)), paint, paint.surface ?? 0, 0, 1.05);

const lattice = (x: number, y: number, z: number) => { const n = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return n - Math.floor(n); };
/** Smooth value noise in [0, 1] over space. */
function noise3(x: number, y: number, z: number) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z), fx = x - ix, fy = y - iy, fz = z - iz, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz);
  const plane = (z: number) => { const a = lattice(ix, iy, z), b = lattice(ix + 1, iy, z), c = lattice(ix, iy + 1, z), d = lattice(ix + 1, iy + 1, z); return a + (b - a) * u + (c - a + (a - b - c + d) * u) * v; };
  const near = plane(iz); return near + (plane(iz + 1) - near) * w;
}

const SOIL = new THREE.Color("#6b5843"), smooth = THREE.MathUtils.smoothstep;
/** A stone resting on y = 0, about a unit across (1.1 at its widest), its foot a little under the ground. It has a grain: beds stacked along one direction
 * and joints across them, so it weathers into blocky ledges and overhangs, splits along the joints in a few flat breaks with sharp edges, and has chips
 * knocked off its corners. Darker in its hollows and damp at the foot, where it takes on the colour of the soil. A third of the pebbles are water-worn
 * and round instead. `detail` 0 is a pebble (80 triangles), 1 a loose stone (500), 2 a boulder broken into an outcrop of three or so blocks (about 4400). */
export function rock(rand: () => number, detail: number, paint: Paint): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(1, [1, 4, 12][detail] ?? 1), p = g.attributes.position!, { id, points } = weld(p.array), V = THREE.Vector3;
  const seed = rand() * 50, worn = !detail && rand() < .33, turn = rand() * 6.283;
  const bed = new V((rand() - .5) * .7, 1, (rand() - .5) * .7).normalize(), joint = new V(Math.cos(turn), 0, Math.sin(turn)).cross(bed).normalize(), side = bed.clone().cross(joint);
  const ej = .9 + rand() * .3, eb = .72 + rand() * .3, es = 1, pw = worn ? 2 : 2.4 + rand() * 1.6, thick = detail > 1 ? .2 + rand() * .1 : .3 + rand() * .15, phase = rand();
  const inset = (layer: number) => .84 + .2 * lattice(layer, seed, 3), grooves = Array.from({ length: detail > 1 ? 2 : detail && rand() < .5 ? 1 : 0 }, () => ({ at: (rand() - .5) * .9, w: .05 + rand() * .03 }));
  const at = new Float32Array(points * 3), hollow = new Float32Array(points), done = new Uint8Array(points), v = new V();
  for (let c = 0; c < p.count; c++) { // shape each point once: the blocky body, weathered, stepped into beds, grooved along the joints
    const i = id[c]!; if (done[i]) continue; done[i] = 1; v.fromBufferAttribute(p, c);
    let j = v.dot(joint), b = v.dot(bed), s = v.dot(side); const sup = (Math.abs(j) ** pw + Math.abs(b) ** pw + Math.abs(s) ** pw) ** (1 / pw);
    const n = (k: number, o: number) => noise3(v.x * k + seed + o, v.y * k + o, v.z * k - seed) - .5, w = 1 + n(1.3, 0) * .16 + n(3.1, 9) * .07 + (detail ? n(7, 3) * .035 : 0) + (detail > 1 ? n(17, 5) * .012 : 0);
    j *= ej * w / sup; b *= eb * w / sup; s *= es * w / sup;
    if (detail && !worn) { const t = b / thick + phase, layer = Math.floor(t), step = smooth(t - layer, .8, .96), k = inset(layer) + (inset(layer + 1) - inset(layer)) * step; j *= k; s *= k; hollow[i] = Math.max(0, inset(layer + 1) - inset(layer)) * 2 * (1 - step); }
    for (const groove of grooves) { const d = Math.abs(j - groove.at); if (d < groove.w) { const q = 1 - .07 * (1 - d / groove.w); b *= q; s *= q; hollow[i] = Math.max(hollow[i]!, 1 - d / groove.w); } }
    v.copy(joint).multiplyScalar(j).addScaledVector(bed, b).addScaledVector(side, s).toArray(at, i * 3);
  }
  // breaks along the joints and beds, then a few chips off the corners, each set by how far the stone reaches that way
  const reach = (dir: THREE.Vector3) => { let most = -Infinity; for (let i = 0; i < points; i++) most = Math.max(most, dir.x * at[i * 3]! + dir.y * at[i * 3 + 1]! + dir.z * at[i * 3 + 2]!); return most; };
  const tilt = (dir: THREE.Vector3, by: number) => dir.clone().add(new V(rand() - .5, rand() - .5, rand() - .5).multiplyScalar(by)).normalize();
  const planes = [joint, joint.clone().negate(), side, side.clone().negate(), bed], cuts: Array<{ n: THREE.Vector3; d: number }> = [];
  for (let k = worn ? 0 : detail ? 2 + Math.floor(rand() * 3) : 1 + Math.floor(rand() * 2); k > 0; k--) { const n = tilt(planes[Math.floor(rand() * planes.length)]!, .35); cuts.push({ n, d: reach(n) * (.62 + rand() * .18) }); }
  for (let k = detail && !worn ? 2 + Math.floor(rand() * 2) : 0; k > 0; k--) { const n = new V(rand() - .5, rand() * .8, rand() - .5).normalize(); cuts.push({ n, d: reach(n) * (.88 + rand() * .05) }); }
  const broken = new Uint8Array(points); let low = Infinity, high = -Infinity;
  for (let i = 0; i < points; i++) {
    v.fromArray(at, i * 3); for (const cut of cuts) { const over = v.dot(cut.n) - cut.d; if (over > 0) { v.addScaledVector(cut.n, -over); broken[i] = 1; } }
    v.toArray(at, i * 3); low = Math.min(low, v.y); high = Math.max(high, v.y);
  }
  // a flat foot sunk a little into the ground, then sized so the widest point is 1.1 out
  const base = low + (high - low) * .18, tall = high - base; let wide = 0;
  for (let i = 0; i < points; i++) {
    const y = Math.max(at[i * 3 + 1]!, base) - base, spread = 1 + .08 * (1 - smooth(y, 0, tall * .14));
    at[i * 3] = at[i * 3]! * spread; at[i * 3 + 2] = at[i * 3 + 2]! * spread; at[i * 3 + 1] = y - tall * .05; wide = Math.max(wide, Math.hypot(at[i * 3]!, at[i * 3 + 2]!));
  }
  const size = 1.1 / wide;
  for (let i = 0; i < at.length; i++) at[i] = at[i]! * size;
  for (let c = 0; c < p.count; c++) { const i = id[c]!; p.setXYZ(c, at[i * 3]!, at[i * 3 + 1]!, at[i * 3 + 2]!); }
  const h = tall * size, mark = new Float32Array(points * 4); // per point: warm-to-grey patch, shade, how much soil
  for (let i = 0; i < points; i++) {
    const x = at[i * 3]!, y = at[i * 3 + 1]!, z = at[i * 3 + 2]!, damp = 1 - smooth(y, 0, h * .15);
    const k = THREE.MathUtils.clamp(1 - hollow[i]! * .4 + (noise3(x * 5 - seed, y * 5, z * 5) - .5) * .25, .6, 1.12) * (broken[i] ? 1.05 : 1) * (1 - .42 * damp);
    mark.set([noise3(x * .8 + seed, y * .8, z * .8), k, (1 - smooth(y, -h * .02, h * .05)) * .75], i * 4);
  }
  const out = faceted(g, paint), color = out.attributes.color!, tint = new THREE.Color(), hue = new THREE.Color();
  for (let c = 0; c < color.count; c++) {
    const o = id[c]! * 4, patch = mark[o]!;
    tint.fromBufferAttribute(color, c).multiply(hue.setRGB(1.06 - patch * .12, .98 - patch * .01, .9 + patch * .12)).multiplyScalar(mark[o + 1]!).lerp(SOIL, mark[o + 2]!);
    color.setXYZ(c, tint.r, tint.g, tint.b);
  }
  if (detail < 2) return out;
  const along = new V(joint.x, 0, joint.z).normalize(), parts = [out]; // split off along a joint: one or two blocks lying against the foot
  for (let k = 1 + Math.floor(rand() * 2); k > 0; k--) {
    const sign = k === 1 ? 1 : -1, s = .3 + rand() * .25, spot = along.clone().multiplyScalar(sign * (.85 + rand() * .3)).applyAxisAngle(new V(0, 1, 0), (rand() - .5) * .8);
    parts.push(rock(rand, 1, paint).scale(s, s * (.6 + rand() * .4), s).rotateZ((rand() - .5) * .5).rotateY(rand() * 6.3).translate(spot.x, -s * .06, spot.z));
  }
  return merged(parts);
}

/** Blackens the faces of a shape that look toward a fire at `at`, most where they are close: soot on a hearth stone. Call it once the shape is in place. */
export function scorch(shape: THREE.BufferGeometry, at: THREE.Vector3, reach = 1.6) {
  const p = shape.attributes.position!, n = shape.attributes.normal!, color = shape.attributes.color!, d = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    d.set(at.x - p.getX(i), at.y - p.getY(i), at.z - p.getZ(i)); const far = d.length(); d.divideScalar(far || 1);
    const k = 1 - .88 * smooth(d.x * n.getX(i) + d.y * n.getY(i) + d.z * n.getZ(i), -.3, .6) * (1 - smooth(far, reach * .35, reach));
    color.setXYZ(i, color.getX(i) * k, color.getY(i) * k, color.getZ(i) * k);
  }
  return shape;
}

/** What lies at the foot of a boulder `size` metres across: broken stones and a low drift of sand heaped on one side (`side`, an angle in the xz plane from +x
 * toward +z). Stand it where the boulder stands, unturned. */
export function scree(rand: () => number, size: number, stone: Paint, sand: Paint, side = rand() * 6.283) {
  const parts: THREE.BufferGeometry[] = [];
  for (let k = 4 + Math.floor(rand() * 4); k > 0; k--) {
    const a = side + (rand() - .5) * 2.2, r = size * (.47 + rand() * .15), s = size * (.03 + rand() * rand() * .09);
    parts.push(rock(rand, 0, stone).scale(s * (1 + rand() * .5), s * .7, s).rotateY(rand() * 6.3).translate(Math.cos(a) * r, -s * .1, Math.sin(a) * r));
  }
  parts.push(blob(rand, [size * .3, size * .045, size * .17], sand, 1, .3, 0).rotateY(-side - Math.PI / 2).translate(Math.cos(side) * size * .45, -.03, Math.sin(side) * size * .45));
  return merged(parts);
}

/** A soft mass (a crown of leaves, a bush, a head), centred on the origin and flat underneath when `under` is above -1. */
export function blob(rand: () => number, size: [number, number, number], paint: Paint, detail = 1, rough = .3, under = -1) {
  const g = new THREE.IcosahedronGeometry(1, detail), p = g.attributes.position!, v = new THREE.Vector3(), seed = rand() * 50;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).multiplyScalar(1 - rough / 2 + noise(v.x * 2.1 + v.z + seed, v.y * 2.1 + v.z * 1.4) * rough);
    p.setXYZ(i, v.x * size[0], Math.max(v.y, under) * size[1], v.z * size[2]);
  }
  return build(g, paint, paint.surface ?? 0, 1.2);
}

const heart = new THREE.Color(), PALE = new THREE.Color(1.9, 1.65, 1.25);
interface LimbShape { sides?: number; sag?: number; capped?: boolean; rand?: () => number }
/** A piece of wood, an arm or a pole: a round tube from one point to another that tapers from `radius` to `tip` and bends a little on the way.
 * `sides` is the old faceted count; the tube is drawn rounder than that. Wood is a little irregular along its length and shows pale heartwood at cut ends. */
export function limb(from: THREE.Vector3, to: THREE.Vector3, radius: number, tip: number, paint: Paint, { sides = 5, sag = 0, capped = false, rand }: LimbShape = {}) {
  const wood = paint.surface === 2, round = Math.max(sides + 3, Math.round(sides * 1.6)), length = from.distanceTo(to), middle = from.clone().lerp(to, .5), seed = (from.x * 7.3 + to.z * 3.1 + to.y) % 50;
  if (sag && rand) middle.add(new THREE.Vector3(rand() - .5, rand() * .3, rand() - .5).multiplyScalar(length * sag));
  const curve = new THREE.CatmullRomCurve3([from, middle, to]), rings = Math.min(12, Math.max(sag ? Math.max(3, Math.round(length * 1.6)) : 1, wood ? Math.ceil(length * 2.5) : 1)), frames = curve.computeFrenetFrames(rings, false);
  const at = (ring: number, side: number) => {
    const angle = side / round * Math.PI * 2, c = Math.cos(angle), s = Math.sin(angle), r = THREE.MathUtils.lerp(radius, tip, ring / rings) * (wood ? .93 + .14 * noise(c * 1.3 + seed, s * 1.3 + ring * .8) : 1);
    return curve.getPointAt(ring / rings).addScaledVector(frames.normals[ring]!, c * r).addScaledVector(frames.binormals[ring]!, s * r);
  };
  const positions: number[] = [], push = (...points: THREE.Vector3[]) => { for (const point of points) positions.push(point.x, point.y, point.z); };
  for (let ring = 0; ring < rings; ring++) for (let side = 0; side < round; side++) {
    const a = at(ring, side), b = at(ring, side + 1), c = at(ring + 1, side + 1), d = at(ring + 1, side);
    push(a, b, c, a, c, d);
  }
  const wall = rings * round * 2;
  if (capped) for (let side = 0; side < round; side++) { push(from, at(0, side + 1), at(0, side)); push(to, at(rings, side), at(rings, side + 1)); }
  const ends: Paint = wood && capped ? (center, normal, face) => face < wall ? paint(center, normal, face) : heart.copy(paint(center, normal, face)).multiply(PALE) : paint;
  return build(new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(positions, 3)), ends, paint.surface ?? 0, 1.2);
}

/** A shape turned on a wheel: a pot, a basket, a clay bin. `profile` is [radius, height] from the bottom up. Smooth round the wheel, sharp at a rim. */
export const turned = (profile: Array<[number, number]>, sides: number, paint: Paint) => build(new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), sides), paint, paint.surface ?? 0, 1);
