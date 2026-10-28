import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Vec3 } from "./worlds.ts";
import type { GameController } from "../games/types.ts";

export interface View { position: Vec3; target: Vec3 }
export interface Spot { id: string; title: string; detail: string; object: THREE.Object3D; view: View; advance?: boolean; action?: string }
export interface Model {
  views: Record<"wide" | "close" | "side" | "painting", View>;
  spots: Spot[];
  pickables: THREE.Object3D[];
  update: (phase: number, time: number, delta: number) => void;
  canMove?: (x: number, z: number) => boolean;
  groundHeight?: (x: number, z: number) => number;
  game?: GameController;
}

export function createGeometryKit(own: (dispose: () => void) => void) {
  const ambient: Array<(time: number) => void> = [];
  let seed = 2026;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const geometry = new Map<string, THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
  own(() => { for (const g of geometry.values()) g.dispose(); for (const m of materials) m.dispose(); for (const t of textures) t.dispose(); });
  function cached(key: string, build: () => THREE.BufferGeometry) { if (!geometry.has(key)) geometry.set(key, build()); return geometry.get(key)!; }
  function material<T extends THREE.Material>(m: T): T { materials.add(m); return m; }
  function texture(width: number, height: number, draw: (c: CanvasRenderingContext2D, w: number, h: number) => void) {
    const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
    draw(canvas.getContext("2d")!, width, height);
    const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4; textures.add(map); return map;
  }
  function mesh(parent: THREE.Object3D, g: THREE.BufferGeometry, m: THREE.Material, at: Vec3 = [0, 0, 0]) {
    geometry.set(g.uuid, g);
    const item = new THREE.Mesh(g, m); item.position.set(...at); item.castShadow = true; item.receiveShadow = true; parent.add(item); return item;
  }
  function box(parent: THREE.Object3D, m: THREE.Material, at: Vec3, size: Vec3, bevel = .015) {
    const r = Math.min(bevel, Math.min(...size) * .15);
    return mesh(parent, cached(`box:${size}:${r}`, () => r ? new RoundedBoxGeometry(...size, 2, r) : new THREE.BoxGeometry(...size)), m, at);
  }
  function sphere(parent: THREE.Object3D, m: THREE.Material, at: Vec3, radius: number) {
    return mesh(parent, cached(`sphere:${radius}`, () => new THREE.SphereGeometry(radius, 40, 28)), m, at);
  }
  function cylinder(parent: THREE.Object3D, m: THREE.Material, at: Vec3, radius: number, height: number, top = radius) {
    return mesh(parent, cached(`cyl:${radius}:${height}:${top}`, () => new THREE.CylinderGeometry(top, radius, height, 32)), m, at);
  }
  function rod(parent: THREE.Object3D, m: THREE.Material, from: Vec3, to: Vec3, radius = .016) {
    const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to), d = b.clone().sub(a), center = a.add(b).multiplyScalar(.5);
    const item = cylinder(parent, m, center.toArray() as Vec3, radius, d.length());
    item.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); return item;
  }
  function tube(parent: THREE.Object3D, m: THREE.Material, points: Vec3[], radius = .012) {
    return mesh(parent, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p))), 48, radius, 6, false), m);
  }
  function torus(parent: THREE.Object3D, m: THREE.Material, at: Vec3, radius: number, thickness: number) {
    return mesh(parent, cached(`torus:${radius}:${thickness}`, () => new THREE.TorusGeometry(radius, thickness, 8, 128)), m, at);
  }
  /** Preserve the screens and moving objects; merge the fixed room by material to keep its detail inexpensive. */
  function mergeStatic(scene: THREE.Scene, preserve: Set<THREE.Object3D>) {
    scene.updateMatrixWorld(true);
    const groups = new Map<string, { material: THREE.Material; cast: boolean; receive: boolean; parts: THREE.BufferGeometry[] }>(), originals: THREE.Mesh[] = [];
    scene.traverse((o) => {
      if (!(o instanceof THREE.Mesh) || o instanceof THREE.InstancedMesh) return;
      for (let p: THREE.Object3D | null = o; p; p = p.parent) if (preserve.has(p)) return;
      const m = o.material as THREE.Material;
      if (m.transparent || !m.visible) return;
      const g = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone()).applyMatrix4(o.matrixWorld);
      const key = `${m.uuid}:${o.castShadow}:${o.receiveShadow}`;
      const group = groups.get(key) ?? { material: m, cast: o.castShadow, receive: o.receiveShadow, parts: [] };
      group.parts.push(g); groups.set(key, group); originals.push(o);
    });
    for (const o of originals) o.removeFromParent();
    for (const { material: m, cast, receive, parts } of groups.values()) {
      const g = mergeGeometries(parts, false);
      for (const p of parts) p.dispose();
      if (!g) throw new Error("Could not merge workshop geometry");
      const combined = mesh(scene, g, m); combined.castShadow = cast; combined.receiveShadow = receive;
    }
  }
  return { own, random, material, texture, mesh, box, sphere, cylinder, rod, tube, torus, mergeStatic,
    animate(update: (time: number) => void) { ambient.push(update); },
    update(time: number) { for (const animate of ambient) animate(time); },
  };
}
export type Kit = ReturnType<typeof createGeometryKit>;
