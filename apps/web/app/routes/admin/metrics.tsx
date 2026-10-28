import { SITE } from "@aihot/site";
import { Link, useSearchParams } from "react-router";
import type { Route } from "./+types/metrics";
import { ConversionTab, RetentionTab } from "../../features/admin/growth/Conversion";
import { AcquisitionTab, ContentTab, OverviewTab } from "../../features/admin/growth/Overview";
import { GrowthBar } from "../../features/admin/growth/shared";
import type { EngagementData, FunnelData, GrowthOverview, JourneysData, RetentionData, SubscribeFunnel, WeeklyData } from "../../features/admin/growth/types";
import { OutletsTab, WeeklyTab } from "../../features/admin/growth/Weekly";
import { AdminPage } from "../../features/admin/ui";
import { adminGet } from "../../lib/admin.server";

const TABS = [
  ["overview", "概览"], ["acquisition", "获客"], ["content", "内容"], ["conversion", "转化"], ["retention", "留存"], ["weekly", "周报"], ["outlets", "出口"],
] as const;
type Tab = (typeof TABS)[number][0];

/** The daily-total endpoints take 7, 30 or 90 days; the closest to the chosen span. */
const totalsDays = (days: number) => (days <= 7 ? 7 : days <= 30 ? 30 : 90);

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const tab = (TABS.find(([t]) => t === url.searchParams.get("tab"))?.[0] ?? "overview") as Tab;
  // The funnel form sends one step parameter per step.
  const steps = url.searchParams.getAll("step").filter(Boolean);
  const params = new URLSearchParams(url.search);
  params.delete("tab");
  params.delete("step");
  if (steps.length) params.set("steps", steps.join(","));
  const search = `?${params}`;
  switch (tab) {
    case "overview":
    case "acquisition":
      return { tab, overview: await adminGet<GrowthOverview>(request, `/api/admin/growth${search}`) };
    case "content": {
      const [overview, journeys] = await Promise.all([
        adminGet<GrowthOverview>(request, `/api/admin/growth${search}`),
        adminGet<JourneysData>(request, `/api/admin/growth/journeys${search}`),
      ]);
      return { tab, overview, journeys };
    }
    case "conversion": {
      const funnel = await adminGet<FunnelData>(request, `/api/admin/growth/funnel${search}`);
      const days = `?days=${totalsDays(funnel.range.days)}`;
      const [subscribe, engagement] = await Promise.all([
        adminGet<SubscribeFunnel>(request, `/api/admin/analytics/subscribe${days}`),
        adminGet<EngagementData>(request, `/api/admin/analytics${days}`),
      ]);
      return { tab, funnel, subscribe, engagement };
    }
    case "retention":
      return { tab, retention: await adminGet<RetentionData>(request, `/api/admin/growth/retention${search}`) };
    case "weekly":
      return { tab, weekly: await adminGet<WeeklyData>(request, `/api/admin/metrics${search}`) };
    case "outlets":
      return { tab, engagement: await adminGet<EngagementData>(request, `/api/admin/analytics${search}`) };
  }
}

export const meta: Route.MetaFunction = () => [{ title: `增长 · ${SITE.name} 后台` }];

function Tabs({ current }: { current: Tab }) {
  const [sp] = useSearchParams();
  return (
    <nav className="mb-5 flex gap-1 overflow-x-auto overflow-y-hidden border-b border-line" aria-label="增长看板">
      {TABS.map(([tab, label]) => {
        const next = new URLSearchParams(sp);
        if (tab === "overview") next.delete("tab");
        else next.set("tab", tab);
        // Each tab reads its own parameters; the funnel's steps and the weekly window stay with their tabs.
        if (tab !== "conversion") { next.delete("step"); next.delete("steps"); }
        if (tab !== "weekly" && tab !== "retention") next.delete("weeks");
        if (tab !== "outlets") next.delete("days");
        return (
          <Link key={tab} to={`?${next}`} preventScrollReset aria-current={tab === current ? "page" : undefined}
            className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-[13.5px] transition-colors ${tab === current ? "border-ink font-medium text-ink" : "border-transparent text-ink-3 hover:text-ink"}`}>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

export default function GrowthAdmin({ loaderData: d }: Route.ComponentProps) {
  const sessions = d.tab !== "weekly" && d.tab !== "outlets";
  const overview = d.tab === "overview" || d.tab === "acquisition" || d.tab === "content" ? d.overview : undefined;
  const scoped = overview ?? (d.tab === "conversion" ? d.funnel : undefined);
  return (
    <AdminPage
      title="增长"
      subtitle="读者从哪来、读了什么、有没有留下。访客按当天随机盐对地址和浏览器做哈希区分，第二天盐销毁；机器流量在写入前过滤，被过滤的按原因单列。"
    >
      <Tabs current={d.tab} />
      {sessions && (
        <GrowthBar
          range={scoped?.range}
          filters={d.tab === "retention" ? d.retention.filters : scoped?.filters}
          goal={overview?.goal}
          goals={overview?.goals}
          weeks={d.tab === "retention"}
        />
      )}
      {d.tab === "overview" && <OverviewTab d={d.overview} />}
      {d.tab === "acquisition" && <AcquisitionTab d={d.overview} />}
      {d.tab === "content" && <ContentTab d={d.overview} journeys={d.journeys} />}
      {d.tab === "conversion" && <ConversionTab funnel={d.funnel} subscribe={d.subscribe} engagement={d.engagement} />}
      {d.tab === "retention" && <RetentionTab r={d.retention} />}
      {d.tab === "weekly" && <WeeklyTab d={d.weekly} />}
      {d.tab === "outlets" && <OutletsTab d={d.engagement} />}
    </AdminPage>
  );
}
