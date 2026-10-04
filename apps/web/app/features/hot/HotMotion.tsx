// Compare by public story identity, not by slot: an unchanged row never flips/counts, and a story
// promoted into the podium still counts from its own previous heat. Layout positions are document
// coordinates so scrolling alone cannot create a FLIP. Only committed loader changes are animated;
// first load and back/forward history changes merely capture final values. No polling is added.
// The FLIP targets outer slots, leaving the cards' existing hover transforms and gauge motion alone.
import { createContext, useContext, useLayoutEffect, useRef, type ReactNode } from "react";
import { useLocation } from "react-router";
import type { HotEntryView } from "@aihot/contracts/site";
import { useMotionAllowed } from "../motion/preferences";
import { animateReadingChange } from "../motion/reading-flow";
import { CountUp } from "../motion/react-bits/CountUp";
import { SplitFlapText } from "../motion/react-bits/SplitFlapText";

const Previous = createContext<ReadonlyMap<string, HotEntryView>>(new Map());

export function HotMotion({ entries, children }: { entries: HotEntryView[]; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const allowed = useMotionAllowed();
  const { key } = useLocation();
  const previous = useRef({ key, entries, values: new Map<string, HotEntryView>(), positions: new Map<string, { x: number; y: number }>() });
  const changed = previous.current.key === key && previous.current.entries !== entries;
  const old = changed ? previous.current.values : new Map<string, HotEntryView>();
  useLayoutEffect(() => {
    const stops: Array<() => void> = [];
    const positions = new Map<string, { x: number; y: number }>();
    const values = new Map(entries.map((entry) => [entry.story.publicId, entry]));
    for (const element of ref.current?.querySelectorAll<HTMLElement>("[data-hot-id]") ?? []) {
      const id = element.dataset.hotId!;
      const box = element.getBoundingClientRect();
      const position = { x: box.left + window.scrollX, y: box.top + window.scrollY };
      positions.set(id, position);
      const before = changed ? previous.current.positions.get(id) : undefined;
      if (allowed && before && previous.current.values.get(id)?.rank !== values.get(id)?.rank && (before.x !== position.x || before.y !== position.y)) {
        stops.push(animateReadingChange(element, [
          { transform: `translate(${before.x - position.x}px, ${before.y - position.y}px)` }, { transform: "none" },
        ], 420));
      }
    }
    previous.current = { key, entries, positions, values };
    return () => { for (const stop of stops) stop(); };
  }, [key, entries, allowed]);
  return <Previous.Provider value={old}><div ref={ref}>{children}</div></Previous.Provider>;
}

export function HotRank({ entry, prefix = "" }: { entry: HotEntryView; prefix?: string }) {
  const before = useContext(Previous).get(entry.story.publicId);
  return <SplitFlapText key={`${entry.story.publicId}:${entry.rank}`} text={`${prefix}${String(entry.rank).padStart(2, "0")}`} viewSwitch={!!before && before.rank !== entry.rank} />;
}

export function HotHeat({ entry }: { entry: HotEntryView }) {
  const before = useContext(Previous).get(entry.story.publicId);
  const value = Math.round(entry.heat);
  const from = before ? Math.round(before.heat) : value;
  return <CountUp key={`${entry.story.publicId}:${value}`} value={value} from={from} decimals={0} viewSwitch={from !== value} animateOnReveal={false} />;
}
