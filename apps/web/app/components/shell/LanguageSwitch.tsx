import { useLocation, useNavigate } from "react-router";
import { useLocale } from "../../lib/i18n";
import { hasChineseRoute, languageSwitchPath, rememberLanguage, type Locale } from "../../lib/locale";

/** Store a navigation preference, then navigate to the requested edition's stable URL. */
export function LanguageSwitch() {
  const locale = useLocale();
  const navigate = useNavigate();
  const { pathname, search, hash } = useLocation();
  // Explicit language switching uses the raw router, bypassing same-edition navigation.
  const chineseAvailable = hasChineseRoute(pathname);
  function choose(value: Locale) {
    rememberLanguage(value);
    void navigate(languageSwitchPath(pathname, search, hash, value));
  }
  return (
    <label className="inline-flex items-center gap-1.5 text-[12px] text-ink-3">
      {/* Phones have no room for the word; the select keeps its own accessible name. */}
      <span className="hidden lg:inline">{locale === "en" ? "Language" : "语言"}</span>
      <select aria-label={locale === "en" ? "Edition language" : "版本语言"} value={locale}
        onChange={(event) => choose(event.target.value as Locale)}
        className="h-[34px] rounded-full border border-line bg-bg-sunk px-2 text-ink">
        <option value="en">English</option>
        <option value="zh" disabled={!chineseAvailable}>中文</option>
      </select>
    </label>
  );
}
