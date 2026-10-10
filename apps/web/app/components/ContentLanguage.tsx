import { useLocale } from "../lib/i18n";
import { editionPending, type LanguageContent } from "../lib/content-language";

export function ContentLanguage({ content }: { content: LanguageContent }) {
  const locale = useLocale();
  if (!editionPending(content, locale)) return null;
  return <p className="my-2 text-xs text-ink-4">{locale === "en" ? "English edition pending · Original content" : "中文版本尚未就绪 · 显示原文"}</p>;
}
