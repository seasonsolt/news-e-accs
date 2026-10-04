// Adapted from React Bits TearTicket (https://reactbits.dev, David Haz), MIT + Commons Clause — see ./LICENSE.
// A single-use newsletter receipt: keep the paper and its dimensions, trim the upstream physics,
// tilt, global pointer tracking and recentering. Pointer events bend only the decorative stub; a
// bounded drop owns frames only after a tear. The real button swaps its one text node immediately,
// also under reduction. Date is supplied by the owner so SSR/hydration share the same issue stamp.
import { useEffect, useRef, useState, type PointerEvent } from "react";
import { useMotionAllowed } from "../preferences";
import { runFrames } from "../viewport";

export function TearTicket({ date }: { date: string }) {
  const allowed = useMotionAllowed();
  const root = useRef<HTMLDivElement>(null);
  const stub = useRef<HTMLSpanElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const stop = useRef<(() => void) | null>(null);
  const used = useRef(false);
  const drag = useRef<{ id: number; x: number; y: number; dx: number; dy: number } | null>(null);
  const suppressClick = useRef(false);
  const [torn, setTorn] = useState(false);
  const [held, setHeld] = useState(false);

  function release() {
    const id = drag.current?.id;
    drag.current = null;
    if (id !== undefined && button.current?.hasPointerCapture(id)) button.current.releasePointerCapture(id);
    setHeld(false);
  }
  function reset() {
    release();
    if (stub.current) { stub.current.style.opacity = "0"; stub.current.style.transform = ""; }
  }
  function tear() {
    if (used.current) return;
    used.current = true;
    const dx = drag.current?.dx ?? 0;
    const dy = drag.current?.dy ?? 0;
    release();
    setTorn(true);
    const layer = stub.current;
    if (!allowed || !layer || !root.current) return reset();
    stop.current = runFrames(root.current, 520, (progress) => {
      layer.style.transform = `translate(${dx + progress * 22}px, ${dy + progress * progress * 88}px) rotate(${progress * 18}deg)`;
      layer.style.opacity = String(1 - progress);
      if (progress === 1) layer.style.transform = "";
    });
  }
  useEffect(() => {
    if (!allowed) { stop.current?.(); reset(); }
    return () => stop.current?.();
  }, [allowed]);
  // A held pointer has no clock. Cancel its decoration if the tab or receipt disappears, too.
  useEffect(() => {
    if (!held || !root.current) return;
    const onVisibility = () => { if (document.hidden) reset(); };
    const observer = window.IntersectionObserver ? new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) reset();
    }) : null;
    observer?.observe(root.current);
    document.addEventListener("visibilitychange", onVisibility);
    return () => { observer?.disconnect(); document.removeEventListener("visibilitychange", onVisibility); };
  }, [held]);

  function move(event: PointerEvent<HTMLButtonElement>) {
    const point = drag.current;
    if (!point || point.id !== event.pointerId) return;
    point.dx = event.clientX - point.x;
    point.dy = event.clientY - point.y;
    const distance = Math.hypot(point.dx, point.dy);
    if (distance > 5) suppressClick.current = true;
    if (distance >= 38) return tear();
    if (allowed && stub.current) {
      stub.current.style.opacity = "1";
      stub.current.style.transform = `translate(${point.dx * 0.45}px, ${point.dy * 0.45}px) rotate(${point.dy * 0.25}deg)`;
    }
  }
  return (
    <div ref={root} data-subscription-ticket="" data-torn={torn || undefined} className="subscription-ticket grid w-full max-w-md grid-cols-[minmax(0,1fr)_96px] rounded-control border border-amber p-1 text-left text-ink shadow-soft">
      <div className="min-w-0 px-3 py-3">
        <p className="text-[13px] font-semibold tracking-wide text-accent-ink">e/acc 日报 · 订阅凭证</p>
        <p className="mono mt-2 text-[14px]">每天 08:00</p>
        <time dateTime={date} className="mono mt-1 block text-[11px] text-ink-3">{date}</time>
      </div>
      <div className="relative border-l-2 border-dashed border-amber/60">
        <button ref={button} type="button" disabled={torn} aria-label={torn ? "票根已撕下" : "撕下票根"}
          onPointerDown={(event) => {
            if (used.current || event.button !== 0 || drag.current) return;
            suppressClick.current = false;
            drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, dx: 0, dy: 0 };
            event.currentTarget.setPointerCapture(event.pointerId);
            setHeld(true);
          }}
          onPointerMove={move}
          onPointerUp={() => { if (!used.current) reset(); }}
          onPointerCancel={() => { suppressClick.current = true; reset(); }}
          onLostPointerCapture={() => { if (drag.current) reset(); }}
          onClick={(event) => { if (event.detail === 0 || !suppressClick.current) tear(); }}
          className="flex h-full min-h-24 w-full touch-none select-none items-center justify-center rounded-control px-2 text-center text-[12px] font-semibold text-accent-ink disabled:text-ink-2">
          <span role="status">{torn ? "明早 8 点见" : "撕下票根"}</span>
        </button>
        <span ref={stub} aria-hidden="true" data-stub="撕下票根" className="ticket-stub pointer-events-none absolute inset-0 flex origin-top-left items-center justify-center rounded-control px-2 text-center text-[12px] font-semibold text-accent-ink opacity-0 before:content-[attr(data-stub)]" />
      </div>
    </div>
  );
}
