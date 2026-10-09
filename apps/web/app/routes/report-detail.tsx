import { localeFromMatches } from "../lib/i18n";
import { SITE, withSubject } from "@aihot/industry/site";
import { data, useLoaderData, useRouteLoaderData } from "react-router";
import type { Route } from "./+types/report-detail";
import type { ReportDetail, ReportNavigationEntry, ReportKind } from "@aihot/contracts/site";
import { requestAt } from "../features/chrono/at";
import { apiGet, loadOr404 } from "../lib/api.server";
import { pageMeta, titled } from "../lib/seo";
import { beijingDate } from "../lib/format";
import { ReportLayout } from "../features/report/ReportLayout";
import { ReportDeck, ReportPaper } from "../features/report/ReportPaper";
import { FEATURES } from "@aihot/industry/features";
import type { loader as rootLoader } from "../root";
import { Deck } from "../components/shell/Deck";
import { TimeDial } from "../features/chrono/TimeMachine";

import { KIND_LABEL, kindFromPath } from "../features/report/format";

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
    apiGet<{ items: ReportNavigationEntry[] }>(`/api/site/reports/${kind}/navigation/${key}`, { request, signal: request.signal }),
  ]);
  const at = requestAt(request);
  return { report, index, today: at ?? beijingDate(Date.now()), at };
}

export function meta({ matches, loaderData }: Route.MetaArgs) {
  if (!loaderData) return [{ title: titled("报告不存在") }, { name: "robots", content: "noindex" }];
  const r = loaderData.report;
  return pageMeta({
    title: r.kind === "daily" ? `${withSubject("日报")} ${r.key}` : r.title.replace(`${SITE.name} `, `${SITE.subject} `),
    description: r.lead?.leadParagraph ?? r.overview?.slice(0, 150) ?? `${SITE.name} ${r.key} 的${withSubject(KIND_LABEL[r.kind])}。`,
    path: `/${r.kind}/${r.key}`,
    image: `/og/reports/${r.kind}/${r.key}.png`,
    type: "article",
    noindex: !!loaderData.at,
  }, localeFromMatches(matches ?? []));
}

export function headers() {
  return { "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=600" };
}

export default function ReportDetailPage() {
  const { report, index, today } = useLoaderData<typeof loader>();
  const root = useRouteLoaderData<typeof rootLoader>("root");
  const dial = FEATURES.timeMachine && <TimeDial bounds={root?.timeBounds ?? null} className="w-[300px] max-w-full" />;
  return (
    <ReportLayout kind={report.kind} index={index} current={report.key} today={today} deck={<ReportDeck report={report} index={index} aside={dial} />}>
      <ReportPaper report={report} index={index} />
    </ReportLayout>
  );
}
