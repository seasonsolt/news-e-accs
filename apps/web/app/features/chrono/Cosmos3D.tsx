// The voyage itself. Loaded only after the reader (or the desktop default) enters 3D, so three.js
// stays out of the first paint. Bodies are procedural; the current era's plate is a backdrop.
// Stars are instanced, one mesh per category, so a few hundred milestones stay one draw each.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Billboard } from "@react-three/drei/core/Billboard.js";
import { Stars } from "@react-three/drei/core/Stars.js";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Line,
  LineBasicMaterial,
  Material,
  Object3D,
  OctahedronGeometry,
  SRGBColorSpace,
  TetrahedronGeometry,
  Texture,
  TextureLoader,
  TorusGeometry,
  TubeGeometry,
  Vector3,
} from "three";
import type { ChronicleCategory, ChronicleEra, ChronicleMilestone } from "@aihot/contracts/chronicle";
import {
  cameraPose,
  eraStops,
  flightCoordinate,
  forecastStart,
  pathFrame,
  pathPoint,
  starStops,
  type EraStop,
  type StarStop,
  type Vec3,
} from "./flight.ts";

const STAR_COLOR: Record<ChronicleCategory, string> = {
  cosmos: "#9fb0d6",
  life: "#86c79a",
  human: "#e2b468",
  energy: "#ef8458",
  compute: "#d9a441",
  ai: "#f6dc96",
  culture: "#cbb99c",
};

const CATEGORIES: ChronicleCategory[] = ["cosmos", "life", "human", "energy", "compute", "ai", "culture"];

function starGeometry(category: ChronicleCategory): BufferGeometry {
  switch (category) {
    case "cosmos": return new OctahedronGeometry(1.35, 0);
    case "life": return new TetrahedronGeometry(1.5, 0);
    case "human": return new BoxGeometry(1.7, 1.7, 1.7);
    case "energy": return new ConeGeometry(1.05, 2.1, 6);
    case "compute": return new CylinderGeometry(0.85, 0.85, 1.8, 6);
    case "ai": return new IcosahedronGeometry(1.35, 0);
    case "culture": return new TorusGeometry(1, 0.32, 6, 14);
  }
}

function displacePlanet(seed: number, radius: number, detail: number): BufferGeometry {
  const geometry = new IcosahedronGeometry(radius, detail);
  const position = geometry.attributes.position as BufferAttribute;
  const vertex = new Vector3();
  for (let i = 0; i < position.count; i++) {
    vertex.fromBufferAttribute(position, i);
    const n = vertex.clone().normalize();
    const wobble = Math.sin(n.x * 4.2 + seed * 12) * Math.cos(n.y * 3.4 - seed * 8) * Math.sin(n.z * 5.1 + seed * 3);
    const ridge = Math.sin((n.x + n.z) * 8 + seed) * 0.04;
    const scale = 1 + wobble * 0.1 + ridge;
    position.setXYZ(i, vertex.x * scale, vertex.y * scale, vertex.z * scale);
  }
  geometry.computeVertexNormals();
  return geometry;
}

function FlightCamera({ u }: { u: number }) {
  const current = useRef(u);
  const { camera } = useThree();
  useLayoutEffect(() => {
    const pose = cameraPose(current.current);
    camera.position.set(pose.position[0], pose.position[1], pose.position[2]);
    camera.lookAt(pose.target[0], pose.target[1], pose.target[2]);
  }, [camera]);
  useFrame((_, dt) => {
    current.current += (u - current.current) * (1 - Math.exp(-dt * 5));
    const pose = cameraPose(current.current);
    camera.position.set(pose.position[0], pose.position[1], pose.position[2]);
    camera.lookAt(pose.target[0], pose.target[1], pose.target[2]);
  });
  return null;
}

function Sky() {
  const group = useRef<Group>(null);
  useFrame(({ camera }) => { group.current?.position.copy(camera.position); });
  return (
    <group ref={group}>
      <Stars radius={100} depth={50} count={1400} factor={2.4} saturation={0} fade speed={0.2} />
    </group>
  );
}

function Route() {
  const line = useMemo(() => {
    const points = Array.from({ length: 240 }, (_, i) => new Vector3(...pathPoint(i / 239)));
    return new Line(new BufferGeometry().setFromPoints(points), new LineBasicMaterial({ color: "#d9a441", transparent: true, opacity: 0.28 }));
  }, []);
  useEffect(() => () => {
    line.geometry.dispose();
    (line.material as Material).dispose();
  }, [line]);
  return <primitive object={line} />;
}

function EraArt({ art, position }: { art: string; position: Vec3 }) {
  const [map, setMap] = useState<Texture | null>(null);
  useEffect(() => {
    let alive = true;
    const texture = new TextureLoader().load(`/media/art/epochs/${art}-800.webp`, (loaded) => {
      loaded.colorSpace = SRGBColorSpace;
      if (alive) setMap(loaded);
    });
    return () => { alive = false; texture.dispose(); setMap(null); };
  }, [art]);
  if (!map) return null;
  return (
    <Billboard position={[position[0], position[1] + 8.4, position[2]]}>
      <mesh>
        <planeGeometry args={[13.2, 8.8]} />
        <meshBasicMaterial map={map} toneMapped={false} />
      </mesh>
    </Billboard>
  );
}

function EraBody({ stop, current }: { stop: EraStop; current: boolean }) {
  const geometry = useMemo(
    () => (stop.kind === "planet" ? displacePlanet(stop.seed, current ? 3.6 : 3.05, current ? 3 : 2) : null),
    [stop.kind, stop.seed, current],
  );
  if (stop.kind === "nebula") {
    return (
      <group position={stop.position}>
        <mesh>
          <sphereGeometry args={[current ? 6.4 : 5.1, 24, 18]} />
          <meshBasicMaterial color={stop.color} transparent opacity={0.32} blending={AdditiveBlending} depthWrite={false} />
        </mesh>
        <mesh position={[1.8, 0.5, -0.6]}>
          <sphereGeometry args={[3.2, 16, 12]} />
          <meshBasicMaterial color="#f4ecdc" transparent opacity={0.14} blending={AdditiveBlending} depthWrite={false} />
        </mesh>
        {current && <EraArt art={stop.art} position={[0, 0, 0]} />}
      </group>
    );
  }
  return (
    <group position={stop.position}>
      <mesh geometry={geometry ?? undefined}>
        <meshStandardMaterial
          color={stop.color}
          roughness={0.68}
          metalness={0.12}
          emissive={stop.color}
          emissiveIntensity={current ? 0.22 : 0.06}
          transparent={stop.forecast}
          opacity={stop.forecast ? 0.42 : 1}
        />
      </mesh>
      {stop.forecast && geometry && (
        <mesh geometry={geometry} dispose={null}>
          <meshBasicMaterial color="#f0d28a" wireframe transparent opacity={0.4} />
        </mesh>
      )}
      {current && (
        <>
          <mesh rotation={[Math.PI / 2.3, 0.2, 0.1]}>
            <torusGeometry args={[5.2, 0.055, 8, 56]} />
            <meshBasicMaterial color="#f0d28a" />
          </mesh>
          <pointLight intensity={18} distance={36} color="#f4ecdc" />
          <EraArt art={stop.art} position={[0, 0, 0]} />
        </>
      )}
    </group>
  );
}

function Starfield({ stars, forecast, onPick, onHover, dragged }: {
  stars: StarStop[];
  forecast: boolean;
  onPick: (id: string) => void;
  onHover: (hit: { id: string; x: number; y: number } | null) => void;
  dragged: { current: boolean };
}) {
  const geometries = useMemo(() => Object.fromEntries(CATEGORIES.map((category) => [category, starGeometry(category)])) as Record<ChronicleCategory, BufferGeometry>, []);
  useEffect(() => () => { for (const geometry of Object.values(geometries)) geometry.dispose(); }, [geometries]);
  return (
    <group>
      {CATEGORIES.map((category) => {
        const items = stars.filter((star) => star.category === category && star.forecast === forecast);
        if (!items.length) return null;
        return (
          <StarGroup
            key={`${category}-${forecast ? "f" : "h"}`}
            items={items}
            geometry={geometries[category]}
            color={STAR_COLOR[category]}
            forecast={forecast}
            onPick={onPick}
            onHover={onHover}
            dragged={dragged}
          />
        );
      })}
    </group>
  );
}

function StarGroup({ items, geometry, color, forecast, onPick, onHover, dragged }: {
  items: StarStop[];
  geometry: BufferGeometry;
  color: string;
  forecast: boolean;
  onPick: (id: string) => void;
  onHover: (hit: { id: string; x: number; y: number } | null) => void;
  dragged: { current: boolean };
}) {
  const mesh = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const instanced = mesh.current;
    if (!instanced) return;
    const dummy = new Object3D();
    const scale = forecast ? 0.72 : 1;
    items.forEach((star, index) => {
      dummy.position.set(star.position[0], star.position[1], star.position[2]);
      dummy.rotation.set(star.u * 4, index, 0);
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      instanced.setMatrixAt(index, dummy.matrix);
    });
    instanced.instanceMatrix.needsUpdate = true;
    instanced.computeBoundingSphere();
  }, [items, forecast]);
  const pick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    if (dragged.current) return;
    const index = event.instanceId;
    const star = index == null ? undefined : items[index];
    if (star) onPick(star.id);
  };
  const hover = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    const index = event.instanceId;
    const star = index == null ? undefined : items[index];
    if (!star) return;
    onHover({ id: star.id, x: event.nativeEvent.clientX, y: event.nativeEvent.clientY });
  };
  return (
    <instancedMesh
      ref={mesh}
      args={[geometry, undefined, items.length]}
      dispose={null}
      onClick={pick}
      onPointerOver={hover}
      onPointerOut={() => onHover(null)}
    >
      <meshStandardMaterial
        color={color}
        emissive={color}
        emissiveIntensity={forecast ? 0.15 : 0.45}
        roughness={0.35}
        metalness={0.2}
        transparent={forecast}
        opacity={forecast ? 0.55 : 1}
      />
    </instancedMesh>
  );
}

function forecastMark(label: string): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 160;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "rgba(240, 210, 138, 0.92)";
    ctx.lineWidth = 6;
    ctx.setLineDash([16, 10]);
    ctx.strokeRect(8, 8, canvas.width - 16, canvas.height - 16);
    ctx.font = "600 78px sans-serif";
    ctx.fillStyle = "#f0d28a";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, canvas.width / 2, canvas.height / 2 + 4);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

function FutureZone({ start, label }: { start: number; label: string }) {
  const { geometry, labelAt } = useMemo(() => {
    const steps = 56;
    const points = Array.from({ length: steps + 1 }, (_, i) => new Vector3(...pathPoint(start + (1 - start) * (i / steps))));
    const geometry = new TubeGeometry(new CatmullRomCurve3(points), steps, 13, 12, false);
    const frame = pathFrame(start);
    const labelAt: Vec3 = [
      frame.position[0] + frame.up[0] * 16,
      frame.position[1] + frame.up[1] * 16,
      frame.position[2] + frame.up[2] * 16,
    ];
    return { geometry, labelAt };
  }, [start]);
  const mark = useMemo(() => forecastMark(label), [label]);
  useEffect(() => () => {
    geometry.dispose();
    mark.dispose();
  }, [geometry, mark]);
  return (
    <group>
      <mesh geometry={geometry}>
        <meshBasicMaterial color="#d9a441" transparent opacity={0.1} depthWrite={false} side={DoubleSide} />
      </mesh>
      <sprite position={labelAt} scale={[18, 5.6, 1]}>
        <spriteMaterial map={mark} transparent depthWrite={false} toneMapped={false} />
      </sprite>
    </group>
  );
}

function Scene({ eras, milestones, t, now, eraId, forecastLabel, onPick, onHover, dragged }: {
  eras: ChronicleEra[];
  milestones: ChronicleMilestone[];
  t: number;
  now: number;
  eraId: string;
  forecastLabel: string;
  onPick: (id: string) => void;
  onHover: (hit: { id: string; x: number; y: number } | null) => void;
  dragged: { current: boolean };
}) {
  const stops = useMemo(() => eraStops(eras, now), [eras, now]);
  const stars = useMemo(() => starStops(milestones, eras, now), [milestones, eras, now]);
  const zone = useMemo(() => forecastStart(eras, now), [eras, now]);
  const u = flightCoordinate(t, eras, now);
  return (
    <>
      <color attach="background" args={["#07060c"]} />
      <fog attach="fog" args={["#07060c", 48, 270]} />
      <ambientLight intensity={0.55} />
      <hemisphereLight args={["#9eb6dd", "#2a2118", 0.5]} />
      <directionalLight position={[40, 70, 20]} intensity={1.7} />
      <FlightCamera u={u} />
      <Sky />
      <Route />
      {stops.map((stop) => <EraBody key={stop.id} stop={stop} current={stop.id === eraId} />)}
      <Starfield stars={stars} forecast={false} onPick={onPick} onHover={onHover} dragged={dragged} />
      <Starfield stars={stars} forecast onPick={onPick} onHover={onHover} dragged={dragged} />
      {zone !== null && <FutureZone start={zone} label={forecastLabel} />}
    </>
  );
}

export default function Cosmos3D({ eras, milestones, t, now, eraId, forecastLabel, running, onPick, onHover, onFail, dragged }: {
  eras: ChronicleEra[];
  milestones: ChronicleMilestone[];
  t: number;
  now: number;
  eraId: string;
  forecastLabel: string;
  running: boolean;
  onPick: (id: string) => void;
  onHover: (hit: { id: string; x: number; y: number } | null) => void;
  onFail: () => void;
  dragged: { current: boolean };
}) {
  return (
    <Canvas
      className="cosmos-canvas"
      dpr={[1, 1.5]}
      frameloop={running ? "always" : "never"}
      camera={{ fov: 50, near: 0.2, far: 2400, position: [0, 8, 20] }}
      gl={{ antialias: true, alpha: false, powerPreference: "high-performance", stencil: false }}
      onCreated={({ gl }) => {
        gl.setClearColor("#07060c");
        const canvas = gl.domElement;
        // Removing the canvas (back to the flat view) can report a lost context. That is teardown,
        // not a device that cannot draw. Only a loss while the canvas is still on the page falls back.
        const onLost = (event: Event) => {
          event.preventDefault();
          if (canvas.isConnected) onFail();
        };
        canvas.addEventListener("webglcontextlost", onLost);
      }}
    >
      <Scene eras={eras} milestones={milestones} t={t} now={now} eraId={eraId} forecastLabel={forecastLabel} onPick={onPick} onHover={onHover} dragged={dragged} />
    </Canvas>
  );
}
