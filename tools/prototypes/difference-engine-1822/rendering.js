import { EffectComposer } from "./vendor/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "./vendor/addons/postprocessing/RenderPass.js";
import { GTAOPass } from "./vendor/addons/postprocessing/GTAOPass.js";
import { ShaderPass } from "./vendor/addons/postprocessing/ShaderPass.js";
import { OutputPass } from "./vendor/addons/postprocessing/OutputPass.js";

// Window glass and light shafts are not solid occluders in the AO normal/depth pass.
class WorkshopGTAOPass extends GTAOPass {
  _overrideVisibility() {
    super._overrideVisibility();
    this.scene.traverse((object) => {
      if (object.isMesh && object.visible && object.material?.transparent) {
        object.visible = false; this._visibilityCache.push(object);
      }
    });
  }
}

export function createWorkshopRenderer(renderer, scene, camera) {
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
  composer.addPass(new RenderPass(scene, camera)); composer.addPass(ao); composer.addPass(grade); composer.addPass(new OutputPass());
  const resize = () => {
    const mobile = innerWidth < 761;
    composer.setPixelRatio(Math.min(renderer.getPixelRatio(), mobile ? 1 : 1.25));
    composer.setSize(innerWidth, innerHeight);
    ao.updateGtaoMaterial({ samples: mobile ? 8 : 16 });
  };
  resize();
  return { composer, resize };
}
