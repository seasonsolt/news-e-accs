import * as THREE from "three";
import type { Kit } from "./camp.ts";

export type ReliefScan = THREE.Uniform<THREE.Texture>;

/** R = photographic value centred on .5, G = measured surface height, B = roughness.
 * The same repeatable field drives colour and relief. The neutral texel lets the first
 * frame render while the scan is in flight, including on an interrupted connection. */
export function loadRelief(name: "stone" | "track" | "oak" | "plaster", anisotropy: number, signal: AbortSignal, own: Kit["own"], after?: Promise<unknown>): ReliefScan {
  const neutral = own(new THREE.DataTexture(new Uint8Array([128, 128, 214, 255]), 1, 1));
  neutral.needsUpdate = true;
  const sampler = new THREE.Uniform<THREE.Texture>(neutral);
  async function read() {
    if (after) await after;
    if (signal.aborted) return;
    const response = await fetch(`/media/walk/${name}-relief.webp`, { signal });
    if (!response.ok) return;
    const bitmap = await createImageBitmap(await response.blob());
    if (signal.aborted) { bitmap.close(); return; }
    const scan = own(new THREE.Texture(bitmap));
    scan.wrapS = scan.wrapT = THREE.RepeatWrapping;
    scan.anisotropy = Math.max(1, Math.min(4, anisotropy));
    scan.flipY = false;
    scan.needsUpdate = true;
    sampler.value = scan;
    signal.addEventListener("abort", () => bitmap.close(), { once: true });
  }
  void read().catch(() => { /* Walking also works with the untextured surface. */ });
  return sampler;
}

// Box projection in metres, blended on the bevels. A single scan wraps irregular
// boulders as well as the upright cut faces, with no seam down the middle of a rock.
export const stoneProjection = /* glsl */ `
  uniform sampler2D stoneRelief;
  vec3 stoneSample(vec3 p, vec3 n) {
    vec3 w = abs(n);
    w *= w; w *= w;
    w /= max(dot(w, vec3(1.)), .0001);
    return texture2D(stoneRelief, p.zy).rgb * w.x
         + texture2D(stoneRelief, p.xz + vec2(.31, .43)).rgb * w.y
         + texture2D(stoneRelief, p.xy).rgb * w.z;
  }
`;
