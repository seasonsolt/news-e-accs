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
  // Every room has real window openings, so the sun (the moon for the observatory) throws window-shaped light across the floor and apparatus.
  const night = theme === "observatory", modern = theme === "space" || theme === "network";
  const { box, rod, cylinder, torus, mesh, material, texture } = k;
  scene.background = new THREE.Color(night ? "#13202e" : "#c8d1d1");
  scene.fog = new THREE.FogExp2(night ? "#1b2633" : "#d8d0c0", .01);
  scene.environmentIntensity = 1;
  const wood = material(new THREE.MeshPhysicalMaterial({ ...assets.floor, color: clay ? "#a78459" : "#a98159", roughness: .65, clearcoat: .16, clearcoatRoughness: .4, normalScale: new THREE.Vector2(.28, .28) }));
  const stone = material(new THREE.MeshStandardMaterial({ ...assets.stone, color: forge ? "#8a7d70" : "#a9997e", roughness: .88, normalScale: new THREE.Vector2(.45, .45) }));
  const plaster = material(new THREE.MeshStandardMaterial({ ...assets.wall, color: technical ? "#e6ece4" : clay ? "#e6d2ad" : forge ? "#d8c8ad" : night ? "#d6cdbb" : "#f2e8d4", roughness: .93, normalScale: new THREE.Vector2(.35, .35) }));
  const brass = material(new THREE.MeshPhysicalMaterial({ color: "#ac8449", metalness: .82, roughness: .28, clearcoat: .13 }));
  const iron = material(new THREE.MeshStandardMaterial({ color: technical ? "#263541" : "#292b29", metalness: .7, roughness: .43 }));
  const paper = material(new THREE.MeshStandardMaterial({ color: "#d9ceb1", roughness: .88 }));
  const glass = material(new THREE.MeshPhysicalMaterial({ color: "#b4d5d0", metalness: .12, roughness: .12, transparent: true, opacity: .15, clearcoat: 1, depthWrite: false }));
  const glow = material(new THREE.MeshBasicMaterial({ color: technical ? "#91d4d3" : "#ffe1a7" }));
  const floor = mesh(scene, new THREE.PlaneGeometry(10, 12), clay || forge ? stone : wood, [0, -.025, .4]); floor.rotation.x = -Math.PI / 2; floor.castShadow = false;
  const uv = floor.geometry.attributes.uv!; for(let i=0;i<uv.count;i++) uv.setXY(i, uv.getX(i)*4, uv.getY(i)*4);
  // Openings are [centre, width] along a wall, all from sill to head height.
  const sill=.9,head=3.5,backOpenings:[number,number][]=[[-2.8,2.2],[2.8,2.2]],sideOpenings:[number,number][]=[[-.7,1.1],[.7,1.1]];
  function wall(at:(along:number,y:number)=>THREE.Vector3Tuple,size:(length:number,height:number)=>THREE.Vector3Tuple,from:number,to:number,openings:[number,number][]){
    let start=from;
    for(const [centre,width] of openings){box(scene,plaster,at((start+centre-width/2)/2,2.05),size(centre-width/2-start,4.1));box(scene,plaster,at(centre,sill/2),size(width,sill));box(scene,plaster,at(centre,(head+4.1)/2),size(width,4.1-head));start=centre+width/2;}
    box(scene,plaster,at((start+to)/2,2.05),size(to-start,4.1));
  }
  for(const x of [-4.65,4.65]) {
    wall((z,y)=>[x,y,z],(l,h)=>[.18,h,l],-4,4,x<0?sideOpenings:[]);
    box(scene,iron,[x*.98,.13,0],[.045,.22,8],.005);
    for(let z=-3.4;z<3.5;z+=1.7)box(scene,modern?iron:wood,[x*.975,2,z],[.14,4,.15],.006);
  }
  wall((x,y)=>[x,y,-3.72],(l,h)=>[l,h,.15],-4.75,4.75,backOpenings);
  if(!open) {
    box(scene,plaster,[0,4.05,0],[9.5,.12,8]);
    for(let z=-3.5;z<3.9;z+=1.6)box(scene,wood,[0,3.88,z],[9.3,.23,.16],.008);
  }
  // Sky and distant hills sit outside the openings; they neither cast nor receive the sun's shadow.
  const sky = texture(256,512,(c,w,h)=>{
    const gradient=c.createLinearGradient(0,0,0,h);gradient.addColorStop(0,night?"#142e47":"#8396a3");gradient.addColorStop(.56,night?"#3b566a":"#e1c99d");gradient.addColorStop(1,night?"#243943":"#59675c");c.fillStyle=gradient;c.fillRect(0,0,w,h);
    c.fillStyle=night?"#c5d2cb":"#d6c8a5";for(let i=0;i<18;i++) {const x=(i*37)%w,y=(i*61)%Math.round(h*.6);c.fillRect(x,y,night?1:2,night?1:2);}
    c.fillStyle=night?"#0e1d28":"#8f9a86";c.beginPath();c.moveTo(0,h);for(let x=0;x<=w;x+=8)c.lineTo(x,h*.72+Math.sin(x*.035)*30+Math.cos(x*.081)*8);c.lineTo(w,h);c.fill();
  });
  const windowMaterial=material(new THREE.MeshBasicMaterial({map:sky,fog:false}));
  for(const [at,turn] of [[[0,4,-9],0],[[-10,4,0],Math.PI/2]] as const){const view=mesh(scene,new THREE.PlaneGeometry(26,13),windowMaterial,[...at]);view.rotation.y=turn;view.castShadow=view.receiveShadow=false;}
  const frame=technical?iron:wood;
  for(const [x,width] of backOpenings){
    box(scene,stone,[x,sill-.04,-3.55],[width+.3,.08,.42],.012);
    for(let i=1;i<4;i++)box(scene,frame,[x-width/2+i*width/4,(sill+head)/2,-3.72],[.04,head-sill,.06],.004);
    for(const y of [1.75,2.65])box(scene,frame,[x,y,-3.72],[width,.04,.06],.004);
  }
  for(const [z,width] of sideOpenings){
    box(scene,stone,[-4.48,sill-.04,z],[.42,.08,width+.2],.012);
    box(scene,frame,[-4.65,(sill+head)/2,z],[.06,head-sill,.04],.004);
    for(const y of [1.75,2.65])box(scene,frame,[-4.65,y,z],[.06,.04,width],.004);
  }
  // Cornice, low cabinets and framed drafting sheets fill the reverse and side views.
  for(const x of clay || forge ? [] : [-4.2,4.2]) {
    box(scene,wood,[x,.52,-2.15],[.6,.95,1.8],.018);
    for(let z=-2.75;z<-1.5;z+=.42){box(scene,iron,[x+(x<0?.31:-.31),.57,z],[.014,.55,.36],.004);rod(scene,brass,[x+(x<0?.33:-.33),.57,z-.07],[x+(x<0?.33:-.33),.57,z+.07],.008);}
  }
  for(const x of clay || forge || night ? [] : [-1.18,1.18]){
    box(scene,wood,[x,2.7,-3.52],[1.2,.82,.07],.01);box(scene,paper,[x,2.7,-3.475],[1.1,.72,.004],0);
    for(let i=0;i<9;i++)rod(scene,brass,[x-.44,2.42+i*.06,-3.467],[x+.44,2.42+i*.06,-3.467],.0014);
  }
  RectAreaLightUniformsLib.init();
  scene.add(new THREE.HemisphereLight(night?"#9fb4c8":"#dfe7ea",night?"#4a4238":"#b39d7f",night?.8:1.4));
  const sun=new THREE.DirectionalLight(night?"#b8cde8":"#ffe3ba",night?1.3:3.4),view=sun.shadow.camera;
  sun.position.set(-7,7.5,-8.5);sun.target.position.set(.4,0,1);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);
  view.left=view.bottom=-7;view.right=view.top=7;view.near=1;view.far=28;sun.shadow.normalBias=.02;sun.shadow.bias=-.0002;scene.add(sun,sun.target);k.own(()=>sun.shadow.dispose());
  // Cool skylight spills inward from every opening, against the warm sun patches.
  const skylight=night?"#8eaccc":"#d6e2ea",spill=night?2:4;
  for(const [x,width] of backOpenings){const light=new THREE.RectAreaLight(skylight,spill,width,head-sill);light.position.set(x,(sill+head)/2,-3.6);light.lookAt(x,(sill+head)/2,0);scene.add(light);}
  for(const [z,width] of sideOpenings){const light=new THREE.RectAreaLight(skylight,spill,width,head-sill);light.position.set(-4.5,(sill+head)/2,z);light.lookAt(0,(sill+head)/2,z);scene.add(light);}
  // Sunlit floorboards bounce warm light back onto the far wall and ceiling; at night the lamps do.
  const bounce=new THREE.RectAreaLight(night?"#f0c48a":"#f1dcbc",night?2.4:3,5,2.5);bounce.position.set(0,2.4,4);bounce.lookAt(0,2.2,-3.7);scene.add(bounce);
  // A visible pendant accounts for the near-field warm reflection.
  if(!clay&&!forge){cylinder(scene,iron,[1.5,3.55,1],.19,.11,.09);cylinder(scene,glow,[1.5,3.485,1],.17,.005);rod(scene,iron,[1.5,3.62,1],[1.5,4,1],.006);torus(scene,brass,[1.5,3.49,1],.19,.008).rotation.x=Math.PI/2;}
  const reflect=roomReflections(scene,renderer,k.own);
  return {wood,stone,plaster,brass,iron,paper,glass,glow,finish(preserve:Set<THREE.Object3D>){k.mergeStatic(scene,preserve);reflect();}};
}
