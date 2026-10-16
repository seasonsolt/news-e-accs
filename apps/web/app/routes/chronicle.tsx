import { Link, useNavigate } from "../lib/navigation";
import { localeFromMatches, Text, useTranslate } from "../lib/i18n";
import { useEffect, useState } from "react";
import { data, useLoaderData, useLocation, useRouteLoaderData, type ShouldRevalidateFunction } from "react-router";
import { FEATURES } from "@aihot/industry/features";
import { AXIS_FUTURE_YEARS, BIG_BANG, decimalYear, eraAt, timeLabel, yearToDate, type ChronicleResponse } from "@aihot/contracts/chronicle";
import type { Route } from "./+types/chronicle";
import type { loader as rootLoader } from "../root";
import { loadOr404 } from "../lib/api.server";
import { pageMeta } from "../lib/seo";
import { IconArrowRight, IconHourglass } from "../components/icons";
import { Capabilities } from "../features/chrono/Capabilities";
import { ChronicleAxis } from "../features/chrono/ChronicleAxis";
import { CivilizationGauges } from "../features/chrono/CivilizationGauges";
import { CosmosStage } from "../features/chrono/CosmosStage";
import { EraStrip } from "../features/chrono/EraStrip";
import { MomentList } from "../features/chrono/MomentList";
import { Observatory } from "../features/chrono/Observatory";
import { distanceLabel, focusAt, nearbyPlates, timeParam } from "../features/chrono/format";
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
  const [cosmos, setCosmos] = useState(false);
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
  if (!era) return <p className="py-8 text-ink-3"><Text value="尚无时代数据。" /></p>;
  const focus = focusAt(chronicle.milestones, t, now);
  const previous = chronicle.milestones.filter((m) => m.t < t - 1e-6).at(-1);
  const following = chronicle.milestones.find((m) => m.t > t + 1e-6);
  const date = yearToDate(t);
  const present = !!date && !!bounds && date >= bounds.today;
  const recorded = !!date && !!bounds?.earliest && date >= bounds.earliest && date < bounds.today;
  const links = [{ to: "/", label: tx("精选") }, { to: "/hot", label: tx("热点榜") }, { to: "/daily", label: tx("日报") }];
  return (
    <div className="chronicle-page pb-8 pt-3 lg:pt-0">
      <Observatory
        era={era}
        focus={focus}
        nearby={nearbyPlates(chronicle.eras, chronicle.milestones, t, now)}
        label={focus ? tx(timeLabel(focus.t, now, focus.precision, focus.date)) : tx(timeLabel(t, now))}
        distance={tx(distanceLabel(t, now))}
        cosmos={cosmos}
        voyage={FEATURES.cosmos3d ? (
          <CosmosStage active={cosmos} onActive={setCosmos} eras={chronicle.eras} milestones={chronicle.milestones} metrics={chronicle.metrics} era={era} t={t} now={now} onMove={setT} onCommit={commit} />
        ) : null}
      />
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
                  {present ? tx("此刻的本站") : tx("这一天在本站")}
                </h2>
                <p>{present ? tx("时光机落在此刻：这就是现在的站点。") : tx("回到 {0}，看本站当天的样子。", atLabel(date!))}</p>
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
        <p className="text-[11.5px] leading-relaxed text-ink-4"><Text value="数据在 industry/chronicle/，每条都附出处；指标在两个有来源的数据点之间按对数插值；预测包含机构、社区观点与注明提出者的本站情景推演，年份不是确定的实现日期。配图由 AI 按各时代的画风绘制。" /></p>
      </div>
    </div>
  );
}
