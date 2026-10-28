import * as THREE from "three";
import type { Kit, Model, Spot } from "../shared/geometry.ts";
import { workshop, type WorkshopAssets } from "../games/workshop.ts";
import { LogicGame } from "../games/modern-state.ts";

export function build(scene: THREE.Scene, k: Kit, assets: WorkshopAssets, renderer: THREE.WebGLRenderer): Model {
  const room = workshop(scene, k, renderer, assets, { theme: "logic" }), { iron, wood, brass, paper, glass } = room;
  const game = new LogicGame(), preserve = new Set<THREE.Object3D>(), spots: Spot[] = [];
  const enamel = k.material(new THREE.MeshPhysicalMaterial({ color: "#244d66", roughness: .32, metalness: .38, clearcoat: .5 }));
  const red = k.material(new THREE.MeshStandardMaterial({ color: "#9c3f30", roughness: .55 }));
  const black = k.material(new THREE.MeshStandardMaterial({ color: "#161c20", roughness: .48 }));
  const circuit = k.material(new THREE.MeshStandardMaterial({ color: "#84714d", roughness: .7 }));
  k.box(scene, wood, [0, .86, .15], [3.25, .15, 1.85], .035);
  for (const x of [-1.4, 1.4]) for (const z of [-.5, .8]) { k.box(scene, iron, [x, .42, z], [.1, .84, .1], .01); k.sphere(scene, brass, [x, .08, z], .07); }
  k.box(scene, enamel, [0, 1, .1], [2.65, .16, 1.4], .045);
  k.box(scene, circuit, [0, 1.1, -.05], [2.4, .045, 1], .015);
  // Oversized discrete components expose both the mechanical contacts and point-contact abstraction.
  for (const x of [-.75, 0, .75]) {
    for (const dx of [-.12, 0, .12]) k.rod(scene, brass, [x + dx, 1.14, -.2], [x + dx, 1.43, -.2], .012);
    k.cylinder(scene, black, [x, 1.48, -.2], .11, .2);
    k.torus(scene, brass, [x, 1.39, -.2], .11, .009).rotation.x = Math.PI / 2;
    for (const z of [.08, .27]) {
      k.rod(scene, brass, [x - .2, 1.14, z], [x + .2, 1.14, z], .008);
      const resistor = k.cylinder(scene, paper, [x, 1.17, z], .035, .23); resistor.rotation.z = Math.PI / 2;
      for (const dx of [-.07, -.03, .03, .07]) { const band = k.cylinder(scene, dx < 0 ? red : black, [x + dx, 1.17, z], .036, .012); band.rotation.z = Math.PI / 2; }
    }
    k.box(scene, iron, [x, 1.2, -.53], [.32, .12, .2], .01); k.box(scene, glass, [x, 1.35, -.53], [.3, .24, .18], .008);
    for (let i = 0; i < 7; i++) { const coil = k.torus(scene, brass, [x, 1.29, -.59 + i * .02], .065, .008); coil.rotation.x = Math.PI / 2; }
  }
  const wires = [[-.8, .62, "#ba553e"], [-.1, .38, "#d1b064"], [.65, .5, "#386b83"]] as const;
  for (const [x, height, color] of wires) {
    const material = k.material(new THREE.MeshStandardMaterial({ color, roughness: .55 }));
    k.tube(scene, material, [[x, 1.14, .42], [x - .2, 1.14 + height, .05], [x + .3, 1.14 + height, -.35], [x + .3, 1.14, -.43]], .012);
  }
  const switches: THREE.Group[] = [], lamps: THREE.MeshStandardMaterial[] = [];
  const close = { position: [1.9, 2.1, 2.6] as [number, number, number], target: [0, 1.15, .1] as [number, number, number] };
  const add = (id: string, object: THREE.Object3D, action: string, title: string) => { object.userData.spot = id; preserve.add(object); spots.push({ id, object, action, title, detail: title, view: close }); };
  for (let i = 0; i < 3; i++) {
    const x = -.82 + i * .82, lever = new THREE.Group(); scene.add(lever); lever.position.set(x, 1.13, .65); switches.push(lever);
    k.cylinder(lever, brass, [0, 0, 0], .1, .035); k.rod(lever, iron, [0, .02, 0], [0, .23, 0], .018); k.sphere(lever, i === 2 ? red : black, [0, .24, 0], .055);
    const lamp = k.material(new THREE.MeshStandardMaterial({ color: "#9aa78c", emissive: "#b0d583", emissiveIntensity: 0, roughness: .22 })); lamps.push(lamp); const bulb = k.sphere(scene, lamp, [x, 1.17, .44], .06); preserve.add(bulb);
    add(`switch-${i}`, lever, ["input-a", "input-b", "output"][i]!, ["切换输入 A", "切换输入 B", "切换预测输出"][i]!);
  }
  // Tape cabinets repeat the poster's deep-blue vertical rhythm, with actual layered reel hubs.
  const reels: THREE.Group[] = [];
  for (const x of [-3.05, 3.05]) {
    k.box(scene, enamel, [x, 1.35, -2], [1.1, 2.6, .8], .035);
    k.box(scene, black, [x, 1.65, -1.58], [.92, 1.65, .025], .006);
    for (const y of [1.28, 2.12]) {
      const reel = new THREE.Group(); scene.add(reel); reel.position.set(x, y, -1.53); preserve.add(reel); reels.push(reel);
      const disc = k.cylinder(reel, paper, [0, 0, 0], .33, .025); disc.rotation.x = Math.PI / 2;
      const tape = k.cylinder(reel, black, [0, 0, .02], .21, .025); tape.rotation.x = Math.PI / 2;
      for (let j = 0; j < 3; j++) { const arm = k.box(reel, paper, [Math.sin(j * Math.PI * 2 / 3) * .12, Math.cos(j * Math.PI * 2 / 3) * .12, .04], [.08, .22, .02], .025); arm.rotation.z = -j * Math.PI * 2 / 3; }
      k.sphere(reel, brass, [0, 0, .06], .045);
    }
    for (let i = 0; i < 7; i++) k.box(scene, iron, [x, .38 + i * .045, -1.57], [.8, .015, .03], .002);
  }
  const map = k.texture(1024, 640, () => {}), displayMaterial = k.material(new THREE.MeshBasicMaterial({ map }));
  for (const x of [-1.12, 1.12]) k.box(scene, iron, [x, 1.5, -2.3], [.065, 3, .14]);
  k.box(scene, enamel, [0, 2.25, -2.25], [2.4, 1.6, .16], .03);
  const display = k.mesh(scene, new THREE.PlaneGeometry(2.2, 1.38), displayMaterial, [0, 2.25, -2.16]); display.castShadow = false; preserve.add(display);
  const testButton = k.cylinder(scene, red, [1.22, 1.16, .62], .09, .07); add("test", testButton, "primary", "检验电路");
  room.finish(preserve); let last = "";
  return { game, spots, pickables: spots.map(s => s.object), views: { wide: { position: [3.6, 2.6, 5.5], target: [0, 1.2, -.4] }, close, side: { position: [-2.5, 1.8, 2.5], target: [0, 1.2, .1] }, painting: { position: [0, 2.2, .5], target: [0, 2.25, -2.2] } }, update(_phase, time) {
    [game.a, game.b, game.output].forEach((bit, i) => { switches[i]!.rotation.x = bit ? -.35 : .35; lamps[i]!.emissiveIntensity = bit ? 1.8 : .02; });
    for (const reel of reels) reel.rotation.z = Math.sin(time * .2) * .1;
    const key = `${game.a}:${game.b}:${game.output}:${game.passed}:${game.rows}`;
    if (key === last) return; last = key;
    const c = (map.image as HTMLCanvasElement).getContext("2d")!; c.fillStyle = "#102630"; c.fillRect(0, 0, 1024, 640); c.fillStyle = "#d8d0ad"; c.font = "bold 43px monospace"; c.fillText("DISCRETE LOGIC / AND", 48, 65); c.font = "30px monospace";
    c.fillText("ROW    A    B    EXPECTED    TEST", 48, 134);
    for (let row = 0; row < 4; row++) {
      const a = game.rows[row]! >> 1, b = game.rows[row]! & 1, passed = row < game.passed;
      c.fillStyle = row === game.passed ? "#efc471" : passed ? "#92c5a3" : "#7a8c8e";
      c.fillText(`${row + 1}      ${a}    ${b}       ${passed ? a & b : "?"}        ${passed ? "PASS" : "----"}`, 48, 205 + row * 66);
    }
    c.fillStyle = "#e7d5aa"; c.fillText(`SET: A=${game.a}  B=${game.b}  OUTPUT=${game.output}`, 48, 527); c.fillText(game.passed === 4 ? "FOUR ROWS VERIFIED" : "SET SWITCHES, THEN TEST", 48, 588); map.needsUpdate = true;
  } };
}
