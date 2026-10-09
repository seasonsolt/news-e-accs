import { useLocale } from "../../lib/i18n";
import { LANGUAGE_COOKIE, type Locale } from "../../lib/locale";

/** A manual preference survives navigation and is visible to SSR on the next request. */
export function LanguageSwitch() {
  const locale = useLocale();
  function choose(value: Locale) {
    document.cookie = `${LANGUAGE_COOKIE}=${value}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
    location.reload();
  }
  return (
    <label className="inline-flex items-center gap-1.5 text-[12px] text-ink-3">
      <span>{locale === "en" ? "Language" : "语言"}</span>
      <select aria-label={locale === "en" ? "Interface language" : "界面语言"} value={locale}
        onChange={(event) => choose(event.target.value as Locale)}
        className="h-[34px] rounded-full border border-line bg-bg-sunk px-2 text-ink">
        <option value="en">English</option>
        <option value="zh">中文</option>
      </select>
    </label>
  );
}
