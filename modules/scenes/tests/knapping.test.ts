import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { cutStone } from "../web/stone-tools/knapping.ts";

function volume(g: THREE.BufferGeometry) {
  const p = g.getAttribute("position"), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  let sum = 0;
  for (let i = 0; i < p.count; i += 3) sum += a.fromBufferAttribute(p, i).dot(b.fromBufferAttribute(p, i + 1).cross(c.fromBufferAttribute(p, i + 2))) / 6;
  return Math.abs(sum);
}

test("knapping removes the outside volume and closes the cut with outward normals and a separate material", () => {
  const source = new THREE.BoxGeometry(1, 1, 1), before = Array.from(source.getAttribute("position").array);
  const result = cutStone(source, [new THREE.Plane(new THREE.Vector3(1, 0, 0), -.2)]);
  assert.ok(Math.abs(volume(result) - .7) < 1e-6);
  assert.equal(result.boundingBox!.max.x.toFixed(4), "0.2000");
  const cap = result.groups.find((g) => g.materialIndex === 1)!;
  assert.ok(cap.count > 0);
  for (let i = cap.start; i < cap.start + cap.count; i++) assert.ok(result.getAttribute("normal").getX(i) > .999);
  assert.deepEqual(Array.from(source.getAttribute("position").array), before);
  result.dispose(); source.dispose();
});

test("successive cuts stay finite, reduce the volume, and reset can reconstruct the untouched stone", () => {
  const source = new THREE.BoxGeometry(1, 1, 1), planes = [new THREE.Plane(new THREE.Vector3(1, 0, 0), -.2), new THREE.Plane(new THREE.Vector3(0, 1, 0), -.1), new THREE.Plane(new THREE.Vector3(0, 0, 1), -.25)];
  let previous = 1;
  for (let i = 1; i <= 3; i++) {
    const geometry = cutStone(source, planes.slice(0, i)), current = volume(geometry);
    assert.ok(current > 0 && current < previous); previous = current;
    for (const attribute of Object.values(geometry.attributes)) assert.ok(Array.from(attribute.array).every(Number.isFinite));
    geometry.dispose();
  }
  const reset = cutStone(source, []); assert.ok(Math.abs(volume(reset) - 1) < 1e-6); reset.dispose(); source.dispose();
});

test("a concave fracture follows the perimeter without filling the notch with radial spikes", () => {
  const outline = new THREE.Shape(); outline.moveTo(0, 0); outline.lineTo(2, 0); outline.lineTo(2, 1); outline.lineTo(1, 1); outline.lineTo(1, 2); outline.lineTo(0, 2); outline.closePath();
  const source = new THREE.ExtrudeGeometry(outline, { depth: 1, bevelEnabled: false });
  const cut = cutStone(source, [new THREE.Plane(new THREE.Vector3(0, 0, 1), -.4)]);
  assert.ok(Math.abs(volume(cut) - 1.2) < 1e-6);
  const cap = cut.groups.find((g) => g.materialIndex === 1)!, p = cut.getAttribute("position");
  for (let i = cap.start; i < cap.start + cap.count; i += 3) {
    const x = (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3, y = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3;
    assert.ok(!(x > 1 && y > 1), "cap must leave the concave notch empty");
  }
  cut.dispose(); source.dispose();
});
