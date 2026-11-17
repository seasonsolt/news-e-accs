import * as THREE from "three";
import { buildCamp, type Kit } from "./camp.ts";
import { buildFields } from "./fields.ts";
import { FIRE_S, MONO_S, SOW_S, roadX } from "./land.ts";
import { blob, lit, merged, of, rock, scree, turned, type Paint } from "./shapes.ts";
import { createMatte } from "./surface.ts";
import { buildForest, type Wind } from "./trees.ts";
import { buildVillage } from "./village.ts";

/** `wind` is the grass's wind, so the leaves move with it. */
type Setting = Pick<Kit, "scene" | "own" | "rand" | "small" | "still" | "out" | "floor" | "fireX"> & { stoneX: number; wind?: Wind };

/** Everything that stands on the land: the camp, rocks, trees, the seed basket, the first village and the stone. */
export function buildProps(setting: Setting) {
  const { scene, own, rand, small, floor, fireX, stoneX } = setting;
  const matte = own(createMatte(!small));
  // Scenery that never moves is gathered by stretch of road and drawn as one mesh per stretch.
  const stretches = new Map<number, THREE.BufferGeometry[]>(), blocks: Kit["blocks"] = [];
  const keep = (shape: THREE.BufferGeometry, s: number) => { const key = Math.floor(s / 90); stretches.set(key, [...(stretches.get(key) ?? []), shape]); };
  const stand: Kit["stand"] = (shape, x, s, turn = 0, lift = 0) => keep(shape.rotateY(turn).translate(x, floor(x, -s) + lift, -s), s);
  const tone = new THREE.Color();
  const stone = of(1, lit("#4b433b", "#82776a", rand, .1)), sand = of(3, lit("#5e4d3a", "#9a8466", rand));

  const kit: Kit = { ...setting, matte, stand, blocks }, camp = buildCamp(kit);

  // ---------- loose stone ----------
  const clear = (x: number, s: number, room: number) => blocks.every(([bx, bs, r]) => Math.hypot(x - bx, s - bs) > r + room) && Math.hypot(x - fireX, s - FIRE_S) > 2.6 + room;
  for (let i = 0; i < (small ? 22 : 50); i++) {
    const s = -20 + rand() * 268, x = roadX(s) + (rand() < .5 ? -1 : 1) * (5 + rand() * rand() * 46), size = .35 + rand() * rand() * 4;
    if (!clear(x, s, size) || Math.hypot(x - roadX(4), s - 4) < 9 + size * 2) continue; // nothing looms over the first step
    const wide = size * (.9 + rand() * .6); stand(rock(rand, size > 1.8 ? 2 : 1, stone).scale(wide, size * (.6 + rand() * .5), size * (.9 + rand() * .6)), x, s, rand() * 6.3, -size * .15); if (size > 1.8) stand(scree(rand, wide * 2.4, stone, sand), x, s); if (size > .8) blocks.push([x, s, size * .85]);
  }
  for (let i = 0; i < (small ? 130 : 380); i++) { // pebbles, thickest around the camp
    const close = i % 3 === 0, s = close ? FIRE_S - 24 + rand() * 50 : -20 + rand() * 270, x = close ? fireX - 20 + rand() * 40 : roadX(s) + (rand() - .5) * 60, size = .05 + rand() * rand() * .2;
    stand(rock(rand, 0, stone).scale(size * (1 + rand() * .6), size * .7, size * (1 + rand() * .6)), x, s, rand() * 6.3, -size * .4);
  }

  // ---------- umbrella thorn trees, bushes and dead wood ----------
  const forest = buildForest(kit, setting.wind);
  for (const [dx, ds, height] of [[5.4, 9.2, 6.6], [-10, -9, 5.6], [-14, 15, 7.4]] as const) forest.plant("acacia", fireX + dx, FIRE_S + ds, height); // the three that frame the camp
  for (let i = 0; i < (small ? 6 : 12); i++) { const s = 70 + rand() * 165, side = rand() < .5 ? -1 : 1, off = 7 + rand() * 30, x = roadX(s) + side * off; if (clear(x, s, 1)) forest.plant("acacia", x, s, 3.8 + rand() * 3.2, 1 - (off - 7) / 60); }
  for (let i = 0; i < (small ? 26 : 70); i++) {
    const close = i % 2 === 0, s = close ? FIRE_S - 28 + rand() * 62 : -20 + rand() * 260, x = close ? fireX - 26 + rand() * 52 : roadX(s) + (rand() - .5) * 90, r = .45 + rand() * .65;
    if (Math.abs(x - roadX(s)) < 2.4 || !clear(x, s, r + 1.2)) continue;
    forest.plant(i % 5 === 4 ? "deadbush" : "bush", x, s, r);
  }

  // ---------- the seed basket and the first village ----------
  const basketX = roadX(SOW_S) + 2.2;
  { const wicker: Paint = (center) => tone.set((Math.floor(center.y * 14) + Math.floor(Math.atan2(center.z, center.x) * 5)) % 2 ? "#8a6a3c" : "#5f4827");
    stand(merged([turned([[0, 0], [.36, 0], [.47, .2], [.55, .45], [.58, .6], [.61, .62]], 14, wicker), blob(rand, [.54, .16, .54], lit("#b98d35", "#e2b955", rand, .3), 1, .2, 0).translate(0, .5, 0)]), basketX, SOW_S, 0, -.02); }

  const village = buildVillage(kit, camp.flame, forest.plant), fields = buildFields(kit, forest.plant); forest.finish();

  // ---------- the stone: 1 : 4 : 9, facing the walker, the sun behind it ----------
  const monolith = new THREE.Mesh(own(new THREE.BoxGeometry(8.8, 19.8, 2.2)), own(new THREE.MeshStandardMaterial({ color: "#050608", roughness: .22, metalness: .2 })));
  monolith.position.set(stoneX, floor(stoneX, -MONO_S) + 9.6, -MONO_S); monolith.castShadow = true; scene.add(monolith);
  { const c = document.createElement("canvas"); c.width = 1024; c.height = 64; const g = c.getContext("2d")!; g.fillStyle = "rgba(214,168,92,.82)"; g.font = "30px ui-monospace, Menlo, monospace"; g.textAlign = "center"; g.fillText("1 : 4 : 9  ·  TMA-0  ·  RAISED BY US", 512, 42);
    const map = own(new THREE.CanvasTexture(c)); map.colorSpace = THREE.SRGBColorSpace;
    const label = new THREE.Mesh(own(new THREE.PlaneGeometry(6.4, .4)), own(new THREE.MeshBasicMaterial({ map, transparent: true, fog: false }))); label.position.set(0, -8.2, 1.11); monolith.add(label); }

  for (const shapes of stretches.values()) { const mesh = new THREE.Mesh(own(merged(shapes)), matte); mesh.castShadow = mesh.receiveShadow = true; scene.add(mesh); }
  return { ...camp, village, basketX, blocks, fields };
}
