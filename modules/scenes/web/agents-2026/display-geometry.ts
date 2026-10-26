import * as THREE from "three";

/** A continuous cylindrical OLED surface. Its UVs follow arc length, so the editor does not stretch at the edges. */
export function curvedPanel(width: number, height: number, radius: number, offset = 0) {
  const geometry = new THREE.PlaneGeometry(width, height, 128, 12), p = geometry.attributes.position!;
  for (let i = 0; i < p.count; i++) {
    const angle = p.getX(i) / radius;
    p.setXYZ(i, Math.sin(angle) * (radius - offset), p.getY(i), radius * (1 - Math.cos(angle)) + Math.cos(angle) * offset);
  }
  geometry.computeVertexNormals(); return geometry;
}
