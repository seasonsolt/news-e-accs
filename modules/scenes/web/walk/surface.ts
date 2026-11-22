import * as THREE from "three";
import { stoneProjection, type ReliefScan } from "./relief.ts";

// The one material every painted shape shares. The shapes carry their colour; this adds what they are made of (grain, mottling, cracks, furrows), computed in
// the shader. Rocks share a scanned relief map with the monument. The `surface` attribute says which: 0 plain, 1 stone, 2 bark and wood, 3 earth and thatch, 4 leaf, 5 skin, 6 cloth, 7 hair and fur. Noise is taken in the
// mesh's own space, which for the static scenery is world space and on the sails, logs and people that move keeps the grain from sliding.

const DETAIL = /* glsl */ `
varying vec3 vSpot; varying float vSurface;
float sHash(vec3 p){ p = fract(p * .1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float sNoise(vec3 p){ vec3 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f); vec2 o = vec2(1., 0.);
  return mix(mix(mix(sHash(i), sHash(i + o.xyy), f.x), mix(sHash(i + o.yxy), sHash(i + o.xxy), f.x), f.y),
    mix(mix(sHash(i + o.yyx), sHash(i + o.xyx), f.x), mix(sHash(i + o.yxx), sHash(i + o.xxx), f.x), f.y), f.z); }`;

// Each kind multiplies the painted colour by a tint and leaves a height (in metres) for the bump, a roughness and how much specular it keeps. An octave fades out once a pixel covers about a third of its wavelength, so nothing shimmers far off.
const SURFACE = /* glsl */ `
float px = length(fwidth(vSpot)), sHeight = 0., sRough = .8, sSpec = 1., sWarm = 0., sCap = 0., sKnee = 0.; vec3 sTint = vec3(1.), sSheen = vec3(1.), p = vSpot;
#define FADE(f) (1. - smoothstep(.25, .6, px * (f)))
int kind = int(vSurface + .5);
if (kind == 1) { // stone
  vec3 stoneNormal = inverseTransformDirection(normalize(vNormal), viewMatrix);
  vec3 scan = stoneSample(p * .46, stoneNormal);
  float up = smoothstep(.25, .9, stoneNormal.y);
  float weathering = sNoise(p * .63 + 17.);
  sTint = mix(vec3(.73, .78, .84), vec3(1.13, 1.04, .94), weathering + up * .13);
  sTint *= exp2((scan.r - .5) * 2.85);
  sHeight = (scan.g - .5) * .116;
  sRough = clamp(scan.b - .06 + up * .08, .58, .97);
  sSpec = .76;
} else if (kind == 2) { // bark: ridges running up the limb, dark furrows between them, the ridge tops worn paler
  vec3 q = p * vec3(9., 1.1, 9.); float f = mix(.5, sNoise(q) * .65 + sNoise(q * 2.3 + 3.) * .35, FADE(9.)), grain = sNoise(q * vec3(6., 3., 6.)), fg = FADE(54.);
  sTint = vec3(mix(.42, 1., smoothstep(.22, .58, f)) * (1. + smoothstep(.6, .8, f) * .2) * (.88 + .24 * sNoise(p * 1.6)) * (1. + (grain - .5) * .2 * fg));
  sHeight = f * .02 + grain * .001 * fg; sRough = .86 + .1 * (1. - f);
} else if (kind == 3) { // earth and thatch: a coarse breakup, straw-like streaks down the slope, fine grit
  float coarse = sNoise(p * 3.), streak = sNoise(p * vec3(26., 2.2, 26.)), grit = sNoise(p * 37.), fs = FADE(26.), fg = FADE(37.);
  sTint = vec3((.84 + .32 * coarse) * (1. + (streak - .5) * .35 * fs) * (1. + (grit - .5) * .25 * fg));
  sHeight = streak * .004 * fs + grit * .0015 * fg; sRough = .93;
} else if (kind == 4) { // leaf: soft mottling in clumps
  float m = sNoise(p * 2.2), clump = sNoise(p * 7.), fc = FADE(7.);
  sTint = vec3((.8 + .38 * m) * (1. + (clump - .5) * .3 * fc)); sHeight = clump * .03 * fc; sRough = .8;
} else if (kind == 5) { // skin: soft blotches, pores, a little sheen
  float blot = sNoise(p * 14.), mottle = sNoise(p * 60.), pore = smoothstep(.62, .86, sNoise(p * 420.)), fm = FADE(60.), fp = FADE(420.);
  sTint = mix(vec3(1.), vec3(1.05, .96, .94), smoothstep(.45, .85, blot)) * (1. + (mottle - .5) * .07 * fm) * (1. - pore * .07 * fp);
  sHeight = mottle * .00025 * fm - pore * .00012 * fp; sRough = .66 + .1 * blot + .06 * pore * fp; sSpec = .3; sWarm = 1.; sCap = .3; sKnee = .6;
} else if (kind == 6) { // cloth: homespun yarn, uneven along its length, in a plain weave
  float slub = sNoise(p * vec3(140., 9., 140.)) * .6 + sNoise(p * vec3(9., 140., 9.)) * .4, fs = FADE(140.), fw = FADE(700.);
  float weave = sin(6.2832 * fract(p.y * 700.)) * sin(6.2832 * fract((p.x + p.z) * 700.));
  sTint = vec3((1. + (slub - .5) * .2 * fs) * (1. + weave * .05 * fw) * (.94 + .12 * sNoise(p * 5.)));
  sHeight = slub * .0004 * fs + weave * .00015 * fw; sRough = .9 + .06 * slub; sSpec = .35;
} else if (kind == 7) { // hair and fur: locks hanging down, darker between them, a weak sheen in the hair's own colour broken along the strands
  float lock = sNoise(p * vec3(60., 7., 60.)), strand = sNoise(p * vec3(520., 30., 520.)), fl = FADE(60.), fs = FADE(520.);
  sTint = vec3((.74 + .44 * mix(.5, lock, fl)) * (1. + (strand - .5) * .32 * fs));
  sHeight = lock * .003 * fl + strand * .0005 * fs; sRough = .78 + .14 * (1. - lock); sSpec = .5 * mix(1., smoothstep(.35, .75, strand), fs) * (.5 + .5 * lock);
  sSheen = diffuseColor.rgb / max(max(diffuseColor.r, max(diffuseColor.g, diffuseColor.b)), 1e-3); sCap = .15; sKnee = .25;
} else { // clay, leather and the rest: only a very fine grain
  float fine = sNoise(p * 90.), ff = FADE(90.);
  sTint = vec3(1. + (fine - .5) * .08 * ff + (sNoise(p * 11.) - .5) * .06); sHeight = fine * .00025 * ff; sRough = .72;
}
diffuseColor.rgb *= sTint;`;

// After the lights: hair, fur and skin keep their specular to at most sCap of the diffuse light (so a strong near light or the sky's rim can't wash dark hair pale),
// and skin passes light on under its surface: where light falls it comes back warmer, most toward the edges seen side-on. The warm term only shifts the hue of
// light already received (its luminance weights sum to about 1), so it never brightens. Last, skin and hair right beside a strong light (a fire a metre off) are
// brought down softly once their brightest channel passes sKnee, all channels by the same factor, so they keep their hue instead of tone-mapping to white;
// below sKnee, which ordinary daylight on skin stays under, nothing changes.
const WARM = /* glsl */ `
if (sCap > 0.) { vec3 lit = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse;
  reflectedLight.directSpecular = min(reflectedLight.directSpecular, sCap * lit); reflectedLight.indirectSpecular = min(reflectedLight.indirectSpecular, sCap * lit); }
if (sWarm > 0.) { float edge = 1. - abs(dot(normal, normalize(vViewPosition))); reflectedLight.directDiffuse *= clamp(1. + sWarm * (vec3(.1, -.02, -.08) + vec3(.16, -.02, -.22) * edge * edge), 0., 1.3); }
if (sKnee > 0.) { vec3 sum = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + reflectedLight.directSpecular + reflectedLight.indirectSpecular; float top = max(sum.r, max(sum.g, sum.b));
  if (top > sKnee) { float f = (sKnee + (top - sKnee) / (1. + (top - sKnee) / sKnee)) / top;
    reflectedLight.directDiffuse *= f; reflectedLight.indirectDiffuse *= f; reflectedLight.directSpecular *= f; reflectedLight.indirectSpecular *= f; } }`;

// Bump from the height's screen-space slope (Mikkelsen's surface gradient, unnormalised so the height stays in metres).
const BUMP = /* glsl */ `
{ vec3 dpx = dFdx(-vViewPosition), dpy = dFdy(-vViewPosition), r1 = cross(dpy, normal), r2 = cross(normal, dpx);
  float det = dot(dpx, r1) * faceDirection; normal = normalize(abs(det) * normal - sign(det) * (dFdx(sHeight) * r1 + dFdy(sHeight) * r2)); }`;

/** The shared material: vertex colours, both sides, surface detail from the `surface` attribute. `bump` off (for phones) keeps the colour detail but not the light catching it. */
export function createMatte(stoneScan: ReliefScan, bump = true) {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: .85, metalness: 0 });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.stoneRelief = stoneScan;
    shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nattribute float surface; varying vec3 vSpot; varying float vSurface;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvSpot = transformed; vSurface = surface;");
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", `#include <common>\n${DETAIL}
${stoneProjection}`)
      .replace("#include <color_fragment>", `#include <color_fragment>\n${SURFACE}`)
      .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor = sRough;")
      .replace("#include <lights_physical_fragment>", "#include <lights_physical_fragment>\nmaterial.specularColor *= sSpec * sSheen; material.specularF90 *= sSpec;")
      .replace("#include <lights_fragment_end>", `#include <lights_fragment_end>\n${WARM}`)
      .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>\n${bump ? BUMP : ""}`);
  };
  material.customProgramCacheKey = () => `matte-${bump}`;
  return material;
}
