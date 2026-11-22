import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { Kit } from "./camp.ts";
import { ROADSIDE, roadX, sequence } from "./land.ts";
import { faceted, flat, limb, lit, merged, of, smoothed, type Paint } from "./shapes.ts";

/** A 1969 campus communications laboratory: paper, keys and wires, before screens. */
export function buildNetworkStop({ stand, blocks, small, scene, own, floor }: Kit) {
  const [s, offset] = ROADSIDE.terminal, x = roadX(s) + offset, rand = sequence(19691029);
  const parts: THREE.BufferGeometry[] = [], windows: THREE.BufferGeometry[] = [], P = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const enamel = of(12, lit("#646b63", "#a5aea0", rand, .035)), metal = of(13, lit("#4e5552", "#939b96", rand, .035));
  const dark = flat("#252a27", rand, .04), paper = of(11, lit("#c9c8b5", "#eeecd8", rand, .015)), ink = of(11, flat("#191d19", rand, 0));
  const tube = of(16, flat("#eeeddb", rand, .01));
  const ivory = of(12, lit("#b8b59d", "#dedbc4", rand, .025)), amber = flat("#dfb267", rand, .035);
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, paint: Paint) => parts.push(faceted(new THREE.BoxGeometry(w, h, d), paint).translate(x, y, z));
  const rod = (a: THREE.Vector3, b: THREE.Vector3, r: number, paint: Paint) => parts.push(limb(a, b, r, r, paint, { sides: 5, capped: true }));
  const pane = (w: number, h: number, d: number, xx: number, yy: number, zz: number) => windows.push(faceted(new THREE.BoxGeometry(w, h, d), glass).translate(xx, yy, zz));
  // The frontage follows the road rather than projecting a building corner into its approach.
  const turn = offset > 0 ? -Math.PI / 2 : Math.PI / 2;
  const block = (lx: number, lz: number, radius: number) => blocks.push([x + lx * Math.cos(turn) + lz * Math.sin(turn), s + lx * Math.sin(turn) - lz * Math.cos(turn), radius]);
  const plaster = of(9, lit("#84877f", "#c1c5ba", rand, .04)), concrete = of(9, lit("#767b75", "#a8ada4", rand, .045));
  const glass = of(14, lit("#698181", "#a6b9b3", rand, .02)), tile = of(9, lit("#7d827b", "#a7ada4", rand, .04));
  // A low engineering-building bay. Its open glazed frontage is a real entrance, not a cutaway:
  // both the printer and the rack sit beneath the ceiling, with the paper facing the visitor.
  box(7.4, .13, 6.5, .8, .025, -.95, tile);
  // Broad cast slabs, not a ceramic floor grid. Hairline control cuts are sparse and dark.
  for (const xx of [-1.05, 1.35, 3.75]) box(.008, .002, 6.42, xx, .091, -.95, dark);
  for (const zz of [-2.0, .65]) box(7.30, .002, .008, .8, .091, zz, dark);
  box(7.8, .23, 6.9, .8, 3.43, -.95, concrete);
  box(7.8, .32, .24, .8, 3.19, 2.41, plaster);
  // Ceiling strip fittings, each with its metal housing, rather than modern point LEDs.
  for (const xx of [-.5, 2.4]) {
    box(.27, .07, 1.9, xx, 3.27, -.8, metal);
    for (const dx of [-.07, .07]) rod(P(xx + dx, 3.22, -1.675), P(xx + dx, 3.22, .075), .0175, tube);
  }
  const wall = (ax: number, az: number, bx: number, bz: number, height = 3.2) => {
    const length = Math.hypot(bx - ax, bz - az);
    parts.push(faceted(new THREE.BoxGeometry(.18, height, length + .18), plaster).rotateY(Math.atan2(bx - ax, bz - az)).translate((ax + bx) / 2, height / 2 + .1, (az + bz) / 2));
    const steps = Math.ceil(length / .42);
    for (let k = 0; k <= steps; k++) block(ax + (bx - ax) * k / steps, az + (bz - az) * k / steps, .25);
  };
  wall(-2.85, 2.25, -2.85, -4.15);
  wall(4.45, 2.25, 4.45, -4.15, 1.12);
  // The side window ribbon sits above a solid sill; vertical mullions keep the period proportions.
  pane(.022, 1.45, 6.2, 4.45, 2.02, -.95);
  box(.2, .39, 6.5, 4.45, 3.02, -.95, plaster);
  for (let i = 0; i < 7; i++) box(.12, 1.55, .055, 4.42, 2.02, -3.95 + i, metal);
  // Rear wall leaves an open passage to a longer outdoor campus corridor.
  wall(-2.85, -4.15, -2.4, -4.15);
  wall(-.8, -4.15, 4.45, -4.15);
  box(1.65, .45, .2, -1.6, 3.08, -4.15, plaster);
  box(2.0, .13, 4.1, -1.6, .025, -6.2, tile);
  box(2.2, .2, 4.2, -1.6, 3.42, -6.2, concrete);
  wall(-2.6, -4.35, -2.6, -8.15);
  // Open-sided colonnade: daylight is visible through the back of the room.
  for (const zz of [-4.6, -6.3, -8.1]) {
    box(.14, 3.2, .14, -.65, 1.7, zz, concrete);
    block(-.65, zz, .2);
  }
  // Front glazing stops short of a broad, unobstructed opening to the keys and paper.
  wall(-2.85, 2.25, -1.95, 2.25, .85);
  wall(3.2, 2.25, 4.45, 2.25, .85);
  for (const xx of [-2.4, 3.8]) pane(xx < 0 ? .78 : 1.1, 1.96, .022, xx, 1.97, 2.25);
  for (const xx of [-2.85, -1.95, 3.2, 4.45]) {
    box(.095, 3.1, .095, xx, 1.65, 2.25, metal);
    block(xx, 2.25, .18);
  }
  // Raceway, descending conduit and a wall-mounted patch field connect the rack to the building.
  box(6.7, .14, .16, .85, 2.85, -3.99, metal);
  rod(P(2.25, 2.83, -3.84), P(2.25, .38, -3.84), .026, metal);
  box(1.2, .88, .09, 1.8, 1.65, -4.0, dark);
  for (let row = 0; row < 4; row++) for (let col = 0; col < 8; col++) box(.065, .045, .025, 1.32 + col * .135, 1.36 + row * .18, -3.94, ivory);
  for (let i = 0; i < 4; i++) {
    const path = [P(1.42 + i * .17, 1.55, -3.91), P(1.38 + i * .17, 1.04 - i * .05, -3.73), P(1.93 + i * .1, 1.36, -3.91)];
    parts.push(faceted(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(path), 8, .012, 4, false), i % 2 ? enamel : amber));
  }

  // A modest concrete apron and a steel desk, with open air beneath the heavy mechanism.
  box(4.8, .12, 3.15, .65, .035, -.1, concrete);
  for (const xx of [-.71, .71]) for (const zz of [-.57, .57]) box(.055, .76, .055, xx * .80, .45, zz * .80, metal);
  parts.push(smoothed(new RoundedBoxGeometry(1.34, .08, 1.16, 1, .018), enamel).translate(0, .88, 0));
  const machineStart = parts.length;
  // Pressed steel has continuous round shoulders; the fine dark joint separates the removable hood.
  parts.push(smoothed(new RoundedBoxGeometry(1.42, .38, .77, 2, .085), enamel).translate(0, 1.27, -.21));
  parts.push(smoothed(new RoundedBoxGeometry(1.44, .065, .79, 1, .025), dark).translate(0, 1.455, -.21));
  parts.push(smoothed(new RoundedBoxGeometry(1.49, .12, .82, 2, .055), enamel).translate(0, 1.49, -.21));
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
  const paperFace: number[] = [], point = (i: number, j: number) => {
    const xx = -.305 + i / 6 * .61, yy = j / 8 * .83;
    return [xx, yy, Math.pow(Math.max(0, yy / .83 - .62), 2) * .36 + Math.pow(Math.abs(xx) / .305, 5) * .012];
  };
  for (let j = 0; j < 8; j++) for (let i = 0; i < 6; i++) {
    const a = point(i, j), b = point(i + 1, j), c = point(i + 1, j + 1), d = point(i, j + 1);
    paperFace.push(...a, ...b, ...c, ...a, ...c, ...d);
  }
  sheet.push(smoothed(new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(paperFace, 3)), paper));
  for (const xx of [-.267, .267]) for (let i = 0; i < 10; i++) {
    const yy = .055 + i * .078, zz = Math.pow(Math.max(0, yy / .83 - .62), 2) * .36 + Math.pow(Math.abs(xx) / .305, 5) * .012;
    sheetBox(.009, .012, .0005, xx, yy, zz + .001, dark);
  }
  // Monospaced L and closed O, printed large enough to read from the nearby road.
  const t = .023, y = .39, h = .235, w = .145;
  sheetBox(t, h, .0004, -.2, y, .009, ink);
  sheetBox(w, t, .0004, -.2 + (w - t) / 2, y - (h - t) / 2, .009, ink);
  for (const xx of [.055, .055 + w - t]) sheetBox(t, h, .0004, xx, y, .009, ink);
  for (const yy of [y - (h - t) / 2, y + (h - t) / 2]) sheetBox(w, t, .0004, .055 + (w - t) / 2, yy, .009, ink);
  parts.push(merged(sheet).rotateX(-.24).translate(0, 1.56, -.33));
  // A folded supply at the rear and a ribbon of output cascading down the desk's side.
  box(.61, .055, .4, 0, 1.15, -.58, paper);
  for (let i = 0; i < 4; i++) box(.61, .0015, .4, 0, 1.13 + i * .013, -.58, paper);
  parts.push(faceted(new THREE.BoxGeometry(.61, .88, .001), paper).rotateX(.26).translate(0, .64, .93));
  for (let i = 0; i < 4; i++) parts.push(faceted(new THREE.BoxGeometry(.61, .001, .35), paper).rotateX(i % 2 ? .16 : -.16).translate(0, .19 + i * .045, 1.02));

  // Keep the device and 15-inch paper at human scale on a 88 cm worktop.
  for (let i = machineStart; i < parts.length; i++) parts[i]!.translate(0, -1.075, 0).scale(.64, .80, .78).translate(0, .92, 0);

  // An industrial 19-inch-style communications rack, warm pilot lamps, card drawers and louvers.
  const rack = 2.25, rackStart = parts.length;
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
  for (let i = rackStart; i < parts.length; i++) parts[i]!.translate(-rack, 0, .38).scale(.68, .88, .85).translate(rack, .01, -.38);
  // Two thick cable runs leave the terminal and visibly terminate in the cabinet.
  for (let i = 0; i < 2; i++) {
    const path = [P(.47, 1.044, -.413 + i * .078), P(.99, .61, -.64 + i * .12), P(1.02, .14, -.5 + i * .14), P(1.39, .14, -.04 + i * .15), P(1.65, .17, .23 + i * .12), P(1.82, .43 + i * .16, .17)];
    parts.push(faceted(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(path), small ? 14 : 22, .027, 5, false), dark));
  }
  const feed = [P(rack, .3, -.86), P(2.8, .16, -1.5), P(2.8, .16, -3.7), P(2.25, .4, -3.84)];
  parts.push(faceted(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(feed), 14, .04, 5, false), dark));
  // Beyond the terminal, the covered walkway runs along the next teaching rooms.
  // Set the wall back from the passage so its open columns frame the view up the street.
  box(13.2, .15, 6.5, -9.65, .02, -1.75, tile);
  box(13.3, .24, 6.6, -9.65, 3.38, -1.75, concrete);
  box(13.1, 3.25, 3.85, -9.65, 1.59, -3.1, plaster);
  for (let bay = 0; bay < 4; bay++) {
    const xx = -4.9 - bay * 3.15;
    box(2.81, 1.39, .045, xx, 1.94, -1.15, glass);
    box(.06, 1.40, .075, xx, 1.94, -1.10, metal);
    box(2.94, .085, .18, xx, 1.19, -1.12, concrete);
    box(.20, 3.22, .20, xx - 1.32, 1.7, 1.37, concrete);
    block(xx - 1.32, 1.37, .22);
  }
  for (let xx = -15.65; xx < -3; xx += 1.15) for (const zz of [-4.07, -2.16]) block(xx, zz, 1.04);
  stand(merged(parts), x, s, turn);
  // Only solid furniture blocks a walker; the apron and loose paper can be approached.
  block(0, .05, 1.0);
  block(rack, -.38, .77);

  // Across the walk, a second low campus wing and its planted forecourt establish the setting.
  // It has no inaccessible hollow interior: the solid footprint is covered by overlapping circles.
  const campusX = roadX(s + 5) - 13.5, campusS = s + 5;
  const campus: THREE.BufferGeometry[] = [], campusBox = (w: number, h: number, d: number, xx: number, yy: number, zz: number, paint: Paint) => campus.push(faceted(new THREE.BoxGeometry(w, h, d), paint).translate(xx, yy, zz));
  campusBox(5.8, 5.7, 16, 0, 2.8, 0, plaster);
  campusBox(6.3, .24, 16.4, 0, 5.76, 0, concrete);
  for (const yy of [1.9, 4.35]) {
    campusBox(.055, 1.22, 15.2, 2.93, yy, 0, glass);
    for (let i = 0; i < 13; i++) campusBox(.1, 1.28, .065, 2.98, yy, -7.4 + i * 1.23, metal);
    campusBox(.2, .12, 15.6, 2.96, yy - .67, 0, concrete);
  }
  campusBox(2.3, .16, 13, 4.3, .05, 0, concrete);
  for (const zz of [-5.7, 5.7]) {
    campusBox(1.4, .5, 1.5, 4.6, .3, zz, concrete);
    campusBox(1.16, .1, 1.26, 4.6, .58, zz, dark);
    for (let i = 0; i < 5; i++) {
      const xx = 4.6 + (rand() - .5) * .7, z = zz + (rand() - .5) * .7;
      campus.push(faceted(new THREE.ConeGeometry(.28 + rand() * .15, .65 + rand() * .25, 5), lit("#455446", "#819477", rand, .08)).translate(xx, .99, z));
    }
    blocks.push([campusX + 4.6, campusS - zz, .95]);
  }
  for (const xx of [-1.45, 1.45]) for (let zz = -6.5; zz <= 6.5; zz += 2.16) blocks.push([campusX + xx, campusS - zz, 2.2]);
  stand(merged(campus), campusX, campusS);
  // Only these panes have a real room behind them. The solid distant wings keep their painted glass.
  const glazing = new THREE.Mesh(
    own(merged(windows).rotateY(turn).translate(x, floor(x, -s), -s)),
    own(new THREE.MeshStandardMaterial({ color: "#adc9c7", transparent: true, opacity: .20, roughness: .13, metalness: .08, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true })),
  );
  glazing.visible = false; glazing.receiveShadow = true; scene.add(glazing);
  return glazing;
}
