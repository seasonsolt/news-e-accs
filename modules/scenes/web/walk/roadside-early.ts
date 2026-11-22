import * as THREE from "three";
import type { Kit } from "./camp.ts";
import { buildEarlyLandscapes } from "./early-landscapes.ts";
import { ROADSIDE, roadX, sequence } from "./land.ts";
import { person, type Pose } from "./people.ts";
import { blob, faceted, flat, limb, lit, merged, of, smoothed, triangles, turned, type Paint } from "./shapes.ts";

const P = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const box = (w: number, h: number, d: number, paint: Paint) => faceted(new THREE.BoxGeometry(w, h, d), paint);
const ring = (radius: number, tube: number, paint: Paint) => smoothed(new THREE.TorusGeometry(radius, tube, 5, 20), paint);

/** Two small acts of carrying knowledge: a journey out of camp, then grain counted in clay. All pieces join the existing static material batch. */
export function buildEarlyStops(kit: Kit) {
  const { floor, stand, blocks, small } = kit;
  buildEarlyLandscapes(kit);
  // Local placements still sample the ground separately: feet and sacks follow the road's uneven verge.
  function stop(at: readonly [number, number, number]) {
    const [s, offset] = at, x = roadX(s) + offset, base = floor(x, -s), parts: THREE.BufferGeometry[] = [];
    return {
      x, s, parts,
      add(g: THREE.BufferGeometry, dx = 0, ds = 0, turn = 0, radius = 0) {
        parts.push(g.rotateY(turn).translate(dx, floor(x + dx, -(s + ds)) - base, -ds));
        if (radius) blocks.push([x + dx, s + ds, radius]);
      },
      finish() { stand(merged(parts), x, s); },
    };
  }

  {
    const rand = sequence(13207), scene = stop(ROADSIDE.migration);
    const hide = of(7, lit("#77634c", "#c9b58b", rand, .09)), strap = flat("#674b33", rand, .08), wood = of(2, lit("#67503a", "#ad8b60", rand));
    const walk: Pose = {
      hip: [0, .94, -.02], chest: [0, 1.37, .10], head: [.01, 1.62, .16],
      elbows: [[-.27, 1.18, .12], [.31, 1.05, .19]], hands: [[-.21, 1.34, .23], [.30, .90, .38]],
      knees: [[-.12, .50, .20], [.13, .51, -.08]], feet: [[-.14, .045, .36], [.15, .08, -.23]],
      grip: [.9, 1], hold: [[0, 1, -.3], [0, 1, -.1]], look: [.03, 1.5, 5],
    };
    function load(size: number, staff = true) {
      const parts = [limb(P(-.39, 1.33, -.24), P(.39, 1.33, -.24), .16, .155, hide, { sides: 12, capped: true })];
      // The end of a hide roll: concentric lips, rather than a modern framed backpack.
      for (const side of [-1, 1]) for (const r of [.07, .125]) parts.push(ring(r, .011, strap).rotateY(Math.PI / 2).translate(side * .397, 1.33, -.24));
      for (const side of [-1, 1]) {
        parts.push(limb(P(side * .22, 1.49, -.21), P(side * .22, 1.44, .16), .018, .018, strap, { sides: 5, sag: .06 }));
        parts.push(limb(P(side * .22, 1.44, .16), P(side * .16, 1.05, .20), .018, .018, strap, { sides: 5 }));
        parts.push(limb(P(side * .16, 1.05, .20), P(side * .22, 1.18, -.37), .018, .018, strap, { sides: 5 }));
      }
      if (staff) parts.push(limb(P(.30, .015, .47), P(.30, 1.27, .34), .024, .018, wood, { sides: 7, capped: true }));
      return merged(parts).scale(size, size, size);
    }
    const heading = Math.atan2(roadX(scene.s + 8) - roadX(scene.s), -8);
    scene.add(merged([person(rand, walk, { skin: "#ae8660", dress: "hide", small }), load(1)]), -.16, .6, heading, .38);
    const child: Pose = { ...walk, elbows: [[-.25, 1.1, .04], [.23, 1.14, .10]], hands: [[-.25, .87, .14], [.18, 1.29, .20]], grip: [.3, .8], hold: [null, [0, 1, 0]], look: [-.2, 1.65, 4] };
    scene.add(merged([person(rand, child, { skin: "#b58a64", dress: "hide", child: true, small }).scale(.68, .68, .68), load(.68, false)]), .82, -.38, heading + .08, .27);
    const soil = of(3, flat("#5e5345", rand, .06));
    for (let i = 0; i < 6; i++) {
      const ds = -1.1 - i * .35, dx = -.17 + (i % 2 ? -.14 : .14) - ds * Math.sin(heading);
      const foot = blob(rand, [.085, .006, .17], soil, 0, .1).translate(0, .012, 0);
      scene.add(foot, dx, ds, heading + (i % 2 ? -.10 : .10));
    }
    scene.finish();
  }

  {
    const rand = sequence(35207), scene = stop(ROADSIDE.ledger);
    const clay = of(8, lit("#8d6448", "#c49c75", rand, .055)), wet = of(8, lit("#6d4937", "#a17b59", rand, .035));
    const timber = of(2, lit("#67513c", "#a78b62", rand, .08)), reed = of(2, flat("#bd9b5c", rand, .08));
    const sack = of(6, lit("#857154", "#c1ad83", rand, .10)), cord = flat("#6d573a", rand, .06);
    const turn = Math.atan2(roadX(scene.s - 7) - scene.x, 7);
    const work: THREE.BufferGeometry[] = [];
    const tableBoards = of(15, lit("#67513c", "#a78b62", rand, .08));
    for (let i = 0; i < 4; i++) work.push(box(.31, .07, .83, tableBoards).translate(-.48 + i * .32, .57, 0));
    for (const x of [-.46, .46]) for (const z of [-.28, .28]) work.push(limb(P(x * 1.08, .015, z * 1.1), P(x, .55, z), .055, .046, timber, { sides: 7, capped: true }));
    for (const z of [-.27, .27]) work.push(limb(P(-.50, .33, z), P(.50, .33, z), .036, .036, timber, { sides: 6, capped: true }));

    // A clay pillow with actual triangular recesses. This is a counted teaching scene, not a transcription of an identified tablet.
    const outline = new THREE.Shape(), w = .73, h = .49, r = .045;
    outline.moveTo(-w / 2 + r, -h / 2); outline.lineTo(w / 2 - r, -h / 2); outline.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
    outline.lineTo(w / 2, h / 2 - r); outline.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2); outline.lineTo(-w / 2 + r, h / 2);
    outline.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r); outline.lineTo(-w / 2, -h / 2 + r); outline.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
    const cuts: number[] = [];
    for (let row = 0; row < 4; row++) for (let col = 0; col < 5 - (row % 2); col++) {
      const x = -.27 + col * .112 + rand() * .006, y = -.16 + row * .105;
      const pts = [[x - .022, y + .018], [x + .023, y + .018], [x - .006, y - .035]];
      const hole = new THREE.Path(); hole.moveTo(pts[0]![0]!, pts[0]![1]!); hole.lineTo(pts[2]![0]!, pts[2]![1]!); hole.lineTo(pts[1]![0]!, pts[1]![1]!); hole.closePath(); outline.holes.push(hole);
      // Top vertices run counterclockwise as seen from above; each sloping wall meets a sunken point.
      for (let i = 0; i < 3; i++) {
        const a = pts[i]!, b = pts[(i + 1) % 3]!;
        cuts.push(b[0]!, .659, -b[1]!, a[0]!, .659, -a[1]!, x, .642, -y);
      }
    }
    work.push(faceted(new THREE.ExtrudeGeometry(outline, { depth: .026, bevelEnabled: false, curveSegments: 5, steps: 1 }), clay).rotateX(-Math.PI / 2).translate(0, .633, 0));
    work.push(triangles(cuts, wet));
    work.push(blob(rand, [.365, .020, .245], clay, 1, .06).translate(0, .615, 0));
    work.push(limb(P(.14, .664, .025), P(.26, .79, -.04), .012, .006, reed, { sides: 3, capped: true }));
    const write: Pose = {
      hip: [0, .42, -.74], chest: [0, .86, -.52], head: [-.015, 1.08, -.33],
      elbows: [[-.24, .69, -.29], [.28, .76, -.26]], hands: [[-.23, .66, -.10], [.245, .775, -.03]],
      knees: [[-.17, .07, -.37], [.18, .07, -.37]], feet: [[-.14, .045, -.87], [.14, .045, -.87]],
      grip: [.15, .85], hold: [null, [-.6, -.7, .35]], palm: [[0, -1, 0], null], look: [0, .65, 0],
    };
    work.push(person(rand, write, { skin: "#a47753", cloth: "#d2c3a1", dress: "wrap", small }));
    scene.add(merged(work), 0, 0, turn, .64);
    // A separate small body circle behind the table permits a close look from either side.
    blocks.push([scene.x - Math.sin(turn) * .67, scene.s + Math.cos(turn) * .67, .32]);

    for (let i = 0; i < 3; i++) {
      const height = [.83, .67, .93][i]!, open = i === 0, parts: THREE.BufferGeometry[] = [];
      parts.push(turned([[0, 0], [.20, .015], [.29, .13], [.31, height * .47], [.26, height * .76], [open ? .21 : .09, height], [open ? .185 : .065, height + .025]], 20, sack));
      parts.push(ring(open ? .20 : .085, .018, cord).rotateX(Math.PI / 2).translate(0, height - .015, 0));
      if (open) {
        parts.push(blob(rand, [.19, .03, .19], lit("#b69550", "#d3bc78", rand), 1, .05).translate(0, height - .035, 0));
        for (let k = 0; k < 32; k++) {
          const a = rand() * Math.PI * 2, d = Math.sqrt(rand()) * .17;
          parts.push(smoothed(new THREE.SphereGeometry(.012, 5, 3), flat("#d7bd77", rand)).scale(.65, .6, 1.5).rotateY(rand() * 6.28).translate(Math.cos(a) * d, height - .014, Math.sin(a) * d));
        }
      } else parts.push(limb(P(.04, height, 0), P(.17, height - .16, .07), .013, .009, cord, { sides: 5, sag: .03 }));
      scene.add(merged(parts), 1.05 + (i === 2 ? .45 : 0), -.65 + i * .72, -.2 + i * .4, .31);
    }
    scene.finish();
  }
}
