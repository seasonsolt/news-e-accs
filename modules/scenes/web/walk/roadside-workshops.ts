import * as THREE from "three";
import type { Kit } from "./camp.ts";
import { buildWorkshopBuildings } from "./workshop-buildings.ts";
import { ROADSIDE, roadX, sequence } from "./land.ts";
import { faceted, flat, limb, lit, merged, of, triangles, type Paint } from "./shapes.ts";

/** A card has actual perforations, so the light and machinery remain visible
 * through its programme. The same holes cut both faces and the thin card edge. */
function punchedCard(index: number, small: boolean, paper: Paint) {
  const width = .64, height = .18, shape = new THREE.Shape();
  shape.moveTo(-width / 2, -height / 2); shape.lineTo(width / 2, -height / 2);
  shape.lineTo(width / 2, height / 2); shape.lineTo(-width / 2, height / 2); shape.closePath();
  const columns = small ? 7 : 10;
  for (let row = 0; row < 3; row++) for (let column = 0; column < columns; column++) {
    // A repeated diagonal advances through the chain, interleaved with its mirror.
    if ((column + row * 2 + index) % 5 > 1 && (column - row + index + columns) % 7 !== 0) continue;
    const hole = new THREE.Path(), x = (column - (columns - 1) / 2) * .049, y = (row - 1) * .043;
    hole.absarc(x, y, small ? .013 : .0105, 0, Math.PI * 2, true); shape.holes.push(hole);
  }
  // Two lacing holes at each end connect the card to its neighbours.
  for (const x of [-.285, .285]) for (const y of [-.062, .062]) {
    const hole = new THREE.Path(); hole.absarc(x, y, .005, 0, Math.PI * 2, true); shape.holes.push(hole);
  }
  return faceted(new THREE.ExtrudeGeometry(shape, { depth: .004, bevelEnabled: false, steps: 1, curveSegments: 3 }), paper);
}

/** The press and the programmable loom share the road's timber, flax and iron.
 * Each workshop joins the existing static scenery batch rather than adding draws. */
export function buildWorkshops(kit: Kit) {
  buildWorkshopBuildings(kit);
  const rand = sequence(14401804), { small, stand, blocks } = kit;
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const wood = of(10, lit("#443225", "#8c7050", rand, .13));
  const cutWood = of(10, lit("#6e5337", "#ad9063", rand, .1));
  const iron = of(13, flat("#383a38", rand, .07)), ink = flat("#242522", rand, .05);
  const paper = of(11, flat("#d8ceb1", rand, .04)), paperEdge = of(11, flat("#b8a986", rand, .07));
  const cord = flat("#9c8969", rand, .06), warp = of(6, flat("#c4b797", rand, .07));
  const horizontal = new Map<Paint, Paint>();
  const grain = (paint: Paint, upright: boolean) => {
    if (paint.surface !== 10 || upright) return paint;
    if (!horizontal.has(paint)) horizontal.set(paint, of(15, (p, n, f) => paint(p, n, f)));
    return horizontal.get(paint)!;
  };
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, paint: Paint) =>
    faceted(new THREE.BoxGeometry(w, h, d).translate(x, y, z), grain(paint, h >= Math.max(w, d)));
  const beam = (a: THREE.Vector3, b: THREE.Vector3, w: number, d: number, paint = wood) => {
    const direction = b.clone().sub(a), center = a.clone().add(b).multiplyScalar(.5);
    const turn = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), direction.clone().normalize());
    return faceted(new THREE.BoxGeometry(w, direction.length(), d).applyQuaternion(turn).translate(center.x, center.y, center.z), grain(paint, Math.abs(direction.y) >= Math.hypot(direction.x, direction.z)));
  };
  const axle = (radius: number, length: number, x: number, y: number, z: number, paint: Paint) =>
    faceted(new THREE.CylinderGeometry(radius, radius, length, small ? 8 : 12).rotateZ(Math.PI / 2).translate(x, y, z), grain(paint, false));
  const quad = (out: number[], a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3) => {
    for (const p of [a, b, c, a, c, d]) out.push(p.x, p.y, p.z);
  };

  /** Ink is laid on the paper's front face as grouped sorts and a small woodcut.
   * There is no texture, tiny invented label or downloaded typeface. */
  function printedSheet(width: number, height: number, variant: number) {
    const parts = [faceted(new THREE.BoxGeometry(width, height, .004, 1, 8, 1), paper)], marks: number[] = [];
    const mark = (x: number, y: number, w: number, h: number) => quad(marks, V(x, y, .0028), V(x + w, y, .0028), V(x + w, y + h, .0028), V(x, y + h, .0028));
    const rows = small ? 10 : 15, columns = small ? 10 : 15;
    const left = -width * .39, top = height * .32, stepX = width * .78 / columns, stepY = height * .67 / rows;
    for (let row = 0; row < rows; row++) for (let column = 0; column < columns - (row % 6 === 5 ? 3 : 0); column++) {
      const x = left + column * stepX, y = top - row * stepY;
      const w = stepX * (.35 + rand() * .3), h = stepY * .43;
      mark(x, y, w, h); if ((column + row + variant) % 4 === 0) mark(x + w * .75, y - h * .3, w * .2, h * .5);
    }
    mark(-width * .34, height * .39, width * .68, height * .012);
    if (variant % 2 === 0) {
      const x = -width * .34, y = -height * .4;
      for (let k = 0; k < 5; k++) mark(x + k * width * .018, y, width * .008, height * (.04 + .013 * k));
    }
    parts.push(triangles(marks, ink));
    // A drying sheet is not a rigid sign: its lower edge turns slightly forward.
    // Warp the printed sorts with their sheet so no ink floats above the paper.
    const sheet = merged(parts), positions = sheet.attributes.position!;
    for (let i = 0; i < positions.count; i++) {
      const lower = Math.max(0, -positions.getY(i) / height * 2);
      positions.setZ(i, positions.getZ(i) + lower * lower * .012);
    }
    sheet.computeVertexNormals(); return sheet;
  }

  // The horizontal bed is pulled toward the reader, under a heavy timber screw.
  {
    const parts: THREE.BufferGeometry[] = [], [s, offset] = ROADSIDE.press;
    const x = roadX(s) + offset, turn = Math.atan2(-offset, 8.5);
    for (const side of [-1, 1]) {
      parts.push(box(.22, 2.96, .26, side * .76, 1.48, -.18, wood));
      parts.push(box(.26, .17, 1.72, side * .76, .12, -.12, wood));
      parts.push(beam(V(side * .76, .2, -.78), V(side * .76, 1.05, -.2), .11, .12));
      for (const y of [1.05, 2.5]) parts.push(box(.236, .065, .274, side * .76, y, -.18, iron));
    }
    parts.push(box(1.96, .32, .36, 0, 2.75, -.18, wood));
    // Flush wooden pegs at the loaded mortise-and-tenon joints, rather than metal bolts.
    for (const side of [-1, 1]) for (const y of [.54, 2.75]) parts.push(faceted(
      new THREE.CylinderGeometry(.023, .023, .012, 6).rotateX(Math.PI / 2).translate(side * .76, y, .008), cutWood));
    parts.push(box(1.75, .16, .33, 0, .54, -.18, wood));
    parts.push(box(1.43, .16, 2.15, 0, 1.02, .45, cutWood));
    for (const side of [-1, 1]) parts.push(box(.065, .07, 2.17, side * .6, 1.135, .45, iron));
    // The travelling stone and its raised type forme extend out of the frame.
    parts.push(box(1.12, .095, 1.22, 0, 1.15, .72, iron));
    parts.push(box(.96, .032, 1.05, 0, 1.213, .72, cutWood));
    parts.push(printedSheet(.70, .89, 0).rotateX(-Math.PI / 2).translate(0, 1.238, .72));
    parts.push(box(1.05, .16, .88, 0, 1.52, -.18, wood));
    parts.push(box(.91, .055, .74, 0, 1.412, -.18, iron));
    parts.push(faceted(new THREE.CylinderGeometry(.10, .11, 1.12, small ? 10 : 16).translate(0, 2.11, -.18), cutWood));
    const thread: number[] = [], turns = 11, steps = turns * (small ? 10 : 16);
    for (let i = 0; i < steps; i++) {
      const a = i / steps * turns * Math.PI * 2, b = (i + 1) / steps * turns * Math.PI * 2;
      const at = (angle: number, edge: number) => V(Math.cos(angle) * (.108 + edge * .024), 1.60 + angle / (turns * Math.PI * 2) * 1.04 + edge * .012, -.18 + Math.sin(angle) * (.108 + edge * .024));
      quad(thread, at(a, -1), at(a, 1), at(b, 1), at(b, -1));
    }
    parts.push(triangles(thread, cutWood));
    parts.push(axle(.04, 1.65, .3, 1.98, -.18, wood));
    parts.push(faceted(new THREE.SphereGeometry(.072, 8, 5).translate(1.14, 1.98, -.18), cutWood));
    parts.push(box(.72, .07, .54, 1.46, .88, .52, wood));
    for (const dx of [-.27, .27]) parts.push(box(.055, .86, .055, 1.46 + dx, .43, .52, wood));
    for (let page = 0; page < 5; page++) parts.push(box(.38, .006, .49, 1.44 + (rand() - .5) * .025, .925 + page * .006, .52, paperEdge));
    parts.push(printedSheet(.38, .49, 1).rotateX(-Math.PI / 2).translate(1.44, .96, .52));
    // A dabber, blackened pad and ink-stained rag beside the freshly printed stack.
    parts.push(faceted(new THREE.SphereGeometry(.11, 9, 5).scale(1, .35, 1).translate(1.53, .96, .76), ink));
    parts.push(limb(V(1.53, .97, .76), V(1.53, 1.18, .76), .022, .025, cutWood, { capped: true }));
    parts.push(box(.12, .006, .17, 1.28, .968, .77, of(6, flat("#756c58", rand))));
    for (const dx of [-1.18, 1.18]) parts.push(box(.075, 2.36, .075, dx, 1.18, -.98, wood));
    parts.push(limb(V(-1.2, 2.28, -.98), V(1.2, 2.28, -.98), .009, .009, cord, { sag: .035, rand }));
    for (let page = 0; page < 5; page++) {
      const dx = -.91 + page * .45;
      parts.push(printedSheet(.35, .49, page).rotateY((page - 2) * .045).translate(dx, 1.99, -.97));
      parts.push(box(.025, .065, .021, dx, 2.255, -.95, cutWood));
    }
    stand(merged(parts), x, s, turn, -.015);
    blocks.push([x, s, 1.38]);
  }

  // The loom's warp fan, front cloth beam and high Jacquard head form one frame.
  {
    const parts: THREE.BufferGeometry[] = [], [s, offset] = ROADSIDE.loom;
    const x = roadX(s) + offset, turn = Math.atan2(-offset, 9);
    for (const side of [-1, 1]) {
      for (const z of [-.68, .78]) parts.push(box(.14, 2.35, .15, side * .94, 1.175, z, wood));
      parts.push(box(.15, .13, 1.94, side * .94, .14, .06, wood));
      parts.push(box(.15, .14, 1.84, side * .94, 2.28, .06, wood));
      parts.push(beam(V(side * .94, .22, -.61), V(side * .94, 1.13, .71), .075, .075));
      parts.push(box(.11, 1.01, .13, side * .66, 2.72, -.22, wood));
    }
    for (const y of [.23, 1.04, 2.28, 3.19]) parts.push(box(2.16, .14, .16, 0, y, -.22, wood));
    for (const side of [-1, 1]) for (const y of [.23, 2.28]) parts.push(faceted(
      new THREE.CylinderGeometry(.018, .018, .012, 6).rotateX(Math.PI / 2).translate(side * .94, y, -.132), cutWood));
    parts.push(box(1.16, .26, .76, 0, 3.09, -.18, cutWood));
    parts.push(box(1.08, .045, .68, 0, 2.93, -.18, iron));
    parts.push(axle(.17, 1.96, 0, 1.76, -.68, warp));
    parts.push(axle(.16, 1.99, 0, 1.05, .85, cutWood));
    parts.push(axle(.11, 1.76, 0, 1.25, .85, of(6, flat("#6f7266", rand))));
    const threads = small ? 24 : 42;
    for (let i = 0; i < threads; i++) {
      const dx = (i / (threads - 1) - .5) * 1.63;
      parts.push(limb(V(dx, 1.77, -.66), V(dx, 1.47, .2), small ? .0035 : .0027, .0027, warp, { sides: 3 }));
      parts.push(limb(V(dx, 1.47, .2), V(dx, 1.24, .82), .0027, .0027, warp, { sides: 3 }));
      if (i % 2 === 0) parts.push(limb(V(dx, 1.48, .19), V(dx * .48, 2.94, -.19), .0035, .0035, cord, { sides: 3 }));
    }
    for (const z of [-.015, .16]) {
      parts.push(box(1.81, .045, .04, 0, 1.88, z, cutWood));
      parts.push(box(1.81, .045, .04, 0, 1.23, z, cutWood));
      for (let i = 0; i < (small ? 12 : 20); i++) {
        const dx = (i / (small ? 11 : 19) - .5) * 1.62;
        parts.push(limb(V(dx, 1.25, z), V(dx, 1.86, z), .0028, .0028, iron, { sides: 3 }));
      }
    }
    // A contemporary two-colour Jacquard study, not a transcription of an antique.
    // Each woven cell owns its colour vertices: the scenery's usual face-colour
    // smoothing would otherwise wash the small repeat into interpolated patches.
    const clothPositions: number[] = [], clothColours: number[] = [];
    const blue = new THREE.Color("#344c55"), flax = new THREE.Color("#d3bc8b");
    const columns = 48, rows = 28, width = 1.62, height = .75;
    const clothPoint = (u: number, v: number) => V((u - .5) * width, .455 + v * height,
      1.012 + .018 * Math.sin(u * Math.PI * 6) * (1 - v) + .024 * (1 - v) * (1 - v));
    function woven(column: number, row: number) {
      if (column < 2 || column >= columns - 2) return column % 2 === 0;
      if (row === 1 || row === rows - 2) return true;
      // A narrow chain of small diamonds finishes the top and bottom woven borders.
      if (row < 5 || row >= rows - 5) {
        const y = row < 5 ? row - 3 : row - (rows - 4);
        return Math.abs((column + 1) % 6 - 2.5) + Math.abs(y) < 2.5;
      }
      const x = (column % 16) - 7.5, y = row - 5;
      const stem = Math.sin(y * .28) * 2;
      if (Math.abs(x - stem) < .65) return true;
      // Alternating leaves grow out of the gently scrolling central shoot.
      for (const node of [2, 7, 12]) {
        const side = node === 7 ? -1 : 1, dy = y - node;
        const leafX = Math.sin(node * .28) * 2 + side * (2.6 + dy * .65);
        if (Math.abs(x - leafX) / 3.2 + Math.abs(dy) / 2.4 < 1) return true;
      }
      // Small detached lozenges make the repeat legible from the street.
      return Math.abs(Math.abs(x) - 6) + Math.abs(y - 8) < 1.6;
    }
    const emitCloth = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, colour: THREE.Color) => {
      for (const p of [a, b, c]) { clothPositions.push(p.x, p.y, p.z); colour.toArray(clothColours, clothColours.length); }
    };
    for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
      const a = clothPoint(column / columns, row / rows), b = clothPoint((column + 1) / columns, row / rows);
      const c = clothPoint((column + 1) / columns, (row + 1) / rows), d = clothPoint(column / columns, (row + 1) / rows);
      const colour = woven(column, row) ? flax : blue;
      emitCloth(a, b, c, colour); emitCloth(a, c, d, colour);
    }
    // A quiet reverse follows the same drape with far fewer faces.
    for (let row = 0; row < 7; row++) for (let column = 0; column < 12; column++) {
      const a = clothPoint(column / 12, row / 7), b = clothPoint((column + 1) / 12, row / 7);
      const c = clothPoint((column + 1) / 12, (row + 1) / 7), d = clothPoint(column / 12, (row + 1) / 7);
      for (const point of [a, b, c, d]) point.z -= .004;
      emitCloth(a, c, b, blue); emitCloth(a, d, c, blue);
    }
    const cloth = new THREE.BufferGeometry();
    cloth.setAttribute("position", new THREE.Float32BufferAttribute(clothPositions, 3));
    cloth.setAttribute("color", new THREE.Float32BufferAttribute(clothColours, 3));
    cloth.setAttribute("surface", new THREE.Float32BufferAttribute(new Float32Array(clothPositions.length / 3).fill(6), 1));
    cloth.computeVertexNormals(); parts.push(cloth);
    // The last unpatterned span rests on the breast beam above the hanging sample.
    parts.push(faceted(new THREE.BoxGeometry(1.62, .014, .35, 8, 1, 3).translate(0, 1.214, .83), of(6, flat("#8e866b", rand, .06))));
    parts.push(box(1.82, .09, .075, 0, 1.42, .61, wood));
    parts.push(box(.38, .065, .075, .16, 1.286, .73, cutWood));
    for (const side of [-1, 1]) parts.push(beam(V(side * .25, .09, .72), V(side * .25, .22, -.42), .14, .055, cutWood));
    parts.push(box(1.43, .08, .35, 0, .43, 1.55, wood));
    for (const dx of [-.58, .58]) parts.push(box(.08, .43, .24, dx, .215, 1.55, wood));
    // The programme drops in a continuous chain from the drum beside the head.
    const frontCards = small ? 8 : 10, cardTop = 3.24, step = .185;
    for (let i = 0; i < frontCards; i++) {
      const y = cardTop - i * step, z = .47 + .04 * Math.sin(i * .5);
      parts.push(punchedCard(i, small, paper).rotateY(.055 * Math.sin(i * .7)).translate(1.28, y, z));
      for (const dx of [-.285, .285]) parts.push(limb(V(1.28 + dx, y - .07, z + .007), V(1.28 + dx, y - step + .07, z + .007), .004, .004, cord, { sides: 3 }));
    }
    const bottom = cardTop - (frontCards - 1) * step;
    parts.push(punchedCard(frontCards, small, paper).rotateX(-.65).translate(1.28, bottom - .145, .33));
    parts.push(punchedCard(frontCards + 1, small, paper).rotateX(-1.9).translate(1.28, bottom - .17, .12));
    for (let i = 0; i < frontCards; i++) parts.push(punchedCard(i + 2, small, paperEdge).rotateY(-.04).translate(1.28, bottom + i * step, -.02));
    parts.push(axle(.14, .75, 1.28, 3.28, .22, cutWood));
    for (const dx of [.88, 1.68]) parts.push(box(.09, .45, .62, dx, 3.16, .18, wood));
    stand(merged(parts), x, s, turn, -.015);
    blocks.push([x, s, 1.28]);
  }
}
