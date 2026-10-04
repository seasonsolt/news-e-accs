// Adapted from React Bits ClickSpark (https://reactbits.dev, David Haz), MIT + Commons Clause — see ./LICENSE.
// Eight radial brass strokes on click. DOM + a bounded tween replaces the upstream canvas's always-on
// rAF: nothing runs between clicks. The layer ignores pointer events and the event bubbles normally,
// so validation and form submission never wait for the sparks. Keyboard clicks originate at centre.
import { useEffect, useRef, type ReactNode } from "react";
import { useMotionAllowed } from "../preferences";
import { runFrames } from "../viewport";

export function ClickSpark({ children, className = "" }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const stop = useRef<(() => void) | null>(null);
  const allowed = useMotionAllowed();
  useEffect(() => { if (!allowed) stop.current?.(); return () => stop.current?.(); }, [allowed]);
  return (
    <span className={`flex items-center justify-center ${className}`} onClick={(event) => {
      const layer = ref.current;
      if (!allowed || !layer) return;
      stop.current?.();
      const box = event.currentTarget.getBoundingClientRect();
      const x = event.detail === 0 ? box.width / 2 : event.clientX - box.left;
      const y = event.detail === 0 ? box.height / 2 : event.clientY - box.top;
      stop.current = runFrames(layer, 400, (progress) => {
        const eased = progress * (2 - progress);
        Array.from(layer.children).forEach((child, i) => {
          const spark = child as HTMLElement;
          const angle = 2 * Math.PI * i / 8;
          spark.style.transform = `translate(${x + eased * 22 * Math.cos(angle)}px, ${y + eased * 22 * Math.sin(angle)}px) rotate(${angle}rad) scaleX(${1 - eased})`;
        });
        layer.style.opacity = progress === 1 ? "0" : "1";
      });
    }}>
      {children}
      <span ref={ref} aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-0">
        {Array.from({ length: 8 }, (_, i) => <span key={i} className="absolute left-0 top-0 h-px w-2 origin-left bg-amber" />)}
      </span>
    </span>
  );
}
