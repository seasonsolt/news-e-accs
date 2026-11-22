import * as THREE from "three";
import type { Kit } from "./camp.ts";
import { smooth } from "./land.ts";

// Clouds painted on a dome around the walker, every pixel from noise: so there is no outline anywhere, only soft edges thinning into the sky.
// Three layers, back to front: cirrus streaks high up, a deck of cumulus and altocumulus seen from below, and a bank of cumulus tops along the horizon.
// Each is lit from the sun (or by night the moon) by sampling the noise a step toward the light: thin edges facing the light shine, thick parts shade.

const MOON = new THREE.Vector3(-Math.sin(.5) * Math.cos(.3), Math.sin(.3), -Math.cos(.5) * Math.cos(.3)); // direction of the night fill light

const VERTEX = "varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }";
const fragment = (out: string) => `uniform vec3 sunDir, moonDir, sun, sky; uniform vec2 seed; uniform float time, night, cover; varying vec3 vDir;
  float hash(vec2 p){ vec3 q = fract(vec3(p.xyx) * .1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
  float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
    return mix(mix(hash(i), hash(i + vec2(1., 0.)), f.x), mix(hash(i + vec2(0., 1.)), hash(i + vec2(1., 1.)), f.x), f.y); }
  // each octave drifts at its own pace, so the shapes change slowly as they move
  float fbm(vec2 p){ float sum = 0., a = .5; mat2 turn = mat2(.8, .6, -.6, .8);
    for (int i = 0; i < OCTAVES; i++) { sum += a * noise(p + seed + time * (.004 + .003 * float(i))); p = turn * p * 2.03; a *= .5; } return sum; }
  vec4 over(vec4 front, vec4 back){ float a = front.a + back.a * (1. - front.a); return vec4((front.rgb * front.a + back.rgb * back.a * (1. - front.a)) / max(a, 1e-4), a); }
  void main(){
    vec3 d = normalize(vDir); if (d.y < -.03) discard;
    vec3 L = normalize(mix(moonDir, sunDir, smoothstep(-.06, .04, sunDir.y))); // by night the moon lights them
    float toward = max(dot(d, L), 0.), dim = mix(1., .22, night);
    vec3 light = sun * dim, cool = sky * vec3(.85, .92, 1.08);
    cool = mix(cool, vec3(dot(cool, vec3(.3, .59, .11))) * vec3(.9, .95, 1.08), .7 * (1. - night)); // by day the shade in a cloud is a cool grey, never the warm brown of the low sky
    vec2 drift = vec2(1., .3) * time * .006;

    // cirrus: thin ice streaks, stretched along the wind
    vec2 p = d.xz / max(d.y, .02) * .35 + drift * 2.;
    float ice = smoothstep(.52, .86, fbm(vec2(p.x * .4 + p.y * .2, p.y * 2.6 - p.x * .5))) * smoothstep(.03, .25, d.y) * (.32 - .17 * night);
    vec4 acc = vec4(cool * .7 + light * (.25 + 1.1 * pow(toward, 6.)), ice);

    // the cloud deck: cumulus and altocumulus seen from below
    p = d.xz / max(d.y, .02) * 1.3 + drift;
    float thin = 1. - cover, ragged = (fbm(p * 3.7) - .5) * .22;
    float dense = smoothstep(thin, thin + .3, fbm(p) + ragged);
    vec2 sunward = normalize(L.xz + 1e-4) * .1;
    float ahead = smoothstep(thin, thin + .3, fbm(p + sunward) + ragged);
    float lit = clamp(1. - (ahead - dense) * 2. - dense * .55, mix(.38, .12, night), 1.); // more cloud toward the light: this side is in its shade
    float silver = (pow(toward, 8.) * .8 + pow(toward, 40.) * 1.5) * (1. - dense);
    vec3 deck = cool * (.75 - .25 * dense) + light * (lit * .5 + silver * .55);
    acc = over(vec4(deck, dense * mix(.8, .9, night) * smoothstep(.015, .14, d.y)), acc);

    // cumulus along the horizon: billowing tops over a base lost in the haze
    vec2 ring = normalize(d.xz);
    float gaps = smoothstep(.38, .62, noise(ring * 2.3 + seed * .1 + time * .0015)), bumps = abs(fbm(ring * 26. + vec2(time * .01, 0.)) - .5) * 2. - .35; // billows: round crests, sharp clefts
    float top = (.012 + .085 * pow(fbm(ring * 3.1 + seed * .2), 2.) * 2.) * gaps + .018 * bumps * gaps;
    float body = (1. - smoothstep(top - .01, top, d.y)) * smoothstep(-.03, .004, d.y) * step(.001, gaps);
    body *= .75 + .25 * fbm(vec2(ring.x * 40. + d.y * 30., ring.y * 40. - d.y * 60.));
    float up = clamp(d.y / max(top, .004), 0., 1.), facing = dot(ring, normalize(L.xz + 1e-4)), rim = (1. - smoothstep(0., .014, top - d.y)) * pow(max(facing, 0.), 3.);
    vec3 bank = cool * (.55 + .2 * up) + light * ((.5 - .5 * facing) * .12 + rim * .5);
    acc = over(vec4(mix(bank, cool * 1.4, .3), body * .32), acc); // far off, they take on the colour of the haze

    acc.a *= mix(1., .38, night); // by night only a thin veil, the stars showing through
    if (acc.a < .003) discard;
    gl_FragColor = acc; ${out} }`;

/** The sky's clouds. `frame` keeps the dome on the walker and gives it the light of the hour; it allocates nothing. */
export function buildClouds({ scene, own, rand, out, small = false }: Pick<Kit, "scene" | "own" | "rand" | "out"> & { small?: boolean }) {
  const uniforms = {
    sunDir: { value: new THREE.Vector3(0, 1, 0) }, moonDir: { value: MOON.clone() }, sun: { value: new THREE.Color() }, sky: { value: new THREE.Color() },
    seed: { value: new THREE.Vector2(rand() * 90, rand() * 90) }, time: { value: 0 }, night: { value: 1 }, cover: { value: .4 },
  };
  const dome = new THREE.Mesh(own(new THREE.SphereGeometry(1000, 48, 24)), own(new THREE.ShaderMaterial({
    side: THREE.BackSide, transparent: true, depthWrite: false, fog: false, uniforms, defines: { OCTAVES: small ? 3 : 5 },
    vertexShader: VERTEX, fragmentShader: fragment(out),
  })));
  dome.frustumCulled = false; scene.add(dome);

  /** `sun` and `sky` are the light of the hour; `dusk` runs from 0 to 1 once the stone is touched. */
  function frame(camera: THREE.Vector3, clock: number, s: number, sunDir: THREE.Vector3, sun: THREE.Color, sky: THREE.Color, dusk: number) {
    dome.position.copy(camera);
    uniforms.sunDir.value.copy(sunDir); uniforms.sun.value.copy(sun); uniforms.sky.value.copy(sky); uniforms.time.value = clock;
    uniforms.night.value = Math.max(1 - smooth(220, 300, s), dusk * .8);
    uniforms.cover.value = .24 + .13 * smooth(220, 340, s) - .12 * smooth(360, 420, s) * (1 - smooth(520, 600, s)) - .07 * smooth(560, 640, s); // a thin night sky, a fuller morning, more blue at midday, clearing toward evening
  }
  return { frame };
}
