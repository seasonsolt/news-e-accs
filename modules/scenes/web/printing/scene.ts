import * as THREE from "three";
import type { Kit, Model, Spot, View } from "../shared/geometry.ts";
import { workshop, type WorkshopAssets } from "../games/workshop.ts";
import { createPrintingGame } from "../games/craft-state.ts";

export function build(scene: THREE.Scene, k: Kit, assets: WorkshopAssets, renderer: THREE.WebGLRenderer): Model {
  const room = workshop(scene, k, renderer, assets, { theme: "print" });
  const { box, cylinder, sphere, rod, mesh, material } = k;
  const darkWood = material(new THREE.MeshPhysicalMaterial({ ...assets.floor, color: "#59432d", roughness: .7, clearcoat: .14 }));
  const typeMetal = material(new THREE.MeshStandardMaterial({ color: "#96958a", metalness: .78, roughness: .4 }));
  const black = material(new THREE.MeshStandardMaterial({ color: "#151611", roughness: .68 }));
  const stain = material(new THREE.MeshStandardMaterial({ color: "#413a2d", roughness: .95 }));
  const preserve = new Set<THREE.Object3D>(), spots: Spot[] = [], pickables: THREE.Object3D[] = [];
  const game = createPrintingGame(); let pressPulse = 0, inkPulse = 0;
  const originalDemo = game.demo; game.demo = () => {
    const before = game.snapshot(); originalDemo(); const after = game.snapshot();
    if (before.readings[2] !== after.readings[2]) pressPulse = 1;
    else if (before.readings[1] !== after.readings[1]) inkPulse = 1;
  };
  const originalAct = game.act; game.act = id => { originalAct(id); if (id === "press" || id === "primary") pressPulse = 1; if (id === "ink") inkPulse = 1; };
  const target: [number, number, number] = [0, 1.15, -.3];
  const close: View = { position: [2.2, 2.25, 2.5], target: [0, 1.03, 0] };
  function spot(id: string, title: string, detail: string, object: THREE.Object3D, action: string, view = close) {
    preserve.add(object); object.traverse(o => { if (o instanceof THREE.Mesh) { o.userData.spot = id; pickables.push(o); } });
    spots.push({ id, title, detail, object, action, view });
  }
  // The monumental timber screw press has mortised cheeks, iron straps, a real helical thread and travelling platen.
  for (const x of [-.74, .74]) {
    box(scene, darkWood, [x, 1.26, -.48], [.23, 2.52, .34], .024);
    box(scene, darkWood, [x, .1, -.25], [.43, .2, 1.76], .018);
    for (const y of [.42, 1.78, 2.24]) {
      box(scene, room.iron, [x, y, -.48], [.245, .12, .355], .007);
      for (const z of [-.66, -.3]) sphere(scene, room.brass, [x, y, z], .022).scale.z = .45;
    }
  }
  for (const y of [.57, 1.88, 2.4]) box(scene, darkWood, [0, y, -.48], [1.82, .19, .4], .018);
  box(scene, darkWood, [0, .78, -.1], [1.4, .16, 1.45], .02);
  for (const x of [-.46, .46]) box(scene, room.iron, [x, .89, -.1], [.045, .035, 1.5], .003);
  const carriage = new THREE.Group(); carriage.position.set(0, .93, .02); scene.add(carriage); preserve.add(carriage);
  box(carriage, room.wood, [0, 0, 0], [1.16, .08, 1.14]);
  box(carriage, room.iron, [0, .064, 0], [.99, .045, .95], .005);
  const type = new THREE.Group(); carriage.add(type); preserve.add(type);
  for (let row = 0; row < 9; row++) for (let col = 0; col < 12; col++) {
    const x = -.4 + col * .073, z = -.35 + row * .08;
    box(type, typeMetal, [x, .103, z], [.064, .045, .067], .002);
    const raised = box(type, black, [x, .128, z], [.009, .006, .04], .001);
    raised.rotation.y = (row + col) % 2 ? .4 : -.4;
    if ((row + col) % 3) box(type, black, [x + .013, .128, z + .011], [.031, .006, .008], .001);
  }
  for (const x of [-.5, .5]) box(carriage, room.brass, [x, .1, 0], [.023, .065, 1]);
  const platen = new THREE.Group(); platen.position.set(0, 1.4, -.15); scene.add(platen); preserve.add(platen);
  box(platen, darkWood, [0, 0, 0], [1.18, .16, 1.14]);
  box(platen, room.iron, [0, -.09, 0], [1.08, .035, 1.04], .006);
  for (const x of [-.38, .38]) cylinder(platen, room.brass, [x, .09, 0], .027, .045);
  const screw = new THREE.Group(); screw.position.set(0, 1.5, -.48); scene.add(screw); preserve.add(screw);
  cylinder(screw, darkWood, [0, .39, 0], .095, .94);
  const helix: [number, number, number][] = [];
  for (let i = 0; i <= 264; i++) { const a = i / 264 * Math.PI * 22; helix.push([Math.cos(a) * .108, -.03 + i / 264 * .9, Math.sin(a) * .108]); }
  k.tube(screw, room.brass, helix, .016);
  cylinder(screw, room.iron, [0, 0, 0], .14, .08);
  const lever = new THREE.Group(); lever.position.set(0, 1.71, -.48); scene.add(lever);
  rod(lever, darkWood, [-.75, 0, .12], [.83, 0, .12], .032);
  for (const x of [-.77, .85]) sphere(lever, room.wood, [x, 0, .12], .067);
  spot("press-bar", "扳动压印杆", "完成排字、校对和上墨，再压印；每份都需要新墨。", lever, "press");
  // A typecase is a genuine grid of compartments with individual metal sorts, set on a separate sloped trestle.
  const caseGroup = new THREE.Group(); caseGroup.position.set(-2.03, .98, -.35); caseGroup.rotation.x = .22; scene.add(caseGroup);
  box(caseGroup, darkWood, [0, 0, 0], [1.3, .08, 1.02]);
  for (let row = 0; row <= 5; row++) box(caseGroup, room.wood, [0, .055, -.48 + row * .19], [1.28, .1, .025], .003);
  for (let col = 0; col <= 6; col++) box(caseGroup, room.wood, [-.62 + col * .205, .055, 0], [.025, .1, .98], .003);
  for (let i = 0; i < 90; i++) {
    const col = i % 6, row = Math.floor(i / 6) % 5, n = Math.floor(i / 30);
    const sort = box(caseGroup, typeMetal, [-.53 + col * .205 + (n - 1) * .042, .07, -.39 + row * .19], [.03, .1, .05], .001);
    sort.rotation.z = ((i % 3) - 1) * .15;
  }
  spot("type-case", "排列活字", "从分格字盘排出一副字版；重新排字后需要再次校对。", caseGroup, "typeset", { position: [-3.25, 2.2, 1.5], target: [-1.6, 1, -.2] });
  for (const x of [-2.52, -1.54]) for (const z of [-.7, .1]) box(scene, darkWood, [x, .45, z], [.1, .9, .1]);
  box(scene, room.wood, [-2.03, .27, -.3], [1.23, .07, .07]);
  // An ink slab and two leather-covered ink balls; the handles visibly rise when the player inks.
  box(scene, darkWood, [1.9, .86, -.12], [1.35, .12, 1.14]);
  for (const x of [1.42, 2.38]) for (const z of [-.52, .28]) box(scene, darkWood, [x, .42, z], [.1, .84, .1]);
  const inkBalls = new THREE.Group(); inkBalls.position.set(1.9, .98, -.1); scene.add(inkBalls);
  box(inkBalls, room.stone, [0, -.025, 0], [1.03, .045, .75]);
  cylinder(inkBalls, black, [0, .004, 0], .24, .006);
  const balls = new THREE.Group(); inkBalls.add(balls);
  for (const x of [-.24, .24]) {
    sphere(balls, black, [x, .09, .07], .105).scale.y = .65;
    cylinder(balls, room.wood, [x, .22, .07], .025, .25, .038);
    sphere(balls, room.wood, [x, .355, .07], .043).scale.y = .7;
    k.torus(balls, room.brass, [x, .15, .07], .045, .008).rotation.x = Math.PI / 2;
  }
  spot("ink-balls", "字版上墨", "墨球把油墨铺在字面；每份压印消耗一次墨层。", inkBalls, "ink");
  const pageMap = k.texture(512, 640, (c, w, h) => {
    c.fillStyle = "#d7c9a6"; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 3200; i++) { c.fillStyle = i % 2 ? "#dfd2b5" : "#cfc09e"; c.fillRect((i * 191) % w, (i * 281) % h, 1, 1); }
    c.strokeStyle = "#473e2d"; c.lineWidth = 2; c.strokeRect(30, 28, w - 60, h - 56);
    c.fillStyle = "#28251e"; c.textAlign = "center"; c.font = "bold 40px Georgia"; c.fillText("ARS MEMORIA", w / 2, 100);
    c.font = "17px Georgia"; c.fillText("SCRIPTUM  ET  IMPRESSUM", w / 2, 137);
    c.textAlign = "left"; c.font = "17px Georgia";
    const lines = ["Ars longa, vita brevis.", "Littera manet et iter facit.", "Scientia per paginas crescit.", "Una forma, multae paginae."];
    for (let i = 0; i < 18; i++) c.fillText(lines[i % 4]!, 48, 190 + i * 21);
    c.textAlign = "center"; c.font = "16px Georgia"; c.fillText("MCDXL", w / 2, h - 44);
  });
  const printedPaper = material(new THREE.MeshStandardMaterial({ map: pageMap, roughness: .94, side: THREE.DoubleSide }));
  const proof = new THREE.Group(); proof.position.set(2.13, 1.42, -1.95); proof.rotation.x = -.18; scene.add(proof);
  box(proof, darkWood, [0, 0, 0], [.85, 1.04, .08]);
  mesh(proof, new THREE.PlaneGeometry(.71, .9), printedPaper, [0, 0, .046]);
  for (const x of [-.31, .31]) cylinder(proof, room.brass, [x, .44, .06], .02, .025).rotation.x = Math.PI / 2;
  spot("proof-stand", "校对字版", "阅读校样，确认字版后再印刷。", proof, "proof");
  for (const x of [1.89, 2.37]) rod(scene, darkWood, [x, 0, -1.7], [x, 1.65, -2.05], .03);
  // Suspended drying line and individually revealed completed sheets establish a visible result.
  for (const x of [-1.9, 1.9]) rod(scene, room.wood, [x, 0, -2.75], [x, 2.8, -2.75], .035);
  rod(scene, room.iron, [-1.9, 2.76, -2.75], [1.9, 2.76, -2.75], .01);
  const pages: THREE.Group[] = [];
  for (let i = 0; i < 3; i++) {
    const page = new THREE.Group(); page.position.set(-.9 + i * .9, 2.25, -2.75); scene.add(page); preserve.add(page); pages.push(page);
    mesh(page, new THREE.PlaneGeometry(.67, .86), printedPaper);
    for (const x of [-.23, .23]) box(page, room.wood, [x, .46, .012], [.035, .13, .04], .005);
  }
  // Paper stacks, bound books, quoin keys and a compositor's stool finish the reverse views.
  for (let i = 0; i < 13; i++) box(scene, room.paper, [1.9 + (i % 3) * .003, .94 + i * .007, -.43], [.49, .005, .37], .001);
  for (let i = 0; i < 9; i++) {
    const book = box(scene, i % 3 ? darkWood : stain, [-2.55 + i * .16, .49 + (i % 3) * .025, -2.9], [.12, .8 + (i % 3) * .05, .47], .01); book.rotation.z = i % 2 ? .06 : -.04;
    for (const y of [.24, .65]) box(scene, room.brass, [-2.55 + i * .16, y, -2.66], [.1, .02, .008], .002);
  }
  cylinder(scene, darkWood, [-2.7, .53, 1.1], .29, .08);
  for (let i = 0; i < 3; i++) { const a = i * Math.PI * 2 / 3; rod(scene, darkWood, [-2.7 + Math.cos(a) * .2, .5, 1.1 + Math.sin(a) * .2], [-2.7 + Math.cos(a) * .27, .02, 1.1 + Math.sin(a) * .27], .035); }
  room.finish(preserve);
  return {
    game, spots, pickables,
    views: { wide: { position: [4.1, 2.9, 5.7], target }, close, side: { position: [-3.4, 2.3, 2.5], target }, painting: { position: [0, 1.8, 6.4], target: [0, 1.3, -.6] } },
    update(_phase, time, delta) {
      const state = game.snapshot(), composed = state.readings[0] !== "空字版", copies = Number(state.readings[2].split(" / ")[0]);
      type.visible = composed; pages.forEach((p, i) => { p.visible = i < copies; p.rotation.y = Math.sin(time * .6 + i) * .035; });
      pressPulse = Math.max(0, pressPulse - delta * 1.8); const stroke = Math.sin(pressPulse * Math.PI);
      lever.rotation.y = stroke * 1.15; screw.rotation.y = stroke * 1.15; platen.position.y = 1.4 - stroke * .27;
      inkPulse = Math.max(0, inkPulse - delta * 2); balls.position.y = Math.sin(inkPulse * Math.PI) * .15;
    },
    canMove(x, z) { return !(Math.abs(x) < .95 && z > -1.2 && z < 1) && !(Math.abs(x) > 1.25 && Math.abs(x) < 2.7 && z > -.95 && z < .6); },
  };
}
