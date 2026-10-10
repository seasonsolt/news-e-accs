import { apiGet } from "./api.server.ts";
import { contentLocale, type LanguageContent } from "./content-language.ts";
import { requestLocale } from "./locale.ts";

/** Verify the other saved edition before publishing reciprocal SEO links. No model calls. */
export async function hasAlternateEdition(path: string, content: LanguageContent, request: Request): Promise<boolean> {
  const locale = requestLocale(request);
  if (!content.title?.trim() || contentLocale(content, locale) !== locale) return false;
  const other = locale === "en" ? "zh" : "en";
  try {
    const counterpart = await apiGet<LanguageContent>(path, { lang: other, request, signal: AbortSignal.any([request.signal, AbortSignal.timeout(1_000)]) });
    return !!counterpart.title?.trim() && contentLocale(counterpart, other) === other;
  } catch (error) {
    if (request.signal.aborted) throw error;
    return false;
  }
}
