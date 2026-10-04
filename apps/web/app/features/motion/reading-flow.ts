// Reading-flow decoration is finite and belongs to a change, never to an idle page. SSR lists
// remain final; arrival eligibility is supplied only by the code that merges a client response.
// A paused Web Animation lets runFrames own its clock and settle it on viewport/tab exit, without
// replacing CSS animations on children (banner drift, gauges and card hover remain their owners).
import { useEffect, useRef, type RefObject } from "react";
import { useMotionAllowed } from "./preferences.ts";
import { runFrames, useInViewOnce } from "./viewport.ts";

// A clipped feed may supply its stationary frame: its own printing mask is not a viewport exit.
export function animateReadingChange(element: HTMLElement, frames: Keyframe[], duration: number, delay = 0, visibilityElement: Element = element) {
  if (!element.animate) return () => {};
  const animation = element.animate(frames, { duration, fill: "both", easing: "cubic-bezier(0.25, 1, 0.5, 1)" });
  animation.pause();
  return runFrames(visibilityElement, duration, (progress) => {
    animation.currentTime = progress * duration;
    if (progress === 1) animation.cancel();
  }, delay);
}

export function addedCardKeys(before: readonly { key: string }[], after: readonly { key: string }[]) {
  const known = new Set(before.map((card) => card.key));
  return new Set(after.filter((card) => !known.has(card.key)).map((card) => card.key));
}

export function useCardArrival(ref: RefObject<HTMLElement | null>, arrived: boolean, delay: number) {
  const allowed = useMotionAllowed();
  const seen = useInViewOnce(ref, { enabled: allowed && arrived });
  const played = useRef(false);
  useEffect(() => {
    if (!allowed || !arrived || !seen || played.current || !ref.current) return;
    played.current = true;
    return animateReadingChange(ref.current, [
      { opacity: 0, transform: "translateY(7px)" }, { opacity: 1, transform: "none" },
    ], 300, delay);
  }, [allowed, arrived, seen, ref, delay]);
}

// The mask never reserves space or duplicates content. A square 8px cell is fully covered at its
// half-diagonal (sqrt(32)); remove the mask at completion to avoid leaving a permanent paint layer.
export function printHalftone(element: HTMLElement) {
  return runFrames(element, 700, (progress) => {
    const mask = progress === 1 ? "" : `radial-gradient(circle, #000 ${(5.66 * (1 - (1 - progress) ** 3)).toFixed(2)}px, transparent ${(5.66 * (1 - (1 - progress) ** 3)).toFixed(2)}px)`;
    element.style.maskImage = mask;
    element.style.maskSize = progress === 1 ? "" : "8px 8px";
  });
}

export function useHalftoneReveal(ref: RefObject<HTMLElement | null>) {
  const allowed = useMotionAllowed();
  const seen = useInViewOnce(ref, { enabled: allowed, skipInitial: true });
  const played = useRef(false);
  useEffect(() => {
    if (!allowed || !seen || played.current || !ref.current) return;
    played.current = true;
    return printHalftone(ref.current);
  }, [allowed, seen, ref]);
}
