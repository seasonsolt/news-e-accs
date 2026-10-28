import * as THREE from "three";

/** Refresh on a deliberate scene change, never on every animation frame. */
export function roomReflections(scene: THREE.Scene, renderer: THREE.WebGLRenderer, own: (dispose: () => void) => void) {
  const cube = new THREE.WebGLCubeRenderTarget(128, { type: THREE.HalfFloatType });
  const camera = new THREE.CubeCamera(.08, 1200, cube); camera.position.set(.1, 5.5, .25);
  const pmrem = new THREE.PMREMGenerator(renderer); let environment: THREE.WebGLRenderTarget | null = null;
  own(() => { cube.dispose(); pmrem.dispose(); environment?.dispose(); });
  return () => {
    const previous = scene.environment; scene.environment = null;
    try {
      scene.updateMatrixWorld(true); camera.update(renderer, scene);
      const next = pmrem.fromCubemap(cube.texture); environment?.dispose(); environment = next; scene.environment = next.texture;
    } catch (error) { scene.environment = previous; throw error; }
  };
}
