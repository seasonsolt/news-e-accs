import { Link } from "../../lib/navigation";
import { LanguageSwitch } from "./LanguageSwitch";
import { Text, useTranslate } from "../../lib/i18n";
// The deck's top bar on every page: the wordmark, the reading sections, 更多 for the rest, then search,
// the language, the Kardashev pill (today's rating, from the chronicle's energy series) that opens the
// four-dimensional view, and 订阅. Dark in either theme; a page's Deck continues it below. Phones keep
// the wordmark, search and the pill, and move between sections with the bottom tab bar.
import { SITE } from "@aihot/site";
import { FEATURES } from "@aihot/industry/features";
import { useEffect, useRef } from "react";
import { useLocation } from "react-router";
import { Wordmark } from "@aihot/site/brand/Logo.tsx";
import { chronicleHref } from "../../features/chrono/TimeMachine";
import { useAt, withAt } from "../../features/chrono/at";
import { MORE_MENU, TOPNAV, moduleSections, tabIsActive, type NavItem } from "./nav";
import { webModules } from "../../site-modules";
import { useChangelogDot } from "./changelog";
import { recordEngagement } from "../../lib/engagement";
import { IconSearch } from "../icons";

/** 更多: a disclosure, so it works before hydration; it closes on navigation and on a click outside. */
function MoreMenu({ dot }: { dot: boolean }) {
  const tx = useTranslate();
  const menu = useRef<HTMLDetailsElement>(null);
  const { pathname } = useLocation();
  const at = useAt();
  useEffect(() => {
    if (menu.current) menu.current.open = false;
  }, [pathname]);
  useEffect(() => {
    const close = (e: PointerEvent) => {
      if (menu.current?.open && !menu.current.contains(e.target as Node)) menu.current.open = false;
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);
  // A module's own tools, when it has any (on the phone they sit on the 更多 page too).
  const tools: Array<Pick<NavItem, "to" | "label" | "note" | "changelog">> = webModules().flatMap((m) => m.tools ?? []).map((t) => ({ to: t.to, label: t.label }));
  const groups = tools.length ? [{ title: "工具", items: tools }] : [];
  return (
    <details ref={menu} className="site-more">
      <summary className="site-nav-link"><Text value="更多" />{dot && <span className="site-nav-dot" aria-label={tx("有新的更新")} />}
      </summary>
      <div className="site-more-panel">
        {[...MORE_MENU, ...groups].map((group) => (
          <div key={group.title}>
            <p className="site-more-title">{tx(group.title)}</p>
            <ul>
              {group.items.map((item) => (
                <li key={item.to}>
                  <Link to={withAt(item.to, at)} prefetch="intent" onClick={item.to === "/subscribe" ? () => recordEngagement("subscribe_click") : undefined} className="site-more-link">
                    <span className="site-more-label">
                      {tx(item.label)}
                      {dot && item.changelog && <span className="site-nav-dot" aria-label={tx("有新的更新")} />}
                    </span>
                    {item.note && <span className="site-more-note">{tx(item.note)}</span>}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </details>
  );
}

export function SiteNav({ changelogVersion, kardashev }: { changelogVersion: string | null; kardashev: number | null }) {
  const tx = useTranslate();
  const { pathname } = useLocation();
  const at = useAt();
  const dot = useChangelogDot(changelogVersion);
  return (
    <div className="site-nav">
      <div className="site-nav-inner">
        <Link to={withAt("/", at)} className="site-nav-brand" aria-label={tx("{0} 首页", SITE.name)}>
          <Wordmark size={24} />
        </Link>
        <nav aria-label={tx("主导航")} className="site-nav-links">
          {[...TOPNAV, ...moduleSections()].map((item) => (
            <Link
              key={item.to}
              to={withAt(item.to, at)}
              prefetch="intent"
              aria-current={tabIsActive(item, pathname) ? "page" : undefined}
              className="site-nav-link"
            >
              {tx(item.label)}
            </Link>
          ))}
          <MoreMenu dot={dot} />
        </nav>
        <div className="site-nav-actions">
          <Link to={withAt("/all?search=1", at)} prefetch="intent" className="site-nav-icon" aria-label={tx("搜索全部动态")} title={tx("搜索全部动态")}>
            <IconSearch size={18} />
          </Link>
          <LanguageSwitch compact />
          {FEATURES.timeMachine && kardashev !== null && (
            <Link to={chronicleHref(at)} className="site-nav-k" title={tx("卡尔达肖夫指数：人类一次能源功率换算，I 型文明为 1")}>
              <span className="site-nav-k-dot" aria-hidden="true" />K = {kardashev.toFixed(3)}
            </Link>
          )}
          <Link to="/subscribe" prefetch="intent" onClick={() => recordEngagement("subscribe_click")} className="site-nav-subscribe"><Text value="订阅" /></Link>
        </div>
      </div>
    </div>
  );
}
