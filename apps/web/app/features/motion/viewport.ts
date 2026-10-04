// Capture visibility in a layout effect before motion is enabled. Content initially visible is
// never rewound for an entrance. If hydration was delayed until after scrolling, err on the side of
// a static value: we cannot prove it was below the fold at paint. Observers disconnect after one hit,
// even when reduction is on: enabling motion later must not replay already-seen content.
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";

export function isInViewport(element: Element): boolean {
  const box = element.getBoundingClientRect();
  return box.width > 0 && box.height > 0 && box.bottom > 0 && box.top < window.innerHeight
    && box.right > 0 && box.left < window.innerWidth;
}

export function useWasInViewportAtFirstPaint(ref: RefObject<Element | null>) {
  const initial = useRef<boolean | null>(null);
  useLayoutEffect(() => {
    if (initial.current === null && ref.current) initial.current = window.scrollY !== 0 || isInViewport(ref.current);
  }, [ref]);
  return initial;
}

export function useInViewOnce(ref: RefObject<Element | null>, {
  enabled = true, skipInitial = false, threshold = 0.1,
}: { enabled?: boolean; skipInitial?: boolean; threshold?: number } = {}): boolean {
  const initial = useWasInViewportAtFirstPaint(ref);
  const [seen, setSeen] = useState(false);
  const consumed = useRef(false);
  const canTrigger = useRef(enabled);
  canTrigger.current = enabled;
  useEffect(() => {
    const element = ref.current;
    if (!element || consumed.current || (skipInitial && initial.current !== false)) return;
    if (!window.IntersectionObserver) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return;
      consumed.current = true;
      if (canTrigger.current) setSeen(true);
      observer.disconnect();
    }, { threshold });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, skipInitial, threshold, initial]);
  return seen;
}

/** A bounded DOM tween: settle immediately if it leaves the screen / tab, with no idle rAF. */
export function runFrames(element: Element, duration: number, update: (progress: number) => void, delay = 0): () => void {
  let frame = 0;
  let start = 0;
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    cancelAnimationFrame(frame);
    observer?.disconnect();
    document.removeEventListener("visibilitychange", onVisibility);
    update(1);
  };
  const onVisibility = () => { if (document.hidden) finish(); };
  const observer = window.IntersectionObserver ? new IntersectionObserver(([entry]) => {
    if (!entry?.isIntersecting) finish();
  }) : null;
  const tick = (now: number) => {
    if (done) return;
    if (!start) start = now;
    const progress = Math.max(0, Math.min(1, (now - start - delay) / duration));
    update(progress);
    if (progress === 1) finish();
    else frame = requestAnimationFrame(tick);
  };
  if (document.hidden || !isInViewport(element)) { update(1); return () => {}; }
  observer?.observe(element);
  document.addEventListener("visibilitychange", onVisibility);
  frame = requestAnimationFrame(tick);
  return finish;
}
