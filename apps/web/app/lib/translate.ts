import { CHINESE, ENGLISH } from "./messages.ts";
import type { Locale } from "./locale.ts";

const dictionaries = { en: { ...ENGLISH }, zh: { ...CHINESE } };
let patterns: ReturnType<typeof messagePatterns> | null = null;

/** Modules register their interface copy when defineWebModule loads their web entry. */
export function registerMessages(messages: Partial<Record<Locale, Readonly<Record<string, string>>>>) {
  for (const locale of ["en", "zh"] as const) Object.assign(dictionaries[locale], messages[locale]);
  patterns = null;
}

function messagePatterns() {
  return Object.entries(dictionaries.en).filter(([key]) => /\{\d+\}/.test(key)).map(([key, value]) => {
    const captures: number[] = [];
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const source = escaped.replace(/\\\{(\d+)\\\}/g, (_match, index: string) => { captures.push(Number(index)); return "(.+?)"; });
    return { pattern: new RegExp(`^${source}$`), value, captures, specificity: key.replace(/\{\d+\}/g, "").length };
  }).sort((a, b) => b.specificity - a.specificity);
}
/** Translate explicitly identified interface copy, never a whole article or a rendered HTML tree. */
export function translate(locale: Locale, message: string, ...values: Array<unknown>): string {
  let template = dictionaries[locale][message] ?? message;
  if (locale === "en") {
    // Existing date and report helpers produce formatted strings; match complete messages only.
    if (template === message && values.length === 0) {
      const compactDate = /^(\d{4})年(\d{1,2})月(\d{1,2})日(?: (周[日一二三四五六]))?$/.exec(message);
      if (compactDate) return `${compactDate[1]}-${compactDate[2]!.padStart(2, "0")}-${compactDate[3]!.padStart(2, "0")}${compactDate[4] ? ` ${dictionaries.en[compactDate[4]]}` : ""}`;
      const date = /^(\d{4}) 年 (\d{1,2}) 月 (\d{1,2}) 日 · (星期[日一二三四五六])$/.exec(message);
      if (date) return `${date[1]}-${date[2]!.padStart(2, "0")}-${date[3]!.padStart(2, "0")} · ${dictionaries.en[date[4]!]}`;
      const month = /^(\d{4}) 年 (\d{1,2}) 月$/.exec(message);
      if (month) return `${month[1]}-${month[2]!.padStart(2, "0")}`;
      const year = /^(\d{4})\s*年?$/.exec(message);
      if (year) return year[1]!;
      const count = /^([\d.]+)\s*(万|亿)$/.exec(message);
      if (count) return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 2 }).format(Number(count[1]) * (count[2] === "亿" ? 1e8 : 1e4));
      const chrono = chronicleTime(message);
      if (chrono) return chrono;
      for (const { pattern, value, captures } of patterns ??= messagePatterns()) {
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
  // English counts: "{one|many}" picks by the first value ("Reported by {0} other {source|sources}").
  const one = Number(values[0]) === 1;
  return template.replace(/\{([^{}|]+)\|([^{}|]+)\}/g, (_match, singular: string, plural: string) => (one ? singular : plural))
    .replace(/\{(\d+)\}/g, (match, index: string) => String(values[Number(index)] ?? match));
}

const SPAN = String.raw`(\d+(?:\.\d+)?) ?(亿年|万年|年|个月|天)`;
/** "1.2 亿年" → "120 million years": the time machine's spans, whose numbers carry Chinese units. */
function englishSpan(amount: string, unit: string): string {
  const n = Number(amount) * (unit === "亿年" ? 1e8 : unit === "万年" ? 1e4 : 1);
  const short = (v: number) => String(Math.round(v * 100) / 100);
  const value = n >= 1e9 ? `${short(n / 1e9)} billion` : n >= 1e6 ? `${short(n / 1e6)} million` : n.toLocaleString("en-US");
  return `${value} ${unit === "个月" ? "month" : unit === "天" ? "day" : "year"}${n === 1 ? "" : "s"}`;
}
/** Time machine labels (contracts/chronicle timeLabel and axisTicks, chrono/format distanceLabel and untilLabel). */
function chronicleTime(message: string): string | null {
  let m = new RegExp(`^(约)?${SPAN}前$`).exec(message);
  if (m) return `${m[1] ? "about " : ""}${englishSpan(m[2]!, m[3]!)} ago`;
  m = new RegExp(`^距今 ${SPAN}$`).exec(message);
  if (m) return `${englishSpan(m[1]!, m[2]!)} ago`;
  m = new RegExp(`^${SPAN}后(出现)?$`).exec(message);
  if (m) return `${m[3] ? "Available " : ""}in ${englishSpan(m[1]!, m[2]!)}`;
  m = /^公元前(\d+)年$/.exec(message);
  if (m) return `${m[1]} BCE`;
  m = /^(\d{1,4})年$/.exec(message);
  if (m) return m[1]!;
  m = /^(\d{4})年(\d{1,2})月$/.exec(message);
  if (m) return `${m[1]}-${m[2]!.padStart(2, "0")}`;
  return null;
}
