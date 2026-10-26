import * as THREE from "three";
import type { Kit } from "./geometry.ts";
import type { Vec3 } from "./worlds.ts";
import type { Scan } from "./scan-assets.ts";
import type { NaturalAssets } from "./natural-assets.ts";

/** Geometry shared by the hearth and early farm: scanned rocks, metre-scaled soil and bark-covered wood. */
export function naturalGeometry(scene: THREE.Scene, k: Kit, assets: NaturalAssets, agriculture: boolean) {
  const preserved = new Set<THREE.Object3D>(), { random } = k;
  const earth = k.material(new THREE.MeshStandardMaterial({ ...assets.earth, color: agriculture ? "#d6c4a3" : "#ada291", normalScale: new THREE.Vector2(.6, .6), roughness: 1, envMapIntensity: .3 }));
  const bark = k.material(new THREE.MeshStandardMaterial({ ...assets.bark, color: "#b7ac96", normalScale: new THREE.Vector2(.7, .7), roughness: .95 }));
  const char = k.material(new THREE.MeshStandardMaterial({ ...assets.bark, color: "#292824", normalScale: new THREE.Vector2(1, 1), roughness: 1 }));
  const rings = k.texture(512, 512, (c, w, h) => {
    c.fillStyle = "#a38258"; c.fillRect(0, 0, w, h);
    for (let r = 2; r < w; r += 3 + random() * 5) { c.strokeStyle = r % 3 ? "#4b321d66" : "#e9ce9844"; c.lineWidth = 1 + random(); c.beginPath(); c.ellipse(w * .44, h * .53, r, r * .94, .1, 0, Math.PI * 2); c.stroke(); }
    for (let i = 0; i < 9; i++) { const a = random() * Math.PI * 2, r = 50 + random() * 120; c.strokeStyle = "#2c2018aa"; c.lineWidth = 2; c.beginPath(); c.moveTo(w * .44 + Math.cos(a) * r, h * .53 + Math.sin(a) * r); c.lineTo(w * .44 + Math.cos(a) * 300, h * .53 + Math.sin(a) * 300); c.stroke(); }
  });
  const cutWood = k.material(new THREE.MeshStandardMaterial({ map: rings, bumpMap: rings, bumpScale: .008, roughness: .9 }));
  const burntEnd = k.material(new THREE.MeshStandardMaterial({ map: rings, color: "#42362a", roughness: 1 }));
  function height(x: number, z: number) {
    const r = Math.hypot(x, z), outside = THREE.MathUtils.smoothstep(r, 8, 65);
    return -.04 + Math.sin(x * 3.3 + z * 2.8) * .012 + Math.sin(x * 1.9 - z * 1.3) * .013 + outside * (2.6 + Math.sin(x * .07) * 1.4 + Math.sin(z * .09 + x * .04));
  }
  const terrain = new THREE.PlaneGeometry(60, 60, innerWidth < 761 ? 130 : 210, innerWidth < 761 ? 130 : 210); terrain.rotateX(-Math.PI / 2);
  const p = terrain.attributes.position!, uv = terrain.attributes.uv!;
  const spread = (x: number) => Math.sign(x) * (Math.abs(x) < 12 ? Math.abs(x) : 12 + (Math.abs(x) - 12) * 7);
  for (let i = 0; i < p.count; i++) { const x = spread(p.getX(i)), z = spread(p.getZ(i)); p.setXYZ(i, x, height(x, z), z); uv.setXY(i, x / 3, z / 3); }
  terrain.computeVertexNormals(); const ground = k.mesh(scene, terrain, earth); ground.castShadow = false; preserved.add(ground);
  function scan(source: Scan, parent: THREE.Object3D, at: Vec3, size: Vec3, angle = 0) {
    const object = k.mesh(parent, source.geometry, source.material, at); object.scale.set(...size); object.rotation.y = angle; preserved.add(object); return object;
  }
  function rock(at: Vec3, size: Vec3, angle = 0, large = false) { return scan(large ? assets.boulder : assets.rock, scene, at, size, angle); }
  function instances(source: Scan, placements: Array<{ at: Vec3; size: Vec3; angle: number }>, shadow = true) {
    const group = new THREE.InstancedMesh(source.geometry, source.material, placements.length), dummy = new THREE.Object3D();
    for (const [i, p] of placements.entries()) { dummy.position.set(...p.at); dummy.scale.set(...p.size); dummy.rotation.set(0, p.angle, 0); dummy.updateMatrix(); group.setMatrixAt(i, dummy.matrix); }
    group.castShadow = shadow; group.receiveShadow = true; group.computeBoundingSphere(); scene.add(group); return group;
  }
  function log(parent: THREE.Object3D, from: Vec3, to: Vec3, radius: number, burnt = false) {
    const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to), length = a.distanceTo(b), group = new THREE.Group();
    group.position.copy(a.add(b).multiplyScalar(.5)); group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.sub(new THREE.Vector3(...from)).normalize()); parent.add(group);
    const g = new THREE.CylinderGeometry(radius * .76, radius, length, 22, 14, true), p = g.attributes.position!;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, x), taper = 1 + Math.sin(a * 5 + y * 6) * .055 + Math.sin(a * 9 - y * 4) * .025; p.setXYZ(i, x * taper + Math.sin(y * 3) * radius * .14, y, z * taper); }
    g.computeVertexNormals(); k.mesh(group, g, burnt ? char : bark);
    for (const side of [-1, 1]) { const end = k.mesh(group, new THREE.CircleGeometry(radius * (side > 0 ? .76 : 1), 40), burnt ? burntEnd : cutWood, [Math.sin(side * length * 1.5) * radius * .14, side * length / 2, 0]); end.rotation.x = side > 0 ? -Math.PI / 2 : Math.PI / 2; }
    return group;
  }
  return { earth, bark, char, preserved, height, scan, rock, instances, log };
}
