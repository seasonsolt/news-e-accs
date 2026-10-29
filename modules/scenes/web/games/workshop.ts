import * as THREE from "three";
import { RectAreaLightUniformsLib } from "three/examples/jsm/lights/RectAreaLightUniformsLib.js";
import type { Kit } from "../shared/geometry.ts";
import { loadSurface, type Surface } from "../shared/surfaces.ts";
import { roomReflections } from "../shared/reflections.ts";

export interface WorkshopAssets { floor: Surface; wall: Surface; stone: Surface }
export async function loadWorkshopAssets(own: (dispose: () => void) => void): Promise<WorkshopAssets> {
  const [floor, wall, stone] = await Promise.all([loadSurface("wood", own), loadSurface("plaster", own), loadSurface("stone", own)]);
  return { floor, wall, stone };
}
type Theme = "clay" | "forge" | "print" | "observatory" | "steam" | "electric" | "flight" | "logic" | "space" | "network";

/** A furnished, lit architectural shell; each workshop owns its apparatus and playable mechanics. */
export function workshop(scene: THREE.Scene, k: Kit, renderer: THREE.WebGLRenderer, assets: WorkshopAssets, { theme, open = false }: { theme: Theme; open?: boolean }) {
  const technical = ["logic", "space", "network"].includes(theme), forge = theme === "forge", clay = theme === "clay";
  const night = technical || theme === "observatory";
  const { box, rod, cylinder, torus, mesh, material, texture } = k;
  scene.background = new THREE.Color(technical ? "#07101b" : "#161411");
  scene.fog = new THREE.FogExp2(technical ? "#111b25" : "#31291e", .018);
  scene.environmentIntensity = technical ? .6 : .8;
  const wood = material(new THREE.MeshPhysicalMaterial({ ...assets.floor, color: clay ? "#a78459" : "#8e6948", roughness: .65, clearcoat: .16, clearcoatRoughness: .4, normalScale: new THREE.Vector2(.28, .28) }));
  const stone = material(new THREE.MeshStandardMaterial({ ...assets.stone, color: forge ? "#73675c" : "#a9997e", roughness: .88, normalScale: new THREE.Vector2(.45, .45) }));
  const plaster = material(new THREE.MeshStandardMaterial({ ...assets.wall, color: technical ? "#4a5660" : clay ? "#aa8f68" : "#897e6a", roughness: .93, normalScale: new THREE.Vector2(.35, .35) }));
  const brass = material(new THREE.MeshPhysicalMaterial({ color: "#ac8449", metalness: .82, roughness: .28, clearcoat: .13 }));
  const iron = material(new THREE.MeshStandardMaterial({ color: technical ? "#263541" : "#292b29", metalness: .7, roughness: .43 }));
  const paper = material(new THREE.MeshStandardMaterial({ color: "#d9ceb1", roughness: .88 }));
  const glass = material(new THREE.MeshPhysicalMaterial({ color: "#b4d5d0", metalness: .12, roughness: .12, transparent: true, opacity: .15, clearcoat: 1, depthWrite: false }));
  const glow = material(new THREE.MeshBasicMaterial({ color: technical ? "#91d4d3" : "#ffe1a7" }));
  const floor = mesh(scene, new THREE.PlaneGeometry(10, 12), clay || forge ? stone : wood, [0, -.025, .4]); floor.rotation.x = -Math.PI / 2; floor.castShadow = false;
  const uv = floor.geometry.attributes.uv!; for(let i=0;i<uv.count;i++) uv.setXY(i, uv.getX(i)*4, uv.getY(i)*4);
  for(const x of [-4.65,4.65]) {
    box(scene,plaster,[x,2.0,0],[.18,4.1,8]);
    box(scene,iron,[x*.98,.13,0],[.045,.22,8],.005);
    for(let z=-3.4;z<3.5;z+=1.7)box(scene,technical?iron:wood,[x*.975,2,z],[.14,4,.15],.006);
  }
  box(scene,plaster,[0,2,-3.72],[9.5,4.1,.15]);
  if(!open) {
    box(scene,technical?iron:plaster,[0,4.05,0],[9.5,.12,8]);
    for(let z=-3.5;z<3.9;z+=1.6)box(scene,wood,[0,3.88,z],[9.3,.23,.16],.008);
  }
  // Deep window jambs, a sill and leaded lights give the room a readable light source.
  const sky = texture(256,512,(c,w,h)=>{
    const gradient=c.createLinearGradient(0,0,0,h);gradient.addColorStop(0,night?"#142e47":"#8396a3");gradient.addColorStop(.56,night?"#3b566a":"#e1c99d");gradient.addColorStop(1,night?"#243943":"#59675c");c.fillStyle=gradient;c.fillRect(0,0,w,h);
    c.fillStyle=night?"#c5d2cb":"#d6c8a5";for(let i=0;i<18;i++) {const x=(i*37)%w,y=(i*61)%Math.round(h*.6);c.fillRect(x,y,night?1:2,night?1:2);}
    c.fillStyle=night?"#0e1d28":"#45514b";c.beginPath();c.moveTo(0,h);for(let x=0;x<=w;x+=8)c.lineTo(x,h*.72+Math.sin(x*.035)*30+Math.cos(x*.081)*8);c.lineTo(w,h);c.fill();
  });
  const windowMaterial=material(new THREE.MeshBasicMaterial({map:sky,fog:false}));
  for(const x of [-2.8,2.8]) {
    const pane=mesh(scene,new THREE.PlaneGeometry(1.6,2.35),windowMaterial,[x,2.35,-3.615]);pane.castShadow=pane.receiveShadow=false;
    for(const side of [-1,1]){box(scene,stone,[x+side*.89,2.35,-3.47],[.17,2.7,.32],.012);box(scene,wood,[x,2.35+side*1.24,-3.44],[1.65,.13,.3],.01);}
    box(scene,stone,[x,1.08,-3.35],[2,.1,.55],.014);
    if(!clay&&!forge){for(const dx of [-.4,0,.4])box(scene,brass,[x+dx,2.35,-3.4],[.018,2.35,.035],.002);box(scene,brass,[x,2.35,-3.4],[1.6,.028,.035],.002);}
  }
  // Cornice, low cabinets and framed drafting sheets fill the reverse and side views.
  for(const x of clay || forge ? [] : [-4.2,4.2]) {
    box(scene,wood,[x,.52,-2.15],[.6,.95,1.8],.018);
    for(let z=-2.75;z<-1.5;z+=.42){box(scene,iron,[x+(x<0?.31:-.31),.57,z],[.014,.55,.36],.004);rod(scene,brass,[x+(x<0?.33:-.33),.57,z-.07],[x+(x<0?.33:-.33),.57,z+.07],.008);}
  }
  for(const x of clay || forge || theme === "observatory" ? [] : [-1.18,1.18]){
    box(scene,wood,[x,2.7,-3.52],[1.2,.82,.07],.01);box(scene,paper,[x,2.7,-3.475],[1.1,.72,.004],0);
    for(let i=0;i<9;i++)rod(scene,brass,[x-.44,2.42+i*.06,-3.467],[x+.44,2.42+i*.06,-3.467],.0014);
  }
  RectAreaLightUniformsLib.init();
  scene.add(new THREE.HemisphereLight(technical?"#95bdcc":"#c8c2b1","#30271f",.27));
  const key=new THREE.SpotLight(forge?"#ffbd78":technical?"#b8dbe0":"#ffe0aa",technical?65:100,14,.64,.65,2);
  key.position.set(-2.8,3.4,-3.0);key.target.position.set(.25,.65,.6);key.castShadow=true;key.shadow.mapSize.set(2048,2048);key.shadow.camera.near=.1;key.shadow.camera.far=14;key.shadow.normalBias=.002;key.shadow.bias=-.00008;scene.add(key,key.target);k.own(()=>key.shadow.dispose());
  for(const x of [-2.8,2.8]){const light=new THREE.RectAreaLight(night?"#91b7ce":"#e8c696",night?1.9:2.4,1.6,2.3);light.position.set(x,2.35,-3.3);light.lookAt(0,1,.5);scene.add(light);}
  const fill=new THREE.RectAreaLight(technical?"#ffd09a":"#efcca0",1.5,2.5,1.1);fill.position.set(1.5,3.3,1);fill.lookAt(0,.7,0);scene.add(fill);
  const bounce=new THREE.RectAreaLight(technical?"#c1d3d9":"#e5cfac",technical?2.4:3.5,3.5,2);bounce.position.set(-.8,2.8,3.2);bounce.lookAt(0,1,0);scene.add(bounce);
  // A visible pendant accounts for the near-field warm reflection.
  if(!clay&&!forge){cylinder(scene,iron,[1.5,3.55,1],.19,.11,.09);cylinder(scene,glow,[1.5,3.485,1],.17,.005);rod(scene,iron,[1.5,3.62,1],[1.5,4,1],.006);torus(scene,brass,[1.5,3.49,1],.19,.008).rotation.x=Math.PI/2;}
  const reflect=roomReflections(scene,renderer,k.own);
  return {wood,stone,plaster,brass,iron,paper,glass,glow,finish(preserve:Set<THREE.Object3D>){k.mergeStatic(scene,preserve);reflect();}};
}
