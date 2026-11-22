import * as THREE from "three";
import type { Kit } from "./camp.ts";
import { noise, roadX, ROADSIDE, sequence } from "./land.ts";
import { blob, faceted, flat, limb, lit, merged, of, rock, triangles, turned, type Paint } from "./shapes.ts";

const P = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const box = (w: number, h: number, d: number, paint: Paint) => faceted(new THREE.BoxGeometry(w, h, d), paint);

/** The two stops belong to places, not to plinths: a river terrace and an open receiving court. */
export function buildEarlyLandscapes({ floor, stand, blocks, small }: Kit) {
  {
    const rand = sequence(132511), s = ROADSIDE.migration[0], x = roadX(s), base = floor(x, -s), parts: THREE.BufferGeometry[] = [];
    const earth = of(3, lit("#514c43", "#a1987e", rand, .06)), stone = of(1, lit("#62615a", "#b4ae99", rand, .12));
    const at = (offset: number, ds: number, high = 0) => { const xx = roadX(s + ds) + offset; return P(xx - x, floor(xx, -(s + ds)) - base + high, -ds); };
    const push = (out: number[], ...v: THREE.Vector3[]) => { for (const p of v) out.push(p.x, p.y, p.z); };
    // Long, asymmetrical terraces. The steeper river-facing edge breaks into small drainage gullies;
    // outer toes and both ends return below the sampled ground, without a visible mesh skirt.
    for (const [center, width, high, phase] of [[-8.8, 5.7, 1.25, 2], [-25, 10, 3.4, 8]]) {
      const rows = small ? 34 : 48, cols = 12, points: THREE.Vector3[][] = [], out: number[] = [];
      for (let i = 0; i <= rows; i++) {
        const ds = -23 + i / rows * 43, taper = Math.pow(Math.sin(i / rows * Math.PI), .65);
        const bend = Math.sin(ds * .15 + phase!) * .65;
        const row: THREE.Vector3[] = [];
        for (let j = 0; j <= cols; j++) {
          const t = j / cols, ridge = Math.pow(Math.sin(t * Math.PI), center! > -15 ? 1.8 : .85);
          const gully = Math.pow(.5 + .5 * Math.sin(ds * 1.3 + t * 6 + Math.sin(ds * .4)), 6) * .43;
          const rise = ridge * high! * taper * (.8 + noise(ds * .18, t * 3 + phase!) * .35 - gully);
          row.push(at(center! + bend + (t - .5) * width!, ds, rise - .055));
        }
        points.push(row);
      }
      for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
        const a = points[i]![j]!, b = points[i]![j + 1]!, c = points[i + 1]![j + 1]!, d = points[i + 1]![j]!;
        push(out, a, b, c, a, c, d);
      }
      parts.push(triangles(out, earth));
    }
    // Sorted shingle on the inner bank; nothing crosses the footpath or the rock-art entrance.
    const count = small ? 42 : 70;
    for (let i = 0; i < count; i++) {
      const ds = -18 + rand() * 35, offset = -10.9 - rand() * 6.3, size = .07 + rand() * .17, v = at(offset, ds, .012);
      parts.push(rock(rand, 0, stone).scale(size * 1.4, size * .48, size).rotateY(rand() * 6.28).translate(v.x, v.y, v.z));
    }
    const reed = of(3, lit("#635e40", "#aca578", rand, .10)), stalk = of(0, flat("#8c8059", rand, .06));
    for (let k = 0; k < 9; k++) {
      const origin = at(-15.6 - rand() * 2.3, -16 + k * 3.6, -.015);
      for (let j = 0; j < (small ? 4 : 7); j++) {
        const a = rand() * 6.28, high = .55 + rand() * .75, start = origin.clone().add(P(Math.cos(a) * .16, 0, Math.sin(a) * .16));
        const tip = start.clone().add(P(Math.cos(a) * .16, high, Math.sin(a) * .16));
        parts.push(limb(start, tip, .009, .004, stalk, { sides: 3 }));
        const mid = start.clone().lerp(tip, .48), leaf = mid.clone().add(P(Math.cos(a + .8) * .32, .20, Math.sin(a + .8) * .32));
        const blade: number[] = [], side = P(Math.sin(a) * .025, 0, -Math.cos(a) * .025);
        push(blade, mid, leaf, mid.clone().add(side), mid, mid.clone().add(side), leaf);
        parts.push(triangles(blade, reed));
      }
    }
    stand(merged(parts), x, s);
  }

  {
    const rand = sequence(352511), s = ROADSIDE.ledger[0], x = roadX(s), base = floor(x, -s), parts: THREE.BufferGeometry[] = [];
    const mud = of(8, lit("#8c7052", "#c3aa81", rand, .055)), exposed = of(8, lit("#967553", "#b89870", rand, .10));
    const timber = of(2, lit("#5f4c33", "#a08a5e", rand, .08)), straw = of(3, lit("#83734b", "#c8b27b", rand, .09));
    const fired = of(8, lit("#825e42", "#be9167", rand, .08));
    function place(g: THREE.BufferGeometry, off: number, ds: number, lift = 0, turn = 0) {
      const xx = x + off;
      parts.push(g.rotateY(turn).translate(off, floor(xx, -(s + ds)) - base + lift, -ds));
    }
    // A thick, slightly battered plaster wall; the exposed courses at the foot, jambs and upper edge
    // have real relief, but most of a working mudbrick building remains covered in protective mud.
    function wall(off: number, ds: number, length: number, height: number, alongS = false, thick = .58) {
      const g = new THREE.BoxGeometry(length, height, thick, Math.ceil(length), 3, 1), p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const xx = p.getX(i), yy = p.getY(i), zz = p.getZ(i), t = (yy + height / 2) / height;
        p.setXYZ(i, xx + Math.sin(xx * 3.1 + yy * 2) * .013, yy + (t > .95 ? noise(xx * 3, 2) * .06 : 0), zz * (1.12 - t * .20) + (t < .35 ? noise(xx * 4.7, 6) * .026 * (1 - t / .35) : 0));
      }
      const body = faceted(g, mud).translate(0, height / 2 - .07, 0), layers: THREE.BufferGeometry[] = [body];
      const rows = Math.floor(height / .17), cols = Math.ceil(length / .47);
      for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
        const xx = -length / 2 + (col + .5 + (row % 2) * .5) * length / cols;
        if (xx > length / 2 - .09) continue;
        if (row > 1 && row < rows - 2 && Math.abs(xx) < length / 2 - .65) continue;
        const ww = Math.min(.44, length / 2 - xx) - .012, yy = .09 + row * .17;
        for (const sign of [-1, 1]) layers.push(box(ww, .148, .025, exposed).translate(xx, yy, sign * (thick * .5 * (1.12 - yy / height * .20) + .006)));
      }
      place(merged(layers), off, ds, 0, alongS ? Math.PI / 2 : 0);
      // Overlapping small circles follow the actual masonry, leaving doors and court empty.
      for (let d = -length / 2 + .20; d < length / 2; d += .52) blocks.push([x + off + (alongS ? 0 : d), s + ds + (alongS ? d : 0), thick * .5 + .09]);
    }
    // Main grain store. Its road-facing wall has a real open doorway, leading into a 3 x 4 m room.
    wall(12.1, 3.2, 6.1, 2.45, true);
    wall(9.8, .2, 4.9, 2.45);
    wall(9.8, 6.2, 4.9, 2.45);
    wall(7.45, .65, 1.2, 2.45, true);
    wall(7.45, 4.55, 3.2, 2.45, true);
    place(box(.61, .46, 1.9, mud), 7.45, 2.1, 2.23);
    place(limb(P(0, 0, -.99), P(0, 0, .99), .10, .10, timber, { sides: 7, capped: true }), 7.43, 2.1, 1.96);
    place(box(4.9, .15, 6.25, mud), 9.8, 3.2, 2.52);
    // Flat earthen roof, with projecting reed/wood joist ends rather than a later pitched roof.
    for (let k = 0; k < 9; k++) place(limb(P(-2.6, 0, 0), P(2.6, 0, 0), .065, .065, timber, { sides: 5, capped: true }), 9.8, .5 + k * .66, 2.37);
    for (const [off, ds, w, d, y] of [[6.98, 2.1, .58, 1.65, .07], [7.30, 2.1, .24, 1.61, .13]]) place(box(w!, .14, d!, mud), off!, ds!, y!);
    // A receiving court open directly from the path. The front wall is broken by a broad gate.
    wall(3.2, -5.3, 1.1, 1.04);
    wall(9.3, -5.3, 6.8, 1.15);
    wall(12.4, -2.5, 5.2, 1.30, true);
    wall(6.5, 7.1, 4.6, .87);
    // A broad, lightly sagging reed awning over the recorder, supported on two slender poles.
    for (const ds of [-1.45, 3.65]) {
      place(limb(P(0, -.08, 0), P(.05, 2.22, .02), .065, .045, timber, { sides: 6, capped: true }), 3.95, ds);
      blocks.push([x + 3.95, s + ds, .14]);
      place(limb(P(0, 2.23, 0), P(3.65, 2.40, 0), .055, .05, timber, { sides: 6, capped: true }), 3.8, ds);
    }
    const roof: number[] = [], push = (...v: number[]) => roof.push(...v);
    const n = small ? 30 : 48;
    for (let i = 0; i < n; i++) {
      const z = -3.9 + i / n * 5.75, w = 5.75 / n * .97;
      for (let k = 0; k < 4; k++) {
        const a = 3.65 + k * 1.03, b = a + 1.03, ya = 2.23 + (a - 3.65) * .044 - Math.sin(k / 4 * Math.PI) * .09, yb = 2.23 + (b - 3.65) * .044 - Math.sin((k + 1) / 4 * Math.PI) * .09;
        push(a, ya, z, b, yb, z, b, yb, z + w, a, ya, z, b, yb, z + w, a, ya, z + w);
        push(b, yb, z, a, ya, z, a, ya, z + w, b, yb, z, a, ya, z + w, b, yb, z + w);
      }
    }
    // Roof vertices are in court coordinates, with local y resampled along each strip.
    const roofG = triangles(roof, straw), rp = roofG.attributes.position;
    for (let i = 0; i < rp.count; i++) rp.setY(i, rp.getY(i) + floor(x + rp.getX(i), -s + rp.getZ(i)) - base);
    roofG.computeVertexNormals(); parts.push(roofG);
    for (let i = 0; i < 4; i++) place(limb(P(0, 2.21, -3.85), P(0, 2.21, 1.85), .025, .025, timber, { sides: 4 }), 3.85 + i * 1.15, 0);
    // Large unglazed storage jars and coarse bevel-rim ration bowls beside the open doorway.
    function jar(height: number) {
      return turned([[0, 0], [.19, .015], [.35, height * .22], [.39, height * .52], [.30, height * .78], [.19, height * .89], [.20, height], [.16, height], [.155, height * .90]], 24, fired);
    }
    for (const [off, ds, h] of [[6.3, 4.5, 1.04], [6.5, 5.4, .84], [10.9, 1.3, 1.18], [10.9, 2.3, .91]]) {
      place(jar(h!), off!, ds!); blocks.push([x + off!, s + ds!, .38]);
    }
    for (let i = 0; i < 4; i++) place(turned([[.035, 0], [.17, .01], [.29, .23], [.27, .26], [.235, .24], [.13, .05], [.035, .04]], 16, fired), 5.7 + i * .25, -3.4 + i % 2 * .38, i > 1 ? .11 : 0);
    // Bins inside stay low enough to read through the open doorway; no opaque 'black door' plane.
    for (const ds of [4.1, 5.2]) {
      place(turned([[.48, 0], [.48, .65], [.42, .67], [.41, .08]], 22, mud), 10.9, ds);
      place(blob(rand, [.40, .05, .40], lit("#9e8650", "#ceba7c", rand), 1, .08), 10.9, ds, .53);
      blocks.push([x + 10.9, s + ds, .49]);
    }
    // Across the path, a lower store and yard wall make the route a street between working places.
    wall(-8.4, 1.6, 4.7, 1.85, true);
    wall(-6.6, -.7, 4.1, 1.85);
    wall(-6.6, 3.9, 4.1, 1.85);
    wall(-4.65, -.15, 1.0, 1.85, true);
    wall(-4.65, 3.1, 1.5, 1.85, true);
    place(box(.60, .35, 1.95, mud), -4.65, 1.35, 1.69);
    place(box(4.25, .16, 4.9, mud), -6.6, 1.6, 1.95);
    wall(-4.6, -5.1, 3.7, .8);
    place(jar(.85), -4.0, -3.6); blocks.push([x - 4, s - 3.6, .35]);
    stand(merged(parts), x, s);
  }
}
