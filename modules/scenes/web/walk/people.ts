import * as THREE from "three";
import { noise, sequence } from "./land.ts";
import { merged, smoothed } from "./shapes.ts";

// The people and animals of the walk, posed by where their joints are. Each part of a body is a tube skinned along its joints whose cross-section changes
// on the way (the swell of a calf, the flat of a wrist, the deep chest), sunk into the next part so there are no seams; the head is a skull shaped by hand,
// with brow, sockets, cheekbones, nose, lips, chin and ears. Clothes, hair, beards and hats are shells laid over that, hanging and folding where they are
// free. Skin, cloth and hair are tagged 5, 6 and 7 for the shared material's fine detail (pores, weave, strands).

export type Point = [number, number, number];
/** Where the joints are, for someone facing +z with the ground at y = 0. Pairs are left then right. `grip` closes each hand (0 open, 1 a fist round what it
 * holds, default .3); a hand that holds something gives `hold`, which way its thumb points along it. `palm` is which way an open hand faces (default: in
 * toward the thigh). `look` is a point the face turns to. */
export interface Pose {
  hip: Point; chest: Point; head: Point; elbows: [Point, Point]; hands: [Point, Point]; knees: [Point, Point]; feet: [Point, Point];
  grip?: [number, number]; hold?: [Point | null, Point | null]; palm?: [Point | null, Point | null]; look?: Point;
}
export const POSES = {
  // sitting with the knees up and both hands held out to the fire, a little hunched
  warm: { hip: [0, .2, 0], chest: [0, .64, .17], head: [.01, .89, .27], elbows: [[-.27, .46, .3], [.27, .45, .29]], hands: [[-.13, .52, .58], [.13, .49, .57]], knees: [[-.2, .48, .4], [.21, .47, .41]], feet: [[-.18, .04, .66], [.19, .04, .64]], grip: [.25, .3], palm: [[.2, -.2, 1], [-.2, -.25, 1]], look: [0, .3, 1.7] },
  // squatting, one hand on a knee, the other holding a stick into the fire
  tend: { hip: [0, .3, 0], chest: [0, .71, .21], head: [.01, .94, .33], elbows: [[-.28, .5, .25], [.3, .56, .4]], hands: [[-.22, .55, .42], [.27, .5, .68]], knees: [[-.22, .53, .38], [.22, .53, .38]], feet: [[-.18, .04, .3], [.18, .04, .3]], grip: [.35, 1], palm: [[.1, -1, .1], null], hold: [null, [-.11, -.23, .97]], look: [.15, .15, 1.5] },
  // standing watch, the weight on the spear side
  watch: { hip: [.02, .84, 0], chest: [0, 1.29, .03], head: [-.01, 1.54, .06], elbows: [[-.24, 1.03, -.03], [.27, 1.02, .1]], hands: [[-.25, .8, .04], [.3, 1.1, .3]], knees: [[-.1, .45, .06], [.11, .45, .03]], feet: [[-.12, .04, -.02], [.11, .04, .04]], grip: [.3, 1], hold: [null, [0, 1, 0]], look: [-.3, 1.4, 8] },
  // standing at ease, the weight on one leg
  stand: { hip: [.015, .95, 0], chest: [0, 1.39, .03], head: [0, 1.64, .06], elbows: [[-.25, 1.08, -.01], [.25, 1.08, 0]], hands: [[-.27, .81, .06], [.27, .82, .07]], knees: [[-.1, .5, .04], [.11, .5, .08]], feet: [[-.12, .04, -.01], [.12, .04, .07]] },
  // walking with both hands up, steadying a load on the head
  carry: { hip: [0, .95, 0], chest: [0, 1.39, .03], head: [0, 1.64, .05], elbows: [[-.36, 1.6, .04], [.36, 1.6, .04]], hands: [[-.19, 1.85, .06], [.19, 1.85, .06]], knees: [[-.1, .5, .12], [.1, .5, -.02]], feet: [[-.1, .04, .16], [.11, .05, -.14]], grip: [.35, .35], palm: [[.5, 1, 0], [-.5, 1, 0]] },
  // reaping: leaning far forward, the right hand low with the sickle, the left grasping the stalks
  bend: { hip: [0, .88, -.12], chest: [0, 1.08, .36], head: [0, 1.1, .6], elbows: [[-.27, .86, .55], [.27, .8, .46]], hands: [[-.18, .66, .76], [.22, .53, .56]], knees: [[-.12, .47, .06], [.12, .48, .03]], feet: [[-.16, .04, .04], [.15, .04, .08]], grip: [1, 1], hold: [[0, 1, .35], [0, -.33, .94]], look: [0, .1, 1.3] },
  // kneeling at a grinding stone, both hands forward and down on the handstone
  kneel: { hip: [0, .42, 0], chest: [0, .78, .3], head: [0, .97, .48], elbows: [[-.2, .54, .52], [.2, .54, .52]], hands: [[-.12, .31, .7], [.12, .31, .7]], knees: [[-.14, .06, .38], [.14, .06, .38]], feet: [[-.13, .05, -.06], [.13, .05, -.06]], grip: [.45, .45], palm: [[.2, -1, .3], [-.2, -1, .3]], look: [0, .2, .95] },
  // standing, the right arm raised toward the sky
  point: { hip: [-.015, .95, 0], chest: [0, 1.39, .03], head: [.01, 1.64, .03], elbows: [[-.25, 1.08, 0], [.3, 1.62, .12]], hands: [[-.27, .81, .06], [.37, 1.88, .22]], knees: [[-.11, .5, .07], [.1, .5, .04]], feet: [[-.12, .04, .06], [.11, .04, 0]], grip: [.3, .1], palm: [null, [0, .2, 1]], look: [.6, 2.6, 1.6] },
  // leaning back a little, both hands up and forward on a rope
  pull: { hip: [0, .95, 0], chest: [0, 1.38, -.02], head: [0, 1.63, 0], elbows: [[-.24, 1.14, .2], [.22, 1.32, .26]], hands: [[-.06, 1.28, .4], [.07, 1.53, .4]], knees: [[-.11, .5, .14], [.1, .5, -.06]], feet: [[-.11, .04, .2], [.11, .04, -.22]], grip: [1, 1], hold: [[0, 1, 0], [0, 1, 0]], look: [.1, 2.3, 1.4] },
} satisfies Record<string, Pose>;

const V = (p: Point) => new THREE.Vector3(...p), UP = new THREE.Vector3(0, 1, 0), tone = new THREE.Color(), shade = new THREE.Color();
const ss = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const bell = (x: number, at: number, wide: number) => Math.exp(-(((x - at) / wide) ** 2));
const ellipse = (w: number, d: number, c: number, s: number) => 1 / Math.hypot(c / w, s / d);
/** Irregular folds round a head cloth, sharp in the valleys. */
const pleatHead = (a: number) => { const f = Math.sin(a * 3 + Math.sin(a * 1.3) * 1.5) * .6 + Math.sin(a * 5.3) * .4; return f > 0 ? f : f * 1.5; };
/** Column `k` of a table of [t, ...values], read at `t` and eased between rows. */
function key(rows: number[][], t: number, k: number) { let i = 1; while (i < rows.length - 1 && t > rows[i]![0]!) i++; const a = rows[i - 1]!, b = rows[i]!; return a[k]! + (b[k]! - a[k]!) * ss(a[0]!, b[0]!, t); }
/** `v` with its part along unit `axis` taken out, normalised; `or` when little is left. */
const across = (v: THREE.Vector3, axis: THREE.Vector3, or: THREE.Vector3) => { const out = v.clone().addScaledVector(axis, -v.dot(axis)); return out.lengthSq() > 1e-6 ? out.normalize() : or.clone().addScaledVector(axis, -or.dot(axis)).normalize(); };

/** Triangles with one colour each, smoothed into a shape when done. */
interface Layer { at: number[]; tint: number[] }
const layer = (): Layer => ({ at: [], tint: [] });
function tri(l: Layer, P: number[], C: number[], i: number, j: number, k: number) {
  const same = (a: number, b: number) => P[a * 3] === P[b * 3] && P[a * 3 + 1] === P[b * 3 + 1] && P[a * 3 + 2] === P[b * 3 + 2];
  if (same(i, j) || same(j, k) || same(i, k)) return;
  for (const v of [i, j, k]) l.at.push(P[v * 3]!, P[v * 3 + 1]!, P[v * 3 + 2]!);
  for (let c = 0; c < 3; c++) l.tint.push((C[i * 3 + c]! + C[j * 3 + c]! + C[k * 3 + c]!) / 3);
}
function grid(l: Layer, P: number[], C: number[], rows: number, cols: number, wrap: boolean) {
  for (let i = 0; i < rows - 1; i++) for (let j = 0; j < (wrap ? cols : cols - 1); j++) {
    const a = i * cols + j, b = i * cols + (j + 1) % cols, c = (i + 1) * cols + (j + 1) % cols, d = (i + 1) * cols + j;
    tri(l, P, C, a, d, c); tri(l, P, C, a, c, b);
  }
}
const finish = (l: Layer, surface: number) => l.at.length ? smoothed(new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(l.at, 3)), (_c, _n, f) => tone.setRGB(l.tint[f * 3]!, l.tint[f * 3 + 1]!, l.tint[f * 3 + 2]!), surface) : null;

/** Radius of a tube at `t` along it, toward (c, s): c across, s toward the tube's front. */
type Section = (t: number, c: number, s: number) => number;
type Tint = (t: number, c: number, s: number, at: THREE.Vector3, out: THREE.Vector3) => THREE.Color;
interface Run { from?: number; to?: number; caps?: [boolean, boolean]; lips?: boolean; rim?: number; arc?: [number, number]; move?: (at: THREE.Vector3, t: number, c: number, s: number) => void }
const ray = new THREE.Vector3(), spot = new THREE.Vector3(), front = new THREE.Vector3(), side = new THREE.Vector3();
/** A tube through `path` whose front turns toward `face`, drawn from `from` to `to` of its length. Open ends get a turned-back `lips` hem, `rim` times the colour inside; `arc` draws only part of the way round. */
function tube(l: Layer, path: THREE.Vector3[], face: THREE.Vector3 | ((t: number) => THREE.Vector3), rings: number, sides: number, section: Section, tint: Tint, { from = 0, to = 1, caps = [true, true], lips = false, rim = .7, arc, move }: Run = {}) {
  const curve = new THREE.CatmullRomCurve3(path, false, "centripetal"), cols = arc ? sides + 1 : sides, P: number[] = [], C: number[] = [], mids: THREE.Vector3[] = [], tangents: THREE.Vector3[] = [], sizes: number[] = [];
  for (let i = 0; i <= rings; i++) {
    const t = from + (to - from) * i / rings, center = curve.getPointAt(t), T = curve.getTangentAt(t), want = typeof face === "function" ? face(t) : face;
    front.copy(across(want, T, Math.abs(T.y) < .9 ? UP : new THREE.Vector3(0, 0, 1))); side.crossVectors(T, front); mids.push(center); tangents.push(T);
    let size = 0;
    for (let j = 0; j < cols; j++) {
      const a = arc ? arc[0] + (arc[1] - arc[0]) * j / sides : j / sides * Math.PI * 2, c = Math.cos(a), s = Math.sin(a), r = section(t, c, s);
      ray.copy(side).multiplyScalar(c).addScaledVector(front, s); spot.copy(center).addScaledVector(ray, r); move?.(spot, t, c, s); size += r;
      P.push(spot.x, spot.y, spot.z); const color = tint(t, c, s, spot, ray); C.push(color.r, color.g, color.b);
    }
    sizes.push(size / cols);
  }
  grid(l, P, C, rings + 1, cols, !arc);
  for (const end of [0, 1] as const) {
    const ring = end ? rings * cols : 0, n = arc ? cols - 1 : cols;
    if (caps[end]) {
      const apex = P.length / 3, tip = mids[end ? rings : 0]!.clone().addScaledVector(tangents[end ? rings : 0]!, (end ? .5 : -.5) * sizes[end ? rings : 0]!); let r = 0, g = 0, b = 0;
      for (let j = 0; j < cols; j++) { r += C[(ring + j) * 3]!; g += C[(ring + j) * 3 + 1]!; b += C[(ring + j) * 3 + 2]!; }
      P.push(tip.x, tip.y, tip.z); C.push(r / cols, g / cols, b / cols);
      for (let j = 0; j < n; j++) end ? tri(l, P, C, apex, ring + (j + 1) % cols, ring + j) : tri(l, P, C, apex, ring + j, ring + (j + 1) % cols);
    } else if (lips) { // the hem turned back inside: a band with some thickness
      const center = mids[end ? rings : 0]!, T = tangents[end ? rings : 0]!, Q: number[] = [], D: number[] = [];
      for (const inner of [0, 1]) for (let j = 0; j < cols; j++) {
        spot.fromArray(P, (ring + j) * 3); if (inner) { ray.copy(spot).sub(center); spot.addScaledVector(ray, -.007 / Math.max(.01, ray.length())).addScaledVector(T, end ? -.014 : .014); }
        Q.push(spot.x, spot.y, spot.z); for (let c = 0; c < 3; c++) D.push(C[(ring + j) * 3 + c]! * (inner ? rim : 1));
      }
      grid(l, Q, D, 2, cols, !arc);
    }
  }
}
/** A grid over (u, v) in [0, 1]: rows down u, columns round v, closed round when `wrap`. */
function patch(l: Layer, rows: number, cols: number, wrap: boolean, at: (u: number, v: number, out: THREE.Vector3) => THREE.Vector3, tint: (u: number, v: number, at: THREE.Vector3) => THREE.Color) {
  const P: number[] = [], C: number[] = [], width = wrap ? cols : cols + 1;
  for (let i = 0; i <= rows; i++) for (let j = 0; j < width; j++) { at(i / rows, j / cols, spot); P.push(spot.x, spot.y, spot.z); const color = tint(i / rows, j / cols, spot); C.push(color.r, color.g, color.b); }
  grid(l, P, C, rows + 1, width, wrap);
}
const ball = (l: Layer, center: THREE.Vector3, [x, y, z]: Point, rows: number, cols: number, tint: (at: THREE.Vector3) => THREE.Color) =>
  patch(l, rows, cols, true, (u, v, out) => out.set(Math.sin(u * Math.PI) * Math.sin(v * 6.2832) * x, Math.cos(u * Math.PI) * y, Math.sin(u * Math.PI) * Math.cos(v * 6.2832) * z).add(center), (_u, _v, at) => tint(at));

/** A head, in its own frame (x across, y up, z the way the face looks), centred between the ears: the point on the skull toward (theta from the crown, phi
 * from the face round toward +x). The cranium is the larger part, the face the lower front; the jaw runs from the chin back to its angle under the ear and
 * turns in to the neck. `early` is the heavy brow, low forehead and jutting jaw of a million years ago; `wide`, `brow` and `jaw` vary one face from the next. */
function skull(early: number, female: number, wide: number, brow: number, jaw: number) {
  const ax = (.072 - .003 * female + .005 * early) * wide, top = .122 - .01 * early, low = .12 + .004 * early, fore = .092 + .006 * early, back = .108 + .006 * early;
  const at = (theta: number, phi: number, out: THREE.Vector3) => {
    const dx = Math.sin(theta) * Math.sin(phi), dy = Math.cos(theta), dz = Math.sin(theta) * Math.cos(phi), w = Math.abs(dx), face = ss(.7, .95, dz);
    let x = dx * ax, y = dy * (dy > 0 ? top : low), z = dz * (dz > 0 ? fore : back);
    x *= 1 + .05 * ss(-.1, .5, dy) * ss(.6, -.2, dz) - .07 * bell(dy, .25, .2) * ss(.3, .7, dz); // full above and behind the ears, in at the temples
    x *= 1 - (.2 - .06 * jaw - .04 * early) * ss(-.25, -.8, dy) * ss(-.1, .7, dz); // the jaw narrows to the chin
    const behind = ss(.3, -.3, dz) * ss(-.3, -.75, dy); x *= 1 - .32 * behind; z *= 1 - .3 * behind; y *= 1 - .12 * behind; // behind its angle the jaw turns in to the neck
    y *= 1 - .3 * ss(-.6, -.95, dy) * ss(.45, -.2, dz); // the underside rises to the throat
    x += Math.sign(dx) * .004 * jaw * bell(dz, .28, .15) * bell(dy, -.62, .14); // the angle of the jaw
    z += .016 * early * ss(-.1, -.55, dy) * ss(.3, .85, dz); // the jaw thrust forward
    z -= (.02 * early + .003) * ss(.35, .85, dy) * ss(.2, .8, dz); // the forehead sloping back
    z -= (.004 + .008 * early) * ss(-.1, -.85, dz) * ss(-.5, .1, dy); // the back of the skull
    const ridge = bell(dy, .3, .08) * ss(.55, .85, dz) * ss(.75, .4, w);
    z += ridge * (.003 + .004 * brow + .013 * early); y += ridge * .002;
    z -= bell(w, .42, .16) * bell(dy, .13, .09) * ss(.45, .8, dz) * (.012 + .004 * early); // the eye sockets
    z += bell(dx, 0, .1) * bell(dy, .12, .12) * face * .004; // the bridge between them
    const cheek = bell(w, .62, .15) * bell(dy, -.06, .12) * ss(.2, .6, dz);
    x += Math.sign(dx) * cheek * (.005 + .004 * early); z += cheek * .004 - bell(w, .55, .15) * bell(dy, -.38, .1) * ss(.4, .8, dz) * .003; // cheekbones, the hollow under them
    z += bell(dx, 0, .4) * bell(dy, -.5, .15) * ss(.6, .9, dz) * .004; // the mouth rounded forward over the teeth
    z += bell(dx, 0, .35) * bell(dy, -.83, .1) * ss(.35, .8, dz) * (.008 - .014 * early) - bell(dx, 0, .3) * bell(dy, -.69, .04) * face * .002; // the chin, the crease above it
    return out.set(x, y, z);
  };
  /** The point `lift` out from the skull, along the way it faces. */
  const over = (theta: number, phi: number, lift: number, out: THREE.Vector3) => { at(theta, phi, out); const n = ray.set(Math.sin(theta) * Math.sin(phi) / ax, Math.cos(theta) / top, Math.sin(theta) * Math.cos(phi) / fore).normalize(); return out.addScaledVector(n, lift); };
  /** The same, found by where on the face it is: dx across, dy up, as on a unit sphere. */
  const onFace = (dx: number, dy: number, lift: number, out: THREE.Vector3) => { const theta = Math.acos(THREE.MathUtils.clamp(dy, -.999, .999)); return over(theta, Math.asin(THREE.MathUtils.clamp(dx / Math.sin(theta), -1, 1)), lift, out); };
  return { at, over, onFace, ax };
}

const HAIR = ["#17110d", "#21160f", "#2b1d14", "#3a2819", "#4a3422"], DYES = ["#8a5a3c", "#6d6a58", "#a8854f", "#5e4a3b", "#7b4634", "#d6ccb2"], CLOTHS = ["#d9cdb0", "#c9b48a", "#a8854f", "#8a5a3c", "#5f6670", "#5e4a3b", "#b9a27a", "#7b4634"], HOSE = ["#5a4a3a", "#6b5b45", "#4d4a42", "#73624b", "#5c5144"];
const PALM = new THREE.Color("#c4987f"), DUST = new THREE.Color("#8d7a60"), LEATHER = new THREE.Color("#3d2b1e"), STRAW = new THREE.Color("#c2a566"), GREY = new THREE.Color("#8a8178");
type Dress = "hide" | "wrap" | "tunic";
type Hat = "none" | "straw" | "coif" | "cloth";

/** A person facing +z, feet on y = 0. The dress says when they live: `hide` (no `cloth`) is the camp a million years ago, heavier built, in hides, hair
 * matted; `wrap` is the first villages, a wrapped skirt and a short-sleeved top in `cloth`, hair tied or under a head cloth; `tunic` is a farm worker of
 * the last two thousand years, a belted tunic, hose, shoes and a hat. `small` draws about a third as many triangles. Caller owns the geometry. */
export function person(rand: () => number, pose: Pose, { extra = [], skin = "#8a5d40", cloth, dress = cloth ? "wrap" : "hide", hat, small = false, child = false }: { extra?: THREE.BufferGeometry[]; skin?: string; cloth?: string; dress?: Dress; hat?: Hat; small?: boolean; child?: boolean } = {}) {
  const r = sequence(Math.floor(rand() * 4294967296)), q = small ? .38 : 1, n = (k: number, least: number) => Math.max(least, Math.round(k * q));
  const early = dress === "hide" ? 1 : 0, female = r() < .5 ? 1 : 0, bulk = (.96 + r() * .1) * (1 + .06 * early), pick = <T,>(list: T[]) => list[Math.floor(r() * list.length)]!;
  const hsl = { h: 0, s: 0, l: 0 }, base = new THREE.Color(skin); base.getHSL(hsl); base.setHSL(hsl.h + (r() - .5) * .016, hsl.s * (.7 + r() * .12), hsl.l * (.93 + r() * .1));
  const hair = new THREE.Color(pick(HAIR)); if (r() < .12 && !early) hair.lerp(GREY, .55);
  const given = new THREE.Color(cloth ?? "#7d6245"), fabric = (r() < .35 ? given.clone() : new THREE.Color(pick(CLOTHS)).lerp(given, .2)).multiplyScalar(.92 + r() * .12), lower = r() < .5 ? fabric : new THREE.Color(pick(CLOTHS)).multiplyScalar(.92 + r() * .12), dye = new THREE.Color(pick(DYES)), hose = new THREE.Color(pick(HOSE)), hide = new THREE.Color("#7d6245").offsetHSL((r() - .5) * .02, 0, (r() - .5) * .04);
  const skinL = layer(), clothL = layer(), hairL = layer(), plainL = layer(), parts = [...extra];
  /** Skin: mottled, lighter on palms and soles, darker over knuckles, elbows and knees, dusty toward the ground on bare legs. */
  const flesh = (at: THREE.Vector3, palm = 0, dark = 0, dust = 0) => tone.copy(base).lerp(PALM, palm).multiply(shade.setRGB(1 - dark * .16, 1 - dark * .22, 1 - dark * .24)).lerp(DUST, dust * .45 * ss(.22, 0, at.y)).multiplyScalar(.93 + noise(at.x * 11 + at.z * 7, at.y * 11) * .14);
  const weave = (color: THREE.Color, at: THREE.Vector3, fold = 0, dirt = 0) => tone.copy(color).multiplyScalar((.9 + noise(at.x * 23 + at.z * 17, at.y * 23) * .2) * (1 - Math.max(0, -fold) * .35 + Math.max(0, fold) * .08)).lerp(DUST, dirt * .35);

  // ---------- the trunk: crotch, hips, waist, ribs, chest, shoulders, the root of the neck ----------
  const hip = V(pose.hip), chest = V(pose.chest), head = V(pose.head), up = chest.clone().sub(hip).normalize(), sideX = across(new THREE.Vector3(1, 0, 0), up, UP), ahead = sideX.clone().cross(up);
  const seated = hip.y < .55 ? 1 : 0, slump = .012 + .03 * seated + .02 * Math.max(0, ahead.y < 0 ? -ahead.y : 0), neckRoot = chest.clone().addScaledVector(up, .112).addScaledVector(ahead, -.026);
  const trunk = [hip.clone().addScaledVector(up, -.1).addScaledVector(ahead, .01), hip, hip.clone().lerp(chest, .45).addScaledVector(ahead, -slump), chest, neckRoot];
  const TRUNK = [[0, .06, .05, .06], [.08, .14, .085, .1], [.17, .165, .1, .115], [.3, .155, .095, .1], [.42, .135, .09, .085], [.58, .15, .105, .09], [.74, .16, .118, .095], [.84, .17, .105, .095], [.9, .155, .088, .088], [.95, .15, .08, .084], [1, .085, .066, .07]];
  const trunkSection = (ease: number): Section => (t, c, s) => {
    const hips = 1 + .07 * female * bell(t, .22, .1), shoulders = 1 - .1 * female * bell(t, .85, .1), w = key(TRUNK, t, 1) * bulk * hips * shoulders * (1 + .08 * early * bell(t, .6, .2)), d = key(TRUNK, t, s > 0 ? 2 : 3) * bulk * (s > 0 ? 1 + .1 * female * bell(t, .72, .06) : 1);
    let radius = ellipse(w, d, c, s) * (1 + .1 * Math.abs(c * s) * (1 - bell(t, .88, .08)));
    if (s < 0) radius += .006 * bell(t, .82, .07) * bell(Math.abs(c), .55, .25) - .006 * ss(-.92, -1, s) * bell(t, .58, .25); // shoulder blades and the groove of the spine
    else radius += .006 * (1 - female) * bell(t, .76, .06) * bell(Math.abs(c), .45, .25) + .004 * bell(t, .9, .025) * ss(.12, .45, Math.abs(c)) - .005 * bell(t, .94, .03) * bell(c, 0, .15); // the chest, the collarbones and the pit between them
    return radius + ease;
  };
  const covered = dress !== "hide" && (dress === "tunic" || female || r() < .55), shoulderK = 1 - .1 * female;
  tube(skinL, trunk, ahead, covered ? n(5, 3) : n(12, 7), n(16, 10), trunkSection(0), (t, _c, _s, at) => flesh(at, 0, 0, 0), { from: covered ? .7 : 0 , caps: [!covered, true] });
  // ---------- the neck and the head ----------
  const look = pose.look ? V(pose.look).sub(head).normalize() : ahead.clone().setY(0).normalize().add(new THREE.Vector3(0, -.2, 0)).normalize();
  const F = look, U = across(head.clone().sub(neckRoot).normalize().lerp(UP, .45 - .2 * early), F, UP), S = U.clone().cross(F), frame = new THREE.Matrix4().makeBasis(S, U, F).multiply(new THREE.Matrix4().makeScale(...(child ? [1.16, 1.16, 1.16] : [1, 1, 1]) as Point)).setPosition(head); // a child's head is larger for its body
  const down = new THREE.Vector3(S.y, U.y, F.y).negate(); // the way things hang, in the head's frame
  const nape = head.clone().addScaledVector(U, -.065).addScaledVector(F, -.028), throat = neckRoot.clone().lerp(nape, .5).addScaledVector(F, .006 + .012 * early);
  tube(skinL, [neckRoot.clone().addScaledVector(up, -.05), neckRoot, throat, nape], F, n(6, 2), n(12, 8), (t, c, s) => bulk * (ellipse(.047 - .005 * female + .036 * (1 - t) ** 2, (s > 0 ? .049 : .052) + .016 * (1 - t) ** 2, c, s)
    + .006 * bell(Math.abs(c), .5, .2) * Math.max(0, s) * bell(t, .45, .3) + .006 * (1 - female) * bell(t, .6, .12) * ss(.85, 1, s)), // the cords down the sides, the Adam's apple
    (_t, _c, _s, at) => flesh(at), { caps: [true, true] });
  // One face from the next: proportions, features, age and what the face is doing all vary.
  const kid = child ? 1 : 0, age = kid ? 0 : early ? r() * .5 : r() ** 1.3, worker = !!pose.grip || ([POSES.tend, POSES.pull, POSES.bend, POSES.kneel, POSES.carry] as Pose[]).includes(pose);
  const knit = worker ? .5 + r() * .4 : r() * .1, smile = pose === POSES.watch ? .55 + r() * .4 : r() < .2 ? r() * .35 : 0, smileSide = r() < .5 ? -1 : 1;
  const wideK = (.95 + r() * .1) * (1 + .04 * kid), tall = (.95 + r() * .1) * (1 - .1 * kid) * (1 + .04 * early), jawK = r(), chinK = r() * (1 - early), cheekK = r();
  const noseL = (.92 + r() * .16) * (1 - .35 * kid) * (1 - .1 * early), noseW = (.88 + r() * .28) * (1 + .38 * early) * (1 - .12 * kid), bridgeK = r() * (1 - .7 * early) * (1 - kid), lipK = (.75 + r() * .5) * (1 - .35 * age) * (1 + .12 * early) * (female ? 1 : .86);
  const eyeK = (.94 + r() * .12) * (1 + .12 * kid), tilt = (r() - .5) * .16, apart = 1 + (r() - .5) * .08, browK = r(), stubble = !female && !early && !kid && r() < .5 ? .3 + r() * .5 : 0, weathered = dress === "tunic" ? .5 + r() * .5 : dress === "wrap" ? r() * .5 : .3;
  const eyeColor = new THREE.Color(pick(early ? ["#2b1c12", "#33261c", "#3a2616"] : ["#3a2616", "#2b1c12", "#4a3420", "#5a4228", "#4d4a3a", "#3e4a48"]));
  const sk = skull(early, female, wideK, browK, jawK), H = { skin: layer(), hair: layer(), cloth: layer(), straw: layer(), plain: layer(), eye: layer() }, hairStyle = early ? "matted" : dress === "tunic" ? "short" : "tied";
  const cover: Hat = kid ? "none" : hat ?? (dress === "hide" ? "none" : dress === "wrap" ? (female && r() < .6 ? "cloth" : "none") : female ? "cloth" : r() < .6 ? "straw" : "coif"), ears = cover !== "cloth" && cover !== "coif";
  const beard = !female && !kid && (early || r() < (dress === "wrap" ? .7 : .4)), place = new THREE.Vector3(), seed = r() * 9, S0 = new THREE.Vector3(), N0 = new THREE.Vector3(), C0 = new THREE.Vector3();
  const lipColor = base.clone().multiply(female ? new THREE.Color(.8, .6, .58) : new THREE.Color(.82, .64, .62)).lerp(base, .25 * age), brows = new THREE.Color().copy(hair).lerp(base, .3 + .15 * kid);
  // ---------- the face, one surface over the skull: the eyes, nose and mouth raised and cut into it ----------
  /** Where the skull is at (theta, phi), and the way it faces. */
  const ground = (theta: number, phi: number) => { sk.at(theta, phi, S0); sk.over(theta, phi, 1, N0).sub(S0); };
  const ex = .4 * apart, ey = .12, ew = .19 * eyeK, eh = .048 * eyeK, re = .0118 * Math.sqrt(eyeK) * (1 - .04 * kid);
  const eyeAt = (sign: number) => { const theta = Math.acos(ey), phi = sign * Math.asin(ex / Math.sin(theta)); ground(theta, phi); return S0.clone().addScaledVector(N0, .0068 + .002 * kid - re); }; // the centre of an eyeball, its front a little behind the brow
  const balls = [eyeAt(-1), eyeAt(1)];
  /** An eye's almond at (dx, dy): `u` from its middle toward the outer corner, `s` how far outside the lids (in eye heights, negative within the opening), `upper` whether above. */
  const lids = (dx: number, dy: number) => { const u = (Math.abs(dx) - ex) / ew, v = (dy - ey) / eh - tilt * u, e = Math.min(1, u * u), top = .55 * (1 - e) ** .5 * (1 - .12 * u) - .1 * knit * ss(.2, -.8, u), bottom = -.88 * (1 - e) ** .75 * (1 + .1 * u);
    const upper = v > (top + bottom) / 2; return { u, v, upper, s: Math.abs(u) < 1 ? (upper ? v - top : bottom - v) : Math.hypot(Math.abs(u) - 1, v - (top + bottom) / 2) * 1.5 }; };
  /** How far the eyeball's surface stands off the skull at the point S0 (facing N0), or undefined beside it. */
  const ballOver = (sign: number) => { const c = balls[sign < 0 ? 0 : 1]!, along = C0.copy(c).sub(S0).dot(N0), side = C0.lengthSq() - along * along; return side < re * re ? along + Math.sqrt(re * re - side) : undefined; };
  const mw = .44 + .03 * early - .06 * kid, mh = .062 * (1 - .15 * kid), my = -.41 - .03 * early;
  const part = (u: number) => -.05 * u * u + .3 * smile * ss(.2, 1, u * smileSide) - .12 * ss(.6, 1, Math.abs(u)), tops = (u: number) => part(u) + (.9 * (1 - Math.min(1, u * u) ** 2) ** .45 - .2 * bell(u, 0, .1) + .08 * bell(Math.abs(u), .24, .08)) * Math.sqrt(lipK), bottom = (u: number) => part(u) - 1.45 * lipK ** .7 * (1 - Math.min(1, u * u) ** 2) ** .6;
  /** The nose, cheeks, brow, lips and chin standing off the skull at (dx, dy), in metres. */
  const relief = (dx: number, dy: number) => {
    const a = Math.abs(dx), t = ss(.2, -.19, dy), tip = .022 * noseL * (1 + .1 * early);
    const profile = dy > -.19 ? tip * (.1 * t + .9 * t ** 1.8) + .0014 * bridgeK * bell(t, .42, .18) : tip * (1 - .82 * ss(-.19, -.255, dy) ** .8) * ss(-.33, -.255, dy);
    const half = noseW * (.06 + .018 * ss(.1, -.05, dy) + .04 * ss(-.06, -.17, dy)); // in section a rounded arch, its sides curving away into the cheeks
    let h = profile * (.9 * ss(2.3 * half, .55 * half, a) + .1 * bell(a, 0, 1.4 * half)) + .0026 * noseL * bell(dy, -.168, .04) * (bell(dx, .026, .03) + bell(dx, -.026, .03)) // the bridge to the tip, its two domes
      + .0075 * Math.sqrt(noseW) * bell(a, .145 * noseW, .055) * bell(dy, -.215, .035) - .0007 * bell(Math.hypot((a - .145 * noseW) / .08, (dy + .21) / .055), 1, .3) // the wings, the crease round them
      - .0025 * bell(a, .06 * noseW, .035) * bell(dy, -.24, .03); // the nostrils, under the tip
    const fold = Math.hypot(a - .2 - (.44 - .2) * ss(-.21, -.47, dy), (dy + .21) * .05) * (dy < -.2 && dy > -.55 ? 1 : 9); // the line from the wing of the nose to the corner of the mouth
    h += -(.0004 + .0014 * age + .0008 * smile) * bell(fold, 0, .03) + .001 * (1 + smile) * bell(fold, .06, .05) * ss(.2, .35, a) + (.005 + .004 * early) * bell(a, 0, .55) * bell(dy, -.42, .2); // the fold, the mouth rounded over the teeth
    h += .005 * bell(a, .46, .2) * bell(dy, -.22, .2) * (1 - .6 * age) * (1 + .3 * kid) - .0025 * age * bell(a, .58, .12) * bell(dy, -.32, .12); // the cheeks, round, fuller young
    h += .0028 * cheekK * bell(a, .62, .14) * bell(dy, -.04, .12) - .0022 * bell(a, .8, .12) * bell(dy, .3, .16) + .0018 * bell(a, .78, .14) * bell(dy, -.48, .18); // cheekbones, temples, the muscle of the jaw
    const browLine = .27 + .03 * ss(.1, .55, a) - .02 * knit * bell(a, .14, .1);
    h += (.0018 + .002 * browK + .0042 * early) * bell(dy, browLine, .065 + .03 * early) * ss(.82, .45, a) * (early ? .6 + .4 * bell(a, .34, .2) : .55 + .45 * ss(.02, .16, a)) - .0009 * knit * bell(a, .035, .02) * bell(dy, .22, .07) + .003 * early * bell(a, 0, .14) * bell(dy, .19, .07); // the brow, drawn together over work; a heavy brow filled out over the root of the nose
    const u = dx / mw, v = (dy - my) / mh, p = part(u), lipTop = tops(u), low = bottom(u), across = 1 - Math.min(1, u * u) ** 2;
    if (Math.abs(u) < 1) {
      if (v > p && v < lipTop) { const k = (v - p) / (lipTop - p); h += .0022 * Math.sqrt(lipK) * (1.1 - .4 * k) * Math.sin(Math.PI * (.15 + .85 * k)) ** .5 * across ** .5 + .0007 * bell(u, 0, .12) * bell(k, .1, .2); } // the upper lip, a little over the lower, the tubercle
      if (v < p && v > low) { const k = (p - v) / (p - low); h += .0029 * lipK ** .7 * Math.sin(Math.PI * (.12 + .88 * k)) ** .6 * across ** .5; } // the lower lip, fuller
      h -= .0009 * bell(v, p, .2) * across ** .3;
    }
    h += .0004 * bell(v, lipTop, .05) * ss(1, .6, Math.abs(u)) - .0012 * bell(Math.abs(u), 1.02, .08) * bell(v, p, .3); // the white roll over the lip, the corners tucked in
    h -= .0007 * bell(dx, 0, .06) * ss(lipTop + .05, lipTop + .5, v) * ss(-.24, -.3, dy); // the philtrum, a shallow dent
    h += -(.0022 + .0008 * lipK) * bell(dy, my - .14 - .02 * early, .03) * bell(a, 0, .28) + (.003 + .005 * chinK) * bell(a, 0, .24) * bell(dy, -.72, .1); // the groove under the lip, the chin pad
    return h;
  };

  /** The skin of the head at (theta, phi), and with `lift` above it. */
  const skinAt = (theta: number, phi: number, lift: number, out: THREE.Vector3) => {
    const dx = Math.sin(theta) * Math.sin(phi), dy = Math.cos(theta), dz = Math.sin(theta) * Math.cos(phi), front = ss(.05, .45, dz); ground(theta, phi);
    let h = front * relief(dx, dy);
    if (front > 0 && Math.abs(Math.abs(dx) - ex) < ew * 2 && Math.abs(dy - ey) < eh * 4) { // the eye: lids wrapping the ball, open between them
      const { u, s, upper } = lids(dx, dy), ball = ballOver(dx), thick = upper ? .0017 : .0015, edge = Math.abs(u) < 1 ? 1 : 0;
      if (s < 0 && ball !== undefined) h = ball + thick * ss(-.09, 0, s) - .007 * ss(-.05, -.3, s);
      else if (s < 0) h -= .004 * ss(0, -.3, s); // the corners beside the ball
      else { const lid = ball === undefined ? -1 : ball + thick * (1 - .4 * ss(0, 1, s)), w = ss(upper ? 1.1 : .9, .15, s) * front; if (lid > h) h += (lid - h) * w; }
      if (upper && s > 0) h += (-.0011 * bell(s, .62 + .2 * age, .14) + .0008 * bell(s, .95, .2)) * edge * (1 - knit * .3); // the fold over the upper lid
      else if (s > 0) h += .0016 * age * bell(s, .7, .25) * edge; // a little bag under the eye with age
      if (s >= 0 && ball !== undefined) h = Math.max(h, ball + .0007); // the lids always over the ball
    }
    out.copy(S0).addScaledVector(N0, h + lift); if (out.y < 0) out.y *= tall; return out; // the face below the eyes longer or shorter
  };
  /** The colour of the skin at (theta, phi), found at `at`. */
  const skinTint = (theta: number, phi: number, at: THREE.Vector3) => {
    const dx = Math.sin(theta) * Math.sin(phi), dy = Math.cos(theta), dz = Math.sin(theta) * Math.cos(phi), a = Math.abs(dx), front = ss(.3, .7, dz);
    flesh(place.copy(at).applyMatrix4(frame), 0, 0, 0);
    const red = bell(a, .45, .17) * bell(dy, -.18, .16) * (.7 + .5 * weathered) + bell(dx, 0, .07) * bell(dy, -.17, .06) * .8 + .5 * bell(dx, 0, .3) * bell(dy, -.74, .07);
    tone.multiply(shade.setRGB(1 + .1 * red * front, 1 - .03 * red * front, 1 - .04 * red * front));
    tone.multiplyScalar(1 + front * (.06 * bell(dy, .24, .06) * ss(.7, .2, a) + .05 * bell(dx, 0, .04) * bell(dy, .02, .12))); // light on the brow bone and down the bridge
    tone.multiplyScalar(1 - .25 * front * bell(a, .06 * noseW, .035) * bell(dy, -.24, .03) - .06 * front * bell(Math.hypot((a - .145 * noseW) / .08, (dy + .21) / .055), 1, .3)); // the nostrils, the crease round the wings
    if (front > 0 && Math.abs(a - ex) < ew * 2 && Math.abs(dy - ey) < eh * 4) {
      const { u, s, upper } = lids(dx, dy), corner = Math.abs(u) < 1 ? 1 - u * u : 0;
      if (s < 0) tone.lerp(shade.setRGB(.55, .22, .2), .7 * ss(-.75, -1, u)).multiplyScalar(.6); // the pink inner corner, shade in the opening
      else if (upper) tone.multiplyScalar(1 - .14 * ss(1.1, .3, s) - .25 * age * bell(s, .6, .2)).lerp(shade.set("#120b08"), .92 * ss(.16, .03, s) * corner ** .2); // the lid darker, the lashes along its edge
      else tone.multiplyScalar(1 - (.12 + .12 * age) * ss(1, .2, s)).lerp(shade.set("#2a1a12"), .45 * ss(.1, .02, s) * corner ** .4); // under the eye, the lower lashes
      if (u > .8 && s > 0) tone.multiplyScalar(1 - .12 * age * bell(Math.sin((dy - ey) * 140 + u * 3), 1, .3)); // crow's feet
    }
    const u = dx / mw, v = (dy - my) / mh;
    if (Math.abs(u) < 1.05) {
      const p = part(u), inside = (v > p && v < tops(u)) || (v < p && v > bottom(u)), fade = 1 - ss(.8, 1.05, Math.abs(u));
      if (inside) tone.lerp(lipColor, .9 * fade * ss(0, .25, Math.min(Math.abs(v - (v < p ? bottom(u) : tops(u))), .25))).multiplyScalar(v < p ? 1.03 : .94);
      tone.lerp(shade.set("#24100c"), .95 * bell(v, p, .32) * (1 - Math.min(1, u * u)) ** .15 + .45 * bell(Math.abs(u), 1.02, .07) * bell(v, p, .3)); // the line between, the corners
    }
    const shadow = stubble || (beard ? .9 : 0); // a shaven jaw, or the skin under a beard's edge
    if (shadow && dy < -.2 && a < .85) tone.lerp(shade.copy(hair).lerp(base, .55).multiplyScalar(.85), shadow * .35 * ss(-.24, -.34, dy) * ss(.86, .6, a) * (dy > -.4 || v < bottom(u) - .3 || Math.abs(u) > 1.05 ? 1 : 0));
    if (weathered > .4 && front > 0) tone.multiplyScalar(1 - .1 * ss(.62, .78, noise(dx * 60 + seed, dy * 60)) * bell(dy, -.05, .25) * (weathered - .3)); // freckles and sun spots
    if (early) tone.lerp(DUST, .18 * ss(.4, .8, noise(dx * 14 + seed, dy * 14))); // dirt
    return tone;
  };
  const spaced = (from: number, to: number, density: (x: number) => number) => { const sum = [0]; for (let i = 1; i <= 128; i++) sum.push(sum[i - 1]! + density(from + (to - from) * (i - .5) / 128));
    return (t: number) => { const want = t * sum[128]!; let i = 1; while (i < 128 && sum[i]! < want) i++; return from + (to - from) * (i - 1 + (want - sum[i - 1]!) / (sum[i]! - sum[i - 1]!)) / 128; }; };
  const thetaOf = spaced(0, Math.PI, (t) => .4 - .3 * ss(1.1, .6, t) + 2 * bell(t, 1.29, .08) + 6 * bell(t, Math.acos(ey), .06) + 1.1 * bell(t, 1.75, .22) + 3 * bell(t, 1.81, .05) + 6 * bell(t, Math.acos(my) - .02, .09) + .9 * bell(t, 2.3, .25) - .25 * ss(2.7, 3.1, t)); // rows close over the brow, the eyes, the nose and the lips, few over the crown under the hair
  const phiOf = spaced(-Math.PI, Math.PI, (p) => .08 + 4.5 * bell(p, 0, .14) + bell(p, 0, .5) + 2.4 * bell(Math.abs(p), Math.asin(ex), .13) + 1.2 * bell(Math.abs(p), .8, .3)); // columns close across the nose and the mouth
  patch(H.skin, n(30, 12), n(32, 14), true, (u, v, out) => skinAt(thetaOf(u), phiOf(v), 0, out), (u, v, at) => skinTint(thetaOf(u), phiOf(v), at));
  for (const sign of [-1, 1]) { // an eyeball: the white, the iris and the pupil in rings round where it looks, the clear front bulging a little
    const c = balls[sign < 0 ? 0 : 1]!, look = new THREE.Vector3(-c.x, -c.y * .5, .9).normalize(), s1 = across(UP, look, UP), s2 = look.clone().cross(s1);
    const RINGS = small ? [0, 11, 28, 50, 100] : [0, 9.5, 11, 12.5, 26.5, 28, 30, 50, 80], iris = eyeColor.clone().multiplyScalar(.85 + r() * .3);
    patch(H.eye, RINGS.length - 1, n(14, 8), true, (u, v, out) => { const k = Math.round(u * (RINGS.length - 1)), a = RINGS[k]! * Math.PI / 180, b = v * 6.2832, bulge = a < .52 ? .0007 * Math.cos(a * 3) : 0;
      return out.copy(c).addScaledVector(look, Math.cos(a) * (re + bulge)).addScaledVector(s1, Math.sin(a) * Math.cos(b) * re).addScaledVector(s2, Math.sin(a) * Math.sin(b) * re); },
    (u, v) => { const deg = RINGS[Math.round(u * (RINGS.length - 1))]!;
      if (deg < 10) return tone.set("#050302");
      if (deg < 27) return tone.copy(iris).multiplyScalar((deg < 13 ? .6 : 1) * (.85 + .3 * noise(v * 40 + seed, deg)));
      if (deg < 29) return tone.copy(iris).multiplyScalar(.35);
      return tone.set("#c9bba6").multiplyScalar(.5 - .15 * ss(40, 100, deg)).lerp(shade.setRGB(.6, .3, .26), .2 * ss(50, 100, deg)); });
  }
  if (ears) for (const sign of [-1, 1]) { // an ear: the rolled rim, the ridge inside it, the deep bowl, the flap before it and the lobe, standing a little off the head and tilted back
    const out = new THREE.Vector3(sign * Math.cos(.14), 0, Math.sin(.14)), rise = across(new THREE.Vector3(0, Math.cos(.28), -Math.sin(.28)), out, UP), fore = rise.clone().cross(out); if (fore.z < 0) fore.negate();
    const center = sk.at(Math.acos(-.1), sign * (Math.PI / 2 + .2), new THREE.Vector3()).addScaledVector(new THREE.Vector3(sign, 0, 0), .005).addScaledVector(fore, -.002);
    patch(H.skin, n(6, 3), n(14, 7), true, (u, v, at) => { const radial = Math.sin(u * Math.PI), depth = Math.cos(u * Math.PI), a = v * 6.2832, ca = Math.cos(a), sa = Math.sin(a), lobe = ss(-.45, -.85, sa);
      const relief = .0016 + .0055 * bell(radial, .9, .09) * (1 - lobe) + .003 * lobe * ss(.3, .9, radial) - .0012 * bell(radial, .76, .06) * (1 - lobe) + .0028 * bell(radial, .58, .08) * ss(-.5, .1, sa) * ss(.7, .2, ca)
        - .0055 * ss(.5, .12, radial) * ss(-.4, .2, ca) * ss(.5, -.2, sa) + .0045 * bell(ca, 1, .25) * bell(sa, -.25, .2) * bell(radial, .62, .14); // rim, lobe, the hollow inside the rim, the ridge, the bowl, the flap over it
      const back = Math.max(0, -ca) * radial * .003; // the back of the ear standing off the head
      return at.copy(center).addScaledVector(fore, ca * .017 * (1 + .15 * sa) * radial).addScaledVector(rise, sa * (sa > 0 ? .029 : .026) * radial).addScaledVector(out, back + (depth > 0 ? relief * depth ** .25 : depth * .004)); },
    (u, v, at) => { const radial = Math.sin(u * Math.PI), front = u < .5, ca = Math.cos(v * 6.2832), sa = Math.sin(v * 6.2832);
      return flesh(place.copy(at).applyMatrix4(frame)).multiply(shade.setRGB(1.07, .96, .94)).multiplyScalar(front ? 1 - .45 * ss(.5, .12, radial) * ss(-.4, .2, ca) * ss(.5, -.2, sa) - .2 * bell(radial, .76, .06) : .85); });
  }
  // ---------- hair: a shell over the scalp, and strands laid on it from the crown out, each a thin tapering ribbon that follows the comb and then hangs ----------
  const lumps = (theta: number, phi: number, k: number) => noise(Math.cos(phi) * k + theta * k + seed, Math.sin(phi) * k - theta * 2);
  const hairTint = (at: THREE.Vector3, theta: number, phi: number) => tone.copy(hair).multiplyScalar(.72 + lumps(theta, phi, 7) * .5 + noise(at.x * 60, at.y * 60) * .12);
  const normalOf = (theta: number, phi: number) => { ground(theta, phi); return N0.clone(); };
  /** A strand rooted at (theta, phi): `steps` steps of `along` over the head, each the way `comb` points (a direction in the head's frame) and `lift` off it, then `fall` hanging down;
   * `wide` across at the root, tapering, twisted `twist` turns (a rope), its tip `light` paler. Kept off the face and out of the neck. */
  let edgeAt = (_phi: number) => Math.PI; // where the hair ends, for strands to stop at over the face
  let shellAt = (_theta: number, _phi: number) => 0; // how far the hair's shell stands off the skull, for strands to lie on
  const strand = (theta: number, phi: number, comb: (at: THREE.Vector3) => THREE.Vector3, steps: number, along: number, wide: number, lift: number, fall = 0, twist = 0, light = 0, onSkin = false, color0?: THREE.Color) => {
    const points: THREE.Vector3[] = [], normals: THREE.Vector3[] = []; let th = theta, ph = phi;
    for (let k = 0; k <= steps; k++) {
      if (!onSkin && Math.cos(ph) > .2) th = Math.min(th, edgeAt(ph) * 1.02); // stopping at the hairline over the face
      const rise = lift * Math.min(1, k + .3) * (1 - .5 * k / steps); // the tip curling in to the head
      const at = onSkin ? skinAt(th, ph, rise, new THREE.Vector3()) : sk.over(th, ph, shellAt(th, ph) + rise, new THREE.Vector3()), normal = normalOf(th, ph); points.push(at); normals.push(normal);
      const way = across(comb(at), normal, down), dth = (way.y * -Math.sin(th) + (way.x * Math.sin(ph) + way.z * Math.cos(ph)) * Math.cos(th)) / .11, dph = (way.x * Math.cos(ph) - way.z * Math.sin(ph)) / (.09 * Math.max(.2, Math.sin(th)));
      th = Math.min(Math.PI - .2, Math.max(.02, th + dth * along)); ph += dph * along;
    }
    if (fall > 0) { const last = points[points.length - 1]!, outward = last.clone().setY(0).normalize(), sway = (r() - .5) * .03;
      for (const k of [1, 2, 3]) { const p = last.clone().addScaledVector(down, fall * k / 3).addScaledVector(outward, .006 * k + (r() - .5) * .006).add(new THREE.Vector3(-outward.z, 0, outward.x).multiplyScalar(sway * k / 3));
        if (p.z > -.03 && p.y < .07 && Math.abs(p.x) < sk.ax + .016) p.x = Math.sign(p.x || 1) * (sk.ax + .016); // off the face
        if (p.y < .03) p.z = Math.min(p.z, -.012 - .1 * Math.max(0, .03 - p.y)); // behind the ear line, never across the cheek in profile
        const round = Math.hypot(p.x, p.z); if (p.y < -.06 && round < .09) { p.x *= .09 / round; p.z *= .09 / round; } // over the neck, not in it
        points.push(p); normals.push(outward.clone().lerp(normals[normals.length - 1]!, .3).normalize()); } }
    const P: number[] = [], C: number[] = [], last = points.length - 1;
    for (let k = 0; k <= last; k++) {
      const p = points[k]!, tangent = (points[Math.min(last, k + 1)]!.clone().sub(points[Math.max(0, k - 1)]!)).normalize(), side = normals[k]!.clone().cross(tangent).normalize().applyAxisAngle(tangent, twist * 6.2832 * k / Math.max(1, last));
      const half = wide * (1 - .7 * (k / last) ** 1.4) / 2, color = (color0 ? tone.copy(color0).multiplyScalar(.85 + .3 * noise(p.x * 300, p.y * 300)) : hairTint(p, theta + k * .3, phi)).multiplyScalar(1 - .12 * (k % 2)).lerp(shade.copy(hair).lerp(DUST, .45), light * (k / last) ** 2);
      for (const w of [-1, 1]) { P.push(p.x + side.x * half * w, p.y + side.y * half * w, p.z + side.z * half * w); C.push(color.r, color.g, color.b); }
    }
    grid(H.hair, P, C, last + 1, 2, false);
  };
  const downHead = (theta: number, phi: number) => sk.over(theta + .2, phi, 0, new THREE.Vector3()).sub(sk.over(theta, phi, 0, new THREE.Vector3()));
  if (cover !== "cloth" && cover !== "coif") {
    const long = hairStyle === "matted" ? .5 : female ? .35 : 0, thick = hairStyle === "matted" ? .014 : hairStyle === "tied" ? .008 : .006, rough = hairStyle === "matted" ? .005 : .003;
    const line = (phi: number) => { const a = (1 - Math.cos(phi)) / 2; return (1.02 + .3 * a + (.55 + long) * a ** 3 - .12 * bell(Math.abs(phi), .55, .2) - .05 * kid) * (1 + .08 * (noise(phi * 5 + seed, 1) - .5)); }; // receding a little at the temples, uneven
    edgeAt = line;
    shellAt = (theta, phi) => { const u = Math.min(1, theta / line(phi)); return (thick + .006 * ss(.5, 0, u) + lumps(theta, phi, 5) * rough) * (1 - .9 * ss(.6, 1, u)) + .0012; };
    patch(H.hair, n(7, 4), n(26, 11), true, (u, v, out) => { const phi = v * 6.2832 - Math.PI, theta = line(phi) * u; return sk.over(theta, phi, shellAt(theta, phi), out); },
      (u, v, at) => hairTint(at, line(v * 6.2832 - Math.PI) * u, v * 6.2832 - Math.PI).multiplyScalar(.85 - .2 * ss(.85, 1, u)));
    const crown = sk.over(.45, Math.PI * .85, 0, new THREE.Vector3()), knot = sk.over(1.95, Math.PI, .014, new THREE.Vector3());
    if (hairStyle === "matted") { // parted over the crown and falling to either side in ropes of every thickness, the ends paler with dust; none over the face
      for (let k = 0, all = n(34, 14); k < all; k++) {
        const side = k % 2 ? 1 : -1, phi = side * (.1 + Math.PI * .9 * ((k >> 1) / (all / 2)) ** .9 + (r() - .5) * .15), theta = line(phi) * (.08 + r() * .45), back = (1 - Math.cos(phi)) / 2;
        const forward = Math.abs(phi) < .7; // the front ropes swept back over the temples, not down over the face
        strand(theta, phi, () => forward ? new THREE.Vector3(side * .6, -.2, -1) : Math.abs(phi) < 1.6 ? new THREE.Vector3(side * .7, -.6, -.9) : new THREE.Vector3(side, -.9, -.35), 3, .022 + r() * .012, .008 + r() * .01, .007 + r() * .005, forward ? 0 : (.06 + back * .14) * (.6 + r() * .6), .3 + r() * .7, .1 + r() * .25);
      }
    } else for (let k = 0, all = n(hairStyle === "tied" ? 70 : 80, 22); k < all; k++) { // short hair combed out from the crown, the ends lying flat; tied hair combed back to the knot
      const phi = (r() * 2 - 1) * Math.PI, theta = line(phi) * (hairStyle === "tied" ? .2 + r() * .75 : .15 + r() * .82);
      if (cover === "straw" && theta < line(phi) * .7) continue; // under the hat
      const comb = hairStyle === "tied" ? (at: THREE.Vector3) => knot.clone().sub(at) : (at: THREE.Vector3) => at.clone().sub(crown).add(new THREE.Vector3(0, -.03, 0));
      strand(theta, phi, comb, 3, hairStyle === "tied" ? .016 : .008 + .007 * noise(phi * 2.5 + seed, 3), .006 + r() * .005, .003 + r() * .003, 0, 0, 0);
    }
    if (hairStyle === "tied") ball(H.hair, knot.clone().addScaledVector(down, -.01), female ? [.036, .032, .032] : [.024, .022, .022], n(6, 3), n(10, 5), (at) => hairTint(at, 2 + at.y * 30, at.x * 40)); // the knot at the back
  }
  for (const sign of [-1, 1]) for (let k = 0, all = n(early ? 11 : 15, 3); k < all; k++) { // an eyebrow, short hairs lying along the brow, upward at its inner end
    const f = (k + r() * .5) / all, dx = sign * (.13 + .03 * early + .5 * f), dy = .265 + (.035 + .015 * early) * Math.sin(.5 + f * 2.4) - .02 * knit * (1 - f) + (r() - .5) * .02 * (1 - f * .5), theta = Math.acos(dy), phi = Math.asin(dx / Math.sin(theta));
    strand(theta, phi, () => new THREE.Vector3(sign, .6 * (1 - f) - .4 * f, 0), 2, .005 + .003 * (1 - f), (.004 + .003 * browK + .0015 * early) * (1 - .4 * f), .0009, 0, 0, 0, true, brows);
  }
  if (beard) { const top = (phi: number) => 2.12 - .55 * ss(.3, 1.4, Math.abs(phi)), thick = early ? .01 : .006; // from below the lower lip and up the jaw to the ears, under strands combed down
    patch(H.hair, n(6, 3), n(14, 7), false, (u, v, out) => { const phi = (v - .5) * 3.5, theta = top(phi) + (2.85 - top(phi)) * u; skinAt(theta, phi, (thick + lumps(theta, phi, 9) * thick) * Math.sin(Math.PI * Math.min(1, u * 1.3 + .12)) * ss(0, .22, Math.min(v, 1 - v)) * ss(0, .45, u) + .0006, out); return out.addScaledVector(down, .008 * u * Math.cos(phi) * (1 + early)); },
      (u, v, at) => { const skin = flesh(place.copy(at).applyMatrix4(frame)).clone(); return hairTint(at, u * 3, v * 9).multiplyScalar(.85 + .3 * u + .25 * (noise(v * 30, u * 12) - .5)).lerp(skin, .55 * ss(.35, 0, u) * (.6 + .8 * noise(v * 40, seed))); }); // the upper edge thinning into the skin
    for (let k = 0, all = n(20, 8); k < all; k++) { // strands, most along the upper edge to break it up
      const phi = (r() * 2 - 1) * 1.6, theta = top(phi) - .04 + (2.7 - top(phi)) * r() ** 2; strand(theta, phi, () => down.clone().addScaledVector(new THREE.Vector3(Math.sign(phi), 0, 0), .3), 2, .008 + r() * .006, .007, thick * .8, 0, 0, .1, true); }
    for (let k = 0, all = n(14, 4); k < all; k++) { const f = (k + .5) / all * 2 - 1, dx = f * .34, dy = -.285 - .07 * f * f, theta = Math.acos(dy), phi = Math.asin(dx / Math.sin(theta)); // the moustache, over the upper lip and past the corners
      strand(theta, phi, () => new THREE.Vector3(f * 1.3, -1, .25), 2, .006 + .004 * Math.abs(f), .008, .0025, 0, 0, 0, true); }
  }
  if (cover === "cloth" || cover === "coif") { // a cloth wound round the head: folds over it, the edge rolled, wrapped low behind; a head cloth wound in bands that overlap, knotted at the back
    const edge = (phi: number) => { const a = (1 - Math.cos(phi)) / 2; return (cover === "cloth" ? .82 : .86) + (cover === "cloth" ? 1.4 : 1.25) * a ** .8 + .04 * (noise(phi * 4, seed) - .5); }, color = cover === "cloth" ? dye : new THREE.Color("#e3dac5").multiplyScalar(.9 + r() * .1);
    const crease = (u: number, phi: number) => pleatHead(phi * 2 + u * 3) * ss(.3, .9, u) * (cover === "cloth" ? 1 : .4);
    patch(H.cloth, n(8, 4), n(22, 11), true, (u, v, out) => { const phi = v * 6.2832 - Math.PI, theta = edge(phi) * u;
      return sk.over(theta, phi, .012 + .01 * crease(u, phi) + .004 * lumps(theta, phi, 6) + .008 * Math.sin(Math.PI * ss(.86, 1, u)) - .004 * ss(.97, 1, u), out); }, // the rolled edge
      (u, v, at) => { const phi = v * 6.2832 - Math.PI; return weave(color, at, crease(u, phi) - .6 * ss(.97, 1, u), 0); });
    if (cover === "cloth") {
      for (const [k, slope] of [[0, .22], [1, -.18]] as const) // two turns of the cloth round the head, each crossing the last, rolled at both edges
        patch(H.cloth, n(4, 2), n(22, 10), true, (u, v, out) => { const phi = v * 6.2832 - Math.PI, center = edge(phi) * (.72 + .1 * k) + slope * Math.cos(phi) - .05, theta = center + (u - .5) * .3;
          return sk.over(theta, phi, .021 + .006 * k + .006 * Math.sin(Math.PI * u) ** .5 + .004 * pleatHead(phi * 5 + k * 2) * Math.sin(Math.PI * u), out); },
        (u, v, at) => weave(color, at, pleatHead(v * 31 + k * 2) * .6 - .5 * ss(.8, 1, Math.abs(u * 2 - 1)), 0));
      const knot = sk.over(edge(Math.PI) * .8, Math.PI, .03, new THREE.Vector3()), back = new THREE.Vector3(0, 0, -1); // the knot, the ends hanging down the back
      ball(H.cloth, knot, [.03, .024, .02], n(5, 3), n(8, 5), (at) => weave(color, at, -.3, 0));
      for (const side of [-1, 1]) tube(H.cloth, [knot.clone(), knot.clone().addScaledVector(down, .07).addScaledVector(back, .012).add(new THREE.Vector3(side * .015, 0, 0)), knot.clone().addScaledVector(down, .16 + .03 * side).addScaledVector(back, .03).add(new THREE.Vector3(side * .03, 0, 0))], back, n(4, 2), n(8, 5),
        (t, c, s) => ellipse(.03 + .015 * t, .005, c, s) * (1 + .1 * Math.sin(c * 9) * t), (t, c, _s, at) => weave(color, at, Math.sin(c * 9) * t, 0), { caps: [true, false], lips: true });
    }
  }
  if (cover === "straw") { const rim: Array<[number, number]> = [[0, .15], [.05, .148], [.085, .135], [.095, .1], [.098, .065], [.125, .058], [.165, .046], [.195, .03], [.205, .015]];
    patch(H.straw, rim.length - 1, n(18, 10), true, (u, v, out) => { const k = u * (rim.length - 1), i = Math.min(rim.length - 2, Math.floor(k)), [r0, y0] = rim[i]!, [r1, y1] = rim[i + 1]!, f = k - i, phi = v * 6.2832;
      const radius = (r0 + (r1 - r0) * f) * (1 + .04 * (noise(phi * 9 + seed, 3) - .5) * ss(.8, 1, u)); // the brim a little ragged
      return out.set(Math.sin(phi) * radius, y0 + (y1 - y0) * f + .012 * Math.sin(phi * 3 + seed) * ss(.12, .205, radius) - .006 * noise(phi * 7, seed) * ss(.85, 1, u), Math.cos(phi) * radius * 1.08 - .006); },
      (u, v, at) => { const radius = Math.hypot(at.x, at.z / 1.08); return tone.copy(STRAW).multiplyScalar((.82 + noise(v * 80, u * 9) * .26) * (.88 + .12 * Math.sin(radius * 520 + at.y * 400)) * (at.y > .066 && at.y < .085 && u > .3 && u < .55 ? .45 : 1)); }); }
  for (const [l, surface] of [[H.skin, 5], [H.hair, 7], [H.cloth, 6], [H.straw, 3], [H.plain, 0], [H.eye, 0]] as const) { const g = finish(l, surface); if (g) parts.push(g.applyMatrix4(frame)); }

  // ---------- arms and hands ----------
  const sleeve = dress === "hide" || !covered ? 0 : dress === "tunic" ? (r() < .5 ? .72 : .93) : .3, hs = (1 - .07 * female) * (1 + .05 * early), armK = bulk * (1 - .14 * female);
  for (const k of [0, 1] as const) {
    const sign = k ? 1 : -1, elbow = V(pose.elbows[k]), target = V(pose.hands[k]), grip = pose.grip?.[k] ?? .2, held = pose.hold?.[k], open = pose.palm?.[k];
    const f0 = target.clone().sub(elbow).normalize(); let f: THREE.Vector3, thumb: THREE.Vector3, palm: THREE.Vector3;
    if (held) { thumb = V(held).normalize(); f = across(f0, thumb, new THREE.Vector3(0, -1, 0)); palm = sign > 0 ? f.clone().cross(thumb) : thumb.clone().cross(f); }
    else { f = f0; palm = across(open ? V(open) : new THREE.Vector3(-sign, 0, .1), f, new THREE.Vector3(-sign, 0, 0)); thumb = sign > 0 ? palm.clone().cross(f) : f.clone().cross(palm); }
    const center = target.clone().addScaledVector(palm, held ? -.026 : 0), wrist = center.clone().addScaledVector(f, -.048 * hs), knuckles = center.clone().addScaledVector(f, .044 * hs);
    const shoulder = chest.clone().addScaledVector(sideX, sign * .158 * shoulderK * bulk).addScaledVector(up, -.03).addScaledVector(ahead, -.01), inner = chest.clone().addScaledVector(sideX, sign * .07).addScaledVector(up, .01);
    const l0 = inner.distanceTo(shoulder), l1 = shoulder.distanceTo(elbow), l2 = elbow.distanceTo(wrist), ts = l0 / (l0 + l1 + l2), te = (l0 + l1) / (l0 + l1 + l2);
    const upper = elbow.clone().sub(shoulder).normalize(), fore = wrist.clone().sub(elbow).normalize(), bent = fore.clone().addScaledVector(upper, -fore.dot(upper)), w = ss(.05, .3, bent.length());
    const anterior = bent.normalize().multiplyScalar(w).addScaledVector(thumb, 1 - w).normalize(), facing = (t: number) => anterior.clone().lerp(thumb, ss(te - .06, te + .15, t));
    const arm: Section = (t, c, s) => {
      if (t < te) { const u = (t - ts) / (te - ts); return armK * (.056 - .016 * ss(.1, 1, u) + .008 * bell(u, .1, .14) + .007 * bell(u, .55, .22) * Math.max(0, s) + .006 * bell(u, .4, .25) * Math.max(0, -s)); } // the deltoid rounding into the arm, biceps, triceps
      const v = (t - te) / (1 - te), radius = armK * (.038 + .008 * bell(v, .22, .2) - .014 * ss(.35, 1, v)), flat = ss(.4, 1, v);
      return ellipse(radius * (1 - .2 * flat), radius * (1 + .14 * flat), c, s);
    };
    const armTint: Tint = (t, _c, s, at) => flesh(at, 0, bell(t, te, .05) * Math.max(0, -s) * .8);
    tube(skinL, [inner, shoulder, elbow, wrist], facing, n(sleeve > .5 ? 6 : 10, 6), n(9, 7), arm, armTint, { from: sleeve > .5 ? sleeve - .05 : 0, caps: [true, true] });
    if (sleeve) tube(clothL, [inner, shoulder, elbow, wrist], facing, n(sleeve > .5 ? 10 : 4, 3), n(12, 8), (t, c, s) => arm(t, c, s) + .011 + .01 * ss(.5, 1, t / sleeve) + .004 * Math.sin(Math.atan2(s, c) * 3 + t * 9) + .005 * Math.sin(Math.atan2(s, c) * 2 + t * 60) * bell(t, te, .07), // creased at the elbow
      (t, c, s, at) => weave(fabric, at, Math.sin(Math.atan2(s, c) * 3 + t * 9), 0), { to: sleeve, caps: [true, false], lips: true });
    // the hand: a palm, four fingers and a thumb, curled by `grip` round the line of the thumb
    const across0 = sign > 0 ? -1 : 1, handTint = (palmSide: number, dark: number, at: THREE.Vector3) => flesh(at, Math.max(0, palmSide) * .6, dark).multiply(shade.setRGB(1 + .08 * dark, 1, 1)); // knuckles darker and redder
    tube(skinL, [wrist.clone().addScaledVector(f, -.012), wrist, center, knuckles.clone().addScaledVector(f, .006)], palm, n(3, 2), n(8, 6),
      (t, c, s) => ellipse((.026 + .016 * ss(0, .7, t)) * hs, (s > 0 ? .015 : .011) * hs, c, s) + .005 * bell(t, .25, .2) * Math.max(0, c * across0) * Math.max(0, s), // the ball of the thumb
      (t, _c, s, at) => handTint(s, ss(.8, 1, t) * Math.max(0, -s), at), { caps: [true, true] });
    const fingers = small ? [[0, .042, .028, .022]] : [[.024, .04, .025, .02], [.007, .044, .028, .022], [-.01, .041, .026, .021], [-.025, .032, .019, .017]];
    for (const [offset, ...bones] of fingers) {
      const curl = [.12 + grip * 1.15, .18 + grip * 1.35, .12 + grip * .8], points = [knuckles.clone().addScaledVector(thumb, offset! * hs).addScaledVector(f, -.012 + (offset! < -.02 ? -.006 : 0))];
      points.push(points[0]!.clone().addScaledVector(f, .012)); let angle = 0;
      for (let b = 0; b < 3; b++) { angle += curl[b]!; points.push(points[points.length - 1]!.clone().addScaledVector(f, Math.cos(angle) * bones[b]! * hs).addScaledVector(palm, Math.sin(angle) * bones[b]! * hs)); }
      const wide = small ? .019 : offset! < -.02 ? .008 : .0095;
      tube(skinL, points, thumb, n(4, 3), n(4, 4), (t, c, s) => ellipse(wide * (1 - .2 * t) * hs, .0085 * (1 - .2 * t) * hs, c, s), (t, _c, _s, at, out) => handTint(out.dot(palm), Math.max(0, -out.dot(palm)) * (bell(t, .28, .07) + bell(t, .6, .06)), at), { caps: [true, true] });
    }
    const root = center.clone().addScaledVector(f, -.03 * hs).addScaledVector(thumb, .026 * hs).addScaledVector(palm, .006), tip = f.clone().multiplyScalar(.45).addScaledVector(palm, .75).addScaledVector(thumb, -.35).normalize();
    const thumbs = [root.clone().addScaledVector(f, -.01)], open0 = f.clone().multiplyScalar(.75).addScaledVector(thumb, .4).addScaledVector(palm, .4).normalize(); // alongside the hand when it is open
    for (const [b, length] of [.04, .032, .027].entries()) thumbs.push(thumbs[thumbs.length - 1]!.clone().addScaledVector(open0.clone().lerp(tip, grip * (.35 + .3 * b)).normalize(), length * hs));
    tube(skinL, thumbs, palm, n(4, 3), n(5, 5), (t) => (.014 - .005 * t) * hs, (_t, _c, _s, at, out) => handTint(out.dot(palm), 0, at), { caps: [true, true] });
  }

  // ---------- legs and feet ----------
  const legsIn = dress === "tunic" ? clothL : skinL;
  for (const k of [0, 1] as const) {
    const sign = k ? 1 : -1, knee = V(pose.knees[k]), foot = V(pose.feet[k]), joint = hip.clone().addScaledVector(sideX, sign * .088 * (1 + .05 * female) * bulk).addScaledVector(up, -.07).addScaledVector(ahead, .005);
    const inner = joint.clone().addScaledVector(up, .09).addScaledVector(sideX, -sign * .03), thigh = knee.clone().sub(joint).normalize(), shin0 = foot.clone().sub(knee).normalize();
    const forward = new THREE.Vector3(0, 0, 1), foldT = shin0.clone().addScaledVector(thigh, -shin0.dot(thigh)), foldS = thigh.clone().addScaledVector(shin0, -thigh.dot(shin0)), w = ss(.05, .3, foldT.length());
    const frontThigh = foldT.normalize().multiplyScalar(-w).addScaledVector(across(forward, thigh, UP), 1 - w).normalize(), frontShin = foldS.normalize().multiplyScalar(w).addScaledVector(across(forward, shin0, UP), 1 - w).normalize();
    // the foot rests flat, or when the shin lies along the ground (kneeling) it points straight on, its top to the ground
    const flex = ss(.55, .2, Math.abs(shin0.y)), level = frontShin.clone().setY(0).lengthSq() > 1e-4 ? frontShin.clone().setY(0).normalize() : forward.clone();
    level.applyAxisAngle(UP, sign * .12 * (1 - flex)); // toes a little out
    const D = level.lerp(shin0, flex).normalize(), top = across(UP.clone().lerp(frontShin, flex), D, UP), ankle = foot.clone().addScaledVector(top, .03);
    const l0 = inner.distanceTo(joint), l1 = joint.distanceTo(knee), l2 = knee.distanceTo(ankle), th = l0 / (l0 + l1 + l2), tk = (l0 + l1) / (l0 + l1 + l2);
    const leg: Section = (t, c, s) => {
      if (t < tk) { const u = Math.max(0, (t - th) / (tk - th)), radius = bulk * (.092 - .036 * u ** 1.1 + .01 * bell(u, .45, .3) * Math.max(0, s) + .008 * bell(u, .4, .3) * Math.max(0, -s) - .004 * bell(u, .85, .06) + .009 * bell(u, .98, .06) * Math.max(0, s) ** .7) * (1 + .04 * female + .05 * early); // thigh, the dip above the knee, the kneecap
        return ellipse(radius * 1.05, radius, c, s); }
      const v = (t - tk) / (1 - tk); return bulk * (1 + .05 * early) * (.048 - .02 * ss(0, 1, v) + .022 * bell(v, .27, .17) * Math.max(0, -s) ** .6 * (1 - .06 * female) + .006 * bell(v, .3, .2) * Math.abs(c) + .004 * bell(v, .95, .06) * Math.abs(c)); // the calf, the ankle bones
    };
    const shod = dress === "tunic", legTint: Tint = (t, _c, s, at) => shod ? weave(hose, at, 0, ss(.5, 1, t) * .5) : flesh(at, 0, bell(t, tk, .04) * Math.max(0, s) * .9, 1);
    tube(legsIn, [inner, joint, knee, ankle], (t) => frontThigh.clone().lerp(frontShin, ss(tk - .04, tk + .04, t)), n(9, 7), n(8, 7), leg, legTint, { caps: [true, true] });
    const heel = ankle.clone().addScaledVector(D, -.055).addScaledVector(top, -.032), FOOT = [[0, .028, .026, .021], [.18, .032, .029, .025], [.45, .039, .031, .015], [.72, .049, .019, .014], [.88, .047, .015, .012], [1, .033, .011, .009]], more = shod ? .006 : 0;
    tube(shod ? plainL : skinL, [heel.clone().addScaledVector(D, -.01).addScaledVector(top, .02), heel, ankle.clone().addScaledVector(D, .03).addScaledVector(top, -.03), ankle.clone().addScaledVector(D, .135).addScaledVector(top, -.04), ankle.clone().addScaledVector(D, .195).addScaledVector(top, -.045)], top, n(7, 5), n(9, 7),
      (t, c, s) => ellipse(key(FOOT, t, 1) + more, key(FOOT, t, s > 0 ? 2 : 3) + more, c, s) * (shod || s < -.2 ? 1 : 1 - .14 * ss(.8, .92, t) * (.5 - .5 * Math.cos(c * Math.PI * 4.5))), // toes
      (t, _c, s, at) => shod ? tone.copy(LEATHER).multiplyScalar(.85 + noise(at.x * 40, at.z * 40) * .3) : flesh(at, Math.max(0, -s) * .5, ss(.85, 1, t) * .4, 1), { caps: [true, true] });
  }

  // ---------- clothes ----------
  const knees = V(pose.knees[0]).lerp(V(pose.knees[1]), .5), spread = Math.abs(pose.knees[1][0] - pose.knees[0][0]) / 2, ankles = V(pose.feet[0]).lerp(V(pose.feet[1]), .5).setY(.1), waist = hip.clone().addScaledVector(up, .13).addScaledVector(ahead, -slump * .5);
  const length = dress === "hide" ? .42 : dress === "tunic" ? .9 : female && !seated ? 1.35 : .95, hem = length <= 1 ? hip.clone().lerp(knees, length) : knees.clone().lerp(ankles, length - 1), wrapped = dress === "hide" ? hide : dress === "tunic" ? fabric : lower;
  const stride = Math.max(Math.abs(pose.knees[1][2] - pose.knees[0][2]), Math.abs(pose.feet[1][2] - pose.feet[0][2]) * Math.max(0, length - 1) * 1.5) / 2 + .03 * seated + .02 * Math.max(0, -ahead.y), folds = dress === "hide" ? 5 : 8, phase = r() * 6, banded = dress === "wrap" && r() < .4, overlap = Math.PI / 2 - .25 + (r() - .5) * .4;
  /** Folds in hanging cloth at angle `a`, irregularly spaced, the valleys sharper than the ridges. */
  const pleat = (a: number, count: number) => { const bent = a + .35 * Math.sin(2 * a + phase) + .2 * Math.sin(3 * a + 2 * phase), f = Math.sin(count * bent) * .65 + Math.sin(count * 1.7 * bent + phase) * .35; return f > 0 ? f : f * 1.4; };
  const fold = (t: number, c: number, s: number) => pleat(Math.atan2(s, c), folds) * ss(.12, 1, t) ** 1.2;
  const lap = (c: number, s: number) => { const a = Math.atan2(s, c), d = (a - overlap + Math.PI * 3) % (Math.PI * 2) - Math.PI; return dress === "wrap" ? ss(-.04, 0, d) * ss(1.5, 1.3, d) : 0; }; // the outer end of the wrap, its edge down the front
  tube(dress === "hide" ? hairL : clothL, [waist, hip.clone().addScaledVector(up, -.03), hip.clone().lerp(hem, .6), hem], (t) => ahead.clone().lerp(new THREE.Vector3(0, 0, 1), t), n(7, 5), n(20, 12), (t, c, s) => {
    const legs = (spread * Math.min(1, length) * ss(.2, 1, t) + .08 * bulk + .04) * (1 + .14 * t * t), w = Math.max(key(TRUNK, .3, 1) * bulk * (1 + .07 * female) + .025, legs), d = (.145 + (s < 0 ? (.015 + .04 * Math.max(0, -ahead.y)) * ss(.6, 0, t) : 0)) * bulk + (.04 + stride) * t;
    return ellipse(w, d, c, s) * (1 + (dress === "hide" ? .06 : .085) * fold(t, c, s)) + .008 + .006 * lap(c, s);
  }, (t, c, s, at) => { const color = banded && t > .84 && t < .92 ? dye : wrapped, a = Math.atan2(s, c), edge = (a - overlap + Math.PI * 3) % (Math.PI * 2) - Math.PI;
    return weave(color, at, fold(t, c, s), ss(.65, 1, t) * (dress === "hide" ? .3 : .75)).multiplyScalar(dress === "wrap" && edge < 0 && edge > -.08 ? .7 : 1).multiplyScalar(dress === "hide" ? .85 + .3 * noise(at.x * 14 + at.z * 9, at.y * 14) : 1); }, {
    caps: [false, false], lips: true, rim: dress === "hide" ? 1.45 : .7, move: (at, t, c, s) => { // the hem falls, flares a little, and drapes down between the knees of someone sitting
      const a = Math.atan2(s, c), ragged = dress === "hide" ? (noise(a * 3 + phase, 1) - .3) * .08 + (noise(a * 11, phase) - .5) * .03 : (noise(a * 2 + phase, 2) - .5) * .03;
      at.y = Math.max(.012, at.y - (ss(.45, 1, t) * (.04 + .14 * seated * Math.max(0, s + .2)) + ragged * ss(.8, 1, t)));
    },
  });
  if (covered) { const neck = dress === "tunic" ? .93 : .91; // the top: pulled across the chest and shoulders, bunched above the belt, a neckline, short or long sleeves
    const hang = (t: number, c: number, s: number) => pleat(Math.atan2(s, c), 7) * ss(.62, .3, t) + .5 * Math.sin(t * 90 + c * 2) * bell(t, .34, .04);
    tube(clothL, trunk, ahead, n(9, 6), n(20, 12), (t, c, s) => trunkSection(.012 + .02 * bell(t, .33, .07) + .01 * ss(.55, .3, t))(t, c, s) + .008 * hang(t, c, s),
      (t, c, s, at) => weave(fabric, at, hang(t, c, s), 0).multiplyScalar(1 - .14 * Math.max(0, -s) * bell(t, .72, .15)), { from: dress === "tunic" ? .2 : .26, to: neck, caps: [false, false], lips: true }); // darker where the back sweats
    tube(plainL, trunk, ahead, 1, n(18, 12), trunkSection(.03), (_t, _c, _s, at) => tone.copy(dress === "tunic" ? LEATHER : dye).multiplyScalar(.85 + noise(at.x * 30, at.y * 30) * .3), { from: .38, to: .42, caps: [false, false] }); // the belt or sash
  } else if (dress === "hide" && (female || r() < .5)) { // a hide over the shoulders: wrapped round for a woman, a cape over the back for a man; ragged, the pale skin side showing at the edge
    tube(hairL, trunk, ahead, n(7, 3), n(22, 10), (t, c, s) => trunkSection(.018 + .012 * ss(.8, .95, t))(t, c, s) + .01 * pleat(Math.atan2(s, c), 4) * ss(.8, .6, t), (t, c, s, at) => weave(hide, at, pleat(Math.atan2(s, c), 4) * ss(.8, .6, t), 0).multiplyScalar(.8 + .4 * noise(at.x * 14, at.y * 14 + at.z * 9)),
      { from: female ? .6 : .66, to: .95, arc: female ? undefined : [Math.PI * .8, Math.PI * 2.2], caps: [false, false], lips: true, rim: 1.45, move: (at, t) => { if (t < .7) at.y -= (noise(at.x * 20, at.z * 20) - .2) * .035 + (noise(at.x * 70, at.z * 70) - .5) * .015; } });
  }
  for (const [l, surface] of [[skinL, 5], [clothL, 6], [hairL, 7], [plainL, 0]] as const) { const g = finish(l, surface); if (g) parts.push(g); }
  return merged(parts);
}

/** A goat facing +z, hooves on y = 0: a barrel of a body, a thin neck, the long head with its beard, swept-back horns, drooping ears, thin legs with the knee
 * and hock, and a short tail turned up. `small` draws about half as many triangles. */
export function goat(rand: () => number, { graze = false, coat = "#7a6650", small = false }: { graze?: boolean; coat?: string; small?: boolean } = {}) {
  const r = sequence(Math.floor(rand() * 4294967296)), q = small ? .5 : 1, n = (k: number, least: number) => Math.max(least, Math.round(k * q)), P = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const fur = layer(), plain = layer(), base = new THREE.Color(coat).multiplyScalar(.92 + r() * .14), light = base.clone().lerp(new THREE.Color("#e8dfcc"), .25), dark = base.clone().multiplyScalar(.55);
  const pied = r() < .35, stripe = r() < .5;
  const coatAt = (at: THREE.Vector3, belly = 0, legs = 0) => {
    const shag = .82 + noise(at.x * 30 + at.z * 9, at.y * 14) * .3 + noise(at.x * 90, at.y * 90 + at.z * 40) * .1;
    tone.copy(base).lerp(light, belly * .5).lerp(dark, legs * .5).multiplyScalar(shag);
    if (pied && noise(at.x * 4 + 3, at.z * 4 + at.y * 3) > .62) tone.lerp(light, .7);
    if (stripe) tone.lerp(dark, .6 * ss(.035, .01, Math.abs(at.x)) * ss(.5, .6, at.y) * ss(.35, -.35, at.z) * ss(-.4, -.2, at.z));
    return tone;
  };
  // the body: rump to chest, flat along the spine, round and deep in the barrel and brisket, shaggy along the belly
  const BODY = [[0, .07, .07, .08], [.12, .115, .1, .13], [.5, .145, .1, .17], [.82, .11, .1, .17], [1, .07, .07, .09]];
  tube(fur, [P(0, .56, -.42), P(0, .56, -.36), P(0, .53, 0), P(0, .55, .3), P(0, .6, .4)], UP, n(14, 7), n(16, 10), (t, c, s) => ellipse(key(BODY, t, 1), key(BODY, t, s > 0 ? 2 : 3), c, s) * (1 + .1 * Math.abs(c) * Math.max(0, s)) + .012 * bell(t, .14, .06) * Math.max(0, s) * Math.abs(c),
    (_t, _c, s, at) => coatAt(at, Math.max(0, -s)), { move: (at, t, c, s) => { if (s < -.3) at.y -= (noise(c * 9 + t * 20, 3) * .03 + .01) * ss(.1, .3, t) * ss(.95, .75, t); } });
  // neck and head
  const poll = graze ? P(0, .3, .6) : P(0, .82, .5), dir = (graze ? P(0, -.95, .3) : P(0, -.5, .86)).normalize(), lateral = P(1, 0, 0), top = dir.clone().cross(lateral);
  tube(fur, [P(0, .55, .22), P(0, .6, .34), graze ? P(0, .48, .52) : P(0, .74, .44), poll.clone().addScaledVector(dir, .02)], graze ? P(0, -.4, 1) : P(0, -1, .4), n(7, 4), n(10, 7),
    (t, c, s) => ellipse(.055 - .012 * t, (s > 0 ? .075 : .06) - .02 * t, c, s), (_t, _c, _s, at) => coatAt(at));
  const muzzle = poll.clone().addScaledVector(dir, .21);
  tube(fur, [poll.clone().addScaledVector(dir, -.03), poll, poll.clone().addScaledVector(dir, .1).addScaledVector(top, -.005), muzzle], top, n(8, 4), n(12, 8),
    (t, c, s) => ellipse(.05 - .022 * ss(.3, 1, t) + .006 * bell(t, .35, .12), s > 0 ? .045 - .015 * t : .052 - .02 * ss(.3, 1, t), c, s), (t, _c, s, at) => coatAt(at, 0, ss(.6, 1, t) * .6).multiplyScalar(t > .93 && s < .2 ? .5 : 1));
  for (const sign of [-1, 1]) {
    const at = (along: number, out: number, lift: number) => poll.clone().addScaledVector(dir, along).addScaledVector(lateral, sign * out).addScaledVector(top, lift);
    ball(plain, at(.075, .042, .018), [.009, .009, .009], n(3, 2), n(6, 4), () => tone.set("#3a2a12"));
    tube(fur, [at(.01, .03, .015), at(0, .07, .01), at(-.005, .12, -.03)], top, n(4, 2), n(6, 4), (t, c, s) => ellipse(.012 + .012 * Math.sin(Math.PI * t), .005, c, s), (_t, _c, s, at) => coatAt(at).multiplyScalar(s > 0 ? 1 : .75), { caps: [true, true] }); // the ears droop
    const horn = [at(.02, .022, .035), at(-.01, .03, .085), at(-.07, .05, .11), at(-.14, .075, .09), at(-.18, .09, .05)];
    tube(plain, horn, dir.clone().negate(), n(10, 5), n(6, 5), (t) => (.017 - .014 * t) * (1 + .1 * Math.sin(t * 38)), (t, _c, _s, at) => tone.set("#3a332b").lerp(shade.set("#9a8a70"), t * .6).multiplyScalar(.85 + noise(at.y * 200, t * 9) * .3), { caps: [true, true] });
    for (const [x, z, hind] of [[.075, .27, 0], [.08, -.33, 1]] as const) { // a leg: shoulder or thigh, knee or hock, the cannon, the hoof
      const pts = hind ? [P(sign * x, .52, z), P(sign * x * 1.05, .38, z + .06), P(sign * x * .95, .26, z - .06), P(sign * x * .9, .06, z - .02), P(sign * x * .9, .015, z)] : [P(sign * x, .5, z), P(sign * x, .36, z + .01), P(sign * x * .95, .2, z + .015), P(sign * x * .93, .06, z + .02), P(sign * x * .93, .015, z + .025)];
      tube(fur, pts, P(0, 0, 1), n(10, 5), n(8, 5), (t) => (hind ? .05 - .033 * ss(0, .45, t) : .04 - .022 * ss(0, .4, t)) + .004 * bell(t, hind ? .45 : .5, .05) + .003 * bell(t, .86, .05), (t, _c, _s, at) => coatAt(at, 0, ss(.3, .8, t)));
      const foot = pts[4]!;
      tube(plain, [foot.clone().setY(.05), foot.clone().setY(.025).add(P(0, 0, .006)), foot.clone().setY(0).add(P(0, 0, .012))], P(0, 0, 1), 2, n(8, 5), (t, c, s) => ellipse(.017 + .004 * t, .02 + .006 * t, c, s) * (1 - .25 * ss(.1, 0, Math.abs(c)) * Math.max(0, s)), // the cloven hoof
        () => tone.set("#1f1a15"), { caps: [false, true] });
    }
  }
  tube(fur, [muzzle.clone().addScaledVector(dir, -.08).addScaledVector(top, -.015), muzzle.clone().addScaledVector(dir, -.07).addScaledVector(top, -.05), muzzle.clone().addScaledVector(dir, -.075).addScaledVector(top, -.08).add(P(0, -.02, 0))], dir, n(4, 2), n(6, 4),
    (t) => .014 * (1 - .65 * t), (_t, _c, _s, at) => coatAt(at, 0, 1)); // the beard
  tube(fur, [P(0, .58, -.4), P(0, .63, -.46), P(0, .7, -.47)], P(0, 0, -1), n(4, 2), n(6, 4), (t) => .022 * (1 - .6 * t), (_t, _c, _s, at) => coatAt(at, 0, .4)); // the tail
  const parts: THREE.BufferGeometry[] = []; for (const [l, surface] of [[fur, 7], [plain, 0]] as const) { const g = finish(l, surface); if (g) parts.push(g); }
  return merged(parts);
}
