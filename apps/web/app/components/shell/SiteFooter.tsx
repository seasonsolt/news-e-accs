import { Link } from "../../lib/navigation";
import { LanguageSwitch } from "./LanguageSwitch";
import { Text, useLocale, useTranslate } from "../../lib/i18n";
// The foot of every page: preferences (appearance, motion), the rules and feeds, and the ICP number.
// These lived at the foot of the sidebar before the deck's top bar replaced it.
import { SITE } from "@aihot/industry/site";

import { ThemeSwitch } from "./ThemeSwitch";
import { MotionSwitch } from "../../features/motion/MotionSwitch";

export function SiteFooter() {
  const tx = useTranslate();
  const locale = useLocale();
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[12.5px] text-ink-4">
          {SITE.footerNote && <span>{tx(SITE.footerNote)}</span>}
          <Link to="/terms" className="hover:text-ink-2"><Text value="使用规则" /></Link>
          <Link to="/privacy" className="hover:text-ink-2"><Text value="隐私说明" /></Link>
          <a href={`/feed/v2${locale === "zh" ? "/zh" : ""}/picks.xml`} className="hover:text-ink-2">RSS</a>
          {SITE.icp && (
            <a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer" className="hover:text-ink-2">
              {SITE.icp}
            </a>
          )}
          <span className="font-display text-[17px] italic text-ink-3">Accelerate.</span>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <LanguageSwitch />
          <ThemeSwitch className="w-[124px]" />
          <MotionSwitch />
        </div>
      </div>
    </footer>
  );
}
