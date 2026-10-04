// Adapted from React Bits Magnet (https://reactbits.dev, David Haz), MIT + Commons Clause — see ./LICENSE.
// A local hit area, not a global cursor follower. Only the button's inner content moves, at most 6px;
// the hit target and focus ring stay where they were. Touch, keyboard and reduced motion stay still.
import { useEffect, useRef, type ReactNode } from "react";
import { hasFinePointer, useMotionAllowed } from "../preferences";

export function Magnet({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLSpanElement>(null);
  const allowed = useMotionAllowed();
  function reset() { if (ref.current) ref.current.style.transform = "none"; }
  useEffect(() => { if (!allowed) reset(); }, [allowed]);
  return (
    <span className="flex size-full items-center justify-center" onPointerLeave={reset}
      onPointerMove={(event) => {
        if (!allowed || !hasFinePointer() || !ref.current) return;
        const box = event.currentTarget.getBoundingClientRect();
        const x = event.clientX - box.left - box.width / 2;
        const y = event.clientY - box.top - box.height / 2;
        const scale = Math.min(0.25, 6 / (Math.hypot(x, y) || 1));
        ref.current.style.transform = `translate(${x * scale}px, ${y * scale}px)`;
      }}>
      <span ref={ref} className="flex items-center justify-center transition-transform duration-300">{children}</span>
    </span>
  );
}
