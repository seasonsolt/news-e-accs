import * as THREE from "three";
import type { Kit } from "./camp.ts";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { stoneProjection, type ReliefScan } from "./relief.ts";

/** Two polished cuts around a light too thin to explain the mass surrounding it. */
export function buildMonolith({ scene, own, small }: Pick<Kit, "scene" | "own" | "small">, x: number, y: number, z: number, stoneScan: ReliefScan) {
  const monument = new THREE.Group();
  monument.position.set(x, y + 9.6, z); monument.rotation.y = -.14;
  scene.add(monument);

  const obsidian = own(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .67, metalness: .12, envMapIntensity: 1.4 }));
  obsidian.onBeforeCompile = shader => {
    shader.uniforms.stoneRelief = stoneScan;
    shader.vertexShader = "varying vec3 vStone, vStoneNormal;\n" + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\nvStone = position; vStoneNormal = normal;");
    shader.fragmentShader = `varying vec3 vStone, vStoneNormal;\n${stoneProjection}\n` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace("#include <color_fragment>", /* glsl */ `
      #include <color_fragment>
      vec3 face = normalize(vStoneNormal);
      // A broad fracture field under a finer cut. Both are locked to the block as the walker circles it.
      vec3 bed = stoneSample(vStone * vec3(.17, .12, .17) + vec3(.42, .17, .08), face);
      vec3 grain = stoneSample(vStone * .72 + vec3(.09, .61, .31), face);
      float edge = smoothstep(.07, .52, abs(face.z)) * (1. - smoothstep(.89, .99, abs(face.z)));
      float stoneHeight = ((bed.g - .5) * .063 + (grain.g - .5) * .014) * (1. - .7 * edge);
      float pore = exp2((bed.r - .5) * 2.85 + (grain.r - .5) * .95);
      diffuseColor.rgb *= mix(vec3(.94, .98, 1.06), vec3(1.08, 1.01, .9), bed.r) * pore;
      float dust = (1. - smoothstep(-9.55, -8.65, vStone.y)) * (.24 + .32 * grain.r);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.23, .16, .092), dust);
    `);
    shader.fragmentShader = shader.fragmentShader.replace("#include <roughnessmap_fragment>", /* glsl */ `
      #include <roughnessmap_fragment>
      roughnessFactor = clamp(mix(bed.b * .75 + grain.b * .25 - .17, .35, edge) + dust * .2, .28, .93);
    `);
    shader.fragmentShader = shader.fragmentShader.replace("#include <normal_fragment_maps>", /* glsl */ `
      #include <normal_fragment_maps>
      vec3 stoneDx = dFdx(-vViewPosition), stoneDy = dFdy(-vViewPosition);
      vec3 stoneR1 = cross(stoneDy, normal), stoneR2 = cross(normal, stoneDx);
      float stoneDet = dot(stoneDx, stoneR1) * faceDirection;
      normal = normalize(abs(stoneDet) * normal - sign(stoneDet) * (dFdx(stoneHeight) * stoneR1 + dFdy(stoneHeight) * stoneR2));
    `);
  };
  const dark = new THREE.Color("#60686e"), face = new THREE.Color("#8a969e"), edge = new THREE.Color("#a6b1b4"), tone = new THREE.Color();
  for (const side of [-1, 1]) {
    // The paired slopes turn the aperture into a seam through a single, otherwise silent object.
    const profile = new THREE.Shape();
    profile.moveTo(side * .17, -9.6);
    const width = side < 0 ? 4.65 : 4.4;
    // Keep the long sawn faces true. Missing flakes interrupt the outside arris and crown.
    const crown = side < 0 ? 9.45 : 6.3;
    profile.lineTo(side * (width - .17), -9.6);
    profile.lineTo(side * width, -9.31);
    profile.lineTo(side * width, crown - 2.05);
    profile.lineTo(side * (width - .082), crown - 1.89);
    profile.lineTo(side * width, crown - 1.47);
    profile.lineTo(side * width, crown - .22);
    profile.lineTo(side * (width - .19), crown);
    profile.lineTo(side * .17, side < 0 ? 10.2 : 7.1);
    profile.closePath();
    const geometry = own(new THREE.ExtrudeGeometry(profile, { depth: 2.04, steps: 1, bevelEnabled: true, bevelSegments: 2, bevelSize: .065, bevelThickness: .08, curveSegments: 1 }));
    geometry.translate(0, 0, -1.02);
    const normals = geometry.getAttribute("normal"), positions = geometry.getAttribute("position"), colors = new Float32Array(normals.count * 3);
    for (let i = 0; i < normals.count; i++) {
      const height = (positions.getY(i) + 9.6) / 19.8;
      const bevel = Math.min(1, Math.abs(normals.getX(i)) + Math.abs(normals.getY(i))) * Math.max(0, normals.getZ(i));
      tone.copy(dark).lerp(face, height * .7).lerp(edge, bevel * .72).toArray(colors, i * 3);
    }
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const blade = new THREE.Mesh(geometry, obsidian); blade.castShadow = blade.receiveShadow = true; monument.add(blade);
  }

  const amber = own(new THREE.MeshStandardMaterial({ color: "#eed3a0", emissive: "#ffbb65", emissiveIntensity: 3, roughness: .35, metalness: .6 }));
  // Recessing the light leaves a dark border even when the sun is behind the stone.
  const aperture = new THREE.Mesh(own(new THREE.BoxGeometry(.055, 17.7, .08)), amber);
  aperture.position.set(0, -.05, .88); monument.add(aperture);
  const core = new THREE.Mesh(own(new THREE.OctahedronGeometry(.29)), own(new THREE.MeshStandardMaterial({ color: "#f6e1bd", emissive: "#dfa451", emissiveIntensity: .8, metalness: .8, roughness: .18 })));
  core.scale.set(.43, 1.8, .6); core.position.set(0, -.15, 1.02); monument.add(core);

  const basalt = own(new THREE.MeshStandardMaterial({ color: "#252b30", metalness: .25, roughness: .68 }));
  const foot = own(new THREE.LatheGeometry([
    new THREE.Vector2(0, -.18), new THREE.Vector2(5.82, -.18), new THREE.Vector2(5.93, -.09),
    new THREE.Vector2(5.87, -.035), new THREE.Vector2(5.72, -.025), new THREE.Vector2(5.46, -.014),
    new THREE.Vector2(5.38, .03), new THREE.Vector2(0, .03),
  ], small ? 72 : 120));
  const foundation = new THREE.Mesh(foot, basalt);
  foundation.position.y = -9.6; foundation.receiveShadow = true; monument.add(foundation);
  // Thin separation joints split the coping into individual fitted stones. All sectors draw together.
  const coping = [], profile = [
    new THREE.Vector2(5.35, -.018), new THREE.Vector2(5.79, -.018), new THREE.Vector2(5.79, .018),
    new THREE.Vector2(5.75, .063), new THREE.Vector2(5.4, .063), new THREE.Vector2(5.35, .025),
  ];
  for (let i = 0; i < 24; i++) {
    const wedge = new THREE.LatheGeometry(profile, small ? 3 : 6, i * Math.PI / 12, Math.PI / 12 - .005);
    const color = new Float32Array(wedge.attributes.position!.count * 3);
    tone.set(i % 5 === 0 ? "#737677" : "#605e59");
    for (let j = 0; j < color.length; j += 3) tone.toArray(color, j);
    wedge.setAttribute("color", new THREE.BufferAttribute(color, 3));
    coping.push(wedge);
  }
  const rim = new THREE.Mesh(own(mergeGeometries(coping)), obsidian);
  for (const wedge of coping) wedge.dispose();
  rim.position.y = -9.6; rim.receiveShadow = true; monument.add(rim);
  const bronze = own(new THREE.MeshStandardMaterial({ color: "#8c7754", metalness: .75, roughness: .42 }));
  const luminous = own(new THREE.MeshStandardMaterial({ color: "#d2b589", emissive: "#b8823b", emissiveIntensity: .55, metalness: .6, roughness: .4 }));
  for (const [radius, width, material] of [[4.85, .022, bronze], [5.3, .018, luminous], [5.69, .025, bronze]] as const) {
    const ring = new THREE.Mesh(own(new THREE.TorusGeometry(radius, width, 4, small ? 64 : 128)), material);
    ring.rotation.x = Math.PI / 2; ring.position.y = -9.53; monument.add(ring);
  }
  // A single family of radial marks makes the ground read as an engineered instrument up close.
  const marks = own(new THREE.InstancedMesh(own(new THREE.BoxGeometry(.035, .008, .16)), bronze, 48)), matrix = new THREE.Matrix4(), rotation = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), position = new THREE.Vector3(), scale = new THREE.Vector3();
  for (let i = 0; i < 48; i++) {
    const angle = i / 48 * Math.PI * 2;
    position.set(Math.sin(angle) * 5.5, -9.529, Math.cos(angle) * 5.5);
    rotation.setFromAxisAngle(up, angle); scale.set(1, 1, i % 4 === 0 ? 2 : 1); matrix.compose(position, rotation, scale); marks.setMatrixAt(i, matrix);
  }
  monument.add(marks);

  const art = document.createElement("canvas"); art.width = 1024; art.height = 64;
  const pen = art.getContext("2d")!; pen.fillStyle = "rgba(214,168,92,.88)"; pen.font = "30px ui-monospace, Menlo, monospace"; pen.textAlign = "center"; pen.fillText("1 : 4 : 9  ·  TMA-0  ·  RAISED BY US", 512, 42);
  const map = own(new THREE.CanvasTexture(art)); map.colorSpace = THREE.SRGBColorSpace;
  const labelMaterial = own(new THREE.MeshBasicMaterial({ map, transparent: true, opacity: 0, depthWrite: false }));
  const label = new THREE.Mesh(own(new THREE.PlaneGeometry(3.75, .235)), labelMaterial); label.position.set(-2.42, -8.24, 1.109); monument.add(label);
  return labelMaterial;
}
