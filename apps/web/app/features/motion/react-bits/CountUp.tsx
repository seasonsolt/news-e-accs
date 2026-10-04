// Adapted from React Bits CountUp (https://reactbits.dev, David Haz), MIT + Commons Clause — see ./LICENSE.
// SSR and hydration always show the final score. Only a client view switch or a proven below-fold
// first reveal may start a finite 600ms count. Tabular digits reserve width without duplicate text.
// Leaving the viewport, reduced motion or unmount settles the single text node to its final value.
import { useEffect, useRef } from "react";
import { useMotionAllowed } from "../preferences";
import { runFrames, useInViewOnce } from "../viewport";

export function CountUp({ value, from = 0, decimals = 1, viewSwitch = false, animateOnReveal = true, delay = 0 }: { value: number; from?: number; decimals?: number; viewSwitch?: boolean; animateOnReveal?: boolean; delay?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const played = useRef(false);
  const allowed = useMotionAllowed();
  const seen = useInViewOnce(ref, { enabled: allowed && (viewSwitch || animateOnReveal), skipInitial: !viewSwitch });
  const final = value.toFixed(decimals);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.textContent = final;
    if (!allowed || !seen || !ref.current || played.current) return;
    played.current = true;
    return runFrames(ref.current, 600, (progress) => {
      element.textContent = (from + (value - from) * (1 - (1 - progress) ** 3)).toFixed(decimals);
    }, delay);
  }, [allowed, seen, value, from, decimals, final, delay]);
  return <span ref={ref} className="inline-block text-right tabular-nums" style={{ minWidth: `${final.length}ch` }}>{final}</span>;
}
