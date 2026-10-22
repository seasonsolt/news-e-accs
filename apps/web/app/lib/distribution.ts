import { distributionChannel, type DistributionChannel } from "@aihot/contracts/distribution";
import { recordEngagement } from "./engagement.ts";

// Attribution lasts only in this tab. No reader identifier, URL, or arbitrary campaign string is stored.
let channel: DistributionChannel | null = null;
export function currentDistribution(): DistributionChannel | null { return channel; }
/** Counts one page of this tab; `via` is the label in that page's address, if it has one. */
export function trackDistribution(via: string | null): () => void {
  const incoming = distributionChannel(via);
  if (incoming) channel = incoming;
  if (!channel) return () => {};
  const target = channel;
  recordEngagement("distribution_visit", target);
  let remaining = 15_000;
  let started = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let done = false;
  const sync = () => {
    if (timer !== undefined) { clearTimeout(timer); timer = undefined; remaining -= performance.now() - started; }
    if (!done && document.visibilityState === "visible") {
      started = performance.now();
      timer = setTimeout(() => { timer = undefined; done = true; recordEngagement("distribution_read", target); }, Math.max(0, remaining));
    }
  };
  document.addEventListener("visibilitychange", sync);
  sync();
  return () => { clearTimeout(timer); document.removeEventListener("visibilitychange", sync); };
}
