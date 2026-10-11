import { Text, useLocale, useTranslate } from "../../lib/i18n";
// The four-dimensional log axis: eras are bands, milestones are ticks (dashed when forecast).
// Wheel or pinch zooms around the pointer; horizontal or shift+wheel pans the visible window.
// Drag or click positions the needle, with clicks snapping to nearby milestones. Arrow keys step
// through every era plate and illustrated milestone; PageUp/PageDown jump between eras.
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { axisTicks, fromAxis, timeLabel, toAxis, type ChronicleEra, type ChronicleMilestone } from "@aihot/contracts/chronicle";

import { useMotionAllowed } from "../motion/preferences";
import { compactTick, keepAxisInView, panAxisWindow, projectAxis, stepEra, stepPicture, zoomAxisWindow, type AxisWindow } from "./format";

const SNAP_PX = 8;

export function ChronicleAxis({ eras, milestones, now, t, onMove, onCommit }: {
  eras: ChronicleEra[];
  milestones: ChronicleMilestone[];
  now: number;
  t: number;
  /** While dragging: the needle follows. */
  onMove: (t: number) => void;
  /** On release (or a key, a click): the moment is settled and goes into the address. */
  onCommit: (t: number) => void;
}) {
  const tx = useTranslate();
  const locale = useLocale();
  const allowed = useMotionAllowed();
  const [dragging, setDragging] = useState(false);
  const [view, setView] = useState<AxisWindow>({ lo: 0, hi: 1 });
  const track = useRef<HTMLDivElement>(null);
  const drag = useRef<{ startX: number; moved: boolean } | null>(null);
  const u = toAxis(t, now);
  const nowU = toAxis(now, now);
  const span = view.hi - view.lo;
  const zoomed = span < 1;

  // Follow changes of moment, but let wheel gestures explore away from the needle.
  useEffect(() => { setView((current) => keepAxisInView(current, u)); }, [u]);
  useEffect(() => {
    const element = track.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const box = element.getBoundingClientRect();
      const units = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? box.width : 1;
      const dx = e.deltaX * units;
      const dy = e.deltaY * units;
      const position = Math.min(1, Math.max(0, (e.clientX - box.left) / box.width));
      setView((current) => {
        if (!e.ctrlKey && (e.shiftKey || Math.abs(dx) > Math.abs(dy))) {
          const delta = e.shiftKey && Math.abs(dy) > Math.abs(dx) ? dy : dx;
          return panAxisWindow(current, delta / box.width * (current.hi - current.lo));
        }
        const anchor = current.lo + position * (current.hi - current.lo);
        return zoomAxisWindow(current, anchor, Math.exp(-dy / 400));
      });
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, []);

  const resetZoom = () => setView({ lo: 0, hi: 1 });
  const at = (clientX: number) => {
    const box = track.current!.getBoundingClientRect();
    const position = Math.min(1, Math.max(0, (clientX - box.left) / box.width));
    return { u: view.lo + position * span, width: box.width };
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { startX: e.clientX, moved: false };
    setDragging(true);
    onMove(fromAxis(at(e.clientX).u, now));
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    if (Math.abs(e.clientX - drag.current.startX) > 3) drag.current.moved = true;
    onMove(fromAxis(at(e.clientX).u, now));
  };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const { moved } = drag.current;
    drag.current = null;
    setDragging(false);
    const pos = at(e.clientX);
    let next = fromAxis(pos.u, now);
    if (!moved) {
      // A click means "this one": the nearest milestone within a few pixels.
      let best: { m: ChronicleMilestone; d: number } | null = null;
      for (const m of milestones) {
        const mu = toAxis(m.t, now);
        if (mu < view.lo || mu > view.hi) continue;
        const d = Math.abs(mu - pos.u) / span * pos.width;
        if (d <= SNAP_PX && (!best || d < best.d)) best = { m, d };
      }
      if (best) next = best.m.t;
    }
    onCommit(next);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") onCommit(stepPicture(eras, milestones, t, -1));
    else if (e.key === "ArrowRight" || e.key === "ArrowUp") onCommit(stepPicture(eras, milestones, t, 1));
    else if (e.key === "PageUp") onCommit(stepEra(eras, t, -1));
    else if (e.key === "PageDown") onCommit(stepEra(eras, t, 1));
    else if (e.key === "Home") onCommit(fromAxis(0, now));
    else if (e.key === "End") onCommit(now);
    else return;
    e.preventDefault();
  };

  return (
    <div className="chronicle-axis select-none">
      <div
        ref={track}
        role="slider"
        tabIndex={0}
        aria-label={tx("时间轴（对数刻度）")}
        aria-valuemin={0}
        aria-valuemax={1000}
        aria-valuenow={Math.round(u * 1000)}
        aria-valuetext={tx(timeLabel(t, now))}
        className={`chronicle-track ${allowed ? "motion-allowed" : ""}`}
        data-dragging={dragging || undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => { drag.current = null; setDragging(false); }}
        onKeyDown={onKeyDown}
        onDoubleClick={resetZoom}
      >
        {eras.map((era, i) => {
          const from = Math.max(view.lo, toAxis(era.from, now));
          const to = Math.min(view.hi, i + 1 < eras.length ? toAxis(eras[i + 1]!.from, now) : 1);
          if (to <= from) return null;
          return (
            <span
              key={era.id}
              className={`chronicle-band ${i % 2 ? "is-odd" : ""} ${era.forecast ? "is-forecast" : ""} ${era.from <= t && t < (eras[i + 1]?.from ?? Infinity) ? "is-current" : ""}`}
              style={{ left: `${projectAxis(from, view) * 100}%`, width: `${(to - from) / span * 100}%` }}
              title={era.title}
            >
              {/* Named where the visible band is wide enough to carry it; the rest keep their title tooltip. */}
              {(to - from) / span > 0.05 && <span className="chronicle-band-label">{era.title}</span>}
            </span>
          );
        })}
        {milestones.map((m) => {
          const mu = toAxis(m.t, now);
          if (mu < view.lo || mu > view.hi) return null;
          return (
            <span
              key={m.id}
              className={`chronicle-tick cat-${m.category} ${m.forecast ? "is-forecast" : ""}`}
              style={{ left: `${projectAxis(mu, view) * 100}%` }}
            />
          );
        })}
        {nowU >= view.lo && nowU <= view.hi && (
          <span className="chronicle-now" style={{ left: `${projectAxis(nowU, view) * 100}%` }} aria-hidden="true">
            <span><Text value="现在" /></span>
          </span>
        )}
        {u >= view.lo && u <= view.hi && <span className="chronicle-needle" style={{ left: `${projectAxis(u, view) * 100}%` }} aria-hidden="true" />}
      </div>
      <div className="chronicle-scale" data-zoomed={zoomed || undefined} aria-hidden="true">
        {axisTicks(now).map(([tt, label], i) => {
          const tickU = toAxis(tt, now);
          return (
            // Narrow tracks keep the edges and present moment, with enough room between the labels.
            <span key={label} hidden={tickU < view.lo || tickU > view.hi} data-tick-index={i} style={{ left: `${projectAxis(tickU, view) * 100}%` }}>
              {locale === "en" ? compactTick(label) : label}
            </span>
          );
        })}
      </div>
      {zoomed && (
        <div className="chronicle-zoom">
          <span>×{Number((1 / span).toFixed(1))}</span>
          <button type="button" onClick={resetZoom}><Text value="重置缩放" /></button>
        </div>
      )}
    </div>
  );
}
