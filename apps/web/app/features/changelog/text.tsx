import { weekdayShort } from "../../lib/format";
import type { Locale } from "../../lib/locale";

/** Release notes carry a little Markdown: **bold** runs. */
export function Inline({ text }: { text: string }) {
  return <>{text.split(/\*\*(.+?)\*\*/g).map((part, i) => (i % 2 ? <b key={i} className="font-semibold text-ink-2">{part}</b> : part))}</>;
}

export function dateHeading(date: string, locale: Locale = "zh"): { label: string; weekday: string } {
  if (locale === "en") {
    const value = new Date(`${date}T12:00:00+08:00`);
    return {
      label: new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Shanghai", year: "numeric", month: "short", day: "numeric" }).format(value),
      weekday: new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Shanghai", weekday: "long" }).format(value),
    };
  }
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return { label: `${y} 年 ${m} 月 ${d} 日`, weekday: weekdayShort(date) };
}

export function monthHeading(month: string, locale: Locale): string {
  if (locale === "en") return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", year: "numeric", month: "long" }).format(new Date(`${month}-01T00:00:00Z`));
  const [year, number] = month.split("-").map(Number);
  return `${year}年${number}月`;
}
