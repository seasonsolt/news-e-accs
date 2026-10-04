// Adapted from React Bits CurvedLoop (https://reactbits.dev, David Haz), MIT + Commons Clause — see ./LICENSE.
// Keep the paper-feed idea, not the repeated SVG text, measuring copy or infinite clock. One real
// link per headline sits on a straight, natively scrollable tape in its final SSR position. Only a
// proven below-fold reveal or the replay control starts a four-second feed. Reader scrolling or
// following a headline settles it; runFrames also settles on viewport/tab exit and reduction.
import { useEffect, useRef } from "react";
import { Link } from "react-router";
import type { HotEntryView } from "@aihot/contracts/site";
import { hasFinePointer, useMotionAllowed } from "../preferences";
import { useInViewOnce } from "../viewport";
import { animateReadingChange } from "../reading-flow";

export function TelegraphTape({ entries }: { entries: readonly HotEntryView[] }) {
  const allowed = useMotionAllowed();
  const root = useRef<HTMLElement>(null);
  const tape = useRef<HTMLOListElement>(null);
  const stop = useRef<(() => void) | null>(null);
  const played = useRef(false);
  const seen = useInViewOnce(root, { enabled: allowed, skipInitial: true });
  function settle() { stop.current?.(); stop.current = null; }
  function print() {
    if (!allowed || !tape.current || !root.current || tape.current.getAnimations?.().length) return;
    settle();
    stop.current = animateReadingChange(tape.current, [
      { transform: "translateX(72px)", clipPath: "inset(0 0 0 100%)" },
      { transform: "translateX(0)", clipPath: "inset(0 0 0 0)" },
    ], 4000, 0, root.current);
  }
  useEffect(() => {
    if (!allowed) settle();
    return settle;
  }, [allowed]);
  useEffect(() => {
    if (!seen || played.current) return;
    played.current = true;
    print();
  }, [seen, allowed]);
  if (!entries.length) return null;
  return (
    <section ref={root} data-telegraph-tape="" aria-label="热点电报" className="my-4 min-w-0">
      <div className="mb-1.5 flex items-center justify-between px-1 text-[11px] text-ink-4">
        <span className="mono tracking-wider">热点电报 · 前五条</span>
        <button type="button" aria-label="重播热点电报" onClick={print}
          onPointerEnter={(event) => { if (event.pointerType !== "touch" && hasFinePointer()) print(); }}
          onFocus={() => { if (hasFinePointer()) print(); }}
          className="min-h-8 rounded-control border border-line-strong px-3 text-accent-ink">重播</button>
      </div>
      <div className="telegraph-rollers relative min-w-0 rounded-control border border-amber/60 bg-bg-sunk px-3">
        <div onPointerDown={settle} onWheel={settle} onFocusCapture={settle} className="overflow-x-auto overscroll-x-contain py-1 scrollbar-thin">
          <ol ref={tape} className="telegraph-paper flex w-max min-w-full items-center gap-8 px-4 py-5 text-[13px] text-ink">
            {entries.slice(0, 5).map((entry) => (
              <li key={entry.story.publicId}>
                <Link to={`/story/${entry.story.publicId}`} prefetch="intent" className="underline decoration-amber/40 underline-offset-4 focus-visible:decoration-accent">{entry.story.title}</Link>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
