import * as THREE from "three";
import { Sky } from "three/examples/jsm/objects/Sky.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Kit, Model, View } from "../shared/geometry.ts";
import type { Vec3 } from "../shared/worlds.ts";
import type { NaturalAssets } from "../shared/natural-assets.ts";
import { naturalGeometry } from "../shared/natural-geometry.ts";

export function build(scene: THREE.Scene, k: Kit, assets: NaturalAssets): Model {
  const { material, mesh, random, rod, torus }=k, nature=naturalGeometry(scene,k,assets,true),{height,rock,log,preserved}=nature;
  scene.environment=assets.environment;scene.environmentIntensity=.85;scene.fog=new THREE.FogExp2("#e0dcc5",.0035);
  const sky=new Sky();sky.scale.setScalar(1000);sky.material.uniforms.sunPosition!.value=new THREE.Vector3(-.6,.28,-.8);sky.material.uniforms.turbidity!.value=5;sky.material.uniforms.rayleigh!.value=1.6;scene.add(sky);k.own(()=>{sky.geometry.dispose();sky.material.dispose();});
  scene.add(new THREE.HemisphereLight("#d7e3ef","#b0a180",1.15));
  const sun=new THREE.DirectionalLight("#ffdda1",2.3);sun.position.set(-6,8,-5);sun.castShadow=true;sun.shadow.mapSize.set(innerWidth<761?2048:4096,innerWidth<761?2048:4096);Object.assign(sun.shadow.camera,{left:-13,right:13,top:13,bottom:-13,near:.5,far:45});sun.shadow.normalBias=.013;sun.shadow.bias=-.00007;scene.add(sun);k.own(()=>sun.shadow.dispose());
  const clay=material(new THREE.MeshStandardMaterial({...assets.clay!,color:"#d7bb91",normalScale:new THREE.Vector2(.5,.5),roughness:.95}));
  const pottery=material(new THREE.MeshStandardMaterial({...assets.clay!,color:"#ad7652",normalScale:new THREE.Vector2(.3,.3),roughness:.86}));
  const straw=material(new THREE.MeshStandardMaterial({color:"#9b885e",roughness:1})),darkStraw=material(new THREE.MeshStandardMaterial({color:"#736040",roughness:1}));
  const roofMaps={...assets.thatch!};for(const key of ["map","normalMap","roughnessMap"] as const){const map=roofMaps[key].clone();map.repeat.set(5,1.5);map.needsUpdate=true;k.own(()=>map.dispose());roofMaps[key]=map;}
  const thatch=material(new THREE.MeshStandardMaterial({...roofMaps,color:"#c5b38c",roughness:1,normalScale:new THREE.Vector2(.75,.75),side:THREE.DoubleSide}));
  // The doorway is a real opening in the wall, with a roof thickness and bundled eaves.
  function hut(at:Vec3,r:number,rotation:number){
    const h=new THREE.Group();h.position.set(...at);h.rotation.y=rotation;scene.add(h);
    const wall=new THREE.CylinderGeometry(r,r*1.025,1.95,128,28,true),p=wall.attributes.position!,index=wall.index!,indices:number[]=[];
    for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i),a=Math.atan2(z,x),ripple=1+Math.sin(a*7+y*5)*.007+Math.sin(a*13-y*9)*.004;p.setXYZ(i,x*ripple,y+.975,z*ripple);}
    for(let i=0;i<index.count;i+=3){const ids=[index.getX(i),index.getX(i+1),index.getX(i+2)],x=ids.reduce((v,j)=>v+p.getX(j),0)/3,y=ids.reduce((v,j)=>v+p.getY(j),0)/3,z=ids.reduce((v,j)=>v+p.getZ(j),0)/3;const top=1.15+Math.sqrt(Math.max(0,.43*.43-x*x));if(!(Math.abs(x)<.43&&z>r*.8&&y<top))indices.push(...ids);}
    wall.setIndex(indices);wall.computeVertexNormals();const wallM=material(clay.clone());wallM.side=THREE.DoubleSide;mesh(h,wall,wallM);
    for(const x of [-.45,.45])log(h,[x,.02,r],[x,1.45,r],.055);log(h,[-.5,1.47,r],[.5,1.47,r],.06);
    for(let layer=0;layer<4;layer++) {
      const bottom=r*1.27*(1-layer*.23), top=Math.max(.04,bottom-r*.36);
      const roof=new THREE.CylinderGeometry(top,bottom,.45,128,10,true),rp=roof.attributes.position!;
      for(let i=0;i<rp.count;i++) {
        const x=rp.getX(i),z=rp.getZ(i),a=Math.atan2(z,x),t=rp.getY(i)/.45+.5;
        rp.setXYZ(i,x*(1+Math.sin(a*11+layer)*.014),rp.getY(i)+Math.sin(a*41+layer)*.035*(1-t),z*(1+Math.sin(a*13+layer)*.014));
      }
      roof.computeVertexNormals();mesh(h,roof,thatch,[0,2.145+layer*.28,0]);
    }
    for(let i=0;i<110;i++){const a=i*6.28/110,near=.45+random()*.15,far=r*1.27;rod(h,i%4?straw:darkStraw,[Math.cos(a)*near,2.8+random()*.05,Math.sin(a)*near],[Math.cos(a)*far,1.86+random()*.08,Math.sin(a)*far],.006+random()*.003);}
    for(const y of [2.2,2.62])torus(h,darkStraw,[0,y,0],r*(3.08-y)/1.15*1.27,.018).rotation.x=Math.PI/2;
    rock([at[0]-.5,.01,at[2]+r+.05],[.6,.11,.4],.7);
  }
  hut([-3.8,0,-3.9],1.45,.14);hut([.1,0,-6.6],1.25,-.05);hut([4.5,0,-4.8],1.6,-.22);
  // Woven wattle and uneven posts replace the rigid two-rail fence.
  for(let i=0;i<17;i++){const x=-5.8+i*.7;log(scene,[x,0,-1.95],[x+.04,.75+random()*.15,-1.95],.032);}
  for(let row=0;row<9;row++){const points:Vec3[]=[];for(let i=0;i<66;i++)points.push([-5.8+i*.175,.1+row*.075,-1.95+Math.sin(i*Math.PI/2+row*Math.PI)*.045]);k.tube(scene,row%2?nature.bark:darkStraw,points,.013);}
  for(let row=0;row<8;row++){
    const ridge=new THREE.PlaneGeometry(.4,4.8,10,90);ridge.rotateX(-Math.PI/2);const p=ridge.attributes.position!,uv=ridge.attributes.uv!;
    for(let i=0;i<p.count;i++){const x=p.getX(i),z=p.getZ(i),wx=x-.5+row*.51,wz=z+2.35;p.setXYZ(i,wx+Math.sin(z*3+row)*.018,Math.max(0,1-Math.abs(x)/.2)*.085+random()*.014,wz);uv.setXY(i,wx/2,wz/2);}
    ridge.computeVertexNormals();const o=mesh(scene,ridge,nature.earth);preserved.add(o);
  }
  // Each ear has paired grains, a curved rachis, leaves and fine awns. Two instanced draws animate the field.
  function merge(parts:THREE.BufferGeometry[]){const g=mergeGeometries(parts.map(p=>p.index?p.toNonIndexed():p),false)!;for(const p of parts)p.dispose();k.own(()=>g.dispose());return g;}
  const stemParts:THREE.BufferGeometry[]=[new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0,0,0),new THREE.Vector3(.012,.35,0),new THREE.Vector3(-.015,.72,.008),new THREE.Vector3(.025,1,0)]),12,.0055,5,false)];
  for(let side=0;side<3;side++){const positions:number[]=[],uvs:number[]=[],a=side*2.4,y=.2+side*.18;for(let j=0;j<12;j++){const t=j/11,wide=Math.sin(t*Math.PI)*.024,reach=t*.32;for(const edge of [-1,1]){positions.push(Math.cos(a)*reach+Math.sin(a)*wide*edge,y+Math.sin(t*2.2)*.16,Math.sin(a)*reach-Math.cos(a)*wide*edge);uvs.push((edge+1)/2,t);}}const leaf=new THREE.BufferGeometry();leaf.setAttribute("position",new THREE.Float32BufferAttribute(positions,3));leaf.setAttribute("uv",new THREE.Float32BufferAttribute(uvs,2));const indices:number[]=[];for(let j=0;j<11;j++){const p=j*2;indices.push(p,p+2,p+1,p+1,p+2,p+3);}leaf.setIndex(indices);leaf.computeVertexNormals();stemParts.push(leaf);}
  const earParts:THREE.BufferGeometry[]=[new THREE.CylinderGeometry(.004,.006,.24,5).translate(0,.11,0)];
  for(let i=0;i<9;i++)for(const side of [-1,1]){const y=i*.024,r=(1-i/13)*.014,grain=new THREE.SphereGeometry(1,8,6);grain.scale(r,.022,.009);grain.rotateZ(side*-.4);grain.translate(side*.012,y,0);earParts.push(grain);const a=new THREE.Vector3(side*.014,y+.014,0),b=new THREE.Vector3(side*(.038+i*.002),y+.12-i*.004,.005);const awn=new THREE.CylinderGeometry(.00065,.0011,a.distanceTo(b),3);awn.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),b.clone().sub(a).normalize()));awn.translate(...a.add(b).multiplyScalar(.5).toArray() as Vec3);earParts.push(awn);}
  const stalkM=material(new THREE.MeshStandardMaterial({color:"#8a9859",roughness:.92,side:THREE.DoubleSide})),earM=material(new THREE.MeshStandardMaterial({color:"#d5b86c",roughness:.86}));
  const count=innerWidth<761?480:760,stalks=new THREE.InstancedMesh(merge(stemParts),stalkM,count),heads=new THREE.InstancedMesh(merge(earParts),earM,count),dummy=new THREE.Object3D();scene.add(stalks,heads);stalks.castShadow=heads.castShadow=true;stalks.receiveShadow=heads.receiveShadow=true;stalks.frustumCulled=heads.frustumCulled=false;
  const plants=Array.from({length:count},(_,i)=>({x:-.5+i%8*.51+(random()-.5)*.2,z:.12+Math.floor(i/8)/(count/8)*4.35+random()*.08,h:.7+random()*.38,angle:random()*6.28}));
  const stubbleGeometry=new THREE.CylinderGeometry(.005,.007,.115,5),stubble=new THREE.InstancedMesh(stubbleGeometry,stalkM,count);
  scene.add(stubble);k.own(()=>stubbleGeometry.dispose());
  plants.forEach((p,i)=>{dummy.position.set(p.x,.075,p.z);dummy.rotation.set(.04,p.angle,.06);dummy.scale.set(1,1,1);dummy.updateMatrix();stubble.setMatrixAt(i,dummy.matrix);});stubble.computeBoundingSphere();
  for(let i=0;i<count;i++){const tint=new THREE.Color().setHSL(.12+random()*.025,.25+random()*.12,.65+random()*.15);heads.setColorAt(i,tint);}
  function basket(at:Vec3,r:number){const g=new THREE.Group();g.position.set(...at);scene.add(g);for(let row=0;row<24;row++){const y=.025+row*r*.047,radius=r*(.67+y/r*.25),points:Vec3[]=[];for(let i=0;i<=100;i++){const a=i*Math.PI*2/100,rr=radius+Math.sin(a*28+row*Math.PI)*.006;points.push([Math.cos(a)*rr,y,Math.sin(a)*rr]);}k.tube(g,row%3?straw:darkStraw,points,.009);}
    for(let i=0;i<28;i++){const a=i*6.28/28;rod(g,darkStraw,[Math.cos(a)*r*.66,.01,Math.sin(a)*r*.66],[Math.cos(a)*r*.96,r*1.1,Math.sin(a)*r*.96],.009);}torus(g,straw,[0,r*1.11,0],r*.95,.02).rotation.x=Math.PI/2;return g;}
  basket([-1.65,0,1.25],.42);basket([4.05,0,.65],.55);
  function pot(at:Vec3,r:number){const profile=[[0,0],[.55,0],[.9,.1],[1,.45],[.83,.93],[.53,1.2],[.52,1.29],[.43,1.3],[.42,1.19],[.72,.9],[.87,.45],[.77,.18],[0,.12]].map(([x,y])=>new THREE.Vector2(x!*r,y!*r));const g=new THREE.LatheGeometry(profile,96),p=g.attributes.position!;for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i),a=Math.atan2(z,x),n=1+Math.sin(a*5+y*16)*.012+Math.sin(a*11-y*8)*.005;p.setXYZ(i,x*n,y,z*n);}g.computeVertexNormals();const o=mesh(scene,g,pottery,at);o.rotation.y=random()*6.28;return o;}
  pot([4.45,0,-.35],.59);pot([4.35,0,-1.25],.39);pot([-3.2,0,-2.4],.36);pot([3.8,0,-.25],.24);
  const grainM=material(new THREE.MeshStandardMaterial({color:"#cfb17c",roughness:.93})),grainG=new THREE.SphereGeometry(1,7,5),seeds=new THREE.InstancedMesh(grainG,grainM,700),stored=new THREE.InstancedMesh(grainG,grainM,1000);scene.add(seeds,stored);k.own(()=>grainG.dispose());
  function fill(g:THREE.InstancedMesh,center:Vec3,r:number){for(let i=0;i<g.count;i++){const a=random()*6.28,rr=Math.sqrt(random())*r;dummy.position.set(center[0]+Math.cos(a)*rr,center[1]+(1-rr/r)*.07+random()*.02,center[2]+Math.sin(a)*rr);dummy.rotation.set(random(),random()*6.28,random());dummy.scale.set(.012,.008,.023);dummy.updateMatrix();g.setMatrixAt(i,dummy.matrix);}}
  fill(seeds,[-1.65,.37,1.25],.32);fill(stored,[4.05,.44,.65],.44);
  const base=rock([-2.25,.015,3.1],[1.3,.26,.85],.8),grinder=rock([-2.25,.27,3.1],[.5,.14,.32],.6);preserved.add(grinder);
  for(let i=0;i<45;i++){const x=-2.25+(random()-.5)*.5,z=3.1+(random()-.5)*.3;const grain=mesh(scene,grainG,grainM,[x,.28,z]);grain.scale.set(.012,.008,.024);grain.rotation.y=random()*6.28;}
  // Harvest bundles, cut stems and a reed mat make the area around the field explorable.
  const harvested=new THREE.Group();scene.add(harvested);preserved.add(harvested);
  for(let bundle=0;bundle<3;bundle++){const group=new THREE.Group();group.position.set(3.8+bundle*.5,.2,1.75+bundle*.36);group.rotation.set(.08,.4+bundle*.6,1.25);harvested.add(group);for(let i=0;i<36;i++){const a=i*2.4,r=.1*Math.sqrt(i/36);rod(group,straw,[Math.cos(a)*r,-.45,Math.sin(a)*r],[Math.cos(a)*r*1.5,.5+random()*.12,Math.sin(a)*r*1.5],.005);}for(const y of [-.1,.13])torus(group,darkStraw,[0,y,0],.12,.01).rotation.x=Math.PI/2;}
  for(let i=0;i<38;i++)rod(scene,i%4?straw:darkStraw,[3.6+i*.024,.012,-.85],[3.6+i*.024,.012,.95],.005);
  const grassPlacements:Array<{at:Vec3;size:Vec3;angle:number}>=[];for(let i=0;i<(innerWidth<761?160:500);i++){const a=random()*6.28,r=7+random()*20,x=Math.cos(a)*r,z=Math.sin(a)*r,s=.18+random()*.25;grassPlacements.push({at:[x,height(x,z)-.02,z],size:[s*1.5,s,s*1.5],angle:a});}nature.instances(assets.grass!,grassPlacements,false);
  for(let i=0;i<45;i++){const a=random()*6.28,r=6+random()*20,x=Math.cos(a)*r,z=Math.sin(a)*r,s=.08+random()*.25;rock([x,height(x,z)-.025,z],[s,s*.55,s*.8],a);}
  const proxy=material(new THREE.MeshBasicMaterial({visible:false}));function hit(id:string,at:Vec3,size:Vec3){const o=k.box(scene,proxy,at,size);o.userData.spot=id;return o;}
  const fieldHit=hit("field",[1.2,.6,2.2],[4.2,1.4,4.4]),storageHit=hit("storage",[4.1,.45,.55],[1.4,1,1.5]),millHit=hit("mill",[-2.25,.4,3.1],[1.5,.8,1.2]);
  const close:View={position:[3.8,2.15,5.4],target:[1.1,.6,2.1]},side:View={position:[-3.8,1.4,4.9],target:[-2.1,.35,2.9]};
  k.mergeStatic(scene,preserved);
  return {groundHeight:height,views:{wide:{position:[6.8,2.5,9.7],target:[.3,1,-.5]},close,side,painting:{position:[1,4.2,10.5],target:[.2,1,-1.2]}},spots:[{id:"field",title:"田地 · 推进农时",detail:"从播种，到成熟，再到收获。",object:fieldHit,view:close,advance:true},{id:"storage",title:"种子与储粮",detail:"留下部分谷物作为下一季的种子，另一些储存起来。余粮让生活有了跨越季节的安排。",object:storageHit,view:{position:[5.4,1.35,2.25],target:[4.1,.4,.45]}},{id:"mill",title:"石磨与谷粒",detail:"用上石反复碾磨下石上的谷粒，是处理植物性食物的一种方式。这里展示的是简化的往复式磨盘。",object:millHit,view:side}],pickables:[fieldHit,storageHit,millHit],canMove:(x,z)=>!(x>-.8&&x<3.4&&z>-.1&&z<4.6)&&!(z< -2.2&&z> -5.8&&(x< -2&&x> -5.5||x>2.8&&x<6)),
    update(phase,time){stalks.visible=phase<2.85;stubble.visible=phase>=2.85;const growth=phase<1?.02+phase*.16:phase<2?.18+(phase-1)*.82:1-(phase-2)*.9,maturity=THREE.MathUtils.clamp((phase-.9)*1.2,0,1)*(phase>2?Math.max(0,3-phase):1);stalkM.color.set(phase>1.5?"#b6a264":"#82924e");stored.visible=phase>2.65;harvested.visible=phase>2.4;
      plants.forEach((p,i)=>{const h=p.h*growth,sway=Math.sin(time*1.2+p.x+p.z)*.045*growth;dummy.position.set(p.x,.025,p.z);dummy.rotation.set(sway,p.angle,sway);dummy.scale.set(1,Math.max(h,.015),1);dummy.updateMatrix();stalks.setMatrixAt(i,dummy.matrix);dummy.position.set(p.x+.025+Math.sin(sway)*h,h+.025,p.z);dummy.rotation.set(sway,p.angle,sway+.08);dummy.scale.setScalar(maturity);dummy.updateMatrix();heads.setMatrixAt(i,dummy.matrix);});stalks.instanceMatrix.needsUpdate=heads.instanceMatrix.needsUpdate=true;grinder.position.x=-2.25+(phase>2.5?Math.sin(time*2)*.14:0);
    }};
}
