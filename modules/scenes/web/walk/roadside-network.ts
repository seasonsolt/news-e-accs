import * as THREE from "three";
import type { Kit } from "./camp.ts";
import { ROADSIDE, roadX, sequence } from "./land.ts";
import { faceted, flat, limb, lit, merged, type Paint } from "./shapes.ts";

/** A 1969 teleprinter and its packet-switching cabinet: paper, keys and wires, before screens. */
export function buildNetworkStop({ stand, blocks, small }: Kit) {
  const [s, offset] = ROADSIDE.terminal, x = roadX(s) + offset, rand = sequence(19691029);
  const parts: THREE.BufferGeometry[] = [], P = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const enamel = lit("#55564b", "#a5aa92", rand, .055), metal = lit("#333d3c", "#737b70", rand, .07);
  const dark = flat("#252a27", rand, .04), paper = lit("#b4af8c", "#eee6c4", rand, .025), ink = flat("#252b29", rand, 0);
  const ivory = lit("#aaa786", "#e1d9b6", rand, .04), amber = flat("#dfb267", rand, .035);
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, paint: Paint) => parts.push(faceted(new THREE.BoxGeometry(w, h, d), paint).translate(x, y, z));
  const rod = (a: THREE.Vector3, b: THREE.Vector3, r: number, paint: Paint) => parts.push(limb(a, b, r, r, paint, { sides: 5, capped: true }));

  // A modest concrete apron and a steel desk, with open air beneath the heavy mechanism.
  box(4.8, .12, 3.15, .65, .035, -.1, lit("#6b6b60", "#989b89", rand, .08));
  for (const xx of [-.71, .71]) for (const zz of [-.57, .57]) box(.075, .94, .075, xx, .55, zz, metal);
  box(1.78, .11, 1.48, 0, 1.02, 0, enamel);
  box(1.42, .38, .77, 0, 1.27, -.21, enamel);
  box(1.49, .1, .82, 0, 1.49, -.21, enamel);
  // The broad sloping keyboard, four staggered rows and a conspicuous space bar.
  parts.push(faceted(new THREE.BoxGeometry(1.42, .11, .57), dark).rotateX(.18).translate(0, 1.15, .48));
  for (let row = 0; row < 4; row++) for (let col = 0; col < 10; col++) {
    const xx = -.58 + col * .125 + (row % 2) * .025, zz = .32 + row * .112;
    box(.088, .048, .075, xx, 1.24 - row * .02, zz, row === 0 && col === 9 ? amber : ivory);
  }
  box(.55, .045, .075, 0, 1.16, .82, ivory);
  // The exposed platen, hand knobs and carriage rail distinguish a teleprinter from a computer.
  rod(P(-.73, 1.58, -.31), P(.73, 1.58, -.31), .085, dark);
  rod(P(-.84, 1.58, -.31), P(-.74, 1.58, -.31), .12, metal);
  rod(P(.74, 1.58, -.31), P(.84, 1.58, -.31), .12, metal);
  rod(P(-.8, 1.43, -.06), P(.8, 1.43, -.06), .024, metal);
  box(.19, .08, .17, .05, 1.46, -.02, dark);

  // Continuous tractor-feed paper rises behind the platen. LO is actual dark geometry,
  // with no texture/font fetch; it remains legible in the shared, single scenery draw.
  const sheet: THREE.BufferGeometry[] = [], sheetBox = (w: number, h: number, d: number, xx: number, yy: number, zz: number, paint: Paint) => sheet.push(faceted(new THREE.BoxGeometry(w, h, d), paint).translate(xx, yy, zz));
  sheetBox(1.12, .83, .012, 0, .415, 0, paper);
  for (const xx of [-.509, .509]) for (let i = 0; i < 10; i++) sheetBox(.026, .026, .003, xx, .055 + i * .078, .008, dark);
  // Monospaced L and closed O, printed large enough to read from the nearby road.
  const t = .032, y = .39, h = .235, w = .145;
  sheetBox(t, h, .004, -.2, y, .009, ink);
  sheetBox(w, t, .004, -.2 + (w - t) / 2, y - (h - t) / 2, .009, ink);
  for (const xx of [.055, .055 + w - t]) sheetBox(t, h, .004, xx, y, .009, ink);
  for (const yy of [y - (h - t) / 2, y + (h - t) / 2]) sheetBox(w, t, .004, .055 + (w - t) / 2, yy, .009, ink);
  parts.push(merged(sheet).rotateX(-.24).translate(0, 1.56, -.33));
  // A folded supply at the rear and a ribbon of output cascading down the desk's side.
  box(.99, .13, .4, 0, 1.15, -.58, paper);
  for (let i = 0; i < 4; i++) box(.99, .008, .4, 0, 1.1 + i * .035, -.58, ivory);
  parts.push(faceted(new THREE.BoxGeometry(.92, .6, .012), paper).rotateX(.26).translate(0, .76, .93));
  for (let i = 0; i < 4; i++) parts.push(faceted(new THREE.BoxGeometry(.92, .015, .35), paper).rotateX(i % 2 ? .16 : -.16).translate(0, .19 + i * .045, 1.02));

  // An industrial 19-inch-style communications rack, warm pilot lamps, card drawers and louvers.
  const rack = 2.25;
  box(1.12, 2.48, .94, rack, 1.33, -.38, enamel);
  box(.96, 2.26, .045, rack, 1.35, .107, dark);
  for (let row = 0; row < 6; row++) {
    const yy = .47 + row * .33;
    box(.87, .27, .045, rack, yy, .142, row % 2 ? enamel : metal);
    for (const xx of [rack - .36, rack + .36]) rod(P(xx, yy - .055, .184), P(xx, yy + .055, .184), .012, ivory);
    for (let lamp = 0; lamp < 3; lamp++) box(.035, .026, .012, rack - .24 + lamp * .075, yy + .05, .172, lamp === row % 3 ? amber : dark);
    if (row < 3) for (let slot = 0; slot < (small ? 4 : 7); slot++) box(.03, .075, .012, rack + .03 + slot * .035, yy - .025, .174, dark);
    else box(.27, .017, .013, rack + .13, yy - .018, .174, dark);
  }
  box(1.22, .1, 1.04, rack, .12, -.38, dark);
  box(.58, .08, .014, rack, 2.5, .102, ivory);
  // Two thick cable runs leave the terminal and visibly terminate in the cabinet.
  for (let i = 0; i < 2; i++) {
    const path = [P(.73, 1.23, -.53 + i * .1), P(.99, .61, -.64 + i * .12), P(1.02, .14, -.5 + i * .14), P(1.39, .14, -.04 + i * .15), P(1.65, .17, .23 + i * .12), P(1.82, .43 + i * .16, .17)];
    parts.push(faceted(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(path), small ? 14 : 22, .027, 5, false), dark));
  }
  const turn = Math.atan2(roadX(s - 3) - x, 3);
  stand(merged(parts), x, s, turn);
  // Only solid furniture blocks a walker; the apron and loose paper can be approached.
  const block = (lx: number, lz: number, radius: number) => blocks.push([x + lx * Math.cos(turn) + lz * Math.sin(turn), s + lx * Math.sin(turn) - lz * Math.cos(turn), radius]);
  block(0, .05, 1.0);
  block(rack, -.38, .77);
}
