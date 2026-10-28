import * as THREE from "three";
import { Sky } from "three/examples/jsm/objects/Sky.js";
import type { Kit, Model, View } from "../shared/geometry.ts";
import type { Vec3 } from "../shared/worlds.ts";
import { cutStone } from "./knapping.ts";
import type { Scan, StoneAssets } from "./assets.ts";

export function build(scene: THREE.Scene, k: Kit, assets: StoneAssets): Model {
  const { random, mesh, material } = k, mobile = innerWidth < 761;
  scene.environment = assets.environment; scene.environmentIntensity = .85;
  scene.fog = new THREE.FogExp2("#d6e2cc", .0035);
  const sky = new Sky(); sky.scale.setScalar(1000);
  sky.material.uniforms.turbidity!.value = 5.5; sky.material.uniforms.rayleigh!.value = 1.2;
  sky.material.uniforms.mieCoefficient!.value = .006; sky.material.uniforms.mieDirectionalG!.value = .8;
  sky.material.uniforms.sunPosition!.value = new THREE.Vector3(-.7, .32, -.5);
  scene.add(sky); k.own(() => { sky.geometry.dispose(); sky.material.dispose(); });
  const sun = new THREE.DirectionalLight("#ffe5c2", 2.2); sun.position.set(-5, 9, -4); sun.castShadow = true;
  sun.shadow.mapSize.set(mobile ? 2048 : 4096, mobile ? 2048 : 4096);
  Object.assign(sun.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10, near: .5, far: 40 });
  sun.shadow.normalBias = .012; sun.shadow.bias = -.00008; sun.shadow.radius = 4; scene.add(sun); k.own(() => sun.shadow.dispose());
  scene.add(new THREE.HemisphereLight("#cfdce8", "#a99a7c", 1.2));
  const fill = new THREE.DirectionalLight("#dbe9f2", .35); fill.position.set(2, 4, 6); scene.add(fill);

  // A displaced, metre-scaled soil surface, with independent colour, normal, roughness and height scans.
  const soil = material(new THREE.MeshStandardMaterial({ color: "#b8a78b", map: assets.color, normalMap: assets.normal, roughnessMap: assets.roughness, roughness: 1, normalScale: new THREE.Vector2(.5, .5), envMapIntensity: .25 }));
  function groundHeight(x: number, z: number) {
    const u = ((x / 4 % 1) + 1) % 1, v = ((z / 4 % 1) + 1) % 1;
    const detail = assets.heightPixels[(Math.floor(v * 127) * 128 + Math.floor(u * 127)) * 4]! / 255 - .5;
    const river = (x + 6 + Math.sin(z * .13) * .8) / 1.5, bed = Math.exp(-(river * river)) * -.32;
    const hills = THREE.MathUtils.smoothstep(Math.hypot(x, z), 18, 65) * (4 + Math.sin(x * .044 + z * .021) * 2.2 + Math.sin(x * .11 - z * .07) * .7);
    return Math.sin(x * .47) * Math.cos(z * .31) * .045 + detail * .065 + bed + hills;
  }
  const ground = new THREE.PlaneGeometry(90, 90, mobile ? 170 : 260, mobile ? 170 : 260); ground.rotateX(-Math.PI / 2);
  const p = ground.attributes.position!, uv = ground.attributes.uv!;
  const spread = (v: number) => Math.sign(v) * (Math.abs(v) < 12 ? Math.abs(v) : 12 + (Math.abs(v) - 12) * 4);
  for (let i = 0; i < p.count; i++) { const x = spread(p.getX(i)), z = spread(p.getZ(i)); p.setXYZ(i, x, groundHeight(x, z), z); uv.setXY(i, x / 4, z / 4); }
  ground.computeVertexNormals(); const terrain = mesh(scene, ground, soil); terrain.castShadow = false;
  const preserved = new Set<THREE.Object3D>([terrain]), pickables: THREE.Object3D[] = [];
  function place(scan: Scan, at: Vec3, size: Vec3, rotation = 0) {
    const object = mesh(scene, scan.geometry, scan.material, at); object.scale.set(...size); object.rotation.y = rotation;
    preserved.add(object); return object;
  }
  function batch(scan: Scan, placements: Array<{ at: Vec3; size: Vec3; rotation: number }>, shadows = true) {
    const result = new THREE.InstancedMesh(scan.geometry, scan.material, placements.length), transform = new THREE.Object3D();
    placements.forEach((item, i) => { transform.position.set(...item.at); transform.scale.set(...item.size); transform.rotation.y = item.rotation; transform.updateMatrix(); result.setMatrixAt(i, transform.matrix); });
    result.castShadow = shadows; result.receiveShadow = true; result.computeBoundingSphere(); scene.add(result);
    return result;
  }
  // The actual scan supplies all silhouette detail: a broad, worn outcrop instead of a scaled icosahedron.
  const work = place(assets.boulder, [0, -.24, 0], [3.1, 1.05, 2.35], -.15);
  scene.updateMatrixWorld(true);
  const ray = new THREE.Raycaster(), down = new THREE.Vector3(0, -1, 0);
  function workHeight(x: number, z: number) { ray.set(new THREE.Vector3(x, 3, z), down); return ray.intersectObject(work)[0]?.point.y ?? .67; }
  const coreBase = workHeight(0, .05), hammerBase = workHeight(.84, -.12);
  const coreGroup = new THREE.Group(); coreGroup.position.set(0, coreBase + .014, .05); coreGroup.rotation.y = -.32; scene.add(coreGroup);
  const coreSource = assets.rock.geometry.clone(); coreSource.scale(.59, .4, .49);
  k.own(() => coreSource.dispose());
  const fractureTexture = k.texture(1024, 1024, (c, w, h) => {
    c.fillStyle = "#65726b"; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 180; i++) { const x = random() * w, y = random() * h, r = 10 + random() * 130; const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, i % 2 ? "#23332c28" : "#d5d7c331"); g.addColorStop(1, "#6c786d00"); c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2); }
    for (let i = 0; i < 45000; i++) { c.fillStyle = random() > .5 ? "#26312e10" : "#eef0e013"; const s = 1 + random() * 3; c.fillRect(random() * w, random() * h, s, s); }
    c.lineWidth = .6;
    for (let r = 20; r < 1000; r += 5 + random() * 5) { c.strokeStyle = r % 3 ? "#414b4217" : "#e3e2cf24"; c.beginPath(); c.ellipse(w * .48, -h * .1, r, r * .9, -.12, .1, 3.1); c.stroke(); }
  });
  const fracture = material(new THREE.MeshStandardMaterial({ color: "#9aa99e", map: fractureTexture, bumpMap: fractureTexture, bumpScale: .009, normalMap: assets.rock.material.normalMap, normalScale: new THREE.Vector2(.16, .16), roughness: .48, envMapIntensity: .3 }));
  const stages: THREE.BufferGeometry[] = [], planes = [
    new THREE.Plane(new THREE.Vector3(-.38, .3, .875).normalize(), -.196),
    new THREE.Plane(new THREE.Vector3(.62, .45, .64).normalize(), -.242),
    new THREE.Plane(new THREE.Vector3(-.72, .61, .18).normalize(), -.225),
  ];
  for (let i = 0; i < 4; i++) { const geometry = cutStone(coreSource, planes.slice(0, i)); stages.push(geometry); k.own(() => geometry.dispose()); }
  const core = new THREE.Mesh(stages[0], [assets.rock.material, fracture]); core.castShadow = core.receiveShadow = true; coreGroup.add(core); preserved.add(coreGroup); pickables.push(coreGroup); coreGroup.userData.spot = "core";
  const hammer = place(assets.rock, [.84, hammerBase + .01, -.12], [.27, .2, .28], 1.45); hammer.userData.spot = "hammer"; pickables.push(hammer);

  // Thin solid flakes have a sharp, irregular perimeter and a curved percussion surface.
  function flakeGeometry(seed: number) {
    const positions: number[] = [], uvs: number[] = [], indices: number[] = [], segments = 64, rings = 12;
    for (let side = 0; side < 2; side++) for (let ring = 0; ring <= rings; ring++) for (let i = 0; i <= segments; i++) {
      const a = i / segments * Math.PI * 2, r = ring / rings, edge = 1 + Math.sin(a * 3 + seed) * .09 + Math.sin(a * 7 + seed) * .025;
      const x = Math.cos(a) * .095 * r * edge, z = Math.sin(a) * .155 * r * edge;
      const bulb = Math.max(0, 1 - r * r), y = side === 0 ? .003 + bulb * (.025 + Math.sin(z * 37 + seed) * .004) : -.001 - bulb * .006;
      positions.push(x, y, z); uvs.push(x * 3 + .5, z * 3 + .5);
      if (ring < rings && i < segments) { const at = (side * (rings + 1) + ring) * (segments + 1) + i, next = at + segments + 1; if (side === 0) indices.push(at, at + 1, next, next, at + 1, next + 1); else indices.push(at, next, at + 1, next, next + 1, at + 1); }
    }
    for (let i = 0; i < segments; i++) { const a = rings * (segments + 1) + i, b = ((rings + 1) * 2 - 1) * (segments + 1) + i; indices.push(a, a + 1, b, b, a + 1, b + 1); }
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3)); geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2)); geometry.setIndex(indices); geometry.computeVertexNormals(); return geometry;
  }
  const flakes: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const x = -.72 + i * .46, z = .63 + (i % 2) * .14;
    const removed = cutStone(coreSource, [...planes.slice(0, i), planes[i]!.clone().negate()]);
    removed.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(planes[i]!.normal.clone().negate(), new THREE.Vector3(0, 1, 0)));
    removed.computeBoundingBox(); const bounds = removed.boundingBox!, center = bounds.getCenter(new THREE.Vector3()); removed.translate(-center.x, -bounds.min.y, -center.z);
    const flake = new THREE.Mesh(removed, [assets.rock.material, fracture]); flake.castShadow = flake.receiveShadow = true; flake.position.set(x, workHeight(x, z) + .018, z); scene.add(flake); k.own(() => removed.dispose());
    flake.rotation.y = i * 1.1 - .5; flake.userData.base = flake.position.clone(); flake.userData.spot = "flakes"; flakes.push(flake); pickables.push(flake); preserved.add(flake);
  }
  const flakeAnchor = new THREE.Object3D(); flakeAnchor.position.set(-1.2, .2, .85); scene.add(flakeAnchor);
  for (let i = 0; i < 12; i++) {
    const x = -1.5 + random() * .6, z = .75 + random() * .65;
    const flake = mesh(scene, flakeGeometry(i + 4), i % 2 ? fracture : assets.rock.material, [x, groundHeight(x, z) + .025, z]); flake.scale.setScalar(.22 + random() * .35); flake.rotation.y = random() * 6.28;
  }
  // Irregular riverbanks, stones embedded in the soil and overlapping vegetation clusters.
  const stones: Array<{ at: Vec3; size: Vec3; rotation: number }> = [];
  for (let i = 0; i < (mobile ? 32 : 62); i++) {
    const a = random() * 6.28, r = 2 + random() * 16, x = Math.cos(a) * r, z = Math.sin(a) * r;
    const s = .09 + random() ** 2 * .45; stones.push({ at: [x, groundHeight(x, z) - s * .1, z], size: [s, s * (.45 + random() * .3), s * (.7 + random() * .5)], rotation: random() * 6.28 });
  }
  batch(assets.rock, stones);
  for (const [x, z, s, a] of [[3.7, -3.5, 2.3, 1.7], [-3.3, -5.3, 1.6, 3.3], [6.8, -9.5, 3.2, 2.1]] as Array<[number, number, number, number]>) place(assets.boulder, [x, groundHeight(x, z) - .18, z], [s, s * .53, s * .8], a);
  for (const [x, z, size, rotation] of [[-5.7, -8.5, [4.8, 2.8, 3.1], .8], [-.9, -11.5, [4.3, 2.35, 2.8], 1.7], [4.2, -9, [4.6, 2.8, 3.4], 2.5]] as Array<[number, number, Vec3, number]>) place(assets.boulder, [x, groundHeight(x, z) - .16, z], size, rotation);
  const grass: Array<{ at: Vec3; size: Vec3; rotation: number }> = [];
  for (let i = 0; i < (mobile ? 380 : 1500); i++) {
    const a = random() * 6.28, r = 2.1 + random() ** .65 * 24, x = Math.cos(a) * r, z = Math.sin(a) * r;
    if ((Math.abs(x + 6) < 1.6) || (z > 0 && Math.abs(x) < 2.2)) continue;
    const h = .2 + random() ** 2 * .5; grass.push({ at: [x, groundHeight(x, z) - .015, z], size: [h * 1.4, h, h * 1.4], rotation: random() * 6.28 });
  }
  batch(assets.grass, grass, false);
  place(assets.shrub, [-4, groundHeight(-4, -5), -5], [2, 1.2, 1.5], .7);
  if (!mobile) place(assets.shrub, [6.6, groundHeight(6.6, -8), -8], [2.8, 1.6, 2.1], 2.3);
  // A meandering shallow channel, with geometric ripples and reflected sky light.
  const waterMaterial = material(new THREE.MeshPhysicalMaterial({ color: "#384b31", metalness: 0, roughness: .55, transparent: true, opacity: .9, envMapIntensity: .05, clearcoat: .05 }));
  const water = new THREE.PlaneGeometry(2.2, 80, 16, 140); water.rotateX(-Math.PI / 2);
  const wp = water.attributes.position!;
  for (let i = 0; i < wp.count; i++) { const x = wp.getX(i), z = wp.getZ(i), width = .78 + Math.sin(z * .37) * .12 + Math.sin(z * 1.1) * .07; wp.setXYZ(i, x * width - 6 + Math.sin(z * .13) * -.8, -.135 + Math.sin(z * 8 + x * 2) * .003, z); }
  water.computeVertexNormals(); const stream = mesh(scene, water, waterMaterial); stream.castShadow = false; preserved.add(stream);
  const close: View = { position: [1.35, coreBase + 1.12, 2.24], target: [.18, coreBase + .23, .08] };
  const side: View = { position: [-1.72, coreBase + .8, 1.87], target: [-.12, coreBase + .2, .12] };
  k.mergeStatic(scene, preserved);
  let shown = -1;
  return {
    groundHeight: groundHeight,
    views: { wide: { position: [4.6, 1.7, 6.7], target: [0, .75, -.1] }, close, side, painting: { position: [3.8, 2.45, 5.6], target: [0, .8, -.15] } },
    spots: [
      { id: "hammer", title: "锤石 · 打制", detail: "用锤石敲击石核的边缘，剥下锋利的石片。", object: hammer, view: close, advance: true },
      { id: "core", title: "石核与断面", detail: "深色石皮与浅色新断面记录着剥片次序。这里示意早期石核，不复刻某件考古标本。", object: coreGroup, view: side },
      { id: "flakes", title: "锋利的石片", detail: "剥落的石片也能成为切割工具；工具不只包括剩下的石核。", object: flakeAnchor, view: { position: [-2.1, 1.25, 2.4], target: [-1.3, .2, 1] } },
    ], pickables,
    canMove: (x, z) => !(x > -1.8 && x < 1.8 && z > -1.3 && z < 1.4),
    update(phase) {
      const current = Math.min(3, Math.floor(phase + .25));
      if (current !== shown) { core.geometry = stages[current]!; shown = current; }
      const t = phase % 1, strike = Math.sin(t * Math.PI) ** 2;
      hammer.position.set(.84 - strike * .62, hammerBase + .01 + strike * .55, -.12); hammer.rotation.z = -strike * .35;
      flakes.forEach((flake, i) => { const p = THREE.MathUtils.clamp(phase - i, 0, 1), base = flake.userData.base as THREE.Vector3; flake.visible = p > .25; flake.position.copy(base); flake.position.y += Math.sin(p * Math.PI) * .15; flake.scale.setScalar(.65 + p * .35); });
    },
  };
}
