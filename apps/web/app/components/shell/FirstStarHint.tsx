import { useEffect, useState } from "react";
import { Link } from "../../lib/navigation";
import { Text, useTranslate } from "../../lib/i18n";
import { onFirstStar } from "../../lib/local-state";
import { IconBookmark, IconClose } from "../icons";

/** After this device's first star, says once where 收藏 lives: the page sits under 更多 and the star
 * itself gives no hint of it. Fades on its own; a device that already had stars never sees it. */
export function FirstStarHint() {
  const tx = useTranslate();
  const [shown, setShown] = useState(false);
  useEffect(() => onFirstStar(() => setShown(true)), []);
  useEffect(() => {
    if (!shown) return;
    const t = setTimeout(() => setShown(false), 6000);
    return () => clearTimeout(t);
  }, [shown]);
  if (!shown) return null;
  return (
    <div role="status"
      className="anim-notice-in fixed bottom-[calc(80px+env(safe-area-inset-bottom))] left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full bg-ink py-1.5 pl-4 pr-1.5 text-[13px] text-bg shadow-[var(--shadow-pop)] lg:bottom-8">
      <IconBookmark size={14} filled />
      <Text value="已收藏在这台设备上" />
      <Link to="/starred" onClick={() => setShown(false)} className="rounded-full bg-bg/15 px-3 py-1 font-medium hover:bg-bg/25"><Text value="查看收藏" /></Link>
      <button type="button" aria-label={tx("关闭")} onClick={() => setShown(false)} className="flex size-7 items-center justify-center rounded-full opacity-70 hover:opacity-100">
        <IconClose size={14} />
      </button>
    </div>
  );
}
