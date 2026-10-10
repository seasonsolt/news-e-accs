import { Text, useLocale, useTranslate } from "../../lib/i18n";
// The four-dimensional axis: the Big Bang at the left, the far future at the right, every power of ten
// of distance from now the same width. Eras are bands, milestones are ticks (dashed when forecast);
// drag, click, wheel or the arrow keys move the needle. A click lands on the nearest milestone.
import { useRef, useState, type KeyboardEvent, type PointerEvent, type WheelEvent } from "react";
import { axisTicks, fromAxis, timeLabel, toAxis, type ChronicleEra, type ChronicleMilestone } from "@aihot/contracts/chronicle";

import { useMotionAllowed } from "../motion/preferences";
import { compactTick, stepEra } from "./format";

const SNAP_PX = 8;

export function ChronicleAxis({ eras, milestones, now, t, onMove, onCommit }: {
  eras: ChronicleEra[];
  milestones: ChronicleMilestone[];
  now: number;
  t: number;
  /** While dragging: the needle follows. */
  onMove: (t: number) => void;
  /** On release (or a key, a click, the wheel): the moment is settled and goes into the address. */
  onCommit: (t: number) => void;
}) {
  const tx = useTranslate();
  const locale = useLocale();
  const allowed = useMotionAllowed();
  const [dragging, setDragging] = useState(false);
  const track = useRef<HTMLDivElement>(null);
  const drag = useRef<{ startX: number; moved: boolean } | null>(null);
  const u = toAxis(t, now);
  const nowU = toAxis(now, now);

  const at = (clientX: number) => {
    const box = track.current!.getBoundingClientRect();
    return { u: (clientX - box.left) / box.width, width: box.width };
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
        const d = Math.abs(toAxis(m.t, now) - pos.u) * pos.width;
        if (d <= SNAP_PX && (!best || d < best.d)) best = { m, d };
      }
      if (best) next = best.m.t;
    }
    onCommit(next);
  };

  const nudge = (du: number) => onCommit(fromAxis(Math.min(1, Math.max(0, u + du)), now));
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") onCommit(stepEra(eras, t, -1));
    else if (e.key === "ArrowRight" || e.key === "ArrowUp") onCommit(stepEra(eras, t, 1));
    else if (e.key === "Home") onCommit(fromAxis(0, now));
    else if (e.key === "End") onCommit(now);
    else return;
    e.preventDefault();
  };
  const onWheel = (e: WheelEvent<HTMLDivElement>) => {
    const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : 0;
    if (d) nudge(d / 4000);
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
        onWheel={onWheel}
      >
        {eras.map((era, i) => {
          const from = toAxis(era.from, now);
          const to = i + 1 < eras.length ? toAxis(eras[i + 1]!.from, now) : 1;
          return (
            <span
              key={era.id}
              className={`chronicle-band ${i % 2 ? "is-odd" : ""} ${era.forecast ? "is-forecast" : ""} ${era.from <= t && t < (eras[i + 1]?.from ?? Infinity) ? "is-current" : ""}`}
              style={{ left: `${from * 100}%`, width: `${Math.max(0, to - from) * 100}%` }}
              title={era.title}
            >
              {/* Named where the band is wide enough to carry it; the rest keep their title tooltip. */}
              {to - from > 0.05 && <span className="chronicle-band-label">{era.title}</span>}
            </span>
          );
        })}
        {milestones.map((m) => (
          <span
            key={m.id}
            className={`chronicle-tick cat-${m.category} ${m.forecast ? "is-forecast" : ""}`}
            style={{ left: `${toAxis(m.t, now) * 100}%` }}
          />
        ))}
        <span className="chronicle-now" style={{ left: `${nowU * 100}%` }} aria-hidden="true">
          <span><Text value="现在" /></span>
        </span>
        <span className="chronicle-needle" style={{ left: `${u * 100}%` }} aria-hidden="true" />
      </div>
      <div className="chronicle-scale" aria-hidden="true">
        {axisTicks(now).map(([tt, label], i) => (
          // Every other label on phones, where they would collide.
          <span key={label} className={i % 2 ? "max-sm:hidden" : undefined} style={{ left: `${toAxis(tt, now) * 100}%` }}>
            {locale === "en" ? compactTick(label) : label}
          </span>
        ))}
      </div>
    </div>
  );
}
