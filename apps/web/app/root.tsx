import { Link } from "./lib/navigation";
import { requestLocale, localePath, htmlLanguage, type Locale } from "./lib/locale";
import { Text, translate, useLocale, useTranslate } from "./lib/i18n";
import { titled } from "./lib/seo";
import { resolveRedirect } from "@aihot/contracts/http-policy";
import { data, redirect } from "react-router";
import { SITE } from "@aihot/site";
import { FEATURES } from "@aihot/industry/features";
import type { TimeMachineBounds } from "@aihot/contracts/chronicle";
import { isRouteErrorResponse, Links, Meta, Outlet, Scripts, ScrollRestoration, useLoaderData, useLocation, useNavigation, useRouteError, useRouteLoaderData, type ShouldRevalidateFunction } from "react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Route } from "./+types/root";
import "./app.css";
import { SiteNav } from "./components/shell/SiteNav";
import { SiteFooter } from "./components/shell/SiteFooter";
import { MobileTabBar } from "./components/shell/MobileTabBar";
import { BackToTop, NavigationProgress } from "./components/shell/Chrome";
import { LanguageHint } from "./components/shell/LanguageHint";
import { buttonClass } from "./components/ui/Controls";
import { DECK_BLEED_SCRIPT } from "./components/shell/Deck";
import { rememberPage, noteExistingStars, APPEARANCE_BOOT_SCRIPT, MOTION_BOOT_SCRIPT, ONBOARDING_BOOT_SCRIPT, useAppearanceSync } from "./lib/local-state";
import { apiGet } from "./lib/api.server";
import { useHydratedFlag } from "./lib/hydration";
import { webModules } from "./site-modules";
import { EmptyArt } from "./features/art/EmptyArt";
import { NotFoundBoard } from "./features/motion/NotFoundBoard";
import { TimeBar } from "./features/chrono/TimeMachine";
import { useAt } from "./features/chrono/at";

export const links: Route.LinksFunction = () => [
  { rel: "icon", href: "/favicon.ico", sizes: "any" },
  { rel: "icon", type: "image/png", href: "/icon.png" },
  { rel: "apple-touch-icon", href: "/apple-icon.png" },
  { rel: "manifest", href: "/manifest.webmanifest" },
];

interface SiteMeta {
  locale: Locale;
  changelogVersion: string | null;
  /** Where the site's own record begins, for the time machine (null when it is off or unreadable). */
  timeBounds: TimeMachineBounds | null;
  /** The release rendering this document: once a newer one is deployed, a render error reloads the page (entry.client). */
  release: string | null;
}

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  // Router must encode redirects for .data navigation; HTTP redirects cannot carry route data.
  const rawPath = url.pathname.replace(/\.data$/, "");
  const path = rawPath.replace(/^\/zh(?=\/|$)/, "") || "/";
  const decision = resolveRedirect(path, url.search);
  if (decision) {
    if (decision.location) throw redirect(localePath(decision.location, requestLocale(request)), { status: decision.status, headers: decision.headers });
    throw data({ message: "not_found" }, { status: decision.status, headers: decision.headers });
  }
  const [meta, timeBounds] = await Promise.all([
    apiGet<{ changelogVersion: string | null }>("/api/site/meta", {
      request,
      headers: Object.assign({}, ...webModules().map((m) => m.root?.documentHeaders?.(request) ?? {})),
      signal: request.signal,
    }).catch(() => ({ changelogVersion: null })),
    FEATURES.timeMachine ? apiGet<TimeMachineBounds>("/api/site/chronicle/bounds", { request, signal: request.signal }).catch(() => null) : null,
  ]);
  return { locale: requestLocale(request), changelogVersion: meta.changelogVersion, timeBounds, release: process.env.AIHOT_RELEASE ?? null } satisfies SiteMeta;
}

export const shouldRevalidate: ShouldRevalidateFunction = ({ currentUrl, nextUrl }) => requestLocale(new Request(currentUrl)) !== requestLocale(new Request(nextUrl));

export function Layout({ children }: { children: React.ReactNode }) {
  const at = useAt();
  const locale = useLocale();
  const site = useRouteLoaderData<typeof loader>("root");
  const [documentRelease] = useState(site?.release ?? null);
  return (
    <html lang={htmlLanguage(locale)} suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        {documentRelease && <meta name="aihot-release" content={documentRelease} />}
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="theme-color" media="(prefers-color-scheme: light)" content="#f4ecdc" />
        <meta name="theme-color" media="(prefers-color-scheme: dark)" content="#15110d" />
        <meta name="apple-mobile-web-app-title" content={SITE.name} />
        <script dangerouslySetInnerHTML={{ __html: APPEARANCE_BOOT_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: MOTION_BOOT_SCRIPT }} />
        {!at && <script dangerouslySetInnerHTML={{ __html: ONBOARDING_BOOT_SCRIPT }} />}
        {webModules().map((m) => m.root?.bootScript && <script key={m.name} dangerouslySetInnerHTML={{ __html: m.root.bootScript }} />)}
        <Meta />
        <Links />
        <link rel="alternate" type="application/rss+xml" title={`${SITE.name} — ${locale === "en" ? "Picks" : "精选"}`} href={`/feed/v2${locale === "zh" ? "/zh" : ""}/picks.xml`} />
      </head>
      <body>
        <script dangerouslySetInnerHTML={{ __html: DECK_BLEED_SCRIPT }} />
        {children}
        <ScrollRestoration getKey={(location) => location.key} />
        <Scripts />
      </body>
    </html>
  );
}

/** Only a page nobody matched falls back to this; every page names itself. */
export function meta({ error, loaderData }: Route.MetaArgs) {
  if (!error) return [];
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  return [{ title: titled(translate(loaderData?.locale ?? "en", notFound ? "页面不存在" : "暂时无法加载")) }, { name: "robots", content: "noindex" }];
}

/** The deck's top bar, the page (or an error), the footer and the phone tab bar. */
function SiteShell({ changelogVersion, timeBounds, children }: { changelogVersion: string | null; timeBounds: TimeMachineBounds | null; children: ReactNode }) {
  const navigation = useNavigation();
  return (
    <div className="flex min-h-dvh flex-col">
      <NavigationProgress active={navigation.state === "loading"} />
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[70] focus:rounded-control focus:bg-surface focus:px-3 focus:py-2"><Text value="跳到正文" /></a>
      <SiteNav changelogVersion={changelogVersion} kardashev={timeBounds?.kardashev ?? null} />
      {/* One centred column (640px on phones, the list width on desktop), 16px below the top bar; a
          page's Deck spans the window from inside it and takes up those 16px to sit flush. */}
      <main id="main" className="min-w-0 flex-1 overflow-x-clip pb-[calc(72px+env(safe-area-inset-bottom))] lg:pb-12">
        <div className="mx-auto w-full max-w-[640px] px-4 pt-4 lg:max-w-[var(--page-max-wide)] lg:px-8">
          <TimeBar bounds={timeBounds} />
          {webModules().map((m) => m.root?.Top && <m.root.Top key={m.name} />)}
          {children}
        </div>
      </main>
      <SiteFooter />
      <MobileTabBar changelogVersion={changelogVersion} />
      <BackToTop />
      <LanguageHint />
    </div>
  );
}

export default function App() {
  const meta = useLoaderData<typeof loader>();
  useHydratedFlag();
  useAppearanceSync();
  const { pathname, search } = useLocation();
  const countedPath = useRef<string | null>(null);
  useEffect(() => rememberPage(pathname + search), [pathname, search]);
  useEffect(() => { noteExistingStars(); }, []);
  useEffect(() => {
    if (pathname === "/admin" || pathname.startsWith("/admin/") || countedPath.current === pathname) return;
    countedPath.current = pathname;
    void fetch("/api/site/analytics", {
      method: "POST",
      credentials: "omit",
      cache: "no-store",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event: "page_view", path: pathname }),
    }).catch(() => {});
  }, [pathname]);
  // iOS Safari only shows :active (pressed) styles once the document listens for touches.
  useEffect(() => {
    const noop = () => {};
    document.addEventListener("touchstart", noop, { passive: true });
    return () => document.removeEventListener("touchstart", noop);
  }, []);
  // The admin has its own chrome.
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return <Outlet />;
  return (
    <>
      <SiteShell changelogVersion={meta.changelogVersion} timeBounds={meta.timeBounds}>
        <Outlet />
      </SiteShell>
      {webModules().map((m) => m.root?.Bottom && <m.root.Bottom key={m.name} />)}
    </>
  );
}

export function ErrorBoundary() {
  useAppearanceSync();
  const tx = useTranslate();
  const error = useRouteError();
  const site = useRouteLoaderData<typeof loader>("root");
  const { pathname, search, hash } = useLocation();
  const status = isRouteErrorResponse(error) ? error.status : 500;
  const notFound = status === 404;
  const body = (
    <div className="flex min-h-[70vh] items-center justify-center px-2 py-16">
      <div className="max-w-sm text-center">
        <EmptyArt lazy={false} className="mx-auto mb-6 w-[min(320px,85%)]" />
        {notFound ? <NotFoundBoard /> : <div className="mono text-[12px] text-ink-4">{status}</div>}
        <h1 className="mt-1.5 text-[20px] font-bold text-ink">{notFound ? tx("这里没有内容") : tx("暂时无法加载")}</h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-ink-3">
          {notFound ? tx("你访问的页面不存在，或内容已不再公开。") : tx("页面暂时无法显示，请重新加载后再试。")}
        </p>
        {notFound && <p data-telegraph-caption="" className="mono mt-3 text-[11px] tracking-wide text-ink-4"><Text value="电报未送达 · 线路上没有这一页" /></p>}
        <div className="mt-6 flex flex-wrap justify-center gap-2.5">
          {!notFound && <a href={pathname + search + hash} className={buttonClass("primary")}><Text value="重新加载" /></a>}
          <Link reloadDocument to="/" className={buttonClass(notFound ? "primary" : "secondary")}><Text value="回到精选" /></Link>
          <Link reloadDocument to="/all" className={buttonClass("secondary")}><Text value="浏览全部动态" /></Link>
        </div>
      </div>
    </div>
  );
  // Admin errors stay inside the admin's own chrome.
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return body;
  return <SiteShell changelogVersion={site?.changelogVersion ?? null} timeBounds={site?.timeBounds ?? null}>{body}</SiteShell>;
}
