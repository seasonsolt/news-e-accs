// One shared subscription for the whole site, not one media query / observer per score. The server
// snapshot is false, including the hydration render: decoration only starts after React takes over.
// The pre-paint script owns the first frame; storage events keep other tabs in step, and observing
// the root attribute also catches changes made while localStorage is unavailable.
import { useSyncExternalStore } from "react";
import { KEYS } from "../../lib/local-state";

const listeners = new Set<() => void>();
let media: MediaQueryList | null = null;
let observer: MutationObserver | null = null;

function notify() {
  for (const listener of listeners) listener();
}
function onStorage(event: StorageEvent) {
  if (event.key !== KEYS.motion && event.key !== null) return;
  if (event.newValue === "reduced" && event.key !== null) document.documentElement.setAttribute("data-motion", "reduced");
  else document.documentElement.removeAttribute("data-motion");
  notify();
}
export function subscribeMotionPreference(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    media = window.matchMedia("(prefers-reduced-motion: reduce)");
    media.addEventListener("change", notify);
    observer = new MutationObserver(notify);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-motion"] });
    window.addEventListener("storage", onStorage);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size) return;
    media?.removeEventListener("change", notify);
    media = null;
    observer?.disconnect();
    observer = null;
    window.removeEventListener("storage", onStorage);
  };
}
function snapshot() {
  return document.documentElement.getAttribute("data-motion") !== "reduced"
    && !(media ?? window.matchMedia("(prefers-reduced-motion: reduce)")).matches;
}

export function useMotionAllowed(): boolean {
  return useSyncExternalStore(subscribeMotionPreference, snapshot, () => false);
}

/** Hover decoration never activates on a touchscreen or a coarse pointer. */
export function hasFinePointer(): boolean {
  return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
}
