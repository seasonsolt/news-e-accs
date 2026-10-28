import * as THREE from "three";
import { HDRLoader } from "three/examples/jsm/loaders/HDRLoader.js";
import { loadScan } from "./scan-assets.ts";
import stone from "../stone-tools/manifest.json";
import fire from "../taming-fire/manifest.json";
import farm from "../agriculture/manifest.json";
import type { Surface } from "./surfaces.ts";

type Own = (dispose: () => void) => void;
export async function loadNaturalAssets(own: Own, renderer: THREE.WebGLRenderer, agriculture: boolean) {
  const address = (scene: string, file: string) => `/media/scenes/${scene}/${file}`;
  async function surface(scene: string, files: Record<string, string>, prefix: string): Promise<Surface> {
    const maps = await Promise.all(["color", "normal", "roughness"].map(async (kind) => {
      const map = await new THREE.TextureLoader().loadAsync(address(scene, files[`${prefix}-${kind}`]!));
      own(() => map.dispose()); map.wrapS = map.wrapT = THREE.RepeatWrapping;
      map.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      if (kind === "color") map.colorSpace = THREE.SRGBColorSpace;
      return map;
    }));
    return { map: maps[0]!, normalMap: maps[1]!, roughnessMap: maps[2]! };
  }
  const [rock, boulder, grass, shrub, branches, earth, bark, clay, thatch, hdr] = await Promise.all([
    loadScan(address("stone-tools", stone["river-rock"]), own, renderer),
    loadScan(address("stone-tools", stone["work-boulder"]), own, renderer),
    loadScan(address("stone-tools", stone["grass-clump"]), own, renderer, true),
    loadScan(address("stone-tools", stone["shrub"]), own, renderer),
    agriculture ? null : loadScan(address("taming-fire", fire["dry-branches"]), own, renderer, true),
    agriculture ? surface("agriculture", farm, "field") : surface("stone-tools", stone, "soil"),
    surface("taming-fire", fire, "bark"),
    agriculture ? surface("agriculture", farm, "clay") : null,
    agriculture ? surface("agriculture", farm, "thatch") : null,
    new HDRLoader().loadAsync(address("stone-tools", stone["dawn-environment"])),
  ]);
  own(() => hdr.dispose()); const generator = new THREE.PMREMGenerator(renderer), environment = generator.fromEquirectangular(hdr);
  generator.dispose(); own(() => environment.dispose());
  return { rock, boulder, grass, shrub, branches, earth, bark, clay, thatch, environment: environment.texture };
}
export type NaturalAssets = Awaited<ReturnType<typeof loadNaturalAssets>>;
