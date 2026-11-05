import { useEffect, useRef, useState } from "react";
import { PrefetchPageLinks, useHref, useLocation, type LinkProps } from "react-router";
import { Link } from "../../lib/navigation";
import { useLocale } from "../../lib/i18n";
import { localePath } from "../../lib/locale";
import { hasFreshPage } from "../../lib/page-reuse";

/** Intent preloads route modules/resources; scrolling over a card does not. */
export function IntentLink({ onFocus, onBlur, onMouseEnter, onMouseLeave, onTouchStart, onTouchMove, onTouchEnd, onTouchCancel, ...props }: Omit<LinkProps, "prefetch">) {
  const [ready, setReady] = useState(false);
  // The prefetched address is the one the localized Link will navigate to.
  const locale = useLocale();
  const href = useHref(typeof props.to === "string" ? localePath(props.to, locale) : props.to);
  const location = useLocation();
  // Router prefetch opts our clientLoader pages out of data reads and keeps module/resource
  // preloads. Page data is read on navigation, within its own cache deadline.
  const target = new URL(href, 'http://page.local');
  const differentPage = target.pathname + target.search !== location.pathname + location.search;
  // Router prefetch also asks shouldRevalidate. A selected/remembered page needs neither its
  // assets nor that revalidation decision, which is reserved for an actual refresh. Link's own
  // prefetch="render" stays on once set, so a link reached by its own click would keep asking.
  const shouldPrefetch = ready && differentPage && !hasFreshPage(target);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clear = () => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  };
  const start = () => {
    clear();
    timer.current = setTimeout(() => { timer.current = null; setReady(true); }, 100);
  };
  const cancel = () => { clear(); setReady(false); };
  useEffect(() => { cancel(); return clear; }, [props.to]);
  return <><Link {...props} prefetch="none"
    onFocus={(e) => { onFocus?.(e); if (!e.defaultPrevented) start(); }}
    onBlur={(e) => { onBlur?.(e); cancel(); }}
    onMouseEnter={(e) => { onMouseEnter?.(e); if (!e.defaultPrevented) start(); }}
    onMouseLeave={(e) => { onMouseLeave?.(e); cancel(); }}
    onTouchStart={(e) => { onTouchStart?.(e); if (!e.defaultPrevented) start(); }}
    onTouchMove={(e) => { onTouchMove?.(e); cancel(); }}
    onTouchEnd={(e) => { onTouchEnd?.(e); cancel(); }}
    onTouchCancel={(e) => { onTouchCancel?.(e); cancel(); }}
  />{shouldPrefetch ? <PrefetchPageLinks page={href} /> : null}</>;
}
