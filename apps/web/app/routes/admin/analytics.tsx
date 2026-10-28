import { redirect } from "react-router";
import type { Route } from "./+types/analytics";

// 访问统计 is now part of the growth dashboard: its interaction and MCP counts are the 出口 tab.
export function loader({ request }: Route.LoaderArgs) {
  const days = new URL(request.url).searchParams.get("days");
  return redirect(`/admin/metrics?tab=outlets${days ? `&days=${encodeURIComponent(days)}` : ""}`, 301);
}
