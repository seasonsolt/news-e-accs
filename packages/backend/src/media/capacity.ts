// Process-wide decode/render capacity. Network waits use a separate cold-image budget below.
export class MediaBusyError extends Error {
  readonly retryAfter = 5;
  constructor() { super("media capacity exhausted"); }
}

export function createMediaCapacity(opts: { maxConcurrent: number; maxQueued: number; waitMs: number }) {
  let running = 0;
  let rejected = 0;
  const waiters: Array<() => void> = [];
  return {
    snapshot: () => ({ running, queued: waiters.length, rejected }),
    async run<T>(work: () => Promise<T>): Promise<T> {
      if (running >= opts.maxConcurrent) {
        if (waiters.length >= opts.maxQueued) {
          rejected += 1;
          throw new MediaBusyError();
        }
        await new Promise<void>((resolve, reject) => {
          const go = () => { clearTimeout(timer); resolve(); };
          const timer = setTimeout(() => {
            waiters.splice(waiters.indexOf(go), 1);
            rejected += 1;
            reject(new MediaBusyError());
          }, opts.waitMs);
          waiters.push(go);
        });
      } else running += 1;
      try {
        return await work();
      } finally {
        // Transfer the occupied slot before waking its waiter: a new caller cannot steal it.
        const next = waiters.shift();
        if (next) next();
        else running -= 1;
      }
    },
  };
}

// The 2 GiB deployment showed large API RSS growth while rendering share cards. Keep both HTTP
// and background callers within two heavy operations, with at most eight waiting for three seconds.
export const mediaCapacity = createMediaCapacity({ maxConcurrent: 2, maxQueued: 8, waitMs: 3000 });

// A cold pipeline reserves one original (at most 15 MiB) from before download until encoding ends.
// Four such leases bound resident originals to 60 MiB, including those waiting for a decoder.
// Slow origins can occupy these leases, but never occupy a decode/share-render slot.
export const originalCapacity = createMediaCapacity({ maxConcurrent: 4, maxQueued: 8, waitMs: 20_000 });
