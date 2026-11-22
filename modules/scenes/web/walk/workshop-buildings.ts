import * as THREE from "three";
import type { Kit } from "./camp.ts";
import { ROADSIDE, roadX, sequence } from "./land.ts";
import { faceted, flat, lit, merged, of, triangles, type Paint } from "./shapes.ts";

type Opening = readonly [left: number, bottom: number, width: number, height: number];

/** Both streets use the existing static batches. Ground-level wall collisions
 * follow the actual wall runs, leaving the broad workshop doors open. */
export function buildWorkshopBuildings({ stand, blocks, small }: Kit) {
  const rand = sequence(1440180417), V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const oak = of(2, lit("#3b2d25", "#806849", rand, .1));
  const boards = of(2, lit("#75654d", "#aa9777", rand, .12));
  const plaster = of(3, lit("#a6987d", "#d2c5a6", rand, .07));
  const lime = of(3, lit("#a8a89a", "#d8d4bd", rand, .06));
  const stone = of(1, lit("#787568", "#aaa492", rand, .09));
  const brick = of(1, lit("#705847", "#a38b70", rand, .1));
  const dressedStone = flat("#aaa591", rand, .04);
  const paper = flat("#d1c6a8", rand, .05), ink = flat("#555146", rand, .04);
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, paint: Paint) =>
    faceted(new THREE.BoxGeometry(w, h, d).translate(x, y, z), paint);
  const beam = (a: THREE.Vector3, b: THREE.Vector3, w: number, d: number, paint = oak) => {
    const delta = b.clone().sub(a), center = a.clone().add(b).multiplyScalar(.5);
    const rotation = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), delta.clone().normalize());
    return faceted(new THREE.BoxGeometry(w, delta.length(), d).applyQuaternion(rotation).translate(center.x, center.y, center.z), paint);
  };
  /** Rectangular wall panels around true openings, including doors that reach the floor. */
  function wall(width: number, height: number, depth: number, openings: readonly Opening[], paint: Paint) {
    const xs = [...new Set([-width / 2, width / 2, ...openings.flatMap(([x, , w]) => [x, x + w])])].sort((a, b) => a - b);
    const ys = [...new Set([0, height, ...openings.flatMap(([, y, , h]) => [y, y + h])])].sort((a, b) => a - b);
    const parts: THREE.BufferGeometry[] = [];
    for (let i = 1; i < xs.length; i++) for (let j = 1; j < ys.length; j++) {
      const x = (xs[i - 1]! + xs[i]!) / 2, y = (ys[j - 1]! + ys[j]!) / 2;
      if (openings.some(([left, bottom, w, h]) => x > left && x < left + w && y > bottom && y < bottom + h)) continue;
      parts.push(box(xs[i]! - xs[i - 1]!, ys[j]! - ys[j - 1]!, depth, x, y, 0, paint));
    }
    return merged(parts);
  }
  const local = (s: number, offset: number, turn: number, x: number, z: number): [number, number] =>
    [roadX(s) + offset + x * Math.cos(turn) + z * Math.sin(turn), s + x * Math.sin(turn) - z * Math.cos(turn)];
  function collision(s: number, offset: number, turn: number, ax: number, az: number, bx: number, bz: number) {
    const count = Math.ceil(Math.hypot(bx - ax, bz - az) / .45);
    for (let i = 0; i <= count; i++) {
      const t = count ? i / count : 0, [x, at] = local(s, offset, turn, ax + (bx - ax) * t, az + (bz - az) * t);
      blocks.push([x, at, .18]);
    }
  }
  function windowFrame(parts: THREE.BufferGeometry[], x: number, bottom: number, z: number, w: number, h: number, paint: Paint, tall = false) {
    parts.push(box(w + .12, .09, .18, x, bottom, z, paint), box(w + .12, .09, .18, x, bottom + h, z, paint));
    for (const dx of [-w / 2, w / 2]) parts.push(box(.08, h, .18, x + dx, bottom + h / 2, z, paint));
    parts.push(box(.035, h, .07, x, bottom + h / 2, z + .04, paint));
    const rails = tall ? 3 : 1;
    for (let j = 1; j <= rails; j++) parts.push(box(w, .035, .07, x, bottom + h * j / (rails + 1), z + .04, paint));
  }
  function floor(parts: THREE.BufferGeometry[], width: number, from: number, to: number) {
    const count = Math.ceil(width / .32);
    for (let i = 0; i < count; i++) parts.push(box(width / count - .012, .065, to - from, -width / 2 + (i + .5) * width / count, .015, (from + to) / 2, boards));
  }
  function roof(parts: THREE.BufferGeometry[], halfWidth: number, eaves: number, rise: number, from: number, to: number, paint: Paint) {
    const slope = Math.hypot(halfWidth, rise), angle = Math.atan2(rise, halfWidth), depth = to - from;
    for (const side of [-1, 1]) {
      parts.push(faceted(new THREE.BoxGeometry(slope, .10, depth, small ? 8 : 16, 1, 5).rotateZ(-side * angle)
        .translate(side * halfWidth / 2, eaves + rise / 2, (from + to) / 2), paint));
      for (let i = 0; i < 6; i++) {
        const z = from + .12 + i * (depth - .24) / 5;
        parts.push(beam(V(side * halfWidth, eaves - .1, z), V(0, eaves + rise - .1, z), .11, .13));
      }
    }
    parts.push(box(.18, .18, depth + .12, 0, eaves + rise, (from + to) / 2, oak));
  }
  function gable(parts: THREE.BufferGeometry[], halfWidth: number, eaves: number, rise: number, z: number, paint: Paint) {
    const p = [-halfWidth, eaves, z, halfWidth, eaves, z, 0, eaves + rise, z];
    parts.push(triangles(p, paint));
    parts.push(beam(V(-halfWidth, eaves, z + .03), V(0, eaves + rise, z + .03), .13, .14));
    parts.push(beam(V(0, eaves + rise, z + .03), V(halfWidth, eaves, z + .03), .13, .14));
    parts.push(box(.14, rise, .15, 0, eaves + rise / 2, z + .04, oak));
  }

  // Mainz: an open ground-floor printing house under a steep, timbered gable.
  {
    const [s, offset] = ROADSIDE.press, turn = -Math.PI / 2, front = 1.8, back = -3.35, half = 3.65, eaves = 3.55;
    const parts: THREE.BufferGeometry[] = [], clay = of(3, lit("#674d3e", "#9c7050", rand, .12));
    floor(parts, half * 2, back, front + .05);
    parts.push(wall(half * 2, eaves, .20, [], plaster).translate(0, 0, back));
    const sideOpenings: Opening[] = [[-1.60, 1.15, 1.05, 1.55], [.15, 1.15, 1.05, 1.55]];
    for (const side of [-1, 1]) {
      const sideWall: THREE.BufferGeometry[] = [wall(front - back, eaves, .18, sideOpenings, plaster)];
      for (const [x, y, w, h] of sideOpenings) windowFrame(sideWall, x + w / 2, y, .02, w, h, oak);
      parts.push(merged(sideWall).rotateY(Math.PI / 2).translate(side * half, 0, (front + back) / 2));
      parts.push(box(.17, eaves, .19, side * half, eaves / 2, front, oak));
      parts.push(box(.17, eaves, .19, side * half, eaves / 2, back, oak));
      parts.push(box(.22, .20, front - back, side * half, .16, (front + back) / 2, stone));
      for (const z of [-2.6, -.8, 1.15]) parts.push(box(.14, eaves, .16, side * half, eaves / 2, z, oak));
      parts.push(box(.18, .16, front - back, side * half, 1.02, (front + back) / 2, oak));
      collision(s, offset, turn, side * half, back, side * half, front);
    }
    // Two returned plaster piers frame a six-metre opening; no central post hides the machine.
    for (const side of [-1, 1]) parts.push(box(.72, eaves, .20, side * (half - .36), eaves / 2, front, plaster));
    parts.push(box(half * 2 + .18, .22, .24, 0, eaves - .10, front, oak));
    for (const side of [-1, 1]) parts.push(box(.17, eaves, .22, side * 2.94, eaves / 2, front - .02, oak));
    for (const y of [.17, 1.03, eaves - .13]) parts.push(box(half * 2, .15, .19, 0, y, back + .10, oak));
    for (const dx of [-3.1, -1.55, 0, 1.55, 3.1]) parts.push(box(.14, eaves, .18, dx, eaves / 2, back + .10, oak));
    for (const side of [-1, 1]) parts.push(beam(V(side * 3.0, 1.12, back + .13), V(side * 1.6, 3.2, back + .13), .11, .12));
    roof(parts, half + .22, eaves, 2.10, back - .18, front + .28, clay);
    gable(parts, half, eaves, 2.10, front + .02, plaster);
    gable(parts, half, eaves, 2.10, back - .02, plaster);
    // An actual working back wall: shelves, loose sheets, drying frames and bound gatherings.
    for (const y of [.85, 1.7, 2.5]) {
      parts.push(box(4.75, .07, .30, .1, y, back + .28, boards));
      for (let i = 0; i < (small ? 7 : 11); i++) {
        const x = -2.03 + i * (small ? .63 : .405), height = .22 + rand() * .15;
        parts.push(box(.19 + rand() * .08, height, .23, x, y + height / 2 + .04, back + .29, paper));
      }
    }
    for (let i = 0; i < 7; i++) {
      const x = -2.4 + i * .68, y = 2.91;
      parts.push(box(.37, .44, .008, x, y, back + .22, paper));
      for (let row = 0; row < 7; row++) parts.push(box(.26, .008, .003, x, y + .15 - row * .042, back + .227, ink));
    }
    parts.push(box(.68, .10, 1.9, 2.75, .83, -.9, oak));
    for (const z of [-1.62, -.18]) for (const dx of [2.52, 2.98]) parts.push(box(.075, .82, .075, dx, .41, z, oak));
    collision(s, offset, turn, -half, back, half, back);
    for (const side of [-1, 1]) collision(s, offset, turn, side * 2.94, front, side * half, front);
    stand(merged(parts), roadX(s) + offset, s, turn);

    // Party walls and overlapping eaves continue past the workshop along the street.
    function printingHouse(at: number, off: number, h: number, w = 2.30) {
      const face = off > 0 ? -Math.PI / 2 : Math.PI / 2;
      const town: THREE.BufferGeometry[] = [], windows: Opening[] = [[-1.58, 2.9, 1.12, 1.15], [.45, 2.9, 1.12, 1.15]];
      town.push(wall(w * 2, h, .22, windows, plaster).translate(0, 0, 1.9));
      for (const [left, y, width, height] of windows) windowFrame(town, left + width / 2, y, 2.03, width, height, oak);
      town.push(box(1.02, 2.12, .12, -.55, 1.06, 2.05, oak));
      town.push(box(w * 2, h, .17, 0, h / 2, -1.9, plaster));
      for (const side of [-1, 1]) town.push(box(.17, h, 3.9, side * w, h / 2, 0, plaster));
      for (const x of [-w, 0, w]) town.push(box(.14, h, .18, x, h / 2, 2.05, oak));
      for (const y of [.2, 2.5, h]) town.push(box(w * 2, .16, .18, 0, y, 2.04, oak));
      for (const side of [-1, 1]) town.push(beam(V(side * 2.06, 2.64, 2.05), V(side * .30, h - .15, 2.05), .12, .13));
      roof(town, w + .18, h, 2.1, -2.1, 2.12, clay); gable(town, w, h, 2.1, 2.06, plaster);
      stand(merged(town), roadX(at) + off, at, face);
      for (const z of [-1.9, 1.9]) collision(at, off, face, -w, z, w, z);
      collision(at, off, face, -w, -1.9, -w, 1.9); collision(at, off, face, w, -1.9, w, 1.9);
    }
    for (let house = 0; house < 4; house++) printingHouse(s - 5.4 + house * 5.0, -7.8, 4.8 + (house % 2) * .45);
    printingHouse(s + 7.3, 5.9, 4.85, 3.0);
    printingHouse(s + 13.5, 6.1, 5.15, 3.0);
  }

  // Lyon: a taller, light-filled masonry room, with its card head below the roof.
  {
    const [s, offset] = ROADSIDE.loom, turn = Math.PI / 2, half = 3.8, front = 1.55, back = -3.6, height = 5.55;
    const parts: THREE.BufferGeometry[] = [], slate = of(1, lit("#505955", "#7c8378", rand, .09));
    floor(parts, half * 2, back, front + .06);
    const backWindows: Opening[] = [[-2.62, 1.45, 1.50, 3.65], [.95, 1.45, 1.50, 3.65]];
    parts.push(wall(half * 2, height, .34, backWindows, lime).translate(0, 0, back));
    for (const [left, y, w, h] of backWindows) windowFrame(parts, left + w / 2, y, back + .04, w, h, boards, true);
    const sideWindows: Opening[] = [[-1.80, 1.25, 1.04, 3.85], [-.20, 1.25, 1.04, 3.85], [1.35, 1.25, .84, 3.85]];
    for (const side of [-1, 1]) {
      const wing: THREE.BufferGeometry[] = [wall(front - back, height, .32, sideWindows, lime)];
      for (const [left, y, w, h] of sideWindows) windowFrame(wing, left + w / 2, y, .04, w, h, boards, true);
      parts.push(merged(wing).rotateY(Math.PI / 2).translate(side * half, 0, (front + back) / 2));
      parts.push(box(.32, height, .34, side * half, height / 2, front, dressedStone));
      parts.push(box(.32, height, .34, side * half, height / 2, back, dressedStone));
      parts.push(box(.34, .16, front - back, side * half, 1.16, (front + back) / 2, stone));
      collision(s, offset, turn, side * half, back, side * half, front);
    }
    // Tall returned jambs and a high lintel preserve the oblique view of the loom from the road.
    for (const side of [-1, 1]) parts.push(box(.75, height, .32, side * (half - .375), height / 2, front, lime));
    parts.push(box(half * 2, .26, .40, 0, 4.35, front, dressedStone));
    parts.push(box(half * 2, .15, .42, 0, height, front, dressedStone));
    for (const x of [-2.8, -1.4, 0, 1.4, 2.8]) parts.push(box(.055, .95, .12, x, 4.95, front + .03, boards));
    for (const y of [4.52, 5.35]) parts.push(box(half * 2, .055, .12, 0, y, front + .03, boards));
    for (const y of [.18, .47, .76]) {
      parts.push(box(half * 2, .12, .35, 0, y, back + .02, brick));
      for (const side of [-1, 1]) parts.push(box(.35, .12, front - back, side * half, y, (front + back) / 2, brick));
    }
    roof(parts, half + .20, height + .03, .70, back - .18, front + .18, slate);
    for (let i = 0; i < 4; i++) parts.push(box(half * 2 - .2, .19, .17, 0, 5.35, back + .45 + i * 1.35, oak));
    // Cones, wound hanks and bobbins occupy the wall bench, away from the reader's path.
    parts.push(box(5.50, .11, .65, 0, .82, back + .65, boards));
    for (const x of [-2.48, 0, 2.48]) parts.push(box(.11, .80, .48, x, .40, back + .65, oak));
    for (let i = 0; i < (small ? 9 : 17); i++) {
      const x = -2.4 + i * (small ? .59 : .30), y = 1.05 + rand() * .025, yarn = of(6, flat(i % 3 ? "#bbaf8d" : "#6a7e7f", rand, .06));
      parts.push(faceted(new THREE.CylinderGeometry(.055, .095, .33, 8).translate(x, y, back + .61), yarn));
      parts.push(box(.035, .40, .035, x, y, back + .61, boards));
    }
    collision(s, offset, turn, -half, back, half, back);
    for (const side of [-1, 1]) collision(s, offset, turn, side * 3.04, front, side * half, front);
    stand(merged(parts), roadX(s) + offset, s, turn);

    // High-window wings flank the forward view as well as the opposite pavement.
    function weaverWing(at: number, off: number) {
      const face = off > 0 ? -Math.PI / 2 : Math.PI / 2, w = 3.15, h = 7.2;
      const wing: THREE.BufferGeometry[] = [], openings: Opening[] = [];
      for (const x of [-2.58, -.66, 1.26]) for (const y of [1.12, 4.1]) openings.push([x, y, 1.32, 2.48]);
      wing.push(wall(w * 2, h, .34, openings, lime).translate(0, 0, 2.12));
      for (const [left, y, width, high] of openings) windowFrame(wing, left + width / 2, y, 2.26, width, high, boards, true);
      wing.push(box(w * 2, h, .28, 0, h / 2, -2.12, lime));
      for (const side of [-1, 1]) wing.push(box(.30, h, 4.24, side * w, h / 2, 0, lime));
      for (const y of [.3, 3.72, 7.14]) wing.push(box(w * 2 + .12, .16, .40, 0, y, 2.14, dressedStone));
      wing.push(box(.9, 2.1, .12, -2.15, 1.05, 2.31, oak));
      roof(wing, w + .18, h, .64, -2.29, 2.32, slate);
      stand(merged(wing), roadX(at) + off, at, face);
      for (const z of [-2.12, 2.12]) collision(at, off, face, -w, z, w, z);
      collision(at, off, face, -w, -2.12, -w, 2.12); collision(at, off, face, w, -2.12, w, 2.12);
    }
    for (let house = 0; house < 3; house++) weaverWing(s - 3.7 + house * 6.6, 8.3);
    weaverWing(s + 7.0, -5.9);
    weaverWing(s + 13.6, -6.0);
  }
}
