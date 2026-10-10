import { localeFromMatches } from "../lib/i18n";
import { SITE } from "@aihot/industry/site";
import { useSearchParams } from "react-router";
import { Onboarding } from "../features/onboarding/Onboarding";
import { pageMeta } from "../lib/seo";

export function headers() {
  return { "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=600" };
}

export function meta({ matches }: { matches?: Array<{ id: string; data?: unknown }> } = {}) {
  return pageMeta({ title: "订阅日报", description: `订阅 ${SITE.name} 日报：每天一封 AI 圈值得看的几件事。免费，随时一键退订。`, path: "/subscribe", noindex: true }, localeFromMatches(matches ?? []));
}

/** The sign-up as a page (from the navigation), and where the confirmation letter's link lands. */
export default function Subscribe() {
  const [params] = useSearchParams();
  const token = params.get("token");
  return (
    <div className="pt-3 lg:pt-0">
      <Onboarding mode="page" token={token} />
    </div>
  );
}
