import { publicPath } from "../../lib/locale.ts";
// Site navigation, one place for the desktop sidebar, the mobile tab bar and the mobile "更多" page.
import { NAV, withSubject } from "@aihot/site";
import { FEATURES } from "@aihot/industry/features";
import { webModules } from "../../site-modules";
import type { ReactNode } from "react";
import {
  IconApps, IconBolt, IconBookmark, IconChart, IconDoc, IconFlame, IconGrid, IconHeart, IconHistory, IconHourglass, IconInfo, IconList, IconMail, IconMessage, IconPlug,
} from "../icons";

/** Whether an engine page is a way in from the navigation (site.ts NAV.hidden); a hidden page still opens. */
export const inNav = (to: string) => !(NAV.hidden as readonly string[]).includes(to);

export interface NavItem {
  to: string;
  label: string;
  icon: (p: { size?: number }) => ReactNode;
  /** Match the path exactly (the home page). */
  end?: boolean;
  /** Shows the unread dot while the changelog has news. */
  changelog?: boolean;
  /** One of e-acc.ai's own pages (served beside this site, not by it): a full page load. */
  document?: boolean;
}

/** e-acc.ai's tool pages, which the edge serves from the static site next to this one. */
export const TOOLS: NavItem[] = [
  { to: "/coding-plan", label: "Coding Plan 选择器", icon: IconPlug, document: true },
  { to: "/pricing", label: "模型价格", icon: IconChart, document: true },
  { to: "/calculator", label: "成本计算器", icon: IconGrid, document: true },
  // The acceleration timeline moved into this site's four-dimensional view (/chronicle) when the time machine is on.
  ...(FEATURES.timeMachine ? [] : [{ to: "/timeline", label: "加速时间线", icon: IconHourglass, document: true }]),
  // Served by this site since the concept pages moved here (industry/concepts.ts).
  { to: "/what-is-eacc", label: "什么是 e/acc", icon: IconInfo },
];

/** The deck's top navigation: the reading sections, in the order a reader moves through them. */
export const TOPNAV: NavItem[] = [
  { to: "/", label: "精选", icon: IconBolt, end: true },
  // The acceleration (the chronicle) is the site's signature view: right after the picks.
  ...(FEATURES.timeMachine ? [{ to: "/chronicle", label: "加速史", icon: IconHourglass }] : []),
  ...(inNav("/hot") ? [{ to: "/hot", label: "热点", icon: IconFlame }] : []),
  { to: "/daily", label: withSubject("日报"), icon: IconDoc },
  { to: "/products", label: "产品目录", icon: IconApps },
];

/** Everything else, under 更多 in the deck (and on the phone's 更多 page). */
export const MORE_MENU: Array<{ title: string; items: NavItem[] }> = [
  {
    title: "阅读",
    items: [
      { to: "/all", label: "全部动态", icon: IconList },
      { to: "/products", label: "产品目录", icon: IconApps },
      { to: "/subscribe", label: "订阅日报", icon: IconMail },
      ...(inNav("/topics") ? [{ to: "/topics", label: "主题", icon: IconGrid }] : []),
      { to: "/starred", label: "收藏", icon: IconBookmark },
    ],
  },
  { title: "工具", items: TOOLS },
  {
    title: "关于",
    items: [
      { to: "/agent", label: "Agent 接入", icon: IconPlug },
      { to: "/about", label: "关于", icon: IconHeart },
      { to: "/changelog", label: "更新日志", icon: IconHistory, changelog: true },
      { to: "/feedback", label: "反馈", icon: IconMessage },
    ],
  },
];

export const TABBAR: NavItem[] = [
  { to: "/", label: "精选", icon: IconBolt, end: true },
  ...(FEATURES.timeMachine ? [{ to: "/chronicle", label: "加速史", icon: IconHourglass }] : [{ to: "/products", label: "产品目录", icon: IconApps }]),
  ...(inNav("/hot") ? [{ to: "/hot", label: "热点", icon: IconFlame }] : []),
  { to: "/daily", label: "日报", icon: IconDoc },
  { to: "/more", label: "更多", icon: IconApps, changelog: true },
];

/** Pages reached from the mobile "更多" tab keep that tab highlighted. */
export const MORE_PATHS = ["/all", "/products", "/more", ...(FEATURES.timeMachine ? [] : ["/chronicle"]), "/hot", "/topics", "/starred", "/agent", "/about", "/changelog", "/feedback", "/terms", "/privacy"]
  .filter((path) => !TABBAR.some((item) => item.to !== "/more" && item.to === path));

export function tabIsActive(item: NavItem, pathname: string): boolean {
  pathname = publicPath(pathname);
  if (item.end) return pathname === item.to;
  if (item.to === "/more") return [...MORE_PATHS, ...webModules().flatMap((m) => (m.tools ?? []).map((t) => t.to))].some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (item.to === "/daily") return /^\/(daily|weekly|monthly)(\/|$)/.test(pathname);
  return pathname === item.to || pathname.startsWith(`${item.to}/`);
}

/**
 * The phone shell's tabs (TabBar.tsx, screens.ts and the modules' `tabs`). The pages here are reached
 * through MobileTabBar and TOPNAV above; these types keep the modules' contract (modules.ts) whole.
 */
export type TabKey =
  | "featured"
  | "hot"
  | "daily"
  | "me"
  // A module's tab.
  | (string & {});

export interface Tab {
  key: TabKey;
  to: string;
  label: string;
  icon: (p: { size?: number }) => ReactNode;
  changelog?: boolean;
}

/** The phone shell's tab bar: the engine's tabs, the modules' before 我的. */
export function tabs(): Tab[] {
  const engine: Tab[] = [
    { key: "featured", to: "/", label: "精选", icon: IconBolt },
    ...(inNav("/hot") ? [{ key: "hot", to: "/hot", label: "热点", icon: IconFlame }] : []),
    { key: "daily", to: "/daily", label: "日报", icon: IconDoc },
  ];
  return [...engine, { key: "me", to: "/more", label: "我的", icon: IconApps, changelog: true }];
}
