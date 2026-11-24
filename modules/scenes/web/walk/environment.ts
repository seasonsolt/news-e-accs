import * as THREE from "three";
import { FullScreenQuad } from "three/examples/jsm/postprocessing/Pass.js";

/** Linear-light sky anchors copied from the journey's existing lighting palette.
 * The final anchor may describe the ending rather than another road position. */
export interface EnvironmentAnchor {
  s: number;
  top: THREE.Color;
  horizon: THREE.Color;
  sun: THREE.Color;
  sunDir: THREE.Vector3;
  power: number;
  sky: number;
  stars: number;
  ending?: boolean;
}

export interface WalkEnvironment {
  /** One stable CubeUV texture throughout loading, walking and replay. */
  texture: THREE.Texture;
  /** Blends cached, already-filtered lighting; never runs PMREM or allocates targets. */
  update: (s: number, dusk: number) => void;
  dispose: () => void;
}

/** Desktop only: call behind the world's existing useSky gate. Four anchors need
 * four loading captures; runtime blends their linear CubeUV atlases in one small
 * fullscreen pass. The visible sky, stars and cover artwork are not captured. */
export async function buildEnvironment({ renderer, signal, anchors, pause }: {
  renderer: THREE.WebGLRenderer;
  signal: AbortSignal;
  anchors: readonly EnvironmentAnchor[];
  pause: () => Promise<void>;
}): Promise<WalkEnvironment | undefined> {
  const road = anchors.filter(anchor => !anchor.ending).sort((a, b) => a.s - b.s);
  const ending = anchors.find(anchor => anchor.ending);
  if (!road.length) throw new Error("Environment needs a road lighting anchor");
  const captures = [...road, ...(ending ? [ending] : [])];
  const targets: THREE.WebGLRenderTarget[] = [];
  let output: THREE.WebGLRenderTarget | undefined, disposed = false;
  const generator = new THREE.PMREMGenerator(renderer);
  const geometry = new THREE.SphereGeometry(100, 16, 8);
  const uniforms = {
    top: { value: new THREE.Color() }, horizon: { value: new THREE.Color() },
    sun: { value: new THREE.Color() }, ground: { value: new THREE.Color() },
    sunDir: { value: new THREE.Vector3() }, stars: { value: 0 },
  };
  const sky = new THREE.ShaderMaterial({
    uniforms, side: THREE.BackSide, depthWrite: false, toneMapped: false,
    vertexShader: "varying vec3 bearing; void main(){ bearing=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }",
    fragmentShader: `varying vec3 bearing;
      uniform vec3 top, horizon, sun, ground, sunDir; uniform float stars;
      void main(){
        vec3 d=normalize(bearing); float up=max(d.y,0.);
        vec3 c=mix(top,horizon,exp(-up*6.5));
        float g=max(dot(d,sunDir),0.);
        float daylight=smoothstep(-.12,.12,sunDir.y)*(1.-stars*.65);
        c+=sun*daylight*(pow(g,4.)*.075+pow(g,48.)*.035);
        // Broad radiance is enough for diffuse/rough reflection; no tiny solar
        // disc, procedural mountains, stars or orbital texture in this capture.
        c=mix(c,ground,1.-smoothstep(-.22,-.015,d.y));
        gl_FragColor=vec4(c,1.);
      }`,
  });
  const scene = new THREE.Scene(), groundPigment = new THREE.Color("#6b5a45"), skyFill = new THREE.Color();
  scene.add(new THREE.Mesh(geometry, sky));
  const blendUniforms = { a: { value: null as THREE.Texture | null }, b: { value: null as THREE.Texture | null }, amount: { value: 0 } };
  const blendMaterial = new THREE.ShaderMaterial({
    uniforms: blendUniforms, depthTest: false, depthWrite: false, toneMapped: false, blending: THREE.NoBlending,
    vertexShader: "varying vec2 uvAtlas; void main(){ uvAtlas=uv; gl_Position=vec4(position.xy,0.,1.); }",
    fragmentShader: "varying vec2 uvAtlas; uniform sampler2D a,b; uniform float amount; void main(){ gl_FragColor=mix(texture2D(a,uvAtlas),texture2D(b,uvAtlas),amount); }",
  });
  const quad = new FullScreenQuad(blendMaterial);
  function dispose() {
    if (disposed) return; disposed = true;
    signal.removeEventListener("abort", dispose);
    for (const target of targets) target.dispose();
    output?.dispose(); generator.dispose(); geometry.dispose(); sky.dispose(); quad.dispose(); blendMaterial.dispose();
  }
  const check = () => { if (signal.aborted || disposed) throw new DOMException("Environment loading cancelled", "AbortError"); };
  signal.addEventListener("abort", dispose, { once: true });
  try {
    check();
    for (const anchor of captures) {
      await pause(); check();
      uniforms.top.value.copy(anchor.top); uniforms.horizon.value.copy(anchor.horizon);
      uniforms.sun.value.copy(anchor.sun); uniforms.sunDir.value.copy(anchor.sunDir); uniforms.stars.value = anchor.stars;
      uniforms.ground.value.copy(anchor.sun).multiplyScalar(anchor.power * Math.max(0, anchor.sunDir.y))
        .add(skyFill.copy(anchor.top).multiplyScalar(anchor.sky * .5)).multiply(groundPigment);
      targets.push(generator.fromScene(scene, 0, 1, 150, { size: 64 }));
    }
    check();
    // Clone the attachment configuration, not its content. No texture or target
    // is created after this loading phase; packed CubeUV layout stays identical.
    output = targets[0]!.clone();
    output.texture.mapping = THREE.CubeUVReflectionMapping;
    let lastA = -1, lastB = -1, lastMix = -1;
    const viewport = new THREE.Vector4(), scissor = new THREE.Vector4();
    function update(s: number, dusk: number) {
      if (disposed) return;
      let a = 0;
      while (a < road.length - 1 && s > road[a + 1]!.s) a++;
      let b = Math.min(a + 1, road.length - 1);
      const span = road[b]!.s - road[a]!.s;
      let amount = span > 0 ? THREE.MathUtils.clamp((s - road[a]!.s) / span, 0, 1) : 0;
      amount = amount * amount * (3 - 2 * amount);
      if (ending && dusk > 0) {
        // The ending starts at the last road anchor, preserving the warm field
        // reflection before its final afterglow. World direct light still eases continuously.
        a = road.length - 1; b = captures.length - 1; amount = THREE.MathUtils.clamp(dusk, 0, 1);
      }
      amount = Math.round(amount * 32) / 32;
      if (a === lastA && b === lastB && amount === lastMix) return;
      blendUniforms.a.value = targets[a]!.texture; blendUniforms.b.value = targets[b]!.texture; blendUniforms.amount.value = amount;
      const oldTarget = renderer.getRenderTarget(), oldFace = renderer.getActiveCubeFace(), oldMip = renderer.getActiveMipmapLevel(), oldXr = renderer.xr.enabled;
      renderer.getViewport(viewport); renderer.getScissor(scissor); const scissorTest = renderer.getScissorTest();
      try { renderer.xr.enabled = false; renderer.setRenderTarget(output!); quad.render(renderer); }
      finally {
        renderer.setRenderTarget(oldTarget, oldFace, oldMip); renderer.setViewport(viewport); renderer.setScissor(scissor);
        renderer.setScissorTest(scissorTest); renderer.xr.enabled = oldXr;
      }
      lastA = a; lastB = b; lastMix = amount;
    }
    update(road[0]!.s, 0);
    // The capture-only renderer objects are no longer needed. Their dispose
    // methods are idempotent and retained by the abort/final cleanup path.
    generator.dispose(); geometry.dispose(); sky.dispose();
    return { texture: output.texture, update, dispose };
  } catch (error) { dispose(); if (signal.aborted) return; throw error; }
}
