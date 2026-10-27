import * as THREE from "three";
import type { Kit, Model, Spot } from "../shared/geometry.ts";
import { workshop, type WorkshopAssets } from "../games/workshop.ts";
import { FlightGame } from "../games/modern-state.ts";

export function build(scene: THREE.Scene, k: Kit, assets: WorkshopAssets, renderer: THREE.WebGLRenderer): Model {
  const room = workshop(scene, k, renderer, assets, { theme: "flight", open: true });
  const { wood, iron, brass, paper, glass } = room, game = new FlightGame(), preserve = new Set<THREE.Object3D>(), spots: Spot[] = [];
  const canvas = k.texture(1024, 512, (c, w, h) => {
    c.fillStyle = "#cbb98c"; c.fillRect(0, 0, w, h);
    for (let i = 0; i < w; i += 3) { c.strokeStyle = i % 9 ? "#c9b68b" : "#dbcda8"; c.beginPath(); c.moveTo(i, 0); c.lineTo(i, h); c.stroke(); }
    for (let y = 16; y < h; y += 40) { c.strokeStyle = "#a49573"; c.setLineDash([3, 6]); c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }
  });
  const linen = k.material(new THREE.MeshStandardMaterial({ map: canvas, roughness: .93, color: "#f2dfae", side: THREE.DoubleSide }));
  const blue = k.material(new THREE.MeshStandardMaterial({ color: "#20394a", roughness: .5, metalness: .25 }));
  // A launch rail, cross ties and threaded hold-downs ground the light airframe.
  for (let z = -1.4; z <= 1.4; z += .28) k.box(scene, wood, [0, .08, z], [2.9, .12, .12], .01);
  for (const x of [-.42, .42]) { k.box(scene, iron, [x, .16, 0], [.045, .065, 3.5], .005); for (let z = -1.4; z <= 1.4; z += .28) k.sphere(scene, brass, [x, .2, z], .018); }
  const plane = new THREE.Group(); scene.add(plane); plane.position.set(0, .58, 0); preserve.add(plane);
  for (const y of [.28, .86]) {
    k.box(plane, linen, [0, y, 0], [3.45, .045, .75], .012);
    for (const z of [-.34, .34]) k.rod(plane, wood, [-1.72, y, z], [1.72, y, z], .017);
    for (let x = -1.6; x <= 1.61; x += .2) {
      k.rod(plane, wood, [x, y + .028, -.35], [x, y + .05, .05], .004);
      k.rod(plane, wood, [x, y + .05, .05], [x, y + .028, .35], .004);
    }
  }
  for (const x of [-1.48, -.72, .72, 1.48]) for (const z of [-.29, .29]) {
    k.rod(plane, wood, [x, .28, z], [x, .86, z], .014);
    k.rod(plane, iron, [x, .28, z], [x > 0 ? x - .65 : x + .65, .86, z], .0025);
    k.sphere(plane, brass, [x, .29, z], .018);
  }
  for (const x of [-.3, .3]) {
    k.rod(plane, wood, [x, .25, -.35], [x, -.1, 1.05], .021);
    k.rod(plane, wood, [x, .25, .3], [x, .55, .98], .015);
  }
  const elevator = new THREE.Group(); plane.add(elevator); elevator.position.set(0, .39, 1.02);
  k.box(elevator, linen, [0, 0, 0], [1.12, .035, .36], .008);
  for (const x of [-.4, -.2, 0, .2, .4]) k.rod(elevator, wood, [x, .025, -.18], [x, .025, .18], .006);
  k.box(plane, iron, [.28, .4, -.1], [.36, .23, .3], .025);
  for (let i = 0; i < 4; i++) k.cylinder(plane, brass, [.18 + i * .065, .55, -.1], .024, .13);
  const props: THREE.Group[] = [];
  for (const x of [-.7, .7]) {
    k.rod(plane, iron, [x, .57, -.18], [x, .57, -.68], .025);
    const prop = new THREE.Group(); plane.add(prop); prop.position.set(x, .57, -.69); props.push(prop);
    k.box(prop, wood, [0, 0, 0], [.085, .68, .025], .018); k.sphere(prop, brass, [0, 0, .02], .045);
    k.tube(plane, iron, [[.3, .48, -.2], [x, .5, -.25], [x, .57, -.5]], .008);
  }
  const ballast = k.box(plane, brass, [0, .34, .12], [.2, .1, .15], .012);
  const lever = k.rod(scene, brass, [1.95, .85, .6], [1.95, 1.16, .49], .025); preserve.add(lever);
  k.box(scene, blue, [1.95, .69, .6], [.6, 1.3, .65], .04);
  for (let i = -2; i <= 2; i++) k.box(scene, paper, [1.8 + (i + 2) * .07, 1.35, .6], [.01, .005, .12], 0);
  // Independent wind-tunnel bench: honeycomb inlet, test wing, transparent inspection panels.
  k.box(scene, wood, [-2.7, .8, -.7], [1.3, .13, 1.7], .025);
  for (const x of [-3.2, -2.2]) for (const z of [-1.3, -.1]) k.box(scene, iron, [x, .4, z], [.07, .8, .07], .01);
  for (const y of [1.02, 1.62]) k.box(scene, wood, [-2.7, y, -.7], [1, .07, 1.3], .014);
  for (const x of [-3.16, -2.24]) { k.box(scene, glass, [x, 1.32, -.7], [.015, .52, 1.25], 0); for (const z of [-1.3, -.1]) k.rod(scene, brass, [x, 1, z], [x, 1.65, z], .014); }
  for (let x = -3.1; x < -2.29; x += .09) for (let y = 1.1; y < 1.6; y += .09) k.box(scene, iron, [x, y, -.045], [.06, .06, .09], .004);
  const testWing = k.box(scene, linen, [-2.7, 1.3, -.65], [.7, .035, .25], .015); testWing.rotation.x = -.15;
  k.rod(scene, brass, [-2.7, .91, -.65], [-2.7, 1.29, -.65], .012);
  const map = k.texture(768, 512, () => {}), screen = k.material(new THREE.MeshBasicMaterial({ map }));
  const board = k.box(scene, blue, [0, 2.35, -2.65], [2, 1.36, .1], .02);
  const card = k.mesh(scene, new THREE.PlaneGeometry(1.9, 1.26), screen, [0, 2.35, -2.59]); card.castShadow = false; preserve.add(card);
  const wide = { position: [3.8, 2.8, 5.8] as [number, number, number], target: [0, 1.1, -.2] as [number, number, number] };
  const close = { position: [2.6, 1.9, 3] as [number, number, number], target: [0, 1, .2] as [number, number, number] };
  const add = (id: string, object: THREE.Object3D, action: string, title: string) => { object.userData.spot = id; preserve.add(object); spots.push({ id, object, action, title, detail: title, view: close }); };
  add("ballast", ballast, "cg-right", "重心前移"); add("elevator", elevator, "elevator-up", "抬升舵面"); add("trial", lever, "primary", "试飞"); add("trim-card", board, "cg-left", "重心后移");
  room.finish(preserve);
  let last = "", attempts = 0, launchTime = -Infinity;
  return { game, spots, pickables: spots.map(s => s.object), views: { wide, close, side: { position: [-3.7, 2, 2.6], target: [-.6, 1, -.5] }, painting: { position: [0, 2.3, 1.1], target: [0, 2.3, -2.6] } }, update(_phase, time) {
    ballast.position.z = .1 + game.cg * .11; elevator.rotation.x = game.elevator * .1;
    if (game.attempts > attempts) launchTime = time;
    else if (game.attempts < attempts) launchTime = -Infinity;
    attempts = game.attempts;
    const flight = Math.max(0, 1 - (time - launchTime) / 2);
    plane.position.y = .58 + Math.sin((1 - flight) * Math.PI) * flight * .3; plane.position.z = -Math.sin((1 - flight) * Math.PI) * flight * .5;
    plane.rotation.x = flight * game.elevator * .035; for (const p of props) p.rotation.z = time * (flight ? 30 : .4);
    const key = `${game.passed}:${game.cg}:${game.elevator}:${game.attempts}:${game.targets[Math.min(2, game.passed)]}`;
    if (last !== key) { last = key; const c = (map.image as HTMLCanvasElement).getContext("2d")!, target = game.targets[Math.min(2, game.passed)]!; c.fillStyle = "#ead9ad"; c.fillRect(0, 0, 768, 512); c.fillStyle = "#20394a"; c.font = "bold 36px monospace"; c.fillText("FLIGHT / TRIM LAB", 40, 65); c.font = "28px monospace"; [`LEG ${Math.min(3, game.passed + 1)} / 3`, `TARGET CG ${target[0]}  ELEV ${target[1]}`, `ACTUAL CG ${game.cg}  ELEV ${game.elevator}`, `TRIALS ${game.attempts}`, game.passed === 3 ? "ALL LEGS VERIFIED" : "ADJUST, THEN TEST"].forEach((line, i) => c.fillText(line, 40, 145 + i * 66)); map.needsUpdate = true; }
  } };
}
