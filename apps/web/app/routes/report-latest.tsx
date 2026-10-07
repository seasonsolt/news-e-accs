import { SITE, withSubject } from "@aihot/industry/site";
import { redirect, useLoaderData, useRouteLoaderData } from "react-router";
import type { Route } from "./+types/report-latest";
import type { ReportDetail, ReportNavigationEntry } from "@aihot/contracts/site";
import { loadOr404 } from "../lib/api.server";
import { requestAt, withAt } from "../features/chrono/at";
import { pageMeta } from "../lib/seo";
import { beijingDate } from "../lib/format";
import { EmptyState } from "../components/ui/Page";
import { ReportLayout } from "../features/report/ReportLayout";
import { ReportDeck, ReportPaper } from "../features/report/ReportPaper";
import { FEATURES } from "@aihot/industry/features";
import type { loader as rootLoader } from "../root";
import { Deck } from "../components/shell/Deck";
import { TimeDial } from "../features/chrono/TimeMachine";

import { KIND_LABEL, kindFromPath } from "../features/report/format";

export async function loader({ request }: Route.LoaderArgs) {
  const kind = kindFromPath(new URL(request.url).pathname);
  // Time machine: the issue a reader had on that day (the bar stays set on it).
  const at = requestAt(request);
  if (at) {
    const { key } = await loadOr404<{ key: string | null }>(`/api/site/reports/${kind}/at/${at}`, { signal: request.signal });
    if (key) throw redirect(withAt(`/${kind}/${key}`, at));
    // Before the first issue: nothing had been published yet.
    return { kind, report: null, index: [], today: at, at };
  }
  const { index, report } = await loadOr404<{ index: ReportNavigationEntry[]; report: ReportDetail | null }>(`/api/site/reports/${kind}/latest-page`, { signal: request.signal });
  return { kind, report, index, today: beijingDate(Date.now()), at };
}

export function meta({ loaderData, location }: Route.MetaArgs) {
  const kind = loaderData?.kind ?? "daily";
  return pageMeta({
    title: `AI ${KIND_LABEL[kind]}`,
    description: kind === "daily" ? `${SITE.name} 每天 08:00（北京时间）发布的${withSubject("日报")}。` : kind === "weekly" ? "每周综合回顾。" : "每月盘点。",
    path: location.pathname,
    noindex: !!loaderData?.at,
    image: `/og/pages/${kind}.png`,
  });
}

export function headers() {
  return { "Cache-Control": "public, max-age=0, s-maxage=600, stale-while-revalidate=300" };
}

export default function ReportLatestPage() {
  const { kind, report, index, today } = useLoaderData<typeof loader>();
  const root = useRouteLoaderData<typeof rootLoader>("root");
  const dial = FEATURES.timeMachine && <TimeDial bounds={root?.timeBounds ?? null} className="w-[300px] max-w-full" />;
  const deck = report ? <ReportDeck report={report} index={index} aside={dial} /> : <Deck art="masthead-press" label={`AI ${KIND_LABEL[kind]}`} title={`AI ${KIND_LABEL[kind]}`} aside={dial} />;
  return (
    <ReportLayout kind={kind} index={index} current={report?.key ?? null} today={today} deck={deck}>
      {report ? <ReportPaper report={report} index={index} /> : <EmptyState title={`还没有发布 AI ${KIND_LABEL[kind]}`}>第一期发布后会出现在这里。</EmptyState>}
    </ReportLayout>
  );
}
