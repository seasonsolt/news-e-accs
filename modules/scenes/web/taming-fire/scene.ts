import * as THREE from "three";
import type { Kit, Model, View } from "../shared/geometry.ts";
import type { Vec3 } from "../shared/worlds.ts";
import type { NaturalAssets } from "../shared/natural-assets.ts";
import { naturalGeometry } from "../shared/natural-geometry.ts";
import { landscape } from "../shared/landscape.ts";

export function build(scene: THREE.Scene, k: Kit, assets: NaturalAssets): Model {
  const { material, mesh, random } = k, nature = naturalGeometry(scene, k, assets, false), { rock, scan, log, preserved, height } = nature;
  scene.environment = assets.environment;
  landscape(scene, k, assets, "dusk", false, height);
  // A low windbreak leaves the sky and the valley open around the evening hearth.
  for (const [x,z,w,h,a] of [[-4,-4,2.2,1.1,.2],[-1.6,-4.7,2.7,1.4,1.6],[2.2,-4.5,2.5,1.2,2.8]] as number[][]) rock([x!, -.3, z!], [w!, h!, 1.6], a!, true);
  for (let i = 0; i < 32; i++) { const a = random() * 6.28, r = 2.7 + random() * 13, x = Math.cos(a) * r, z = Math.sin(a) * r, s = .08 + random() * .35; rock([x, height(x,z) - .03, z], [s, s * .6, s * .8], a); }
  // Ash is a mottled shallow surface, not a solid grey disc over the terrain.
  const ashMap = k.texture(512,512,(c,w,h) => {
    c.clearRect(0,0,w,h); const g=c.createRadialGradient(w/2,h/2,10,w/2,h/2,w*.49); g.addColorStop(0,"#22201be6");g.addColorStop(.6,"#5c5545c0");g.addColorStop(1,"#8c7e6400");c.fillStyle=g;c.fillRect(0,0,w,h);
    for(let i=0;i<9000;i++){ const x=random()*w,y=random()*h; if(Math.hypot(x-w/2,y-h/2)>w*.47)continue;c.fillStyle=random()>.6?"#b1a7944a":"#17151069";c.fillRect(x,y,random()*4,random()*3); }
  });
  const ashM = material(new THREE.MeshStandardMaterial({ map:ashMap, transparent:true, depthWrite:false, roughness:1, polygonOffset:true, polygonOffsetFactor:-1 }));
  const ash=mesh(scene,new THREE.PlaneGeometry(2.8,2.6),ashM,[0,.004,0]);ash.rotation.x=-Math.PI/2;ash.castShadow=false;
  for(let i=0;i<17;i++){const a=i*6.28/17,s=.19+random()*.13;rock([Math.cos(a)*1.03,.035,Math.sin(a)*.88],[s*1.4,s*.75,s],a);}
  const hearth=new THREE.Group();scene.add(hearth);preserved.add(hearth);
  const fuels:THREE.Group[]=[];
  for(let i=0;i<8;i++){const a=i*1.1, g=new THREE.Group();hearth.add(g);log(g,[-Math.cos(a)*.62,.12+(i%3)*.08,-Math.sin(a)*.55],[Math.cos(a)*.48,.17+(i%3)*.11,Math.sin(a)*.48],i<3?.045:.105,true);fuels.push(g);}
  const pile=scan(assets.branches!,scene,[2.1,.02,-.8],[1.8,.45,.95],.3);
  for(let i=0;i<5;i++)log(scene,[1.8+i*.14,.1+(i%2)*.12,-.4],[2.15+i*.14,.15+(i%2)*.12,.35],.07);
  scan(assets.branches!,scene,[-2,.01,-.65],[.8,.18,.5],1.6);
  // A ray-marched volume gives the flame depth from every camera angle. It has no flat image facing the user.
  const flameM=material(new THREE.ShaderMaterial({transparent:true,depthWrite:false,defines:{STEPS:innerWidth<761?16:24},uniforms:{time:{value:0},heat:{value:.15},eye:{value:new THREE.Vector3()}},
    vertexShader:`varying vec3 p; void main(){p=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`precision highp float; varying vec3 p; uniform float time; uniform float heat; uniform vec3 eye;
      float hash(vec3 v){v=fract(v*.3183099+vec3(.1,.2,.3));v*=17.;return fract(v.x*v.y*v.z*(v.x+v.y+v.z));}
      float noise(vec3 v){vec3 i=floor(v),f=fract(v);f=f*f*(3.-2.*f);return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
      void main(){vec3 d=normalize(p-eye),q=p+d*.002;vec3 safeD=mix(vec3(-1.),vec3(1.),step(vec3(0.),d))*max(abs(d),vec3(.0001));vec3 farT=(sign(safeD)-q)/safeD;float end=min(farT.x,min(farT.y,farT.z));float stepSize=max(0.,end)/float(STEPS);vec4 sum=vec4(0.);
        for(int i=0;i<STEPS;i++){vec3 s=q+d*(float(i)+.5)*stepSize;float h=clamp((s.y+1.)*.5,0.,1.);vec3 flow=s*3.6-vec3(sin(time*1.2+h*4.)*.3,time*1.9,cos(time+h*5.)*.3);float n=noise(flow)*.65+noise(flow*2.1+time*.3)*.35;float r=mix(.67,.03,h)+sin(h*8.-time*3.)*.06;float body=(1.-smoothstep(r-.13,r+.1,length(s.xz+vec2(sin(h*6.+time*2.)*.1*h,0.))));float tongues=0.;for(int j=0;j<3;j++){float f=float(j),reach=.6+hash(vec3(f,1.,2.))*.4,ht=h/reach;vec2 center=vec2(cos(f*2.4),sin(f*2.4))*.25*(1.-h)+vec2(sin(h*5.+time*2.3+f),cos(h*4.-time*1.6+f))*.12*h;float rr=mix(.2,.005,clamp(ht,0.,1.));float tongue=(1.-smoothstep(rr*.3,rr+.025,length(s.xz-center)))*(1.-smoothstep(.8,1.,ht));tongues=max(tongues,tongue);}body=max(body*.15,tongues);float density=body*smoothstep(.3+h*.25,.78,n)*(1.-h)*heat;float a=clamp(density*stepSize*3.2,0.,.9);vec3 color=mix(vec3(1.8,.7,.025),vec3(1.1,.055,.001),smoothstep(.05,.85,h));sum.rgb+=color*a*(1.-sum.a);sum.a+=a*(1.-sum.a);}
        if(sum.a<.002)discard;gl_FragColor=vec4(sum.rgb/max(sum.a,.001),sum.a);
      }` }));
  const flame=mesh(scene,new THREE.BoxGeometry(2,2,2),flameM,[0,.75,0]);flame.scale.set(.65,.75,.57);flame.castShadow=false;flame.receiveShadow=false;preserved.add(flame);
  const eye=new THREE.Vector3(); flame.onBeforeRender=(_r,_s,camera)=>{camera.getWorldPosition(eye);flame.worldToLocal(eye);flameM.uniforms.eye!.value.copy(eye);};
  const emberM=material(new THREE.MeshBasicMaterial({color:new THREE.Color(3,.65,.035)})), emberG=new THREE.SphereGeometry(.018,6,4), embers=new THREE.InstancedMesh(emberG,emberM,70), dummy=new THREE.Object3D();scene.add(embers);k.own(()=>emberG.dispose());
  // Small charcoal pieces and emissive fissures stay under the burning wood.
  const coalM=material(new THREE.MeshStandardMaterial({color:"#1b1a17",...assets.bark,roughness:1}));
  for(let i=0;i<50;i++){const x=(random()-.5)*1.1,z=(random()-.5)*.9,s=.035+random()*.07;const coal=mesh(hearth,new THREE.DodecahedronGeometry(s,1),coalM,[x,.05+random()*.04,z]);coal.rotation.set(random(),random(),random());if(i%3===0){const e=mesh(hearth,new THREE.SphereGeometry(.012,6,4),emberM,[x,.08,z]);e.scale.set(3,.3,1);}}
  const light=new THREE.PointLight("#ffb265",8,15,1.8);light.position.set(0,.7,.1);light.castShadow=true;light.shadow.mapSize.set(1024,1024);light.shadow.normalBias=.012;light.shadow.autoUpdate=false;light.shadow.needsUpdate=true;scene.add(light);k.own(()=>light.shadow.dispose());
  const smokeMap=k.texture(128,128,(c,w,h)=>{const g=c.createRadialGradient(w/2,h/2,0,w/2,h/2,w/2);g.addColorStop(0,"#ffffff70");g.addColorStop(.5,"#ffffff30");g.addColorStop(1,"#ffffff00");c.fillStyle=g;c.fillRect(0,0,w,h);});
  const smokeM=material(new THREE.MeshLambertMaterial({map:smokeMap,color:"#92877b",transparent:true,opacity:.065,depthWrite:false,side:THREE.DoubleSide})),smoke:THREE.Mesh[]=[];
  for(let i=0;i<15;i++){const puff=mesh(scene,new THREE.PlaneGeometry(1,1),smokeM);puff.castShadow=false;puff.onBeforeRender=(_r,_s,c)=>puff.quaternion.copy(c.quaternion);preserved.add(puff);smoke.push(puff);}
  const foodStone=rock([-1.75,.02,1.1],[1.1,.4,.8],.6),foodM=material(new THREE.MeshStandardMaterial({color:"#9d7650",roughness:.9,...assets.earth}));
  for(let i=0;i<4;i++){const f=mesh(scene,new THREE.SphereGeometry(.12,24,16),foodM,[-1.95+i*.16,.4,1.1]);f.scale.set(.6,.55,1.2);f.rotation.y=i;}
  const proxy=material(new THREE.MeshBasicMaterial({visible:false}));
  function hit(id:string,at:Vec3,size:Vec3){const o=k.box(scene,proxy,at,size);o.userData.spot=id;return o;}
  const fireHit=hit("hearth",[0,.7,0],[1.8,1.5,1.8]),woodHit=hit("fuel",[2.1,.35,-.6],[1.9,.8,1.2]),foodHit=hit("food",[-1.75,.45,1.1],[1.3,.9,1]);
  const close:View={position:[2.35,1.55,3.35],target:[0,.65,0]},side:View={position:[-3.3,1.55,2.6],target:[0,.85,-.5]};
  k.mergeStatic(scene,preserved);
  let shadowPhase=-1;
  return {groundHeight:height,views:{wide:{position:[5.6,2.1,7.4],target:[0,1.3,-1]},close,side,painting:{position:[.6,2.2,8.2],target:[0,1.3,-.7]}},
    spots:[{id:"hearth",title:"照料火堆",detail:"添入燃料，观察光与热的变化。",object:fireHit,view:close,advance:true},{id:"fuel",title:"木柴与细枝",detail:"细枝容易起焰，较粗的木柴延长燃烧。演示呈现燃料的作用，不认定这个年代已有某种人工点火法。",object:woodHit,view:{position:[3.7,1.35,1.25],target:[2.1,.3,-.5]}},{id:"food",title:"火与食物",detail:"火能改变食物的性质。对用火与烹饪起源的时间和方式，研究仍在继续。",object:foodHit,view:side}],pickables:[fireHit,woodHit,foodHit],canMove:(x,z)=>Math.hypot(x,z)>1.3,
    update(phase,time){const current=Math.floor(phase+.25);if(current!==shadowPhase){light.shadow.needsUpdate=true;shadowPhase=current;}const heat=.18+phase*.3;flameM.uniforms.time!.value=time;flameM.uniforms.heat!.value=heat;const h=.28+phase*.28;flame.scale.y=h;flame.position.y=h+.13;light.intensity=(7+phase*15)*(1+Math.sin(time*8.2)*.055+Math.sin(time*11.7)*.035);fuels.forEach((o,i)=>o.visible=i<3||phase>(i<5?.75:1.75));
      for(let i=0;i<70;i++){const t=(time*.24+i/70)%1,a=i*2.4;dummy.position.set(Math.cos(a)*.35+Math.sin(time+i)*t*.35,.1+t*(.7+phase*.7),Math.sin(a)*.3);dummy.scale.set((1-t)*heat*.6,(1-t)*heat*1.6,(1-t)*heat*.6);dummy.updateMatrix();embers.setMatrixAt(i,dummy.matrix);}embers.instanceMatrix.needsUpdate=true;
      smoke.forEach((p,i)=>{const t=(i/15+time*.055)%1;p.visible=phase>.5;p.position.set(Math.sin(i*2.4+t*3)*t*.5,1.2+phase*.35+t*3.2,-t*.45);p.scale.setScalar(.25+t*1.25);});
    }};
}
