import { BEIJING_TIMEZONE } from "@aihot/contracts/time";
import type { Locale } from "@aihot/web/lib/locale";

/** "November 12, 2026" or "2026年11月12日": the day in Beijing, as the site's dates are, so server and browser agree. */
export function essayDate(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", { year: "numeric", month: "long", day: "numeric", timeZone: BEIJING_TIMEZONE }).format(new Date(iso));
}

/** The host a picture credit links to, as the body's own captions name it (backend/render.ts). */
export function creditHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
