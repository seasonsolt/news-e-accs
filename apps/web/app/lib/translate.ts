import { CHINESE, ENGLISH } from "./messages.ts";
import type { Locale } from "./locale.ts";

const patterns = Object.entries(ENGLISH).filter(([key]) => /\{\d+\}/.test(key)).map(([key, value]) => {
  const captures: number[] = [];
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const source = escaped.replace(/\\\{(\d+)\\\}/g, (_match, index: string) => { captures.push(Number(index)); return "(.+?)"; });
  return { pattern: new RegExp(`^${source}$`), value, captures, specificity: key.replace(/\{\d+\}/g, "").length };
}).sort((a, b) => b.specificity - a.specificity);
/** Translate explicitly identified interface copy, never a whole article or a rendered HTML tree. */
export function translate(locale: Locale, message: string, ...values: Array<unknown>): string {
  let template = locale === "zh" ? CHINESE[message] ?? message : message;
  if (locale === "en") {
    template = ENGLISH[message] ?? message;
    // Existing date and report helpers produce formatted strings; match complete messages only.
    if (template === message && values.length === 0) {
      const compactDate = /^(\d{4})年(\d{1,2})月(\d{1,2})日(?: (周[日一二三四五六]))?$/.exec(message);
      if (compactDate) return `${compactDate[1]}-${compactDate[2]!.padStart(2, "0")}-${compactDate[3]!.padStart(2, "0")}${compactDate[4] ? ` ${ENGLISH[compactDate[4]]}` : ""}`;
      const date = /^(\d{4}) 年 (\d{1,2}) 月 (\d{1,2}) 日 · (星期[日一二三四五六])$/.exec(message);
      if (date) return `${date[1]}-${date[2]!.padStart(2, "0")}-${date[3]!.padStart(2, "0")} · ${ENGLISH[date[4]!]}`;
      const month = /^(\d{4}) 年 (\d{1,2}) 月$/.exec(message);
      if (month) return `${month[1]}-${month[2]!.padStart(2, "0")}`;
      const year = /^(\d{4})\s*年?$/.exec(message);
      if (year) return year[1]!;
      const count = /^([\d.]+)\s*(万|亿)$/.exec(message);
      if (count) return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 2 }).format(Number(count[1]) * (count[2] === "亿" ? 1e8 : 1e4));
      for (const { pattern, value, captures } of patterns) {
        const match = pattern.exec(message);
        if (!match) continue;
        if (match.slice(1).some((part) => /[\u4e00-\u9fff]/.test(part ?? ""))) continue;
        template = value;
        values = [];
        captures.forEach((index, i) => { values[index] = match[i + 1]; });
        break;
      }
    }
  }
  return template.replace(/\{(\d+)\}/g, (match, index: string) => String(values[Number(index)] ?? match));
}
