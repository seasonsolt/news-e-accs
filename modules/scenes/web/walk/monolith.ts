import * as THREE from "three";
import type { Kit } from "./camp.ts";

/** Two polished cuts around a light too thin to explain the mass surrounding it. */
export function buildMonolith({ scene, own, small }: Pick<Kit, "scene" | "own" | "small">, x: number, y: number, z: number) {
  const monument = new THREE.Group();
  monument.position.set(x, y + 9.6, z); monument.rotation.y = -.14;
  scene.add(monument);

  const obsidian = own(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .67, metalness: .12, envMapIntensity: 1.4 }));
  obsidian.onBeforeCompile = shader => {
    shader.vertexShader = "varying vec3 vStone;\n" + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\nvStone = position;");
    shader.fragmentShader = /* glsl */ `
      varying vec3 vStone;
      float stoneHash(vec3 p) { p = fract(p * .1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
      float stoneNoise(vec3 p) {
        vec3 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f); vec2 k = vec2(0., 1.);
        return mix(mix(mix(stoneHash(i), stoneHash(i + k.yxx), f.x), mix(stoneHash(i + k.xyx), stoneHash(i + k.yyx), f.x), f.y),
          mix(mix(stoneHash(i + k.xxy), stoneHash(i + k.yxy), f.x), mix(stoneHash(i + k.xyy), stoneHash(i + k.yyy), f.x), f.y), f.z);
      }
    ` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace("#include <color_fragment>", /* glsl */ `
      #include <color_fragment>
      float stonePixel = length(fwidth(vStone));
      float stoneCoarse = stoneNoise(vStone * vec3(2.1, .24, 2.1));
      float stoneGrain = stoneNoise(vStone * 38.) * (1. - smoothstep(.01, .045, stonePixel));
      float stoneFlute = stoneNoise(vStone * vec3(5.5, 1.3, 5.5) + stoneCoarse * 1.7);
      float stoneSeam = (1. - smoothstep(.012, .06 + stonePixel * 2., abs(stoneFlute - .43))) * smoothstep(.48, .65, stoneCoarse) * (1. - smoothstep(.07, .18, stonePixel));
      float stoneBed = sin(vStone.y * 4.8 + stoneCoarse * 2. + vStone.x * .3) * .5 + .5;
      float stoneHeight = stoneCoarse * .018 + stoneFlute * .009 + stoneGrain * .0012 - stoneSeam * .009;
      diffuseColor.rgb *= (.72 + stoneCoarse * .52) * (.94 + stoneBed * .12) * (1. - stoneSeam * .36) * (.94 + stoneGrain * .12);
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
    profile.lineTo(side * width, -9.6);
    profile.lineTo(side * width, side < 0 ? 9.45 : 6.3);
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
  const foundation = new THREE.Mesh(own(new THREE.CylinderGeometry(5.75, 5.9, .16, small ? 48 : 96)), basalt);
  foundation.position.y = -9.62; foundation.receiveShadow = true; monument.add(foundation);
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
  const label = new THREE.Mesh(own(new THREE.PlaneGeometry(6.4, .4)), labelMaterial); label.position.set(0, -8.2, 1.11); monument.add(label);
  return labelMaterial;
}
