import { useNavigate } from "../lib/navigation";
import { localeFromMatches, Text, useTranslate } from "../lib/i18n";
import { useEffect, useState } from "react";
import { data, useLoaderData, useLocation, type ShouldRevalidateFunction } from "react-router";
import { FEATURES } from "@aihot/industry/features";
import { AXIS_FUTURE_YEARS, BIG_BANG, decimalYear, eraAt, timeLabel, toAxis, type ChronicleMilestone, type ChronicleResponse } from "@aihot/contracts/chronicle";
import type { Route } from "./+types/chronicle";
import { loadOr404 } from "../lib/api.server";
import { pageMeta } from "../lib/seo";
import { ChronicleAxis } from "../features/chrono/ChronicleAxis";
import { Observatory } from "../features/chrono/Observatory";
import { distanceLabel, momentParam, timeParam } from "../features/chrono/format";
import { ChronicleReadouts } from "../features/chrono/ChronicleReadouts";

function moment(search: string, now: number) {
  return momentParam(new URLSearchParams(search).get("t"), now) ?? now;
}

export async function loader({ request }: Route.LoaderArgs) {
  if (!FEATURES.timeMachine) throw data({ message: "not_found" }, { status: 404 });
  const now = decimalYear(Date.now());
  const t = moment(new URL(request.url).search, now);
  const chronicle = await loadOr404<ChronicleResponse>("/api/site/chronicle", { request, signal: request.signal });
  return { chronicle, now, t };
}

export const shouldRevalidate: ShouldRevalidateFunction = ({ currentUrl, nextUrl, defaultShouldRevalidate }) => currentUrl.pathname === nextUrl.pathname ? false : defaultShouldRevalidate;

export function meta({ matches }: { matches?: Array<{ id: string; data?: unknown }> } = {}) {
  return pageMeta({ title: "加速史：从大爆炸到智能体时代的 AI 与文明时间线", description: "从大爆炸到此刻，再到公开的预测：拖动时间轴，看人类在每个时刻掌握了什么。", path: "/chronicle", image: "/og/pages/chronicle.png" }, localeFromMatches(matches ?? []));
}

export function headers() {
  return { "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=600" };
}

export default function ChroniclePage() {
  const tx = useTranslate();
  const { chronicle, now, t: initialT } = useLoaderData<typeof loader>();
  const [t, setT] = useState(initialT);
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => { setT(moment(location.search, now)); }, [location.search, now]);
  const commit = (next: number) => {
    const clamped = Math.min(now + AXIS_FUTURE_YEARS, Math.max(BIG_BANG, next));
    setT(clamped);
    navigate(`?t=${timeParam(clamped, now)}`, { replace: true, preventScrollReset: true });
  };
  const era = eraAt(chronicle.eras, t);
  if (!era) return <p className="py-8 text-ink-3"><Text value="尚无时代数据。" /></p>;
  // Standing on a milestone (a click snaps to one): the deck shows that event and, if drawn, its own plate.
  const u = toAxis(t, now);
  const focus = chronicle.milestones.reduce<ChronicleMilestone | null>((best, m) => {
    const d = Math.abs(toAxis(m.t, now) - u);
    return d < 0.0008 && (!best || d < Math.abs(toAxis(best.t, now) - u)) ? m : best;
  }, null);
  const previous = chronicle.milestones.filter((m) => m.t < t - 1e-6).at(-1);
  const following = chronicle.milestones.find((m) => m.t > t + 1e-6);
  return (
    <div className="chronicle-page pb-8 pt-3 lg:pt-0">
      <Observatory era={era} focus={focus} label={focus ? tx(timeLabel(focus.t, now, focus.precision, focus.date)) : tx(timeLabel(t, now))} distance={tx(distanceLabel(t, now))} />
      {/* The chronometer docks under the deck and stays at hand while the readouts below scroll by. */}
      <section aria-label={tx("时间导航")} className="chronometer">
        <ChronicleAxis eras={chronicle.eras} milestones={chronicle.milestones} now={now} t={t} onMove={setT} onCommit={commit} />
        <div className="chronometer-controls">
          <button type="button" disabled={!previous} onClick={() => previous && commit(previous.t)} title={previous?.title}><Text value="‹ 上一个里程碑" /></button>
          <span className="chronometer-hint"><Text value="方向键逐幅切换画面 · 滚轮缩放 · 拖动或点击定位时间" /></span>
          <button type="button" onClick={() => commit(now)}><Text value="回到现在" /></button>
          <button type="button" disabled={!following} onClick={() => following && commit(following.t)} title={following?.title}><Text value="下一个里程碑 ›" /></button>
        </div>
      </section>

      <ChronicleReadouts chronicle={chronicle} t={t} now={now} onCommit={commit} className="mt-8" />
    </div>
  );
}
