import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Kit } from "../shared/geometry.ts";
import type { Vec3 } from "../shared/worlds.ts";

import { curvedPanel } from "./display-geometry.ts";

export function hardware(k: Kit) {
  const { mesh, box, cylinder, rod, tube, torus, material, texture } = k;
  const coating = texture(256, 256, (c, w, h) => {
    c.fillStyle = "#e0e0e0"; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 10000; i++) { c.fillStyle = i % 2 ? "#ffffff12" : "#00000010"; c.fillRect(k.random() * w, k.random() * h, 1, 1); }
  });
  const grain = texture(512, 512, (c, w, h) => {
    c.fillStyle = "#cacaca"; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 3500; i++) { const y = k.random() * h, x = k.random() * w; c.strokeStyle = i % 2 ? "#ffffff20" : "#00000018"; c.lineWidth = .5; c.beginPath(); c.moveTo(x, y); c.lineTo(x + 30 + k.random() * 180, y); c.stroke(); }
  });
  // These are linear surface data, separate from the chassis colors.
  coating.colorSpace = grain.colorSpace = THREE.NoColorSpace;
  const graphite = material(new THREE.MeshStandardMaterial({ color: "#252d31", metalness: .28, roughness: .62, roughnessMap: coating, bumpMap: coating, bumpScale: .00012 }));
  const anodized = material(new THREE.MeshPhysicalMaterial({ color: "#a2aeae", metalness: .9, roughness: .34, roughnessMap: grain, bumpMap: grain, bumpScale: .00008, anisotropy: .65 }));
  const copper = material(new THREE.MeshStandardMaterial({ color: "#c39667", metalness: .9, roughness: .23 }));
  const rubber = material(new THREE.MeshStandardMaterial({ color: "#141c21", roughness: .84 }));
  const mint = material(new THREE.MeshStandardMaterial({ color: "#70b8a2", emissive: "#417c6d", emissiveIntensity: .22, metalness: .25, roughness: .34 }));
  const glass = material(new THREE.MeshPhysicalMaterial({ color: "#c2dcdb", transparent: true, opacity: .13, roughness: .11, metalness: .16, clearcoat: 1, side: THREE.DoubleSide, depthWrite: false }));
  const screenM = (map: THREE.CanvasTexture) => material(new THREE.MeshBasicMaterial({ map }));
  const screwG = new THREE.CylinderGeometry(.0034, .0034, .002, 12);
  function screw(parent: THREE.Object3D, at: Vec3, face = "top") {
    const o = mesh(parent, screwG, anodized, at);
    if (face === "front") o.rotation.x = Math.PI / 2;
    box(parent, rubber, [at[0], at[1] + (face === "top" ? .0011 : 0), at[2] + (face === "front" ? .0011 : 0)], face === "top" ? [.0037, .0003, .0008] : [.0037, .0008, .0003], 0);
  }
  function label(parent: THREE.Object3D, value: string, at: Vec3, width: number, height: number, horizontal = false) {
    const map = texture(512, 96, (c, w, h) => { c.fillStyle = "#172329"; c.fillRect(0, 0, w, h); c.fillStyle = "#bdc9c0"; c.font = "26px monospace"; c.textAlign = "center"; c.fillText(value, w / 2, 59); });
    const o = mesh(parent, new THREE.PlaneGeometry(width, height), material(new THREE.MeshStandardMaterial({ map, roughness: .65 })), at);
    if (horizontal) o.rotation.x = -Math.PI / 2;
    return o;
  }
  function ultraWide(parent: THREE.Object3D, map: THREE.CanvasTexture) {
    const group = new THREE.Group(); group.position.set(.18, 1.23, -.17); parent.add(group);
    mesh(group, curvedPanel(1.79, .514, 1.3, -.012), graphite);
    const rearM = material(graphite.clone()); rearM.side = THREE.BackSide;
    mesh(group, curvedPanel(1.79, .514, 1.3, -.038), rearM);
    // Thin rails close the chassis without flattening the curved front or rear.
    for (const y of [-.257, .257]) { const railM = material(anodized.clone()); railM.side = THREE.DoubleSide; mesh(group, curvedPanel(1.79, .013, 1.3, -.025), railM, [0, y, 0]); }
    for (const sign of [-1, 1]) {
      const a = sign * 1.79 / 2 / 1.3;
      const edge = box(group, graphite, [Math.sin(a) * 1.325, 0, 1.3 * (1 - Math.cos(a)) - .02], [.014, .515, .031], .003); edge.rotation.y = -a;
    }
    const screen = mesh(group, curvedPanel(1.75, .48, 1.3, .003), screenM(map)); screen.userData.spot = "terminal";
    const coatingM = material(glass.clone()); coatingM.opacity = .02; coatingM.clearcoat = .2;
    const coating = mesh(group, curvedPanel(1.75, .48, 1.3, .004), coatingM); coating.castShadow = false;
    // Rear ventilation follows the arc; the arm and its cable remain visible when walking around.
    for (let i = 0; i < 45; i++) {
      const x = -.68 + i * .031, a = x / 1.3;
      const vent = box(group, rubber, [Math.sin(a) * 1.338, .12, 1.3 * (1 - Math.cos(a)) - .04], [.014, .095, .002], .001); vent.rotation.y = -a;
    }
    box(group, graphite, [0, -.055, -.07], [.16, .18, .06], .015);
    rod(parent, anodized, [.18, .81, -.24], [.18, 1.04, -.28], .016);
    rod(parent, anodized, [.18, 1.04, -.28], [.28, 1.17, -.29], .014);
    rod(parent, anodized, [.28, 1.17, -.29], [.18, 1.2, -.25], .014);
    box(parent, graphite, [.18, .819, -.24], [.18, .021, .15], .02);
    tube(parent, rubber, [[.18, 1.23, -.25], [.32, 1.08, -.31], [.22, .85, -.35], [.38, .68, -.38]], .004);
    const camera = box(group, graphite, [.28, .276, .025], [.083, .031, .025], .007);
    const lens = cylinder(camera, glass, [0, 0, .016], .007, .003); lens.rotation.x = Math.PI / 2;
    mesh(group, new THREE.SphereGeometry(.002, 8, 6), mint, [.313, .276, .041]);
    const anchor = new THREE.Object3D(); anchor.position.set(.7, -.22, .2); group.add(anchor);
    return { group, screen, anchor };
  }
  function portrait(parent: THREE.Object3D, map: THREE.CanvasTexture) {
    const group = new THREE.Group(); group.position.set(-.98, 1.24, -.08); group.rotation.y = .2; group.rotation.x = -.04; parent.add(group);
    box(group, graphite, [0, 0, -.012], [.443, .756, .029], .012);
    const face = mesh(group, new THREE.PlaneGeometry(.419, .717), screenM(map), [0, 0, .004]); face.userData.spot = "terminal";
    rod(parent, anodized, [-.98, .815, -.16], [-.98, 1.1, -.16], .012);
    box(parent, graphite, [-.98, .82, -.16], [.16, .014, .13], .008);
    tube(parent, rubber, [[-.98, 1.06, -.13], [-1.03, .9, -.18], [-.96, .7, -.28]], .0035);
    return { group, screen: face };
  }
  function input(parent: THREE.Object3D) {
    const group = new THREE.Group(); group.position.set(-.18, .817, .48); parent.add(group); group.userData.spot = "input";
    const cap = new RoundedBoxGeometry(.028, .014, .027, 3, .0038);
    const legends = ["QWERTY", "ASDFGH", "ZXCVBN", "UIOP[]", "JKL;'=", "M,./-+"];
    const atlas = texture(768, 384, (c, w, h) => {
      c.clearRect(0, 0, w, h); c.fillStyle = "#ccd9d0"; c.textAlign = "center"; c.font = "30px monospace";
      legends.forEach((row, y) => [...row].forEach((value, x) => c.fillText(value, x * 128 + 64, y * 64 + 43)));
    });
    const legendM = material(new THREE.MeshBasicMaterial({ map: atlas, transparent: true, depthWrite: false }));
    for (const side of [-1, 1]) {
      const half = new THREE.Group(); half.position.set(side * .155, .016, 0); half.rotation.set(0, side * -.17, side * .08); group.add(half);
      box(half, anodized, [0, 0, 0], [.224, .025, .163], .008);
      box(half, graphite, [0, .013, 0], [.214, .008, .154], .007);
      for (let row = 0; row < 3; row++) for (let col = 0; col < 6; col++) {
        const x = -.0875 + col * .035, z = -.053 + row * .043 + Math.sin(col / 5 * Math.PI) * .008;
        mesh(half, cap, col === 0 && row === 0 ? copper : rubber, [x, .027, z]);
        const decal = new THREE.PlaneGeometry(.022, .022), uv = decal.attributes.uv!;
        for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) + col) / 6, 1 - (row + (side > 0 ? 3 : 0) + 1 - uv.getY(i)) / 6);
        const o = mesh(half, decal, legendM, [x, .0345, z]); o.rotation.x = -Math.PI / 2;
      }
      for (let i = 0; i < 3; i++) { const key = mesh(half, cap, i === 1 ? mint : rubber, [side * -.035 + i * .034, .025, .092]); key.rotation.y = -.2 * side; }
      for (const x of [-.099, .099]) screw(half, [x, .015, -.067]);
    }
    tube(parent, rubber, [[-.32, .824, .41], [-.36, .827, .32], [-.15, .826, .28], [0, .824, .4]], .0023);
    // A trackball and an encoder deck replace the oversized conventional mouse.
    const ball = new THREE.Group(); ball.position.set(.39, .817, .51); parent.add(ball); ball.userData.spot = "input";
    const shell = mesh(ball, new THREE.SphereGeometry(1, 36, 20, 0, Math.PI * 2, 0, Math.PI / 2), graphite); shell.scale.set(.068, .037, .089);
    const ballM = material(new THREE.MeshPhysicalMaterial({ color: "#976640", metalness: .35, roughness: .19, clearcoat: 1 }));
    mesh(ball, new THREE.SphereGeometry(.026, 40, 28), ballM, [.009, .038, -.007]);
    for (const x of [-.04, -.022]) box(ball, rubber, [x, .021, .032], [.014, .008, .037], .003);
    const deck = new THREE.Group(); deck.position.set(.75, .821, .49); deck.rotation.y = -.1; parent.add(deck); deck.userData.spot = "terminal";
    box(deck, anodized, [0, 0, 0], [.225, .024, .15], .007);
    for (let i = 0; i < 6; i++) box(deck, i < 3 ? graphite : rubber, [-.074 + i % 3 * .039, .021, -.037 + Math.floor(i / 3) * .046], [.032, .014, .035], .004);
    cylinder(deck, graphite, [.073, .032, -.006], .026, .042);
    for (let i = 0; i < 32; i++) { const a = i * Math.PI / 16; rod(deck, anodized, [.073 + Math.cos(a) * .026, .018, -.006 + Math.sin(a) * .026], [.073 + Math.cos(a) * .026, .047, -.006 + Math.sin(a) * .026], .0009); }
    label(deck, "P / B / V", [-.036, .030, .065], .116, .018, true);
    return { group, ball, deck };
  }
  function compute(parent: THREE.Object3D, map: THREE.CanvasTexture, preserve: Set<THREE.Object3D>) {
    const rack = new THREE.Group(); rack.position.set(2.08, .08, -.02); rack.rotation.y = -.16; parent.add(rack);
    box(rack, graphite, [0, .005, 0], [.64, .035, .62], .008);
    box(rack, graphite, [0, 1.12, 0], [.64, .035, .62], .008);
    box(rack, graphite, [0, .56, -.3], [.62, 1.1, .025], .005);
    box(rack, graphite, [-.3, .56, 0], [.025, 1.1, .61], .005);
    for (const x of [-.3, .3]) for (const z of [-.295, .295]) box(rack, anodized, [x, .56, z], [.017, 1.1, .017], .003);
    const panel = mesh(rack, new THREE.PlaneGeometry(.55, .22), screenM(map), [0, .96, .318]); preserve.add(panel);
    const boardM = material(new THREE.MeshStandardMaterial({ color: "#25483f", roughness: .62, metalness: .25 }));
    const fans: THREE.Object3D[] = [];
    for (let row = 0; row < 3; row++) {
      const y = .18 + row * .22;
      box(rack, graphite, [0, y, .29], [.55, .17, .045], .008);
      for (const x of [-.245, .245]) { box(rack, anodized, [x, y, .324], [.011, .09, .018], .003); screw(rack, [x, y + .059, .316], "front"); }
      box(rack, boardM, [.025, y, -.015], [.49, .016, .42], .003);
      box(rack, copper, [.1, y + .023, .015], [.25, .033, .23], .004);
      for (let chip = 0; chip < 6; chip++) box(rack, rubber, [-.14 + chip % 2 * .042, y + .018, -.17 + Math.floor(chip / 2) * .07], [.027, .012, .044], .002);
      for (let rail = 0; rail < 18; rail++) box(rack, anodized, [-.08 + rail * .012, y + .055, -.15], [.003, .044, .11], 0);
      const fan = new THREE.Group(); fan.position.set(-.09, y, .32); rack.add(fan); fans.push(fan); preserve.add(fan);
      torus(rack, anodized, [-.09, y, .32], .066, .003);
      const blades: THREE.BufferGeometry[] = [];
      for (let i = 0; i < 7; i++) {
        const shape = new THREE.Shape(); shape.moveTo(.012, -.008); shape.bezierCurveTo(.035, -.025, .063, -.022, .067, .01); shape.bezierCurveTo(.045, .012, .03, .022, .012, .008); shape.closePath();
        const g = new THREE.ShapeGeometry(shape, 8); g.rotateZ(i * Math.PI * 2 / 7); blades.push(g);
      }
      const merged = mergeGeometries(blades, false)!; blades.forEach(g => g.dispose());
      const rotor = mesh(fan, merged, rubber); rotor.castShadow = false;
      const hub = cylinder(fan, anodized, [0, 0, .003], .014, .009); hub.rotation.x = Math.PI / 2; hub.castShadow = false;
      for (let vent = 0; vent < 15; vent++) box(rack, rubber, [.015 + vent * .013, y, .315], [.005, .08, .003], .001);
      label(rack, `NODE 0${row + 1}`, [.105, y + .057, .317], .17, .022);
    }
    // Closed coolant circuit behind the side window: a reservoir, rigid tubes and service fittings.
    const liquid = material(new THREE.MeshPhysicalMaterial({ color: "#386e67", emissive: "#21443f", emissiveIntensity: .18, roughness: .24, metalness: .2, transparent: true, opacity: .8 }));
    cylinder(rack, glass, [.245, .6, -.08], .038, .53); cylinder(rack, liquid, [.245, .59, -.08], .031, .47);
    for (const y of [.328, .87]) cylinder(rack, copper, [.245, y, -.08], .041, .018);
    for (let row = 0; row < 3; row++) {
      const y = .21 + row * .22;
      tube(rack, copper, [[.22, y, .06], [.25, y, .1], [.272, y + .045, .11], [.272, .84 - row * .02, .11], [.245, .86, -.08]], .007);
      for (const z of [.065, .095]) { const fitting = cylinder(rack, anodized, [.225, y, z], .011, .017); fitting.rotation.x = Math.PI / 2; }
    }
    const side = mesh(rack, new THREE.PlaneGeometry(.56, 1.01), glass, [.314, .565, 0]); side.rotation.y = Math.PI / 2; side.castShadow = false;
    const service = new THREE.Object3D(); service.position.set(.34, .68, -.08); rack.add(service);
    const proxyM = material(new THREE.MeshBasicMaterial({ visible: false }));
    const frontHit = box(rack, proxyM, [0, .58, .32], [.63, 1.15, .1]); frontHit.userData.spot = "compute";
    const sideHit = box(rack, proxyM, [.32, .6, 0], [.1, .95, .58]); sideHit.userData.spot = "cooling";
    return { rack, fans, service, frontHit, sideHit };
  }
  return { graphite, anodized, copper, rubber, mint, glass, screenM, screw, label, ultraWide, portrait, input, compute };
}
