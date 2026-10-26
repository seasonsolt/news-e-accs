import * as THREE from "three";
import type { Kit } from "../shared/geometry.ts";
import manifest from "./manifest.json";
import { WindowCycle } from "./window-cycle.ts";

const names = ["window-fuji", "window-paris", "window-great-wall"] as const;
const windowWidth = 2.1, windowHeight = 2.35;
const centers = [-2.3, 0, 2.3], panoramaWidth = centers[2]! - centers[0]! + windowWidth;
export async function loadWindows(own: (dispose: () => void) => void, renderer: THREE.WebGLRenderer) {
  return Promise.all(names.map(async name => {
    const map = await new THREE.TextureLoader().loadAsync(`/media/scenes/agents-2026/${manifest[name]}`);
    own(() => map.dispose());
    map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    // Each aperture sees a different portion of ONE panorama, including the scenery behind mullions.
    const imageAspect = map.image.width / map.image.height, wallAspect = panoramaWidth / windowHeight;
    const u = Math.min(1, wallAspect / imageAspect), v = Math.min(1, imageAspect / wallAspect);
    const tiles = centers.map(x => {
      const tile = map.clone(); own(() => tile.dispose());
      tile.repeat.set(u * windowWidth / panoramaWidth, v);
      tile.offset.set((1 - u) / 2 + u * (x + panoramaWidth / 2 - windowWidth / 2) / panoramaWidth, (1 - v) / 2);
      const canvas = document.createElement("canvas"); canvas.width = canvas.height = 32;
      const c = canvas.getContext("2d")!;
      c.drawImage(map.image, tile.offset.x * map.image.width, tile.offset.y * map.image.height, tile.repeat.x * map.image.width, tile.repeat.y * map.image.height, 0, 0, 32, 32);
      const pixels = c.getImageData(0, 0, 32, 32).data, color = new THREE.Color(0, 0, 0), pixel = new THREE.Color();
      for (let i = 0; i < pixels.length; i += 4) color.add(pixel.setRGB(pixels[i]! / 255, pixels[i + 1]! / 255, pixels[i + 2]! / 255, THREE.SRGBColorSpace));
      color.multiplyScalar(1 / (pixels.length / 4));
      const brightness = Math.max(color.r, color.g, color.b);
      color.multiplyScalar(1 / Math.max(.05, brightness));
      return { map: tile, color, intensity: 1.2 + Math.min(.5, brightness) * 2 };
    });
    return { name, tiles };
  }));
}
export type WindowAssets = Awaited<ReturnType<typeof loadWindows>>;

/** Three physical virtual windows. Only their scenic imagery is raster content. */
export function buildWindows(scene: THREE.Scene, k: Kit, assets: WindowAssets, frame: THREE.Material, preserve: Set<THREE.Object3D>) {
  const cycle = new WindowCycle(assets.length), slots = centers.map((x, index) => {
    const group = new THREE.Group(); group.position.set(x, 1.93, -2.55); scene.add(group);
    const width = windowWidth, height = windowHeight;
    for (const edge of [-1, 1]) {
      k.box(group, frame, [edge * (width / 2 + .035), 0, .014], [.07, height + .14, .16], .008);
      k.box(group, frame, [0, edge * (height / 2 + .035), .014], [width, .07, .16], .008);
    }
    k.box(group, frame, [0, -height / 2 - .07, .11], [width + .22, .045, .3], .007);
    const initial = assets[0]!.tiles[index]!;
    const base = k.material(new THREE.MeshBasicMaterial({ map: initial.map, color: new THREE.Color(1.12, 1.12, 1.12), fog: false }));
    const fade = k.material(new THREE.MeshBasicMaterial({ map: initial.map, transparent: true, opacity: 0, depthWrite: false, color: new THREE.Color(1.12, 1.12, 1.12), fog: false }));
    const screen = k.mesh(group, new THREE.PlaneGeometry(width, height), base, [0, 0, .012]);
    const overlay = k.mesh(group, screen.geometry, fade, [0, 0, .014]);
    screen.castShadow = screen.receiveShadow = overlay.castShadow = overlay.receiveShadow = false;
    screen.name = `virtual-window-${index}`; overlay.name = `virtual-window-fade-${index}`;
    preserve.add(screen); preserve.add(overlay);
    const light = new THREE.RectAreaLight(initial.color, initial.intensity, width, height);
    light.position.set(x, 1.93, -2.38); light.lookAt(x * .2, .95, 1.4); scene.add(light);
    return { base, fade, light };
  });
  let reflected = -1;
  return {
    update(stage: number, time: number, animate: boolean) {
      const state = cycle.sample(stage, time, animate);
      slots.forEach(({ base, fade, light }, slot) => {
        const a = assets[state.from]!.tiles[slot]!, b = assets[state.to]!.tiles[slot]!;
        base.map = a.map; fade.map = b.map; fade.opacity = state.mix;
        light.color.copy(a.color).lerp(b.color, state.mix);
        light.intensity = THREE.MathUtils.lerp(a.intensity, b.intensity, state.mix);
      });
      const refresh = state.mix === 1 && reflected !== state.to;
      if (refresh) reflected = state.to;
      return refresh;
    },
  };
}
