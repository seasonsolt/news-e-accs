import * as THREE from "three";
import type { Kit, Model, Spot } from "../shared/geometry.ts";
import { workshop, type WorkshopAssets } from "../games/workshop.ts";
import { SpaceGame } from "../games/modern-state.ts";

export function build(scene: THREE.Scene, k: Kit, assets: WorkshopAssets, renderer: THREE.WebGLRenderer): Model {
  const room = workshop(scene, k, renderer, assets, { theme: "space" }), { iron, brass, paper, glass } = room;
  const game = new SpaceGame(), preserve = new Set<THREE.Object3D>(), spots: Spot[] = [];
  const alloy = k.material(new THREE.MeshPhysicalMaterial({ color: "#b8b9ad", roughness: .35, metalness: .8, clearcoat: .15 }));
  const gold = k.material(new THREE.MeshStandardMaterial({ color: "#ac7941", metalness: .8, roughness: .42 }));
  const enamel = k.material(new THREE.MeshStandardMaterial({ color: "#bcc0ac", metalness: .32, roughness: .5 }));
  const dark = k.material(new THREE.MeshStandardMaterial({ color: "#0b1722", roughness: .25, metalness: .35 }));
  const cyan = k.material(new THREE.MeshBasicMaterial({ color: "#78cec9" }));
  // The apparatus is an explicit alignment rig, suspended on real sliding carriages.
  k.box(scene, iron, [0, .72, -.1], [2.5, .18, 3.5], .04);
  for (const x of [-1.05, 1.05]) for (const z of [-1.5, 1.3]) k.box(scene, iron, [x, .34, z], [.12, .68, .12], .012);
  for (const x of [-.64, .64]) k.rod(scene, alloy, [x, .88, -1.65], [x, .88, 1.65], .025);
  const carriage = new THREE.Group(); scene.add(carriage); preserve.add(carriage);
  k.box(carriage, alloy, [0, .95, 0], [1.5, .12, .35], .014);
  for (const x of [-.64, .64]) { k.cylinder(carriage, iron, [x, .97, 0], .065, .16); k.rod(carriage, alloy, [x, 1, 0], [x, 1.32, 0], .018); }
  const moving = new THREE.Group(), fixed = new THREE.Group(); scene.add(moving, fixed); preserve.add(moving); fixed.position.set(0, 1.7, -.9); moving.position.set(.28, 1.58, 1.65);
  const ring = (parent: THREE.Group, z: number) => {
    k.torus(parent, alloy, [0, 0, z], .29, .04);
    k.torus(parent, iron, [0, 0, z + .015], .225, .022);
    for (let i = 0; i < 12; i++) {
      const a = i * Math.PI / 6, x = Math.cos(a) * .29, y = Math.sin(a) * .29;
      k.sphere(parent, brass, [x, y, z + .035], .016);
    }
    for (const x of [-.12, .12]) k.box(parent, paper, [x, 0, z + .04], [.05, .012, .008], 0);
    k.box(parent, paper, [0, .12, z + .04], [.012, .05, .008], 0);
  };
  const body = (parent: THREE.Group, forward: number) => {
    const cylinder = k.cylinder(parent, alloy, [0, 0, 0], .4, .72); cylinder.rotation.x = Math.PI / 2;
    const cone = k.cylinder(parent, enamel, [0, 0, forward * .43], .39, .24, .26); cone.rotation.x = forward * Math.PI / 2;
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4;
      k.rod(parent, iron, [Math.sin(a) * .402, Math.cos(a) * .402, -.3], [Math.sin(a) * .402, Math.cos(a) * .402, .3], .006);
    }
    for (const z of [-.3, .27]) k.torus(parent, gold, [0, 0, z], .4, .025);
    k.box(parent, dark, [0, .395, .05], [.2, .025, .18], .025);
    for (const x of [-.22, .22]) k.rod(parent, brass, [x, .3, -.2], [x * 1.5, .58, -.3], .007);
    ring(parent, forward * .6);
  };
  body(fixed, 1); body(moving, -1);
  const service = k.cylinder(fixed, gold, [0, 0, -.6], .43, .4); service.rotation.x = Math.PI / 2;
  for (const x of [-.7, .7]) { k.box(fixed, dark, [x, 0, -.6], [.65, .035, .65], .004); for (let i = -3; i <= 3; i++) k.rod(fixed, brass, [x - .28, .025, -.6 + i * .08], [x + .28, .025, -.6 + i * .08], .002); }
  // A large mission plotting panel carries a physical Earth disc and trajectory arcs.
  k.box(scene, dark, [0, 2.35, -3.48], [3.1, 2.1, .1], .02);
  const earthMap = k.texture(512, 256, (c, w, h) => { c.fillStyle = "#284d65"; c.fillRect(0, 0, w, h); c.fillStyle = "#6d8a71"; for (let i = 0; i < 65; i++) { const x = (i * 83) % w, y = 30 + (i * 47) % 190; c.beginPath(); c.ellipse(x, y, 12 + i % 20, 7 + i % 12, i, 0, Math.PI * 2); c.fill(); } c.strokeStyle = "#a8b8ab"; for (let y = 0; y < h; y += 32) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); } });
  const earth = k.sphere(scene, k.material(new THREE.MeshStandardMaterial({ map: earthMap, roughness: .7, emissive: "#204761", emissiveIntensity: .25 })), [0, 2.4, -3.1], .55); preserve.add(earth);
  const orbit = k.torus(scene, brass, [0, 2.4, -3.15], .85, .008); orbit.rotation.z = -.35;
  for (let i = 0; i < 44; i++) k.sphere(scene, cyan, [-1.45 + k.random() * 2.9, 1.4 + k.random() * 1.9, -3.4], .004 + k.random() * .006);
  const screenMap = k.texture(640, 480, () => {}), screenMat = k.material(new THREE.MeshBasicMaterial({ map: screenMap }));
  const close = { position: [2.1, 2.3, 3.6] as [number, number, number], target: [0, 1.65, -.1] as [number, number, number] };
  const add = (id: string, object: THREE.Object3D, action: string, title: string) => { object.userData.spot = id; preserve.add(object); spots.push({ id, object, action, title, detail: title, view: close }); };
  for (const side of [-1, 1]) {
    const console = new THREE.Group(); scene.add(console); console.position.set(side * 2.25, .9, .8); console.rotation.y = -side * .3;
    k.box(console, enamel, [0, -.35, 0], [1.15, .9, 1.1], .04);
    const panel = new THREE.Group(); console.add(panel); panel.rotation.x = -.28;
    k.box(panel, iron, [0, .18, -.14], [1.1, .12, .9], .015);
    const screen = k.mesh(panel, new THREE.PlaneGeometry(.72, .54), screenMat, [0, .24, -.2]); screen.rotation.x = -Math.PI / 2; screen.castShadow = false; preserve.add(console);
    for (let i = 0; i < 9; i++) k.cylinder(panel, i % 3 ? brass : cyan, [-.42 + i % 3 * .1, .25, .16 + Math.floor(i / 3) * .09], .019, .026);
    for (const sign of [-1, 1]) {
      const control = k.sphere(console, sign < 0 ? gold : dark, [sign * .25, .35, .4], .07);
      add(`control-${side}-${sign}`, control, side < 0 ? sign < 0 ? "left" : "right" : sign < 0 ? "yaw-left" : "yaw-right", side < 0 ? sign < 0 ? "向左平移" : "向右平移" : sign < 0 ? "向左偏航" : "向右偏航");
    }
  }
  const docking = k.sphere(scene, cyan, [0, 1.05, 1.55], .075); add("dock", docking, "primary", "推进或对接");
  room.finish(preserve); let last = "";
  return { game, spots, pickables: spots.map(s => s.object), views: { wide: { position: [3.8, 2.8, 5.8], target: [0, 1.4, -.3] }, close, side: { position: [-3.1, 2.1, .5], target: [0, 1.7, -.1] }, painting: { position: [0, 2.5, 0], target: [0, 2.4, -3.2] } }, update(_phase, time) {
    moving.position.set(game.x * .14, 1.7 + game.y * .12, .3 + (3 - game.passed) * .45); moving.rotation.y = game.yaw * .09; carriage.position.z = moving.position.z; earth.rotation.y = time * .018;
    const key = `${game.x}:${game.y}:${game.yaw}:${game.passed}`; if (last === key) return; last = key;
    const c = (screenMap.image as HTMLCanvasElement).getContext("2d")!; c.fillStyle = "#071b1d"; c.fillRect(0, 0, 640, 480); c.strokeStyle = "#477d73"; for (let i = 0; i < 640; i += 40) { c.beginPath(); c.moveTo(i, 0); c.lineTo(i, 480); c.stroke(); } for (let i = 0; i < 480; i += 40) { c.beginPath(); c.moveTo(0, i); c.lineTo(640, i); c.stroke(); }
    c.strokeStyle = "#a3d8ae"; c.lineWidth = 3; c.strokeRect(270, 170, 100, 100); c.strokeStyle = "#f2c078"; c.strokeRect(270 + game.x * 26, 170 - game.y * 26, 100, 100);
    c.fillStyle = "#b7e1c2"; c.font = "bold 25px monospace"; c.fillText("ORBITAL ALIGNMENT TRAINER", 30, 45); c.fillText(`X ${game.x}  Y ${game.y}  YAW ${game.yaw}`, 45, 370); c.fillText(`CHECKPOINT ${game.passed}/3`, 45, 415); c.fillText(game.passed === 3 ? "SOFT DOCK CONFIRMED" : "ZERO ALL AXES THEN ADVANCE", 30, 460); screenMap.needsUpdate = true;
  } };
}
