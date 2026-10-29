import * as THREE from "three";
import type { Kit, Model, Spot } from "../shared/geometry.ts";
import { workshop, type WorkshopAssets } from "../games/workshop.ts";
import { NetworkGame } from "../games/modern-state.ts";

export function build(scene: THREE.Scene, k: Kit, assets: WorkshopAssets, renderer: THREE.WebGLRenderer): Model {
  const room = workshop(scene, k, renderer, assets, { theme: "network" }), { wood, iron, brass, glass, paper } = room;
  const game = new NetworkGame(), preserve = new Set<THREE.Object3D>(), spots: Spot[] = [];
  const beige = k.material(new THREE.MeshPhysicalMaterial({ color: "#b9af92", roughness: .5, clearcoat: .15 }));
  const dark = k.material(new THREE.MeshStandardMaterial({ color: "#17202b", roughness: .4, metalness: .4 }));
  const amber = k.material(new THREE.MeshBasicMaterial({ color: "#e5b36d" }));
  k.box(scene, wood, [0, .85, .1], [3.4, .15, 2.8], .04);
  for (const x of [-1.4, 1.4]) for (const z of [-1.05, 1.2]) k.box(scene, iron, [x, .42, z], [.1, .84, .1], .01);
  k.box(scene, dark, [0, .96, -.05], [2.95, .07, 2.35], .025);
  const close = { position: [2.7, 2.4, 3.6] as [number, number, number], target: [0, 1.3, -.1] as [number, number, number] };
  const add = (id: string, object: THREE.Object3D, action: string, title: string) => { object.userData.spot = id; preserve.add(object); spots.push({ id, object, action, title, detail: title, view: close }); };
  const node = (x: number, z: number) => { const base = k.cylinder(scene, brass, [x, 1.05, z], .16, .1); k.cylinder(scene, dark, [x, 1.12, z], .12, .07); k.sphere(scene, amber, [x, 1.2, z], .065); return base; };
  const sender = node(0, .92), receiver = node(0, -1.02); add("fragment", sender, "shard", "选择下一分片"); add("receiver", receiver, "primary", "发送并重组");
  const curves: THREE.CatmullRomCurve3[] = [], routeMaterials: THREE.MeshStandardMaterial[] = [], bridges: THREE.Mesh[] = [], packets: THREE.Mesh[] = [];
  for (let route = 0; route < 3; route++) {
    const x = (route - 1) * 1.06, y = route === 1 ? 1.65 : 1.4;
    const points = [new THREE.Vector3(0, 1.2, .92), new THREE.Vector3(x, y, .45), new THREE.Vector3(x, y, -.55), new THREE.Vector3(0, 1.2, -1.02)];
    const curve = new THREE.CatmullRomCurve3(points); curves.push(curve);
    const material = k.material(new THREE.MeshStandardMaterial({ color: "#457f8d", emissive: "#267882", emissiveIntensity: .35, roughness: .3, metalness: .3 })); routeMaterials.push(material);
    for (const [start, end] of [[0, .43], [.57, 1]]) {
      const segment = new THREE.CatmullRomCurve3(Array.from({ length: 22 }, (_, i) => curve.getPoint(start! + (end! - start!) * i / 21)));
      const cable = k.mesh(scene, new THREE.TubeGeometry(segment, 40, .028, 8, false), material); preserve.add(cable);
    }
    const bridge = k.mesh(scene, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(Array.from({ length: 9 }, (_, i) => curve.getPoint(.43 + .14 * i / 8))), 16, .028, 8, false), material); preserve.add(bridge); bridges.push(bridge);
    for (const t of [.43, .57]) { const point = curve.getPoint(t); k.sphere(scene, brass, point.toArray() as [number, number, number], .049); }
    const router = node(x, -.05); add(`route-${route}`, router, "route", "切换传输路径");
    const packet = k.sphere(scene, amber, [0, 1.2, .92], .055); preserve.add(packet); packets.push(packet);
  }
  const received: THREE.MeshStandardMaterial[] = [];
  for (let i = 0; i < 3; i++) {
    const material = k.material(new THREE.MeshStandardMaterial({ color: "#6c776a", emissive: "#74b77c", emissiveIntensity: 0 })); received.push(material);
    const tile = k.box(scene, material, [-.35 + i * .35, 1.05, -1.12], [.23, .04, .16], .015); preserve.add(tile);
  }
  // A desk CRT, full-height patch racks and tangible coaxial bundles echo the original night network.
  const map = k.texture(800, 600, () => {}), screenMaterial = k.material(new THREE.MeshBasicMaterial({ map }));
  k.box(scene, wood, [2.7, .83, -.45], [1.65, .14, 1.7], .03);
  for (const x of [2.05, 3.35]) for (const z of [-1.1, .2]) k.box(scene, iron, [x, .41, z], [.08, .82, .08], .008);
  k.box(scene, beige, [2.7, 1.43, -.62], [1.1, .95, .8], .09);
  k.box(scene, dark, [2.7, 1.49, -.195], [.94, .73, .045], .065);
  const screen = k.mesh(scene, new THREE.PlaneGeometry(.84, .63, 12, 8), screenMaterial, [2.7, 1.49, -.165]); screen.castShadow = false; preserve.add(screen);
  k.box(scene, beige, [2.7, .97, .12], [1.25, .09, .42], .025);
  for (let row = 0; row < 4; row++) for (let col = 0; col < 13; col++) k.box(scene, row === 3 ? dark : paper, [2.15 + col * .087, 1.027, -.01 + row * .085], [.069, .022, .062], .006);
  const send = k.box(scene, brass, [3.22, 1.04, .25], [.18, .04, .08], .012); add("send", send, "primary", "发送并重组");
  k.box(scene, beige, [-2.6, 1.02, .7], [.9, .2, .6], .045);
  for (let i = 0; i < 5; i++) k.sphere(scene, i === 4 ? brass : amber, [-2.9 + i * .14, 1.05, 1.015], .018);
  for (let i = 0; i < 8; i++) k.box(scene, dark, [-2.9 + i * .08, 1.13, .68], [.027, .008, .35], 0);
  k.tube(scene, dark, [[-2.6, 1.05, .4], [-2.8, .7, -.3], [-3.4, .12, -.8], [-3.4, .12, -2.3]], .023);
  for (const x of [-3.15, 3.15]) {
    k.box(scene, iron, [x, 1.45, -2.65], [1.08, 2.8, .72], .035);
    for (let row = 0; row < 9; row++) {
      k.box(scene, row % 3 ? dark : beige, [x, .3 + row * .28, -2.265], [.94, .23, .045], .01);
      for (let port = 0; port < 8; port++) { k.box(scene, iron, [x - .35 + port * .1, .3 + row * .28, -2.232], [.06, .055, .02], .003); if (port % 2) k.sphere(scene, amber, [x - .35 + port * .1, .37 + row * .28, -2.22], .008); }
      if (row < 6) k.tube(scene, row % 2 ? brass : dark, [[x - .3, .3 + row * .28, -2.2], [x - .15, .18 + row * .28, -2.03], [x + .25, .3 + (row + 1) * .28, -2.2]], .009);
    }
  }
  const globe = new THREE.Group(); scene.add(globe); globe.position.set(0, 2.55, -2.6); globe.rotation.z = -.2;
  const globeMat = k.material(new THREE.MeshStandardMaterial({ color: "#223d52", metalness: .35, roughness: .45 })); k.sphere(globe, globeMat, [0, 0, 0], .62);
  for (const angle of [0, Math.PI / 3, Math.PI * 2 / 3]) { const longitude = k.torus(globe, brass, [0, 0, 0], .63, .005); longitude.rotation.y = angle; }
  for (const y of [-.4, -.2, 0, .2, .4]) { const latitude = k.torus(globe, brass, [0, y, 0], Math.sqrt(.63 ** 2 - y ** 2), .005); latitude.rotation.x = Math.PI / 2; }
  for (let i = 0; i < 12; i++) { const a = i * 2.4, y = Math.sin(i * .8) * .45, r = Math.sqrt(.65 ** 2 - y ** 2); k.sphere(globe, amber, [Math.sin(a) * r, y, Math.cos(a) * r], .023); }
  room.finish(preserve); let last = "", delivered = 0, sentAt = -Infinity, sentRoute = 0, sentShard = 1;
  return { game, spots, pickables: spots.map(s => s.object), views: { wide: { position: [4.2, 2.9, 5.8], target: [0, 1.25, -.4] }, close, side: { position: [-3.1, 2.1, 2.4], target: [0, 1.4, -.15] }, painting: { position: [2.7, 1.8, 1.7], target: [2.7, 1.5, -.2] } }, update(_phase, time) {
    if (game.passed > delivered) { sentAt = time; sentRoute = game.route; sentShard = game.shard; }
    else if (game.passed < delivered) sentAt = -Infinity;
    delivered = game.passed;
    for (let route = 0; route < 3; route++) {
      const available = game.routes[game.shard - 1]![route]!, selected = game.route === route;
      routeMaterials[route]!.color.set(available ? selected ? "#8dcbd1" : "#346b78" : "#8b3c36"); routeMaterials[route]!.emissive.set(available ? "#3a9ca7" : "#7c2723"); routeMaterials[route]!.emissiveIntensity = selected ? .8 : .12; bridges[route]!.visible = available;
      const packet = packets[route]!, progress = (time - sentAt) / 1.5; packet.visible = route === sentRoute && game.shard === sentShard && available && progress >= 0 && progress <= 1; packet.position.copy(curves[route]!.getPoint(Math.max(0, Math.min(1, progress))));
      received[route]!.emissiveIntensity = route < game.passed ? 1.3 : 0;
    }
    const key = `${game.shard}:${game.route}:${game.passed}:${game.routes.flat()}`; if (key === last) return; last = key;
    const c = (map.image as HTMLCanvasElement).getContext("2d")!; c.fillStyle = "#071c17"; c.fillRect(0, 0, 800, 600); c.fillStyle = "#9fc398"; c.font = "bold 34px monospace"; c.fillText("PACKET ROUTING / 1991", 35, 60); c.font = "28px monospace";
    [`SELECTED PART ${game.shard} / 3`, `RECEIVER NEEDS ${Math.min(3, game.passed + 1)}`, `ROUTE ${game.route + 1}`, ...game.routes[game.shard - 1]!.map((available, i) => `LINK ${i + 1}: ${available ? "AVAILABLE" : "BROKEN"}`), game.passed === 3 ? "MESSAGE: HELLO, WORLD!" : `REASSEMBLED ${game.passed}/3`].forEach((line, i) => c.fillText(line, 35, 135 + i * 61));
    c.fillStyle = "rgba(0,0,0,.15)"; for (let y = 0; y < 600; y += 4) c.fillRect(0, y, 800, 1); map.needsUpdate = true;
  } };
}
