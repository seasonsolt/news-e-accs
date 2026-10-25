import * as THREE from "three";

// Colour, normal, roughness and occlusion are independent: wear changes the reflection as well as colour.
function metalSurface() {
  let state = 1822;
  const random = () => { state = (1664525 * state + 1013904223) >>> 0; return state / 4294967296; };
  const surface = document.createElement("canvas"), rough = document.createElement("canvas"), height = document.createElement("canvas");
  for (const canvas of [surface, rough, height]) { canvas.width = 1024; canvas.height = 1024; }
  const c = surface.getContext("2d"), r = rough.getContext("2d"), b = height.getContext("2d");
  c.fillStyle = "#bdbbb0"; c.fillRect(0, 0, 1024, 1024);
  r.fillStyle = "#939393"; r.fillRect(0, 0, 1024, 1024);
  b.fillStyle = "#808080"; b.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i < 220; i++) {
    const x = random() * 1024, y = random() * 1024, radius = 4 + random() * 90;
    const stain = c.createRadialGradient(x, y, 0, x, y, radius);
    stain.addColorStop(0, `rgba(39,35,21,${.03 + random() * .19})`); stain.addColorStop(1, "rgba(39,35,21,0)");
    c.fillStyle = stain; c.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    const dull = r.createRadialGradient(x, y, 0, x, y, radius);
    dull.addColorStop(0, "#eeeeee70"); dull.addColorStop(1, "#eeeeee00");
    r.fillStyle = dull; r.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }
  for (let i = 0; i < 18000; i++) {
    const x = random() * 1024, y = random() * 1024, length = 1 + random() * 40;
    c.fillStyle = random() > .7 ? "#fffce523" : "#29271d13"; c.fillRect(x, y, length, .25 + random() * .6);
    b.fillStyle = random() > .5 ? "#b0b0b0" : "#505050"; b.fillRect(x, y, length, .5);
  }
  const map = new THREE.CanvasTexture(surface); map.colorSpace = THREE.SRGBColorSpace;
  const roughnessMap = new THREE.CanvasTexture(rough), bumpMap = new THREE.CanvasTexture(height);
  for (const texture of [map, roughnessMap, bumpMap]) { texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.anisotropy = 8; }
  return { map, roughnessMap, bumpMap };
}

export async function createMaterials(renderer) {
  const loader = new THREE.TextureLoader().setPath("./assets/");
  const anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const load = (name) => loader.loadAsync(name).catch((cause) => { throw new Error(`本地材质未能载入：${name}`,{cause}); });
  async function scanned(kind, repeat) {
    const [map, normalMap, roughnessMap, aoMap] = await Promise.all(["color", "normal", "roughness", "ao"].map((channel) => load(`${kind}-${channel}.jpg`)));
    map.colorSpace = THREE.SRGBColorSpace;
    for (const texture of [map, normalMap, roughnessMap, aoMap]) {
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(...repeat); texture.anisotropy = anisotropy;
    }
    aoMap.channel = 0;
    return { map, normalMap, roughnessMap, aoMap };
  }
  // Keep each material group to four concurrent image decodes during cold start.
  const wood=await scanned("wood",[.83,.83]);
  const stone=await scanned("stone",[.39,.39]);
  const plaster=await scanned("plaster",[.32,.32]);
  const diagramMap=await load("engineering-plate-v2.png");
  diagramMap.colorSpace = THREE.SRGBColorSpace; diagramMap.anisotropy = anisotropy;
  const metal = metalSurface();
  const woodMaterial = new THREE.MeshStandardMaterial({ ...wood, color: "#d0bfa5", normalScale: new THREE.Vector2(.65, .65), roughness: .92, aoMapIntensity: .65 });
  woodMaterial.userData.grain = true;
  const woodDark = woodMaterial.clone(); woodDark.color.set("#7b6247"); woodDark.normalScale.set(.5, .5);
  const floor = woodMaterial.clone(); floor.color.set("#a99476");
  for (const key of ["map", "normalMap", "roughnessMap", "aoMap"]) { floor[key] = wood[key].clone(); floor[key].repeat.set(15, 20); }
  const brass = new THREE.MeshPhysicalMaterial({ ...metal, color: "#c4a36c", metalness: .94, roughness: .56, bumpScale: .0012, anisotropy: .35, anisotropyRotation: Math.PI/2 });
  const bright = brass.clone(); bright.color.set("#d0ab63"); bright.roughness = .46; bright.bumpScale = .0005; bright.anisotropy = 0;
  const worn = brass.clone(); worn.color.set("#95804f"); worn.roughness = .92;
  const iron = new THREE.MeshStandardMaterial({ ...metal, color: "#292821", metalness: .79, roughness: .9, bumpScale: .003 });
  const steel = iron.clone(); steel.color.set("#aaa99b"); steel.metalness = .98; steel.roughness = .38; steel.bumpScale = .0005;
  return {
    brass, bright, worn, iron, steel, wood: woodMaterial, woodDark, floor,
    dark: new THREE.MeshStandardMaterial({ color: "#201d17", roughness: .94 }),
    plaster: new THREE.MeshStandardMaterial({ ...plaster, color: "#cfb993", normalScale: new THREE.Vector2(.6,.6), roughness: .97, aoMapIntensity: .6 }),
    trim: new THREE.MeshStandardMaterial({ ...stone, color: "#d3c2a0", normalScale: new THREE.Vector2(.4, .4), roughness: .94, aoMapIntensity: .6 }),
    paper: new THREE.MeshStandardMaterial({ color: "#cab894", roughness: .97, side: THREE.DoubleSide }),
    ink: new THREE.MeshStandardMaterial({ color: "#171610", roughness: .8 }),
    leather: new THREE.MeshStandardMaterial({ color: "#34271e", roughness: .83, bumpMap: metal.bumpMap, bumpScale: .003 }),
    cloth: new THREE.MeshStandardMaterial({ color: "#3b3730", roughness: 1, side: THREE.DoubleSide, bumpMap: metal.bumpMap, bumpScale: .005 }),
    glass: new THREE.MeshPhysicalMaterial({ color: "#eadcba", roughness: .18, metalness: 0, transparent: true, opacity: .12, side: THREE.DoubleSide, depthWrite: false }),
    lampGlass: new THREE.MeshPhysicalMaterial({ color: "#d8c190", roughness: .16, transparent: true, opacity: .18, depthWrite: false }),
    flame: new THREE.MeshBasicMaterial({ color: "#ffd496", toneMapped: false }),
    diagram: new THREE.MeshStandardMaterial({ map: diagramMap, color: "#ded1b3", roughness: .97, side: THREE.DoubleSide }),
  };
}
