import { htmlLanguage, type Locale } from "./locale.ts";

/** Structural DTO contract also accepts legacy records without an editorialLanguage field. */
export interface LanguageContent {
  editorialLanguage?: "en" | "zh";
  contentLanguage?: { requested?: Locale; status: string; sourceLanguage?: string; language?: string };
  title?: string;
  summary?: string | null;
}
export function contentLocale(content: LanguageContent, requested: Locale): Locale | null {
  const state = content.contentLanguage;
  if (state?.language !== undefined) return state.language === "en" || state.language === "zh" ? state.language : null;
  if (state?.status === "translated") return state.requested ?? requested;
  if (state?.sourceLanguage === "en" || state?.sourceLanguage === "zh") return state.sourceLanguage;
  if (content.editorialLanguage) return content.editorialLanguage;
  // Legacy DTOs omit the language state for Chinese originals. Do not label them English.
  if (/[\p{Script=Han}]/u.test(`${content.title ?? ""}${content.summary ?? ""}`)) return "zh";
  return null;
}
export function contentHtmlLanguage(content: LanguageContent, requested: Locale): string | undefined {
  const locale = contentLocale(content, requested);
  return locale ? htmlLanguage(locale) : undefined;
}
export function editionPending(content: LanguageContent, requested: Locale): boolean {
  const actual = contentLocale(content, requested);
  return actual !== requested;
}
/** A successful auxiliary edition proves both versions exist; a native DTO proves only itself. */
export function hasBothEditions(content: LanguageContent): boolean {
  const state = content.contentLanguage;
  return state?.status === "translated" && (state.language === undefined || state.language === state.requested);
}
export function bodyLocale(state: { requested?: Locale; status: string; sourceLanguage?: string; language?: string } | undefined, requested: Locale, originalLanguage?: string | null): string | null {
  const actual = state?.language;
  if (actual !== undefined) {
    if (["unknown", "original", "und"].includes(actual)) return null;
    try { return new Intl.Locale(actual).language; } catch { return null; }
  }
  if (state?.status === "translated") return state.requested ?? requested;
  if (state?.status === "original-english") return "en";
  const original = state?.sourceLanguage ?? originalLanguage;
  return original === "en" || original === "zh" ? original : null;
}
