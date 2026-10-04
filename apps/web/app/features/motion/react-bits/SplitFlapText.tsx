// Adapted from React Bits SplitFlapText (https://reactbits.dev, David Haz), MIT + Commons Clause — see ./LICENSE.
// Just one numeric flap, no random alphabet, cycling or idle timer. The stationary final rank is
// always underneath two clipped half-tiles; only client-side board switches activate the overlay.
// Both halves hinge at the middle in 460ms, with a slight row stagger. Final text stays accessible.
import { useEffect, useRef } from "react";
import { useMotionAllowed } from "../preferences";
import { runFrames, useInViewOnce } from "../viewport";

export function SplitFlapText({ text, viewSwitch = false, delay = 0 }: { text: string; viewSwitch?: boolean; delay?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const top = useRef<HTMLSpanElement>(null);
  const bottom = useRef<HTMLSpanElement>(null);
  const played = useRef(false);
  const allowed = useMotionAllowed();
  const seen = useInViewOnce(ref, { enabled: allowed && viewSwitch });
  useEffect(() => {
    if (!allowed || !seen || !ref.current || played.current) return;
    played.current = true;
    return runFrames(ref.current, 460, (progress) => {
      if (top.current) top.current.style.transform = `rotateX(${-90 * Math.min(1, progress * 2)}deg)`;
      if (bottom.current) bottom.current.style.transform = `rotateX(${90 * (1 - Math.max(0, progress * 2 - 1))}deg)`;
      if (progress === 1) {
        if (top.current) top.current.style.opacity = "0";
        if (bottom.current) bottom.current.style.opacity = "0";
      } else {
        if (top.current) top.current.style.opacity = "1";
        if (bottom.current) bottom.current.style.opacity = "1";
      }
    }, delay);
  }, [allowed, seen, delay]);
  return (
    <span ref={ref} className="relative inline-block [perspective:240px]">
      {text}
      <span ref={top} aria-hidden="true" data-text={text} className="pointer-events-none absolute inset-x-0 top-0 h-1/2 origin-bottom overflow-hidden bg-surface opacity-0 [backface-visibility:hidden] before:absolute before:inset-x-0 before:top-0 before:h-[200%] before:content-[attr(data-text)]" />
      <span ref={bottom} aria-hidden="true" data-text={text} className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 origin-top overflow-hidden bg-surface opacity-0 [backface-visibility:hidden] before:absolute before:inset-x-0 before:bottom-0 before:h-[200%] before:content-[attr(data-text)]" />
    </span>
  );
}
