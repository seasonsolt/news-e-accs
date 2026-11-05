// subscribe_view fires once per pathname for this document, and only when the control is actually on screen.
// Chronicle replaces ?t= without leaving the page; location.key changed on every drag and counted again.
import { useEffect, type RefObject } from "react";
import { useLocation } from "react-router";
import type { SubscribeSource } from "@aihot/contracts/subscribe";
import { useLocale } from "../../lib/i18n";
import { claimSubscribeView } from "./claim";
import { recordSubscribe } from "./flow";

export { claimSubscribeView };

function visibleEnough(rect: { height: number; width: number }): boolean {
  return rect.height >= 24 && rect.width >= 48;
}

export function useSubscribeView(ref: RefObject<Element | null>, source: SubscribeSource, enabled = true) {
  const locale = useLocale();
  const pageKey = useLocation().pathname;
  useEffect(() => {
    const node = ref.current;
    if (!enabled || !node || typeof IntersectionObserver === "undefined") return;
    let recorded = false;
    const consider = (height: number, width: number, intersecting: boolean) => {
      if (recorded || !intersecting || !visibleEnough({ height, width })) return;
      if (!claimSubscribeView(pageKey, source, locale)) {
        recorded = true;
        return;
      }
      recorded = true;
      recordSubscribe("subscribe_view", source, locale);
    };
    const observer = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (!entry) return;
      consider(entry.intersectionRect.height, entry.intersectionRect.width, entry.isIntersecting);
    }, { threshold: [0, 0.5, 1] });
    observer.observe(node);
    return () => observer.disconnect();
  }, [enabled, locale, pageKey, ref, source]);
}
