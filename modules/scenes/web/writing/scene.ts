import * as THREE from "three";
import type { Kit, Model, Spot, View } from "../shared/geometry.ts";
import { workshop, type WorkshopAssets } from "../games/workshop.ts";
import { createWritingGame } from "../games/craft-state.ts";

export function build(scene: THREE.Scene, k: Kit, assets: WorkshopAssets, renderer: THREE.WebGLRenderer): Model {
  const room = workshop(scene, k, renderer, assets, { theme: "clay", open: true });
  const { box, cylinder, sphere, rod, mesh, material } = k;
  const clay = material(new THREE.MeshStandardMaterial({ ...assets.wall, color: "#ad7951", roughness: .94, normalScale: new THREE.Vector2(.16, .16) }));
  const damp = material(new THREE.MeshPhysicalMaterial({ color: "#b38660", roughness: .65, clearcoat: .17, clearcoatRoughness: .5 }));
  const incision = material(new THREE.MeshStandardMaterial({ color: "#543923", roughness: 1 }));
  const reed = material(new THREE.MeshStandardMaterial({ color: "#be9b62", roughness: .88 }));
  const ink = material(new THREE.MeshStandardMaterial({ color: "#735436", roughness: 1 }));
  const preserve = new Set<THREE.Object3D>(), spots: Spot[] = [], pickables: THREE.Object3D[] = [];
  const target: [number, number, number] = [0, .95, 0];
  const close: View = { position: [1.65, 2.3, 2.25], target };
  const game = createWritingGame(); let pulse = 0, lastSlip = "";
  const originalAct = game.act, originalDemo = game.demo;
  game.demo = () => { originalDemo(); pulse = 1; };
  game.act = (id) => { originalAct(id); if (id === "register" || id === "primary") pulse = 1; };
  function spot(id: string, title: string, detail: string, object: THREE.Object3D, action: string) {
    preserve.add(object); object.traverse(o => { if (o instanceof THREE.Mesh) { o.userData.spot = id; pickables.push(o); } });
    spots.push({ id, title, detail, object, action, view: close });
  }
  // The low stone accountant's desk has a thick worn top, mortised wooden stretcher and clay tablet cradle.
  box(scene, room.stone, [0, .81, 0], [2.6, .16, 1.48], .06);
  for (const x of [-1.05, 1.05]) for (const z of [-.52, .52]) {
    box(scene, room.wood, [x, .39, z], [.18, .78, .18], .018);
    cylinder(scene, room.brass, [x, .13, z], .105, .065);
  }
  for (const z of [-.52, .52]) box(scene, room.wood, [0, .3, z], [2.3, .12, .1]);
  box(scene, room.wood, [0, .95, -.05], [1.04, .085, 1.05]);
  for (const x of [-.55, .55]) box(scene, room.wood, [x, 1.02, -.05], [.045, .16, 1.13]);
  const tablet = new THREE.Group(); tablet.position.set(0, 1.02, -.05); scene.add(tablet);
  box(tablet, damp, [0, 0, 0], [.95, .105, 1], .065);
  for (let i = 0; i < 4; i++) box(tablet, incision, [0, .054, -.37 + i * .25], [.8, .004, .009], .001);
  // Every row carries the most wedges and both mark styles; the order recorded in the row decides which show.
  const records: Array<{ line: THREE.Group; wedges: THREE.Mesh[]; grain: THREE.Mesh[]; sheep: THREE.Mesh[] }> = [];
  for (let row = 0; row < 3; row++) {
    const line = new THREE.Group(); tablet.add(line);
    const wedges = Array.from({ length: 5 }, (_, j) => {
      const wedge = mesh(line, new THREE.ConeGeometry(.023, .085, 3), incision, [-.29 + j * .11, .055, -.26 + row * .25]);
      wedge.rotation.set(Math.PI / 2, 0, Math.PI / 5); return wedge;
    });
    const marks = (count: number, turn: number) => Array.from({ length: count }, (_, j) => {
      const mark = box(line, incision, [.28 + (j % 2) * .045, .057, -.29 + row * .25 + j * .04], [.012, .003, .07], 0);
      mark.rotation.y = turn; return mark;
    });
    records.push({ line, wedges, grain: marks(3, .45), sheep: marks(2, -.6) });
  }
  const stylus = new THREE.Group(); stylus.position.set(.05, .05, .03); tablet.add(stylus);
  rod(stylus, reed, [0, 0, 0], [.3, .21, .1], .015); cylinder(stylus, incision, [0, -.015, 0], .02, .05, .006);
  spot("clay-tablet", "登记泥板", "核对货物与数量，然后把这一笔压进泥板。", tablet, "register");
  // Two tangible commodity selectors: a bowl of grain and a zoomorphic clay counting token.
  function vessel(parent: THREE.Object3D, x: number, y: number, z: number, scale: number, mat: THREE.Material) {
    const points = [[.12, 0], [.18, .06], [.24, .2], [.22, .36], [.13, .44], [.12, .5]].map(([a, b]) => new THREE.Vector2(a! * scale, b! * scale));
    return mesh(parent, new THREE.LatheGeometry(points, 48), mat, [x, y, z]);
  }
  const grain = new THREE.Group(); grain.position.set(-.93, .9, -.21); scene.add(grain);
  vessel(grain, 0, 0, 0, .72, clay);
  for (let i = 0; i < 62; i++) {
    const angle = i * 2.399, radius = Math.sqrt(i / 62) * .135;
    const seed = sphere(grain, reed, [Math.cos(angle) * radius, .26 + .025 * Math.cos(i * .4), Math.sin(angle) * radius], .018);
    seed.scale.set(1, .55, .58); seed.rotation.y = angle;
  }
  spot("grain-bowl", "选择谷物", "委托要求谷物时，点击谷物碗。", grain, "grain");
  const sheep = new THREE.Group(); sheep.position.set(.94, 1.03, -.13); scene.add(sheep);
  sphere(sheep, clay, [0, .08, 0], .13).scale.set(1.3, .8, .68);
  sphere(sheep, damp, [-.15, .14, .015], .065).scale.set(.8, 1.2, .8);
  for (const x of [-.09, .08]) for (const z of [-.048, .048]) rod(sheep, clay, [x, .05, z], [x, -.08, z], .018);
  for (const z of [-.045, .045]) rod(sheep, reed, [-.17, .17, z], [-.18, .225, z * 1.4], .012);
  box(sheep, room.wood, [0, -.11, 0], [.38, .035, .29]);
  spot("sheep-token", "选择羊群", "委托要求羊群时，点击羊形陶筹。", sheep, "sheep");
  const counters = new THREE.Group(); counters.position.set(0, .92, .63); scene.add(counters);
  box(counters, room.wood, [0, 0, 0], [.79, .045, .2]);
  const stones: THREE.Mesh[] = [];
  for (let i = 0; i < 5; i++) { const token = sphere(counters, clay, [-.3 + i * .15, .05, 0], .045); token.scale.y = .55; stones.push(token); }
  spot("counting-stones", "数量加一", "每次点击加一，五份之后回到一份。", counters, "quantity");
  // The order slip: the order to record, leaning against the front of the desk.
  const slipMap = k.texture(512, 256, () => {});
  const slip = mesh(scene, new THREE.PlaneGeometry(.46, .23), material(new THREE.MeshStandardMaterial({ map: slipMap, roughness: .9 })), [-.72, .975, .6]);
  slip.rotation.x = -1.05; slip.castShadow = false; preserve.add(slip);
  // Shelved tablets, terracotta jars, reed bundles and incised wall panels echo the warm Sumerian relief.
  for (let i = 0; i < 7; i++) {
    const x = -1.4 + (i % 4) * .33, y = .3 + Math.floor(i / 4) * .23;
    box(scene, clay, [x, y, -2.8], [.28, .18, .39], .04);
    for (let j = 0; j < 4; j++) box(scene, incision, [x - .09 + j * .055, y + .025, -2.598], [.012, .08, .004], 0);
  }
  box(scene, room.wood, [-.9, .15, -2.8], [1.8, .12, .72]);
  for (const [x, z, scale] of [[1.9, -2.5, 1.65], [2.45, -2.7, 1.25], [-2.1, -2.7, 1.45]]) {
    vessel(scene, x!, .02, z!, scale!, clay);
    for (let j = 0; j < 3; j++) { const band = k.torus(scene, ink, [x!, .22 * scale! + j * .08, z!], .23 * scale!, .009); band.rotation.x = Math.PI / 2; }
  }
  for (let i = 0; i < 18; i++) rod(scene, reed, [-2.5 + i * .009, .08, -2], [-2.4 + i * .016, .85 + (i % 5) * .05, -2.08], .008);
  for (const x of [-1.5, 0, 1.5]) {
    box(scene, clay, [x, 2.18, -3.59], [1.32, .82, .07], .025);
    for (let i = 0; i < 5; i++) for (let j = 0; j < 3; j++) {
      const mark = box(scene, incision, [x - .46 + i * .22, 1.94 + j * .2, -3.545], [.022, .11, .008], .002); mark.rotation.z = (i % 2 ? 1 : -1) * .4;
    }
  }
  room.finish(preserve);
  return {
    game, spots, pickables,
    views: { wide: { position: [3.1, 2.8, 5.5], target: [0, .95, -.6] }, close, side: { position: [-2.6, 1.9, 1.7], target }, painting: { position: [0, 1.9, 5.8], target: [0, 1.3, -1] } },
    update(_phase, _time, delta) {
      const state = game.snapshot(), { orders, row } = game.view();
      records.forEach((record, i) => {
        const order = orders[i]!; record.line.visible = i < row;
        record.wedges.forEach((wedge, j) => { wedge.visible = j < order.count; });
        for (const mark of record.grain) mark.visible = order.kind === "grain";
        for (const mark of record.sheep) mark.visible = order.kind === "sheep";
      });
      const order = orders[Math.min(row, 2)]!, slipKey = `${row}:${order.kind}:${order.count}`;
      if (slipKey !== lastSlip) {
        lastSlip = slipKey;
        const c = slipMap.image.getContext("2d")!; c.fillStyle = "#c9a778"; c.fillRect(0, 0, 512, 256); c.fillStyle = "#4b3420";
        c.font = "bold 34px monospace"; c.fillText(row === 3 ? "ALL RECORDED" : `ORDER ${row + 1} / 3`, 28, 72);
        c.font = "bold 46px monospace"; if (row < 3) c.fillText(`${order.kind === "grain" ? "GRAIN" : "SHEEP"} x ${order.count}`, 28, 160);
        slipMap.needsUpdate = true;
      }
      const count = Number(state.readings[1]); stones.forEach((s, i) => { s.position.y = i < count ? .09 : .035; });
      pulse = Math.max(0, pulse - delta * 2.5); stylus.position.set(.05, .05 + Math.sin(pulse * Math.PI) * .15, .03); stylus.rotation.z = -.2 - Math.sin(pulse * Math.PI) * .35;
    },
    canMove(x, z) { return Math.abs(x) < 4.3 && z > -3.1 && z < 3.8 && !(Math.abs(x) < 1.5 && Math.abs(z) < .95); },
  };
}
