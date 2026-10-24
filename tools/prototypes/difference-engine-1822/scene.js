import * as THREE from "three";
import { OrbitControls } from "./vendor/OrbitControls.js";
import { RoomEnvironment } from "./vendor/RoomEnvironment.js";
import { mergeGeometries } from "./vendor/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "./vendor/addons/geometries/RoundedBoxGeometry.js";
import { createMaterials } from "./materials.js";
import { createWorkshopRenderer } from "./rendering.js";
import { initialRegisters, advanceRegisters, digits, canWalkTo } from "./calculation.js";

const $ = (id) => document.getElementById(id);
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
const mobile = () => innerWidth < 761;
let seed = 1822;
function random() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }

function canvasTexture(width, height, paint, repeat = null) {
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  paint(canvas.getContext("2d"), width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(...repeat); }
  texture.anisotropy = 4;
  return texture;
}

function makeDigitsTexture() {
  return canvasTexture(1280, 128, (c, w, h) => {
    c.fillStyle = "#9e8c61"; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 2500; i++) { c.fillStyle = "#2c20100c"; c.fillRect(random() * w, random() * h, random() * 8, 1); }
    c.font = "55px Georgia"; c.textAlign = "center"; c.textBaseline = "middle";
    for (let i = 0; i < 10; i++) {
      c.fillStyle = "#caba8f"; c.fillText(String(i), i * 128 + 65, 68);
      c.fillStyle = "#403a27"; c.fillText(String(i), i * 128 + 64, 67);
      c.fillStyle = "#5f4b2c"; c.fillRect(i * 128 + 122, 25, 1, 78);
    }
  });
}

const geometries = new Map();
function boxGeometry(x, y, z, grain = false) {
  const key = `box:${x}:${y}:${z}:${grain}`;
  if (!geometries.has(key)) {
    const radius = Math.min(.012, Math.min(x, y, z) * .12);
    const geometry = Math.min(x, y, z) > .04 && Math.max(x, y, z) < 6
      ? new RoundedBoxGeometry(x, y, z, 2, radius) : new THREE.BoxGeometry(x, y, z);
    const position = geometry.attributes.position, normal = geometry.attributes.normal, uv = geometry.attributes.uv;
    for (let i = 0; i < position.count; i++) {
      const nx = Math.abs(normal.getX(i)), ny = Math.abs(normal.getY(i)), nz = Math.abs(normal.getZ(i));
      if (ny >= nx && ny >= nz) uv.setXY(i, ...(grain && x > z ? [position.getZ(i),position.getX(i)] : [position.getX(i),position.getZ(i)]));
      else if (nx > nz) uv.setXY(i, ...(grain && z > y ? [position.getY(i),position.getZ(i)] : [position.getZ(i),position.getY(i)]));
      else uv.setXY(i, ...(grain && x > y ? [position.getY(i),position.getX(i)] : [position.getX(i),position.getY(i)]));
    }
    geometries.set(key, geometry);
  }
  return geometries.get(key);
}
function cylinderGeometry(r, h, segments = 32, r2 = r) {
  const key = `cylinder:${r}:${h}:${segments}:${r2}`;
  if (!geometries.has(key)) {
    if (r === r2 && r > .06 && h > .018) {
      const bevel = Math.min(.005, h * .17, r * .05);
      geometries.set(key, new THREE.LatheGeometry([[0,-h/2],[r-bevel,-h/2],[r,-h/2+bevel],[r,h/2-bevel],[r-bevel,h/2],[0,h/2]].map(([x,y]) => new THREE.Vector2(x,y)), segments));
    } else geometries.set(key, new THREE.CylinderGeometry(r, r2, h, segments));
  }
  return geometries.get(key);
}
function mesh(parent, geometry, material, x, y, z, shadow = true) {
  const object = new THREE.Mesh(geometry, material);
  object.position.set(x, y, z); object.castShadow = shadow; object.receiveShadow = shadow;
  parent.add(object); return object;
}
function box(parent, material, x, y, z, w, h, d, shadow = true) {
  return mesh(parent, boxGeometry(w, h, d, material.userData.grain), material, x, y, z, shadow);
}
function cylinder(parent, material, x, y, z, r, h, segments = 32, r2 = r) {
  return mesh(parent, cylinderGeometry(r, h, segments, r2), material, x, y, z);
}
function rod(parent, material, from, to, radius) {
  const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to), delta = b.clone().sub(a);
  const result = mesh(parent, cylinderGeometry(radius, delta.length(), 16), material, ...a.clone().add(b).multiplyScalar(.5).toArray());
  result.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
  return result;
}
function torus(parent, material, x, y, z, radius, tube, horizontal = false) {
  const key = `torus:${radius}:${tube}`;
  if (!geometries.has(key)) geometries.set(key, new THREE.TorusGeometry(radius, tube, 8, 64));
  const m = mesh(parent, geometries.get(key), material, x, y, z);
  if (horizontal) m.rotation.x = Math.PI / 2;
  return m;
}
function gearGeometry(radius, teeth, thickness, hole = .055) {
  const key = `gear:${radius}:${teeth}:${thickness}:${hole}`;
  if (geometries.has(key)) return geometries.get(key);
  const shape = new THREE.Shape();
  const profile = [.91,.93,1,1,.93,.91];
  for (let t = 0; t <= teeth * 6; t++) {
    const a = t / (teeth * 6) * Math.PI * 2, r = radius * profile[t % 6];
    if (t === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  shape.closePath();
  const center = new THREE.Path(); center.absarc(0, 0, hole, 0, Math.PI * 2, true); shape.holes.push(center);
  if (radius > .2) for (let i = 0; i < 6; i++) {
    const a = i * Math.PI / 3;
    const cutout = new THREE.Path(); cutout.absarc(Math.cos(a) * radius * .55, Math.sin(a) * radius * .55, radius * .16, 0, Math.PI * 2, true); shape.holes.push(cutout);
  }
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: true, bevelSegments: 1, steps: 1, bevelSize: .003, bevelThickness: .003, curveSegments: 12 });
  geometry.translate(0, 0, -thickness / 2); geometries.set(key, geometry); return geometry;
}

async function start() {
  const viewport = $("viewport");
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio, mobile() ? 1.5 : 1.75));
  renderer.setSize(viewport.clientWidth, viewport.clientHeight);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.18;
  viewport.append(renderer.domElement);
  renderer.domElement.setAttribute("aria-label", "工坊三维视图");
  renderer.domElement.setAttribute("tabindex", "0");

  const scene = new THREE.Scene(); scene.background = new THREE.Color("#31271f");
  scene.fog = new THREE.FogExp2("#6a5840", .012);
  const camera = new THREE.PerspectiveCamera(mobile() ? 51 : 43, viewport.clientWidth / viewport.clientHeight, .05, 70);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = .065;
  controls.minDistance = 1.3; controls.maxDistance = 20;
  controls.maxPolarAngle = Math.PI / 2 - .025; controls.minPolarAngle = .22;
  controls.panSpeed = .6; controls.rotateSpeed = .55; controls.zoomSpeed = .65;
  controls.mouseButtons.RIGHT = THREE.MOUSE.PAN;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = new RoomEnvironment();
  const env = pmrem.fromScene(environment, .04);
  scene.environment = env.texture; scene.environmentIntensity = .45;
  environment.dispose(); pmrem.dispose();

  const m = await createMaterials(renderer);

  scene.add(new THREE.HemisphereLight("#e4d6bc", "#35261b", .38));
  const sun = new THREE.DirectionalLight("#ffdfaa", 4.8); sun.position.set(7.5, 10, -10); sun.target.position.set(-1, .3, 4);
  sun.castShadow = true; sun.shadow.mapSize.set(mobile() ? 2048 : 4096, mobile() ? 2048 : 4096);
  Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 8, bottom: -7, near: 1, far: 38 });
  sun.shadow.bias = -.0001; sun.shadow.normalBias = .009; sun.shadow.radius = 3;
  scene.add(sun, sun.target);
  const front = new THREE.SpotLight("#e5c79b", 95, 20, .8, .7, 2);
  front.position.set(-3, 5, 5); front.target.position.set(0, 1.8, 0); scene.add(front, front.target);
  const cool = new THREE.DirectionalLight("#c5c6bd", .23); cool.position.set(-5, 4, 4); scene.add(cool);

  const room = new THREE.Group(); scene.add(room);
  // Scanned wood has independent fibre normals, roughness and occlusion at physical scale.
  const floor = mesh(room, new THREE.PlaneGeometry(18, 24), m.floor, 0, -.025, 3);
  floor.rotation.x = -Math.PI / 2; floor.castShadow = false;

  const wall = new THREE.Shape(); wall.moveTo(-7, 0); wall.lineTo(7, 0); wall.lineTo(7, 7.8); wall.lineTo(-7, 7.8); wall.closePath();
  const windowCenters = [1.7, 4.5];
  for (const x of windowCenters) {
    const hole = new THREE.Path(); hole.moveTo(x - 1.03, 1.4); hole.lineTo(x - 1.03, 5.3);
    hole.absarc(x, 5.3, 1.03, Math.PI, 0, true); hole.lineTo(x + 1.03, 1.4); hole.closePath(); wall.holes.push(hole);
  }
  mesh(room, new THREE.ExtrudeGeometry(wall, { depth: .4, bevelEnabled: false, curveSegments: 32 }), m.plaster, 0, 0, -4.75);
  box(room, m.plaster, -7, 3.9, 1.4, .35, 7.8, 12.2);
  box(room, m.plaster, 7, 3.9, 1.4, .35, 7.8, 12.2);
  for(const z of [-3.8,-.6,2.8,6.1])box(room,m.woodDark,-6.79,3.4,z,.15,6.8,.16);
  for(const y of [.65,2.5,5.1])box(room,m.woodDark,-6.78,y,1.1,.16,.12,11.8);
  box(room, m.woodDark, 0, 7.4, 1.3, 14.3, .25, 12.2);
  for (const z of [-3.9, -.6, 2.8, 6.2]) {
    box(room, m.woodDark, 0, 6.9, z, 14.2, .42, .33);
    for (const x of [-6.65, 6.65]) rod(room, m.woodDark, [x, 5.65, z], [x > 0 ? 5.55 : -5.55, 6.85, z], .14);
  }
  box(room, m.woodDark, 0, .23, -4.38, 14.2, .28, .17);
  for (const x of windowCenters) {
    box(room, m.trim, x, 1.36, -4.39, 2.43, .2, .65);
    for (const side of [-1, 1]) {
      box(room, m.woodDark, x + side * 1.025, 3.35, -4.46, .085, 3.9, .12);
      box(room, m.trim, x + side * 1.14, 3.35, -4.47, .18, 3.9, .44);
    }
    for (let i = 0; i < 13; i++) {
      const a = (i + .5) / 13 * Math.PI;
      const block = box(room, m.trim, x + Math.cos(a) * 1.15, 5.3 + Math.sin(a) * 1.15, -4.46, .26, .22, .4);
      block.rotation.z = a - Math.PI / 2;
    }
    const arch = new THREE.Shape(); arch.moveTo(-1.025, 0); arch.lineTo(-1.025, 3.9); arch.absarc(0, 3.9, 1.025, Math.PI, 0, true); arch.lineTo(1.025, 0); arch.closePath();
    mesh(room, new THREE.ShapeGeometry(arch, 32), m.glass, x, 1.4, -4.49, false);
    for (let pane = -2; pane <= 2; pane++) {
      const px = pane * .34, height = 3.9 + Math.sqrt(1.025 ** 2 - px ** 2);
      box(room, m.iron, x + px, 1.4 + height / 2, -4.43, .035, height, .04);
    }
    for (let y = 1.9; y < 6.1; y += .6) {
      const halfWidth = y > 5.3 ? Math.sqrt(1.025 ** 2 - (y - 5.3) ** 2) : 1.025;
      box(room, m.iron, x, y, -4.43, halfWidth * 2, .035, .04);
    }
  }
  const skyMap = canvasTexture(512, 512, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, "#c3c5b4"); g.addColorStop(.6, "#e8d9b9"); g.addColorStop(1, "#9f9c83"); c.fillStyle = g; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 20; i++) { c.fillStyle = "#d0c7ac20"; c.fillRect(0, random() * h, w, 3 + random() * 10); }
  });
  mesh(room, new THREE.PlaneGeometry(34, 17), new THREE.MeshBasicMaterial({ map: skyMap }), 0, 5, -14, false);
  const skyline = new THREE.MeshStandardMaterial({ color: "#777c6a", roughness: 1 });
  for (let i = 0; i < 35; i++) {
    const x = -16 + i * .95, h = .7 + random() * 2.5;
    box(room, skyline, x, h / 2, -9 - random() * 2.5, .7 + random() * .8, h, .8, false);
    box(room, skyline, x + .15, h + .27, -9.2, .14, .55, .2, false);
  }
  cylinder(room, skyline, 4.4, 3.1, -11.2, .67, .9, 32);
  const dome = new THREE.SphereGeometry(.69, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
  mesh(room, dome, skyline, 4.4, 3.55, -11.2, false); cylinder(room, skyline, 4.4, 4.35, -11.2, .06, .6, 8);
  cylinder(room,skyline,4.4,3.57,-11.2,.76,.13,48);
  for (let i=0;i<16;i++) {
    const a=i/16*Math.PI*2;
    cylinder(room,skyline,4.4+Math.cos(a)*.61,3.1,-11.2+Math.sin(a)*.61,.035,.78,8);
    const rib=[];
    for (let j=0;j<=16;j++) {
      const phi=j/16*Math.PI/2;
      rib.push(new THREE.Vector3(4.4+Math.cos(a)*Math.cos(phi)*.7,3.55+Math.sin(phi)*.7,-11.2+Math.sin(a)*Math.cos(phi)*.7));
    }
    mesh(room,new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rib),20,.009,4,false),skyline,0,0,0,false);
  }
  cylinder(room,skyline,4.4,4.3,-11.2,.13,.25,16);
  cylinder(room,skyline,4.4,4.49,-11.2,.17,.12,16,.05);
  rod(room,skyline,[4.4,4.5,-11.2],[4.4,4.83,-11.2],.018);
  rod(room,skyline,[4.31,4.73,-11.2],[4.49,4.73,-11.2],.014);

  // A complete, separately articulated engine. It has a back and a drive side, not a textured card.
  const machine = new THREE.Group(); scene.add(machine);
  const rotatingGears = [], digitWheels = [], tappets = [];
  for (const x of [-2.35, 2.35]) for (const z of [-.7, .7]) {
    box(machine, m.iron, x, .16, z, .42, .32, .4);
    box(machine, m.worn, x, .33, z, .34, .09, .33);
    cylinder(machine, m.iron, x, 1.04, z, .09, 1.4);
    for (const y of [.45, 1.55, 3.65]) {
      cylinder(machine, m.brass, x, y, z, .13, .13);
      cylinder(machine, m.bright, x, y + .09, z, .105, .035);
    }
    cylinder(machine, m.iron, x, 2.6, z, .067, 2.3);
    cylinder(machine, m.brass, x, 3.89, z, .11, .12, 24, .065);
    mesh(machine, new THREE.SphereGeometry(.06, 16, 10), m.bright, x, 4, z);
  }
  for (const y of [.48, 1.54, 3.69]) {
    for (const z of [-.7, .7]) {
      box(machine, m.iron, 0, y, z, 5.12, .15, .2);
      box(machine, m.brass, 0, y + .077, z + (z > 0 ? .075 : -.075), 5.02, .015, .028);
      for (let x = -2.35; x <= 2.4; x += .47) {
        const bolt = cylinder(machine, m.bright, x, y, z + (z > 0 ? .107 : -.107), .032, .028, 6);
        bolt.rotation.x = Math.PI / 2;
      }
    }
    for (const x of [-2.35, 0, 2.35]) box(machine, m.iron, x, y, 0, .16, .13, 1.55);
  }
  const digitMap = makeDigitsTexture();
  const numberMaterial = new THREE.MeshStandardMaterial({ map: digitMap, roughnessMap: m.brass.roughnessMap, bumpMap: digitMap, bumpScale: .0007, metalness: .9, roughness: .64, color: "#d0bb8b" });
  const bandGeo = new THREE.CylinderGeometry(.174, .174, .055, 80, 1, true);
  const columnXs = [-1.92, -1.16, -.4, .36, 1.12, 1.88];
  for (let col = 0; col < columnXs.length; col++) {
    const x = columnXs[col];
    cylinder(machine, m.steel, x, 2.61, 0, .035, 2.5, 16);
    for (const y of [1.65, 3.54, 3.78]) {
      cylinder(machine, m.brass, x, y, 0, .135, .13, 32);
      torus(machine, m.bright, x, y + .07, 0, .135, .012, true);
    }
    cylinder(machine, m.iron, x, 3.85, 0, .049, .34, 16);
    cylinder(machine, m.brass, x, 4.03, 0, .055, .08, 16, .016);
    for (let row = 0; row < 18; row++) {
      const y = 1.77 + row * .102;
      const wheel = new THREE.Group(); wheel.position.set(x, y, 0); machine.add(wheel);
      mesh(wheel, bandGeo, numberMaterial, 0, 0, 0);
      for (const dy of [-.035, .035]) {
        cylinder(wheel, m.bright, 0, dy, 0, .191, .012, 64);
        torus(wheel, m.worn, 0, dy, 0, .179, .004, true);
      }
      const g = mesh(wheel, gearGeometry(.205, 48, .013, .04), row % 3 === 0 ? m.worn : m.brass, 0, -.03, 0);
      g.rotation.x = Math.PI / 2;
      wheel.userData = { col, row, resting: col * .628318 + row * .628318, from: 0, to: 0 };
      wheel.rotation.y = wheel.userData.resting; digitWheels.push(wheel);
      // Independent selector and carry hardware behind every number wheel.
      cylinder(machine, m.iron, x + .25, y, -.24, .018, .065, 12);
      const latch = box(machine, m.worn, x + .205, y - .016, .18, .11, .014, .24);
      latch.userData.baseY = y - .016; tappets.push(latch);
      const index = cylinder(machine, m.iron, x, y + .052, .196, .012, .027, 3, 0);
      index.rotation.z = Math.PI;
    }
    for (const z of [-.46, .46]) {
      rod(machine, m.iron, [x - .3, 1.64, z], [x - .3, 3.55, z], .018);
      rod(machine, m.brass, [x + .285, 1.65, z], [x + .285, 3.54, z], .012);
    }
    // Lower drive shafts and interleaved gears, visible through the open iron frame.
    cylinder(machine, m.steel, x, 1.04, 0, .04, 1.01, 16);
    for (const y of [.77, 1.12, 1.38]) {
      const gear = mesh(machine, gearGeometry(.26, 32, .042), m.brass, x, y, 0);
      gear.rotation.x = Math.PI / 2; rotatingGears.push({ object: gear, axis: "z", speed: col % 2 ? -.7 : .7, offset: 0 });
      cylinder(machine, m.iron, x, y, 0, .075, .11, 20);
    }
    // Indicator above each register column.
    const letter = canvasTexture(256, 128, (c, w, h) => {
      c.fillStyle = "#293126"; c.fillRect(0, 0, w, h); c.strokeStyle = "#bda66a"; c.strokeRect(5, 5, w - 10, h - 10);
      c.fillStyle = "#d6c28c"; c.font = "24px Georgia"; c.textAlign = "center"; c.fillText(["RESULT", "Δ  ONE", "Δ²  TWO", "Δ³", "Δ⁴", "Δ⁵"][col], w / 2, 76);
    });
    mesh(machine, new THREE.PlaneGeometry(.32, .12), new THREE.MeshStandardMaterial({ map: letter, roughness: .6, metalness: .35 }), x, 3.76, .816);
  }
  // Carry shafts fill the spaces behind the six working registers: the front wheels remain pickable.
  const finial = new THREE.LatheGeometry([[0,0],[.065,0],[.078,.025],[.078,.04],[.045,.052],[.034,.11],[.046,.125],[.025,.15],[.013,.21],[0,.24]].map(([x,y]) => new THREE.Vector2(x,y)), 32);
  const rearCount = 6 * 18, rearBands = new THREE.InstancedMesh(cylinderGeometry(.116,.037,48), m.worn, rearCount);
  const rearCaps = new THREE.InstancedMesh(cylinderGeometry(.145,.013,48), m.bright, rearCount * 2);
  const rearTeeth = new THREE.InstancedMesh(gearGeometry(.153,36,.013,.028), m.worn, rearCount);
  const partMatrix = new THREE.Object3D();
  let rearIndex = 0;
  for (let col = 0; col < 6; col++) {
    const x = columnXs[col] + .29, z = -.29;
    cylinder(machine, m.iron, x, 2.7, z, .029, 2.7, 20);
    for (const y of [1.67,3.59,3.78]) {
      cylinder(machine, m.brass, x, y, z, .095, .09, 32);
      torus(machine, m.bright, x, y+.05, z, .09, .006, true);
    }
    mesh(machine, finial, m.brass, x, 3.87, z);
    mesh(machine, finial, m.brass, columnXs[col], 4.02, 0);
    for (let row = 0; row < 18; row++) {
      const y = 1.77 + row*.102;
      partMatrix.position.set(x,y,z); partMatrix.rotation.set(0,col*.2,0); partMatrix.updateMatrix(); rearBands.setMatrixAt(rearIndex,partMatrix.matrix);
      for (let side=0;side<2;side++) { partMatrix.position.y=y+(side ? .027 : -.027); partMatrix.updateMatrix(); rearCaps.setMatrixAt(rearIndex*2+side,partMatrix.matrix); }
      partMatrix.position.y=y-.028;partMatrix.rotation.set(Math.PI/2,0,col*.15);partMatrix.updateMatrix();rearTeeth.setMatrixAt(rearIndex,partMatrix.matrix);
      rearIndex++;
    }
    for (const y of [.65,1.28]) {
      const lever = box(machine,m.iron,x,y,.09,.46,.035,.12); lever.rotation.z=(col%2 ? .09 : -.09);
      for (const dx of [-.19,.19]) {
        const pin=cylinder(machine,m.bright,x+dx,y,.16,.027,.035,16);pin.rotation.x=Math.PI/2;
      }
    }
  }
  for (const batch of [rearBands,rearCaps,rearTeeth]) { batch.castShadow=true;batch.receiveShadow=true;machine.add(batch); }
  // Bearing blocks, oil cups and slotted bolts replace the perfectly uniform toy-like frame.
  for (const x of [-2.35,2.35]) for (const z of [-.7,.7]) {
    for (const y of [.43,1.48,1.72,3.52,3.72]) {
      torus(machine,m.worn,x,y,z,.096,.012,true);
      torus(machine,m.bright,x,y+.022,z,.091,.005,true);
    }
    for (const dx of [-.12,.12]) {
      const head=cylinder(machine,m.worn,x+dx,.51,z+.13,.025,.019,6);head.rotation.x=Math.PI/2;
      box(machine,m.dark,x+dx,.51,z+.144,.025,.004,.002);
    }
  }
  for (const x of columnXs) {
    box(machine,m.iron,x,1.55,0,.31,.11,.38);
    for (const dx of [-.11,.11]) {
      cylinder(machine,m.worn,x+dx,1.62,.12,.024,.026,6);
      box(machine,m.dark,x+dx,1.635,.12,.028,.002,.004);
    }
    cylinder(machine,m.brass,x,3.84,.08,.029,.075,20);
    cylinder(machine,m.worn,x,3.885,.08,.038,.015,20);
    rod(machine,m.worn,[x-.28,1.66,-.4],[x-.28,3.61,-.4],.009);
  }
  for (const z of [-.3, .3]) rod(machine, m.steel, [-2.5, .98, z], [2.85, .98, z], .04);
  for (let i = 0; i < 9; i++) {
    const gear = mesh(machine, gearGeometry(i % 2 ? .24 : .28, i % 2 ? 30 : 36, .065), i % 2 ? m.iron : m.brass, -2 + i * .52, .98, .41);
    rotatingGears.push({ object: gear, axis: "z", speed: i % 2 ? -1.2 : 1, offset: i * .12 });
  }

  // The crank turns in a vertical plane on the right side of the machine.
  const drive = new THREE.Group(); drive.position.set(2.7, 1.33, .03); machine.add(drive);
  const flywheel = new THREE.Group(); drive.add(flywheel);
  const driveGear = mesh(flywheel, gearGeometry(.62, 60, .09, .1), m.worn, 0, 0, 0); driveGear.rotation.y = Math.PI / 2;
  const rim = torus(flywheel, m.bright, 0, 0, 0, .52, .032); rim.rotation.y = Math.PI / 2;
  cylinder(drive, m.iron, 0, -.02, 0, .11, .28, 24).rotation.z = Math.PI / 2;
  const crank = new THREE.Group(); crank.position.x = .24; drive.add(crank);
  rod(crank, m.brass, [0, 0, 0], [0, .43, 0], .055);
  const grip = cylinder(crank, m.woodDark, .17, .43, 0, .066, .34, 32); grip.rotation.z = Math.PI / 2;
  const gripCap = cylinder(crank, m.bright, .35, .43, 0, .075, .025, 32); gripCap.rotation.z = Math.PI / 2;
  rod(machine, m.iron, [2.7, .36, -.18], [2.7, 1.36, -.18], .075);
  box(machine, m.iron, 2.7, .32, -.18, .4, .15, .45);
  for(const [y,z,r,ratio] of [[1.91,-.2,.21,1.5],[1.64,-.45,.16,-2],[1.78,.12,.12,-2.6]]){
    const g=mesh(machine,gearGeometry(r,Math.round(r*150),.05,.03),m.brass,2.71,y,z);g.rotation.y=Math.PI/2;
    rotatingGears.push({object:g,axis:"x",speed:ratio,offset:0});
    rod(machine,m.steel,[2.48,y,z],[2.89,y,z],.034);
    box(machine,m.iron,2.48,y,z,.13,.19,.18);
    cylinder(machine,m.worn,2.48,y+.11,z,.027,.04,16);
  }
  for(const x of [-1.9,-.75,.4,1.55]){
    box(machine,m.iron,x,.73,.04,.19,.24,.25);
    for(const dx of [-.06,.06])cylinder(machine,m.worn,x+dx,.86,.04,.018,.023,6);
  }
  rod(machine,m.steel,[-2.38,.75,.04],[2.86,.75,.04],.058);

  // Brass nameplate and paper table are real objects in front of the engine.
  const plaqueMap = canvasTexture(768, 256, (c, w, h) => {
    c.fillStyle = "#aa8b4d"; c.fillRect(0, 0, w, h);
    c.strokeStyle = "#66582f"; c.lineWidth = 4; c.strokeRect(12, 12, w - 24, h - 24);
    c.fillStyle = "#252b20"; c.textAlign = "center"; c.font = "39px Georgia"; c.fillText("THE DIFFERENCE ENGINE", w / 2, 105);
    c.font = "20px Georgia"; c.fillText("C. BABBAGE  ·  LONDON  ·  1822", w / 2, 161);
  });
  mesh(machine, new THREE.PlaneGeometry(1.18, .39), new THREE.MeshStandardMaterial({ map: plaqueMap, metalness: .55, roughness: .45 }), 0, 1.5, .81);
  for (const x of [-.54, .54]) {
    const bolt = cylinder(machine, m.iron, x, 1.5, .825, .018, .012, 8); bolt.rotation.x = Math.PI / 2;
  }

  function table(x, z, w, d, h) {
    const group = new THREE.Group(); group.position.set(x, 0, z); room.add(group);
    box(group, m.woodDark, 0, h, 0, w, .14, d);
    box(group, m.wood, 0, h + .08, 0, w + .04, .045, d + .03);
    for (const px of [-w / 2 + .14, w / 2 - .14]) for (const pz of [-d / 2 + .12, d / 2 - .12]) {
      box(group, m.woodDark, px, h / 2, pz, .12, h, .12);
      box(group, m.iron, px, .12, pz, .145, .18, .145);
    }
    box(group, m.woodDark, 0, .3, 0, w - .2, .1, .1);
    for (const pz of [-d/2+.11,d/2-.11]) {
      box(group,m.woodDark,0,h-.17,pz,w-.12,.23,.08);
      for (const px of [-w/2+.16,w/2-.16]) {
        const stud=cylinder(group,m.worn,px,h-.16,pz+(pz>0 ? .045 : -.045),.016,.012,8);stud.rotation.x=Math.PI/2;
      }
    }
    for (const px of [-w/2+.14,w/2-.14]) {
      box(group,m.woodDark,px,.29,0,.08,.1,d-.2);
      box(group,m.woodDark,px,h-.17,0,.08,.23,d-.12);
    }
    return group;
  }
  const paperStand = table(-1.6, 2.25, 1.1, .78, .91);
  let state = initialRegisters(), history = [{ ...state }];
  const paperCanvas = document.createElement("canvas"); paperCanvas.width = 512; paperCanvas.height = 640;
  const paperTexture = new THREE.CanvasTexture(paperCanvas); paperTexture.colorSpace = THREE.SRGBColorSpace;
  const paperMaterial = new THREE.MeshStandardMaterial({ map: paperTexture, roughness: .98, side: THREE.DoubleSide });
  const page = mesh(paperStand, new THREE.PlaneGeometry(.66, .81), paperMaterial, 0, 1.028, -.02); page.rotation.x = -Math.PI / 2;
  const pencil = cylinder(paperStand, m.wood, .4, 1.034, 0, .014, .52, 6); pencil.rotation.x = Math.PI / 2 - .15;
  function paintPaper() {
    const c = paperCanvas.getContext("2d"), w = paperCanvas.width, h = paperCanvas.height;
    c.fillStyle = "#d2c59a"; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 1200; i++) { c.fillStyle = "#4c3c1c08"; c.fillRect(random() * w, random() * h, 2, 2); }
    c.fillStyle = "#343c2c"; c.textAlign = "center"; c.font = "29px Georgia"; c.fillText("A TABLE OF SQUARES", w / 2, 66);
    c.font = "16px Georgia"; c.fillText("BY THE METHOD OF FINITE DIFFERENCES", w / 2, 99);
    c.strokeStyle = "#7b7753"; c.beginPath(); c.moveTo(52, 125); c.lineTo(w - 52, 125); c.stroke();
    c.font = "23px Georgia"; c.fillText("n", 125, 166); c.fillText("n²", 260, 166); c.fillText("Δ", 390, 166);
    for (let i = 0; i < Math.min(history.length, 9); i++) {
      const item = history.slice(-9)[i], y = 211 + i * 39;
      c.fillText(String(item.n), 125, y); c.fillText(String(item.a), 260, y); c.fillText(String(item.b), 390, y);
      c.strokeStyle = "#8f89622a"; c.beginPath(); c.moveTo(60, y + 12); c.lineTo(w - 60, y + 12); c.stroke();
    }
    c.font = "italic 19px Georgia"; c.fillText("London, 1822", w / 2, 611); paperTexture.needsUpdate = true;
  }
  paintPaper();
  const workbench = table(-4.65, -.8, 1.7, 3, 1.04);
  // Small tools and spare gears on the workbench, all geometrical.
  for (let i = 0; i < 5; i++) {
    const gear = mesh(workbench, gearGeometry(.12 + random() * .1, 24, .04, .025), m.brass, (random() - .5), 1.18, (random() - .5) * 2);
    gear.rotation.x = -Math.PI / 2;
  }
  for (let i = 0; i < 3; i++) {
    const sheet = box(workbench, m.paper, -.1, 1.15 + i * .004, .7, .55, .004, .69); sheet.rotation.y = i * .1;
  }
  cylinder(workbench, m.brass, .3, 1.25, -.6, .06, .2, 24);
  rod(workbench, m.iron, [-.4, 1.16, -.6], [.2, 1.16, -.6], .022);
  function oilCan(parent,x,y,z,scale=1) {
    const group=new THREE.Group();group.position.set(x,y,z);group.scale.setScalar(scale);parent.add(group);
    mesh(group,new THREE.LatheGeometry([[0,0],[.105,0],[.12,.018],[.12,.16],[.085,.21],[.038,.235],[.038,.265],[0,.265]].map(([r,h])=>new THREE.Vector2(r,h)),40),m.worn,0,0,0);
    const spout=new THREE.CatmullRomCurve3([new THREE.Vector3(.04,.22,0),new THREE.Vector3(.13,.28,0),new THREE.Vector3(.24,.41,0),new THREE.Vector3(.28,.46,0)]);
    mesh(group,new THREE.TubeGeometry(spout,24,.012,8,false),m.brass,0,0,0);
    const handle=torus(group,m.iron,-.11,.13,0,.084,.013);handle.scale.set(.6,1,1);
    cylinder(group,m.brass,0,.275,0,.048,.02,24);return group;
  }
  function threadedShaft(parent,center,length,radius,turns) {
    const points=[];
    for(let i=0;i<=turns*16;i++){const a=i/16*Math.PI*2;points.push(new THREE.Vector3(center[0]-length/2+i/(turns*16)*length,center[1]+Math.cos(a)*radius,center[2]+Math.sin(a)*radius));}
    rod(parent,m.steel,[center[0]-length/2,center[1],center[2]],[center[0]+length/2,center[1],center[2]],radius*.86);
    mesh(parent,new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),turns*16,.004,5,false),m.worn,0,0,0);
  }
  oilCan(workbench,.48,1.165,-.95,.8);
  box(workbench,m.iron,-.2,1.25,-.35,.47,.2,.25);
  for(const x of [-.4,.03]){box(workbench,m.iron,x,1.42,-.35,.09,.19,.37);box(workbench,m.steel,x,1.5,-.35,.095,.025,.38);}
  threadedShaft(workbench,[-.2,1.35,-.32],.8,.033,26);
  rod(workbench,m.worn,[.23,1.19,-.32],[.23,1.61,-.32],.015);
  for(let i=0;i<6;i++){
    const x=-.6+i*.19,z=.3+Math.sin(i)*.15;
    const handle=cylinder(workbench,m.woodDark,x,1.19,z,.025,.24,24,.018);handle.rotation.x=Math.PI/2;
    rod(workbench,m.steel,[x,1.19,z-.12],[x,1.19,z-.38],.008);
    cylinder(workbench,m.brass,x,1.19,z-.13,.03,.025,16).rotation.x=Math.PI/2;
  }
  for(let i=0;i<5;i++) {
    const roll=mesh(room,new THREE.CylinderGeometry(.045+.004*i,.045+.004*i,1.1+i*.1,24,1,true),m.paper,-3.85+i*.1,.65,-3.55);
    roll.rotation.z=.04+i*.05;
    torus(roll,m.dark,0,.3,0,.043,.006,true);
  }
  const foreground=table(4.9,4.4,2.8,1.5,1.04);
  const sheet=mesh(foreground,new THREE.PlaneGeometry(1.1,1.46),m.diagram,-.35,1.15,-.03);sheet.rotation.x=-Math.PI/2;sheet.rotation.z=.1;
  for(let i=0;i<8;i++){
    const g=mesh(foreground,gearGeometry(.09+random()*.1,28,.035,.025),i%2?m.worn:m.brass,.35+random()*.7,1.18,(random()-.5)*.9);g.rotation.x=Math.PI/2;g.rotation.z=random()*3;
  }
  oilCan(foreground,-1.02,1.16,-.36,.85);
  const cloth=new THREE.PlaneGeometry(.78,1.3,32,40), clothPosition=cloth.attributes.position;
  for(let i=0;i<clothPosition.count;i++){
    const u=clothPosition.getX(i),v=clothPosition.getY(i)+.65,fold=Math.sin(u*31+v*2)*.022+Math.sin(u*13-v*3)*.008;
    clothPosition.setXYZ(i,u+1,1.17-Math.max(0,v-.61)+fold*(v>.61?.2:1),.12+Math.min(v,.61)+(v>.61?fold:0));
  }
  cloth.computeVertexNormals();mesh(foreground,cloth,m.cloth,0,0,0);
  // A small oil lamp provides a local warm bounce on the machinist's bench.
  cylinder(workbench,m.brass,.47,1.2,1.07,.13,.085,32);
  cylinder(workbench,m.worn,.47,1.3,1.07,.085,.17,32);
  mesh(workbench,new THREE.LatheGeometry([[.052,0],[.08,.04],[.072,.18],[.045,.29],[.044,.33]].map(([x,y])=>new THREE.Vector2(x,y)),32),m.lampGlass,.47,1.39,1.07);
  const flame=mesh(workbench,new THREE.SphereGeometry(.025,12,12),m.flame,.47,1.47,1.07,false);flame.scale.set(.5,2.2,.5);
  const lampLight=new THREE.PointLight("#ffc878",7,4,2);lampLight.position.set(-4.18,1.5,.27);scene.add(lampLight);
  const bookColors = ["#483226", "#674b31", "#67553a", "#3d362c"];
  for (let i = 0; i < 4; i++) {
    const x=-5.8+i*.17,h=.4+random()*.15,cover=m.leather.clone();cover.color.set(bookColors[i]);
    box(room,m.paper,x,2.23+h/2,-3.8,.115,h,.27);
    for(const dx of [-.067,.067])box(room,cover,x+dx,2.23+h/2,-3.8,.019,h+.015,.3);
    box(room,cover,x,2.23+h/2,-3.64,.14,h+.015,.025);
    for(const y of [2.28,2.23+h-.05])box(room,m.worn,x,y,-3.623,.11,.012,.005);
  }
  // Rear cabinet, shelves, brass drawers, glass jars, rolled plans.
  box(room, m.woodDark, -4.9, 1.1, -4.05, 2.7, 2.2, .66);
  for (let row = 0; row < 4; row++) for (let col = 0; col < 5; col++) {
    const x = -5.94 + col * .52, y = .3 + row * .46;
    box(room, m.wood, x, y, -3.69, .48, .41, .06);
    const handle = torus(room, m.brass, x, y, -3.644, .036, .009); handle.rotation.x = .3;
    box(room, m.brass, x, y + .12, -3.647, .13, .05, .01);
  }
  for (const y of [2.35, 3.25, 4.15]) {
    box(room, m.woodDark, -5.1, y, -4.02, 3.1, .07, .6);
    for (let i = 0; i < 6; i++) {
      cylinder(room, i % 2 ? m.worn : m.iron, -6.15 + i * .39, y + .18, -4, .07, .3 + random() * .1, 16);
      cylinder(room, m.brass, -6.15 + i * .39, y + .35, -4, .078, .028, 16);
    }
  }

  // The engraved drawing is a new decorative asset, independent of the room geometry.
  mesh(room,new THREE.PlaneGeometry(2.2,2.93),m.diagram,-2.85,3.9,-4.32);
  for (const x of [-3.88,-1.82]) for (const y of [2.5,5.3]) {
    const pin=cylinder(room,m.worn,x,y,-4.3,.018,.018,12);pin.rotation.x=Math.PI/2;
  }

  // Window light in the dusty air: translucent tapered shafts and a modest particle count.
  const shaftMaterial = new THREE.MeshBasicMaterial({ color: "#ffe0a4", transparent: true, opacity: .012, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
  for (const x of windowCenters) {
    const cone = new THREE.CylinderGeometry(.68, 1.5, 8, 32, 1, true);
    const beam = mesh(room, cone, shaftMaterial, x - 1.6, 3.2, -.2, false);
    beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(.32, .7, -.65).normalize());
  }
  const dustPositions = new Float32Array(130 * 3);
  for (let i = 0; i < dustPositions.length; i += 3) { dustPositions[i] = (random() - .5) * 11; dustPositions[i + 1] = .3 + random() * 6; dustPositions[i + 2] = -3.5 + random() * 11; }
  const dustGeometry = new THREE.BufferGeometry(); dustGeometry.setAttribute("position", new THREE.BufferAttribute(dustPositions, 3));
  const dust = new THREE.Points(dustGeometry, new THREE.PointsMaterial({ color: "#ffe0ac", size: .011, transparent: true, opacity: .3, depthWrite: false })); scene.add(dust);

  let cameraFlight = null, activeView = "wide", cycle = null, running = false, driveAngle = 0, toastTimeout;
  const views = {
    wide: { position: mobile() ? [4.6, 3.5, 14.8] : [5.1, 2.9, 8.2], target: mobile() ? [.15, 2, .1] : [-.5, 2.15, .15], title: "工坊全景" },
    close: { position: [2.9, 2.9, 4.25], target: [.15, 2.5, 0], title: "计算柱近景" },
    side: { position: [5.2, 2.2, 2.2], target: [1.1, 1.85, 0], title: "传动机构侧面" },
    paper: { position: [-1.45, 2.35, 3.65], target: [-1.6, 1.03, 2.25], title: "平方数表" },
  };
  function updateViewButtons() {
    for (const name of ["wide", "close", "side"]) { $("view-" + name).classList.toggle("is-active", activeView === name); $("view-" + name).setAttribute("aria-pressed", String(activeView === name)); }
  }
  function goToView(name, immediate = false) {
    const view = views[name]; activeView = name; updateViewButtons(); $("view-name").textContent = view.title;
    const position = new THREE.Vector3(...view.position), target = new THREE.Vector3(...view.target);
    if (immediate || reducedMotion.matches) { camera.position.copy(position); controls.target.copy(target); controls.update(); cameraFlight = null; }
    else cameraFlight = { started: performance.now(), from: camera.position.clone(), targetFrom: controls.target.clone(), to: position, targetTo: target };
  }
  goToView("wide", true);
  controls.addEventListener("start", () => { cameraFlight = null; activeView = null; updateViewButtons(); $("view-name").textContent = "自由探索"; });

  function toast(message) { $("toast").textContent = message; $("toast").hidden = false; clearTimeout(toastTimeout); toastTimeout = setTimeout(() => { $("toast").hidden = true; }, 3000); }
  function refreshLedger() {
    $("register-a").textContent = String(state.a); $("register-b").textContent = String(state.b);
    $("ledger-rows").replaceChildren(...history.slice(-4).map((item) => {
      const row = document.createElement("div");
      for (const [tag, text] of [["span", String(item.n)], ["strong", String(item.a)], ["span", item.n ? `${item.a - (item.b - item.c)} + ${item.b - item.c}` : "初始值"]]) { const el = document.createElement(tag); el.textContent = text; row.append(el); }
      return row;
    }));
    paintPaper();
  }
  // Three register columns are represented by their five least-significant number wheels.
  function setWheelTargets(next, animate) {
    const values = [next.a, next.b, next.c, 0, 0, 0];
    for (const wheel of digitWheels) {
      const { col, row } = wheel.userData;
      const digit = row < 5 ? digits(values[col])[4 - row] : 0;
      // The UV's zero is on the front at this rotation, matching the displayed register.
      const target = -Math.PI * .1 - digit * Math.PI / 5;
      wheel.userData.from = wheel.rotation.y;
      let delta = ((target - wheel.rotation.y) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
      if (delta > Math.PI * 2 - .001) delta = 0;
      wheel.userData.to = wheel.rotation.y + delta;
      if (!animate) wheel.rotation.y = target;
    }
  }
  setWheelTargets(state, false);
  function setRunning(value) {
    running = value; $("run").setAttribute("aria-pressed", String(value)); $("run-label").textContent = value ? "暂停运转" : "连续运转";
    $("run").querySelector(".play-icon").textContent = value ? "Ⅱ" : "▶";
    $("machine-dot").classList.toggle("is-running", value || !!cycle);
    if (!value && !cycle) $("machine-status").textContent = "已暂停 · 可转动一轮";
  }
  function beginCycle() {
    if (cycle) return;
    if (state.n >= 99) { setRunning(false); toast("本次演示已完成 99 轮，可复位重来"); return; }
    const next = advanceRegisters(state); setWheelTargets(next, !reducedMotion.matches);
    cycle = { start: performance.now(), duration: reducedMotion.matches ? 0 : 1900, next, committed: false, fromAngle: driveAngle };
    $("step").disabled = true; $("machine-dot").classList.add("is-running");
    $("machine-status").textContent = "手柄转动 · 传动轴啮合";
  }
  function reset() {
    setRunning(false); cycle = null; state = initialRegisters(); history = [{ ...state }]; driveAngle = 0;
    setWheelTargets(state, false); refreshLedger(); $("step").disabled = false;
    $("machine-status").textContent = "已复位 · 等待转动手柄"; $("machine-dot").classList.remove("is-running");
    for (const tappet of tappets) tappet.position.y = tappet.userData.baseY;
  }
  function showInspector() {
    $("inspector-body").hidden = false; $("inspector-toggle").textContent = "−";
    $("inspector-toggle").setAttribute("aria-expanded", "true"); $("inspector-toggle").setAttribute("aria-label", "收起原理面板");
  }
  function inspect(type) {
    for (const spot of Object.values(spots)) spot.element.classList.toggle("is-selected", spot.action === type);
    if (type === "crank") { beginCycle(); toast("手柄转动一轮，机器计算下一项平方数"); }
    if (type === "columns") { goToView("close"); $("inspector-title").textContent = "数轮，机械的记忆。"; $("inspector-copy").textContent = "左侧三根计算柱分别保存结果、一阶差分、二阶差分。前五层数轮从下到上表示个、十、百、千、万位。"; }
    if (type === "paper") { goToView("paper"); $("inspector-title").textContent = "数表正在被写出。"; $("inspector-copy").textContent = "每一行都是一次有限差分运算的结果。场景中的纸张与这里的数表同步更新。"; }
    showInspector();
  }

  const spots = {
    crank: { position: new THREE.Vector3(3.14, 1.88, .1), element: $("spot-crank"), action: "crank" },
    columns: { position: new THREE.Vector3(.35, 2.9, .5), element: $("spot-columns"), action: "columns" },
    paper: { position: new THREE.Vector3(-1.6, 1.15, 2.25), element: $("spot-paper"), action: "paper" },
  };
  for (const spot of Object.values(spots)) spot.element.addEventListener("click", () => inspect(spot.action));
  const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2();
  const pickables = [crank, flywheel, ...digitWheels, page];
  crank.userData.action = "crank"; flywheel.userData.action = "crank"; page.userData.action = "paper";
  for (const wheel of digitWheels) wheel.userData.action = "columns";

  // Batch the stationary architecture by material, and instance identical moving wheel parts.
  // Keep the logical wheel groups for animation and picking; they do not incur draw calls.
  const moving = new Set([crank, flywheel, page, ...digitWheels, ...tappets, ...rotatingGears.map((g) => g.object)]);
  function hasAncestor(object, ancestors) { for (let p = object; p; p = p.parent) if (ancestors.has(p)) return true; return false; }
  const staticGroups = new Map(), stationary = [], machineOccluders = [machine];
  scene.updateMatrixWorld(true);
  scene.traverse((object) => {
    if (!object.isMesh || object.isInstancedMesh || object.material.transparent || hasAncestor(object, moving)) return;
    stationary.push(object);
    const enginePart = hasAncestor(object, new Set([machine]));
    const key = `${object.material.uuid}:${object.castShadow}:${object.receiveShadow}:${enginePart}`;
    if (!staticGroups.has(key)) staticGroups.set(key, { material: object.material, cast: object.castShadow, receive: object.receiveShadow, enginePart, geometry: [] });
    const g = (object.geometry.index ? object.geometry.toNonIndexed() : object.geometry.clone()).applyMatrix4(object.matrixWorld);
    staticGroups.get(key).geometry.push(g);
  });
  for (const object of stationary) object.removeFromParent();
  for (const group of staticGroups.values()) {
    const geometry = mergeGeometries(group.geometry, false);
    if (!geometry) throw new Error("三维几何合并失败");
    const result = mesh(scene, geometry, group.material, 0, 0, 0, group.cast); result.receiveShadow = group.receive;
    if (group.enginePart) machineOccluders.push(result);
    for (const part of group.geometry) part.dispose();
  }
  const wheelGroups = new Map(), wheelInstances = [];
  for (const wheel of digitWheels) wheel.traverse((part) => {
    if (!part.isMesh) return;
    const key = `${part.geometry.uuid}:${part.material.uuid}`;
    if (!wheelGroups.has(key)) wheelGroups.set(key, []);
    wheelGroups.get(key).push(part); part.visible = false;
  });
  for(const part of tappets){
    const key=`${part.geometry.uuid}:${part.material.uuid}`;
    if(!wheelGroups.has(key))wheelGroups.set(key,[]);
    wheelGroups.get(key).push(part);part.visible=false;
  }
  for (const sources of wheelGroups.values()) {
    const batch = new THREE.InstancedMesh(sources[0].geometry, sources[0].material, sources.length);
    batch.castShadow = true; batch.receiveShadow = true; batch.frustumCulled = false; scene.add(batch);
    wheelInstances.push({ batch, sources });
  }
  function updateWheelInstances() {
    machine.updateMatrixWorld(true);
    for (const { batch, sources } of wheelInstances) { sources.forEach((source, i) => batch.setMatrixAt(i, source.matrixWorld)); batch.instanceMatrix.needsUpdate = true; }
  }
  updateWheelInstances();
  const pipeline=createWorkshopRenderer(renderer,scene,camera);
  renderer.info.autoReset=false;
  let pointerDown = null;
  function pick(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(pickables, true)[0];
    if (!hit) return null;
    let object = hit.object; while (object && !object.userData.action) object = object.parent;
    return object?.userData.action ?? null;
  }
  renderer.domElement.addEventListener("pointerdown", (e) => { pointerDown = { x: e.clientX, y: e.clientY, id: e.pointerId }; });
  renderer.domElement.addEventListener("pointerup", (e) => {
    if (pointerDown && pointerDown.id === e.pointerId && Math.hypot(e.clientX - pointerDown.x, e.clientY - pointerDown.y) < 5) {
      const action = pick(e); if (action) inspect(action);
    }
    pointerDown = null;
  });
  renderer.domElement.addEventListener("pointercancel", () => { pointerDown = null; });
  renderer.domElement.addEventListener("pointermove", (e) => { renderer.domElement.style.cursor = pick(e) ? "pointer" : "grab"; });
  renderer.domElement.addEventListener("webglcontextlost", (event) => {
    event.preventDefault(); setRunning(false); $("error-detail").textContent = "图形上下文已中断，请刷新预览。"; $("error").hidden = false;
  });

  for (const name of ["wide", "close", "side"]) $("view-" + name).addEventListener("click", () => goToView(name));
  $("step").addEventListener("click", () => { if (mobile()) showInspector(); beginCycle(); });
  $("run").addEventListener("click", () => { setRunning(!running); if (running) { if (mobile()) showInspector(); beginCycle(); } });
  $("reset").addEventListener("click", reset);
  $("inspector-toggle").addEventListener("click", () => {
    const body = $("inspector-body"); body.hidden = !body.hidden;
    $("inspector-toggle").textContent = body.hidden ? "+" : "−"; $("inspector-toggle").setAttribute("aria-expanded", String(!body.hidden));
    $("inspector-toggle").setAttribute("aria-label", body.hidden ? "展开原理面板" : "收起原理面板");
  });
  for (const name of ["reference", "about"]) {
    const dialog = $(name + "-dialog"); $(name + "-open").addEventListener("click", () => { setRunning(false); dialog.showModal(); });
    dialog.querySelector(".dialog-close").addEventListener("click", () => dialog.close());
    dialog.addEventListener("click", (e) => { if (e.target === dialog && (e.clientX < dialog.getBoundingClientRect().left || e.clientX > dialog.getBoundingClientRect().right || e.clientY < dialog.getBoundingClientRect().top || e.clientY > dialog.getBoundingClientRect().bottom)) dialog.close(); });
  }
  const keys = new Set();
  addEventListener("keydown", (e) => {
    if (document.querySelector("dialog[open]") || ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName)) return;
    const key = e.key.toLowerCase();
    if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(key)) { e.preventDefault(); keys.add(key); cameraFlight = null; activeView = null; updateViewButtons(); $("view-name").textContent = "自由行走"; }
    if (e.code === "Space" && !e.repeat && !["BUTTON", "A"].includes(document.activeElement.tagName)) { e.preventDefault(); beginCycle(); }
    if (key === "escape") goToView("wide");
  });
  addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
  addEventListener("blur", () => { keys.clear(); setRunning(false); });
  document.addEventListener("visibilitychange", () => { if (document.hidden) { keys.clear(); setRunning(false); } });
  const direction = new THREE.Vector3(), right = new THREE.Vector3(), translation = new THREE.Vector3();
  function walk(delta) {
    if (!keys.size) return;
    camera.getWorldDirection(direction); direction.y = 0; direction.normalize();
    right.crossVectors(direction, camera.up).normalize(); translation.set(0, 0, 0);
    if (keys.has("w") || keys.has("arrowup")) translation.add(direction);
    if (keys.has("s") || keys.has("arrowdown")) translation.sub(direction);
    if (keys.has("d") || keys.has("arrowright")) translation.add(right);
    if (keys.has("a") || keys.has("arrowleft")) translation.sub(right);
    translation.normalize().multiplyScalar(delta * 1.65);
    const next = camera.position.clone().add(translation);
    if (canWalkTo(next.x, next.z)) { camera.position.copy(next); controls.target.add(translation); }
  }
  const projected = new THREE.Vector3(), line = new THREE.Vector3();
  function projectHotspots() {
    for (const spot of Object.values(spots)) {
      projected.copy(spot.position).project(camera);
      line.subVectors(spot.position, camera.position); const distance = line.length();
      raycaster.set(camera.position, line.normalize());
      const first = raycaster.intersectObjects(machineOccluders, true)[0];
      const occluded = first && first.distance < distance - .8;
      const x = (projected.x * .5 + .5) * viewport.clientWidth, y = (-projected.y * .5 + .5) * viewport.clientHeight;
      const visible = !(activeView === "paper" && spot.action === "paper") && projected.z > -1 && projected.z < 1 && x > 15 && x < viewport.clientWidth - 15 && y > 70 && y < viewport.clientHeight - 125 && !occluded;
      spot.element.classList.toggle("is-visible", visible);
      spot.element.style.transform = `translate(${x - 14}px,${y - 14}px)`;
      spot.element.tabIndex = visible ? 0 : -1;
    }
    $("distance").textContent = `${camera.position.distanceTo(controls.target).toFixed(1)} m`;
    $("experience").classList.toggle("is-near", camera.position.distanceTo(controls.target) < 8);
  }
  function resize() {
    camera.aspect = viewport.clientWidth / viewport.clientHeight; camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(devicePixelRatio, mobile() ? 1.5 : 1.75)); renderer.setSize(viewport.clientWidth, viewport.clientHeight);
    pipeline.resize();
  }
  addEventListener("resize", resize);
  let previousTime = performance.now(), lastHud = 0;
  function frame(time) {
    requestAnimationFrame(frame);
    const delta = Math.min((time - previousTime) / 1000, .05); previousTime = time;
    if (document.hidden) return;
    if (cameraFlight) {
      const t = Math.min(1, (time - cameraFlight.started) / 1250), eased = t * t * (3 - 2 * t);
      camera.position.lerpVectors(cameraFlight.from, cameraFlight.to, eased);
      controls.target.lerpVectors(cameraFlight.targetFrom, cameraFlight.targetTo, eased);
      if (t === 1) cameraFlight = null;
    }
    walk(delta); controls.update();
    // Keep the camera above the floor and inside the room after dolly / pan / orbit input.
    camera.position.x = THREE.MathUtils.clamp(camera.position.x, -6.5, 6.5);
    camera.position.z = THREE.MathUtils.clamp(camera.position.z, -3.95, 16);
    camera.position.y = THREE.MathUtils.clamp(camera.position.y, .7, 6.6);
    controls.target.x = THREE.MathUtils.clamp(controls.target.x, -4.8, 4.8);
    controls.target.z = THREE.MathUtils.clamp(controls.target.z, -3, 6);
    controls.target.y = THREE.MathUtils.clamp(controls.target.y, .4, 4);
    if (cycle) {
      const t = cycle.duration ? Math.min(1, (time - cycle.start) / cycle.duration) : 1;
      const ease = t * t * (3 - 2 * t); driveAngle = cycle.fromAngle + ease * Math.PI * 2;
      for (const wheel of digitWheels) {
        const lag = wheel.userData.col === 0 ? .15 : .48;
        const local = THREE.MathUtils.clamp((t - lag) / .4, 0, 1), e = local * local * (3 - 2 * local);
        wheel.rotation.y = THREE.MathUtils.lerp(wheel.userData.from, wheel.userData.to, reducedMotion.matches ? 1 : e);
      }
      if (t > .18 && t < .55) $("machine-status").textContent = `结果柱进位 · ${state.a} + ${state.b}`;
      if (t >= .55 && t < .91) $("machine-status").textContent = `更新一阶差分 · ${state.b} + ${state.c}`;
      for (let i = 0; i < tappets.length; i++) tappets[i].position.y = tappets[i].userData.baseY + Math.max(0, Math.sin(t * Math.PI * 4 + i * .3)) * .018;
      if (t === 1) {
        state = cycle.next; history.push({ ...state }); refreshLedger(); cycle = null;
        $("step").disabled = false; $("machine-status").textContent = `第 ${state.n} 轮完成 · ${state.n}² = ${state.a}`;
        $("machine-dot").classList.toggle("is-running", running);
        if (running) setTimeout(() => { if (running && !cycle) beginCycle(); }, reducedMotion.matches ? 1800 : 350);
      }
    }
    crank.rotation.x = driveAngle; flywheel.rotation.x = driveAngle;
    for (const gear of rotatingGears) gear.object.rotation[gear.axis] = driveAngle * gear.speed + gear.offset;
    updateWheelInstances();
    if (!reducedMotion.matches) dust.rotation.y += delta * .003;
    if (time - lastHud > 65) { projectHotspots(); lastHud = time; }
    renderer.info.reset();pipeline.composer.render();
  }
  if (mobile()) { $("inspector-body").hidden = true; $("inspector-toggle").textContent = "+"; $("inspector-toggle").setAttribute("aria-expanded", "false"); $("inspector-toggle").setAttribute("aria-label", "展开原理面板"); }
  renderer.info.reset();pipeline.composer.render(); renderer.domElement.dataset.drawCalls = String(renderer.info.render.calls);
  $("loading").hidden = true; projectHotspots(); requestAnimationFrame(frame);
}

start().catch((error) => {
  $("loading").hidden = true; $("error-detail").textContent = error.message ?? String(error);
  if(error.message?.startsWith("本地材质"))$("error").querySelector("p").textContent="请确认本地预览服务正在运行，材质文件完整。";
  $("error").hidden = false; console.error(error);
});
