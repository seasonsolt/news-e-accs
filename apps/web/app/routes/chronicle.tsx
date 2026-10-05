import { useEffect, useState } from "react";
import { data, Link, useLoaderData, useLocation, useNavigate, useRouteLoaderData, type ShouldRevalidateFunction } from "react-router";
import { FEATURES } from "@aihot/industry/features";
import { AXIS_FUTURE_YEARS, BIG_BANG, decimalYear, eraAt, timeLabel, toAxis, yearToDate, type ChronicleMilestone, type ChronicleResponse } from "@aihot/contracts/chronicle";
import type { Route } from "./+types/chronicle";
import type { loader as rootLoader } from "../root";
import { loadOr404 } from "../lib/api.server";
import { pageMeta } from "../lib/seo";
import { IconArrowRight, IconHourglass } from "../components/icons";
import { Capabilities } from "../features/chrono/Capabilities";
import { ChronicleAxis } from "../features/chrono/ChronicleAxis";
import { CivilizationGauges } from "../features/chrono/CivilizationGauges";
import { EraStrip } from "../features/chrono/EraStrip";
import { MomentList } from "../features/chrono/MomentList";
import { Observatory } from "../features/chrono/Observatory";
import { distanceLabel, timeParam } from "../features/chrono/format";
import { atLabel, withAt } from "../features/chrono/at";

function moment(search: string, now: number) {
  const raw = new URLSearchParams(search).get("t");
  const t = raw === null ? now : Number(raw);
  return Number.isFinite(t) ? Math.min(now + AXIS_FUTURE_YEARS, Math.max(BIG_BANG, t)) : now;
}

export async function loader({ request }: Route.LoaderArgs) {
  if (!FEATURES.timeMachine) throw data({ message: "not_found" }, { status: 404 });
  const now = decimalYear(Date.now());
  const t = moment(new URL(request.url).search, now);
  const chronicle = await loadOr404<ChronicleResponse>("/api/site/chronicle", { signal: request.signal });
  return { chronicle, now, t };
}

export const shouldRevalidate: ShouldRevalidateFunction = ({ currentUrl, nextUrl, defaultShouldRevalidate }) => currentUrl.pathname === nextUrl.pathname ? false : defaultShouldRevalidate;

export function meta() {
  return pageMeta({ title: "四维视角", description: "从大爆炸到此刻，再到公开的预测：拖动时间轴，看人类在每个时刻掌握了什么。", path: "/chronicle", image: "/og/pages/chronicle.png" });
}

export function headers() {
  return { "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=600" };
}

export default function ChroniclePage() {
  const { chronicle, now, t: initialT } = useLoaderData<typeof loader>();
  const [t, setT] = useState(initialT);
  const location = useLocation();
  const navigate = useNavigate();
  const bounds = useRouteLoaderData<typeof rootLoader>("root")?.timeBounds;
  useEffect(() => { setT(moment(location.search, now)); }, [location.search, now]);
  const commit = (next: number) => {
    const clamped = Math.min(now + AXIS_FUTURE_YEARS, Math.max(BIG_BANG, next));
    setT(clamped);
    navigate(`?t=${timeParam(clamped, now)}`, { replace: true, preventScrollReset: true });
  };
  const era = eraAt(chronicle.eras, t);
  if (!era) return <p className="py-8 text-ink-3">尚无时代数据。</p>;
  // Standing on a milestone (a click snaps to one): the deck shows that event and, if drawn, its own plate.
  const u = toAxis(t, now);
  const focus = chronicle.milestones.reduce<ChronicleMilestone | null>((best, m) => {
    const d = Math.abs(toAxis(m.t, now) - u);
    return d < 0.0008 && (!best || d < Math.abs(toAxis(best.t, now) - u)) ? m : best;
  }, null);
  const previous = chronicle.milestones.filter((m) => m.t < t - 1e-6).at(-1);
  const following = chronicle.milestones.find((m) => m.t > t + 1e-6);
  const date = yearToDate(t);
  const present = !!date && !!bounds && date >= bounds.today;
  const recorded = !!date && !!bounds?.earliest && date >= bounds.earliest && date < bounds.today;
  const links = [{ to: "/", label: "精选" }, { to: "/hot", label: "热点榜" }, ...(FEATURES.leaderboard ? [{ to: "/leaderboard", label: "模型榜" }] : []), { to: "/daily", label: "日报" }];
  return (
    <div className="chronicle-page pb-8 pt-3 lg:pt-0">
      <Observatory era={era} focus={focus} label={focus ? timeLabel(focus.t, now, focus.precision, focus.date) : timeLabel(t, now)} distance={distanceLabel(t, now)} />
      {/* The chronometer docks under the deck and stays at hand while the readouts below scroll by. */}
      <section aria-label="时间导航" className="chronometer">
        <ChronicleAxis eras={chronicle.eras} milestones={chronicle.milestones} now={now} t={t} onMove={setT} onCommit={commit} />
        <div className="chronometer-controls">
          <button type="button" disabled={!previous} onClick={() => previous && commit(previous.t)} title={previous?.title}>‹ 上一个里程碑</button>
          <span className="chronometer-hint">拖动、点击或用方向键穿行 · 每格是十倍的时间</span>
          <button type="button" onClick={() => commit(now)}>回到现在</button>
          <button type="button" disabled={!following} onClick={() => following && commit(following.t)} title={following?.title}>下一个里程碑 ›</button>
        </div>
      </section>

      <div className="mt-8 space-y-10">
        <CivilizationGauges metrics={chronicle.metrics} t={t} now={now} />
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-8">
          <MomentList milestones={chronicle.milestones} t={t} now={now} onCommit={commit} />
          <div className="space-y-8">
            <Capabilities milestones={chronicle.milestones} t={t} now={now} onCommit={commit} />
            {(recorded || present) && (
              <section className="chronicle-slice">
                <h2>
                  <IconHourglass size={16} />
                  {present ? "此刻的本站" : "这一天在本站"}
                </h2>
                <p>{present ? "时光机落在此刻：这就是现在的站点。" : `回到 ${atLabel(date!)}，看本站当天的样子。`}</p>
                <div className="chronicle-slice-links">
                  {links.map((link) => (
                    <Link key={link.to} to={withAt(link.to, recorded ? date : null)}>
                      {link.label}
                      <IconArrowRight size={13} />
                    </Link>
                  ))}
                </div>
              </section>
            )}
          </div>
        </div>
        <EraStrip eras={chronicle.eras} current={era.id} now={now} />
        <p className="text-[11.5px] leading-relaxed text-ink-4">数据在 industry/chronicle/，每条都附出处；指标在两个有来源的数据点之间按对数插值；预测来自公开机构或社区，不代表本站观点。配图由 AI 按各时代的画风绘制。</p>
      </div>
    </div>
  );
}
