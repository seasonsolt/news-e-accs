import * as THREE from "three";
import type { Kit, Model, Spot, View } from "../shared/geometry.ts";
import { workshop, type WorkshopAssets } from "../games/workshop.ts";
import { createIronGame } from "../games/craft-state.ts";

export function build(scene: THREE.Scene, k: Kit, assets: WorkshopAssets, renderer: THREE.WebGLRenderer): Model {
  const room = workshop(scene, k, renderer, assets, { theme: "forge" });
  const { box, cylinder, sphere, rod, mesh, material } = k;
  const brick = material(new THREE.MeshStandardMaterial({ ...assets.stone, color: "#625746", roughness: .94, normalScale: new THREE.Vector2(.35, .35) }));
  const bronze = material(new THREE.MeshPhysicalMaterial({ color: "#5a7666", roughness: .47, metalness: .72, clearcoat: .12 }));
  const leather = material(new THREE.MeshStandardMaterial({ color: "#47382a", roughness: .9 }));
  const coal = material(new THREE.MeshStandardMaterial({ color: "#171813", roughness: .99 }));
  const hot = material(new THREE.MeshStandardMaterial({ color: "#a85225", emissive: "#fd6615", emissiveIntensity: 0, metalness: .6, roughness: .53 }));
  const ember = material(new THREE.MeshStandardMaterial({ color: "#b54718", emissive: "#ff6318", emissiveIntensity: .25, roughness: 1 }));
  const water = material(new THREE.MeshPhysicalMaterial({ color: "#526c69", roughness: .18, metalness: .2, clearcoat: .9, transparent: true, opacity: .8 }));
  const preserve = new Set<THREE.Object3D>(), spots: Spot[] = [], pickables: THREE.Object3D[] = [];
  const game = createIronGame(); let strike = 0, pump = 0, quench = 0;
  const originalDemo = game.demo; game.demo = () => {
    const before = game.snapshot(); originalDemo(); const after = game.snapshot();
    if (before.readings[1] !== after.readings[1]) strike = 1;
    else if (after.complete || before.readings[0] === "过热") quench = 1;
    else pump = 1;
  };
  const act = game.act; game.act = id => { act(id); if (id === "hammer" || id === "primary") strike = 1; if (id === "bellows") pump = 1; if (id === "cool") quench = 1; };
  const target: [number, number, number] = [0, 1, -.4];
  const close: View = { position: [2.1, 2.05, 2.5], target: [0, 1, -.1] };
  function spot(id: string, title: string, detail: string, object: THREE.Object3D, action: string) {
    preserve.add(object); object.traverse(o => { if (o instanceof THREE.Mesh) { o.userData.spot = id; pickables.push(o); } });
    spots.push({ id, title, detail, object, action, view: close });
  }
  // A layered open hearth: jointed masonry surround, soot-lined throat, hood and copper-green trim.
  box(scene, brick, [-.75, .18, -1.62], [1.8, .36, 1.5], .035);
  for (let layer = 0; layer < 5; layer++) for (let side = 0; side < 3; side++) {
    for (let i = 0; i < (side === 2 ? 4 : 3); i++) {
      const x = side === 2 ? -1.4 + i * .43 : -.75 + (side === 0 ? -.78 : .78);
      const z = side === 2 ? -2.21 : -2.08 + i * .43;
      box(scene, brick, [x, .49 + layer * .19, z], [side === 2 ? .41 : .24, .175, side === 2 ? .25 : .41], .015);
    }
  }
  box(scene, coal, [-.75, 1.24, -2.19], [1.36, .35, .04]);
  mesh(scene, new THREE.CylinderGeometry(.36, .9, .85, 4), room.iron, [-.75, 1.94, -1.69]).rotation.y = Math.PI / 4;
  box(scene, room.iron, [-.75, 2.8, -1.69], [.46, .95, .48]);
  for (const y of [1.49, 2.34, 3.15]) box(scene, bronze, [-.75, y, -1.69], [y === 1.49 ? 1.5 : .5, .045, y === 1.49 ? 1.35 : .52], .005);
  const fire = new THREE.Group(); scene.add(fire); preserve.add(fire);
  for (let i = 0; i < 44; i++) {
    const a = i * 2.4, r = .54 * Math.sqrt(i / 44);
    const lump = mesh(fire, new THREE.IcosahedronGeometry(.06 + (i % 4) * .009, 1), i % 3 ? coal : ember, [-.75 + Math.cos(a) * r, .42 + (i % 3) * .025, -1.62 + Math.sin(a) * r]);
    lump.rotation.set(i * .5, i * .3, i * .7);
  }
  // Keep the ray-marched flame inside the hearth, rising from the charcoal rather than filling the hood.
  const flameM=material(new THREE.ShaderMaterial({transparent:true,depthWrite:false,defines:{STEPS:16},uniforms:{time:{value:0},heat:{value:.06},eye:{value:new THREE.Vector3()}},
    vertexShader:`varying vec3 p; void main(){p=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`precision highp float; varying vec3 p; uniform float time; uniform float heat; uniform vec3 eye;
      float hash(vec3 v){v=fract(v*.3183099+vec3(.1,.2,.3));v*=17.;return fract(v.x*v.y*v.z*(v.x+v.y+v.z));}
      float noise(vec3 v){vec3 i=floor(v),f=fract(v);f=f*f*(3.-2.*f);return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
      void main(){vec3 d=normalize(p-eye),q=p+d*.002;vec3 safeD=mix(vec3(-1.),vec3(1.),step(vec3(0.),d))*max(abs(d),vec3(.0001));vec3 farT=(sign(safeD)-q)/safeD;float end=min(farT.x,min(farT.y,farT.z));float stepSize=max(0.,end)/float(STEPS);vec4 sum=vec4(0.);
        for(int i=0;i<STEPS;i++){vec3 s=q+d*(float(i)+.5)*stepSize;float h=clamp((s.y+1.)*.5,0.,1.);vec3 flow=s*3.6-vec3(sin(time*1.2+h*4.)*.3,time*1.9,cos(time+h*5.)*.3);float n=noise(flow)*.65+noise(flow*2.1+time*.3)*.35;float r=mix(.67,.03,h)+sin(h*8.-time*3.)*.06;float body=(1.-smoothstep(r-.13,r+.1,length(s.xz+vec2(sin(h*6.+time*2.)*.1*h,0.))));float tongues=0.;for(int j=0;j<3;j++){float f=float(j),reach=.6+hash(vec3(f,1.,2.))*.4,ht=h/reach;vec2 center=vec2(cos(f*2.4),sin(f*2.4))*.25*(1.-h)+vec2(sin(h*5.+time*2.3+f),cos(h*4.-time*1.6+f))*.12*h;float rr=mix(.2,.005,clamp(ht,0.,1.));float tongue=(1.-smoothstep(rr*.3,rr+.025,length(s.xz-center)))*(1.-smoothstep(.8,1.,ht));tongues=max(tongues,tongue);}body=max(body*.15,tongues);float density=body*smoothstep(.3+h*.25,.78,n)*(1.-h)*heat;float a=clamp(density*stepSize*3.2,0.,.9);vec3 color=mix(vec3(1.8,.7,.025),vec3(1.1,.055,.001),smoothstep(.05,.85,h));sum.rgb+=color*a*(1.-sum.a);sum.a+=a*(1.-sum.a);}
        if(sum.a<.002)discard;gl_FragColor=vec4(sum.rgb/max(sum.a,.001),sum.a);
      }` }));
  const flame=mesh(fire,new THREE.BoxGeometry(2,2,2),flameM,[-.75,.54,-1.62]);flame.scale.set(.4,.11,.34);flame.castShadow=false;flame.receiveShadow=false;preserve.add(flame);
  const eye=new THREE.Vector3(); flame.onBeforeRender=(_r,_s,camera)=>{camera.getWorldPosition(eye);flame.worldToLocal(eye);flameM.uniforms.eye!.value.copy(eye);};
  const firelight = new THREE.PointLight("#ff8429", .95, 5, 2); firelight.position.set(-.75, .8, -1.3); scene.add(firelight);
  // Faceted stump, tapered iron waist, flat face and true conical anvil horn.
  cylinder(scene, room.wood, [.25, .28, .35], .35, .56, .31);
  for (const y of [.12, .44]) { const ring = k.torus(scene, room.iron, [.25, y, .35], .34, .018); ring.rotation.x = Math.PI / 2; }
  box(scene, room.iron, [.25, .62, .35], [.67, .12, .43], .03);
  cylinder(scene, room.iron, [.25, .8, .35], .2, .31, .13);
  box(scene, room.iron, [.25, .98, .35], [.76, .11, .35], .018);
  const horn = mesh(scene, new THREE.ConeGeometry(.16, .48, 32), room.iron, [-.34, .96, .35]); horn.rotation.z = Math.PI / 2;
  for (const x of [.03, .47]) for (const z of [.19, .51]) cylinder(scene, bronze, [x, .69, z], .018, .025);
  const billet = new THREE.Group(); billet.position.set(.24, 1.06, .35); scene.add(billet); preserve.add(billet);
  const blank = box(billet, hot, [0, 0, 0], [.34, .055, .14], .012);
  const blade = new THREE.Shape(); blade.moveTo(-.29, -.085); blade.lineTo(.2, -.12); blade.lineTo(.34, 0); blade.lineTo(.2, .12); blade.lineTo(-.29, .085); blade.closePath();
  const shaped = mesh(billet, new THREE.ExtrudeGeometry(blade, { depth: .04, bevelEnabled: true, bevelThickness: .008, bevelSize: .006, bevelSegments: 2 }), hot); shaped.rotation.x = Math.PI / 2;
  const hammer = new THREE.Group(); hammer.position.set(.65, 1.22, .37); scene.add(hammer);
  rod(hammer, room.wood, [0, 0, 0], [.12, .56, 0], .026);
  box(hammer, room.iron, [.12, .57, 0], [.32, .15, .16], .015);
  for (const x of [-.03, .27]) box(hammer, bronze, [x, .57, 0], [.018, .12, .13], .004);
  spot("forging-hammer", "锤击铁坯", "只有可锻炉火下的锤击才有效，完成两次后冷却。", hammer, "hammer");
  billet.traverse(o => { if (o instanceof THREE.Mesh) { o.userData.spot = "forging-hammer"; pickables.push(o); } });
  // A wood-and-leather concertina bellows with leather ribs and an articulated upper board.
  const bellows = new THREE.Group(); bellows.position.set(1.25, .75, -1.55); scene.add(bellows);
  box(bellows, room.wood, [0, -.28, 0], [.66, .08, 1.06]);
  for (const x of [-.23, .23]) for (const z of [-.39, .39]) box(bellows, room.wood, [x, -.51, z], [.08, .44, .08]);
  const moving = new THREE.Group(); bellows.add(moving);
  for (let i = 0; i < 7; i++) {
    box(moving, i % 2 ? leather : bronze, [0, -.2 + i * .065, 0], [.64 + (i % 2) * .05, .038, 1.02 + (i % 2) * .04], .018);
  }
  box(moving, room.wood, [0, .25, 0], [.7, .065, 1.1]); rod(moving, room.wood, [0, .28, .4], [0, .28, .85], .036);
  k.tube(scene, bronze, [[1.25, .6, -2.12], [.95, .54, -2.3], [.25, .47, -2.2], [.12, .47, -1.8]], .065);
  spot("leather-bellows", "推动风箱", "空气让炉火增强；留意可锻与过热提示。", bellows, "bellows");
  const basket = new THREE.Group(); basket.position.set(-1.9, .25, .05); scene.add(basket);
  cylinder(basket, room.iron, [0, 0, 0], .32, .45, .4);
  for (let i = 0; i < 23; i++) mesh(basket, new THREE.IcosahedronGeometry(.07, 0), coal, [Math.sin(i * 2.4) * .22, .22 + (i % 3) * .035, Math.cos(i * 2.4) * .22]);
  k.torus(basket, bronze, [0, .23, 0], .4, .02).rotation.x = Math.PI / 2;
  spot("charcoal-basket", "添加木炭", "炭篮提供炉火；过量加炭会让铁坯过热。", basket, "charcoal");
  const vat = new THREE.Group(); vat.position.set(1.7, .33, .5); scene.add(vat);
  cylinder(vat, brick, [0, 0, 0], .38, .64, .46);
  cylinder(vat, water, [0, .325, 0], .425, .01);
  k.torus(vat, bronze, [0, .32, 0], .46, .025).rotation.x = Math.PI / 2;
  const steam = new THREE.Group(); vat.add(steam);
  const vapor = material(new THREE.MeshBasicMaterial({ color: "#d5d4c4", transparent: true, opacity: .14, depthWrite: false }));
  for (let i = 0; i < 6; i++) sphere(steam, vapor, [Math.sin(i) * .12, .45 + i * .1, Math.cos(i) * .12], .075 + i * .012);
  spot("quench-vat", "冷却铁坯", "降低过热炉火；两次有效锤击后冷却即可完成。", vat, "cool");
  // A freestanding rack keeps the hand tools within reach.
  for (const x of [-.3, 2.3]) box(scene, room.wood, [x, 1.1, -3.4], [.09, 2.2, .15]);
  box(scene, room.wood, [1, 2.2, -3.4], [2.6, .13, .14]);
  for (let i = 0; i < 6; i++) {
    const x = -.05 + i * .4; rod(scene, room.iron, [x, 2.2, -3.27], [x, 1.55 - (i % 3) * .1, -3.25], .018);
    if (i % 2) box(scene, room.iron, [x, 1.55 - (i % 3) * .1, -3.25], [.2, .07, .08]);
    else k.torus(scene, room.iron, [x, 1.49 - (i % 3) * .1, -3.25], .06, .012);
  }
  room.finish(preserve);
  return {
    game, spots, pickables,
    views: { wide: { position: [3.6, 2.7, 5.3], target }, close, side: { position: [-3.1, 2.2, 2.4], target }, painting: { position: [0, 1.8, 5.9], target: [0, 1.2, -.8] } },
    update(_phase, time, delta) {
      const state = game.snapshot(), heat = state.complete ? .03 : state.readings[0] === "过热" ? 1 : state.readings[0] === "可锻" ? .7 : .06;
      const hits = Number(state.readings[1].split(" / ")[0]);
      hot.emissiveIntensity = state.complete ? 0 : heat * 2; hot.color.set(state.complete ? "#72766d" : "#a85225");
      ember.emissiveIntensity = .18 + heat * 2.2;
      firelight.intensity = .35 + heat * 10 * (1 + Math.sin(time * 6) * .035 + Math.sin(time * 9.7) * .02);
      flameM.uniforms.time!.value = time; flameM.uniforms.heat!.value = heat;
      const flameHeight = .09 + heat * .24;
      flame.scale.set(.4 + heat * .06, flameHeight, .34 + heat * .03);
      flame.position.y = .43 + flameHeight;
      blank.visible = hits < 2; blank.scale.x = 1 + hits * .35; shaped.visible = hits === 2;
      strike = Math.max(0, strike - delta * 2.8); hammer.rotation.z = Math.sin(strike * Math.PI) * -.85;
      pump = Math.max(0, pump - delta * 2); moving.scale.y = 1 - Math.sin(pump * Math.PI) * .45;
      quench = Math.max(0, quench - delta * .8); steam.visible = quench > 0; steam.position.y = (1 - quench) * .35;
    },
    canMove(x, z) { return !(x > -1.75 && x < 1.7 && z > -2.4 && z < .95); },
  };
}
