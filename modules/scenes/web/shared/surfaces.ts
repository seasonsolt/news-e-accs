import * as THREE from "three";
import manifest from "../difference-engine-1822/manifest.json";

export interface Surface { map: THREE.Texture; normalMap: THREE.Texture; roughnessMap: THREE.Texture }
/** Reuse the pinned CC0 scans already published for 1822; no duplicate assets or new R2 upload. */
export async function loadSurface(name: "wood" | "stone" | "plaster", own: (dispose: () => void) => void): Promise<Surface> {
  const load = async (kind: "color" | "normal" | "roughness") => {
    const key = `${name}-${kind}` as keyof typeof manifest;
    const loader = new THREE.TextureLoader();
    const texture = await loader.loadAsync(`/media/scenes/difference-engine-1822/${manifest[key]}`);
    own(() => texture.dispose());
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.anisotropy = 8;
    if (kind === "color") texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  };
  const [map, normalMap, roughnessMap] = await Promise.all([load("color"), load("normal"), load("roughness")]);
  return { map, normalMap, roughnessMap };
}
