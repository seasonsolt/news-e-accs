import type * as THREE from "three";
import type { Kit, Model } from "../shared/geometry.ts";
import type { GameId } from "./types.ts";
import { loadWorkshopAssets } from "./workshop.ts";

const builders = {
  writing: () => import("../writing/scene.ts"), iron: () => import("../iron/scene.ts"), printing: () => import("../printing/scene.ts"),
  observatory: () => import("../observatory/scene.ts"), steam: () => import("../steam/scene.ts"), electric: () => import("../electric/scene.ts"),
  flight: () => import("../flight/scene.ts"), logic: () => import("../logic/scene.ts"), space: () => import("../space/scene.ts"), network: () => import("../network/scene.ts"),
};
export async function buildChallenge(scene: THREE.Scene, k: Kit, renderer: THREE.WebGLRenderer, id: GameId, active: () => boolean): Promise<Model | undefined> {
  const [{ build }, assets] = await Promise.all([builders[id](), loadWorkshopAssets(k.own)]);
  if (!active()) return;
  return build(scene, k, assets, renderer);
}
