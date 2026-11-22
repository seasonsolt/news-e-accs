// The sky follows the light of the journey, from the Milky Way to a warm sunset.
export const skyVertex = `varying vec3 direction;
  void main() {
    direction = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
  }`;

export function skyFragment(output: string) {
  return `varying vec3 direction;
    uniform vec3 top, horizon, haze, sun, sunDir;
    uniform float stars, time, day;

    float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
    float noise(vec3 p) {
      vec3 i = floor(p), f = fract(p);
      f = f * f * (3. - 2. * f);
      return mix(mix(mix(hash(i), hash(i + vec3(1., 0., 0.)), f.x),
                     mix(hash(i + vec3(0., 1., 0.)), hash(i + vec3(1., 1., 0.)), f.x), f.y),
                 mix(mix(hash(i + vec3(0., 0., 1.)), hash(i + vec3(1., 0., 1.)), f.x),
                     mix(hash(i + vec3(0., 1., 1.)), hash(i + vec3(1., 1., 1.)), f.x), f.y), f.z);
    }

    // Height and two slopes of a triangular rock face, without a texture or finite-difference samples.
    vec3 ridgeFacet(vec2 p) {
      vec2 i = floor(p), f = fract(p);
      float a = hash(vec3(i, 11.)), b = hash(vec3(i + vec2(1., 0.), 11.));
      float c = hash(vec3(i + vec2(0., 1.), 11.)), e = hash(vec3(i + vec2(1.), 11.));
      if (f.x + f.y < 1.) return vec3(a + (b - a) * f.x + (c - a) * f.y, b - a, c - a);
      return vec3(e + (c - e) * (1. - f.x) + (b - e) * (1. - f.y), e - c, e - b);
    }

    vec3 ridgeNormal(vec2 bearing, vec3 facet) {
      vec3 toward = vec3(-bearing.x, 0., -bearing.y), tangent = vec3(bearing.y, 0., -bearing.x);
      return normalize(toward * .8 + tangent * facet.y * .9 + vec3(0., .75 + facet.z * .4, 0.));
    }

    void main() {
      vec3 d = normalize(direction);
      float up = max(d.y, 0.);
      vec3 c = mix(top, horizon, exp(-up * mix(5.5, 9., day)));
      if (d.y < 0.) c = mix(horizon, horizon * .42, min(1., -d.y * 6.));
      float g = max(dot(d, sunDir), 0.);
      c += sun * (1. - stars) * (pow(g, mix(12., 64., day)) * mix(.055, .012, day)
        + pow(g, mix(180., 520., day)) * .2) * step(-.08, sunDir.y);
      c += sun * (1. - stars) * smoothstep(mix(.9992, .9995, day), mix(.9996, .9998, day), g) * 3.;

      // Dust softens a stellar river across the night sky.
      float low = smoothstep(.015, .28, d.y);
      float river = exp(-pow(dot(d, normalize(vec3(.35, .82, .45))) * 5.5, 2.))
        * (.3 + .7 * noise(d * 7.)) * (.65 + .35 * noise(d * 21.));
      c += vec3(.11, .13, .20) * river * .18 * stars * low;
      vec3 cell = d * 340.;
      float seed = hash(floor(cell)), limit = .9982 - river * .0035;
      float point = 1. - smoothstep(.09, .43, length(fract(cell) - .5));
      float twinkle = .88 + .12 * sin(time * .35 + seed * 90.);
      c += mix(vec3(.65, .8, 1.), vec3(1., .83, .61), seed)
        * step(limit, seed) * point * (.65 + 250. * (seed - limit)) * twinkle * stars * low;

      // Two remote ridgelines give the flat road a scale beyond its playable terrain.
      if (d.y < .085) {
        vec2 bearing = normalize(d.xz);
        float distant = .012 + .055 * noise(vec3(bearing * 6., 7.))
          + .012 * abs(noise(vec3(bearing * 38., 4.)) * 2. - 1.);
        float nearer = .004 + .028 * noise(vec3(bearing * 9. + 9., 2.))
          + .009 * abs(noise(vec3(bearing * 47., 1.)) * 2. - 1.);

        vec3 farFace = ridgeFacet(bearing * 30. + vec2(d.y * 60., distant * 25.));
        vec3 nearFace = ridgeFacet(bearing * 47. + vec2(d.y * 90. + 9., nearer * 30.));
        float farLight = max(0., dot(ridgeNormal(bearing, farFace), sunDir));
        float nearLight = max(0., dot(ridgeNormal(bearing, nearFace), sunDir));
        // Haze keeps the distant faces close in tone. The nearer range retains more shadow in its ravines.
        float daylight = .25 + day * .75;
        vec3 farRidge = mix(haze * .84, top * 1.1, .2) * (.92 + daylight * (farLight * .17 + (farFace.x - .5) * .08));
        vec3 nearRidge = mix(haze * .48, top * .8, .4) * (.86 + daylight * (nearLight * .28 + (nearFace.x - .5) * .14));
        farRidge = mix(haze * .72, farRidge, smoothstep(0., distant, max(d.y, 0.)));
        nearRidge = mix(haze * .58, nearRidge, smoothstep(0., nearer, max(d.y, 0.)));
        c = mix(c, farRidge, 1. - smoothstep(distant - .001, distant + .001, d.y));
        c = mix(c, nearRidge, 1. - smoothstep(nearer - .001, nearer + .001, d.y));
      }
      gl_FragColor = vec4(c, 1.);
      ${output}
    }`;
}
