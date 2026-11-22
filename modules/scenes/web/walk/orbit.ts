import * as THREE from "three";

/** Load the cover artwork before the first world frame. Its RGB
 * stays in sRGB until the texture sampler decodes it into the scene's light. */
export async function loadOrbit(signal: AbortSignal, own: <T extends { dispose(): void }>(item: T) => T) {
  const request = new AbortController();
  const cancel = () => request.abort(signal.reason);
  if (signal.aborted) cancel(); else signal.addEventListener("abort", cancel, { once: true });
  const timer = setTimeout(() => request.abort(new DOMException("The cover artwork timed out", "TimeoutError")), 20000);
  try {
    const response = await fetch("/media/walk/orbit-cover.webp", { signal: request.signal });
    if (!response.ok) throw new Error(`The orbital artwork could not load (${response.status})`);
    const blob = await response.blob();
    const bitmap = await createImageBitmap(blob, { imageOrientation: "flipY", premultiplyAlpha: "none", colorSpaceConversion: "none" });
    if (request.signal.aborted) { bitmap.close(); throw request.signal.reason; }
    const texture = own(new THREE.Texture(bitmap));
    own({ dispose: () => bitmap.close() });
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.flipY = false;
    texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.needsUpdate = true;
    return texture;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", cancel);
  }
}

/** The plate is an angular window in a fixed world direction. Turning the camera
 * reveals another part of that window, while walking leaves its distance infinite. */
export function orbitUniforms(exposure: number) {
  const forward = new THREE.Vector3(.15, .30, -1).normalize();
  const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
  const up = new THREE.Vector3().crossVectors(right, forward).normalize();
  return {
    orbitMap: new THREE.Uniform<THREE.Texture | null>(null),
    orbitForward: { value: forward }, orbitRight: { value: right }, orbitUp: { value: up },
    orbitTangent: { value: new THREE.Vector2(Math.tan(THREE.MathUtils.degToRad(45)), 0) },
    orbitExposure: { value: exposure },
    orbitVisibility: { value: 1 },
  };
}

export const orbitShader = /* glsl */ `
  uniform sampler2D orbitMap;
  uniform vec3 orbitForward, orbitRight, orbitUp;
  uniform vec2 orbitTangent;
  uniform float orbitVisibility, orbitExposure;

  // The cover already has its final illustrated lighting. Invert the existing
  // OutputPass ACES curve here so that pass does not grade its copper tones twice.
  vec3 coverRadiance(vec3 color) {
    const mat3 inverseOutput = mat3(.6430382, .0592687, .0059619, .3111868, .9314365, .0639290, .0457755, .0092949, .9301184);
    const mat3 inverseInput = mat3(1.7647410, -.1470279, -.0363368, -.6757777, 1.1602515, -.1624364, -.0889633, -.0132237, 1.1987733);
    vec3 value = clamp(inverseOutput * color, 0., .99);
    vec3 a = .983729 * value - 1.;
    vec3 b = .432951 * value - .0245786;
    vec3 c = .238081 * value + .000090537;
    vec3 fitted = (-b - sqrt(max(b * b - 4. * a * c, vec3(0.)))) / (2. * a);
    return max(inverseInput * fitted * (.6 / orbitExposure), vec3(0.));
  }

  vec3 orbitalArtwork(vec3 sky, vec3 direction) {
    float forward = dot(direction, orbitForward);
    if (forward <= 0. || orbitVisibility <= .001) return sky;
    vec2 plane = vec2(dot(direction, orbitRight), dot(direction, orbitUp)) / forward;
    vec2 uv = .5 + plane / (2. * orbitTangent);
    if (any(lessThan(uv, vec2(0.))) || any(greaterThan(uv, vec2(1.)))) return sky;
    vec4 plate = texture2D(orbitMap, uv);
    if (plate.a <= .001) return sky;
    float border = min(min(uv.x, 1. - uv.x), min(uv.y, 1. - uv.y));
    float edge = smoothstep(0., .012, border);
    return mix(sky, coverRadiance(plate.rgb), plate.a * edge * orbitVisibility);
  }
`;
