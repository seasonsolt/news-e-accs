import { useRouteLoaderData } from "react-router";
import { translate } from "./translate";
export { translate } from "./translate";
import type { Locale } from "./locale";

export function useLocale(): Locale {
  const root = useRouteLoaderData<{ locale: Locale }>("root");
  return root?.locale ?? "en";
}
export function useTranslate() {
  const locale = useLocale();
  return (message: string, ...values: Array<unknown>) => translate(locale, message, ...values);
}
/** Static JSX copy can be localized even inside small render helpers without calling hooks there. */
export function Text({ value }: { value: string }) {
  return useTranslate()(value);
}
export function localeFromMatches(matches: ReadonlyArray<{ id: string; data?: unknown; loaderData?: unknown } | undefined>): Locale {
  const root = (matches.find((match) => match?.id === "root")?.loaderData ?? matches.find((match) => match?.id === "root")?.data) as { locale?: Locale } | undefined;
  return root?.locale ?? "en";
}
