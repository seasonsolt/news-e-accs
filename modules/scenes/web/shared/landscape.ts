import * as THREE from "three";
import type { Kit } from "./geometry.ts";
import { loadScan, type Scan } from "./scan-assets.ts";
import type { Surface } from "./surfaces.ts";
import manifest from "../stone-tools/manifest.json";

export interface LandscapeAssets { grass: Scan; shrub: Scan; earth: Surface }
export async function loadLandscapeAssets(own: (dispose: () => void) => void, renderer: THREE.WebGLRenderer): Promise<LandscapeAssets> {
  const url = (key: keyof typeof manifest) => `/media/scenes/stone-tools/${manifest[key]}`;
  async function texture(key: "soil-color" | "soil-normal" | "soil-roughness") {
    const map = await new THREE.TextureLoader().loadAsync(url(key)); own(() => map.dispose());
    map.wrapS = map.wrapT = THREE.RepeatWrapping; map.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    if (key === "soil-color") map.colorSpace = THREE.SRGBColorSpace;
    return map;
  }
  const [grass, shrub, map, normalMap, roughnessMap] = await Promise.all([
    loadScan(url("grass-clump"), own, renderer, true), loadScan(url("shrub"), own, renderer),
    texture("soil-color"), texture("soil-normal"), texture("soil-roughness"),
  ]);
  return { grass, shrub, earth: { map, normalMap, roughnessMap } };
}

export type Landscape = "meadow" | "river" | "coast" | "dusk" | "orbit";

export function landscapeFor(theme: string): Landscape {
  return theme === "space" ? "orbit" : theme === "observatory" ? "dusk" : theme === "flight" ? "coast" : ["clay", "writing", "steam"].includes(theme) ? "river" : "meadow";
}

export function landHeight(x: number, z: number, mood: Landscape = "meadow") {
  const outside = THREE.MathUtils.smoothstep(Math.hypot(x, z), 12, 55);
  return -.14 + outside * (Math.sin(x * .043 + z * .018) * 3.2 + Math.sin(z * .067 - x * .021) * 2 + 2)
    - (mood === "orbit" ? 0 : THREE.MathUtils.smoothstep(-z, 23, 38) * 5)
    + THREE.MathUtils.smoothstep(-z, 100, 150) * (7 + Math.sin(x * .035) * 3 + Math.sin(x * .08) * 1.5);
}

/** A walkable horizon around the apparatus, with a clear foreground and quiet movement in the distance. */
export function landscape(scene: THREE.Scene, k: Kit, assets: LandscapeAssets, mood: Landscape = "meadow", ground = true, groundAt?: (x: number, z: number) => number) {
  const orbital = mood === "orbit", dusk = mood === "dusk", coast = mood === "coast";
  const random = k.random, breeze = { value: 0 }, mobile = innerWidth < 761;
  const haze = orbital ? "#34445b" : dusk ? "#d9c2bd" : coast ? "#c7e1e4" : "#d4e3d4";
  scene.background = new THREE.Color(haze);
  scene.fog = new THREE.FogExp2(haze, orbital ? .0018 : .0016);
  scene.environmentIntensity = .75;
  if (!orbital) {
    const skyMaterial = k.material(new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false,
      uniforms: { time: breeze, zenith: { value: new THREE.Color(dusk ? "#687d9d" : "#75aacf") }, horizon: { value: new THREE.Color(dusk ? "#edc3ad" : "#dde9df") } },
      vertexShader: "varying vec3 skyPosition; void main(){skyPosition=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_Position.z=gl_Position.w;}",
      fragmentShader: `
        uniform vec3 zenith,horizon; uniform float time; varying vec3 skyPosition;
        float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
        float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
        void main(){
          vec3 d=normalize(skyPosition-cameraPosition);float elevation=max(d.y,0.);
          vec3 color=mix(horizon,zenith,pow(smoothstep(0.,.4,elevation),.65));
          vec2 p=d.xz/(elevation+.28)*2.4+vec2(time*.0015,0.);
          float n=noise(p)*.6+noise(p*2.1)*.27+noise(p*4.3)*.13;
          float cloud=smoothstep(.54,.78,n)*smoothstep(.02,.22,elevation)*.5;
          color=mix(color,vec3(.94,.95,.9),cloud);
          gl_FragColor=vec4(color,1.);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    }));
    const sky = k.mesh(scene, new THREE.SphereGeometry(580, 40, 24), skyMaterial);
    sky.castShadow = sky.receiveShadow = false;
  } else {
    scene.background = new THREE.Color("#102136");
    const globe = k.texture(1024, 512, (c, w, h) => {
      c.fillStyle = "#347eab"; c.fillRect(0, 0, w, h);
      for (let i = 0; i < 1100; i++) {
        const x = random() * w, y = random() * h;
        const land = Math.sin(x * .018 + Math.sin(y * .026) * 2) + Math.cos(y * .034 - x * .009);
        if (land > .45) { c.fillStyle = y < 75 || y > 440 ? "#dce4d6" : "#87a18b"; c.beginPath(); c.ellipse(x, y, 8 + random() * 25, 3 + random() * 14, -.3, 0, Math.PI * 2); c.fill(); }
      }
      c.strokeStyle = "#ffffffa0"; c.lineWidth = 10;
      for (let i = 0; i < 18; i++) { c.beginPath(); const y = 25 + random() * 460; c.ellipse(random() * w, y, 70 + random() * 160, 4 + random() * 15, -.25, 0, Math.PI * 1.5); c.stroke(); }
    });
    const earth = k.mesh(scene, new THREE.SphereGeometry(21, 64, 40), k.material(new THREE.MeshStandardMaterial({ map: globe, roughness: .9, emissive: "#244c65", emissiveIntensity: .2 })), [-65, 48, -140]);
    earth.rotation.z = .3;
    const air = k.mesh(scene, new THREE.SphereGeometry(21.5, 48, 32), k.material(new THREE.MeshBasicMaterial({ color: "#9bd8ff", transparent: true, opacity: .12, side: THREE.BackSide, depthWrite: false })), [-65, 48, -140]);
    air.castShadow = air.receiveShadow = earth.castShadow = earth.receiveShadow = false;
  }
  scene.add(new THREE.HemisphereLight(orbital ? "#e4eefb" : dusk ? "#e3dcec" : "#e5f2fc", orbital ? "#87909c" : "#b0a184", dusk ? 1.1 : 1.5));
  const sun = new THREE.DirectionalLight(dusk ? "#ffd4af" : "#fff1d7", dusk ? 1.6 : 2.3);
  sun.position.set(-18, dusk ? 12 : 32, -24); sun.castShadow = true; sun.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: .5, far: 90 });
  sun.shadow.normalBias = .018; sun.shadow.bias = -.00008; sun.shadow.radius = 3;
  scene.add(sun); k.own(() => sun.shadow.dispose());
  const fill = new THREE.DirectionalLight("#e3edf5", .8); fill.position.set(12, 10, 18); scene.add(fill);
  if (dusk || orbital) {
    const positions: number[] = [];
    for (let i = 0; i < 700; i++) {
      const a = random() * Math.PI * 2, y = .18 + random() * .8, r = Math.sqrt(1 - y * y);
      positions.push(Math.cos(a) * r * 280, y * 280, Math.sin(a) * r * 280);
    }
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    const stars = new THREE.Points(geometry, k.material(new THREE.PointsMaterial({ color: "#fff6df", size: .65, sizeAttenuation: true, transparent: true, opacity: orbital ? .85 : .6, fog: false })));
    scene.add(stars); k.own(() => geometry.dispose());
    if (dusk) {
      const moon = k.mesh(scene, new THREE.SphereGeometry(3.8, 40, 28), k.material(new THREE.MeshBasicMaterial({ color: "#fff0cf" })), [-48, 32, -150]);
      moon.castShadow = moon.receiveShadow = false;
    }
  }

  function height(x: number, z: number) {
    return groundAt ? groundAt(x, z) : landHeight(x, z, mood);
  }
  if (ground) {
    const terrain = new THREE.PlaneGeometry(340, 340, mobile ? 100 : 160, mobile ? 100 : 160); terrain.rotateX(-Math.PI / 2);
    const position = terrain.attributes.position!, uv = terrain.attributes.uv!, colors: number[] = [];
    const grass = new THREE.Color(orbital ? "#acb0ac" : coast ? "#b9bf98" : mood === "river" ? "#93ac82" : "#8da87b"), sand = new THREE.Color(orbital ? "#c7c7c0" : "#d6c8a2");
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i), z = position.getZ(i); position.setY(i, height(x, z)); uv.setXY(i, x / 5, z / 5);
      const path = Math.exp(-((x - Math.sin(z * .07) * 3 - 8) ** 2) / 7), edge = THREE.MathUtils.smoothstep(-z, 18, 30);
      const c = grass.clone().lerp(sand, Math.max(path * .7, edge)).multiplyScalar(.94 + .06 * Math.sin(x * .6 + z * .9)); colors.push(c.r, c.g, c.b);
    }
    terrain.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3)); terrain.computeVertexNormals();
    const earth = k.material(new THREE.MeshStandardMaterial({ ...assets.earth, vertexColors: true, roughness: 1, normalScale: new THREE.Vector2(.45, .45) }));
    // Keep the scan's fine texture, with meadow, path and shoreline colours set at landscape scale.
    earth.onBeforeCompile = shader => { shader.fragmentShader = shader.fragmentShader.replace("#include <map_fragment>", "#include <map_fragment>\ndiffuseColor.rgb = vColor * (.55 + .65 * dot(sampledDiffuseColor.rgb, vec3(.2126,.7152,.0722)));"); };
    const land = k.mesh(scene, terrain, earth); land.castShadow = false;
  }
  if (!orbital) {
    const ripple = k.texture(256, 256, (c, w, h) => {
      c.fillStyle = "#9da99e"; c.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 3) { c.strokeStyle = y % 2 ? "#cbd3c166" : "#687c7922"; c.beginPath(); for (let x = 0; x <= w; x += 4) c.lineTo(x, y + Math.sin(x * .06 + y) * 1.5); c.stroke(); }
    });
    ripple.wrapS = ripple.wrapT = THREE.RepeatWrapping; ripple.repeat.set(22, 16); ripple.colorSpace = THREE.NoColorSpace;
    const water = k.mesh(scene, new THREE.PlaneGeometry(320, 180), k.material(new THREE.MeshPhysicalMaterial({ color: dusk ? "#a1afbe" : "#73a8ab", roughness: .28, metalness: .18, bumpMap: ripple, bumpScale: .035, clearcoat: .8, clearcoatRoughness: .25 })), [0, -.32, -105]);
    water.rotation.x = -Math.PI / 2; water.castShadow = false;
    // The texture drifts slowly, while the water geometry stays at a stable, walkable shoreline.
    k.own(() => { ripple.offset.set(0, 0); });
    const dummy = new THREE.Object3D(), tint = new THREE.Color();
    // Reuse the site's scanned vegetation. Leave the work area and the view across the water clear.
    function vegetation(scan: Scan, count: number, grass: boolean) {
      const material = k.material(scan.material.clone());
      material.onBeforeCompile = shader => {
        shader.uniforms.landscapeTime = breeze;
        shader.vertexShader = "uniform float landscapeTime;\n" + shader.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\ntransformed.x += sin(landscapeTime * .55 + instanceMatrix[3].x * .7 + instanceMatrix[3].z * .4) * position.y * position.y * .025;");
      };
      const plants = new THREE.InstancedMesh(scan.geometry, material, count);
      for (let i = 0; i < count; i++) {
        const a = random() * Math.PI * 2, radius = (grass ? 7 : 16) + random() * (grass ? 52 : 80), x = Math.cos(a) * radius, z = Math.sin(a) * radius;
        const size = grass ? .25 + random() * .5 : 1.2 + random() * 2.2;
        dummy.position.set(x, height(x, z) - .02, z); dummy.rotation.set(0, a, 0);
        dummy.scale.set(size * (grass ? 1.6 : 1.3), size, size * (grass ? 1.6 : 1.3));
        if (ground && z < -22) dummy.scale.setScalar(0);
        dummy.updateMatrix(); plants.setMatrixAt(i, dummy.matrix);
        tint.setHSL(.18 + random() * .04, .09, .78 + random() * .15); plants.setColorAt(i, tint);
      }
      plants.castShadow = false; plants.receiveShadow = true; scene.add(plants); k.own(() => plants.dispose());
    }
    vegetation(assets.shrub, mobile ? 50 : 90, false);
    vegetation(assets.grass, mobile ? 260 : 700, true);
    k.animate(time => { breeze.value = time; ripple.offset.x = time * .001; ripple.offset.y = time * .0004; });
    return { height };
  }
  k.animate(time => { breeze.value = time; });
  return { height };
}
