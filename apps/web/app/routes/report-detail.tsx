import { hasAlternateEdition } from "../lib/edition-meta.server";
import { contentHtmlLanguage } from "../lib/content-language";
import { localeFromMatches, translate } from "../lib/i18n";
import { SITE, withSubject } from "@aihot/site";
import { data, useLoaderData, useRouteLoaderData } from "react-router";
import type { Route } from "./+types/report-detail";
import type { ReportDetail, ReportNavigationResponse, ReportKind } from "@aihot/contracts/site";
import { requestAt } from "../features/chrono/at";
import { apiGet, cachedPage, loadOr404 } from "../lib/api.server";
import { pageReuse } from "../lib/page-reuse";
import { newsArticleLd, pageMeta, reportDescription, titled } from "../lib/seo";
import { zonedDate } from "@aihot/contracts/time";
import { ReportLayout } from "../features/report/ReportLayout";
import { ReportDeck, ReportPaper } from "../features/report/ReportPaper";
import { FEATURES } from "@aihot/industry/features";
import type { loader as rootLoader } from "../root";
import { TimeDial } from "../features/chrono/TimeMachine";

import { KIND_LABEL, feedLink, kindFromPath } from "../features/report/format";

export { pageHeaders as headers } from "../lib/api.server";
export const { clientLoader, shouldRevalidate } = pageReuse<typeof loader>();

const PATTERN: Record<ReportKind, RegExp> = {
  daily: /^\d{4}-\d{2}-\d{2}$/,
  weekly: /^\d{4}-W\d{2}$/,
  monthly: /^\d{4}-\d{2}$/,
};

export async function loader({ request, params }: Route.LoaderArgs) {
  const kind = kindFromPath(new URL(request.url).pathname);
  const key = params.key ?? "";
  if (!PATTERN[kind].test(key)) throw data({ message: "not_found" }, { status: 404 });
  const [report, { items: index }] = await Promise.all([
    loadOr404<ReportDetail>(`/api/site/reports/${kind}/${key}`, { request, signal: request.signal }),
    apiGet<ReportNavigationResponse>(`/api/site/reports/${kind}/navigation/${key}`, { request, signal: request.signal }),
  ]);
  const at = requestAt(request);
  return cachedPage(3600, { report, index, alternateEdition: await hasAlternateEdition(`/api/site/reports/${kind}/${key}`, report, request), today: at ?? zonedDate(Date.now(), report.reportTimeZone ?? "Asia/Shanghai"), at });
}

export function meta({ matches, loaderData }: Route.MetaArgs) {
  if (!loaderData) return [{ title: titled(translate(localeFromMatches(matches ?? []), "报告不存在")) }, { name: "robots", content: "noindex" }];
  const r = loaderData.report;
  const locale = localeFromMatches(matches ?? []);
  // The issue's date and its editorial lead; without one, the first highlight the issue carries as an entry
  // (the reports a thin daily's highlights were filled with are not its news).
  const entries = new Set(r.sections.flatMap((s) => s.items.map((i) => i.itemId)));
  const lead = r.lead?.title.trim() || r.highlights.find((item) => item.available && entries.has(item.itemId))?.title.trim();
  const name = `${translate(locale, withSubject(KIND_LABEL[r.kind]))} ${r.key}`;
  const title = lead ? `${name}${locale === "en" ? ": " : "："}${lead}` : name;
  const description = reportDescription(r, locale) ?? (locale === "en" ? `${SITE.name} ${translate(locale, KIND_LABEL[r.kind])} for ${r.key}.` : `${SITE.name} ${r.key} 的${withSubject(KIND_LABEL[r.kind])}。`);
  const path = `/${r.kind}/${r.key}`;
  const image = `/og/reports/${r.kind}/${r.key}.png`;
  return [...pageMeta({
    content: r,
    alternates: loaderData.alternateEdition,
    title,
    description,
    path,
    image,
    type: "article",
    publishedTime: r.generatedAt,
    noindex: !!loaderData.at,
    jsonLd: loaderData.at ? undefined : newsArticleLd({ path, headline: title, description, image, datePublished: r.generatedAt, inLanguage: contentHtmlLanguage(r, locale) }),
  }, locale), feedLink(r.kind, locale)];
}

export default function ReportDetailPage() {
  const { report, index, today } = useLoaderData<typeof loader>();
  const root = useRouteLoaderData<typeof rootLoader>("root");
  const dial = FEATURES.timeMachine && <TimeDial bounds={root?.timeBounds ?? null} className="w-[300px] max-w-full" />;
  return (
    <ReportLayout kind={report.kind} index={index} current={report.key} today={today} archive={report.kind !== "daily"} deck={<ReportDeck report={report} index={index} aside={dial} />}>
      <ReportPaper report={report} index={index} />
    </ReportLayout>
  );
}
