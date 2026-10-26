import * as THREE from "three";
import type { Kit, Model, View } from "../shared/geometry.ts";
import { workshop, type WorkshopAssets } from "../games/workshop.ts";
import { createObservatoryGame } from "../games/science-state.ts";

export function build(scene: THREE.Scene, k: Kit, assets: WorkshopAssets, renderer: THREE.WebGLRenderer): Model {
  const { wood, stone, brass, iron, paper, glass, finish } = workshop(scene, k, renderer, assets, { theme: "observatory", open: true });
  const { mesh, box, cylinder, rod, torus, sphere, material, texture } = k;
  const game = createObservatoryGame(), preserve = new Set<THREE.Object3D>();
  const skyMap = texture(1024, 768, (c,w,h) => {
    const g=c.createLinearGradient(0,0,0,h);g.addColorStop(0,"#07111c");g.addColorStop(1,"#263741");c.fillStyle=g;c.fillRect(0,0,w,h);
    for(let i=0;i<320;i++){const x=k.random()*w,y=k.random()*h;c.fillStyle=i%9?"#c8c9ac":"#f8e2a9";c.beginPath();c.arc(x,y,i%9?.6:1.4,0,Math.PI*2);c.fill();}
    c.fillStyle="#e8dfbc";c.beginPath();c.arc(810,170,38,0,Math.PI*2);c.fill();c.fillStyle="#b4b79d";for(let i=0;i<13;i++){c.beginPath();c.arc(790+k.random()*38,145+k.random()*50,2+k.random()*5,0,Math.PI*2);c.fill();}
    c.fillStyle="#0d1820";for(let i=0;i<24;i++)c.fillRect(i*48,h-100-k.random()*80,38,180);
  });
  const sky = mesh(scene,new THREE.PlaneGeometry(4.5,2.9),material(new THREE.MeshBasicMaterial({map:skyMap,fog:false})),[0,2.35,-3.60]);sky.castShadow=sky.receiveShadow=false;
  for(const x of [-2.4,2.4]) {
    cylinder(scene,stone,[x,1.5,-3.3],.14,3);cylinder(scene,stone,[x,.16,-3.3],.24,.18);cylinder(scene,stone,[x,2.95,-3.3],.25,.2);
    for(let y=0;y<3;y+=.25)torus(scene,stone,[x,y,-3.3],.145,.008).rotation.x=Math.PI/2;
  }
  const arch=mesh(scene,new THREE.TorusGeometry(2.4,.16,12,64,Math.PI),stone,[0,2.95,-3.3]);arch.scale.y=.38;
  cylinder(scene,stone,[-.55,.08,.1],.72,.14);
  const mount=new THREE.Group();mount.position.set(-.55,0,.1);scene.add(mount);
  for(let i=0;i<3;i++){const a=i*Math.PI*2/3;rod(mount,wood,[Math.cos(a)*.55,.15,Math.sin(a)*.55],[Math.cos(a)*.10,1.38,Math.sin(a)*.10],.046);cylinder(mount,brass,[Math.cos(a)*.55,.13,Math.sin(a)*.55],.065,.065);}
  cylinder(mount,brass,[0,1.3,0],.16,.1);cylinder(mount,iron,[0,1.43,0],.075,.2);
  const azimuth=cylinder(mount,brass,[0,1.53,0],.23,.055);preserve.add(azimuth);
  for(let i=0;i<36;i++){const a=i*Math.PI/18;const r=rod(mount,iron,[Math.cos(a)*.205,1.56,Math.sin(a)*.205],[Math.cos(a)*.225,1.56,Math.sin(a)*.225],.002);r.castShadow=false;}
  const pivot=new THREE.Group();pivot.position.set(-.55,1.77,.1);scene.add(pivot);preserve.add(pivot);
  for(const x of [-.13,.13])rod(pivot,brass,[x,-.24,0],[x,.03,0],.026);
  const tube=new THREE.Group();tube.rotation.x=.22;pivot.add(tube);
  const barrel=cylinder(tube,wood,[0,0,-.12],.082,1.28);barrel.rotation.x=Math.PI/2;
  for(const z of [-.76,-.55,-.15,.25,.52]){const band=cylinder(tube,brass,[0,0,z],z<-.7?.10:.09,.035);band.rotation.x=Math.PI/2;}
  const focus=new THREE.Group();tube.add(focus);
  const eyepiece=cylinder(focus,brass,[0,0,.62],.046,.3);eyepiece.rotation.x=Math.PI/2;
  const eye=cylinder(focus,iron,[0,0,.79],.055,.035);eye.rotation.x=Math.PI/2;
  const lens=mesh(tube,new THREE.CircleGeometry(.076,48),glass,[0,0,-.783]);lens.rotation.y=Math.PI;
  const rim=torus(tube,brass,[0,0,-.79],.082,.009);rim.rotation.z=.15;
  const focusWheel=torus(tube,brass,[.12,-.03,.38],.065,.013);focusWheel.rotation.y=Math.PI/2;
  rod(tube,iron,[.05,-.03,.38],[.13,-.03,.38],.012);
  // A separate armillary globe echoes the original engraving without becoming a telescope control.
  const arm=new THREE.Group();arm.position.set(1.6,1.32,-.65);scene.add(arm);
  cylinder(scene,wood,[1.6,.51,-.65],.14,.95);cylinder(scene,brass,[1.6,.06,-.65],.42,.1);
  sphere(arm,brass,[0,0,0],.13);
  for(let i=0;i<5;i++){const ring=torus(arm,brass,[0,0,0],.44+i*.035,.009);ring.rotation.set(i*.44,i*.72,0);}
  rod(arm,iron,[0,-.7,0],[0,.7,0],.019);
  for(let i=0;i<4;i++){const a=i*Math.PI/2;sphere(arm,stone,[Math.cos(a)*.4,.08,Math.sin(a)*.4],.035+i*.006);}
  // Star-chart worktable, with rolled parchment, an open notebook and a mechanical divider.
  box(scene,wood,[-2,.83,.35],[1.3,.075,1.02],.025);
  for(const x of [-2.5,-1.5])for(const z of [-.02,.72]){cylinder(scene,wood,[x,.4,z],.045,.8);sphere(scene,brass,[x,.15,z],.056);}
  const chartMap=texture(1024,768,()=>{}),chartMaterial=material(new THREE.MeshBasicMaterial({map:chartMap}));
  const chart=mesh(scene,new THREE.PlaneGeometry(1.12,.82),chartMaterial,[-2,.872,.35]);chart.rotation.x=-Math.PI/2;chart.castShadow=false;preserve.add(chart);
  for(const x of [-2.59,-1.41]){const scroll=cylinder(scene,paper,[x,.90,.35],.033,.9);scroll.rotation.x=Math.PI/2;}
  box(scene,paper,[-2.1,.89,.72],[.34,.026,.2],.003);
  rod(scene,brass,[-1.58,.89,.63],[-1.72,.90,.8],.005);rod(scene,brass,[-1.58,.89,.63],[-1.48,.9,.81],.005);
  for(let i=0;i<5;i++)box(scene,i%2?wood:paper,[1.85,.04+i*.035,1.1],[.5-i*.018,.03,.35],.004);
  const wide:View={position:[3.6,2.7,5.8],target:[0,1.3,-.35]},close:View={position:[-.1,2.25,2.15],target:[-.55,1.65,.1]},side:View={position:[-3.2,2.15,1.7],target:[-2,.86,.35]};
  const spots=[
    {id:"chart",title:"望远镜与星图",detail:"先读星图上的方向与焦距刻度，再调望远镜。",object:chart,view:side,action:"primary"},
    {id:"focus",title:"调焦筒",detail:"点击调焦筒延长焦距，使用按钮也可以反向调整。",object:focusWheel,view:close,action:"focus-out"},
    {id:"bearing",title:"方位转盘",detail:"点击转盘改变方向，星图显示当前目标的刻度。",object:azimuth,view:close,action:"aim-right"},
  ];
  for(const spot of spots){spot.object.userData.spot=spot.id;preserve.add(spot.object);}
  finish(preserve);let previous="";
  return {game,views:{wide,close,side,painting:wide},spots,pickables:spots.map(s=>s.object),canMove:(x,z)=>Math.abs(x)<4.2&&z> -2.8&&z<4.8&&!(x> -1.4&&x<.3&&z>-.7&&z<.9),
    update(){const s=game.view();pivot.rotation.y=(s.aim-2.5)*.22;focus.position.z=s.focus*.045;
      const signature=`${s.aim}:${s.focus}:${s.progress}`;if(signature===previous)return;previous=signature;
      const c=chartMap.image.getContext("2d")!;c.fillStyle="#cbb995";c.fillRect(0,0,1024,768);c.strokeStyle="#665741";c.lineWidth=2;
      for(let r=65;r<300;r+=48){c.beginPath();c.arc(310,385,r,0,Math.PI*2);c.stroke();}
      for(let i=0;i<6;i++){const a=i*Math.PI/3;c.beginPath();c.moveTo(310,385);c.lineTo(310+Math.sin(a)*280,385-Math.cos(a)*280);c.stroke();c.fillStyle="#352e24";c.font="22px monospace";c.fillText(String(i+1),300+Math.sin(a)*300,390-Math.cos(a)*300);}
      c.font="30px monospace";c.fillStyle="#352e24";c.fillText("OBSERVATION / 1610",35,50);c.font="23px monospace";
      const target=s.target;c.fillText(["MOON","JUPITER","VENUS"][Math.min(s.progress,2)]!,650,185);c.fillText(`BEARING ${target[0]+1} / 6`,650,240);c.fillText(`FOCUS   ${target[1]+1} / 4`,650,285);c.fillText(`LOGGED  ${s.progress} / 3`,650,355);c.fillText(`SET ${s.aim+1} : ${s.focus+1}`,650,430);
      c.fillStyle="#61735d";c.beginPath();c.arc(310+Math.sin(target[0]*Math.PI/3)*190,385-Math.cos(target[0]*Math.PI/3)*190,12,0,Math.PI*2);c.fill();
      c.fillStyle="#936139";c.beginPath();c.arc(310+Math.sin(s.aim*Math.PI/3)*240,385-Math.cos(s.aim*Math.PI/3)*240,7,0,Math.PI*2);c.fill();
      chartMap.needsUpdate=true;
    }};
}
