// Once per pathname in this document. A remount (Strict Mode, a parent re-render) does not count again,
// and neither does a later visit to the same path until the page is loaded again.
import type { SubscribeSource } from "@aihot/contracts/subscribe";

const seen = new Set<string>();

/** True the first time this page view reports this source. */
export function claimSubscribeView(pageKey: string, source: SubscribeSource, locale: string): boolean {
  const key = `${pageKey}\n${source}\n${locale}`;
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
}
