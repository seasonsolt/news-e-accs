// A distant ringed world, drawn in angular space. The ring plane and the planet
// share the same ray intersections, so the near rings pass in front of its face.
export const skyVertex = `varying vec3 direction;
  void main() {
    direction = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
  }`;

export function skyFragment(output: string) {
  return `varying vec3 direction;
    uniform vec3 top, horizon, haze, sun, sunDir, planetDirection;
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

      // The soft stellar river stays behind the sharply silhouetted planet.
      float low = smoothstep(.015, .28, d.y);
      float river = exp(-pow(dot(d, normalize(vec3(.62, .38, .68))) * 5.5, 2.))
        * (.3 + .7 * noise(d * 7.)) * (.65 + .35 * noise(d * 21.));
      c += vec3(.14, .18, .34) * river * .16 * stars * low;
      vec3 cell = d * 340.;
      float seed = hash(floor(cell)), limit = .9982 - river * .002;
      float point = 1. - smoothstep(.09, .43, length(fract(cell) - .5));
      float twinkle = .88 + .12 * sin(time * .35 + seed * 90.);
      c += mix(vec3(.65, .8, 1.), vec3(1., .83, .61), seed)
        * step(limit, seed) * point * (.65 + 250. * (seed - limit)) * twinkle * stars * low;

      vec3 center = normalize(planetDirection) * 22.;
      float radius = 3.65;
      vec3 planetForward = normalize(center);
      vec3 planetRight = normalize(cross(planetForward, vec3(0., 1., 0.)));
      vec3 planetUp = cross(planetRight, planetForward);
      vec3 ringNormal = normalize(-planetRight * .31 + planetUp * .95 + planetForward * .035);
      vec3 light = normalize(planetForward * .45 + planetRight * .8 + planetUp * .35);
      float toward = dot(d, center);
      float discriminant = toward * toward - dot(center, center) + radius * radius;
      float hit = toward - sqrt(max(discriminant, 0.));
      bool planet = discriminant > 0. && hit > 0.;
      float presence = smoothstep(.05, .85, stars) * smoothstep(-.02, .08, d.y);

      // Atmospheric limb against the night, with a restrained copper dawn edge.
      float separation = length(cross(d, normalize(center)));
      float edge = radius / length(center);
      float halo = exp(-abs(separation - edge) * 330.);
      c += vec3(.08, .16, .25) * halo * .1 * presence * step(0., toward);
      if (planet) {
        vec3 n = normalize(d * hit - center);
        float diffuse = max(dot(n, light), 0.);
        float latitude = dot(n, ringNormal);
        float bands = .5 + .24 * sin(latitude * 17. + noise(n * 7.) * 1.4)
          + .1 * sin(latitude * 43. + noise(n * 16.) * .8);
        vec3 surface = mix(vec3(.095, .12, .17), vec3(.26, .245, .22), bands * .38);
        surface = surface * .045 + surface * vec3(1.3, .85, .48) * diffuse * .8;
        float rim = pow(1. - max(dot(n, -d), 0.), 3.);
        surface += vec3(.18, .26, .39) * rim * (.018 + diffuse * .08);
        surface += vec3(1., .49, .18) * rim * pow(diffuse, 1.3) * 1.1;
        c = mix(c, surface, presence);
        // Daylight fills the unlit hemisphere with the surrounding air. Only a
        // grazing illuminated limb can emerge, rather than a translucent disc.
        c += vec3(.1, .065, .03) * rim * pow(diffuse, 2.) * (1. - presence) * .04;
      }

      float denominator = dot(d, ringNormal);
      if (abs(denominator) > .0001) {
        float ringHit = dot(center, ringNormal) / denominator;
        vec3 ringPoint = d * ringHit - center;
        float r = length(ringPoint);
        if (ringHit > 0. && (!planet || ringHit < hit) && r > 5.7 && r < 8.2) {
          float edgeFade = smoothstep(5.7, 5.82, r) * (1. - smoothstep(8., 8.2, r));
          float gap = 1. - smoothstep(.025, .08, abs(r - 7.1));
          float striation = .64 + .045 * sin(r * 65.) + .035 * sin(r * 23.);
          // The planet casts a shadow through the rings on the side away from the light.
          float behind = dot(ringPoint, light);
          float shadowDistance = length(ringPoint - light * behind);
          float shade = mix(1., smoothstep(radius - .12, radius + .15, shadowDistance), step(behind, 0.));
          vec3 ringColor = mix(vec3(.23, .14, .075), vec3(.72, .39, .15), .55 + .2 * sin(r * 2.));
          ringColor *= (.3 + .55 * shade) * striation;
          c = mix(c, ringColor, edgeFade * (1. - gap * .88) * presence * .56);
        }
      }
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
