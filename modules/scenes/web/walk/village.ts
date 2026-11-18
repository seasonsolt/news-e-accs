import * as THREE from "three";
import { soft, type Kit } from "./camp.ts";
import { VILLAGE, clamp, noise, roadX, smooth } from "./land.ts";
import { POSES, goat, person, type Pose } from "./people.ts";
import { blob, faceted, flat, limb, lit, merged, of, rock, scorch, triangles, turned, type Paint } from "./shapes.ts";
import type { Plant } from "./trees.ts";

/** The first village at dawn, about ten thousand years ago: huts, the granary, the goats, and the people up before the sun. */
export function buildVillage({ scene, own, rand, small, still, floor, matte, stand, blocks }: Kit, flame: () => THREE.Mesh, plant: Plant) {
  const P = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z), X = (dx: number, s: number) => roadX(s) + dx, tone = new THREE.Color();
  const stone = of(1, lit("#4b433b", "#82776a", rand, .1)), bark = of(2, lit("#3d3026", "#6b5644", rand)), dead = of(2, lit("#75654f", "#a8957a", rand));
  const clay: Paint = (center, normal) => tone.set("#9a7655").lerp(new THREE.Color("#d0ab82"), Math.min(1, center.y * .6) * (.8 + normal.y * .2)).multiplyScalar(.9 + rand() * .2);
  const straw = of(3, (center) => tone.set("#9c8650").multiplyScalar(.82 + .2 * Math.sin(center.y * 13) + rand() * .22)), pottery = flat("#a5653f", rand, .2), ears = of(3, lit("#8e6e30", "#d6b35a", rand, .2)), hide = flat("#8d6c4a", rand, .2);
  const yard = roadX(333) + 16.5, hue = new THREE.Color(), peeled = of(2, lit("#857560", "#c4b08f", rand)), cord = flat("#55452f", rand, .2), inside = of(3, flat("#2b2119", rand, .15));
  const geo = (positions: number[]) => new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(positions, 3)), diff = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
  const push = (list: number[], ...points: THREE.Vector3[]) => { for (const p of points) list.push(p.x, p.y, p.z); };
  /** Two triangles a b c and a c d. */
  const quad = (list: number[], a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3) => push(list, a, b, c, a, c, d);
  /** A cut branch: a little crooked, knotted, its bark left on or peeled. */
  function branch(from: THREE.Vector3, to: THREE.Vector3, radius: number, knots = 1, peel = rand() < .4) {
    const parts = [limb(from, to, radius, radius * .78, peel ? peeled : bark, { sides: small ? 3 : 5, sag: .05, rand, capped: true })];
    for (let k = 0; k < knots; k++) { const at = from.clone().lerp(to, .2 + rand() * .6), a = rand() * 6.3; parts.push(blob(rand, [radius * .45, radius * .55, radius * .45], bark, 0, .3).translate(at.x + Math.cos(a) * radius * .8, at.y, at.z + Math.sin(a) * radius * .8)); }
    return merged(parts);
  }
  /** A post sunk a foot into the ground. */
  const post = (x: number, z: number, height: number, radius: number, lean = 0) => branch(P(x, -.3, z), P(x + lean, height, z + lean * .6), radius, rand() < .5 ? 1 : 0);
  /** Cord wound round a joint at `at`, around `axis`, on wood `radius` thick: three turns, one on a phone. */
  function lash(at: THREE.Vector3, axis: THREE.Vector3, radius: number) {
    const n = axis.clone().normalize(), turn = new THREE.Quaternion().setFromUnitVectors(P(0, 0, 1), n);
    return merged((small ? [0] : [-1, 0, 1]).map((k) => faceted(new THREE.TorusGeometry(radius + .006, .006, 3, small ? 5 : 8).rotateY((rand() - .5) * .3).applyQuaternion(turn).translate(at.x + n.x * k * .016, at.y + n.y * k * .016, at.z + n.z * k * .016), cord)));
  }
  /** A ring of trampled, damp earth from `from` to `to` metres out round a post or a wall, sloping under the ground at its edge. */
  function trodden(from: number, to: number, sides = 10) {
    const ring: number[] = [], at = (a: number, r: number, y: number) => P(Math.cos(a) * r, y, Math.sin(a) * r);
    for (let k = 0; k < sides; k++) { const a0 = k / sides * 6.283, a1 = (k + 1) / sides * 6.283; quad(ring, at(a0, from, .04), at(a1, from, .04), at(a1, to, -.07), at(a0, to, -.07)); }
    return triangles(ring, of(3, (c) => tone.set("#4a3a2b").lerp(hue.set("#7d6851"), smooth(from, to, Math.hypot(c.x, c.z))).multiplyScalar(.92 + rand() * .16)));
  }
  /** Where a point given in a thing's own frame lands: [x, s] for a thing at (x, s) turned by `turn`. */
  const local = (x: number, s: number, turn: number, lx: number, lz: number): [number, number] => [x + lx * Math.cos(turn) + lz * Math.sin(turn), s + lx * Math.sin(turn) - lz * Math.cos(turn)];
  const toward = (x: number, s: number, tx: number, ts: number) => Math.atan2(tx - x, s - ts);
  /** The side of a thing turned by `turn` that faces away from the morning sun, as a direction in its own frame: moss and damp gather there. */
  const shaded = (turn: number): [number, number] => [.35 * Math.cos(turn) - .93 * Math.sin(turn), .35 * Math.sin(turn) + .93 * Math.cos(turn)];

  // ---------- walls of daub, roofs of thatch ----------
  const COLS = small ? 22 : 56, ROWS = small ? 5 : 11;
  /** A hand-daubed wall round a plan `r` across: out of round, battered, leaning (`lean` per metre up), flared at a foot sunk to `base`, with an opening `gap` radians
   * wide facing +z up to `high` (0 for none), and `patches` ([angle, height, width in radians, height]) where the daub has fallen away. Returns the faces unpainted. */
  function daubed(r: number, height: number, thick: number, gap: number, high: number, lean: [number, number], patches: Array<[number, number, number, number]>, base = -.12) {
    const seed = rand() * 40, top = (a: number) => height + (noise(a * 1.4 + seed, 2) - .5) * .14;
    const fallen = (a: number, y: number) => patches.reduce((most, [pa, py, w, h]) => Math.max(most, 1 - smooth(.75, 1, Math.hypot(diff(a, pa) / (w / 2), (y - py) / (h / 2)) + (noise(a * 9 + seed, y * 9) - .5) * .3)), 0);
    const at = (a: number, y: number, side: number) => { // side 0 the outer face, 1 the inner, -1 a hair proud of the outer
      const rad = r * (1 + .035 * Math.cos(2 * a + seed) + .035 * (noise(a * 1.6 + seed, y * .7) - .5)) - y * .035 + (side === 1 ? -thick : .07 * (1 - smooth(base, .4, y)) - .035 * fallen(a, y) + (side < 0 ? .006 : 0));
      return P(Math.cos(a) * rad + lean[0] * (y - base), y, Math.sin(a) * rad + lean[1] * (y - base));
    };
    const angle = (k: number) => Math.PI / 2 + gap / 2 + k * (Math.PI * 2 - gap) / COLS, outer: number[] = [], inner: number[] = [], rim: number[] = [];
    const band = (a0: number, a1: number, rows: number, from: number) => {
      const y = (a: number, j: number) => from + (top(a) - from) * j / rows;
      for (let j = 0; j < rows; j++) {
        quad(outer, at(a0, y(a0, j), 0), at(a0, y(a0, j + 1), 0), at(a1, y(a1, j + 1), 0), at(a1, y(a1, j), 0));
        quad(inner, at(a0, y(a0, j), 1), at(a1, y(a1, j), 1), at(a1, y(a1, j + 1), 1), at(a0, y(a0, j + 1), 1));
      }
      quad(rim, at(a0, top(a0), 0), at(a0, top(a0), 1), at(a1, top(a1), 1), at(a1, top(a1), 0));
    };
    for (let k = 0; k < COLS; k++) band(angle(k), angle(k + 1), ROWS, base);
    if (gap) { // over the doorway, and the wall's depth showing at its sides and head
      const a0 = angle(COLS), a1 = angle(0) + Math.PI * 2, mid = (a0 + a1) / 2;
      band(a0, mid, 3, high); band(mid, a1, 3, high);
      for (const a of [a0, a1]) quad(rim, at(a, base, 0), at(a, high, 0), at(a, high, 1), at(a, base, 1));
      quad(rim, at(a0, high, 0), at(a1, high, 0), at(a1, high, 1), at(a0, high, 1));
    }
    return { at, fallen, top, seed, outer, inner, rim };
  }
  /** Daub as it weathers: two mixes laid on by hand, rain run down from the eaves, damp splashed up at the foot, smoke over the doorway, bare where it fell away. */
  function plaster(w: ReturnType<typeof daubed>, r: number, mud: [string, string], gap: number, high: number, soot: number) {
    return of(3, (c) => {
      const a = Math.atan2(c.z, c.x), y = c.y, t = w.top(a), off = Math.abs(diff(a, Math.PI / 2));
      tone.set(mud[0]).lerp(hue.set(mud[1]), noise(a * 2.5 + w.seed, y * 1.3)).multiplyScalar(1 + .1 * smooth(.68, .8, noise(a * 5 + w.seed, y * 4)));
      tone.multiplyScalar(1 + (noise(a * r * 7 + w.seed, y * .25) - .5) * .4 * smooth(.3, t, y));
      tone.lerp(hue.set("#4a392a"), (1 - smooth(-.1, .42 + .15 * noise(a * 6, 3), y)) * .75);
      if (gap) tone.lerp(hue.set("#1f1813"), soot * (1 - smooth(gap * .3, gap * 1.1, off)) * smooth(high - .1, high + .45, y) * (1 - smooth(t - .1, t, y) * .3));
      return tone.lerp(hue.set("#5b4735"), w.fallen(a, y) * .8).multiplyScalar(.94 + rand() * .12);
    });
  }
  const C = small ? 28 : 72, T = small ? 8 : 18, K = small ? 4 : 6;
  /** Thatch on a wall `r` across and `height` tall: courses laid from the eave up, sagging between the rafters, ragged and drooping at the eave with the straw ends showing,
   * rafter ends poking out under it, a bound ridge. `fresh` is how much has been patched with new gold straw, `moss` how dark the side in `shade` has gone. */
  function thatch(r: number, height: number, rise: number, fresh: number, moss: number, sag: number, shade: [number, number]) {
    const R = r * 1.22 + .25, eave = height + .14 - rise * (1 - r / R), seed = rand() * 40, RAFTERS = small ? 6 : 9, course = T / K, parts: THREE.BufferGeometry[] = [];
    const shell = (a: number, j: number) => {
      const t = j / T, lip = j < T ? .07 * (1 - (j % course) / course) ** 2 : 0, eaveEdge = j === 0 ? 1 : 0;
      const rho = (R * (1 - t) + lip + eaveEdge * .05 * (noise(a * 7 + seed, 1) - .5)) * (1 + .06 * (noise(a * 2.3 + seed, t * 3) - .5));
      return P(Math.cos(a) * rho, eave + rise * t - lip * .6 - eaveEdge * .1 * noise(a * 11 + seed, 5) - sag * Math.sin(a * RAFTERS / 2) ** 2 * Math.sin(Math.PI * Math.min(1, t * 1.3)), Math.sin(a) * rho);
    };
    const roof: number[] = [];
    for (let c = 0; c < C; c++) for (let j = 0; j < T; j++) {
      const a0 = c / C * 6.283, a1 = (c + 1) / C * 6.283, A = shell(a0, j), B = shell(a1, j), D = shell(a0, j + 1), E = shell(a1, j + 1);
      if (j < T - 1) push(roof, A, D, E); push(roof, A, E, B);
    }
    parts.push(faceted(geo(roof), of(3, (c, n) => {
      const a = Math.atan2(c.z, c.x), t = clamp((c.y - eave) / rise, 0, 1), away = Math.cos(a) * shade[0] + Math.sin(a) * shade[1];
      tone.set("#786b5a").lerp(hue.set("#b39558"), fresh * smooth(.5, .72, noise(a * 1.7 + seed, t * 2.6 + seed))); // weathered grey, patched with new straw
      tone.multiplyScalar(.84 + .32 * noise(a * 40 + seed, t * 1.5)); // the straws laid down the slope
      tone.lerp(hue.set("#3c4529"), moss * smooth(-.1, .8, away) * smooth(.35, .65, noise(a * 3 + seed, t * 5)) * (1 - t * .5)); // moss where the sun does not reach
      return tone.multiplyScalar((n.y < .45 ? .62 : 1) * (.93 + rand() * .14)); // the edge of each course in shadow
    })));
    const ends: number[] = [], strand = (a: number, j: number, length: number) => { // straw ends hanging from the eave and from the edge of each course
      const foot = shell(a, j), dir = foot.clone().sub(shell(a, j + 1)).normalize(), side = P(-Math.sin(a), 0, Math.cos(a)).multiplyScalar(.006 + rand() * .006);
      push(ends, foot.clone().sub(side), foot.clone().add(side), foot.clone().addScaledVector(dir, length * .55).add(P(0, -length * (.45 + rand() * .4), 0)).addScaledVector(side, (rand() - .5) * 4));
    };
    for (let i = 0; i < (small ? 260 : 820); i++) strand(rand() * 6.283, 0, .12 + rand() * .2);
    for (let j = course; j < T - 1; j += course) for (let i = 0; i < (small ? 16 : 60) * (1 - j / T); i++) strand(rand() * 6.283, j, .07 + rand() * .1);
    const apex = eave + rise, bound = (h: number) => .42 - h * .55;
    for (let i = 0; i < (small ? 10 : 30); i++) { const a = rand() * 6.283, out = .04 + rand() * .06; push(ends, P(Math.cos(a) * out - .01, apex + .26, Math.sin(a) * out), P(Math.cos(a) * out + .01, apex + .26, Math.sin(a) * out), P(Math.cos(a) * (out + .1 + rand() * .1), apex + .4 + rand() * .15, Math.sin(a) * (out + .1))); }
    parts.push(triangles(ends, of(3, () => tone.set(rand() < .2 + fresh * .5 ? "#b89c62" : "#8a7c66").multiplyScalar(.75 + rand() * .35))));
    for (let k = 0; k < RAFTERS; k++) { const a = k / RAFTERS * 6.283, at = (rho: number) => P(Math.cos(a) * rho, eave + rise * (1 - rho / R) - .13, Math.sin(a) * rho); parts.push(limb(at(r - .25), at(R + .16), .045, .038, rand() < .5 ? bark : peeled, { sides: 4, capped: true })); }
    parts.push(turned([[.42, 0], [.4, .1], [.32, .26], [.16, .4], [.02, .46]], small ? 8 : 14, of(3, lit("#5f5446", "#8d806b", rand))).translate(0, apex - .16, 0)); // the ridge: a bundle bound on with cord
    for (const h of [.05, .16, .27]) parts.push(faceted(new THREE.TorusGeometry(bound(h) + .012, .016, 3, small ? 8 : 14).rotateX(Math.PI / 2).translate(0, apex - .16 + h, 0), cord));
    return merged(parts);
  }

  // ---------- huts, each a little different ----------
  interface Look { height: number; lean: [number, number]; wear: number; brick?: boolean; fresh: number; moss: number; sag: number; soot: number; mud: [string, string]; hang?: "mat" | "hide"; horns?: boolean }
  const jars: Array<Array<[number, number]>> = [
    [[0, 0], [.15, 0], [.3, .13], [.37, .32], [.33, .5], [.2, .62], [.17, .7], [.22, .76]], // a jar
    [[0, 0], [.14, 0], [.3, .1], [.38, .22], [.41, .3]], // a bowl
    [[0, 0], [.12, 0], [.26, .2], [.33, .5], [.3, .85], [.2, 1], [.16, 1.08], [.2, 1.12]], // a storage jar
  ];
  const fired = (c: THREE.Vector3) => tone.set("#a5653f").lerp(hue.set("#3b2a1f"), smooth(.6, .85, noise(c.x * 7 + c.z * 3, c.y * 6)) * .75).multiplyScalar(.88 + rand() * .2); // clouded dark where the fire touched it
  /** A coarse hand-built pot: a little out of round, ridged by the fingers, its rim uneven, leaning. */
  function pot(kind: number, size: number) {
    const points = new THREE.SplineCurve(jars[kind]!.map(([r, y]) => new THREE.Vector2(r * size, y * size))).getPoints(small ? 6 : 12), g = new THREE.LatheGeometry(points, small ? 9 : 16), p = g.attributes.position!;
    const seed = rand() * 30, top = points[points.length - 1]!.y, lean = (rand() - .5) * .08;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(x, z), k = 1 + .05 * (noise(a * 1.4 + seed, y * 6) - .5) + .012 * Math.sin(y / size * 40);
      p.setXYZ(i, x * k + y * lean, y + smooth(top * .85, top, y) * (noise(a * 2 + seed, 3) - .5) * .05 * size, z * k); }
    return faceted(g, fired);
  }
  /** A piece of a broken pot, lying on the ground. */
  const sherd = () => faceted(new THREE.LatheGeometry([P(.3, .1, 0), P(.36, .22, 0), P(.34, .34, 0)].map((v) => new THREE.Vector2(v.x * .6, v.y * .6)), 3, rand() * 6, .4 + rand() * .5), fired).rotateZ(Math.PI / 2 + (rand() - .5) * .4).translate(0, .2, 0);
  function pots(x: number, s: number, kinds: number[]) {
    kinds.forEach((kind, i) => { const a = i * 2.3 + rand() * .4, r = i ? .32 + i * .12 : 0; stand(pot(kind, .6 + rand() * .35), x + Math.cos(a) * r, s + Math.sin(a) * r, rand() * 6.3, -.03); });
    if (rand() < .6) { const a = rand() * 6.3; stand(sherd(), x + Math.cos(a) * .9, s + Math.sin(a) * .9, rand() * 6.3, -.02); }
  }
  function hut(dx: number, s: number, r: number, turn: number, look: Look) {
    const { height, lean, wear, fresh, moss, sag, soot, mud } = look, x = X(dx, s), gap = .86 / r, high = 1.32, thick = .26, door = r * 1.06;
    const patches = Array.from({ length: Math.round(wear * 3) }, (): [number, number, number, number] => [Math.PI / 2 + (rand() < .5 ? -1 : 1) * (gap + .4 + rand() * 2.2), .5 + rand() * .8, (.5 + rand() * .5) / r, .35 + rand() * .3]);
    const w = daubed(r, height, thick, gap, high, lean, patches), face = plaster(w, r, mud, gap, high, soot), out = (a: number) => P(Math.cos(a), 0, Math.sin(a));
    const parts = [faceted(geo(w.outer), face), faceted(geo(w.inner), inside), faceted(geo(w.rim), face)];
    for (const [pa, py, pw, ph] of patches) { // the bare places: wattle under the daub, or the courses of the brick
      if (look.brick) for (let y = py - ph / 2 + .05, k = 0; y < py + ph / 2 - .04; y += .11, k++) for (let a = pa - pw * .42 + (k % 2) * .16 / r; a < pa + pw * .42; a += .33 / r) {
        const p = w.at(a, y, 0).addScaledVector(out(a), -.045); parts.push(faceted(new THREE.BoxGeometry(.3, .09, .12), of(3, lit("#6f5239", "#a07c5a", rand, .2))).rotateY(-a - Math.PI / 2).translate(p.x, p.y, p.z));
      }
      else {
        for (let y = py - ph / 2 + .06; y < py + ph / 2 - .04; y += .085) parts.push(limb(w.at(pa - pw * .45, y, 0).addScaledVector(out(pa), -.03), w.at(pa + pw * .45, y + (rand() - .5) * .03, 0).addScaledVector(out(pa), -.03), .011, .009, dead, { sides: 3 }));
        for (const side of [-.2, .2]) parts.push(limb(w.at(pa + side * pw, py - ph / 2, 0).addScaledVector(out(pa), -.05), w.at(pa + side * pw, py + ph / 2, 0).addScaledVector(out(pa), -.05), .018, .016, bark, { sides: 4 }));
      }
    }
    for (let k = Math.round(wear * 4) + 1; k > 0; k--) { // cracks: up from the corners of the doorway, or down from the top of the wall
      const fromDoor = k % 2 === 1, line: number[] = []; let a = fromDoor ? Math.PI / 2 + (k % 4 === 1 ? 1 : -1) * gap * .55 : Math.PI / 2 + gap + rand() * (Math.PI * 2 - gap * 2), y = fromDoor ? high + .08 : w.top(a) - .04;
      for (let step = 0; step < 6; step++) {
        const a1 = a + (rand() - .5) * .08 + (fromDoor ? diff(a, Math.PI / 2) * .1 : 0), y1 = y + (fromDoor ? .1 : -.13) * (.7 + rand() * .6), side = P(-Math.sin(a), 0, Math.cos(a)).multiplyScalar(.008 * (1 - step / 7)), p = w.at(a, y, -1);
        push(line, p.clone().sub(side), w.at(a1, y1, -1), p.clone().add(side)); a = a1; y = y1; if (y > w.top(a) - .06) break;
      }
      parts.push(triangles(line, flat("#271d15", rand, .15)));
    }
    { const ring: number[] = [], foot = (a: number, more: number, y: number) => w.at(a, .04, 0).addScaledVector(out(a), more).setY(y); // a skirt of damp earth that the wall stands in
      for (let k = 0; k < COLS; k++) { const a0 = k / COLS * 6.283, a1 = (k + 1) / COLS * 6.283; quad(ring, foot(a0, .02, .05), foot(a1, .02, .05), foot(a1, .6, -.07), foot(a0, .6, -.07)); }
      parts.push(triangles(ring, of(3, (c) => tone.set("#493929").lerp(hue.set("#857057"), smooth(.05, .55, Math.hypot(c.x, c.z) - r)).multiplyScalar(.92 + rand() * .16)))); }
    { const edge = (a: number, y: number, side = 0) => w.at(a, y, side).addScaledVector(out(a), side ? 0 : .03), floor: number[] = [], lid: number[] = [], ri = r - thick - .02;
      parts.push( // the doorway: jambs, a lintel on the outside and one on the inside, a worn stone sill
        branch(edge(Math.PI / 2 - gap * .47, -.25), edge(Math.PI / 2 - gap * .47, high + .03), .055, 0), branch(edge(Math.PI / 2 + gap * .47, -.25), edge(Math.PI / 2 + gap * .47, high + .03), .055, 0),
        branch(edge(Math.PI / 2 + gap * .85, high + .07), edge(Math.PI / 2 - gap * .85, high + .09), .075, 1), branch(edge(Math.PI / 2 + gap * .7, high + .07, 1), edge(Math.PI / 2 - gap * .7, high + .07, 1), .06, 0),
        rock(rand, 0, stone).scale(.42, .06, .2).translate(0, -.03, w.at(Math.PI / 2, 0, 0).z - thick * .45));
      for (let k = 0; k < 16; k++) { const a0 = k / 16 * 6.283, a1 = (k + 1) / 16 * 6.283; floor.push(0, .03, 0, Math.cos(a1) * ri, .03, Math.sin(a1) * ri, Math.cos(a0) * ri, .03, Math.sin(a0) * ri); lid.push(0, height - .2, 0, Math.cos(a0) * ri, height - .2, Math.sin(a0) * ri, Math.cos(a1) * ri, height - .2, Math.sin(a1) * ri); }
      parts.push(triangles(floor, inside), triangles(lid, inside)); } // the dark inside
    const front = (y: number) => w.at(Math.PI / 2, y, 0).z + .05, half = Math.sin(gap / 2) * r * .95;
    if (look.hang === "mat") { // a reed mat hung over the door and rolled half up
      const mat: number[] = [], low = .55 + rand() * .3, cell = (u: number, y: number) => P(u, y, front(y) + .015 * Math.sin(u * 9 + y * 3));
      for (let i = 0; i < 8; i++) for (let j = 0; j < 6; j++) { const u0 = -half + i * half / 4, u1 = u0 + half / 4, y0 = low + j * (high - low) / 6, y1 = y0 + (high - low) / 6; quad(mat, cell(u0, y0), cell(u1, y0), cell(u1, y1), cell(u0, y1)); }
      const reed = of(0, (c) => tone.set((Math.floor(c.x * 16) + Math.floor(c.y * 16)) % 2 ? "#9b8457" : "#76623f").multiplyScalar(.9 + rand() * .2));
      parts.push(faceted(geo(mat), reed), limb(P(-half - .05, low, front(low) + .03), P(half + .05, low, front(low) + .03), .06, .06, reed, { sides: 7, capped: true }), limb(P(-half - .15, high, front(high) + .04), P(half + .15, high, front(high) + .04), .02, .02, dead, { sides: 4 }));
    } else if (look.hang === "hide") { // a hide over half the door, its edge ragged
      const skin: number[] = [], cell = (u: number, y: number) => P(u + (u > 0 ? (noise(y * 9, 2) - .5) * .08 : 0), y - (y < .2 ? noise(u * 12, 4) * .1 : 0), front(y) + .02 + .02 * Math.sin(y * 5) * (u + half));
      for (let i = 0; i < 4; i++) for (let j = 0; j < 6; j++) { const u0 = -half + i * half * .28, u1 = u0 + half * .28, y0 = .05 + j * (high - .05) / 6, y1 = y0 + (high - .05) / 6; quad(skin, cell(u0, y0), cell(u1, y0), cell(u1, y1), cell(u0, y1)); }
      parts.push(faceted(geo(skin), hide));
    }
    if (look.horns) for (const sign of [-1, 1]) parts.push(limb(P(sign * .08, high + .22, door + .08), P(sign * .3, high + .38, door + .14), .04, .025, dead, { sides: 4 }), limb(P(sign * .3, high + .38, door + .14), P(sign * .26, high + .56, door + .1), .025, .006, dead, { sides: 4 })); // a pair of horns over the lintel
    parts.push(thatch(r, height, r * 1.3, fresh, moss, sag, shaded(turn)).translate(lean[0] * (height + .12), 0, lean[1] * (height + .12)));
    stand(merged(parts), x, s, turn); blocks.push([x, s, r + .15]);
    return { at: (lx: number, lz: number) => local(x, s, turn, lx, lz), door };
  }
  const huts = [
    hut(14, 322, 2.4, -1.75, { height: 1.9, lean: [.035, -.02], wear: .7, fresh: .25, moss: .7, sag: .1, soot: .8, mud: ["#86644a", "#b08b65"], hang: "mat" }),
    hut(20, 331, 2, -1.35, { height: 1.8, lean: [-.04, .015], wear: .35, fresh: .8, moss: .2, sag: .04, soot: .5, mud: ["#8f6a4c", "#b9926a"], hang: "hide" }),
    hut(13, 340, 2.2, -1.95, { height: 1.85, lean: [.015, .045], wear: 1, brick: true, fresh: .1, moss: .9, sag: .14, soot: 1, mud: ["#7e5f45", "#a6825e"] }),
    hut(24, 344, 1.8, -1.5, { height: 1.7, lean: [-.045, -.025], wear: .5, fresh: .5, moss: .4, sag: .07, soot: .6, mud: ["#94704f", "#bd9a72"], horns: true }),
  ];
  { const [h] = huts, [x, s] = h!.at(1.15, h!.door + .45); // a bench by the first door: a split log on two stones
    stand(merged([rock(rand, 0, stone).scale(.16, .2, .16).translate(-.45, 0, 0), rock(rand, 0, stone).scale(.16, .2, .16).translate(.45, 0, 0), branch(P(-.62, .33, 0), P(.62, .33, 0), .1, 1, false)]), x, s, -1.75 + .35); }
  for (const [i, side, kinds] of [[0, -1, [2, 0, 1]], [1, 1, [0, 0]], [2, 1, [2, 0, 1, 0]], [3, -1, [2, 1]]] as const) { const h = huts[i]!; pots(...h.at(side * 1.05, h.door + .35), [...kinds]); }
  { const wicker = (c: THREE.Vector3) => tone.set((Math.floor(c.y * 18) + Math.floor(Math.atan2(c.z, c.x) * 6)) % 2 ? "#8a6a3c" : "#5f4827").multiplyScalar(.9 + rand() * .2); // baskets
    for (const [i, side] of [[2, -1], [1, -1]] as const) { const h = huts[i]!, [x, s] = h.at(side * 1.4, h.door + .5); stand(turned([[0, 0], [.2, 0], [.27, .12], [.3, .26], [.31, .3]], 14, wicker), x, s, rand() * 6.3, -.02); } }

  // ---------- the granary on stilts, with a ladder up to the bin ----------
  { const gx = X(9, 334), deck = 1.55, parts: THREE.BufferGeometry[] = [];
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1.1], [0, 1.1]] as const) parts.push(post(x, z, 1.32, .1, (rand() - .5) * .08), rock(rand, 0, stone).scale(.3, .08, .3).translate(x, 1.3, z), trodden(.12, .45, 8).translate(x, 0, z)); // each stilt capped with a flat stone the mice cannot climb past
    for (const z of [-1.05, 1.05]) { parts.push(branch(P(-1.6, 1.44, z), P(1.6, 1.46, z), .075)); for (const x of [-1, 1]) parts.push(lash(P(x, 1.44, z), P(1, 0, 0), .075)); }
    for (let i = 0; i < 11; i++) { const x = -1.5 + i * .3 + (rand() - .5) * .04; parts.push(branch(P(x, deck, -1.6), P(x + (rand() - .5) * .08, deck, 1.6), .045 + rand() * .015, 0)); } // a floor of poles
    const bin = daubed(1.32, 1.7, .07, 0, 0, [0, 0], [[rand() * 6.3, .8, .45, .3]], 0);
    parts.push(merged([faceted(geo(bin.outer), plaster(bin, 1.32, ["#8d6a4b", "#b48f69"], 0, 0, 0)), faceted(geo(bin.inner), inside), faceted(geo(bin.rim), inside), thatch(1.32, 1.7, 1.45, .6, .5, .05, shaded(0))]).translate(0, deck + .02, 0));
    const rail = P(0, 2.3, -1.08).normalize();
    for (const x of [.25, .75]) parts.push(branch(P(x, -.2, 2.5), P(x + (rand() - .5) * .06, 2.1, 1.42), .035, 1));
    for (const y of [.3, .7, 1.1, 1.5, 1.9]) { const z = 2.5 - (y + .2) * .47; parts.push(branch(P(.17, y, z), P(.83, y + (rand() - .5) * .03, z), .021, 0), lash(P(.25, y, z), rail, .035), lash(P(.75, y, z), rail, .035)); }
    stand(merged(parts), gx, 334); blocks.push([gx, 334, 1.75]); }

  // ---------- the yard fence and the village fire ----------
  /** Stakes along `spots` ([x, s] on the ground). Open, poles lashed between them at the `rails` heights; `closed`, withies woven in and out of them all the way round. */
  function fence(spots: Array<[number, number]>, closed: boolean, rails = [.42, .88], gap = .9) {
    const n = spots.length, cx = spots.reduce((sum, [x]) => sum + x, 0) / n, cs = spots.reduce((sum, [, s]) => sum + s, 0) / n, base = floor(cx, -cs), parts: THREE.BufferGeometry[] = [];
    const ground = spots.map(([x, s]) => P(x - cx, floor(x, -s) - base, cs - s)), next = (i: number) => ground[closed ? (i + n) % n : Math.max(0, Math.min(n - 1, i))]!;
    const foot = new THREE.CatmullRomCurve3(ground, closed), length = foot.getLength(), count = Math.round(length / gap), at = new THREE.Vector3(), to = new THREE.Vector3();
    for (let i = 0; i < count + (closed ? 0 : 1); i++) { foot.getPointAt(i / count, at); parts.push(branch(P(at.x, -.3, at.z), P(at.x + (rand() - .5) * .14, rails[rails.length - 1]! + .12 + rand() * .35, at.z + (rand() - .5) * .08), .04 + rand() * .018, !small && rand() < .3 ? 1 : 0).translate(0, at.y, 0)); }
    if (closed) { const out = ground.map((_, i) => { const a = next(i - 1), b = next(i + 1); return P(b.z - a.z, 0, a.x - b.x).normalize(); });
      rails.forEach((lift, k) => parts.push(faceted(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(ground.map((p, i) => p.clone().addScaledVector(out[i]!, (i + k) % 2 ? .05 : -.05).setY(p.y + lift + (rand() - .5) * .04)), true), n * (small ? 2 : 3), .016 + rand() * .006, small ? 3 : 4, true), dead))); }
    else for (const lift of rails) for (let u = rand() * .05; u < 1; u += 2.6 / length) { // poles of a few spans each, overlapping, lashed where they meet a stake
      const end = Math.min(1, u + 2.9 / length); foot.getPointAt(u, at); foot.getPointAt(end, to);
      parts.push(branch(at.clone().setY(at.y + lift + (rand() - .5) * .06), to.clone().setY(to.y + lift + (rand() - .5) * .06), .03 + rand() * .01, 0));
      if (!small && rand() < .5) parts.push(lash(at.clone().setY(at.y + lift), P(0, 1, 0), .045));
    }
    stand(merged(parts), cx, cs);
  }
  fence(Array.from({ length: 22 }, (_, i) => { const a = -1.15 + i * .11; return [yard + Math.cos(a) * 16, 334 + Math.sin(a) * 19]; }), false);
  for (let i = 0; i < 8; i++) stand(rock(rand, 1, stone).scale(.17, .16, .17), yard + Math.cos(i * .785) * .62, 334 + Math.sin(i * .785) * .62, rand() * 6.3, -.04);
  stand(merged([0, 1, 2].map((i) => { const a = i * 2.1 + .4; return limb(P(Math.cos(a) * .5, .03, Math.sin(a) * .5), P(-Math.cos(a) * .1, .2, -Math.sin(a) * .1), .05, .04, of(2, lit("#0f0d0c", "#2a221d", rand)), { sides: 5, capped: true }); })), yard, 334);
  blocks.push([yard, 334, .8]);
  const villageFlame = flame(); villageFlame.position.set(yard, floor(yard, -334) + .05, -334); villageFlame.scale.setScalar(.5); scene.add(villageFlame);
  const villageLight = new THREE.PointLight(0xff9a50, .5, 22, 2); villageLight.position.copy(villageFlame.position).y += .8; scene.add(villageLight);

  // ---------- people up at dawn ----------
  /** A shape drawn as its own mesh, so it can move a little; turned by its y and then tipped by its x. */
  function alive(shape: THREE.BufferGeometry, x: number, s: number, turn: number) {
    const mesh = new THREE.Mesh(own(shape), matte); mesh.position.set(x, floor(x, -s) - .01, -s); mesh.rotation.set(0, turn, 0, "YXZ");
    mesh.castShadow = mesh.receiveShadow = true; scene.add(mesh); return mesh;
  }
  function folk(pose: Pose, x: number, s: number, turn: number, skin: string, cloth: string, extra: THREE.BufferGeometry[] = [], size = 1) {
    stand(person(rand, pose, { extra, skin, cloth, small }).scale(size, size, size), x, s, turn, -.01); blocks.push([x, s, .42 * size]);
  }
  let grinder: THREE.Mesh, loose: THREE.Mesh, child: THREE.Mesh;
  { const x = X(13.6, 336.6), s = 336.6, flour: number[] = []; // grinding at the quern: a saddle stone, the handstone, a bowl and a pale drift of flour
    for (let i = 0; i < 9; i++) { const a0 = i * .7 - .4, a1 = a0 + .7, r0 = .3 + (i % 3) * .07, r1 = .3 + ((i + 1) % 3) * .07; flour.push(0, .012, 1.12, Math.cos(a1) * r1, .006, 1.12 + Math.sin(a1) * r1 * .6, Math.cos(a0) * r0, .006, 1.12 + Math.sin(a0) * r0 * .6); }
    const turn = toward(x, s, X(0, 333), 333); // she rocks as she grinds, and the handstone goes with her hands
    grinder = alive(person(rand, POSES.kneel, { skin: "#946646", cloth: "#cfb98f", small, extra: [blob(rand, [.17, .05, .065], stone, 0, .15).translate(0, .25, .7)] }), x, s, turn); blocks.push([x, s, .42]);
    stand(merged([
      rock(rand, 1, stone).scale(.2, .18, .34).translate(0, -.02, .82), triangles(flour, flat("#e4d9c0", rand, .08)), pot(1, .55).translate(.32, 0, 1.2),
      turned([[0, 0], [.17, 0], [.22, .14], [.23, .2]], 10, lit("#5f4827", "#8a6a3c", rand)).translate(.62, 0, .2), blob(rand, [.18, .05, .18], ears, 0, .2, 0).translate(.62, .14, .2),
    ]), x, s, turn, -.01); }
  { const x = X(11.2, 329.8), s = 329.8; // back from the granary with a jar of grain on her head
    folk(POSES.carry, x, s, toward(x, s, X(11.5, 322.4), 322.4), "#7a5238", "#d6c095", [turned([[0, 0], [.11, 0], [.19, .08], [.21, .18], [.17, .29], [.1, .35], [.09, .39], [.12, .41]], 10, pottery).translate(0, 1.75, .05)]); }
  { const at = (dx: number, ds: number) => [yard + dx, 334 + ds] as const; // two by the fire: one sitting close, one just up and warming
    const [x0, s0] = at(1.4, 1.3), [x1, s1] = at(.9, -1.75);
    folk(POSES.warm, x0, s0, toward(x0, s0, yard, 334), "#a0704b", "#c4ad84"); folk(POSES.stand, x1, s1, toward(x1, s1, yard, 334), "#8a5d40", "#d3b98c"); }
  const hoe: Pose = { ...POSES.carry, elbows: [[-.24, 1.08, -.1], [.33, 1.12, .12]], hands: [[-.25, .82, -.14], [.2, 1.38, .18]], grip: [.3, 1], palm: [[1, 0, .1], null], hold: [null, [0, .35, -.94]] }; // off to the field, the hoe over the right shoulder
  { const x = X(2.8, 318.5), s = 318.5;
    folk(hoe, x, s, toward(x, s, X(2.8, 300), 300), "#8c6243", "#c9b591", [limb(P(.2, 1.33, .32), P(.2, 1.68, -.62), .022, .018, dead, { sides: 5 }), faceted(new THREE.BoxGeometry(.13, .32, .04), bark).translate(.2, 1.5, -.66), limb(P(.2, 1.62, -.66), P(.2, 1.7, -.56), .03, .03, flat("#5a4630", rand), { sides: 4 })]); }

  // ---------- goats: four in the pen, one loose with a child after it ----------
  const coats = ["#e2d8c4", "#3a2c22", "#8a6a48", "#5d4b3c", "#b8a283"];
  { const px = X(23.5, 321.5), ps = 321.5, ring = 2.6;
    fence(Array.from({ length: 20 }, (_, i) => [px + Math.cos(i * .314) * ring, ps + Math.sin(i * .314) * ring]), true, [.1, .2, .3, .4, .5, .6, .7], .5); blocks.push([px, ps, ring + .15]);
    for (const [i, [dx, ds, graze]] of ([[-1, .5, true], [.9, -.6, false], [.3, 1.3, true], [-.6, -1.2, false]] as const).entries()) stand(goat(rand, { graze, coat: coats[i], small }), px + dx, ps + ds, rand() * 6.3); }
  { const gx = X(19.7, 325.3), cx = X(18.3, 326);
    loose = alive(goat(rand, { coat: coats[4], small }), gx, 325.3, toward(gx, 325.3, cx, 326)); blocks.push([gx, 325.3, .5]);
    child = alive(person(rand, { ...POSES.stand, elbows: [POSES.stand.elbows[0], [.25, 1.12, .2]], hands: [POSES.stand.hands[0], [.2, 1, .46]] }, { skin: "#946646", cloth: "#d6c095", small, child: true }).scale(.6, .6, .6), cx, 326, toward(cx, 326, gx, 325.3)); blocks.push([cx, 326, .25]); }

  // ---------- the oven, the drying rack, the grain mats, the hide, the woodpile ----------
  const ovenX = X(21.2, 339.6);
  { const x = ovenX, seed = rand() * 30, arch = Array.from({ length: 9 }, (_, i) => P(Math.cos(i / 8 * Math.PI) * .3, .02 + Math.sin(i / 8 * Math.PI) * .36, 1.01)), mouth: number[] = [], ash: number[] = [];
    const dome = new THREE.LatheGeometry(new THREE.SplineCurve([[1, -.06], [.99, .15], [.93, .4], [.78, .64], [.52, .84], [.22, .94], [0, .97]].map(([r, y]) => new THREE.Vector2(r!, y!))).getPoints(small ? 8 : 20), small ? 14 : 30), p = dome.attributes.position!;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(x, z), k = 1 + .045 * (noise(a * 1.5 + seed, y * 2) - .5) + .01 * Math.sin(y * 48 + a * 2); p.setXYZ(i, x * k, y, z * k); } // built up by hand in coils, finger ridges and all
    for (let i = 0; i < 8; i++) mouth.push(0, .02, 1.01, arch[i + 1]!.x, arch[i + 1]!.y, 1.01, arch[i]!.x, arch[i]!.y, 1.01);
    for (let i = 0; i < 10; i++) { const a0 = i * .38 - .3, a1 = a0 + .38, r0 = .45 + (i % 3) * .1, r1 = .45 + ((i + 1) % 3) * .1; ash.push(0, .015, 1.3, Math.cos(a1) * r1, .008, 1.25 + Math.sin(a1) * r1 * .7, Math.cos(a0) * r0, .008, 1.25 + Math.sin(a0) * r0 * .7); }
    stand(merged([ // a domed clay oven, its mouth turned to the yard and sooted round, ash raked out in front
      scorch(merged([faceted(dome, clay), ...arch.slice(1).map((p, i) => limb(arch[i]!, p, .055, .055, clay, { sides: 4 }))]), P(0, .5, 1.3), 1.1),
      triangles(mouth, flat("#0d0907", rand, 0)), triangles(ash, of(3, flat("#8a857e", rand, .2))), rock(rand, 0, stone).scale(.4, .05, .25).translate(0, -.01, 1.2), trodden(1, 1.6, 14), sherd().translate(.9, 0, 1.1),
    ]), x, 339.6, toward(x, 339.6, yard, 334)); blocks.push([x, 339.6, 1.1]); }
  { const parts: THREE.BufferGeometry[] = [branch(P(-1.8, 1.86, 0), P(1.8, 1.88, 0), .04, 1)]; // the drying rack: two A-frames lashed at the top, a pole across, the sheaves hung head down
    for (const x of [-1.5, 1.5]) { for (const z of [-.55, .55]) parts.push(branch(P(x, -.3, z), P(x + (rand() - .5) * .06, 2.02, -z * .2), .045, rand() < .5 ? 1 : 0)); parts.push(lash(P(x, 1.88, 0), P(1, 0, 0), .05)); }
    for (let i = 0; i < 8; i++) { const x = -1.2 + i * .34 + (rand() - .5) * .06, z = (i % 2 - .5) * .1, low = 1.18 + rand() * .12;
      parts.push(limb(P(x, 1.84, z), P(x, low + .1, z), .035, .07, straw, { sides: 5 }), blob(rand, [.09, .15, .09], ears, 0, .3).translate(x, low, z), limb(P(x, 1.88, z), P(x, 1.72, z), .006, .006, cord, { sides: 3 })); }
    const x = X(27.2, 336); stand(merged(parts), x, 336, Math.PI / 2); blocks.push([x, 336, 1.8]); }
  for (const [dx, s, turn] of [[22.6, 334.6, .3], [23.4, 337, -.2]] as const) { // reed mats with grain spread to dry
    const weave: Paint = (center) => tone.set((Math.floor(center.x * 8) + Math.floor(center.z * 8)) % 2 ? "#a08a5a" : "#7d6a42").multiplyScalar(.9 + rand() * .2);
    stand(merged([faceted(new THREE.PlaneGeometry(1.8, 1.1, 6, 4).rotateX(-Math.PI / 2), weave), blob(rand, [.68, .05, .36], ears, 1, .25, 0).translate(0, .01, 0)]), X(dx, s), s, turn, .02); }
  { const lace: number[] = [], rim = Array.from({ length: 8 }, (_, i) => { const a = i * .785 + .2; return P(Math.cos(a) * (.66 + rand() * .08), 1.02 + Math.sin(a) * (.52 + rand() * .06), 0); }); // a hide laced into a frame to dry
    for (let i = 0; i < 8; i++) lace.push(0, 1.02, 0, rim[i]!.x, rim[i]!.y, 0, rim[(i + 1) % 8]!.x, rim[(i + 1) % 8]!.y, 0);
    const parts = [post(-.88, 0, 1.9, .05), post(.88, 0, 1.85, .05), branch(P(-1.05, 1.72, 0), P(1.05, 1.7, 0), .04, 0), branch(P(-1.02, .34, 0), P(1.02, .32, 0), .04, 0), triangles(lace, hide)];
    for (const [x, y] of [[-.88, 1.71], [.88, 1.7], [-.88, .33], [.88, .33]] as const) parts.push(lash(P(x, y, 0), P(0, 1, 0), .05));
    for (const p of rim) parts.push(limb(p, P(Math.abs(p.x) > .5 ? Math.sign(p.x) * .88 : p.x, Math.abs(p.x) > .5 ? p.y : p.y > 1 ? 1.71 : .33, 0), .008, .008, cord, { sides: 3 }));
    const x = X(27.3, 327.6); stand(merged(parts), x, 327.6, -Math.PI / 2); blocks.push([x, 327.6, .9]); }
  { const parts: THREE.BufferGeometry[] = []; // the woodpile
    for (let i = 0; i < 9; i++) { const layer = i < 5 ? 0 : 1, k = layer ? i - 5 : i, z = (k - (layer ? 1.5 : 2)) * .16 + (rand() - .5) * .04, y = .07 + layer * .13, length = 1 + rand() * .4, skew = (rand() - .5) * .2;
      parts.push(limb(P(-length / 2, y, z - skew), P(length / 2, y + rand() * .04, z + skew), .06 + rand() * .02, .05 + rand() * .02, i % 4 ? dead : bark, { sides: 6, capped: true })); }
    const x = X(17.6, 346.2); stand(merged(parts), x, 346.2, .3); blocks.push([x, 346.2, .8]); }

  // ---------- sheaves stooked at the field edge ----------
  for (const [dx, s] of [[9.4, 317.6], [11.7, 317], [17.4, 317.2], [19.8, 317.6], [8.9, 347.2], [9.3, 350]] as const) {
    const parts: THREE.BufferGeometry[] = [], spin = rand() * 6.3;
    for (let i = 0; i < 7; i++) { const a = spin + i * .898 + rand() * .2, top = P(Math.cos(a) * .07, .95 + rand() * .1, Math.sin(a) * .07);
      parts.push(limb(P(Math.cos(a) * .34, -.02, Math.sin(a) * .34), top, .085, .06, straw, { sides: 5 }), blob(rand, [.08, .16, .08], ears, 0, .3).translate(top.x * 1.6, top.y + .1, top.z * 1.6)); }
    stand(merged(parts), X(dx, s), s); blocks.push([X(dx, s), s, .45]);
  }

  // ---------- full round-crowned trees behind the huts ----------
  for (const [dx, s, height] of [[28.4, 349.6, 7], [20, 350.6, 6.2], [29.8, 331.2, 6.6], [25.8, 316.6, 5.8]] as const) plant("fig", X(dx, s), s, height, .8);

  // ---------- smoke from the fire and the oven, and the few who move ----------
  const puffMap = soft(own, "rgba(255,255,255,.9)", "rgba(255,255,255,.4)"), PUFFS = small ? 3 : 6;
  const vents = [[yard, floor(yard, -334) + .6, -334], [ovenX, floor(ovenX, -339.6) + .95, -339.6]] as const;
  const puffs = vents.flatMap(() => Array.from({ length: PUFFS }, () => { const puff = new THREE.Sprite(own(new THREE.SpriteMaterial({ map: puffMap, color: "#cfc8bd", depthWrite: false, transparent: true, opacity: 0 }))); scene.add(puff); return puff; }));
  const [goatTurn, childTurn] = [loose.rotation.y, child.rotation.y];
  /** One frame of the village: thin smoke rising, the woman at the quern, the loose goat, the child. When the page asks for stillness, everything holds where it is at the start. Allocates nothing. */
  function frame(clock: number, walkerS: number = VILLAGE.yardS) {
    const near = Math.abs(walkerS - VILLAGE.yardS) < 110;
    villageLight.visible = villageFlame.visible = near;
    for (const puff of puffs) puff.visible = near;
    if (!near) return;
    if (still) clock = 0;
    puffs.forEach((puff, i) => {
      const [x, y, z] = vents[Math.floor(i / PUFFS)]!, t = (clock * .05 + (i % PUFFS) / PUFFS) % 1;
      puff.position.set(x + t * t * 3.2 + Math.sin(i * 2.4 + t * 4) * .2, y + t * 9, z + Math.cos(i * 1.7 + t * 3) * .2); puff.scale.setScalar(.35 + t * 2.8); puff.material.opacity = Math.sin(t * Math.PI) * .2;
    });
    grinder.rotation.x = .02 + Math.sin(clock * 7.54) * .025; // about 1.2 strokes a second
    loose.rotation.y = goatTurn + Math.sin(clock * .45) * .25; loose.rotation.x = Math.max(0, Math.sin(clock * 1.7)) * .06;
    child.rotation.y = childTurn + Math.sin(clock * .38 + 1) * .12; child.rotation.z = Math.sin(clock * .9) * .03;
  }
  frame(0);
  return { villageLight, frame };
}
