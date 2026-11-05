import { localeFromMatches, Text } from "../lib/i18n";
import { subscribeSource } from "@aihot/contracts/subscribe";
import { SITE } from "@aihot/site";
import { useLoaderData, useSearchParams } from "react-router";
import { Onboarding } from "../features/onboarding/Onboarding";
import type { Route } from "./+types/subscribe";
import type { ReportLatestPage } from "@aihot/contracts/site";
import { apiGet } from "../lib/api.server";
import { SubscribePage } from "../features/subscribe/SubscribePage";
import { pageMeta } from "../lib/seo";

export function headers() {
  return { "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=600" };
}

export function meta({ matches }: { matches?: Array<{ id: string; data?: unknown }> } = {}) {
  return pageMeta({ title: "订阅日报", description: `订阅 ${SITE.name} 日报：每天一封 AI 圈值得看的几件事。免费，随时一键退订。`, path: "/subscribe", noindex: true }, localeFromMatches(matches ?? []));
}

export async function loader({ request }: Route.LoaderArgs) {
  if (new URL(request.url).searchParams.has("token")) return { report: null };
  // The sample issue is optional: the sign-up form renders without it.
  const report = await apiGet<ReportLatestPage>("/api/site/reports/daily/latest-page", { request, signal: request.signal }).then((r) => r.report, () => null);
  return { report };
}

/** The sign-up as a page (from the navigation), and where the confirmation letter's link lands. */
export default function Subscribe() {
  const { report } = useLoaderData<typeof loader>();
  const [params] = useSearchParams();
  const token = params.get("token");
  return (
    <div className="pt-3 lg:pt-0">
      {token ? <Onboarding token={token} /> : <SubscribePage report={report} source={subscribeSource(params.get("from")) ?? "subscribe_page"} />}
      {SITE.contactEmail && !token && (
        <p className="text-center text-[13px] text-ink-4">
          <Text value="赞助日报、商务合作：" />
          <a href={`mailto:${SITE.contactEmail}`} className="text-accent hover:underline">{SITE.contactEmail}</a>
        </p>
      )}
    </div>
  );
}
