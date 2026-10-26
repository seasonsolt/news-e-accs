import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
export interface Scan { geometry: THREE.BufferGeometry; material: THREE.MeshStandardMaterial }
type Own = (dispose: () => void) => void;

export async function loadScan(url: string, own: Own, renderer: THREE.WebGLRenderer, clump = false): Promise<Scan> {
  const gltf = await new GLTFLoader().loadAsync(url);
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
  gltf.scene.updateMatrixWorld(true);
  const parts: THREE.BufferGeometry[] = [];
  let selected: THREE.MeshStandardMaterial | undefined;
  gltf.scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    geometries.add(object.geometry);
    const m = object.material as THREE.MeshStandardMaterial;
    materials.add(m); selected ??= m;
    for (const value of Object.values(m)) if (value instanceof THREE.Texture) { textures.add(value); value.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy()); }
    const g = object.geometry.index ? object.geometry.toNonIndexed() : object.geometry.clone();
    g.applyMatrix4(object.matrixWorld);
    if (clump) {
      g.computeBoundingBox(); const b = g.boundingBox!, center = b.getCenter(new THREE.Vector3());
      g.translate(-center.x, -b.min.y, -center.z); g.rotateY(parts.length * 2.4);
    }
    // Three derives tangent space from UVs. Keep the same attribute layout across all grass variants.
    for (const attribute of Object.keys(g.attributes)) if (!["position", "normal", "uv"].includes(attribute)) g.deleteAttribute(attribute);
    parts.push(g);
  });
  own(() => { for (const g of geometries) g.dispose(); for (const m of materials) m.dispose(); for (const t of textures) t.dispose(); });
  const geometry = mergeGeometries(parts, false);
  for (const g of parts) g.dispose();
  if (!geometry || !selected) throw new Error(`Empty scan: ${url}`);
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox!, size = bounds.getSize(new THREE.Vector3()), center = bounds.getCenter(new THREE.Vector3());
  geometry.translate(-center.x, -bounds.min.y, -center.z); geometry.scale(1 / size.x, 1 / size.y, 1 / size.z);
  own(() => geometry.dispose());
  selected.envMapIntensity = .65;
  if (selected.alphaTest > 0) { selected.side = THREE.DoubleSide; selected.alphaTest = .45; }
  return { geometry, material: selected };
}
