import { Link } from "../lib/navigation";
import { localeFromMatches, Text, useLocale, useTranslate } from "../lib/i18n";
import { POLICY, SITE } from "@aihot/site";
import { FEATURES } from "@aihot/industry/features";
import type { ReactNode } from "react";
import { useRouteLoaderData } from "react-router";
import type { loader as rootLoader } from "../root";
import { useChangelogDot } from "../components/shell/changelog";
import { edgeTtl } from "../lib/api.server";
import { webModules } from "../site-modules";
import { pageMeta } from "../lib/seo";
import { setFontPreference, useFontPreference } from "../lib/local-state";
import { Select } from "../components/ui/Controls";
import { ThemeSwitch } from "../components/shell/ThemeSwitch";
import { MotionSwitch } from "../features/motion/MotionSwitch";
import { MORE_MENU } from "../components/shell/nav";
import { recordEngagement } from "../lib/engagement";
import { IconBolt, IconChevronRight, IconMoon } from "../components/icons";
import { TimeDial } from "../features/chrono/TimeMachine";
import { useAt, withAt } from "../features/chrono/at";
import { Deck } from "../components/shell/Deck";

export function headers() {
  return edgeTtl(300);
}

export function meta({ matches }: { matches?: Array<{ id: string; data?: unknown }> } = {}) {
  return pageMeta({ title: "更多", path: "/more", noindex: true }, localeFromMatches(matches ?? []));
}

type Row = { to: string; label: string; icon: ReactNode; note?: string };

/** The 更多 menu's groups (nav.ts), then the modules' tools; 订阅日报 is the card above them. */
function groups(): Array<{ title: string; rows: Row[] }> {
  const menu = MORE_MENU.map((g) => ({
    title: g.title,
    rows: g.items.filter((item) => item.to !== "/subscribe").map((item) => ({ to: item.to, label: item.label, note: item.note, icon: <item.icon size={18} /> })),
  }));
  const tools = webModules().flatMap((m) => m.tools ?? []);
  return [...menu, ...(tools.length ? [{ title: "工具", rows: tools }] : [])];
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="card overflow-hidden">
      <div className="px-4 pb-1 pt-3 text-[11.5px] text-ink-4">{title}</div>
      <ul className="divide-y divide-line-soft">{children}</ul>
    </section>
  );
}

export default function MorePage() {
  const tx = useTranslate();
  const locale = useLocale();
  const at = useAt();
  const font = useFontPreference();
  const root = useRouteLoaderData<typeof rootLoader>("root");
  const changelogDot = useChangelogDot(root?.changelogVersion ?? null);
  return (
    <div className="mx-auto max-w-[var(--page-max-reading)] pb-8">
      <Deck compact label={tx("更多")} title={tx("更多")} description={tx("阅读、了解 e/acc、创作、收藏与偏好设置。")} />
      <Link to="/subscribe" onClick={() => recordEngagement("subscribe_click")} className="card mt-5 flex items-center justify-between gap-3 p-4">
        <span className="flex flex-col gap-0.5">
          <span className="text-[16px] font-semibold text-ink"><Text value="订阅每日日报" /></span>
          <span className="text-[13px] text-ink-3"><Text value="邮件或 RSS，免费。" /></span>
        </span>
        <span className="deck-button is-primary shrink-0"><Text value="订阅" /></span>
      </Link>
      <div className="mt-3 space-y-3 lg:grid lg:grid-cols-2 lg:items-start lg:gap-4 lg:space-y-0 2xl:grid-cols-3">
        {[...groups(), { title: "偏好", rows: [] }].map((g) => (
          <Group key={g.title} title={tx(g.title)}>
            {g.rows.map((r) => (
              <li key={r.to}>
                <Link to={withAt(r.to, at)} className="flex min-h-[50px] items-center gap-3 px-4 py-2 text-[15px] font-medium text-ink transition-colors active:bg-bg-sunk lg:hover:bg-bg-sunk">
                  <span className="text-ink-3">{r.icon}</span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="flex items-center gap-2">{tx(r.label)}{r.to === "/changelog" && changelogDot && <span className="size-1.5 rounded-full bg-hot" aria-label={tx("有新的更新")} />}</span>
                    {r.note && <span className="truncate text-[12.5px] font-normal text-ink-4">{tx(r.note)}</span>}
                  </span>
                  <IconChevronRight size={16} className="text-ink-4" />
                </Link>
              </li>
            ))}
            {g.title === "偏好" && (
              <>
                <li className="flex h-[58px] items-center gap-3 px-4 text-[15px] font-medium text-ink">
                  <span className="text-ink-3">
                    <IconMoon size={18} />
                  </span>
                  <span className="flex-1"><Text value="外观" /></span>
                  <ThemeSwitch className="w-[124px]" />
                </li>
                <li className="flex h-[58px] items-center gap-3 px-4 text-[15px] font-medium text-ink">
                  <span className="text-ink-3">
                    <IconBolt size={18} />
                  </span>
                  <span className="flex-1"><Text value="动效" /></span>
                  <MotionSwitch className="w-[124px]" />
                </li>
                <li className="flex min-h-[58px] items-center gap-3 px-4 text-[15px] font-medium text-ink">
                  <span className="w-[18px] text-center text-ink-3" aria-hidden="true">Aa</span>
                  <span className="flex-1"><Text value="字体" /></span>
                  <Select aria-label={tx("字体")} value={font ?? "system"} onChange={(e) => setFontPreference(e.target.value === "browser" ? "browser" : null)}>
                    <option value="system">{tx("默认字体")}</option>
                    <option value="browser">{tx("浏览器默认字体")}</option>
                  </Select>
                </li>
                {FEATURES.timeMachine && (
                  <li className="px-3 py-3">
                    <TimeDial bounds={root?.timeBounds ?? null} />
                  </li>
                )}
              </>
            )}
          </Group>
        ))}
      </div>
      <div className="mt-5 flex flex-wrap justify-center gap-x-4 gap-y-1 text-[12px] text-ink-4">
        <Link to="/terms" className="hover:text-ink-2"><Text value={POLICY.terms.name} /></Link>
        <Link to="/privacy" className="hover:text-ink-2"><Text value="隐私说明" /></Link>
        <a href={`/feed/v2${locale === "zh" ? "/zh" : ""}/picks.xml`} className="hover:text-ink-2">RSS</a>
        {SITE.contactEmail && <a href={`mailto:${SITE.contactEmail}`} className="hover:text-ink-2">{SITE.contactEmail}</a>}
        {SITE.github && <a href={SITE.github} target="_blank" rel="noopener noreferrer" className="hover:text-ink-2">GitHub</a>}
        {SITE.icp && <a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer" className="hover:text-ink-2">{SITE.icp}</a>}
      </div>
    </div>
  );
}
