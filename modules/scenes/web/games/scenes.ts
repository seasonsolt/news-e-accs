import type * as THREE from "three";
import type { Kit, Model } from "../shared/geometry.ts";
import type { GameId } from "./types.ts";
import { loadWorkshopAssets } from "./workshop.ts";
import { landHeight, landscapeFor } from "../shared/landscape.ts";

const builders = {
  writing: () => import("../writing/scene.ts"), iron: () => import("../iron/scene.ts"), printing: () => import("../printing/scene.ts"),
  observatory: () => import("../observatory/scene.ts"), steam: () => import("../steam/scene.ts"), electric: () => import("../electric/scene.ts"),
  flight: () => import("../flight/scene.ts"), logic: () => import("../logic/scene.ts"), space: () => import("../space/scene.ts"), network: () => import("../network/scene.ts"),
};
export async function buildChallenge(scene: THREE.Scene, k: Kit, renderer: THREE.WebGLRenderer, id: GameId, active: () => boolean): Promise<Model | undefined> {
  const [{ build }, assets] = await Promise.all([builders[id](), loadWorkshopAssets(k.own, renderer)]);
  if (!active()) return;
  const model = build(scene, k, assets, renderer);
  const wide = model.views.wide;
  wide.position = [wide.position[0] * 1.2, wide.target[1] + .8, wide.position[2] * 1.2];
  return { ...model, groundHeight: (x, z) => landHeight(x, z, landscapeFor(id)) };
}
