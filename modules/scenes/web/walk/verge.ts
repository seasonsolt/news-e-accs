import * as THREE from "three";
import type { ReliefScan } from "./relief.ts";
import type { Kit } from "./camp.ts";
import { CANAL, CLEARINGS, END_S, FIELD_S, MONO_S, VILLAGE, cleared, mix, noise, roadX, smooth } from "./land.ts";
import { soil } from "./groundcover.ts";
import { blob, flat, limb, merged, rock, triangles } from "./shapes.ts";

// The road through the fields and what grows beside it: a worn footpath that becomes a cart track and then a gravel lane, pebbles on it, and wildflowers and tall grass along its edges and the canal banks.

/** Half the road's width at a point: a footpath, then a cart track from s 470, then a lane from s 560. */
const roadHalf = (s: number) => mix(mix(.85, 1.2, smooth(455, 485, s)), 1.25, smooth(545, 575, s));

interface Wind { time: { value: number }; wind: { value: number } }
/** Everything here is built once; the flowers sway in the vertex shader with the same wind as the wheat. The tall grass is only placed here: `tallGrass` is [x, s, size] for grass.ts to grow. */
export function buildVerge({ scene, own, rand, small, floor, blocks }: Pick<Kit, "scene" | "own" | "rand" | "small" | "floor" | "blocks">, wind: Wind, trackScan: ReliefScan) {
  const stoneX = roadX(MONO_S), P = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z), c = new THREE.Color(), b = new THREE.Color();

  // ---------- the road: a ribbon laid just over the ground, its edges fading into the soil ----------
  { const ACROSS = 12, from = FIELD_S - 4, to = END_S + 8, step = .6, positions: number[] = [], colors: number[] = [], soils: number[] = [], index: number[] = [];
    const worn = new THREE.Color("#b49c76"), rut = new THREE.Color("#6e5a40"), grass = new THREE.Color("#8e8858"), gravel = new THREE.Color("#cbbfa6");
    let rows = 0;
    for (let s = from; s <= to; s += step, rows++) {
      const track = smooth(455, 485, s), lane = smooth(545, 575, s), half = roadHalf(s) * (.92 + noise(s * .7, 3) * .18), centre = roadX(s);
      for (let k = 0; k <= ACROSS; k++) {
        const u = k / ACROSS * 2 - 1, x = centre + u * half, scuff = noise(x * 2.3, s * 1.9), edge = Math.abs(u);
        c.copy(worn).multiplyScalar(.9 + scuff * .18); // one worn path, scuffed at its edges
        b.copy(c).lerp(rut, 1 - smooth(.08, .22, Math.abs(edge - .5))).lerp(grass, (1 - smooth(.07, .2, edge)) * smooth(.3, .62, noise(x * .9, s * .55))); // two ruts and a patchy strip of dry grass between them
        c.lerp(b, track); b.copy(gravel).multiplyScalar(.86 + noise(x * 5.1, s * 4.7) * .26); c.lerp(b, lane);
        const fade = (1 - smooth(mix(.5, .7, track), 1, edge + (scuff - .5) * .35)) * smooth(from, from + 6, s) * (1 - smooth(to - 8, to, s));
        positions.push(x, floor(x, -s) + .03, -s); colors.push(c.r, c.g, c.b, fade); soils.push(1 - lane * .4, 0, 0, 0); // packed earth, its grit and cracks matching the ground beside it
      }
    }
    for (let row = 0; row < rows - 1; row++) for (let k = 0; k < ACROSS; k++) { const a = row * (ACROSS + 1) + k, d = a + ACROSS + 1; index.push(a, a + 1, d + 1, a, d + 1, d); }
    const g = own(new THREE.BufferGeometry()); g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3)); g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 4)); g.setAttribute("soil", new THREE.Float32BufferAttribute(soils, 4)); g.setIndex(index); g.computeVertexNormals();
    const road = new THREE.Mesh(g, own(soil(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .95, metalness: 0, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }), trackScan, small, undefined, true)));
    road.receiveShadow = true; road.renderOrder = -2; scene.add(road); }

  // ---------- pebbles on the road, thickest on the gravel lane ----------
  { const pebbles = new THREE.InstancedMesh(own(rock(rand, 0, flat("#ffffff", rand, .2))), own(new THREE.MeshLambertMaterial({ vertexColors: true })), small ? 160 : 380), pose = new THREE.Object3D(), tint = new THREE.Color();
    for (let i = 0; i < pebbles.count; i++) {
      const s = rand() < .45 ? 548 + rand() * (END_S - 548) : FIELD_S + rand() * (END_S - FIELD_S), x = roadX(s) + (rand() - .5) * 2 * roadHalf(s) * .9, size = .025 + rand() * rand() * .09;
      pose.position.set(x, floor(x, -s) + .01, -s); pose.rotation.set(0, rand() * 6.3, 0); pose.scale.set(size * (1 + rand() * .6), size * .6, size); pose.updateMatrix(); pebbles.setMatrixAt(i, pose.matrix);
      pebbles.setColorAt(i, tint.set(rand() < .5 ? "#8d8478" : "#b3a68e").multiplyScalar(.8 + rand() * .3));
    }
    pebbles.receiveShadow = true; pebbles.computeBoundingSphere(); scene.add(pebbles); own(pebbles); }

  // ---------- wildflowers and tall grass ----------
  /** A flower on a thin green stem: `petals` flat petals around a heart, about two thirds of a unit tall. */
  function flower(petals: number, petal: string, heart: string, spread: number, cup: number) {
    const H = .67, petalPaint = flat(petal, rand, .1), parts = [limb(P(0, 0, 0), P(0, H, 0), .012, .009, flat("#6f9a3c", rand), { sides: 3 }), triangles([0, .24, 0, .12, .36, .04, .02, .32, .07], flat("#7aa444", rand))];
    for (let i = 0; i < petals; i++) {
      const a = i / petals * 6.283, w = Math.PI / petals * .8, at = (angle: number, r: number, lift: number) => [Math.cos(angle) * r, H + lift, Math.sin(angle) * r];
      parts.push(triangles([0, H, 0, ...at(a + w, spread * .6, cup * .6), ...at(a - w, spread * .6, cup * .6), ...at(a - w, spread * .6, cup * .6), ...at(a + w, spread * .6, cup * .6), ...at(a, spread, cup)], petalPaint));
    }
    parts.push(blob(rand, [spread * .28, spread * .2, spread * .28], flat(heart, rand, .1), 0, .1).translate(0, H + cup * .3, 0));
    return merged(parts);
  }
  const kinds = [
    { shape: flower(4, "#e8392b", "#1e1512", .17, .07), size: [.45, .7] }, // poppy: four red petals, cupped, a dark heart
    { shape: flower(6, "#4a6fe0", "#2a3a7a", .125, .02), size: [.4, .65] }, // cornflower
    { shape: flower(6, "#f1eee4", "#e5bf2a", .11, -.01), size: [.25, .45] }, // chamomile: white rays, a yellow heart
    { shape: null, size: [.65, 1.05] }, // tall grass, grown by grass.ts
  ];
  const spots: Array<Array<[number, number, number]>> = kinds.map(() => []), budget = small ? 2500 : 6000;
  const free = (x: number, s: number) => s > 262 && Math.hypot(x - stoneX, s - MONO_S) > 25 && Math.abs(x - roadX(s)) > roadHalf(s) + .1 && !(s > VILLAGE.from && s < VILLAGE.to && x - roadX(s) > 7 && x - roadX(s) < 31)
    && !Object.values(CLEARINGS).some(([cs, off, r]) => Math.hypot(x - roadX(cs) - off, s - cs) < r + .5) && blocks.every(([bx, bs, r]) => Math.hypot(x - bx, s - bs) > r + .2);
  let placed = 0;
  for (let drift = 0; drift < 4000 && placed < budget; drift++) { // drifts: one kind mostly, grown around a spot by the road, a little way into the wheat, or on a canal bank
    const where = rand(), along = 262 + rand() * (END_S - 262), side = rand() < .5 ? -1 : 1, canal = where > .82 && along > CANAL.from && along < CANAL.to;
    const offset = canal ? CANAL.offset + side * (1.4 + rand() * .7) : side * (roadHalf(along) + .6 + (where < .7 ? rand() * 1.4 : 1.4 + rand() * 3.5));
    const main = rand() < .45 ? 3 : Math.floor(rand() * 3), count = Math.min(budget - placed, 6 + Math.floor(rand() * rand() * 60)), length = 2 + rand() * 6, width = canal ? .4 : .5 + rand() * .9;
    for (let i = 0; i < count; i++) {
      const s = along + (rand() - .5) * length, x = roadX(s) + offset + (rand() + rand() - 1) * width, kind = rand() < .7 ? main : Math.floor(rand() * 4);
      if (!free(x, s) || (cleared(x, s) && !canal)) continue;
      const [low, high] = kinds[kind]!.size; spots[kind]!.push([x, s, low! + rand() * (high! - low!)]); placed++;
    }
  }
  const material = own(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  material.onBeforeCompile = (shader) => {
    shader.uniforms.time = wind.time; shader.uniforms.wind = wind.wind;
    shader.vertexShader = "uniform float time, wind;\n" + shader.vertexShader.replace("#include <begin_vertex>", `#include <begin_vertex>
      { vec3 home = instanceMatrix[3].xyz; float gust = sin(time * 1.5 + home.x * .31 + home.z * .27) * .6 + sin(time * .6 + home.z * .09 + home.x * .05) * .9; transformed.xz += vec2(1., .35) * gust * .12 * position.y * position.y * wind; }`);
  };
  const pose = new THREE.Object3D();
  kinds.forEach(({ shape }, kind) => {
    if (!shape) return;
    const here = spots[kind]!, mesh = new THREE.InstancedMesh(own(shape), material, here.length);
    for (const [i, [x, s, size]] of here.entries()) { pose.position.set(x, floor(x, -s) - .02, -s); pose.rotation.set((rand() - .5) * .2, rand() * 6.3, (rand() - .5) * .2); pose.scale.setScalar(size); pose.updateMatrix(); mesh.setMatrixAt(i, pose.matrix); }
    mesh.computeBoundingSphere(); scene.add(mesh); own(mesh);
  });
  return { flowers: placed, tallGrass: spots[3]! };
}
