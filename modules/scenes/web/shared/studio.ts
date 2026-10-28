import * as THREE from "three";
import { RectAreaLightUniformsLib } from "three/examples/jsm/lights/RectAreaLightUniformsLib.js";
import type { Kit, Model, View } from "./geometry.ts";
import type { Vec3, World } from "./worlds.ts";
import type { Surface } from "./surfaces.ts";
import { hardware } from "../agents-2026/hardware.ts";
import { drawWorkspace, drawTerminal, drawHardware } from "../agents-2026/screens.ts";
import { buildWindows, type WindowAssets } from "../agents-2026/windows.ts";
import { roomReflections } from "./reflections.ts";
import { landscape, type LandscapeAssets } from "./landscape.ts";

export function build(scene: THREE.Scene, k: Kit, _world: World, _tx: (s: string) => string, renderer: THREE.WebGLRenderer, floor: Surface, windowAssets: WindowAssets, landscapeAssets: LandscapeAssets): Model {
  const { mesh, box, rod, tube, cylinder, torus, sphere, texture, material, random } = k;
  const h = hardware(k), preserved = new Set<THREE.Object3D>();
  const outdoors = landscape(scene, k, landscapeAssets);
  RectAreaLightUniformsLib.init();

  // The visible task lamp casts the desk's warm pool and stable, directional shadows.
  const key = new THREE.SpotLight("#ffd6a0", 7, 4, 1.05, .65, 2);
  key.position.set(1.09, 1.365, -.19); key.target.position.set(.45, .79, .35); key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048); key.shadow.normalBias = .001; key.shadow.bias = -.00005;
  key.shadow.camera.near = .04; key.shadow.camera.far = 4;
  key.shadow.autoUpdate = false; key.shadow.needsUpdate = true; scene.add(key, key.target); k.own(() => key.shadow.dispose());
  const softbox = new THREE.RectAreaLight("#f0d5ad", .65, 1.7, .7); softbox.position.set(-.8, 2.8, .4); softbox.lookAt(0, .8, .3); scene.add(softbox);
  const screenFill = new THREE.RectAreaLight("#8ebbb5", .35, 1.4, .45); screenFill.position.set(.15, 1.25, .05); screenFill.lookAt(0, .78, .5); scene.add(screenFill);

  // Real-world furniture proportions leave room for articulated hardware and useful walking views.
  const oak = material(new THREE.MeshStandardMaterial({ ...floor, color: "#897b69", roughness: .72, normalScale: new THREE.Vector2(.2, .2) }));

  const floorG = new THREE.PlaneGeometry(9.4, 8); floorG.rotateX(-Math.PI / 2); floorG.translate(0, -.012, 1);
  const uv = floorG.attributes.uv!; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 3, uv.getY(i) * 3);
  const roomFloor = mesh(scene, floorG, oak); roomFloor.castShadow = false;
  // The desk sits on an open garden terrace, framed by a light pergola.
  for (const x of [-4.5, 4.5]) for (const z of [-2.8, 4.6]) box(scene, oak, [x, 1.8, z], [.13, 3.6, .13]);
  for (const x of [-4.5, 4.5]) box(scene, oak, [x, 3.6, .9], [.16, .15, 7.6]);
  for (const z of [-2.8, 4.6]) box(scene, oak, [0, 3.6, z], [9.2, .15, .16]);
  for (const x of [-3.4, -1.15, 1.15, 3.4]) box(scene, h.graphite, [x, 1.78, -2.62], [.065, 3.56, .075]);
  const windows = buildWindows(scene, k, windowAssets, h.graphite, preserved);
  // Walnut grain is a warped fibre field, with a quiet satin finish rather than straight coloured stripes.
  const walnutMap = texture(2048, 1024, (c, w, height) => {
    const pixels = c.createImageData(w, height);
    for (let y = 0; y < height; y++) for (let x = 0; x < w; x++) {
      const u = x / w, v = y / height, warp = Math.sin(u * 13 + v * 9) * .55 + Math.sin(u * 29 - v * 8) * .17;
      const fibre = v * 145 + warp, vein = Math.pow(Math.abs(Math.sin(fibre * Math.PI)), 24), broad = Math.sin(v * 27 + Math.sin(u * 7) * .8);
      const noise = Math.sin(x * 17.13 + y * 91.7) * 43758.5453, n = noise - Math.floor(noise), value = 1 + broad * .09 - vein * .13 + (n - .5) * .055;
      const i = (y * w + x) * 4; pixels.data[i] = 110 * value; pixels.data[i + 1] = 79 * value; pixels.data[i + 2] = 55 * value; pixels.data[i + 3] = 255;
    }
    c.putImageData(pixels, 0, 0);
  });
  const woodHeight = texture(1024, 512, (c, w, height) => {
    const pixels = c.createImageData(w, height);
    for (let y=0;y<height;y++) for(let x=0;x<w;x++) {
      const u=x/w,v=y/height,warp=Math.sin(u*13+v*9)*.55+Math.sin(u*29-v*8)*.17;
      const value=150-Math.pow(Math.abs(Math.sin((v*145+warp)*Math.PI)),24)*52;
      const i=(y*w+x)*4;pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=value;pixels.data[i+3]=255;
    }
    c.putImageData(pixels,0,0);
  });
  woodHeight.colorSpace=THREE.NoColorSpace;
  const walnut = material(new THREE.MeshPhysicalMaterial({ map: walnutMap, bumpMap: woodHeight, roughnessMap: woodHeight, bumpScale: .0011, roughness: .65, clearcoat: .32, clearcoatRoughness: .3 }));
  box(scene, walnut, [-.05, .785, .2], [3.05, .055, 1.22], .014);
  for (const x of [-1.18, 1.08]) {
    box(scene, h.graphite, [x, .36, .2], [.065, .7, .075], .006); box(scene, h.anodized, [x, .39, .2], [.079, .04, .09], .004);
    box(scene, h.graphite, [x, .037, .2], [.085, .035, .68], .008);
    for (const z of [-.1, .5]) cylinder(scene, h.rubber, [x, .011, z], .027, .014);
  }
  box(scene, h.graphite, [-.05, .705, .05], [2.25, .065, .065], .006);
  box(scene, h.graphite, [-.1, .656, -.25], [1.5, .06, .19], .008);
  for (let i = 0; i < 14; i++) box(scene, h.rubber, [-.75 + i * .1, .689, -.25], [.045, .006, .15], 0);
  // PBR fibres give the desk mat, chair and carpet a different response from metal and wood.
  const cloth = texture(512, 512, (c, w, height) => {
    c.fillStyle = "#788079"; c.fillRect(0, 0, w, height);
    for (let i = 0; i < w; i += 3) { c.fillStyle = i % 2 ? "#dce2ca28" : "#17251b42"; c.fillRect(i, 0, 1, height); c.fillRect(0, i, w, 1); }
  });
  const felt = material(new THREE.MeshStandardMaterial({ color: "#64736a", map: cloth, bumpMap: cloth, bumpScale: .0006, roughness: .95 }));
  box(scene, felt, [.06, .816, .47], [1.43, .006, .54], .008);
  const workspace = texture(2400, 720, c => drawWorkspace(c, 0)), terminal = texture(768, 1280, c => drawTerminal(c, 0)), diagnostics = texture(960, 480, c => drawHardware(c, 0));
  const main = h.ultraWide(scene, workspace), vertical = h.portrait(scene, terminal), input = h.input(scene), compute = h.compute(scene, diagnostics, preserved);
  preserved.add(main.screen); preserved.add(vertical.screen);
  const hitM = material(new THREE.MeshBasicMaterial({ visible: false }));
  const inputHit = box(input.group, hitM, [0, .03, .01], [.61, .12, .28]); inputHit.userData.spot = "input";
  const deckHit = box(input.deck, hitM, [0, .025, 0], [.24, .08, .17]); deckHit.userData.spot = "terminal";
  // Cable combs, connectors and a small exposed development board make the hardware readable close up.
  for (let i = 0; i < 4; i++) {
    const x = .8 + i * .019;
    tube(scene, i % 2 ? h.rubber : h.copper, [[x, .685, -.24], [x + .1, .59, -.3], [1.6, .22 + i * .02, -.32], [1.91, .24 + i * .02, -.23]], .0033);
  }
  for (const x of [1.1, 1.38]) box(scene, h.graphite, [x, .39, -.32], [.06, .016, .06], .003);
  const pcb = new THREE.Group(); pcb.position.set(-.7, .825, .48); pcb.rotation.y = .16; scene.add(pcb);
  const boardM = material(new THREE.MeshStandardMaterial({ color: "#24584c", roughness: .65, metalness: .2 }));
  box(pcb, boardM, [0, 0, 0], [.09, .003, .065], .001);
  box(pcb, h.rubber, [0, .005, 0], [.025, .006, .025], .001);
  for (let i = 0; i < 12; i++) { box(pcb, h.copper, [-.037 + i * .0066, .004, .026], [.002, .005, .008], 0); box(pcb, h.anodized, [-.037 + i * .0066, .004, -.026], [.002, .005, .008], 0); }
  // A proper hollow cup, notebook and solder accessories ground the technical scene in a lived-in workspace.
  const ceramic = material(new THREE.MeshPhysicalMaterial({ color: "#a9afa3", roughness: .28, clearcoat: .28 }));
  const cupProfile = [[0,0],[.041,0],[.053,.008],[.058,.105],[.055,.115],[.049,.115],[.047,.102],[.039,.012],[0,.012]].map(([x,y]) => new THREE.Vector2(x!,y!));
  mesh(scene, new THREE.LatheGeometry(cupProfile, 64), ceramic, [1.1, .815, .62]); torus(scene, ceramic, [1.167, .876, .62], .032, .008).rotation.y = Math.PI / 2;
  const coffee = material(new THREE.MeshPhysicalMaterial({ color: "#27170d", roughness: .24, clearcoat: .6 })); cylinder(scene, coffee, [1.1, .916, .62], .047, .001);
  const paper = material(new THREE.MeshStandardMaterial({ color: "#bfbda9", roughness: .94 }));
  const notebook = new THREE.Group(); notebook.position.set(-1.23, .815, .53); notebook.rotation.y = -.13; scene.add(notebook);
  box(notebook, h.graphite, [0, .006, 0], [.22, .012, .16], .003); box(notebook, paper, [0, .015, 0], [.21, .012, .151], .002);
  for (let i = 0; i < 9; i++) box(notebook, h.graphite, [-.005, .0213, -.055 + i * .013], [.175, .0002, .00035], 0);
  rod(notebook, h.copper, [.077, .027, -.064], [.077, .027, .059], .0025);
  const lamp = new THREE.Group(); lamp.position.set(1.29, .82, -.23); scene.add(lamp);
  cylinder(lamp, h.graphite, [0, .008, 0], .075, .016);
  rod(lamp, h.anodized, [0, .02, 0], [.02, .48, 0], .006); rod(lamp, h.anodized, [.02, .48, 0], [-.2, .59, .04], .006);
  const shade = cylinder(lamp, h.graphite, [-.2, .58, .04], .07, .05, .035); shade.rotation.z = -.2;
  const glow = material(new THREE.MeshBasicMaterial({ color: "#ffdaa2" })); cylinder(lamp, glow, [-.2, .55, .04], .062, .002);
  // A mesh-backed chair, with suspension ribs and paired castors, has a finished reverse view.
  const chair = new THREE.Group(); chair.position.set(-.94, 0, 1.55); chair.rotation.y = -.23; scene.add(chair);
  cylinder(chair, h.anodized, [0, .24, 0], .017, .32); box(chair, felt, [0, .46, 0], [.46, .065, .43], .023);
  for (let i = 0; i < 5; i++) {
    const a = i * Math.PI * 2 / 5, x = Math.cos(a) * .27, z = Math.sin(a) * .27;
    rod(chair, h.graphite, [0, .11, 0], [x, .07, z], .012);
    for (const side of [-1, 1]) { const wheel = cylinder(chair, h.rubber, [x + side * .012, .037, z], .032, .018); wheel.rotation.z = Math.PI / 2; }
  }
  const weave = texture(128,128,(c,w,height) => { c.fillStyle="#ffffff";c.fillRect(0,0,w,height);c.fillStyle="#000000";for(let y=0;y<height;y+=5)for(let x=0;x<w;x+=4)c.fillRect(x,y,2,3); });
  weave.wrapS = weave.wrapT = THREE.RepeatWrapping; weave.repeat.set(7, 10); weave.colorSpace = THREE.NoColorSpace;
  const net = material(new THREE.MeshStandardMaterial({ color:"#334039", alphaMap:weave, alphaTest:.5, roughness:.94, side:THREE.DoubleSide }));
  const back = new THREE.PlaneGeometry(.43, .58, 20, 28), bp = back.attributes.position!;
  for(let i=0;i<bp.count;i++){const x=bp.getX(i),y=bp.getY(i);bp.setXYZ(i,x,y,.04*(1-Math.pow(x/.215,2))-.07*Math.pow(y/.29,2));} back.computeVertexNormals();
  const backrest = mesh(chair, back, net, [0,.84,.19]); backrest.rotation.x = .12; backrest.castShadow=false;
  for(const x of [-.227,.227])tube(chair,h.graphite,[[x,.48,.18],[x,.67,.19],[x,.97,.19],[x*.85,1.15,.14]],.01);
  for(const y of [.58,1.12])rod(chair,h.graphite,[-.21,y,.17],[.21,y,.17],.01);
  for(const x of [-.26,.26]){rod(chair,h.graphite,[x,.42,.04],[x,.64,.04],.011);box(chair,h.rubber,[x,.67,.025],[.065,.025,.23],.012);}
  box(scene,felt,[-.7,-.005,1.4],[1.6,.008,1.8],.02);
  function plant(at:Vec3, size:number){
    const p=new THREE.Group();p.position.set(...at);p.scale.setScalar(size);scene.add(p);cylinder(p,ceramic,[0,.15,0],.14,.3,.17);cylinder(p,h.rubber,[0,.303,0],.155,.004);
    const leafM=material(new THREE.MeshStandardMaterial({color:"#3e654c",roughness:.75,side:THREE.DoubleSide}));
    for(let i=0;i<17;i++){const a=i*2.4,top=.65+random()*.65,x=Math.cos(a)*.2,z=Math.sin(a)*.2;rod(p,leafM,[0,.3,0],[x,top,z],.003);const shape=new THREE.Shape();shape.moveTo(0,0);shape.bezierCurveTo(-.06,.06,-.07,.18,0,.28);shape.bezierCurveTo(.07,.18,.06,.06,0,0);const g=new THREE.ShapeGeometry(shape,10),pp=g.attributes.position!;for(let j=0;j<pp.count;j++)pp.setZ(j,Math.sin(pp.getY(j)*10)*.025);g.computeVertexNormals();const leaf=mesh(p,g,leafM,[x,top-.08,z]);leaf.rotation.set(.6,a,.5);}
  }
  plant([-4.1,0,-1.8],1.3);plant([4.1,0,-1.7],1.15);
  // A quiet maker shelf and under-shelf pool of light provide depth beyond the hero equipment.
  for(const y of [.65,1.38,2.1]) {
    box(scene,walnut,[-4.3,y,-.7],[.32,.026,1.1],.006);
    for(let i=0;i<6;i++)box(scene,i%2?paper:h.graphite,[-4.3,y+.15,-1.11+i*.13],[.19,.28+random()*.04,.08],.003);
  }
  for(const z of [-1.25,-.15])box(scene,h.graphite,[-4.3,1.15,z],[.32,2.3,.018],.003);
  box(scene,glow,[-4.12,1.35,-.7],[.008,.018,.9],.002);
  const shelfLight=new THREE.RectAreaLight("#eebc78",1.8,.08,.9);shelfLight.position.set(-4.1,1.34,-.7);shelfLight.lookAt(-3.5,.6,-.7);scene.add(shelfLight);
  const taskView:View={position:[.65,1.52,2.32],target:[.35,1.1,.02]};
  const computeView:View={position:[3.13,1.17,1.47],target:[2.08,.7,-.02]};
  const coolingView:View={position:[3.03,1.02,.38],target:[2.22,.69,-.07]};
  const inputView:View={position:[.2,1.2,1.4],target:[.03,.835,.47]};
  k.mergeStatic(scene,preserved);
  const reflect = roomReflections(scene, renderer, k.own);
  let lastStage=-1, lastCodeFrame=-1;
  return {
    groundHeight: outdoors.height,
    views:{wide:{position:[2.7,2.2,8.5],target:[.3,1.1,-.5]},close:taskView,side:computeView,painting:{position:[.5,1.95,5.4],target:[.85,1.45,-.55]}},
    spots:[
      {id:"terminal",title:"弧面工作站",detail:"从计划，到实现，再到验证。",object:main.anchor,view:taskView,advance:true},
      {id:"compute",title:"算力机柜",detail:"任务背后是计算设备。指示灯在这里示意任务活动，不是实际负载或性能数据。",object:compute.frontHit,view:computeView},
      {id:"cooling",title:"冷却与能源",detail:"计算依赖电力，也需要散热。管道、风扇与光色表现这层基础设施，不表示实测温度或能耗。",object:compute.service,view:coolingView},
      {id:"input",title:"分体键盘与控制台",detail:"分体键盘、轨迹球与旋钮控制台组成输入区。点击控制台可以继续推进任务。",object:inputHit,view:inputView},
    ],
    pickables:[main.screen,vertical.screen,compute.frontHit,compute.sideHit,inputHit,deckHit],
    canMove:(x,z)=>!(x> -1.7&&x<1.6&&z> -.55&&z<.92)&&!(x>1.7&&x<2.5&&z> -.5&&z<.45),
    update(phase,time,dt){
      const stage=Math.min(3,Math.max(0,Math.round(phase)));
      const codeFrame=stage===2?Math.floor(time*2):0;
      if(stage!==lastStage||codeFrame!==lastCodeFrame){drawWorkspace(workspace.image.getContext("2d")!,stage,time);drawTerminal(terminal.image.getContext("2d")!,stage,time);workspace.needsUpdate=terminal.needsUpdate=true;lastCodeFrame=codeFrame;}
      if(stage!==lastStage){drawHardware(diagnostics.image.getContext("2d")!,stage);diagnostics.needsUpdate=true;lastStage=stage;}
      for(const fan of compute.fans)fan.rotation.z+=dt*(phase>.4?3.6:.6);
      screenFill.intensity=.3+phase*.035;
      if(windows.update(stage,time,dt>0)) reflect();
    },
  };
}
