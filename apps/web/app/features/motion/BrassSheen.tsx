// The engraving stays real DOM text; a transparent brass gradient crosses a decorative pseudo-
// element once after load, or on deliberate fine-pointer hover. CSS-sized text, not MetallicPaint
// WebGL: no canvas, texture upload, shader loop or extra dependency on the mobile home critical path.
import { useEffect, useRef } from "react";
import { hasFinePointer, useMotionAllowed } from "./preferences";
import { isInViewport } from "./viewport";

export function BrassSheen({ text, visible = true }: { text: string; visible?: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  const allowed = useMotionAllowed();
  const animation = useRef<Animation | null>(null);
  const played = useRef(false);
  function sweep() {
    const element = ref.current;
    if (!allowed || !element || !isInViewport(element) || document.hidden) return;
    animation.current?.cancel();
    animation.current = element.animate([
      { backgroundPosition: "100% 0" }, { backgroundPosition: "0% 0" },
    ], { duration: 900, easing: "ease-out", pseudoElement: "::before" });
  }
  useEffect(() => {
    if (!allowed || !visible) { animation.current?.cancel(); return; }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const loaded = () => {
      timer = setTimeout(() => {
        if (played.current) return;
        played.current = true;
        sweep();
      }, 300);
    };
    if (document.readyState === "complete") loaded();
    else window.addEventListener("load", loaded, { once: true });
    return () => { clearTimeout(timer); window.removeEventListener("load", loaded); animation.current?.cancel(); };
  }, [allowed, visible]);
  return (
    <span className="relative inline-block" onPointerEnter={() => { if (hasFinePointer()) sweep(); }}>
      {text}
      <span ref={ref} aria-hidden="true" data-text={text}
        className="pointer-events-none absolute inset-0 before:block before:bg-clip-text before:text-transparent before:content-[attr(data-text)] before:bg-[linear-gradient(105deg,transparent_42%,var(--amber)_49%,var(--accent-ink)_51%,transparent_58%)] before:bg-[length:300%_100%] before:bg-[position:100%_0]" />
    </span>
  );
}
