// subscribe_view fires once per page view, and only when the control is actually on screen.
// A fixed overlay that covers another control (the home button, under the first-visit film) does not count.
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
  const pageKey = useLocation().key;
  useEffect(() => {
    const node = ref.current;
    if (!enabled || !node || typeof IntersectionObserver === "undefined") return;
    let recorded = false;
    const consider = (height: number, width: number, intersecting: boolean) => {
      if (recorded || !intersecting || !visibleEnough({ height, width })) return;
      const covered = document.documentElement.hasAttribute("data-onboarding");
      if (source === "home_overlay" ? !covered : covered) return;
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
    // The overlay is position:fixed, so the home button's intersection box does not change when it appears.
    const onCover = () => {
      const rect = node.getBoundingClientRect();
      const height = Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0);
      const width = Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0);
      consider(Math.max(0, height), Math.max(0, width), height > 0 && width > 0);
    };
    const mo = new MutationObserver(onCover);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-onboarding"] });
    return () => {
      observer.disconnect();
      mo.disconnect();
    };
  }, [enabled, locale, pageKey, ref, source]);
}
