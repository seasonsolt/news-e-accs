import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { useLocale } from "../../lib/i18n";
import { hasChineseRoute, languagePreference, languageSwitchPath, prefersChinese, rememberLanguage, type Locale } from "../../lib/locale";
import { IconClose } from "../icons";

/** Offer the Chinese edition to a Chinese-first browser that has not chosen yet. URLs never redirect:
 * the hint appears only after hydration, and either answer is remembered so it never asks again. */
export function LanguageHint() {
  const locale = useLocale();
  const navigate = useNavigate();
  const { pathname, search, hash } = useLocation();
  const [offered, setOffered] = useState(false);
  useEffect(() => {
    setOffered(languagePreference(document.cookie) === null && prefersChinese(navigator.languages?.length ? navigator.languages : [navigator.language]));
  }, []);
  if (!offered || locale !== "en" || !hasChineseRoute(pathname)) return null;
  function choose(value: Locale) {
    rememberLanguage(value);
    setOffered(false);
    if (value === "zh") void navigate(languageSwitchPath(pathname, search, hash, value));
  }
  return (
    <div role="region" aria-label="语言" lang="zh-CN"
      className="language-hint fixed bottom-[calc(70px+env(safe-area-inset-bottom))] left-4 right-[72px] z-30 flex items-center gap-2 rounded-full border border-line bg-surface py-1.5 pl-4 pr-1.5 text-[13px] text-ink-2 shadow-[var(--shadow-soft)] lg:bottom-6 lg:left-6 lg:right-auto">
      <span className="min-w-0 flex-1 truncate">本页有中文版</span>
      <button type="button" onClick={() => choose("zh")} className="shrink-0 rounded-full bg-accent px-3 py-1.5 font-medium text-accent-contrast hover:opacity-90">切换到中文</button>
      <button type="button" aria-label="继续看英文版" title="继续看英文版" onClick={() => choose("en")} className="flex size-8 shrink-0 items-center justify-center rounded-full text-ink-3 hover:text-ink">
        <IconClose size={15} />
      </button>
    </div>
  );
}
