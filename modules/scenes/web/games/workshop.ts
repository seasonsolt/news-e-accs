import * as THREE from "three";
import type { Kit } from "../shared/geometry.ts";
import { loadSurface, type Surface } from "../shared/surfaces.ts";
import { roomReflections } from "../shared/reflections.ts";
import { landscape, landscapeFor, loadLandscapeAssets, type LandscapeAssets } from "../shared/landscape.ts";

export interface WorkshopAssets { floor: Surface; wall: Surface; stone: Surface; landscape: LandscapeAssets }
export async function loadWorkshopAssets(own: (dispose: () => void) => void, renderer: THREE.WebGLRenderer): Promise<WorkshopAssets> {
  const [floor, wall, stone, landscape] = await Promise.all([loadSurface("wood", own), loadSurface("plaster", own), loadSurface("stone", own), loadLandscapeAssets(own, renderer)]);
  return { floor, wall, stone, landscape };
}
type Theme = "clay" | "forge" | "print" | "observatory" | "steam" | "electric" | "flight" | "logic" | "space" | "network";

/** An open work terrace: the apparatus belongs to its era, the surrounding landscape invites a pause. */
export function workshop(scene: THREE.Scene, k: Kit, renderer: THREE.WebGLRenderer, assets: WorkshopAssets, { theme }: { theme: Theme }) {
  const technical = ["logic", "space", "network"].includes(theme), forge = theme === "forge", clay = theme === "clay";
  const { box, rod, mesh, material } = k;
  landscape(scene, k, assets.landscape, landscapeFor(theme));
  const wood = material(new THREE.MeshPhysicalMaterial({ ...assets.floor, color: clay ? "#c4a678" : "#b29a75", roughness: .7, clearcoat: .12, clearcoatRoughness: .4, normalScale: new THREE.Vector2(.28, .28) }));
  const stone = material(new THREE.MeshStandardMaterial({ ...assets.stone, color: forge ? "#a9a295" : "#d2c6ae", roughness: .88, normalScale: new THREE.Vector2(.45, .45) }));
  const plaster = material(new THREE.MeshStandardMaterial({ ...assets.wall, color: "#e2d7bd", roughness: .93, normalScale: new THREE.Vector2(.35, .35) }));
  const brass = material(new THREE.MeshPhysicalMaterial({ color: "#b29460", metalness: .82, roughness: .28, clearcoat: .13 }));
  const iron = material(new THREE.MeshStandardMaterial({ color: technical ? "#586b76" : "#59605c", metalness: .7, roughness: .43 }));
  const paper = material(new THREE.MeshStandardMaterial({ color: "#eee5cc", roughness: .88 }));
  const glass = material(new THREE.MeshPhysicalMaterial({ color: "#c2dfda", metalness: .12, roughness: .12, transparent: true, opacity: .15, clearcoat: 1, depthWrite: false }));
  const glow = material(new THREE.MeshBasicMaterial({ color: "#ffe8b1" }));
  const floor = mesh(scene, new THREE.PlaneGeometry(10, 10), clay || forge || theme === "space" ? stone : wood, [0, -.025, .4]); floor.rotation.x = -Math.PI / 2; floor.castShadow = false;
  const uv = floor.geometry.attributes.uv!; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 4, uv.getY(i) * 4);
  // Low steps connect the work surface to the paths; no enclosing wall or ceiling interrupts the horizon.
  for (let i = 0; i < 3; i++) box(scene, stone, [0, -.06 - i * .035, 5.5 + i * .35], [4.5, .08, .4], .012);
  if (!["flight", "space", "observatory"].includes(theme)) {
    for (const x of [-4.6, 4.6]) for (const z of [-3.7, 3.9]) {
      box(scene, wood, [x, 1.7, z], [.13, 3.4, .13], .01);
      rod(scene, wood, [x, 2.9, z], [x * .82, 3.38, z], .045);
    }
    for (const x of [-4.6, 4.6]) box(scene, wood, [x, 3.4, .1], [.16, .16, 8], .01);
    for (const z of [-3.7, 3.9]) box(scene, wood, [0, 3.4, z], [9.4, .16, .16], .01);
  }
  const reflect = roomReflections(scene, renderer, k.own);
  return { wood, stone, plaster, brass, iron, paper, glass, glow, finish(preserve: Set<THREE.Object3D>) { k.mergeStatic(scene, preserve); reflect(); } };
}
