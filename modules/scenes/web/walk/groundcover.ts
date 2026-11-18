import * as THREE from "three";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Kit } from "./camp.ts";
import { FIRE_S, ROAD, noise, roadX } from "./land.ts";

const ROAD_GLSL = (s: string) => `(${ROAD.a1.toFixed(1)} * sin((${s}) * ${ROAD.f1}) + ${ROAD.a2.toFixed(1)} * sin((${s}) * ${ROAD.f2} + ${ROAD.p2}))`;

// The bare ground up close: sandy soil in large and small patches, a fine grain, dried pans with hairline cracks, ash round the hearth, furrows where it is tilled and damp soil by water,
// all drawn in the fragment shader; and the twigs, leaves and small stones that lie about the camp, under trees and along the road.

const HEAD = `varying vec4 vSoil; varying vec3 vSpot; uniform vec2 hearth;
  float soilHash(vec2 p){ vec3 q = fract(vec3(p.xyx) * .1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
  float soilNoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
    return mix(mix(soilHash(i), soilHash(i + vec2(1., 0.)), f.x), mix(soilHash(i + vec2(0., 1.)), soilHash(i + vec2(1., 1.)), f.x), f.y); }
  vec3 soilCells(vec2 p){ vec2 i = floor(p), f = fract(p); float a = 8., b = 8., id = 0.; // nearest and second nearest point, and the nearest one's number
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) { vec2 g = vec2(x, y), o = vec2(soilHash(i + g), soilHash(i + g + 17.3)); float d = length(g + o - f);
      if (d < a) { b = a; a = d; id = soilHash(i + g + 3.1); } else if (d < b) b = d; }
    return vec3(a, b, id); }
`;
// `relief` is a height in metres for the normal; every layer fades out before it is finer than a pixel. Colours are linear.
const COLOR = `float relief = 0.;
  { vec2 q = vSpot.xz; float px = length(fwidth(q)), far = length(vViewPosition), packed = vSoil.x, damp = vSoil.y, till = vSoil.z, cover = vSoil.w;
    float fine = 1. - smoothstep(.004, .02, px), grain = 1. - smoothstep(.01, .05, px), fromHearth = distance(q, hearth), close = 2. - smoothstep(3., 8., far); // detail twice as strong within a few metres, where soft light flattens it
    vec3 c = diffuseColor.rgb;
    // large patches, 8 to 30 m: red iron soil, pale dust, darker organic ground under trees and in the grass
    float iron = smoothstep(.45, .75, soilNoise(q * .045 + 7.)), dust = smoothstep(.5, .8, soilNoise(q * .07 + 31.)) * (1. - damp) * (1. - till);
    c *= mix(vec3(1.), vec3(1.12, .92, .78), iron * .6);
    c = mix(c, vec3(dot(c, vec3(.3, .59, .11))) * vec3(1.15, 1.08, .95) + .025, dust * .45);
    c *= 1. - max(cover, smoothstep(.62, .85, soilNoise(q * .05 + 63.)) * .5) * .32;
    c = mix(c, mix(vec3(.2, .155, .085), vec3(.12, .13, .065), smoothstep(150., 255., -q.y)), cover * smoothstep(25., 70., far) * .6); // far off, the grass is a tone of the ground, not single tufts
    // mottling, half a metre to two
    c *= 1. + .14 * close * (soilNoise(q * .8) * 1. + soilNoise(q * 1.9 + 5.) * .7 + soilNoise(q * 4.1) * .3 - 1.);
    // sand: a fine grain in colour and in the light, and a rare darker or paler grain of grit
    float sand = (soilNoise(q * 140.) - .5) * fine + (soilNoise(q * 47.) - .5) * grain * .7, speck = soilHash(floor(q * 60.));
    c *= (1. + sand * .3 * close) * (1. + fine * (step(.975, speck) * .22 - step(speck, .02) * .28)); relief += sand * .0012 * close;
    // the road: a trodden footpath, then two cart ruts with a dusty crown from the village on; dusty and damp stretches, scuffs, and small stones bedded mostly at its edges
    { float s = -q.y, off = q.x - ${ROAD_GLSL("s")}, wide = mix(mix(.85, 1.2, smoothstep(455., 485., s)), 1.25, smoothstep(545., 575., s)) * (.92 + .18 * soilNoise(vec2(s * .7, 3.)));
      float u = off / wide, onRoad = 1. - smoothstep(.75, 1.25, abs(u) + (soilNoise(q * 2.3) - .5) * .35);
      if (onRoad > .01) { float cart = smoothstep(315., 345., s), lane = smoothstep(545., 575., s);
        float trod = (1. - smoothstep(.15, .45, abs(u))) * (1. - cart), rut = (1. - smoothstep(.06, .16, abs(abs(u) - .5))) * cart * (1. - lane * .5), crown = (1. - smoothstep(.2, .38, abs(u))) * cart;
        float dusty = smoothstep(.55, .8, soilNoise(vec2(s * .12, off * .4) + 11.)), wet = smoothstep(.7, .9, soilNoise(vec2(s * .08, off * .3) + 23.)) * .7;
        c *= 1. - onRoad * (trod * .14 + rut * .22 + wet * .25);
        c = mix(c, vec3(dot(c, vec3(.3, .59, .11))) * vec3(1.12, 1.06, .95) + .03, onRoad * (crown * .35 + dusty * .3) * (1. - wet));
        float scuff = (soilNoise(vec2(off * 14., s * 5.)) - .5) * grain; // prints of feet and hooves, drawn out along the road
        c *= 1. + onRoad * scuff * .15; relief += onRoad * (scuff * .004 * (trod + rut + .3) - trod * .012 - rut * .03 + crown * .006);
        #ifndef SOIL_LITE
        float gf = (1. - smoothstep(.01, .04, px)) * onRoad;
        if (gf > 0.) { vec3 k = soilCells(q * 9.); float at = min(1., smoothstep(.35, .95, abs(u)) + lane * .6);
          float r = .2 + .25 * fract(k.z * 7.1), outline = r * (.8 + .4 * soilNoise(q * 40.)), stone = step(1. - .45 * at * smoothstep(.3, .7, soilNoise(q * 1.7 + 5.)), k.z) * (1. - smoothstep(outline * .75, outline, k.x)) * gf;
          c = mix(c, c * (.75 + .5 * fract(k.z * 13.7)) * vec3(.95, .97, 1.02), stone * .8); relief += stone * .004; }
        #endif
      } }
    // dried pans, about one part in eight of the open ground: paler, with hairline cracks near the eye
    float pan = smoothstep(.62, .74, soilNoise(q * .05 + 101.) * .7 + soilNoise(q * .23 + 3.) * .3) * (1. - damp) * (1. - till) * mix(1., .12, packed) * smoothstep(4.5, 7., fromHearth);
    c *= 1. + pan * vec3(.07, .04, 0.);
    #ifndef SOIL_LITE
    float cf = pan * (1. - smoothstep(7., 12., far));
    if (cf > .001) { float size = mix(1.2, 3.4, soilNoise(q * .3 + 17.)); // cells per metre, changing across a pan
      vec3 k = soilCells(q * size + (vec2(soilNoise(q * 3.1), soilNoise(q * 3.1 + 9.)) - .5) * .6);
      float width = .01 + .025 * soilNoise(q * 9. + 4.), crack = (1. - smoothstep(width * .3, width, k.y - k.x)) * cf * smoothstep(.25, .5, soilNoise(q * 1.7 + 2.)); // broken lines of uneven width
      crack *= min(1., width / size * 2. / max(px, 1e-4)); // never thinner than a pixel can hold
      c *= 1. - crack * .45; relief -= crack * .002; }
    #endif
    // tilled ground: darker, furrowed along the sown rows 0.92 m apart, with clods
    if (till > .01) { float road = ${ROAD_GLSL("-q.y")}, ridge = cos((q.x - road) * 6.8295), clod = soilNoise(q * vec2(9., 5.));
      c *= mix(1., .7 + .12 * ridge + .14 * clod, till); relief += till * (ridge * .02 + clod * .008) * (1. - smoothstep(.04, .2, px)); }
    // the hearth: trodden ash fading out over four metres, flecked with charcoal
    if (fromHearth < 5.) { float ash = 1. - smoothstep(1.2, 4.2, fromHearth + (soilNoise(q * 1.3) - .5) * .9);
      c = mix(c, vec3(.13, .125, .118) * (.75 + .5 * soilNoise(q * 6.)), ash * .6);
      vec3 k = soilCells(q * 16.); c = mix(c, vec3(.015), step(.88, k.z) * (1. - smoothstep(.12, .3, k.x)) * (1. - smoothstep(.6, 3.2, fromHearth)) * grain * .9); }
    diffuseColor.rgb = c * (1. - damp * .3);
    #ifdef SOIL_RIBBON
    diffuseColor.a = smoothstep(.15, .6, diffuseColor.a + (soilNoise(q * 2.3) * .7 + soilNoise(q * 9.) * .3 - .5) * .7); // a ragged edge, the grass creeping in
    #endif
  }
`;
const NORMAL = `{ vec3 dx = dFdx(-vViewPosition), dy = dFdy(-vViewPosition), r1 = cross(dy, normal), r2 = cross(normal, dx);
  float det = dot(dx, r1); vec2 dh = vec2(dFdx(relief), dFdy(relief)) * (1. - smoothstep(10., 30., length(vViewPosition)));
  if (abs(det) > 1e-12) normal = normalize(abs(det) * normal - sign(det) * (dh.x * r1 + dh.y * r2)); }
`;

/** Turns a standard material into bare ground. The geometry carries `soil`: [packed, damp, tilled, cover], each 0 to 1; `hearth` is the fire's (x, z), for the ash round it; `ribbon` frays the edge of a see-through road laid over the ground. */
export function soil(material: THREE.MeshStandardMaterial, small: boolean, hearth = new THREE.Vector2(1e5, 1e5), ribbon = false) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.hearth = { value: hearth };
    shader.vertexShader = "attribute vec4 soil; varying vec4 vSoil; varying vec3 vSpot;\n" + shader.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\nvSoil = soil; vSpot = (modelMatrix * vec4(transformed, 1.)).xyz;");
    shader.fragmentShader = (small ? "#define SOIL_LITE\n" : "") + (ribbon ? "#define SOIL_RIBBON\n" : "") + HEAD + shader.fragmentShader
      .replace("#include <color_fragment>", `#include <color_fragment>\n${COLOR}`)
      .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor = mix(.97, .82, vSoil.y);") // matte, a little less where damp; the firelight makes no highlight
      .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>\n${NORMAL}`);
  };
  material.customProgramCacheKey = () => `soil-${small}-${ribbon}`;
  return material;
}

/** Twigs and dry leaves thick around the camp and at the foot of every tree and stone in the night country; small stones sunk in clusters along the road's edges and by the boulders. */
export function buildLitter({ scene, own, rand, small, floor, blocks, fireX }: Pick<Kit, "scene" | "own" | "rand" | "small" | "floor" | "blocks" | "fireX">) {
  const twig = new THREE.BufferGeometry(), stone = mergeVertices(new THREE.IcosahedronGeometry(1, 1).deleteAttribute("normal").deleteAttribute("uv")), leaf = new THREE.BufferGeometry();
  { const positions: number[] = [], index: number[] = [], spine = [[0, 0, 0], [.33, .02, .07], [.67, .01, .03], [1, -.01, .11]] as const; // a stick one unit long, crooked twice, four-sided, thinning to its tip
    spine.forEach(([x, y, z], k) => { const r = .03 * (1 - k * .18); for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + .6; positions.push(x, y + Math.sin(a) * r, z + Math.cos(a) * r); } });
    for (let k = 0; k < 3; k++) for (let i = 0; i < 4; i++) { const a = k * 4 + i, b = k * 4 + (i + 1) % 4; index.push(a, b + 4, b, a, a + 4, b + 4); } // wound to face outward
    twig.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3)); twig.setIndex(index); twig.computeVertexNormals(); }
  { const p = stone.attributes.position!, v = new THREE.Vector3(); // a pebble, lumpy and flat underneath
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).multiplyScalar(.8 + noise(v.x * 1.9 + 4, v.y * 1.9 + v.z * 1.3) * .4); p.setXYZ(i, v.x, Math.max(v.y, -.3) + .3, v.z); }
    stone.computeVertexNormals(); }
  // a leaf about a unit long, folded along its midrib and curled at the tip
  leaf.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, .35, .12, -.22, .45, 0, 0, .35, .12, .22, 1, .14, 0, .7, .1, -.14, .7, .1, .14], 3));
  leaf.setIndex([2, 1, 0, 3, 2, 0, 5, 1, 2, 2, 3, 6, 4, 5, 2, 6, 4, 2]); leaf.computeVertexNormals();

  const scale = small ? .4 : 1, feet = blocks.filter(([x, s]) => s < 250 && Math.hypot(x - fireX, s - FIRE_S) > 2); // the trees, stones and sitters of the night country
  const around = (count: number, foot: number) => { // thinning out from the hearth, then a scatter round each foot
    const places: Array<[number, number]> = [];
    for (let i = 0; i < count * scale; i++) { const a = rand() * 6.283, r = 2 + Math.pow(rand(), 1.6) * 20; places.push([fireX + Math.cos(a) * r, FIRE_S + Math.sin(a) * r]); }
    for (const [x, s, r] of feet) for (let i = 0; i < foot * scale * (1 + r); i++) { const a = rand() * 6.283, d = r * .7 + rand() * rand() * 3; places.push([x + Math.cos(a) * d, s + Math.sin(a) * d]); }
    return places;
  };
  const clusters: Array<[number, number]> = []; // stones lie in clusters: on the road's shoulders, kicked aside, and round the boulders they broke from
  const cluster = (x: number, s: number, count: number, reach: number) => { for (let i = 0; i < count; i++) { const a = rand() * 6.283, d = reach * Math.sqrt(-Math.log(1 - rand() * .95)) * .6; clusters.push([x + Math.cos(a) * d, s + Math.sin(a) * d]); } };
  for (let i = 0; i < 70 * scale; i++) { const s = -20 + rand() * 272, side = rand() < .5 ? -1 : 1; cluster(roadX(s) + side * (1.1 + rand() * 1.6), s, 4 + Math.floor(rand() * rand() * 14), .3 + rand() * .7); }
  for (const [x, s, r] of feet) if (r > .6 && rand() < .8) { const a = rand() * 6.283; cluster(x + Math.cos(a) * (r + .4), s + Math.sin(a) * (r + .4), Math.round((5 + rand() * 12) * scale), .5 + r * .4); }
  for (let i = 0; i < 10 * scale; i++) { const a = rand() * 6.283, r = 3 + rand() * 12; cluster(fireX + Math.cos(a) * r, FIRE_S + Math.sin(a) * r, 3 + Math.floor(rand() * 6), .4); }
  const twigs: Array<[number, number]> = []; // a third of what there was: mostly by the woodpile and under trees, a few on the camp floor
  for (let i = 0; i < 35 * scale; i++) { const a = rand() * 6.283, r = .5 + rand() * rand() * 2; twigs.push([fireX - 1.5 + Math.cos(a) * r, FIRE_S + 2.7 + Math.sin(a) * r]); }
  for (const [x, s, r] of feet) if (r < 1.3) for (let i = 0; i < 3 * scale; i++) { const a = rand() * 6.283, d = r + rand() * 2.2; twigs.push([x + Math.cos(a) * d, s + Math.sin(a) * d]); }
  for (let i = 0; i < 15 * scale; i++) { const a = rand() * 6.283, r = 3 + rand() * 12; twigs.push([fireX + Math.cos(a) * r, FIRE_S + Math.sin(a) * r]); }
  const kinds = [
    { shape: twig, side: THREE.FrontSide, places: twigs, colors: ["#7a6d5c", "#8c7f6c", "#6a5f51", "#958670"], size: (pose: THREE.Object3D) => { // grey-brown, of mixed length, some half sunk
      const l = .07 + Math.pow(rand(), 1.8) * .33; pose.scale.set(l, l, rand() < .5 ? l : -l); pose.rotation.set(0, rand() * 6.3, (rand() - .5) * .12); return .03 * l * (rand() * .9 - .3); } },
    { shape: leaf, side: THREE.DoubleSide, places: around(1400, 12), colors: ["#8a6a3e", "#a5824c", "#6e5434", "#9b8f62", "#7d4c2c"], size: (pose: THREE.Object3D) => { pose.scale.setScalar(.035 + rand() * .045); pose.rotation.set((rand() - .5) * .5, rand() * 6.3, (rand() - .5) * .5); return .004; } },
    { shape: stone, side: THREE.FrontSide, places: clusters, colors: ["#7a6753", "#8a7864", "#665a4c", "#94826b", "#7c7062"], size: (pose: THREE.Object3D) => { // earth-coloured and half buried
      const k = .012 + Math.pow(rand(), 2.5) * .09; pose.scale.set(k * (1 + rand() * .6), k * (.6 + rand() * .4), k * (1 + rand() * .6)); pose.rotation.set((rand() - .5) * .4, rand() * 6.3, (rand() - .5) * .4); return -k * (.35 + rand() * .3); } },
  ];
  // under each stone a soft dark disc laid on the ground, gone at its rim: it only darkens, a contact shadow about the stone's own size
  const skirt = new THREE.BufferGeometry(), rings = [[0, .05, .045, .04, .45], [.9, .05, .045, .04, .25], [1.25, .05, .045, .04, .08], [1.8, .05, .045, .04, 0]] as const, positions: number[] = [], colors: number[] = [], index: number[] = [];
  for (const [r, ...rgba] of rings) for (let i = 0; i < 10; i++) { const a = i / 10 * 6.283; positions.push(Math.cos(a) * r, 0, Math.sin(a) * r); colors.push(...rgba); }
  for (let ring = 0; ring < rings.length - 1; ring++) for (let i = 0; i < 10; i++) { const a = ring * 10 + i, b = ring * 10 + (i + 1) % 10; index.push(a, b, b + 10, a, b + 10, a + 10); }
  skirt.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3)).setAttribute("color", new THREE.Float32BufferAttribute(colors, 4)).setIndex(index); skirt.computeVertexNormals();
  const skirts = new THREE.InstancedMesh(own(skirt), own(new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, depthWrite: false, roughness: 1, metalness: 0, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 })), clusters.length);
  const pose = new THREE.Object3D(), tint = new THREE.Color(), flat = new THREE.Object3D();
  for (const { shape, side, places, colors, size } of kinds) {
    const mesh = new THREE.InstancedMesh(own(shape), own(new THREE.MeshStandardMaterial({ roughness: .92, metalness: 0, side })), places.length);
    places.forEach(([x, s], i) => {
      const lift = size(pose), y = floor(x, -s); pose.position.set(x, y + lift, -s); pose.updateMatrix(); mesh.setMatrixAt(i, pose.matrix);
      mesh.setColorAt(i, tint.set(colors[Math.floor(rand() * colors.length)]!).multiplyScalar(.8 + rand() * .3));
      if (shape === stone) { // none by the fire, where the ash in the soil grounds things
        const by = Math.hypot(x - fireX, s - FIRE_S) > 2.5 ? 1 : 0; flat.position.set(x, y + .004, -s); flat.rotation.set(0, pose.rotation.y, 0); flat.scale.set(pose.scale.x * by, 1, pose.scale.z * by); flat.updateMatrix(); skirts.setMatrixAt(i, flat.matrix); }
    });
    mesh.receiveShadow = true; mesh.computeBoundingSphere(); scene.add(mesh); own(mesh);
  }
  skirts.renderOrder = -1; skirts.computeBoundingSphere(); scene.add(skirts); own(skirts);
}
