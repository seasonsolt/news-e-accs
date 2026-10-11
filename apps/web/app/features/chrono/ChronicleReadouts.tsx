import { Link } from "../../lib/navigation";
import { Text, useTranslate } from "../../lib/i18n";
// What the four-dimensional view reads out under its axis, for /chronicle and for the front page
// when its needle is in deep time: the civilization gauges, the nearby milestones, the capabilities,
// the site's own slice of that day, and the eras.
import { useRouteLoaderData } from "react-router";
import { eraAt, yearToDate, type ChronicleResponse } from "@aihot/contracts/chronicle";
import type { loader as rootLoader } from "../../root";
import { IconArrowRight, IconHourglass } from "../../components/icons";
import { Capabilities } from "./Capabilities";
import { CivilizationGauges } from "./CivilizationGauges";
import { EraStrip } from "./EraStrip";
import { MomentList } from "./MomentList";
import { atLabel, withAt } from "./at";

export function ChronicleReadouts({ chronicle, t, now, onCommit, className = "" }: { chronicle: ChronicleResponse; t: number; now: number; onCommit: (t: number) => void; className?: string }) {
  const tx = useTranslate();
  const bounds = useRouteLoaderData<typeof rootLoader>("root")?.timeBounds;
  const era = eraAt(chronicle.eras, t);
  const date = yearToDate(t);
  const present = !!date && !!bounds && date >= bounds.today;
  const recorded = !!date && !!bounds?.earliest && date >= bounds.earliest && date < bounds.today;
  const links = [{ to: "/", label: tx("精选") }, { to: "/hot", label: tx("热点榜") }, { to: "/daily", label: tx("日报") }];
  return (
    <div className={`space-y-10 ${className}`}>
      <CivilizationGauges metrics={chronicle.metrics} t={t} now={now} />
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-8">
        <MomentList milestones={chronicle.milestones} t={t} now={now} onCommit={onCommit} />
        <div className="space-y-8">
          <Capabilities milestones={chronicle.milestones} t={t} now={now} onCommit={onCommit} />
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
      {era && <EraStrip eras={chronicle.eras} current={era.id} now={now} />}
      <p className="text-[11.5px] leading-relaxed text-ink-4"><Text value="数据在 industry/chronicle/，每条都附出处；指标在两个有来源的数据点之间按对数插值；预测包含机构、社区观点与注明提出者的本站情景推演，年份不是确定的实现日期。配图由 AI 按各时代的画风绘制。" /></p>
    </div>
  );
}
