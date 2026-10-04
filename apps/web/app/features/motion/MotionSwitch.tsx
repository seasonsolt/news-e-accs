// Reader-controlled motion, beside appearance on desktop and in the phone's More page. The toggle
// asks for less motion; switching it off never overrides the operating system's accessibility choice.
import { useSyncExternalStore } from "react";
import { setReduceMotion } from "../../lib/local-state";
import { subscribeMotionPreference } from "./preferences";

export function MotionSwitch({ className = "" }: { className?: string }) {
  const reduced = useSyncExternalStore(subscribeMotionPreference,
    () => document.documentElement.getAttribute("data-motion") === "reduced", () => false);
  return (
    <button type="button" aria-pressed={reduced} onClick={() => setReduceMotion(!reduced)}
      className={`flex h-[34px] items-center justify-center gap-2 rounded-full border border-line bg-bg-sunk px-3 text-[12px] text-ink-3 transition-colors hover:text-ink ${className}`}>
      <span aria-hidden="true" className={`size-2 rounded-full ${reduced ? "bg-accent" : "bg-ink-4/40"}`} />
      减少动效
    </button>
  );
}
