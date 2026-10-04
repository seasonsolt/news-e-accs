// Adapted from React Bits GlareHover (https://reactbits.dev, David Haz), MIT + Commons Clause — see ./LICENSE.
// A very faint brass reflection confined to the podium card, not a page-wide cursor effect. No new
// layout wrapper: this aria-hidden layer listens to its existing parent link and never intercepts
// focus or clicks. Only fine hover pointers activate it; reduction clears it immediately.
import { useEffect, useRef } from "react";
import { hasFinePointer, useMotionAllowed } from "../preferences";

export function GlareHover() {
  const ref = useRef<HTMLSpanElement>(null);
  const allowed = useMotionAllowed();
  useEffect(() => {
    const layer = ref.current;
    const card = layer?.parentElement;
    if (!layer || !card) return;
    layer.style.opacity = "0";
    if (!allowed) return;
    const move = (event: PointerEvent) => {
      if (!hasFinePointer()) return;
      const box = card.getBoundingClientRect();
      layer.style.backgroundPosition = `${(event.clientX - box.left) / box.width * 100}% ${(event.clientY - box.top) / box.height * 100}%`;
      layer.style.opacity = "1";
    };
    const leave = () => { layer.style.opacity = "0"; };
    card.addEventListener("pointermove", move);
    card.addEventListener("pointerleave", leave);
    return () => { card.removeEventListener("pointermove", move); card.removeEventListener("pointerleave", leave); leave(); };
  }, [allowed]);
  return <span ref={ref} aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-0 transition-opacity duration-300"
    style={{ backgroundImage: "radial-gradient(ellipse, color-mix(in srgb, var(--amber) 9%, transparent), transparent 65%)", backgroundSize: "200% 200%" }} />;
}
