import * as THREE from "three";
import { MONOLITH } from "./land.ts";

interface Setting {
  scene: THREE.Scene;
  own: <T extends { dispose(): void }>(item: T) => T;
}

/** A single unmarked black slab, with the 1:4:9 proportions of the monolith in 2001. */
export function buildMonolith({ scene, own }: Setting, x: number, y: number, z: number) {
  const geometry = own(new THREE.BoxGeometry(MONOLITH.width, MONOLITH.height, MONOLITH.depth));
  const material = own(new THREE.MeshStandardMaterial({ color: "#030305", roughness: .82, metalness: .04, envMapIntensity: .68 }));
  const monolith = new THREE.Mesh(geometry, material);
  monolith.position.set(x, y + MONOLITH.height / 2 - MONOLITH.burial, z);
  monolith.rotation.y = MONOLITH.yaw;
  monolith.castShadow = monolith.receiveShadow = true;
  scene.add(monolith);
  return monolith;
}
