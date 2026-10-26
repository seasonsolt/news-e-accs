import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { createGeometryKit } from "../../../modules/scenes/web/shared/geometry.ts";

function worldVertices(mesh: THREE.Mesh) {
  const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
  const positions = geometry.getAttribute("position"), point = new THREE.Vector3(), vertices: THREE.Vector3[] = [];
  for (let i = 0; i < positions.count; i++) {
    point.fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld);
    vertices.push(point.clone());
  }
  geometry.dispose(); return vertices;
}

test("static merging preserves shadow flags, protected descendants and transformed world vertices", () => {
  const cleanup: Array<() => void> = [], kit = createGeometryKit(dispose => cleanup.push(dispose));
  try {
    const scene = new THREE.Scene(), parent = new THREE.Group(), preserved = new THREE.Group(), nested = new THREE.Group();
    parent.position.set(4, -2, 7); parent.rotation.set(.2, .7, -.3); parent.scale.set(1.5, .8, 2);
    scene.add(parent); parent.add(preserved); preserved.add(nested); nested.position.set(2, 1, -3);
    const material = kit.material(new THREE.MeshStandardMaterial()), expected = new Map<string, THREE.Vector3[]>(), originals: THREE.Mesh[] = [];
    const protectedMesh = kit.box(nested, material, [1, 2, 3], [1, 2, 1], 0);
    const protectedGeometry = protectedMesh.geometry;
    for (const cast of [false, true]) for (const receive of [false, true]) {
      for (let i = 0; i < 2; i++) {
        const mesh = kit.box(parent, material, [i * 3, Number(cast) * 4, Number(receive) * 5], [1, 2, 3], 0);
        mesh.castShadow = cast; mesh.receiveShadow = receive; mesh.rotation.z = i * .4;
        originals.push(mesh);
      }
    }
    scene.updateMatrixWorld(true);
    const protectedVertices = worldVertices(protectedMesh);
    for (const mesh of originals) {
      const key = `${mesh.castShadow}:${mesh.receiveShadow}`;
      expected.set(key, [...(expected.get(key) ?? []), ...worldVertices(mesh)]);
    }

    kit.mergeStatic(scene, new Set([preserved]));
    scene.updateMatrixWorld(true);
    const combined = scene.children.filter((object): object is THREE.Mesh => object instanceof THREE.Mesh);
    assert.equal(combined.length, 4, "one merged mesh for each pair of shadow flags");
    assert.equal(new Set(combined.map(mesh => `${mesh.castShadow}:${mesh.receiveShadow}`)).size, 4);
    for (const mesh of combined) {
      assert.equal(mesh.material, material);
      const actual = worldVertices(mesh), before = expected.get(`${mesh.castShadow}:${mesh.receiveShadow}`)!;
      assert.equal(actual.length, before.length);
      for (let i = 0; i < actual.length; i++) assert.ok(actual[i].distanceTo(before[i]) < 1e-5, "world vertices survive Float32 geometry conversion");
    }
    for (const mesh of originals) assert.equal(mesh.parent, null);
    assert.equal(preserved.parent, parent);
    assert.equal(nested.parent, preserved);
    assert.equal(protectedMesh.parent, nested);
    assert.equal(protectedMesh.geometry, protectedGeometry);
    assert.deepEqual(worldVertices(protectedMesh), protectedVertices);
  } finally {
    for (const dispose of cleanup) dispose();
  }
});
