import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { BokehPass } from "three/examples/jsm/postprocessing/BokehPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { GTAOPass } from "three/examples/jsm/postprocessing/GTAOPass.js";
import { FROM_SCENE, readSceneCommand, type SceneEvent } from "@aihot/web/features/chrono/scene-handoff";
import { reducedMotionQuery } from "@aihot/web/lib/motion";
import { recordWorkshop, workshopTime } from "@aihot/web/lib/local-state";
import { recordEngagement } from "@aihot/web/lib/engagement";
import { createGeometryKit, type Model, type View } from "./geometry.ts";
import { nextPhase, type World } from "./worlds.ts";
import { loadSurface } from "./surfaces.ts";
import type { GameId } from "../games/types.ts";

type Tx = (message: string, ...values: unknown[]) => string;
interface VisibilityOverride { _overrideVisibility(): void; _visibilityCache: THREE.Object3D[] }
class WorkshopContactShadows extends GTAOPass {
  _overrideVisibility() {
    (GTAOPass.prototype as unknown as VisibilityOverride)._overrideVisibility.call(this);
    const cache = (this as unknown as VisibilityOverride)._visibilityCache;
    this.scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh) || !object.visible) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      if (materials.some((m) => m.transparent || m.alphaTest > 0) || object instanceof THREE.InstancedMesh) { object.visible = false; cache.push(object); }
    });
  }
}
/** Glass should contribute reflections, not stop the depth-of-field pass at the window plane. */
class StudioFocusPass extends BokehPass {
  render(...args: Parameters<BokehPass["render"]>) {
    const hidden: THREE.Mesh[] = [];
    this.scene.traverse(object => {
      if (!(object instanceof THREE.Mesh) || !object.visible) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      if (materials.some(m => m.transparent)) { object.visible = false; hidden.push(object); }
    });
    try { super.render(...args); } finally { for (const object of hidden) object.visible = true; }
  }
}

export function start(root: HTMLElement, world: World, { tx, embedded }: { tx: Tx; embedded: boolean }): () => void {
  let disposed = false, frameId = 0;
  const cleanups: Array<() => void> = [], listeners = new AbortController(), { signal } = listeners;
  const own = (cleanup: () => void) => { if (disposed) cleanup(); else cleanups.push(cleanup); };
  const $ = <T extends HTMLElement = HTMLElement>(id: string) => root.querySelector<T>(`#${id}`)!;
  function dispose() {
    if (disposed) return;
    disposed = true; listeners.abort(); cancelAnimationFrame(frameId);
    for (const dialog of root.querySelectorAll("dialog")) dialog.close();
    for (const cleanup of cleanups.reverse()) cleanup();
  }
  void run().catch((error: unknown) => {
    if (disposed) return;
    dispose();
    $("loading").hidden = true; $("error").hidden = false;
    $("error-detail").textContent = error instanceof Error ? error.message : String(error);
    console.error(error);
  });
  return dispose;

  async function run() {
    const viewport = $("viewport"), experience = $("experience"), reduced = reducedMotionQuery();
    const studio = world.id === "agents-2026", stone = world.id === "stone-tools";
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    own(() => { renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove(); });
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = studio ? 1.25 : world.id === "taming-fire" ? 1.08 : world.challenge ? 1.1 : .98;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const canvas = renderer.domElement;
    canvas.tabIndex = 0; canvas.setAttribute("aria-label", tx(world.title)); viewport.append(canvas);
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(45, 1, .08, 400);
    const kit = createGeometryKit(own);
    let model: Model;
    if (world.challenge) {
      const { buildChallenge } = await import("../games/scenes.ts");
      if (disposed) return;
      const challenge = await buildChallenge(scene, kit, renderer, world.id as GameId, () => !disposed);
      if (!challenge) return;
      model = challenge;
    } else if (stone) {
      const [{ load }, { build }] = await Promise.all([import("../stone-tools/assets.ts"), import("../stone-tools/scene.ts")]);
      if (disposed) return;
      const assets = await load(own, renderer);
      if (disposed) return;
      model = build(scene, kit, assets);
    } else if (studio) {
      const { loadWindows } = await import("../agents-2026/windows.ts");
      const [surface, wall, windows] = await Promise.all([loadSurface("wood", own), loadSurface("plaster", own), loadWindows(own, renderer)]);
      const { build } = await import("./studio.ts");
      if (disposed) return;
      model = build(scene, kit, world, tx, renderer, surface, wall, windows);
    } else {
      const { loadNaturalAssets } = await import("./natural-assets.ts");
      const assets = await loadNaturalAssets(own, renderer, world.id === "agriculture");
      if (disposed) return;
      const { build } = world.id === "agriculture" ? await import("../agriculture/scene.ts") : await import("../taming-fire/scene.ts");
      if (disposed) return;
      model = build(scene, kit, assets);
    }
    if (new URLSearchParams(location.search).has("debug")) {
      const debug = window as Window & { chronicleWorld?: unknown };
      debug.chronicleWorld = { scene, camera, renderer, model };
      own(() => { delete debug.chronicleWorld; });
    }
    const controls = new OrbitControls(camera, canvas);
    own(() => controls.dispose());
    controls.enableDamping = !reduced.matches; controls.dampingFactor = .07;
    controls.minDistance =  .7; controls.maxDistance = 24;
    controls.maxPolarAngle = Math.PI * .49;
    controls.minPolarAngle = .12; controls.panSpeed = .6; controls.zoomSpeed = .7;
    const composer = new EffectComposer(renderer);
    composer.renderTarget1.samples = 2; composer.renderTarget2.samples = 2;
    const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), world.id === "taming-fire" ? .26 : .15, .55, 1.15);
    composer.addPass(new RenderPass(scene, camera));
    {
      const ao = new WorkshopContactShadows(scene, camera); ao.blendIntensity = .48;
      ao.updateGtaoMaterial({ radius: studio ? .06 : .15, thickness: .28, distanceExponent: 1.8, distanceFallOff: 1, scale: 1, samples: 16, screenSpaceRadius: false });
      ao.updatePdMaterial({ radius: 4, lumaPhi: 8, depthPhi: 2, normalPhi: 4, samples: 16 });
      const resizeAO = ao.setSize.bind(ao); ao.setSize = (w, h) => resizeAO(Math.max(1, Math.round(w * .6)), Math.max(1, Math.round(h * .6)));
      composer.addPass(ao);
    }
    const focus = studio ? new StudioFocusPass(scene, camera, { focus: 3, aperture: .00015, maxblur: .006 }) : null;
    if (focus) composer.addPass(focus);
    composer.addPass(bloom); composer.addPass(new OutputPass());
    function renderScene() {
      if (focus) focus.materialBokeh.uniforms.focus!.value = camera.position.distanceTo(controls.target);
      composer.render();
    }
    own(() => { for (const pass of composer.passes) pass.dispose(); composer.dispose(); });
    let phase = 0, visualPhase = 0, elapsed = 0, running = false, sinceStep = 0, paused = embedded, fatal = false;
    let activeView = "wide", flight: { start: number; from: THREE.Vector3; target: THREE.Vector3; view: View; end?: () => void } | null = null;
    const keys = new Set<string>();
    // One round of play: the reader's operations and active time, and whether the automatic demonstration took a hand in it.
    let steps = 0, startedAt = 0, idle = 0, hiddenAt = 0, assisted = false, finished = false, shown = false, begun = false;
    const newRound = () => { steps = 0; startedAt = 0; idle = 0; assisted = false; finished = false; begun = false; };
    /** The reader's first own operation in a round, counted once (docs/analytics.md); the automatic demonstration never is. */
    const begin = () => { if (!begun) { begun = true; recordEngagement("workshop_start", world.path); } };
    const flash = (element: HTMLElement, name: string) => { element.classList.remove(name); void element.offsetWidth; element.classList.add(name); };
    /** One operation by the reader: counted, then run through the game's rules. */
    function play(action: string) {
      setRunning(false);
      begin();
      startedAt ||= performance.now();
      steps++;
      model.game!.act(action);
      showPhase(0);
      if (model.game!.snapshot().tone === "error") flash($("inspector-panel"), "is-rejected");
    }
    function setRunning(on: boolean) {
      running = on && !(model.game ? model.game.snapshot().complete : phase === world.phases.length - 1) && !fatal;
      sinceStep = 0; $("run").setAttribute("aria-pressed", String(running));
      $("run-label").textContent = tx(running ? "暂停演示" : "自动演示");
      $("machine-dot").classList.toggle("is-running", running);
    }
    function showPhase(next: number) {
      const state = model.game?.snapshot();
      phase = state ? THREE.MathUtils.clamp(Math.round(state.progress), 0, world.phases.length - 1) : next; sinceStep = 0;
      if (reduced.matches) visualPhase = phase;
      const p = world.phases[phase]!;
      $("inspector-title").textContent = tx(p.title); $("inspector-copy").textContent = tx(p.detail);
      $("phase-index").textContent = `${String(phase + 1).padStart(2, "0")} / ${String(world.phases.length).padStart(2, "0")}`;
      (state?.readings ?? p.readings).forEach((v, i) => {
        const element = $("reading-" + i), text = tx(v);
        if (element.textContent === text) return;
        element.textContent = text;
        if (shown) flash(element, "is-changed");
      });
      for (const button of root.querySelectorAll<HTMLButtonElement>("[data-phase]")) {
        const i = Number(button.dataset.phase);
        if (i === phase) button.setAttribute("aria-current", "step"); else button.removeAttribute("aria-current");
        button.classList.toggle("is-done", i < phase);
      }
      const done = state?.complete ?? phase === world.phases.length - 1;
      $<HTMLButtonElement>("step").disabled = done;
      $("step").textContent = tx(done ? state ? "挑战完成" : "演示完成" : state ? model.game!.actions.find(a => a.id === state.primary)?.label ?? world.action : world.action);
      $("machine-status").textContent = tx(state?.status ?? (done ? "演示完成 · 可重新开始" : p.title));
      $("machine-status").closest<HTMLElement>(".machine-status")!.dataset.tone = state?.tone ?? "info";
      if (state) for (const button of root.querySelectorAll<HTMLButtonElement>(".game-action")) button.disabled = done;
      if (done) { setRunning(false); finish(); }
      else { finished = false; $("done-card").hidden = true; }
      if (model.game) $("game-controls").hidden = done;
      shown = true;
    }
    /** The workshop is finished: remember it in this browser, and show how it went in place of the controls. */
    function finish() {
      if (finished) return;
      finished = true;
      const scored = !!model.game && !assisted, run = scored ? { ms: performance.now() - startedAt - idle, steps } : undefined;
      // A demonstration, automatic or of the four finite stages, marks the workshop seen; only the reader's own finish is scored.
      const saved = model.game && assisted ? undefined : recordWorkshop(world.path, run);
      // Counted only for a round the reader took part in, and for a challenge only when the reader finished it.
      if (begun && !(model.game && assisted)) recordEngagement("workshop_finish", world.path);
      const show = (id: string, text: string | undefined) => { $(id).textContent = text === undefined ? "—" : text; };
      $("done-heading").textContent = tx(scored ? "挑战完成" : "演示完成");
      $("done-stats").hidden = !run;
      show("done-time", run && workshopTime(run.ms)); show("done-steps", run && String(run.steps));
      show("done-best-time", saved?.best.ms === undefined ? undefined : workshopTime(saved.best.ms)); show("done-best-steps", saved?.best.steps === undefined ? undefined : String(saved.best.steps));
      const note = saved?.record ? "新纪录" : model.game && assisted ? "自动演示不计成绩，亲手完成可记录成绩。" : "";
      $("done-note").hidden = !note; $("done-note").textContent = tx(note);
      $("done-card").hidden = false;
      $("done-card").focus({ preventScroll: true });
    }
    function step() { if (model.game) play(model.game.snapshot().primary); else showPhase(nextPhase(phase, world.phases.length)); }
    function updateViewButtons() {
      for (const name of ["wide", "close", "side"]) {
        $("view-" + name).classList.toggle("is-active", activeView === name);
        $("view-" + name).setAttribute("aria-pressed", String(activeView === name));
      }
    }
    function go(view: View, name: string, immediate = false, end?: () => void) {
      activeView = name; keys.clear();
      if (immediate || reduced.matches) { camera.position.set(...view.position); controls.target.set(...view.target); flight = null; controls.update(); end?.(); }
      else flight = { start: performance.now(), from: camera.position.clone(), target: controls.target.clone(), view, end };
      $("view-name").textContent = tx({ wide: "全景", close: "走近", side: "侧看", painting: "原画视角" }[name] ?? "自由探索");
      updateViewButtons();
    }
    function releaseView() { flight = null; activeView = "free"; updateViewButtons(); $("view-name").textContent = tx("自由探索"); }
    controls.addEventListener("start", releaseView);
    own(() => controls.removeEventListener("start", releaseView));
    const markerElements: Array<{ spot: Model["spots"][number]; element: HTMLButtonElement }> = [];
    function inspect(spot: Model["spots"][number]) {
      go(spot.view, "detail");
      $("inspector-body").hidden = false; $("inspector-toggle").setAttribute("aria-expanded", "true"); $("inspector-toggle").textContent = "−";
      if (model.game && spot.action) play(spot.action);
      else if (spot.advance) { begin(); step(); }
      else { $("inspector-title").textContent = tx(spot.title); $("inspector-copy").textContent = tx(spot.detail); }
      $("toast").textContent = tx(spot.title); $("toast").hidden = false; toastTime = 3;
    }
    let toastTime = 0;
    for (const spot of model.spots) {
      const element = document.createElement("button"); element.className = "hotspot"; element.id = `spot-${spot.id}`; element.setAttribute("aria-label", tx(spot.title));
      const circle = document.createElement("span"); circle.className = "spot-circle"; circle.textContent = spot.advance ? "↻" : "+";
      const label = document.createElement("span"); label.className = "spot-label"; label.textContent = tx(spot.title);
      element.append(circle, label); $("hotspots").append(element);
      element.addEventListener("click", () => inspect(spot), { signal });
      markerElements.push({ spot, element });
    }
    own(() => { for (const { element } of markerElements) element.remove(); });
    const ray = new THREE.Raycaster(), pointer = new THREE.Vector2(); ray.params.Points = { threshold: .25 };
    function pick(e: PointerEvent) {
      const rect = canvas.getBoundingClientRect();
      pointer.set((e.clientX - rect.left) / rect.width * 2 - 1, 1 - (e.clientY - rect.top) / rect.height * 2);
      ray.setFromCamera(pointer, camera);
      const hit = ray.intersectObjects(model.pickables, true)[0];
      if (!hit) return;
      let o: THREE.Object3D | null = hit.object;
      while (o && !o.userData.spot) o = o.parent;
      return model.spots.find((s) => s.id === o?.userData.spot);
    }
    let down: { x: number; y: number; id: number } | null = null;
    canvas.addEventListener("pointerdown", (e) => { down = { x: e.clientX, y: e.clientY, id: e.pointerId }; }, { signal });
    canvas.addEventListener("pointercancel", () => { down = null; }, { signal });
    canvas.addEventListener("pointerup", (e) => { if (down?.id === e.pointerId && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 5) { const s = pick(e); if (s) inspect(s); } down = null; }, { signal });
    canvas.addEventListener("pointermove", (e) => { canvas.style.cursor = pick(e) ? "pointer" : "grab"; }, { signal });
    canvas.addEventListener("webglcontextlost", (e) => { e.preventDefault(); fatal = true; setRunning(false); $("error").hidden = false; $("error-detail").textContent = tx("图形上下文已中断，请刷新页面。"); }, { signal });
    for (const name of ["wide", "close", "side"] as const) $("view-" + name).addEventListener("click", () => go(model.views[name], name), { signal });
    $("step").addEventListener("click", () => { begin(); step(); }, { signal });
    function restart() { setRunning(false); newRound(); model.game?.reset(); showPhase(0); visualPhase = 0; elapsed = 0; go(model.views.wide, "wide"); }
    $("run").addEventListener("click", () => { if (model.game ? model.game.snapshot().complete : phase === world.phases.length - 1) { newRound(); model.game?.reset(); showPhase(0); } setRunning(!running); }, { signal });
    $("reset").addEventListener("click", restart, { signal });
    $("done-again").addEventListener("click", () => { restart(); canvas.focus({ preventScroll: true }); }, { signal });
    for (const button of root.querySelectorAll<HTMLButtonElement>("[data-phase]")) button.addEventListener("click", () => { if (model.game) return; setRunning(false); begin(); showPhase(Number(button.dataset.phase)); }, { signal });
    if (model.game) for (const action of model.game.actions) {
      const button = document.createElement("button"); button.className = "game-action"; button.id = `game-action-${action.id}`; button.textContent = tx(action.label);
      $("game-controls").append(button);
      button.addEventListener("click", () => play(action.id), { signal });
      own(() => button.remove());
    }
    $("inspector-toggle").addEventListener("click", () => { const open = $("inspector-body").hidden; $("inspector-body").hidden = !open; $("inspector-toggle").textContent = open ? "−" : "+"; $("inspector-toggle").setAttribute("aria-expanded", String(open)); $("inspector-toggle").setAttribute("aria-label", tx(open ? "收起原理面板" : "展开原理面板")); reserveText(); }, { signal });
    for (const name of ["reference", "about"]) {
      const dialog = $<HTMLDialogElement>(name + "-dialog");
      $(name + "-open").addEventListener("click", () => { setRunning(false); keys.clear(); dialog.showModal(); }, { signal });
      dialog.querySelector(".dialog-close")!.addEventListener("click", () => dialog.close(), { signal });
      dialog.addEventListener("click", (e) => { const r = dialog.getBoundingClientRect(); if (e.target === dialog && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)) dialog.close(); }, { signal });
    }
    addEventListener("keydown", (e) => {
      if (paused || fatal || root.querySelector("dialog[open]") || ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName ?? "")) return;
      const key = e.key.toLowerCase();
      if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(key)) { e.preventDefault(); keys.add(key); releaseView(); }
      if (e.code === "Space" && !e.repeat && !["BUTTON", "A"].includes(document.activeElement?.tagName ?? "")) { e.preventDefault(); step(); }
      if (e.key === "Escape") go(model.views.wide, "wide");
    }, { signal });
    addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()), { signal });
    const stop = () => { keys.clear(); setRunning(false); };
    addEventListener("blur", stop, { signal });
    document.addEventListener("visibilitychange", () => {
      // Only time away during a round comes off it; a round starts at the reader's first operation.
      if (document.hidden) { hiddenAt = startedAt ? performance.now() : 0; stop(); } else if (hiddenAt) { idle += performance.now() - hiddenAt; hiddenAt = 0; }
    }, { signal });
    reduced.addEventListener("change", () => { controls.enableDamping = !reduced.matches; if (reduced.matches) { visualPhase = phase; if (flight) go(flight.view, activeView, true); } }, { signal });
    /** The title and the copy take the room of the longest stage's, so what is below them stays where it is. */
    function reserveText() {
      if ($("inspector-body").hidden) return;
      for (const [element, texts] of [[$("inspector-title"), world.phases.map(p => p.title)], [$("inspector-copy"), world.phases.map(p => p.detail)]] as const) {
        const current = element.textContent;
        element.style.minHeight = "";
        let tallest = 0;
        for (const text of texts) { element.textContent = tx(text); tallest = Math.max(tallest, Math.ceil(element.getBoundingClientRect().height)); }
        element.textContent = current; element.style.minHeight = `${tallest}px`;
      }
    }
    function resize() {
      const w = viewport.clientWidth, h = viewport.clientHeight; if (!w || !h) return;
      reserveText();
      camera.aspect = w / h;
      // Match the original plate's cover crop in the tunnel's frame.
      camera.fov = camera.aspect > 1.5 ? THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(Math.PI / 8) * 1.5 / camera.aspect)) : 45;
      camera.updateProjectionMatrix(); renderer.setPixelRatio(Math.min(devicePixelRatio, world.id === "taming-fire" || w < 761 ? 1.25 : 1.5)); renderer.setSize(w, h); composer.setSize(w, h);
      if (paused) renderScene();
    }
    const observer = new ResizeObserver(resize); observer.observe(viewport); own(() => observer.disconnect());
    const point = new THREE.Vector3(), direction = new THREE.Vector3(), right = new THREE.Vector3(), movement = new THREE.Vector3();
    function walk(dt: number) {
      if (!keys.size) return;
      camera.getWorldDirection(direction); direction.y = 0; direction.normalize(); right.crossVectors(direction, camera.up).normalize(); movement.set(0, 0, 0);
      if (keys.has("w") || keys.has("arrowup")) movement.add(direction);
      if (keys.has("s") || keys.has("arrowdown")) movement.sub(direction);
      if (keys.has("a") || keys.has("arrowleft")) movement.sub(right);
      if (keys.has("d") || keys.has("arrowright")) movement.add(right);
      movement.normalize().multiplyScalar(dt * 1.7);
      const next = camera.position.clone().add(movement);
      if (next.length() < 90 && (!model.canMove || model.canMove(next.x, next.z))) { camera.position.copy(next); controls.target.add(movement); }
    }
    let previous = performance.now(), lastHud = 0;
    function frame(time: number) {
      frameId = requestAnimationFrame(frame);
      const dt = Math.min((time - previous) / 1000, .05); previous = time;
      if (paused || fatal || document.hidden) return;
      const dialog = !!root.querySelector("dialog[open]");
      if (!dialog) {
        if (flight) {
          const p = Math.min((time - flight.start) / 1150, 1), t = p * p * (3 - 2 * p);
          camera.position.lerpVectors(flight.from, new THREE.Vector3(...flight.view.position), t); controls.target.lerpVectors(flight.target, new THREE.Vector3(...flight.view.target), t);
          if (p === 1) { const end = flight.end; flight = null; end?.(); }
        }
        walk(dt); controls.update();
        { camera.position.x = THREE.MathUtils.clamp(camera.position.x, -6.4, 6.4); camera.position.z = THREE.MathUtils.clamp(camera.position.z, -4.5, 9); camera.position.y = THREE.MathUtils.clamp(camera.position.y, .8, 5.2); }
        if (running) { sinceStep += dt; if (sinceStep > (model.game ? 1.5 : 3.8)) { if (model.game) { assisted = true; model.game.demo(); showPhase(0); } else step(); } }
        if (!reduced.matches) { elapsed += dt; visualPhase = THREE.MathUtils.damp(visualPhase, phase, 2.2, dt); }
        else visualPhase = phase;
        model.update(visualPhase, elapsed, reduced.matches ? 0 : dt);
        toastTime -= dt; if (toastTime <= 0) $("toast").hidden = true;
      }
      if (time - lastHud > 80) {
        lastHud = time; scene.updateMatrixWorld(true);
        for (const { spot, element } of markerElements) {
          spot.object.getWorldPosition(point).project(camera);
          const x = (point.x + 1) * viewport.clientWidth / 2, y = (1 - point.y) * viewport.clientHeight / 2;
          const panel = viewport.clientWidth > 760 && x > viewport.clientWidth - 340 && y < 570;
          const visible = point.z > -1 && point.z < 1 && x > 20 && x < viewport.clientWidth - 40 && y > 65 && y < viewport.clientHeight - (viewport.clientWidth > 760 ? 115 : 75) && !panel;
          element.classList.toggle("is-visible", visible); element.tabIndex = visible ? 0 : -1; element.style.transform = `translate(${x - 15}px,${y - 15}px)`;
        }
        $("distance").textContent = `${camera.position.distanceTo(controls.target).toFixed(1)}${" m"}`;
        experience.classList.toggle("is-near", camera.position.distanceTo(controls.target) < 5);
      }
      renderScene();
    }
    const initialPhase = studio ? 2 : 0;
    visualPhase = initialPhase; showPhase(initialPhase); go(model.views[embedded ? "painting" : "wide"], embedded ? "painting" : "wide", true); model.update(initialPhase, 0, 0); resize(); renderScene(); $("loading").hidden = true;
    canvas.dataset.scene = world.id;
    if (embedded) {
      experience.classList.add("is-embedded", "is-crossing");
      const tell = (type: SceneEvent) => parent.postMessage({ source: FROM_SCENE, type }, location.origin);
      addEventListener("message", (event) => {
        if (readSceneCommand(event, parent, location.origin) !== "enter" || fatal) return;
        paused = false; previous = performance.now(); experience.classList.remove("is-crossing");
        go(model.views.painting, "painting", true); renderScene(); canvas.focus({ preventScroll: true }); tell("entered");
        go(model.views.wide, "wide");
      }, { signal });
      $("back").addEventListener("click", () => { stop(); experience.classList.add("is-crossing"); go(model.views.painting, "painting", false, () => { paused = true; tell("exit"); }); }, { signal });
      tell("ready");
    }
    frameId = requestAnimationFrame(frame);
  }
}
