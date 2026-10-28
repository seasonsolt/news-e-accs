import * as THREE from "three";
import type { Kit, Model, View } from "../shared/geometry.ts";
import { workshop, type WorkshopAssets } from "../games/workshop.ts";
import { createElectricGame } from "../games/science-state.ts";

export function build(scene: THREE.Scene,k:Kit,assets:WorkshopAssets,renderer:THREE.WebGLRenderer):Model {
  const {wood,brass,iron,paper,glass,finish}=workshop(scene,k,renderer,assets,{theme:"electric"});
  const {mesh,box,cylinder,rod,tube,torus,sphere,material,texture}=k;
  const game=createElectricGame(),preserve=new Set<THREE.Object3D>();
  const copper=material(new THREE.MeshStandardMaterial({color:"#a6633f",metalness:.85,roughness:.29}));
  const ceramic=material(new THREE.MeshPhysicalMaterial({color:"#c2bca5",roughness:.35,clearcoat:.2}));
  const insulation=material(new THREE.MeshStandardMaterial({color:"#273b32",roughness:.92}));
  // A substantial carved laboratory bench with raised lamp plinths and through-bolted corners.
  box(scene,wood,[0,.85,.2],[3.7,.12,1.8],.035);box(scene,iron,[0,.75,.2],[3.25,.09,1.4],.012);
  for(const x of [-1.57,1.57])for(const z of [-.46,.84]){
    cylinder(scene,wood,[x,.4,z],.07,.74);for(const y of [.13,.31,.68])sphere(scene,wood,[x,y,z],.09).scale.y=.5;
    cylinder(scene,brass,[x,.06,z],.09,.09);cylinder(scene,brass,[x,.918,z],.025,.02);
  }
  for(const z of [-.46,.84])rod(scene,wood,[-1.57,.23,z],[1.57,.23,z],.035);
  const lampGroup=new THREE.Group();scene.add(lampGroup);preserve.add(lampGroup);
  const filaments:THREE.MeshStandardMaterial[]=[],lampLights:THREE.PointLight[]=[];
  const profile=[[0,.08],[.07,.08],[.075,.14],[.08,.2],[.14,.27],[.19,.38],[.205,.49],[.18,.6],[.12,.68],[0,.72]].map(([x,y])=>new THREE.Vector2(x!,y!));
  for(let i=0;i<3;i++){
    const x=(i-1)*.94,z=-.24,g=new THREE.Group();g.position.set(x,.92,z);lampGroup.add(g);
    cylinder(g,wood,[0,.028,0],.24,.055);cylinder(g,ceramic,[0,.085,0],.115,.09);cylinder(g,brass,[0,.13,0],.08,.11);
    for(let y=.105;y<.18;y+=.014)torus(g,brass,[0,y,0],.083,.005).rotation.x=Math.PI/2;
    mesh(g,new THREE.LatheGeometry(profile,64),glass);
    for(const dx of [-.05,.05])rod(g,brass,[dx,.16,0],[dx,.32,0],.004);
    const filament=material(new THREE.MeshStandardMaterial({color:"#38281b",emissive:"#ffb054",emissiveIntensity:0,roughness:.65}));filaments.push(filament);
    tube(g,filament,[[-.05,.29,0],[-.08,.42,0],[-.06,.51,0],[0,.54,0],[.06,.51,0],[.08,.42,0],[.05,.29,0]],.0055);
    const light=new THREE.PointLight("#ffd49a",0,2,2);light.position.set(x,1.4,z);scene.add(light);lampLights.push(light);
    const label=texture(128,128,(c,w,h)=>{c.fillStyle="#b5975d";c.fillRect(0,0,w,h);c.fillStyle="#2b2d22";c.font="64px serif";c.textAlign="center";c.fillText(String(i+1),w/2,87);});
    const plaque=mesh(g,new THREE.PlaneGeometry(.10,.10),material(new THREE.MeshStandardMaterial({map:label,metalness:.45,roughness:.45})),[0,.05,.23]);plaque.rotation.x=-.35;
    for(const dx of [-.14,.14]){cylinder(g,brass,[dx,.07,.10],.014,.04);tube(scene,insulation,[[x+dx,.98,z+.1],[x+dx,.95,z+.28],[x+dx*.8,.95,.48]],.013);}
  }
  // A rotary contact bridge is separate from the hinged brass knife switch.
  const selector=new THREE.Group();selector.position.set(-.88,.94,.72);scene.add(selector);preserve.add(selector);
  cylinder(selector,wood,[0,.025,0],.29,.05);cylinder(selector,ceramic,[0,.056,0],.23,.015);
  for(let i=0;i<4;i++){
    const a=i*Math.PI/2;cylinder(selector,brass,[Math.sin(a)*.18,.085,Math.cos(a)*.18],.027,.055);
    const map=texture(64,64,(c,w,h)=>{c.fillStyle="#c5b58c";c.fillRect(0,0,w,h);c.fillStyle="#3a342a";c.font="42px monospace";c.fillText(String(i),17,46);});
    const plate=mesh(selector,new THREE.PlaneGeometry(.065,.065),material(new THREE.MeshBasicMaterial({map})),[Math.sin(a)*.25,.06,Math.cos(a)*.25]);plate.rotation.x=-Math.PI/2;
  }
  const contact=new THREE.Group();contact.position.y=.116;selector.add(contact);rod(contact,brass,[0,0,0],[0,0,.18],.018);cylinder(contact,iron,[0,.028,0],.045,.055);preserve.add(contact);
  const switchBase=new THREE.Group();switchBase.position.set(.84,.94,.72);scene.add(switchBase);preserve.add(switchBase);
  box(switchBase,wood,[0,.024,0],[.56,.05,.5],.015);for(const z of [-.15,.15]){box(switchBase,ceramic,[0,.065,z],[.19,.06,.11],.008);for(const x of [-.045,.045])box(switchBase,brass,[x,.12,z],[.022,.09,.07],.004);}
  const blade=new THREE.Group();blade.position.set(0,.13,.15);switchBase.add(blade);preserve.add(blade);
  box(blade,brass,[0,0,-.15],[.06,.022,.33],.004);rod(blade,iron,[-.09,.03,-.15],[.09,.03,-.15],.023);
  // Raised cloth-covered leads route around the instrument bases, with brass terminal nuts.
  const routes=[[-1.0,-.05],[-.45,.05],[.25,.08],[.95,.12]];
  for(let i=0;i<4;i++){const [x,z]=routes[i]!;tube(scene,i===0?copper:insulation,[[-.88,.96,.72],[x!,.96,.4],[x!,.96,z!],[i===0?-1.45:(i-2)*.94,.96,-.1]],.012);}
  tube(scene,insulation,[[.84,.96,.87],[1.45,.96,.87],[1.45,.96,-.42],[-1.45,.96,-.42],[-1.45,.96,.72]],.014);
  for(const x of [-1.45,1.45])for(const z of [-.42,.72]){cylinder(scene,ceramic,[x,.97,z],.027,.07);cylinder(scene,brass,[x,1.015,z],.016,.025);}
  // Side dynamo: laminated pole shoes, many windings, and a rotating armature on bearings.
  box(scene,wood,[-2.65,.58,-.1],[1.0,.12,1.3],.02);for(const x of [-2.98,-2.32])for(const z of [-.58,.38])rod(scene,iron,[x,.02,z],[x,.53,z],.04);
  const dynamo=new THREE.Group();dynamo.position.set(-2.65,.98,-.1);scene.add(dynamo);
  for(const z of [-.4,.4]){box(dynamo,iron,[0,-.15,z],[.63,.55,.18],.05);for(let y=-.1;y<.25;y+=.025)box(dynamo,iron,[0,y,z],[.67,.012,.19],.002);}
  for(const z of [-.4,.4])for(let i=0;i<14;i++){const loop=torus(dynamo,copper,[0,-.03,z+(i-6.5)*.015],.20,.009);loop.scale.x=1.6;}
  const rotor=new THREE.Group();dynamo.add(rotor);preserve.add(rotor);
  const axle=cylinder(rotor,brass,[0,0,0],.035,1.0);axle.rotation.x=Math.PI/2;
  for(let i=0;i<12;i++){const a=i*Math.PI/6;rod(rotor,copper,[Math.cos(a)*.12,Math.sin(a)*.12,-.24],[Math.cos(a)*.12,Math.sin(a)*.12,.24],.011);}
  for(const z of [-.28,.28])torus(rotor,iron,[0,0,z],.13,.018);
  tube(scene,insulation,[[-2.3,1.05,-.1],[-2.05,1.05,-.1],[-1.7,.96,.72],[-1.45,.96,.72]],.013);
  // A freestanding brass display and paper experiments echo the electric-age palette.
  for (const x of [-1.85, 1.85]) box(scene,wood,[x,1.8,-3.6],[.07,3.6,.12]);
  for (const y of [.85,3.6]) box(scene,wood,[0,y,-3.6],[3.77,.08,.12]);
  const leaf= new THREE.Shape();leaf.moveTo(0,0);leaf.bezierCurveTo(-.09,.07,-.08,.20,0,.25);leaf.bezierCurveTo(.08,.20,.09,.07,0,0);
  const leafG=new THREE.ShapeGeometry(leaf,12);
  for(const sign of [-1,1])for(let i=0;i<8;i++){const y=1.15+i*.29,x=sign*(1.15+Math.sin(i*.45)*.35);rod(scene,brass,[x,y,-3.54],[x+sign*.15,y+.26,-3.54],.009);const l=mesh(scene,leafG,brass,[x,y,-3.5]);l.rotation.z=sign*(.6+i*.09);}
  torus(scene,brass,[0,2.9,-3.52],.45,.015);for(let i=0;i<36;i++){const a=i*Math.PI/18;rod(scene,brass,[Math.cos(a)*.5,2.9+Math.sin(a)*.5,-3.52],[Math.cos(a)*.65,2.9+Math.sin(a)*.65,-3.52],.004);}
  box(scene,paper,[1.27,.93,.24],[.35,.015,.42],.003);rod(scene,brass,[1.45,.95,.08],[1.45,.95,.4],.004);
  const statusMap=texture(1024,256,()=>{});const statusFace=mesh(scene,new THREE.PlaneGeometry(1.22,.28),material(new THREE.MeshBasicMaterial({map:statusMap})),[0,.65,1.112]);statusFace.castShadow=false;preserve.add(statusFace);
  const wide:View={position:[3.7,2.65,5.7],target:[-.3,1.15,-.3]},close:View={position:[.2,2.3,2.3],target:[0,1.2,.3]},side:View={position:[-3.3,1.85,2.1],target:[-1.9,1.0,0]};
  const spots=[
    {id:"contacts",title:"支路选择器",detail:"零号是短接示意，按状态牌上的目标灯顺序依次点亮三支灯。",object:selector,view:close,action:"route-next"},
    {id:"switch",title:"黄铜刀闸",detail:"合上或断开总开关，再测试所选支路。",object:switchBase,view:close,action:"switch"},
    {id:"lamps",title:"玻璃灯与灯丝",detail:"点击灯组测试回路；灯丝发光需要闭合的路径。",object:lampGroup,view:close,action:"primary"},
  ];
  for(const s of spots)s.object.traverse(o=>o.userData.spot=s.id);finish(preserve);let previous="";
  return{game,views:{wide,close,side,painting:wide},spots,pickables:spots.map(s=>s.object),canMove:(x,z)=>!(x> -3.3&&x<1.95&&z>-.8&&z<1.15),
    update(_phase,_time,dt){const s=game.view();contact.rotation.y=s.route*Math.PI/2;blade.rotation.x=s.closed?0:-.9;
      for(let i=0;i<3;i++){const on=s.lit.includes(i+1);filaments[i]!.emissiveIntensity=on?3.2:0;lampLights[i]!.intensity=on?.55:0;}
      if(s.closed)rotor.rotation.z+=dt*1.8;
      const signature=`${s.route}:${s.closed}:${s.progress}:${s.order}`;if(signature===previous)return;previous=signature;
      const c=statusMap.image.getContext("2d")!;c.fillStyle="#bca87b";c.fillRect(0,0,1024,256);c.fillStyle="#33362c";c.font="36px monospace";c.fillText("CLOSED PATH / 1879",34,63);c.font="30px monospace";c.fillText(`CONTACT ${s.route}    SWITCH ${s.closed?"CLOSED":"OPEN"}`,34,125);c.fillText(`LAMPS ${s.progress} / 3    TARGET LAMP ${s.progress===3?"-":s.target}`,34,185);statusMap.needsUpdate=true;
    }};
}
