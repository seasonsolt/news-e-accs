// The reading backdrop: the engine-hall engraving (public/media/art, made by tools/make-art.sh) fixed
// behind the feed, visible in the margins and faded out under the reading column. It drifts slowly
// and moves a little against the scroll, so the page feels like a hall seen from a moving gallery.
// Decoration only: still under prefers-reduced-motion, hidden from assistive technology.
import { useEffect, useRef } from "react";
import { useMotionAllowed } from "../motion/preferences";

/** How far the backdrop moves per pixel scrolled (negative: against the scroll). */
const PARALLAX = -0.06;

export function AmbientBackdrop() {
  const ref = useRef<HTMLDivElement>(null);
  const motionAllowed = useMotionAllowed();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!motionAllowed) {
      el.style.setProperty("--ambient-shift", "0px");
      return;
    }
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        el.style.setProperty("--ambient-shift", `${Math.min(window.scrollY, 5000) * PARALLAX}px`);
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, [motionAllowed]);

  return (
    <div className="ambient-backdrop" aria-hidden="true">
      <div ref={ref} className="ambient-backdrop-image" />
    </div>
  );
}
