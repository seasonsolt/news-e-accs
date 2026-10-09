/** Interface languages. Published articles retain their original editorial language. */
export type Locale = "en" | "zh";
export const LANGUAGE_COOKIE = "eacc_language";
export function supportedLocale(value: string | null | undefined): Locale | null {
  if (!value) return null;
  if (/^en(?:-|$)/i.test(value)) return "en";
  if (/^zh(?:-|$)/i.test(value)) return "zh";
  return null;
}
export function preferredLanguage(header: string | null): Locale {
  const preferences = (header ?? "").split(",").map((entry, index) => {
    const [language, ...parameters] = entry.trim().split(";");
    const qParameter = parameters.find((p) => p.trim().startsWith("q="));
    const weight = qParameter ? Number(qParameter.trim().slice(2)) : 1;
    return { language, weight, index };
  }).filter((p) => Number.isFinite(p.weight) && p.weight > 0 && p.weight <= 1)
    .sort((a, b) => b.weight - a.weight || a.index - b.index);
  for (const preference of preferences) {
    const locale = supportedLocale(preference.language);
    if (locale) return locale;
    if (preference.language === "*") return "en";
  }
  return "en";
}
export function requestLocale(request: Request): Locale {
  const cookie = request.headers.get("cookie") ?? "";
  for (const part of cookie.split(";")) {
    const [name, value] = part.trim().split("=");
    if (name === LANGUAGE_COOKIE && (value === "en" || value === "zh")) return value;
  }
  return preferredLanguage(request.headers.get("accept-language"));
}
export function htmlLanguage(locale: Locale): string { return locale === "zh" ? "zh-CN" : "en"; }
