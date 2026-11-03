import { publicPath } from "../../lib/locale.ts";
// Site navigation, one place for the desktop sidebar, the mobile tab bar and the mobile "更多" page.
import { NAV, withSubject } from "@aihot/site";
import { FEATURES } from "@aihot/industry/features";
import { webModules } from "../../site-modules";
import type { ReactNode } from "react";
import {
  IconApps, IconBolt, IconBookmark, IconDoc, IconFlame, IconGrid, IconHeart, IconHistory, IconHourglass, IconImage, IconInfo, IconList, IconMail, IconMessage, IconPlug, IconSparkles,
} from "../icons";

/** Whether an engine page is a way in from the navigation (site.ts NAV.hidden); a hidden page still opens. */
export const inNav = (to: string) => !(NAV.hidden as readonly string[]).includes(to);

export interface NavItem {
  to: string;
  label: string;
  icon: (p: { size?: number }) => ReactNode;
  /** One line under the label in 更多, saying what the page holds. */
  note?: string;
  /** Match the path exactly (the home page). */
  end?: boolean;
  /** Other sections this item's page gathers: they keep the item highlighted and count as menu pages. */
  also?: string[];
  /** Shows the unread dot while the changelog has news. */
  changelog?: boolean;
}

/**
 * The deck's top navigation: the reading sections, in the order a reader moves through them. The modules'
 * sections (their `sidebar` items) follow; the phone's tab bar has the same sections.
 */
export const TOPNAV: NavItem[] = [
  { to: "/", label: "精选", icon: IconBolt, end: true },
  { to: "/daily", label: withSubject("日报"), icon: IconDoc },
  // The acceleration (the chronicle) is the site's signature view.
  ...(FEATURES.timeMachine ? [{ to: "/chronicle", label: "加速史", icon: IconHourglass }] : []),
];

/** Everything else, under 更多 in the deck and on the phone's 更多 page: a group for each reason to look. */
export const MORE_MENU: Array<{ title: string; items: NavItem[] }> = [
  {
    title: "阅读",
    items: [
      { to: "/all", label: "全部动态", icon: IconList, note: "每条通过筛选的动态，可搜索和筛选" },
      ...(inNav("/hot") ? [{ to: "/hot", label: "热点", icon: IconFlame, note: "按此刻的报道热度排的事件" }] : []),
      ...(inNav("/topics") ? [{ to: "/topics", label: "主题", icon: IconGrid, note: "公司、产品与话题" }] : []),
      { to: "/weekly", label: "周报与月报", icon: IconDoc, note: "每周一和每月 1 日的回顾" },
    ],
  },
  ...(FEATURES.eaccConcepts ? [{
    title: "了解 e/acc",
    items: [
      { to: "/manifesto", label: "降临派宣言", icon: IconInfo, note: "本站的主张：人与 AI 共生演化" },
      { to: "/what-is-eacc", label: "什么是 e/acc", icon: IconInfo, note: "起源、主张与批评" },
      { to: "/eacc-vs-dacc", label: "e/acc 与 d/acc", icon: IconInfo, note: "先加速，还是先防御" },
      { to: "/eacc-vs-ea", label: "e/acc 与 EA", icon: IconInfo, note: "两者在 AI 上的分歧" },
      { to: "/eacc-glossary", label: "e/acc 术语表", icon: IconInfo, note: "常用说法一页看全" },
    ],
  }] : []),
  {
    title: "创作",
    items: [
      // The workshops are the scenes module's gallery of the chronicle's playable eras.
      ...(FEATURES.timeMachine ? [{ to: "/chronicle/workshops", label: "工坊", icon: IconSparkles, note: "走进加速史里的各个时代" }] : []),
      { to: "/products/wallpaper", label: "壁纸", icon: IconImage, note: "每天一张 4K 壁纸" },
      { to: "/products", label: "产品目录", icon: IconApps, note: "已上线和即将推出的产品" },
    ],
  },
  {
    title: "我的",
    items: [
      { to: "/subscribe", label: "订阅日报", icon: IconMail, note: "用邮件或 RSS 收日报" },
      { to: "/starred", label: "收藏", icon: IconBookmark, note: "保存在这台设备上" },
    ],
  },
  {
    title: "本站",
    items: [
      { to: "/about", label: "关于", icon: IconHeart, note: "怎么采集和挑选" },
      { to: "/agent", label: "Agent 接入", icon: IconPlug, note: "MCP、公开 API 与 Markdown" },
      { to: "/changelog", label: "更新日志", icon: IconHistory, note: "最近改了什么", changelog: true },
      { to: "/feedback", label: "反馈", icon: IconMessage, note: "更正与建议" },
    ],
  },
];

const MORE_TAB: NavItem = { to: "/more", label: "更多", icon: IconApps, changelog: true };

/** The modules' sections in the deck and the tab bar (their `sidebar` items), after the engine's. */
export function moduleSections(): NavItem[] {
  return webModules().flatMap((m) => m.sidebar?.items ?? []);
}

/** The phone's tab bar: the deck's sections under their short names, the modules' after them, then 更多. */
export function tabBar(): NavItem[] {
  return [...TOPNAV.map((item) => (item.to === "/daily" ? { ...item, label: "日报" } : item)), ...moduleSections(), MORE_TAB];
}

/** A page a section of the deck already answers for: under its path, or a weekly or monthly report. */
const inSection = (path: string) => /^\/(weekly|monthly)(\/|$)/.test(path) || TOPNAV.some((item) => !item.end && (path === item.to || path.startsWith(`${item.to}/`)));

/** Pages reached from the mobile "更多" tab keep that tab highlighted; hidden engine pages still count. */
export const MORE_PATHS = ["/more", ...MORE_MENU.flatMap((g) => g.items.map((item) => item.to)), "/chronicle", "/hot", "/topics", "/terms", "/privacy"]
  .filter((path, i, all) => all.indexOf(path) === i && !inSection(path));

export function tabIsActive(item: NavItem, pathname: string): boolean {
  pathname = publicPath(pathname);
  const under = (p: string) => pathname === p || pathname.startsWith(`${p}/`);
  if (item.end) return pathname === item.to;
  if (item.to === "/more") return [...MORE_PATHS, ...webModules().flatMap((m) => (m.tools ?? []).map((t) => t.to))].some(under);
  if (item.to === "/daily") return /^\/(daily|weekly|monthly)(\/|$)/.test(pathname);
  return [item.to, ...(item.also ?? [])].some(under);
}

/**
 * The pages that read at night in either theme, as one immersive set with the front page (root.tsx,
 * app.css): those the menus lead to (the top bar, 更多, the phone tab bar and the modules' entries) and the
 * event pages the front page and the trending list open. Other pages opened from them (an item, a report,
 * a topic) keep the reader's theme.
 */
export function isNightPage(pathname: string): boolean {
  const path = publicPath(pathname);
  const modules = webModules().flatMap((m) => [...(m.sidebar?.items ?? []), ...(m.tools ?? [])]);
  const sections = [...TOPNAV, ...moduleSections()].flatMap((item) => item.also ?? []);
  return [...TOPNAV, ...MORE_MENU.flatMap((g) => g.items), MORE_TAB, ...modules].some((item) => item.to === path) || sections.includes(path) || /^\/(weekly|monthly)$/.test(path) || path.startsWith("/story/");
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
