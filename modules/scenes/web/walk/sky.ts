// A distant ringed world, drawn in angular space. The ring plane and the planet
// share the same ray intersections, so the near rings pass in front of its face.
export const skyVertex = `varying vec3 direction;
  void main() {
    direction = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
  }`;

export function skyFragment(output: string) {
  return `varying vec3 direction;
    uniform vec3 top, horizon, sun, sunDir, planetDirection;
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

    void main() {
      vec3 d = normalize(direction);
      float up = max(d.y, 0.);
      vec3 c = mix(horizon, top, pow(up, .48));
      if (d.y < 0.) c = mix(horizon, horizon * .42, min(1., -d.y * 6.));
      float g = max(dot(d, sunDir), 0.);
      c += sun * (pow(g, mix(12., 64., day)) * mix(.13, .075, day)
        + pow(g, mix(120., 360., day)) * .6) * step(-.08, sunDir.y);
      c += sun * smoothstep(mix(.9992, .9995, day), mix(.9996, .9998, day), g) * 6.;

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
      float presence = mix(.12, 1., stars) * smoothstep(-.02, .08, d.y);

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
      vec2 bearing = normalize(d.xz);
      float distant = .012 + .047 * noise(vec3(bearing * 5., 7.))
        + .018 * noise(vec3(bearing * 17., 4.));
      float nearer = .004 + .025 * noise(vec3(bearing * 8. + 9., 2.))
        + .012 * noise(vec3(bearing * 25., 1.));
      vec3 farRidge = mix(horizon * .68, top * 1.3, .35);
      vec3 nearRidge = mix(horizon * .4, top * .75, .5);
      c = mix(c, farRidge, 1. - smoothstep(distant - .001, distant + .001, d.y));
      c = mix(c, nearRidge, 1. - smoothstep(nearer - .001, nearer + .001, d.y));
      gl_FragColor = vec4(c, 1.);
      ${output}
    }`;
}
