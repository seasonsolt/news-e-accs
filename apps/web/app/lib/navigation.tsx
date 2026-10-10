import { useCallback } from "react";
import { Link as RouterLink, Form as RouterForm, useNavigate as useRouterNavigate, type LinkProps, type FormProps, type NavigateFunction, type NavigateOptions, type To } from "react-router";
import { useLocale } from "./i18n";
import { localePath, type Locale } from "./locale";

function localizedTo(to: To, locale: Locale): To {
  return typeof to === "string" ? localePath(to, locale) : { ...to, ...(to.pathname ? { pathname: localePath(to.pathname, locale) } : {}) };
}
/** Public navigation shares one rule for links, forms and imperative navigation. */
export function Link({ to, ...props }: LinkProps) {
  return <RouterLink {...props} to={localizedTo(to, useLocale())} />;
}
export function Form({ action, ...props }: FormProps) {
  const locale = useLocale();
  return <RouterForm {...props} action={action ? localePath(action, locale) : action} />;
}
export function useNavigate(): NavigateFunction {
  const navigate = useRouterNavigate();
  const locale = useLocale();
  return useCallback((to: To | number, options?: NavigateOptions) => typeof to === "number" ? navigate(to) : navigate(localizedTo(to, locale), options), [navigate, locale]) as NavigateFunction;
}
