import { Link } from "../../lib/navigation";
import { useTranslate } from "../../lib/i18n";
import { useLocation } from "react-router";
import { tabBar, tabIsActive } from "./nav";
import { useChangelogDot } from "./changelog";
import { useAt, withAt } from "../../features/chrono/at";

/** Bottom tab bar of the mobile shell (up to 960px), as on the original site. */
export function MobileTabBar({ changelogVersion }: { changelogVersion: string | null }) {
  const tx = useTranslate();
  const { pathname } = useLocation();
  const dot = useChangelogDot(changelogVersion);
  const at = useAt();
  const tabs = tabBar();
  // Six tabs leave the longest English label ("Acceleration") a few pixels on a 360px phone; narrower ones get a smaller face.
  return (
    <nav aria-label={tx("底部导航")} className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
      <div className="mx-auto grid h-[54px] max-w-[640px]" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
        {tabs.map((t) => {
          const active = tabIsActive(t, pathname);
          const Icon = t.icon;
          return (
            <Link
              key={t.to}
              to={withAt(t.to, at)}
              prefetch="intent"
              aria-current={active ? "page" : undefined}
              className={`relative flex flex-col items-center justify-center gap-[3px] text-[11px] max-[359px]:text-[10px] transition-colors ${active ? "font-semibold text-accent" : "text-ink-3 active:text-ink"}`}
            >
              <Icon size={21} />
              <span>{tx(t.label)}</span>
              {dot && t.changelog && <span className="absolute right-[calc(50%-17px)] top-2 size-1.5 rounded-full bg-hot" aria-label={tx("有新的更新")} />}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
