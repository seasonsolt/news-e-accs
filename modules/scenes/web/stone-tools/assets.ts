import * as THREE from "three";
import { HDRLoader } from "three/examples/jsm/loaders/HDRLoader.js";
import { loadScan } from "../shared/scan-assets.ts";
export type { Scan } from "../shared/scan-assets.ts";
import manifest from "./manifest.json";

const url = (key: keyof typeof manifest) => `/media/scenes/stone-tools/${manifest[key]}`;
type Own = (dispose: () => void) => void;

export async function load(own: Own, renderer: THREE.WebGLRenderer) {
  async function texture(name: "soil-color" | "soil-normal" | "soil-roughness" | "soil-height") {
    const map = await new THREE.TextureLoader().loadAsync(url(name)); own(() => map.dispose());
    map.wrapS = map.wrapT = THREE.RepeatWrapping; map.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    if (name === "soil-color") map.colorSpace = THREE.SRGBColorSpace;
    return map;
  }
  const [rock, boulder, grass, shrub, color, normal, roughness, height, environment] = await Promise.all([
    loadScan(url("river-rock"), own, renderer), loadScan(url("work-boulder"), own, renderer), loadScan(url("grass-clump"), own, renderer, true), loadScan(url("shrub"), own, renderer), texture("soil-color"), texture("soil-normal"), texture("soil-roughness"), texture("soil-height"),
    new HDRLoader().loadAsync(url("dawn-environment")).then((map) => { own(() => map.dispose()); return map; }),
  ]);
  const pmrem = new THREE.PMREMGenerator(renderer), env = pmrem.fromEquirectangular(environment); pmrem.dispose(); own(() => env.dispose());
  const canvas = document.createElement("canvas"); canvas.width = canvas.height = 128;
  const context = canvas.getContext("2d", { willReadFrequently: true })!; context.drawImage(height.image, 0, 0, 128, 128);
  return { rock, boulder, grass, shrub, color, normal, roughness, height, environment: env.texture, heightPixels: context.getImageData(0, 0, 128, 128).data };
}
export type StoneAssets = Awaited<ReturnType<typeof load>>;
