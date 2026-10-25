import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { GTAOPass } from "three/examples/jsm/postprocessing/GTAOPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";

type Translate = (message: string, ...values: unknown[]) => string;
/** GTAOPass internals the subclass extends; three's types leave them out. */
interface VisibilityOverride { _overrideVisibility(): void; _visibilityCache: THREE.Object3D[] }

// Window glass and light shafts are not solid occluders in the AO normal/depth pass.
class WorkshopGTAOPass extends GTAOPass {
  _overrideVisibility() {
    (GTAOPass.prototype as unknown as VisibilityOverride)._overrideVisibility.call(this);
    const cache = (this as unknown as VisibilityOverride)._visibilityCache;
    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh && object.visible && (object.material as THREE.Material | undefined)?.transparent) {
        object.visible = false; cache.push(object);
      }
    });
  }
}

interface EngravingUniforms {
  uStrength: THREE.IUniform<number>; uResolution: THREE.IUniform<THREE.Vector2>; uLineScale: THREE.IUniform<number>; uLumaMap: THREE.IUniform<THREE.Vector4>;
  tDepth: THREE.IUniform<THREE.Texture | null>; tNormal: THREE.IUniform<THREE.Texture | null>;
  uProjection: THREE.IUniform<THREE.Matrix4>; uProjectionInverse: THREE.IUniform<THREE.Matrix4>; uCameraWorld: THREE.IUniform<THREE.Matrix4>;
}

// Sized from `viewport` (the element the canvas fills), not the window, so it is right inside an iframe or any container.
export function createWorkshopRenderer(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, viewport: HTMLElement, tx: Translate) {
  const composer = new EffectComposer(renderer);
  composer.renderTarget1.samples = 4; composer.renderTarget2.samples = 4;
  const ao = new WorkshopGTAOPass(scene, camera);
  ao.blendIntensity = .72;
  ao.updateGtaoMaterial({ radius: .2, thickness: .35, distanceExponent: 1.7, distanceFallOff: 1, scale: 1.15, samples: 16, screenSpaceRadius: false });
  ao.updatePdMaterial({ radius: 4, lumaPhi: 8, depthPhi: 2, normalPhi: 4, samples: 16 });
  const setAoSize = ao.setSize.bind(ao);
  ao.setSize = (width, height) => setAoSize(Math.max(1, Math.round(width * .7)), Math.max(1, Math.round(height * .7)));
  const grade = new ShaderPass({
    uniforms: { tDiffuse: { value: null } },
    vertexShader: "varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }",
    fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv;
      void main(){
        vec3 c=texture2D(tDiffuse,vUv).rgb;
        float l=dot(c,vec3(.2126,.7152,.0722));
        c=mix(vec3(l),c,.87)*vec3(1.025,1.0,.94);
        gl_FragColor=vec4(c,1.0);
      }`,
  });
  const engrave = new ShaderPass(ENGRAVING);
  const uniforms = engrave.uniforms as unknown as EngravingUniforms;
  // The AO pass already renders depth and view normals each frame; the hatching reads them to sit on the surfaces.
  uniforms.tDepth.value = ao.depthTexture;
  uniforms.tNormal.value = ao.normalTexture;
  uniforms.uProjection.value = camera.projectionMatrix;
  uniforms.uProjectionInverse.value = camera.projectionMatrixInverse;
  uniforms.uCameraWorld.value = camera.matrixWorld;
  composer.addPass(new RenderPass(scene, camera)); composer.addPass(ao); composer.addPass(grade); composer.addPass(new OutputPass()); composer.addPass(engrave);
  const resize = () => {
    const width = viewport.clientWidth, height = viewport.clientHeight;
    const mobile = innerWidth < 761, pixelRatio = Math.min(renderer.getPixelRatio(), mobile ? 1 : 1.25);
    composer.setPixelRatio(pixelRatio);
    composer.setSize(width, height);
    uniforms.uResolution.value.set(width * pixelRatio, height * pixelRatio);
    uniforms.uLineScale.value = pixelRatio;
    ao.updateGtaoMaterial({ samples: mobile ? 8 : 16 });
  };
  resize();
  // The plate's brightness spread is the target: the rendered frame is remapped onto the reference's luminance
  // mean and spread, measured once at the painting's viewpoint so the look does not pump while walking.
  async function calibrate(referenceUrl: string) {
    // onload, not decode(): decode() waits for a paint, which never comes while the tunnel keeps us hidden.
    const image = new Image();
    await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(new Error(tx("原画未能载入：{0}", referenceUrl))); image.src = referenceUrl; });
    const strength = uniforms.uStrength.value;
    uniforms.uStrength.value = 0; composer.render();
    const rendered = lumaStats(renderer.domElement), reference = lumaStats(image);
    uniforms.uLumaMap.value.set(rendered.mean, rendered.spread, reference.mean, reference.spread);
    uniforms.uStrength.value = strength;
  }
  function setEngraving(on: boolean) { uniforms.uStrength.value = on ? 1 : 0; }
  function dispose() {
    for (const pass of composer.passes) pass.dispose();
    composer.dispose();
  }
  return { composer, resize, calibrate, setEngraving, dispose };
}

function lumaStats(source: CanvasImageSource) {
  const canvas = document.createElement("canvas"); canvas.width = 96; canvas.height = 64;
  const context = canvas.getContext("2d", { willReadFrequently: true })!;
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
  let sum = 0, squares = 0; const count = data.length / 4;
  for (let i = 0; i < data.length; i += 4) {
    const l = (data[i]! * .2126 + data[i + 1]! * .7152 + data[i + 2]! * .0722) / 255; sum += l; squares += l * l;
  }
  const mean = sum / count;
  return { mean, spread: Math.sqrt(Math.max(squares / count - mean * mean, 1e-4)) };
}

// The plates are Victorian copperplate engravings: sepia paper and ink, brass the only saturated colour,
// tone carried by hatching, every form closed by an ink line. Runs on display colours after OutputPass.
const ENGRAVING = {
  uniforms: {
    tDiffuse: { value: null }, uStrength: { value: 1 },
    uResolution: { value: new THREE.Vector2(1, 1) }, uLineScale: { value: 1 },
    uLumaMap: { value: new THREE.Vector4(.5, .25, .5, .25) },   // rendered mean, spread → reference mean, spread
    tDepth: { value: null }, tNormal: { value: null },
    uProjection: { value: new THREE.Matrix4() }, uProjectionInverse: { value: new THREE.Matrix4() }, uCameraWorld: { value: new THREE.Matrix4() },
  },
  vertexShader: "varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }",
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uStrength, uLineScale; uniform vec2 uResolution; uniform vec4 uLumaMap;
    uniform sampler2D tDepth, tNormal; uniform mat4 uProjection, uProjectionInverse, uCameraWorld;
    varying vec2 vUv;
    float luma(vec3 c){ return dot(c, vec3(.2126,.7152,.0722)); }
    float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
    float noise(vec2 p){
      vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
      return mix(mix(hash(i), hash(i + vec2(1., 0.)), f.x), mix(hash(i + vec2(0., 1.)), hash(i + vec2(1., 1.)), f.x), f.y);
    }
    // A burin line: straight on average, with a slow waver so the set reads as cut by hand, not printed by screen.
    float hatch(vec2 p, float angle, float spacing, float width){
      if (width <= 0.) return 0.;
      vec2 dir = vec2(cos(angle), sin(angle));
      float along = dot(p, vec2(-dir.y, dir.x));
      float across = dot(p, dir) + (noise(vec2(along * .035, dot(p, dir) / spacing * .5)) - .5) * spacing * .7;
      float d = abs(fract(across / spacing) - .5) * 2.;
      return 1. - smoothstep(width - .2, width + .2, d);
    }
    void main(){
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      if (uStrength <= 0.) { gl_FragColor = vec4(c, 1.); return; }
      float l = luma(c);
      float t = clamp((l - uLumaMap.x) / uLumaMap.y * uLumaMap.w + uLumaMap.z, 0., 1.);
      t = mix(t, t * t * (3. - 2. * t), .55);   // the plates are printed hard: deep shadow, open light

      vec3 ink = vec3(.12,.075,.04), umber = vec3(.5,.36,.21), paper = vec3(.96,.89,.73);
      vec3 sepia = mix(mix(ink, umber, smoothstep(0., .48, t)), paper, smoothstep(.4, 1., t));
      // Brass keeps its hue and gets the plate's glow: warm, saturated pixels keep their colour at the remapped brightness.
      // Brass is yellow (green well above blue); the reddish wood (red well above green) stays in the sepia.
      float warmth = smoothstep(.04, .15, c.g - c.b) * (1. - smoothstep(.1, .2, c.r - c.g)) * smoothstep(.1, .35, l);
      vec3 hue = c / max(max(c.r, max(c.g, c.b)), .02);
      vec3 brass = clamp(mix(vec3(1.), hue, 1.25) * vec3(1., .82, .45) * (t * 1.25 + .08), 0., 1.);
      vec3 col = mix(sepia, brass, warmth * .85);

      // Hatching lives in wood, plaster and shadow, never on the brass: one set in the half-tones, a crossing set deep down.
      float shade = (1. - t) * (1. - warmth);
      float w1 = clamp((shade - .45) * 1.4, 0., .7), w2 = clamp((shade - .7) * 1.6, 0., .6);
      float h1, h2;
      float depth = texture2D(tDepth, vUv).x;
      if (depth < 1.) {
        // Cut into the surface, not the screen: the lines lie on the plane the surface faces, in world units, so they
        // stay on the wood and plaster as the camera moves. Their spacing steps by octaves with distance and blends
        // between two, so on screen they stay as fine as an engraver's.
        vec4 view = uProjectionInverse * vec4(vUv * 2. - 1., depth * 2. - 1., 1.);
        view /= view.w;
        vec3 world = (uCameraWorld * view).xyz;
        vec3 n = abs(mat3(uCameraWorld) * (texture2D(tNormal, vUv).xyz * 2. - 1.));
        vec2 plane = n.y > max(n.x, n.z) ? world.xz : n.x > n.z ? world.zy : world.xy;
        float perPixel = 2. * -view.z / uProjection[1][1] / (uResolution.y / uLineScale);
        float level = log2(perPixel / .004);
        float unit = .004 * exp2(floor(level)), blend = fract(level);
        vec2 p = plane / unit, q = plane / (unit * 2.);
        h1 = mix(hatch(p, .82, 3.4, w1), hatch(q, .82, 3.4, w1), blend);
        h2 = mix(hatch(p, -.55, 4.6, w2), hatch(q, -.55, 4.6, w2), blend);
      } else {
        // Nothing solid here (the view through the windows): the lines fall back to the paper.
        vec2 p = gl_FragCoord.xy / uLineScale;
        h1 = hatch(p, .82, 3.4, w1);
        h2 = hatch(p, -.55, 4.6, w2);
      }
      col *= 1. - .34 * max(h1, h2 * .85);

      // Ink contour from the luminance gradient.
      vec2 px = 1. / uResolution;
      float tl = luma(texture2D(tDiffuse, vUv + px * vec2(-1., 1.)).rgb), tr = luma(texture2D(tDiffuse, vUv + px * vec2(1., 1.)).rgb);
      float bl = luma(texture2D(tDiffuse, vUv + px * vec2(-1., -1.)).rgb), br = luma(texture2D(tDiffuse, vUv + px * vec2(1., -1.)).rgb);
      float gx = (tr + br) - (tl + bl), gy = (tl + tr) - (bl + br);
      float edge = smoothstep(.09, .3, length(vec2(gx, gy)));
      col = mix(col, ink, edge * .55);

      // Paper: fine tooth plus a slow mottle, strongest in the light areas where paper shows.
      float tooth = hash(floor(gl_FragCoord.xy / uLineScale)) - .5;
      float mottle = hash(floor(vUv * vec2(48., 32.))) - .5;
      col *= 1. + (tooth * .07 + mottle * .03) * (.4 + t);

      gl_FragColor = vec4(mix(c, col, uStrength), 1.);
    }`,
};
