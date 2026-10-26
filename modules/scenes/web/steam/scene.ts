import * as THREE from "three";
import type { Kit, Model, View } from "../shared/geometry.ts";
import { workshop, type WorkshopAssets } from "../games/workshop.ts";
import { createSteamGame } from "../games/science-state.ts";

export function build(scene: THREE.Scene, k: Kit, assets: WorkshopAssets, renderer: THREE.WebGLRenderer): Model {
  const { wood,stone,brass,iron,paper,glow,finish }=workshop(scene,k,renderer,assets,{theme:"steam"});
  const { mesh,box,cylinder,rod,tube,torus,sphere,material,texture }=k;
  const game=createSteamGame(),preserve=new Set<THREE.Object3D>();
  const copper=material(new THREE.MeshStandardMaterial({color:"#a16840",metalness:.86,roughness:.3}));
  const brick=material(new THREE.MeshStandardMaterial({color:"#684538",roughness:.94}));
  // Masonry hearth, riveted vertical boiler and separate condenser.
  for(let y=0;y<3;y++)for(let x=0;x<5;x++)box(scene,brick,[-2.7+x*.24+(y%2)*.07,.09+y*.15,-.5],[.23,.14,.85],.009);
  const boiler=cylinder(scene,copper,[-2.15,1.05,-.5],.43,1.1);sphere(scene,copper,[-2.15,1.6,-.5],.43).scale.y=.42;
  for(const y of [.54,.76,1.3,1.57]){
    cylinder(scene,brass,[-2.15,y,-.5],.442,.035);
    for(let i=0;i<20;i++){const a=i*Math.PI/10;sphere(scene,iron,[-2.15+Math.cos(a)*.44,y,-.5+Math.sin(a)*.44],.012);}
  }
  cylinder(scene,iron,[-2.46,2.05,-.65],.11,1.0);torus(scene,iron,[-2.46,2.54,-.65],.115,.017).rotation.x=Math.PI/2;
  box(scene,iron,[-2.15,.3,-.04],[.43,.27,.045],.015);
  for(let i=0;i<8;i++)rod(scene,iron,[-2.32+i*.05,.2,-.005],[-2.32+i*.05,.4,-.005],.008);
  box(scene,glow,[-2.15,.29,-.02],[.34,.14,.01],.002);
  tube(scene,brass,[[-2.15,1.72,-.5],[-2.15,1.96,-.5],[-1.25,1.96,-.5],[-1.25,1.48,-.3]],.045);
  cylinder(scene,iron,[-.9,.48,-.82],.22,.65);torus(scene,brass,[-.9,.8,-.82],.22,.02).rotation.x=Math.PI/2;
  tube(scene,copper,[[-1.22,1.0,-.35],[-1.22,.4,-.4],[-.9,.25,-.82]],.029);
  // Cast base, paired columns and rocking beam.
  box(scene,stone,[.12,.14,.12],[3.3,.26,1.55],.025);box(scene,iron,[.12,.3,.12],[3.12,.09,1.4],.012);
  for(const x of [-.36,-.04])for(const z of [-.25,.21]){cylinder(scene,iron,[x,1.22,z],.055,1.8);cylinder(scene,brass,[x,.4,z],.085,.09);cylinder(scene,brass,[x,2.08,z],.085,.06);}
  rod(scene,brass,[-.2,2.1,-.34],[-.2,2.1,.33],.075);
  const beam=new THREE.Group();beam.position.set(-.2,2.1,0);scene.add(beam);preserve.add(beam);
  box(beam,iron,[0,0,0],[2.6,.12,.2],.035);
  for(const z of [-.11,.11])box(beam,brass,[0,.04,z],[2.4,.018,.015],.003);
  for(const x of [-1.22,0,1.22]){const axle=cylinder(beam,brass,[x,0,0],.075,.27);axle.rotation.x=Math.PI/2;}
  cylinder(scene,iron,[-1.42,.91,0],.21,1.05);cylinder(scene,brass,[-1.42,1.44,0],.235,.055);
  for(let i=0;i<8;i++){const a=i*Math.PI/4;cylinder(scene,brass,[-1.42+Math.cos(a)*.19,1.49,Math.sin(a)*.19],.015,.055);}
  const piston=cylinder(scene,brass,[-1.42,1.7,0],.035,.8);preserve.add(piston);
  const crankCenter=new THREE.Vector3(1.15,1.03,.21),radius=.63;
  const fly=new THREE.Group();fly.position.copy(crankCenter);scene.add(fly);preserve.add(fly);
  torus(fly,iron,[0,0,0],radius,.065);torus(fly,brass,[0,0,.043],radius,.014);
  for(let i=0;i<8;i++){const a=i*Math.PI/4;rod(fly,iron,[Math.cos(a)*.11,Math.sin(a)*.11,0],[Math.cos(a)*radius,Math.sin(a)*radius,0],.025);}
  const hub=cylinder(fly,brass,[0,0,0],.105,.36);hub.rotation.x=Math.PI/2;
  sphere(fly,brass,[.24,0,.2],.055);
  for(const z of [-.04,.49]){box(scene,iron,[1.15,.48,z],[.28,.31,.22],.014);const shaft=cylinder(scene,brass,[1.15,1.03,z],.055,.24);shaft.rotation.x=Math.PI/2;}
  // A persistent rod mesh is transformed, rather than rebuilt, as the crank turns.
  const link=rod(scene,brass,[1.02,2.1,.41],[1.39,1.03,.41],.028);preserve.add(link);
  const jointA=new THREE.Vector3(),jointB=new THREE.Vector3(),direction=new THREE.Vector3(),axis=new THREE.Vector3(0,1,0);
  const originalLength=new THREE.Vector3(1.02,2.1,.41).distanceTo(new THREE.Vector3(1.39,1.03,.41));
  function handwheel(x:number,y:number,z:number,r=.15){
    const g=new THREE.Group();g.position.set(x,y,z);scene.add(g);preserve.add(g);torus(g,brass,[0,0,0],r,.018);
    for(let i=0;i<4;i++){const a=i*Math.PI/2;rod(g,brass,[0,0,0],[Math.cos(a)*r,Math.sin(a)*r,0],.009);}sphere(g,iron,[0,0,0],.04);return g;
  }
  const valve=handwheel(-1.98,1.95,.05),load=handwheel(1.97,.72,.52,.2),relief=handwheel(-2.67,1.68,.05,.10);
  tube(scene,brass,[[-2.15,1.7,-.5],[-1.98,1.95,-.5],[-1.98,1.95,.05]],.025);
  box(scene,wood,[2.0,.44,.46],[.55,.08,.72],.015);for(const x of [1.8,2.2])rod(scene,iron,[x,.02,.46],[x,.42,.46],.035);
  const dialNeedles:THREE.Group[]=[],dialTargets:THREE.Group[]=[],dialFaces:THREE.Mesh[]=[];
  for(let i=0;i<2;i++){
    const x=-.75+i*.75,y=2.6,z=-.15;
    rod(scene,brass,[x,2.2,z-.1],[x,y,z-.1],.018);
    const casing=cylinder(scene,brass,[x,y,z],.29,.09);casing.rotation.x=Math.PI/2;
    const dialMap=texture(512,512,(c,w,h)=>{c.fillStyle="#d9ccb0";c.fillRect(0,0,w,h);c.translate(256,256);c.strokeStyle="#463f31";c.lineWidth=3;
      for(let j=0;j<=8;j++){const a=(-.75+j/8*1.5)*Math.PI;c.beginPath();c.moveTo(Math.sin(a)*180,-Math.cos(a)*180);c.lineTo(Math.sin(a)*206,-Math.cos(a)*206);c.stroke();c.font="23px monospace";c.fillStyle="#463f31";c.fillText(String(j),Math.sin(a)*151-7,-Math.cos(a)*151+8);}
      c.font="24px monospace";c.fillText(i?"SPEED":"PRESSURE",i?-39:-58,95);c.font="16px monospace";c.fillText("MODEL SCALE",-53,126);
    });
    const face=mesh(scene,new THREE.CircleGeometry(.265,48),material(new THREE.MeshBasicMaterial({map:dialMap})),[x,y,z+.052]);face.castShadow=false;preserve.add(face);dialFaces.push(face);
    const pointer=new THREE.Group();pointer.position.set(x,y,z+.063);scene.add(pointer);box(pointer,brass,[0,.105,0],[.012,.22,.006],.002);sphere(pointer,iron,[0,0,0],.023);preserve.add(pointer);dialNeedles.push(pointer);
    const target=new THREE.Group();target.position.set(x,y,z+.065);scene.add(target);box(target,material(new THREE.MeshBasicMaterial({color:"#779b82"})),[0,.237,0],[.052,.024,.008],.003);preserve.add(target);dialTargets.push(target);
  }
  // Open logbook, oil can and copper fittings keep the workbench human-sized.
  box(scene,wood,[.05,.86,1.65],[1.2,.065,.6],.015);for(const x of [-.42,.52])for(const z of [1.45,1.85])rod(scene,wood,[x,.03,z],[x,.83,z],.032);
  box(scene,paper,[-.07,.905,1.65],[.6,.025,.4],.003);rod(scene,brass,[.2,.93,1.5],[.2,.93,1.8],.006);
  cylinder(scene,iron,[.42,.97,1.6],.062,.17);tube(scene,brass,[[.42,1.03,1.6],[.54,1.08,1.6],[.58,1.15,1.6]],.011);
  const wide:View={position:[4.4,3.2,6.4],target:[-.3,1.35,-.1]},close:View={position:[-1.9,2.9,2.75],target:[-.9,1.8,-.1]},side:View={position:[3,1.8,2.8],target:[1.1,1.05,.15]};
  const spots=[
    {id:"valve",title:"汽阀手轮",detail:"改变蒸汽输入，再比较压力与速度两根指针。",object:valve,view:close,action:"valve-up"},
    {id:"load",title:"负载制动轮",detail:"改变负载，观察飞轮速度怎样变化。",object:load,view:side,action:"load-up"},
    {id:"gauges",title:"压力与速度表",detail:"金色指针是当前值，绿色标记是目标；两个刻度都不是真实单位。",object:dialFaces[0]!,view:close,action:"primary"},
    {id:"relief",title:"泄压手轮",detail:"释放压力后重新调节，已经完成的工况记录会保留。",object:relief,view:close,action:"relief"},
  ];
  for(const s of spots){s.object.traverse(o=>o.userData.spot=s.id);preserve.add(s.object);}
  finish(preserve);let angle=0;
  return{game,views:{wide,close,side,painting:wide},spots,pickables:spots.map(s=>s.object),canMove:(x,z)=>Math.abs(x)<4.2&&z> -2.8&&z<5&&!(x> -2.9&&x<2.4&&z> -1.1&&z<.9),
    update(_phase,_time,dt){const s=game.view();const speed=s.pressure>=7?0:s.speed;angle+=dt*speed*.42;fly.rotation.z=angle;beam.rotation.z=Math.sin(angle)*.11;piston.position.y=1.7-Math.sin(angle)*.13;valve.rotation.z=-s.valve*.42;load.rotation.z=s.load*.4;
      jointA.set(Math.cos(beam.rotation.z)*1.22-.2,2.1+Math.sin(beam.rotation.z)*1.22,.41);jointB.set(1.15+Math.cos(angle)*.24,1.03+Math.sin(angle)*.24,.41);direction.subVectors(jointB,jointA);link.position.copy(jointA).add(jointB).multiplyScalar(.5);link.quaternion.setFromUnitVectors(axis,direction.clone().normalize());link.scale.y=direction.length()/originalLength;
      [s.pressure,s.speed].forEach((n,i)=>dialNeedles[i]!.rotation.z=-(-.75+Math.min(8,n)/8*1.5)*Math.PI);[s.targetPressure,s.targetSpeed].forEach((n,i)=>dialTargets[i]!.rotation.z=-(-.75+n/8*1.5)*Math.PI);
    }};
}
