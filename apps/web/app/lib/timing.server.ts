// Server-Timing for page responses: how long a page took until its headers, and how much of that its
// loaders spent reading the api. The web server (server.ts) and the built route loaders each load their
// own copy of this file, so the per-request store sits on one global that both copies share.
import { AsyncLocalStorage } from "node:async_hooks";

interface Timing {
  start: number;
  /** Summed duration of the api reads; parallel reads overlap, so this can exceed the total. */
  api: number;
  reads: number;
}

const KEY = Symbol.for("aihot.web.timing");
const store = ((globalThis as Record<symbol, unknown>)[KEY] ??= new AsyncLocalStorage<Timing>()) as AsyncLocalStorage<Timing>;

/** Runs one page request with its own timing record. */
export function withTiming<T>(fn: () => T): T {
  return store.run({ start: performance.now(), api: 0, reads: 0 }, fn);
}

/** Adds one api read to the current page request (a no-op outside one, e.g. the development server). */
export function recordApiRead(ms: number): void {
  const timing = store.getStore();
  if (!timing) return;
  timing.api += ms;
  timing.reads += 1;
}

/** The Server-Timing value for the current page request so far, or null outside one. */
export function serverTiming(): string | null {
  const timing = store.getStore();
  if (!timing) return null;
  return `api;dur=${timing.api.toFixed(1)};desc="${timing.reads} reads", total;dur=${(performance.now() - timing.start).toFixed(1)}`;
}
