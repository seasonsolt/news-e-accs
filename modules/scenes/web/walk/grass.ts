import * as THREE from "three";
import type { Kit } from "./camp.ts";
import { END_S, FIELD_S, FIRE_S, cropCover, fbm, noise, roadX, sequence, smooth } from "./land.ts";

// Savanna grass in the night country, s -25 to 275, and the tall grass on the field verges.
// A clump is up to 64 thin blades bent in the vertex shader, under a sparse stubble; the material stays a standard one, so the sun, moon and fire, their shadows, the sky's light and the fog all reach it.

const BLADES = 64, CHUNK = 16, CLOSE = 14; // chunks nearer than CLOSE draw blades of three quads and a tip, the rest one quad and a tip
const NEAR = { rows: [0, .35, .65, .88], indices: 21 }, FAR = { rows: [0, .5], indices: 9 };
const LOD = { wide: [24, 95, 170], small: [10, 45, 110] } as const; // every blade up to the first distance, an eighth of them at the second, none past the third or the fog
const GOLD = new THREE.Color("#9a8350"), GREY = new THREE.Color("#72765e"), DEAD = new THREE.Color("#665341"), OLIVE = new THREE.Color("#66733c"); // dry grass is about as dark as the wheat, not much paler than the soil

type Setting = Pick<Kit, "floor" | "blocks" | "fireX" | "small">;
/** How thickly grass grows at a point, 0 to 1: stands and bare ground from a slow noise, thick along the road's shoulders and round stones and trees, none on the road or in the trodden camp.
 *  Past the night country only a band of stubble along the field road. */
export function grassCover(blocks: Kit["blocks"], fireX: number) {
  // Each cell keeps its whole neighbourhood once, instead of looking up nine string keys for every candidate blade.
  const near = new Map<number, Map<number, Kit["blocks"]>>();
  for (const block of blocks) if (block[1] < 290) {
    const cx = Math.floor(block[0] / 8), cs = Math.floor(block[1] / 8);
    for (let x = cx - 1; x <= cx + 1; x++) {
      if (!near.has(x)) near.set(x, new Map());
      const column = near.get(x)!;
      for (let s = cs - 1; s <= cs + 1; s++) {
        if (!column.has(s)) column.set(s, []);
        column.get(s)!.push(block);
      }
    }
  }
  /** Returns -1 inside a stone or trunk. */
  return (x: number, s: number) => {
    const d = Math.abs(x - roadX(s)), camp = Math.hypot(x - fireX - 1.5, s - FIRE_S - 1);
    const ragged = d + (noise(x * 1.3, s * 1.3) - .5) * .8; // the grass creeps in on the road's edge unevenly
    if (s > FIELD_S) return cropCover(x - roadX(s), s) * smooth(.95, 1.4, ragged) * (1 - smooth(1.5, 2, d)) * .7;
    let foot = 0;
    for (const [bx, bs, r] of near.get(Math.floor(x / 8))?.get(Math.floor(s / 8)) ?? []) {
      const gap = Math.hypot(x - bx, s - bs); if (gap < r * .8) return -1; foot = Math.max(foot, 1 - smooth(r, r + 2.6, gap));
    }
    const road = smooth(1, 1.7, ragged), trodden = smooth(5, 8.5, camp);
    if (road === 0 || trodden === 0) return 0;
    const stand = smooth(.4, .6, fbm(x * .03 + 3, s * .03)) * (.6 + .4 * noise(x * .25, s * .25)), shoulder = smooth(1.3, 1.9, d) * (1 - smooth(2.6, 5, d));
    return Math.max(stand, shoulder * .85, foot * .9) * road * trodden;
  };
}

/** Where the clumps grow, four floats each: root [x, y, z, seed], form [height, spread, share of the 64 blades drawn, share carrying seed heads], tone [r, g, b, dryness].
 *  `verge` adds the tall grass along the field road: [x, s, size]. */
export function plantGrass({ floor, blocks, fireX, small }: Setting, verge: ReadonlyArray<readonly [number, number, number]> = []) {
  const rand = sequence(31), root: number[] = [], form: number[] = [], tone: number[] = [], c = new THREE.Color(), cover = grassCover(blocks, fireX);
  const add = (x: number, s: number, f: [number, number, number, number], dry: number) => { root.push(x, floor(x, -s) - .02, -s, rand() * 64); form.push(...f); tone.push(c.r, c.g, c.b, dry); };
  const paint = (s: number, x: number) => { // straw gold, grey-green or dead brown, greener toward the first field
    const green = smooth(150, 255, s) * (.4 + .6 * noise(x * .08 + 5, s * .08)), pick = rand();
    c.copy(GOLD).lerp(pick < .25 ? GREY : pick > .82 ? DEAD : GOLD, .4 + rand() * .6).lerp(OLIVE, green * .8).multiplyScalar(.8 + rand() * .35);
    return 1 - green * .7;
  };
  for (const [step, under] of [[small ? .85 : .62, false], [small ? .7 : .5, true]] as const) // the clumps, then a short sparse stubble between them
    for (let row = -25; row < (under ? END_S : FIELD_S); row += step) {
      // Past the night country grassCover only allows stubble along the road's shoulders (1 < d < 2), so skip the wide field.
      const span = under && row > FIELD_S + 2 ? 2.6 : 62;
      for (let off = -span; off < span; off += step) {
        const s = row + (rand() - .5) * step, x = roadX(s) + off + (rand() - .5) * step, here = cover(x, s);
        if (here <= 0 || rand() > (under ? .25 + here * .5 : (small ? here * .62 : here * .8))) continue;
        const grazed = .65 + .35 * smooth(8, 26, Math.hypot(x - fireX, s - FIRE_S)), dry = paint(s, x);
        if (under) { add(x, s, [.05 + rand() * .07, .16 + rand() * .14, .2 + rand() * .1, 0], dry); continue; }
        const h = .15 * Math.pow(1.1 / .15, Math.pow(rand(), 1.9 - here * .9)) * grazed; // 0.15 to 1.1 m, mostly short, taller where it grows thick
        add(x, s, [h, .04 + h * .12, .35 + .65 * smooth(.15, .8, h), h > .5 ? .12 + rand() * .2 : 0], dry);
      }
    }
  for (const [x, s, size] of verge) { // tall verge grass: pale, seeding, of mixed heights
    c.set(rand() < .5 ? "#8f7c4c" : "#7b7f4a").multiplyScalar(.85 + rand() * .25); // dry straw and green-gold, in the wheat's range
    add(x, s, [size * (.45 + rand() * .55), .08 + rand() * .06, .8 + rand() * .2, .3 + rand() * .2], .6);
  }
  return { root, form, tone, count: root.length / 4 };
}

/** The grass, in square chunks so the ones out of sight are not drawn; `frame` thins the far ones and swaps in simpler blades. */
export function buildGrass({ scene, own, still, ...setting }: Setting & Pick<Kit, "scene" | "own" | "still">, verge: ReadonlyArray<readonly [number, number, number]> = []) {
  const { small } = setting, rand = sequence(53), seeds = Array.from({ length: BLADES }, () => [rand(), rand(), rand(), rand()]);
  const blades = [NEAR, FAR].map(({ rows }) => { // one clump's blades; z is the blade's rank, so the far chunks draw only the first few
    const position: number[] = [], seed: number[] = [], index: number[] = [], per = rows.length * 2 + 1;
    seeds.forEach((r, i) => {
      for (const t of rows) for (const side of [-1, 1]) { position.push(side, t, i / BLADES); seed.push(...r!); }
      position.push(0, 1, i / BLADES); seed.push(...r!);
      const base = i * per; for (let row = 0; row < rows.length - 1; row++) { const a = base + row * 2; index.push(a, a + 1, a + 3, a, a + 3, a + 2); }
      index.push(base + per - 3, base + per - 2, base + per - 1);
    });
    return { position: new THREE.Float32BufferAttribute(position, 3), seed: new THREE.Float32BufferAttribute(seed, 4), index: new THREE.Uint16BufferAttribute(index, 1) };
  });
  const [full, thin, end] = small ? LOD.small : LOD.wide;
  const uniforms = { time: { value: 0 }, wind: { value: still ? .25 : 1 }, lod: { value: new THREE.Vector3(full, thin, end) }, pixel: { value: .001 } };

  const material = own(new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: .6, metalness: 0 }));
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = "attribute vec4 seed, root, form, tone; uniform float time, wind, pixel; uniform vec3 lod; varying vec4 vBlade, vTone, vFar; varying vec3 vFace;\n" + shader.vertexShader
      .replace("#include <beginnormal_vertex>", `
        float t = position.y, side = position.x, n0 = fract(root.w * 17.31 + seed.x * 3.7);
        float ang = fract(seed.x + root.w * 5.17) * 6.2832, rad = sqrt(fract(seed.y + root.w * 3.31)) * form.y, edge = rad / max(form.y, .001);
        vec2 off = vec2(cos(ang), sin(ang)) * rad;
        float dist = distance(cameraPosition.xz, root.xz), gone = min(lod.z, max(14., form.x * 160.)); // short grass is gone sooner
        float keep = form.z * mix(1., .12, smoothstep(lod.x, lod.y, dist)) * (1. - smoothstep(gone * .75, gone, dist));
        float grow = clamp((keep - position.z) * ${BLADES}., 0., 1.); // the last blade kept fades in and out instead of popping
        float dead = step(fract(seed.w * 5.1 + root.w * .37), .28) * step(.2, form.x); // a quarter of a big clump is last year's blades, lying in a mat round its foot
        float head = step(1. - form.w, fract(seed.z * 7.7 + root.w * 2.9)) * (1. - dead), twist = fract(seed.w + root.w * 4.3) - .5;
        float h = form.x * (.45 + .55 * fract(seed.z + root.w * 1.7)) * (1. + head * .25) * mix(1., .4, dead) * grow;
        vec2 lean = normalize(off + vec2(cos(ang * 3. + twist * 9.), sin(ang * 3. + twist * 9.)) * form.y * .6 + 1e-5); // mostly outward from the clump's heart
        float tilt = mix((.05 + .25 * n0 + .3 * edge) * (1. - head * .7), 1.05 + .4 * n0, dead);
        float curl = (.5 + 1.7 * fract(seed.w * 3.1 + root.w)) * (.5 + edge) * (1. - head * .7) * (1. - dead * .8); // long blades arch over and droop at the tip
        // wind: a gust rolling across the land, a slow sway across it, and the tallest blades catching most
        vec2 wdir = vec2(.94, .33), cross2 = vec2(-.33, .94);
        float gust = .5 + .5 * sin(dot(root.xz, wdir) * .07 - time * 1.25 + sin(dot(root.xz, cross2) * .045 + time * .17) * 2.); gust *= gust;
        vec2 push = (wdir * (.1 + .6 * gust) + cross2 * sin(time * .8 + n0 * 9.) * .07) * wind * (.3 + h) * (1. - dead * .8);
        // the blade bends from the root along an arc whose angle grows steadily from tilt to tip, so its length holds whatever the wind does
        vec2 bend = lean * tilt + lean * curl + push, e = length(bend) > 1e-4 ? normalize(bend) : lean;
        float a = dot(lean * tilt, e), b = min(dot(lean * curl + push, e), 2.7 - a), th = a + b * t, X, Y;
        if (abs(b) < 1e-3) { X = t * sin(a); Y = t * cos(a); } else { X = (cos(a) - cos(th)) / b; Y = (sin(th) - sin(a)) / b; }
        vec3 tangent = vec3(e.x * sin(th), cos(th), e.y * sin(th));
        float tw = twist * 1.2 + t * twist * 1.5, cw = cos(tw), sw = sin(tw);
        vec3 across = vec3(-lean.y * cw - lean.x * sw, 0., -lean.y * sw + lean.x * cw);
        across = normalize(across - tangent * dot(across, tangent));
        float w0 = (.0022 + .003 * fract(seed.y * 5.3 + root.w)) * (.8 + form.x * .5) * clamp(inversesqrt(max(keep / max(form.z, .01), .02)), 1., 2.8); // far blades widen as they thin out
        float w = head > .5 ? (t > .7 ? .008 + .004 * n0 : w0 * .45) : w0 * (1. - t * t * .8);
        w = max(w, (dist + 1.) * pixel * .7 * (1. - t * .6)); // never much under a pixel, so blades do not shimmer
        vec3 face = normalize(cross(across, tangent));
        vec3 bladePos = vec3(root.x + off.x, root.y, root.z + off.y) + vec3(e.x * X, Y, e.y * X) * h + across * side * w * .5 + face * sin(time * 6.3 + n0 * 40. + root.x) * .01 * t * t * h * wind;
        if (grow <= 0.) bladePos = root.xyz; // a dropped blade folds to a point
        vec3 objectNormal = normalize(face + across * side * .55 + vec3(0., .35, 0.)); // curved across its width, and turned a little to the sky
        vFace = normalize(normalMatrix * face); vTone = vec4(tone.rgb, dead > .5 ? -1. : tone.a);
        vBlade = vec4(t, side, head * smoothstep(.62, .75, t), mix(.4, 1., edge));
        vFar = vec4(mix(vec3(.2, .155, .085), vec3(.12, .13, .065), smoothstep(150., 255., -root.z)), smoothstep(35., 100., dist) * .75); // far off a blade takes the tone the ground is tinted with there, so the hills do not glitter`)
      .replace("#include <begin_vertex>", "vec3 transformed = bladePos;");
    shader.fragmentShader = "varying vec4 vBlade, vTone, vFar; varying vec3 vFace;\n" + shader.fragmentShader
      .replace("#include <lights_physical_pars_fragment>", `#include <lights_physical_pars_fragment>
        // light coming through the blade: from its other face, and most when the viewer looks toward the light past it
        void RE_Direct_Grass(const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight) {
          RE_Direct_Physical(directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight);
          float through = saturate(-dot(geometryNormal, directLight.direction)) * .2 + pow(saturate(dot(geometryViewDir, -directLight.direction)), 6.) * .45;
          reflectedLight.directDiffuse += directLight.color * material.diffuseColor * vec3(1.1, 1.15, .8) * through * (.2 + .8 * vBlade.x) * (vTone.a < 0. ? .3 : 1. - .4 * vTone.a) * (1. - vFar.a); // dry straw lets less through
        }
        #undef RE_Direct
        #define RE_Direct RE_Direct_Grass`)
      .replace("#include <color_fragment>", `{ float t = vBlade.x, dry = max(vTone.a, 0.);
          vec3 c = vTone.rgb * (.9 + .18 * (1. - abs(vBlade.y))); // a paler midrib
          c = mix(c, vec3(.36, .3, .17), smoothstep(.35, 1., t) * (.3 + .6 * dry)); // drying to a paler tip
          c = mix(c, vec3(.2, .15, .1), vBlade.z * .75); // seed heads
          if (vTone.a < 0.) c = mix(vec3(.12, .095, .07), vec3(.3, .25, .19), t); // the dead mat, grey-brown
          c = mix(vec3(.14, .1, .07), c, smoothstep(0., .25, t)); // the soil's colour at the foot
          diffuseColor.rgb = mix(c * mix(.3, 1., smoothstep(0., .45, t)) * mix(vBlade.w, 1., smoothstep(0., .6, t)), vFar.rgb, vFar.a); }`) // dark and shut in at the root
      .replace("#include <normal_fragment_begin>", `#include <normal_fragment_begin>
        normal = normalize(vNormal); if (!gl_FrontFacing) normal = reflect(normal, normalize(vFace)); nonPerturbedNormal = normal;`); // the back face mirrors only the part across the blade, so it still leans to the sky
  };

  const plants = plantGrass(setting, verge), chunks = new Map<string, number[]>();
  for (let i = 0; i < plants.count; i++) { const k = `${Math.floor(plants.root[i * 4]! / CHUNK)},${Math.floor(plants.root[i * 4 + 2]! / CHUNK)}`; if (!chunks.has(k)) chunks.set(k, []); chunks.get(k)!.push(i); }
  const patches: Array<{ mesh: THREE.Mesh; shapes: THREE.InstancedBufferGeometry[]; x: number; z: number }> = [];
  for (const [k, members] of chunks) {
    const [cx, cz] = k.split(",").map(Number) as [number, number], x = (cx + .5) * CHUNK, z = (cz + .5) * CHUNK;
    let low = Infinity, high = -Infinity;
    for (const member of members) { const y = plants.root[member * 4 + 1]!; low = Math.min(low, y); high = Math.max(high, y); }
    const sphere = new THREE.Sphere(new THREE.Vector3(x, (low + high) / 2 + .6, z), CHUNK * .75 + (high - low) / 2 + 1.5);
    const attributes = (["root", "form", "tone"] as const).map((name) => {
      const data = new Float32Array(members.length * 4), source = plants[name];
      members.forEach((m, j) => { for (let c = 0; c < 4; c++) data[j * 4 + c] = source[m * 4 + c]!; });
      return [name, new THREE.InstancedBufferAttribute(data, 4)] as const;
    });
    const shapes = blades.map((blade) => { // the same clumps twice: fine blades for close by, plain ones for further off
      const g = own(new THREE.InstancedBufferGeometry()); g.setIndex(blade.index); g.setAttribute("position", blade.position); g.setAttribute("seed", blade.seed);
      for (const [name, attribute] of attributes) g.setAttribute(name, attribute);
      g.instanceCount = members.length; g.boundingSphere = sphere; return g;
    });
    const mesh = new THREE.Mesh(shapes[0], material); mesh.receiveShadow = true; mesh.matrixAutoUpdate = false; scene.add(mesh); patches.push({ mesh, shapes, x, z });
  }

  /** Sets the wind's clock and how much of each chunk to draw from where the eye is; nothing past the fog. `pixel` is the height of a pixel one metre from the eye. */
  function frame(clock: number, eye: THREE.Vector3, fogDensity: number, pixel: number) {
    uniforms.time.value = still ? 0 : clock; uniforms.pixel.value = pixel;
    const gone = Math.min(end, 2.1 / fogDensity); uniforms.lod.value.z = gone;
    for (const { mesh, shapes, x, z } of patches) {
      const d = Math.hypot(Math.max(0, Math.abs(eye.x - x) - CHUNK / 2), Math.max(0, Math.abs(eye.z - z) - CHUNK / 2)), keep = (1 - .88 * smooth(full, thin, d)) * (1 - smooth(gone * .75, gone, d));
      const close = d < CLOSE, shape = shapes[close ? 0 : 1]!; mesh.geometry = shape; mesh.visible = keep > 0;
      shape.setDrawRange(0, Math.min(BLADES, Math.ceil(keep * BLADES) + 1) * (close ? NEAR : FAR).indices);
    }
  }
  return { frame, cover: grassCover(setting.blocks, setting.fireX) };
}
