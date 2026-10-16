import { Text, useTranslate } from "../../lib/i18n";
// Gate for the voyage: the flat observatory stays in the document, and this layer covers it only
// when 3D is actually running. The script that draws the scene is loaded then, not with the page.
import { Component, lazy, Suspense, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { fromAxis, timeLabel, type ChronicleEra, type ChronicleMetric, type ChronicleMilestone } from "@aihot/contracts/chronicle";
import { recordEngagement } from "../../lib/engagement";
import { KEYS, readRaw, writeRaw } from "../../lib/local-state";
import { useMotionAllowed } from "../motion/preferences";
import { Cockpit } from "./Cockpit";
import { decideCosmos3d, readCosmosEnvironment } from "./cosmos-mode";
import { distanceLabel, focusAt, stepEra, stepPicture } from "./format";
import { flightCoordinate, flightTime } from "./flight";
import { MilestoneCard } from "./MilestoneCard";

const Cosmos3D = lazy(() => import("./Cosmos3D.tsx"));

class CosmosBoundary extends Component<{ onFail: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError(): { failed: boolean } { return { failed: true }; }
  componentDidCatch(error: Error): void {
    console.error("cosmos boundary", error);
    this.props.onFail();
  }
  render(): ReactNode { return this.state.failed ? null : this.props.children; }
}

export function CosmosStage({ active, onActive, eras, milestones, metrics, era, t, now, onMove, onCommit }: {
  active: boolean;
  onActive: (next: boolean) => void;
  eras: ChronicleEra[];
  milestones: ChronicleMilestone[];
  metrics: ChronicleMetric[];
  era: ChronicleEra;
  t: number;
  now: number;
  onMove: (t: number) => void;
  onCommit: (t: number) => void;
}) {
  const tx = useTranslate();
  const motion = useMotionAllowed();
  const [support, setSupport] = useState<"pending" | "on" | "off">("pending");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hover, setHover] = useState<{ title: string; x: number; y: number } | null>(null);
  const [running, setRunning] = useState(true);
  const stage = useRef<HTMLDivElement>(null);
  const dragged = useRef(false);
  const drag = useRef<{ x: number; y: number; u: number; moved: boolean; id: number; last?: number } | null>(null);
  const live = useRef({ t, eras, milestones, now, onMove, onCommit });
  live.current = { t, eras, milestones, now, onMove, onCommit };
  const sawMotion = useRef(false);
  const wheelTimer = useRef(0);

  useEffect(() => {
    const decision = decideCosmos3d(readCosmosEnvironment(true));
    setSupport(decision.allowed ? "on" : "off");
    if (!decision.allowed) return;
    const saved = readRaw(KEYS.cosmos);
    if (saved === "2d") return;
    if (saved === "3d" || decision.defaultOn) onActive(true);
  }, [onActive]);

  // The hydration snapshot of the motion preference is "reduce", which is not the reader's setting.
  // Ignore that first value; a later change to reduce leaves the voyage.
  useEffect(() => {
    if (!sawMotion.current) {
      if (motion) sawMotion.current = true;
      return;
    }
    if (!motion) {
      onActive(false);
      setSupport("off");
    }
  }, [motion, onActive]);

  useEffect(() => { if (active) recordEngagement("enter_3d"); }, [active]);

  useEffect(() => {
    const element = stage.current;
    if (!element || !active) return;
    const observer = new IntersectionObserver(([entry]) => { setRunning(!!entry?.isIntersecting); });
    observer.observe(element);
    const onWheel = (event: WheelEvent) => {
      if ((event.target as HTMLElement | null)?.closest(".cosmos-card")) return;
      event.preventDefault();
      const box = element.getBoundingClientRect();
      const units = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? box.height : 1;
      const current = live.current;
      const u = flightCoordinate(current.t, current.eras, current.now);
      const next = flightTime(Math.min(1, Math.max(0, u + (event.deltaY * units) / 1800)), current.eras, current.now);
      current.onMove(next);
      window.clearTimeout(wheelTimer.current);
      wheelTimer.current = window.setTimeout(() => live.current.onCommit(live.current.t), 140);
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      observer.disconnect();
      element.removeEventListener("wheel", onWheel);
      window.clearTimeout(wheelTimer.current);
    };
  }, [active]);

  const selected = milestones.find((milestone) => milestone.id === selectedId) ?? null;
  useEffect(() => {
    if (!selected) return;
    const span = Math.abs(flightCoordinate(selected.t, eras, now) - flightCoordinate(t, eras, now));
    if (span > 0.002) setSelectedId(null);
  }, [selected, t, eras, now]);

  const choose = (next: "2d" | "3d") => {
    if (next === "3d" && support !== "on") return;
    writeRaw(KEYS.cosmos, next);
    onActive(next === "3d");
  };
  const fail = () => {
    writeRaw(KEYS.cosmos, "2d");
    setSupport("off");
    onActive(false);
  };
  const pick = (id: string) => {
    const milestone = milestones.find((item) => item.id === id);
    if (!milestone) return;
    recordEngagement("click_star", milestone.id);
    setSelectedId(milestone.id);
    onCommit(milestone.t);
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    if ((event.target as HTMLElement).closest("button, a, article")) return;
    window.clearTimeout(wheelTimer.current);
    const current = live.current;
    drag.current = { x: event.clientX, y: event.clientY, u: flightCoordinate(current.t, current.eras, current.now), moved: false, id: event.pointerId };
    dragged.current = false;
    event.currentTarget.focus({ preventScroll: true });
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = drag.current;
    if (!gesture || event.pointerId !== gesture.id) return;
    const dx = event.clientX - gesture.x;
    const dy = event.clientY - gesture.y;
    if (!gesture.moved && Math.hypot(dx, dy) < 4) return;
    if (!gesture.moved) {
      gesture.moved = true;
      dragged.current = true;
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    const next = flightTime(Math.min(1, Math.max(0, gesture.u - dx / event.currentTarget.clientWidth * 0.55)), live.current.eras, live.current.now);
    gesture.last = next;
    live.current.onMove(next);
  };
  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = drag.current;
    if (!gesture || event.pointerId !== gesture.id) return;
    drag.current = null;
    if (gesture.moved && gesture.last !== undefined) live.current.onCommit(gesture.last);
  };
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const current = live.current;
    let next: number | null = null;
    if (event.key === "ArrowLeft" || event.key === "ArrowDown") next = stepPicture(current.eras, current.milestones, current.t, -1);
    else if (event.key === "ArrowRight" || event.key === "ArrowUp") next = stepPicture(current.eras, current.milestones, current.t, 1);
    else if (event.key === "PageUp") next = stepEra(current.eras, current.t, -1);
    else if (event.key === "PageDown") next = stepEra(current.eras, current.t, 1);
    else if (event.key === "Home") next = fromAxis(0, current.now);
    else if (event.key === "End") next = current.now;
    else return;
    event.preventDefault();
    current.onCommit(next);
  };

  const focus = focusAt(milestones, t, now);
  const label = tx(focus ? timeLabel(focus.t, now, focus.precision, focus.date) : timeLabel(t, now));
  const hovered = (hit: { id: string; x: number; y: number } | null) => {
    if (!hit || !stage.current) { setHover(null); return; }
    const milestone = milestones.find((item) => item.id === hit.id);
    if (!milestone) { setHover(null); return; }
    const box = stage.current.getBoundingClientRect();
    setHover({ title: milestone.title, x: hit.x - box.left, y: hit.y - box.top });
  };

  return (
    <>
      <div className="cosmos-toggle" role="group" aria-label={tx("时间轴视图")}>
        <button type="button" aria-pressed={!active} onClick={() => choose("2d")}><Text value="平面" /></button>
        <button type="button" aria-pressed={active} disabled={support !== "on"} title={support === "off" ? tx("这台设备不支持三维航行") : undefined} onClick={() => choose("3d")}><Text value="三维" /></button>
      </div>
      {active && (
        <div
          ref={stage}
          className="observatory-cosmos"
          tabIndex={0}
          data-hover={hover ? "" : undefined}
          aria-label={tx("滚轮飞行 · 拖动平移 · 方向键切换画面")}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onKeyDown={onKeyDown}
        >
          <CosmosBoundary onFail={fail}>
            <Suspense fallback={null}>
              <Cosmos3D
                eras={eras}
                milestones={milestones}
                t={t}
                now={now}
                eraId={era.id}
                forecastLabel={tx("推演")}
                running={running}
                onPick={pick}
                onHover={hovered}
                onFail={fail}
                dragged={dragged}
              />
            </Suspense>
          </CosmosBoundary>
          <div className="cosmos-hud">
            <p className="cosmos-hud-kicker">
              <span><Text value="加速史" /></span>
              <span aria-hidden="true">·</span>
              <span><Text value="三维航行" /></span>
              <span aria-hidden="true">·</span>
              <span>{tx(distanceLabel(t, now))}</span>
            </p>
            <p className="cosmos-hud-time">{label}</p>
            <p className="cosmos-hud-era">{focus ? focus.title : era.title}</p>
            {era.forecast && <p className="cosmos-hud-forecast"><Text value="推演：公开预测与情景推演，年份不是确定的实现日期。" /></p>}
            <p className="cosmos-hud-hint"><Text value="滚轮飞行 · 拖动平移 · 方向键切换画面" /></p>
          </div>
          <Cockpit metrics={metrics} t={t} now={now} />
          {hover && <div className="cosmos-hover" style={{ left: hover.x, top: hover.y }}>{hover.title}</div>}
          {selected && <MilestoneCard milestone={selected} now={now} onClose={() => setSelectedId(null)} />}
        </div>
      )}
    </>
  );
}
