import { hasAlternateEdition } from "../lib/edition-meta.server";
import { contentHtmlLanguage } from "../lib/content-language";
import { localePath, requestLocale } from "../lib/locale";
import { localeFromMatches, Text, translate, useTranslate } from "../lib/i18n";
import { REPORTS, SEO_TITLES, SITE } from "@aihot/site";
import { redirect, useLoaderData, useRouteLoaderData } from "react-router";
import type { Route } from "./+types/report-latest";
import { reportDateLabel, type ReportLatestPage as ReportLatest } from "@aihot/contracts/site";
import { cachedPage, loadOr404 } from "../lib/api.server";
import { pageReuse } from "../lib/page-reuse";
import { requestAt, withAt } from "../features/chrono/at";
import { newsArticleLd, pageMeta, reportDescription } from "../lib/seo";
import { zonedDate } from "@aihot/contracts/time";
import { EmptyState } from "../components/ui/Page";
import { ReportLayout } from "../features/report/ReportLayout";
import { ReportDeck, ReportPaper } from "../features/report/ReportPaper";
import { FEATURES } from "@aihot/industry/features";
import type { loader as rootLoader } from "../root";
import { Deck } from "../components/shell/Deck";
import { TimeDial } from "../features/chrono/TimeMachine";

import { KIND_LABEL, KIND_PATH, feedLink, kindFromPath } from "../features/report/format";

export { pageHeaders as headers } from "../lib/api.server";
export const { clientLoader, shouldRevalidate } = pageReuse<typeof loader>();

export async function loader({ request }: Route.LoaderArgs) {
  const kind = kindFromPath(new URL(request.url).pathname);
  // Time machine: the issue a reader had on that day (the bar stays set on it).
  const at = requestAt(request);
  if (at) {
    const { key } = await loadOr404<{ key: string | null }>(`/api/site/reports/${kind}/at/${at}`, { request, signal: request.signal });
    if (key) throw redirect(localePath(withAt(`/${kind}/${key}`, at), requestLocale(request)));
    // Before the first issue: nothing had been published yet.
    return cachedPage(600, { kind, report: null, index: [], alternateEdition: false, today: at, at });
  }
  const { index, report } = await loadOr404<ReportLatest>(`/api/site/reports/${kind}/latest-page`, { request, signal: request.signal });
  return cachedPage(600, { kind, report, index, alternateEdition: report ? await hasAlternateEdition(`/api/site/reports/${kind}/${report.key}`, report, request) : false, today: zonedDate(Date.now(), report?.reportTimeZone ?? "Asia/Shanghai"), at });
}

export function meta({ matches, loaderData }: Route.MetaArgs) {
  const kind = loaderData?.kind ?? "daily";
  const locale = localeFromMatches(matches ?? []);
  const report = loaderData?.report;
  // What this issue says, so a search result shows its date and news rather than what the page is.
  const description = (report && !loaderData?.at && reportDescription(report, locale)) || (locale === "en" ? kind === "daily" ? `${SITE.name} daily AI briefing, published at 08:00 (${report?.reportTimeZone ?? "Asia/Shanghai"}).` : kind === "weekly" ? "A weekly review." : "A monthly review." : `${REPORTS.descriptions[kind]}。`);
  const article = !!report && !loaderData?.at;
  // One address however it was written (/daily/, a different case): the router matches them all.
  const path = KIND_PATH[kind];
  return [...pageMeta({
    content: report,
    alternates: !!loaderData?.alternateEdition,
    // The Chinese edition is searched by the issue's date; the English one keeps the section's name.
    title: report && locale === "zh" ? SEO_TITLES.latestReport(kind, reportDateLabel(kind, report.key)) : `AI ${KIND_LABEL[kind]}`,
    description,
    path,
    noindex: !!loaderData?.at,
    image: `/og/pages/${kind}.png`,
    type: article ? "article" : "website",
    publishedTime: article ? report.generatedAt : undefined,
    // The latest issue, described at this page's own address (its canonical).
    jsonLd: report && !loaderData?.at ? newsArticleLd({ path, headline: translate(locale, `AI ${KIND_LABEL[kind]}`), description, image: `/og/reports/${kind}/${report.key}.png`, datePublished: report.generatedAt, inLanguage: contentHtmlLanguage(report, locale) }) : undefined,
  }, locale), feedLink(kind, locale)];
}

export default function ReportLatestPage() {
  const tx = useTranslate();
  const { kind, report, index, today } = useLoaderData<typeof loader>();
  const root = useRouteLoaderData<typeof rootLoader>("root");
  const dial = FEATURES.timeMachine && <TimeDial bounds={root?.timeBounds ?? null} className="w-[300px] max-w-full" />;
  const deck = report ? <ReportDeck report={report} index={index} aside={dial} /> : <Deck art="masthead-press" label={`AI ${tx(KIND_LABEL[kind])}`} title={`AI ${tx(KIND_LABEL[kind])}`} aside={dial} />;
  return (
    <ReportLayout kind={kind} index={index} current={report?.key ?? null} today={today} archive={!(report && kind === "daily")} deck={deck}>
      {report ? <ReportPaper report={report} index={index} /> : <EmptyState title={tx("还没有发布 AI {0}", KIND_LABEL[kind])}><Text value="第一期发布后会出现在这里。" /></EmptyState>}
    </ReportLayout>
  );
}
