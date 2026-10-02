// Reading progress for long pages (an item's body, a report): a brass line across the top with a small
// gear rolling along it, turned by the distance it travels, as a pinion on a rack would be.
import { useEffect, useRef } from "react";

/** The gear's diameter in px: its rotation is the distance rolled over this circumference. */
const GEAR = 20;

export function ReadingGear() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const el = ref.current;
      if (!el) return;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const p = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      const travel = p * (window.innerWidth - GEAR);
      el.style.setProperty("--read", String(p));
      el.style.setProperty("--gear-x", `${travel}px`);
      el.style.setProperty("--gear-turn", `${(travel / (Math.PI * GEAR)) * 360}deg`);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, []);
  return (
    <div ref={ref} className="reading-gear" aria-hidden="true">
      <div className="reading-gear-bar" />
      <svg viewBox="0 0 24 24" className="reading-gear-wheel" style={{ width: GEAR, height: GEAR }}>
        {/* circumference 2π·9.6 ≈ 60.3: a 3.016 dash and gap give ten even teeth (as components/Logo.tsx) */}
        <circle cx="12" cy="12" r="9.6" fill="none" stroke="currentColor" strokeWidth="3.2" strokeDasharray="3.016 3.016" />
        <circle cx="12" cy="12" r="6.6" fill="var(--bg)" stroke="currentColor" strokeWidth="3" />
        <circle cx="12" cy="12" r="2.4" fill="currentColor" />
      </svg>
    </div>
  );
}
