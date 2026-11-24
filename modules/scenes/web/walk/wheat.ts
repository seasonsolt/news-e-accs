import * as THREE from "three";
import { FIELD_S, MONOLITH, MONO_S, VILLAGE, cleared, cropCover, roadX, sequence, smooth } from "./land.ts";

type Disposable = { dispose(): void };
type Settings = {
  scene: THREE.Scene;
  own: <T extends Disposable>(item: T) => T;
  rand: () => number;
  floor: (x: number, z: number) => number;
  small: boolean;
  still: boolean;
  fireX: number;
  fireS: number;
  stoneX: number;
  sunDirection: THREE.Vector3;
  output: string;
};

/** Shared mesh for a rooted clump. Close ears carry individual grains and awns,
 * while the two distant forms retain the same stalks and drooping ear outlines. */
function plantGeometry(detail: number) {
  const positions: number[] = [], normals: number[] = [], parts: number[] = [], earOffsets: number[] = [];
  const earBase = new THREE.Vector3();
  const vertex = (p: THREE.Vector3, n: THREE.Vector3, part: number) => {
    positions.push(p.x, p.y, p.z); normals.push(n.x, n.y, n.z); parts.push(part);
    if (part === 2 || part === 3) earOffsets.push(p.x - earBase.x, p.y - earBase.y, p.z - earBase.z);
    else earOffsets.push(0, 0, 0);
  };
  const triangle = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, part: number) => {
    const n = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
    vertex(a, n, part); vertex(b, n, part); vertex(c, n, part);
  };
  const quad = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, part: number) => {
    triangle(a, b, c, part); triangle(a, c, d, part);
  };
  for (let stalk = 0; stalk < 3; stalk++) {
    const angle = stalk * 2.4 + .7, height = .87 + stalk * .065;
    const root = new THREE.Vector3(Math.cos(angle) * .18, 0, Math.sin(angle) * .18);
    const direction = new THREE.Vector3(Math.cos(angle + .8), 0, Math.sin(angle + .8));
    const side = new THREE.Vector3(-direction.z, 0, direction.x);
    const center = (t: number) => root.clone().addScaledVector(direction, .065 * t * t).add(new THREE.Vector3(0, t * height, 0));
    if (detail === 0) {
      const rings = 4, sides = 4;
      for (let ring = 0; ring < rings; ring++) for (let k = 0; k < sides; k++) {
        const t = ring / rings, next = (ring + 1) / rings, a = k / sides * Math.PI * 2, b = (k + 1) / sides * Math.PI * 2;
        const at = (y: number, phi: number) => center(y).add(new THREE.Vector3(Math.cos(phi) * .0029 * (1 - y * .35), 0, Math.sin(phi) * .0029 * (1 - y * .35)));
        quad(at(t, a), at(t, b), at(next, b), at(next, a), 0);
      }
      // Slightly swollen joints and a rolled, hanging blade at each node.
      for (let leaf = 0; leaf < 3; leaf++) {
        const t = .25 + leaf * .19, origin = center(t), leafSide = side.clone().multiplyScalar(leaf % 2 ? -1 : 1);
        const along = direction.clone().multiplyScalar(leaf % 2 ? 1 : -1);
        const sections = 3;
        const blade = (u: number, edge: number) => origin.clone().addScaledVector(along, Math.sin(u * 1.6) * .2)
          .add(new THREE.Vector3(0, Math.sin(u * 2.5) * .12 - u * u * .055, 0))
          .addScaledVector(leafSide, edge * Math.sin(Math.PI * u) * .0085)
          .addScaledVector(direction, edge * edge * .006 * Math.sin(Math.PI * u));
        for (let segment = 0; segment < sections; segment++) {
          const u = segment / sections, v = (segment + 1) / sections;
          quad(blade(u, -1), blade(u, 1), blade(v, 1), blade(v, -1), 1);
        }
        const node = center(t), top = center(t + .007);
        for (let k = 0; k < 4; k++) {
          const a = k / 4 * Math.PI * 2, b = (k + 1) / 4 * Math.PI * 2;
          const offset = (phi: number) => new THREE.Vector3(Math.cos(phi) * .0043, 0, Math.sin(phi) * .0043);
          quad(node.clone().add(offset(a)), node.clone().add(offset(b)), top.clone().add(offset(b)), top.clone().add(offset(a)), 4);
        }
      }
    } else {
      const width = detail === 1 ? .005 : .008;
      const segments = detail === 1 ? 2 : 1;
      for (let segment = 0; segment < segments; segment++) {
        const a = center(segment / segments), b = center((segment + 1) / segments);
        quad(a.clone().addScaledVector(side, -width), a.clone().addScaledVector(side, width), b.clone().addScaledVector(side, width), b.clone().addScaledVector(side, -width), 0);
      }
      const base = center(.52), tip = base.clone().addScaledVector(direction, .18).add(new THREE.Vector3(0, .065, 0));
      triangle(base, base.clone().addScaledVector(side, .018).addScaledVector(direction, .07).add(new THREE.Vector3(0, .09, 0)), tip, 1);
    }
    earBase.copy(center(1));
    const ear = (t: number) => earBase.clone().addScaledVector(direction, .075 * t + .055 * t * t).add(new THREE.Vector3(0, t * .21 - t * t * .06, 0));
    if (detail < 2) {
      const pairs = detail === 0 ? 6 : 3;
      for (let grain = 0; grain < pairs; grain++) for (const sign of [-1, 1]) {
        const t = (grain + (sign > 0 ? .28 : 0)) / pairs, at = ear(t).addScaledVector(side, sign * .004);
        const taper = .58 + .45 * Math.sin((.12 + t * .82) * Math.PI);
        const long = new THREE.Vector3(0, 1, 0).addScaledVector(side, sign * .42).addScaledVector(direction, .12).normalize();
        const across = side.clone().addScaledVector(new THREE.Vector3(0, 1, 0), -sign * .42).normalize();
        if (detail === 0) {
          const length = .016 * taper, width = .0065 * taper;
          const bottom = at.clone().addScaledVector(long, -length), top = at.clone().addScaledVector(long, length);
          for (let face = 0; face < 4; face++) {
            const a = face / 4 * Math.PI * 2, b = (face + 1) / 4 * Math.PI * 2;
            const around = (phi: number) => at.clone().addScaledVector(across, Math.cos(phi) * width).addScaledVector(direction, Math.sin(phi) * width * .8);
            const p = around(a), q = around(b);
            const grainNormal = (point: THREE.Vector3) => {
              const local = point.clone().sub(at);
              return across.clone().multiplyScalar(local.dot(across) / (width * width))
                .addScaledVector(direction, local.dot(direction) / (width * width * .64))
                .addScaledVector(long, local.dot(long) / (length * length)).normalize();
            };
            const emit = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => { vertex(a, grainNormal(a), 2); vertex(b, grainNormal(b), 2); vertex(c, grainNormal(c), 2); };
            emit(bottom, q, p); emit(p, q, top);
          }
        } else {
          quad(at.clone().addScaledVector(long, -.016), at.clone().addScaledVector(across, .008 * taper), at.clone().addScaledVector(long, .016), at.clone().addScaledVector(across, -.008 * taper), 2);
        }
        // Awns emerge from each grain, tapering to a point above the curved ear.
        const base = at.clone().addScaledVector(long, .012), end = base.clone().addScaledVector(long, .07 + .035 * (1 - t)).addScaledVector(side, sign * .025);
        if (detail === 0) triangle(base.clone().addScaledVector(across, -.0012), base.clone().addScaledVector(across, .0012), end, 3);
      }
    } else {
      const base = ear(0), middle = ear(.52), top = ear(1);
      triangle(base, middle.clone().addScaledVector(side, .017), top, 2);
      triangle(base, top, middle.clone().addScaledVector(side, -.017), 2);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("part", new THREE.Float32BufferAttribute(parts, 1));
  geometry.setAttribute("earOffset", new THREE.Float32BufferAttribute(earOffsets, 3));
  return geometry;
}

export function buildWheat({ scene, own, rand, floor, small, still, fireX, fireS, stoneX, sunDirection, output }: Settings) {
  const uniforms = {
    time: { value: 0 }, front: { value: -1e4 }, wind: { value: still ? 0 : 1 }, sky: { value: new THREE.Color() }, sun: { value: new THREE.Color() }, fogColor: { value: new THREE.Color() }, fogDensity: { value: .01 },
    fire: { value: new THREE.Vector4(fireX, 0, -fireS, 0) }, shadow: { value: new THREE.Vector4(stoneX, -MONO_S, (MONOLITH.width * Math.cos(MONOLITH.yaw) + MONOLITH.depth * Math.abs(Math.sin(MONOLITH.yaw))) / 2, 70) }, backlit: { value: 0 }, sunDirection: { value: sunDirection },
  };
  const material = own(new THREE.ShaderMaterial({
    side: THREE.DoubleSide, uniforms,
    vertexShader: `attribute vec3 at, tint, earOffset; attribute vec4 shape; attribute float sown, part;
      uniform float time, front, wind; varying vec3 vNormal, vWorld, vTint; varying float vPart, vHeight, vFog, vGust;
      void main() {
        float grow = smoothstep(0., 1., (front - sown) / 16.);
        // An immature ear unfolds from the tip of its own stalk, including under wind.
        vec3 plant = position - earOffset * (1. - shape.w);
        vec3 p = plant; p.xz *= shape.y; p.y *= shape.x;
        float c = cos(shape.z), s = sin(shape.z); mat2 turn = mat2(c, -s, s, c);
        p.xz = turn * p.xz;
        float phase = dot(at.xz, vec2(.94, .33)) * .095 - time * 1.18;
        float gust = .5 + .5 * sin(phase + sin(dot(at.xz, vec2(-.33, .94)) * .045 + time * .14) * 1.5);
        float swell = gust * gust;
        vec2 bend = vec2(.94, .33) * (.025 + swell * .13) + vec2(-.33, .94) * sin(time * .6 + at.x * .11) * .018;
        float lever = plant.y * plant.y;
        p.xz += bend * lever * wind;
        // Under a pixel the distant stem gains a little width instead of sparkling.
        float distanceToEye = distance(cameraPosition, at);
        p.xz += turn * normal.xz * max(0., distanceToEye * .00014 - .003) * (1. - step(1.5, part));
        p.y = mix(p.y * .76, p.y, shape.w);
        vec3 n = normal; n.xz = turn * n.xz; n.y -= dot(n.xz, bend) * 2. * position.y * wind;
        vNormal = normalize(n); vPart = part; vHeight = position.y; vTint = tint; vGust = swell;
        vec4 world = vec4(at + p * grow, 1.); vWorld = world.xyz;
        vec4 mv = viewMatrix * world; vFog = -mv.z; gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `uniform vec3 sky, sun, sunDirection, fogColor; uniform float fogDensity, backlit; uniform vec4 fire, shadow;
      varying vec3 vNormal, vWorld, vTint; varying float vPart, vHeight, vFog, vGust;
      void main() {
        vec3 n = normalize(vNormal); if (!gl_FrontFacing) n = -n;
        vec3 view = normalize(cameraPosition - vWorld), light = normalize(sunDirection);
        float grain = step(1.5, vPart) * (1. - step(2.5, vPart)), leaf = step(.5, vPart) * (1. - step(1.5, vPart));
        float awn = step(2.5, vPart) * (1. - step(3.5, vPart)), node = step(3.5, vPart);
        vec3 color = vTint * mix(.32, .8, smoothstep(0., .8, vHeight));
        color *= 1. + grain * .12 + awn * .18 - leaf * .12 - node * .25 + (vGust - .35) * .12 * smoothstep(.2, .9, vHeight);
        float diffuse = .25 + .75 * max(dot(n, light), 0.);
        float through = pow(max(dot(view, -light), 0.), 4.) * (.2 + .26 * leaf + .2 * awn) * backlit;
        vec3 lit = color * (sky * (.42 + .32 * max(n.y, 0.)) + sun * (diffuse + through * vec3(1.16, 1.0, .72)));
        float roughGlint = pow(max(dot(n, normalize(view + light)), 0.), 14.);
        lit += sun * roughGlint * (.04 + grain * .03) * smoothstep(.3, .8, vHeight);
        float inShade = (1. - smoothstep(shadow.z - .8, shadow.z + .8, abs(vWorld.x - shadow.x))) * step(shadow.y, vWorld.z) * (1. - smoothstep(shadow.y + shadow.w - 14., shadow.y + shadow.w, vWorld.z));
        lit *= (1. - .5 * inShade * backlit) * mix(.48, 1., smoothstep(0., .65, vHeight));
        float distanceToFire = distance(vWorld, fire.xyz);
        lit += color * vec3(1.5, .5, .12) * fire.w / (1. + distanceToFire * distanceToFire * .035);
        float fog = 1. - exp(-fogDensity * fogDensity * vFog * vFog);
        gl_FragColor = vec4(mix(lit, fogColor, fog), 1.); ${output}
      }`,
  }));
  const stride = 11, chunkSize = small ? 12 : 16, chunks = new Map<string, number[]>(), tint = new THREE.Color();
  const young = new THREE.Color("#778b3d"), ripe = new THREE.Color("#b9954d"), pale = new THREE.Color("#dac384"), density = small ? .42 : 1;
  const add = (x: number, s: number, height: number, head: number) => {
    const key = `${Math.floor(x / chunkSize)},${Math.floor(s / chunkSize)}`;
    if (!chunks.has(key)) chunks.set(key, []);
    chunks.get(key)!.push(x, floor(x, -s), -s, height, .85 + rand() * .4, rand() * 6.283, head, tint.r, tint.g, tint.b, s);
  };
  for (let s = FIELD_S; s < 414; s += (s < 380 ? .34 : .52) / density) for (let row = -34; row <= 34; row++) {
    if (Math.abs(row) < 2 || (s > VILLAGE.from && s < VILLAGE.to && row > 8 && row < 30)) continue;
    const ripeness = smooth(316, 397, s), x = roadX(s) + row * .92 + (rand() - .5) * .22, at = s + (rand() - .5) * .4;
    if (rand() >= cropCover(row * .92, at) || cleared(x, at)) continue;
    tint.copy(young).lerp(ripe, ripeness).multiplyScalar(.83 + rand() * .25);
    add(x, at, .5 + ripeness * .55 + rand() * .2, smooth(300, 380, s));
  }
  for (let i = 0; i < 44000 * density; i++) {
    const s = 612 + rand() * 112, off = (rand() - .5) * (rand() < .62 ? 48 : 170), x = roadX(Math.min(s, MONO_S)) + off;
    if (rand() >= cropCover(off, s) || (Math.abs(off) < 1.25 && s < MONO_S) || Math.hypot(x - stoneX, s - MONO_S) < 9.5 || cleared(x, s)) continue;
    tint.copy(ripe).lerp(pale, rand() * .7).multiplyScalar(.82 + rand() * .25);
    add(x, s, 1.02 + rand() * .36, 1);
  }
  const templates = [0, 1, 2].map(detail => own(plantGeometry(detail)));
  const fieldChunks = [...chunks.values()].map(plants => {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity, minS = Infinity;
    for (let i = 0; i < plants.length; i += stride) {
      minX = Math.min(minX, plants[i]!); maxX = Math.max(maxX, plants[i]!); minY = Math.min(minY, plants[i + 1]!); maxY = Math.max(maxY, plants[i + 1]! + 1.7);
      minZ = Math.min(minZ, plants[i + 2]!); maxZ = Math.max(maxZ, plants[i + 2]!); minS = Math.min(minS, plants[i + 10]!);
    }
    const center = new THREE.Vector3((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2);
    // A spatially mixed prefix lets instanceCount thin a whole patch, rather than removing one
    // end of a planted row. This independent shuffle never changes any plant or the world RNG.
    const order = sequence((Math.floor(center.x / chunkSize) * 73856093 ^ Math.floor(center.z / chunkSize) * 19349663) >>> 0);
    for (let i = plants.length / stride - 1; i > 0; i--) {
      const j = Math.floor(order() * (i + 1));
      for (let k = 0; k < stride; k++) { const hold = plants[i * stride + k]!; plants[i * stride + k] = plants[j * stride + k]!; plants[j * stride + k] = hold; }
    }
    const data = new THREE.InstancedInterleavedBuffer(new Float32Array(plants), stride), lod = new THREE.LOD();
    lod.position.copy(center); lod.visible = false; lod.autoUpdate = false;
    const sphere = new THREE.Sphere(new THREE.Vector3(), Math.hypot(maxX - minX, maxY - minY, maxZ - minZ) / 2 + 2.5);
    for (let detail = 0; detail < templates.length; detail++) {
      const template = templates[detail]!, geometry = own(new THREE.InstancedBufferGeometry());
      for (const [name, attribute] of Object.entries(template.attributes)) geometry.setAttribute(name, attribute);
      geometry.setAttribute("at", new THREE.InterleavedBufferAttribute(data, 3, 0)); geometry.setAttribute("shape", new THREE.InterleavedBufferAttribute(data, 4, 3));
      geometry.setAttribute("tint", new THREE.InterleavedBufferAttribute(data, 3, 7)); geometry.setAttribute("sown", new THREE.InterleavedBufferAttribute(data, 1, 10));
      geometry.instanceCount = plants.length / stride; geometry.boundingSphere = sphere;
      const mesh = new THREE.Mesh(geometry, material);
      // Instance coordinates remain in world space; compensate the LOD's position in its children.
      mesh.position.copy(center).negate();
      geometry.boundingSphere = sphere.clone(); geometry.boundingSphere.center.copy(center);
      lod.addLevel(mesh, detail === 0 ? 0 : detail === 1 ? (small ? 5 : 8) : (small ? 18 : 32), .12);
    }
    lod.addLevel(new THREE.Object3D(), small ? 80 : 132, .12);
    scene.add(lod); lod.updateMatrixWorld(true);
    return { mesh: lod, minS, count: plants.length / stride };
  });
  // The AO pass temporarily hides these shader meshes. Updating LOD here keeps
  // the renderer from making them visible again during its override-material pass.
  const frame = (camera: THREE.Camera) => {
    camera.updateMatrixWorld();
    const eye = camera.position;
    for (const { mesh, count } of fieldChunks) if (mesh.visible) {
      mesh.update(camera);
      const distance = eye.distanceTo(mesh.position), level = mesh.getCurrentLevel();
      if (level > 2) continue;
      const geometry = (mesh.levels[level]!.object as THREE.Mesh<THREE.InstancedBufferGeometry>).geometry;
      // Keep every nearby ear. Beyond that, each distant patch has a bounded vertex workload;
      // the gradual change is in submitted instances, so removed plants cost no vertex shader work.
      if (level === 0) geometry.instanceCount = count;
      else {
        const start = small ? 16 : 24, middle = small ? 24 : 38, end = small ? 60 : 100;
        const middleCount = Math.min(count, small ? 120 : 180), farCount = Math.min(count, small ? 48 : 80);
        const first = count + (middleCount - count) * smooth(start, middle, distance);
        // One continuous density curve across both distant LODs avoids a density jump at a switch.
        geometry.instanceCount = Math.ceil(first + (farCount - first) * smooth(middle, end, distance));
      }
    }
  };
  return { uniforms, fieldChunks, frame };
}
