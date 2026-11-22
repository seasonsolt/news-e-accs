import * as THREE from "three";
import { flat, limb, merged, of, rock, triangles, type Paint } from "./shapes.ts";

/** Bark stays around the cut, with broken growth rings and radial drying cracks in the exposed wood. */
export function cutLog(from: THREE.Vector3, to: THREE.Vector3, radius: number, tip: number, bark: Paint, charred = false) {
  const parts = [limb(from, to, radius, tip, bark, { sides: 7, capped: true })], axis = to.clone().sub(from).normalize();
  for (const [point, size, direction] of [[from, radius, axis.clone().negate()], [to, tip, axis]] as const) {
    const cut: number[] = [], cracks: number[] = [], rings = 5, sides = 10;
    const at = (ring: number, side: number) => {
      const angle = side / sides * Math.PI * 2, r = size * .9 * ring / rings * (1 + .045 * Math.sin(angle * 3 + .6));
      return new THREE.Vector3(Math.cos(angle) * r, Math.sin(angle) * r, .0015);
    };
    for (let ring = 0; ring < rings; ring++) for (let side = 0; side < sides; side++) {
      for (const p of [at(ring, side), at(ring + 1, side), at(ring + 1, side + 1), at(ring, side), at(ring + 1, side + 1), at(ring, side + 1)]) cut.push(p.x, p.y, p.z);
    }
    const pale = new THREE.Color(charred ? "#6e6254" : "#b18b5d"), dark = new THREE.Color(charred ? "#29211b" : "#6a4b2f"), tint = new THREE.Color();
    const end: Paint = (p) => {
      const ring = Math.hypot(p.x, p.y) / size * rings / .9;
      return tint.copy(pale).lerp(dark, Math.sin(ring * Math.PI * 2) > .55 ? .55 : .12);
    };
    parts.push(triangles(cut, end).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction)).translate(point.x, point.y, point.z));
    for (const [angle, length] of [[.3, .7], [2.4, .55], [4.7, .35]] as const) {
      const a = new THREE.Vector3(Math.cos(angle) * size * .86, Math.sin(angle) * size * .86, .002);
      const b = a.clone().multiplyScalar(1 - length); b.z = .002;
      for (const p of [a, b, a.clone().add(new THREE.Vector3(-Math.sin(angle) * size * .035, Math.cos(angle) * size * .035, 0))]) cracks.push(p.x, p.y, p.z);
    }
    parts.push(triangles(cracks, () => dark).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction)).translate(point.x, point.y, point.z));
  }
  return merged(parts);
}

/** Bent saplings support overlapping bundles. Ropes and weighted pegs carry the edge back into the ground. */
export function campShelter(rand: () => number, small: boolean, bark: Paint, grass: Paint, hide: Paint, stone: Paint) {
  const parts: THREE.BufferGeometry[] = [], ribs = small ? 9 : 11, rows = 6, wide = 1.9, tall = 1.58;
  const tie = of(0, flat("#a89065", rand, .12));
  const rib = (i: number, t: number) => {
    const angle = i / (ribs - 1) * Math.PI, up = t * 1.36;
    return new THREE.Vector3(Math.cos(angle) * wide * Math.cos(up), tall * Math.sin(up) - .08, -Math.sin(angle) * wide * 1.15 * Math.cos(up) + t * .5);
  };
  const knots = Array.from({ length: ribs }, (_, i) => Array.from({ length: rows + 1 }, (_, row) => rib(i, row / rows).add(new THREE.Vector3((rand() - .5) * .09, (rand() - .5) * .06, (rand() - .5) * .09))));
  for (let i = 0; i < ribs; i++) for (let row = 0; row < rows; row++) parts.push(limb(knots[i]![row]!, knots[i]![row + 1]!, .028 - row * .002, .025 - row * .002, bark, { sides: 4 }));
  for (const row of [1, 3, 5]) for (let i = 0; i < ribs - 1; i++) {
    const a = knots[i]![row]!, b = knots[i + 1]![row]!;
    parts.push(limb(a, b, .016, .014, bark, { sides: 3 }));
    for (let turn = 0; turn < 3; turn++) parts.push(limb(a.clone().add(new THREE.Vector3(-.038, -.015 + turn * .018, .027)), a.clone().add(new THREE.Vector3(.038, .012 + turn * .018, -.027)), .006, .006, tie, { sides: 3 }));
  }
  for (let i = 0; i < ribs - 1; i++) for (let row = 0; row < rows; row++) {
    if ((i + row * 3) % 17 === 0) continue; // small gaps expose the supporting hoops
    const out = (p: THREE.Vector3, more: number) => p.clone().add(new THREE.Vector3(p.x, 0, p.z - .25).normalize().multiplyScalar(.05 + more)).add(new THREE.Vector3(0, .03, 0));
    const a = out(knots[i]![row]!, .13), b = out(knots[i + 1]![row]!, .13), c = out(knots[i + 1]![row + 1]!, 0), d = out(knots[i]![row + 1]!, 0);
    a.y -= .07 + rand() * .08; b.y -= .07 + rand() * .08;
    const panel: number[] = []; for (const p of [a, b, c, a, c, d]) panel.push(p.x, p.y, p.z);
    parts.push(triangles(panel, grass));
    const strands = small ? 2 : 4;
    for (let strand = 0; strand < strands; strand++) {
      const share = (strand + .4 + rand() * .3) / strands, top = d.clone().lerp(c, share), foot = a.clone().lerp(b, share);
      foot.y -= .035 + rand() * .09;
      parts.push(limb(top, foot, .008 + rand() * .006, .003, grass, { sides: 3 }));
    }
  }
  for (const i of [0, 2, ribs - 3, ribs - 1]) {
    const foot = knots[i]![0]!, peg = foot.clone().multiply(new THREE.Vector3(1.22, 0, 1.22)); peg.y = -.04;
    parts.push(limb(peg, peg.clone().add(new THREE.Vector3(-.05, .27, .04)), .035, .026, bark, { sides: 4, capped: true }));
    parts.push(limb(knots[i]![2]!, peg.clone().add(new THREE.Vector3(0, .13, 0)), .009, .009, tie, { sides: 3 }));
    parts.push(rock(rand, 0, stone).scale(.16, .13, .15).translate(peg.x + .12, -.025, peg.z));
  }
  const bed: number[] = [];
  for (let i = 0; i < 12; i++) {
    const a = i * Math.PI / 6, b = (i + 1) * Math.PI / 6, r0 = .83 + (i % 3) * .1, r1 = .83 + ((i + 1) % 3) * .1;
    bed.push(0, .035, -.55, Math.cos(b) * r1 * 1.3, .03, -.55 + Math.sin(b) * r1 * .7, Math.cos(a) * r0 * 1.3, .03, -.55 + Math.sin(a) * r0 * .7);
  }
  parts.push(triangles(bed, hide));
  return merged(parts);
}
