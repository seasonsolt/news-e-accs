import * as THREE from "three";
import type { ReliefScan } from "./relief.ts";
import { buildCamp, type Kit } from "./camp.ts";
import { buildFields } from "./fields.ts";
import { FIRE_S, MONOLITH, MONO_S, SOW_S, roadX } from "./land.ts";
import { POSES, person } from "./people.ts";
import { buildMonolith } from "./monolith.ts";
import { blob, limb, lit, merged, of, rock, scree, turned, type Paint } from "./shapes.ts";
import { createMatte } from "./surface.ts";
import { buildForest, type Wind } from "./trees.ts";
import { buildVillage } from "./village.ts";

/** `wind` is the grass's wind, so the leaves move with it. */
type Setting = Pick<Kit, "scene" | "own" | "rand" | "small" | "still" | "out" | "floor" | "fireX"> & { stoneX: number; stoneScan: ReliefScan; wind?: Wind };

/** Everything that stands on the land: the camp, rocks, trees, the seed basket, the first village and the stone. */
export function buildProps(setting: Setting) {
  const { scene, own, rand, small, floor, fireX, stoneX } = setting;
  const matte = own(createMatte(setting.stoneScan, !small));
  // Scenery that never moves is gathered by stretch of road and drawn as one mesh per stretch.
  const stretches = new Map<number, THREE.BufferGeometry[]>(), blocks: Kit["blocks"] = [];
  const keep = (shape: THREE.BufferGeometry, s: number) => {
    const key = Math.floor(s / 90);
    if (!stretches.has(key)) stretches.set(key, []);
    stretches.get(key)!.push(shape);
  };
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

  // ---------- the seed basket, the first sower and the first village ----------
  const basketX = roadX(SOW_S) + 2.2, bark = of(2, lit("#3d3026", "#6b5644", rand));
  { const wicker: Paint = (center) => tone.set((Math.floor(center.y * 14) + Math.floor(Math.atan2(center.z, center.x) * 5)) % 2 ? "#8a6a3c" : "#5f4827");
    const clayLamp: Paint = () => tone.set("#9e5e38").multiplyScalar(.9 + rand() * .2);
    stand(merged([
      turned([[0, 0], [.36, 0], [.47, .2], [.55, .45], [.58, .6], [.61, .62]], 14, wicker),
      blob(rand, [.54, .16, .54], lit("#b98d35", "#e2b955", rand, .3), 1, .2, 0).translate(0, .5, 0),
      rock(rand, 1, stone).scale(.42, .32, .38).translate(-.82, -.05, -.28),
      limb(new THREE.Vector3(-.72, -.04, -.08), new THREE.Vector3(-.92, 1.18, -.32), .024, .016, bark, { sides: 5, capped: true }), // a digging stick leaned against a marker stone
      turned([[0, 0], [.12, 0], [.18, .08], [.16, .13]], 10, clayLamp).translate(-.48, .24, -.26),
    ]), basketX, SOW_S, 0, -.02);
    blocks.push([basketX, SOW_S, .68]);
    // Someone kneeling beside the basket at daybreak, Scratching the first furrow ahead of the seed.
    const sowerX = basketX + 1.15, sowerS = SOW_S + .55;
    stand(person(rand, POSES.kneel, { skin: "#84583c", cloth: "#bfa67a", small }), sowerX, sowerS, Math.atan2(roadX(SOW_S + 8) - sowerX, -8), -.01);
    blocks.push([sowerX, sowerS, .45]);
  }
  const sowLight = new THREE.PointLight(0xff9c4a, 5.5, 13, 2); sowLight.position.set(basketX - .48, floor(basketX, -SOW_S) + .55, -SOW_S + .26); scene.add(sowLight);

  const village = buildVillage(kit, camp.flame, forest.plant), fields = buildFields(kit, forest.plant); forest.finish();

  // ---------- the stone, facing the walker, the sun behind it ----------
  buildMonolith(setting, stoneX, floor(stoneX, -MONO_S), -MONO_S);
  blocks.push([stoneX, MONO_S, Math.hypot(MONOLITH.width, MONOLITH.depth) / 2]);
  // The figure at the edge of the wheat gives the slab the same human scale as the homepage plate.
  const walkerX = stoneX + 6.7, walkerS = MONO_S - 3.8;
  const walker = person(rand, { ...POSES.stand, look: [0, 2.7, 2.2] }, { cloth: "#b99b71", dress: "tunic", hat: "none", small: true });
  stand(walker, walkerX, walkerS, Math.atan2(stoneX - walkerX, walkerS - MONO_S));
  blocks.push([walkerX, walkerS, .36]);

  for (const shapes of stretches.values()) { const mesh = new THREE.Mesh(own(merged(shapes)), matte); mesh.castShadow = mesh.receiveShadow = true; scene.add(mesh); }
  return { ...camp, village, basketX, sowLight, blocks, fields };
}
