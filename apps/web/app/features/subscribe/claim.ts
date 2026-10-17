// Once per page view. A remount of the same view (Strict Mode, a parent re-render) does not count again.
import type { SubscribeSource } from "@aihot/contracts/subscribe";

const seen = new Set<string>();

/** True the first time this page view reports this source. */
export function claimSubscribeView(pageKey: string, source: SubscribeSource, locale: string): boolean {
  const key = `${pageKey}\n${source}\n${locale}`;
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
}
