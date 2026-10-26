import * as THREE from "three";

interface Vertex { p: THREE.Vector3; n: THREE.Vector3; uv: THREE.Vector2 }
interface Face { vertices: Vertex[]; material: number }

/** Cut the scanned stone with a plane and close the new face. The texture and smooth exterior normals
 * stay on the old surface; the fresh fracture gets its own material, UVs and hard boundary. */
export function cutStone(source: THREE.BufferGeometry, planes: THREE.Plane[]): THREE.BufferGeometry {
  const position = source.getAttribute("position"), normal = source.getAttribute("normal"), uv = source.getAttribute("uv"), index = source.index;
  let faces: Face[] = [];
  for (let i = 0; i < (index?.count ?? position.count); i += 3) {
    const vertices: Vertex[] = [];
    for (let j = 0; j < 3; j++) {
      const at = index ? index.getX(i + j) : i + j;
      vertices.push({ p: new THREE.Vector3().fromBufferAttribute(position, at), n: new THREE.Vector3().fromBufferAttribute(normal, at), uv: uv ? new THREE.Vector2(uv.getX(at), uv.getY(at)) : new THREE.Vector2() });
    }
    faces.push({ vertices, material: 0 });
  }
  for (const plane of planes) {
    const clipped: Face[] = [], rim = new Map<string, THREE.Vector3>(), edges = new Map<string, Set<string>>();
    const key = (p: THREE.Vector3) => p.toArray().map((n) => n.toFixed(5)).join(",");
    for (const face of faces) {
      const polygon: Vertex[] = [], intersections: THREE.Vector3[] = [];
      for (let i = 0; i < face.vertices.length; i++) {
        const a = face.vertices[i]!, b = face.vertices[(i + 1) % face.vertices.length]!;
        const da = plane.distanceToPoint(a.p), db = plane.distanceToPoint(b.p);
        if (da <= 1e-7) polygon.push(a);
        if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
          const t = da / (da - db), p = a.p.clone().lerp(b.p, t);
          polygon.push({ p, n: a.n.clone().lerp(b.n, t).normalize(), uv: a.uv.clone().lerp(b.uv, t) });
          rim.set(key(p), p); intersections.push(p);
        }
      }
      if (intersections.length === 2) {
        const [a, b] = intersections.map(key) as [string, string];
        if (a !== b) { if (!edges.has(a)) edges.set(a, new Set()); if (!edges.has(b)) edges.set(b, new Set()); edges.get(a)!.add(b); edges.get(b)!.add(a); }
      }
      if (polygon.length >= 3) clipped.push({ vertices: polygon, material: face.material });
    }
    if (rim.size >= 3) {
      const points = [...rim.values()], center = points.reduce((a, b) => a.add(b), new THREE.Vector3()).multiplyScalar(1 / points.length);
      const u = new THREE.Vector3().crossVectors(plane.normal, Math.abs(plane.normal.y) > .9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)).normalize();
      const v = new THREE.Vector3().crossVectors(plane.normal, u).normalize();
      const capVertex = (p: THREE.Vector3): Vertex => ({ p, n: plane.normal.clone(), uv: new THREE.Vector2(p.clone().sub(center).dot(u) * 2 + .5, p.clone().sub(center).dot(v) * 2 + .5) });
      // Follow the actual boundary, rather than sorting points around a centre. A scan can have
      // concave cuts and several components; a radial fan joins unrelated edges into spikes.
      while (edges.size) {
        const start = edges.keys().next().value!, loop: THREE.Vector3[] = [];
        let current = start;
        for (let guard = 0; guard <= rim.size; guard++) {
          loop.push(rim.get(current)!);
          const next = edges.get(current)?.values().next().value;
          if (!next) break;
          edges.get(current)!.delete(next); edges.get(next)?.delete(current);
          if (!edges.get(current)!.size) edges.delete(current);
          if (!edges.get(next)?.size) edges.delete(next);
          current = next;
          if (current === start) break;
        }
        edges.delete(start);
        if (current !== start || loop.length < 3) continue;
        const contour = loop.map((p) => new THREE.Vector2(p.dot(u), p.dot(v)));
        for (const triangle of THREE.ShapeUtils.triangulateShape(contour, [])) {
          const vertices = triangle.map((i) => capVertex(loop[i]!));
          const n = new THREE.Vector3().crossVectors(vertices[1]!.p.clone().sub(vertices[0]!.p), vertices[2]!.p.clone().sub(vertices[0]!.p));
          if (n.dot(plane.normal) < 0) vertices.reverse();
          clipped.push({ vertices, material: 1 });
        }
      }
    }
    faces = clipped;
  }
  const positions: number[] = [], normals: number[] = [], uvs: number[] = [], result = new THREE.BufferGeometry();
  // Material groups are contiguous, so each stone needs only two draw calls.
  for (const material of [0, 1]) {
    const start = positions.length / 3;
    for (const face of faces.filter((f) => f.material === material)) for (let i = 1; i < face.vertices.length - 1; i++) {
      for (const vertex of [face.vertices[0]!, face.vertices[i]!, face.vertices[i + 1]!]) { positions.push(...vertex.p.toArray()); normals.push(...vertex.n.toArray()); uvs.push(...vertex.uv.toArray()); }
    }
    if (positions.length / 3 > start) result.addGroup(start, positions.length / 3 - start, material);
  }
  result.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3)); result.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3)); result.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  result.computeBoundingBox(); result.computeBoundingSphere(); return result;
}
