import { SITE } from "@aihot/site";
import { dateToYear, timeLabel, toAxis, type ChronicleEra, type TimeMachineBounds } from "@aihot/contracts/chronicle";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { useLocation } from "react-router";
import { Plate } from "../../components/shell/Deck";
import { Link, useNavigate } from "../../lib/navigation";
import { Text, useTranslate } from "../../lib/i18n";
import { ChronicleAxis, type AxisEra, type AxisMilestone } from "./ChronicleAxis";
import { KardashevMeter } from "./KardashevMeter";
import { atLabel, frontPageTarget, parseAt } from "./at";
import { distanceLabel, momentParam, timeParam } from "./format";

export type TimeStripData = {
  eras: Array<AxisEra & Pick<ChronicleEra, "summary">>;
  milestones: Array<AxisMilestone & { title: string; summary?: string }>;
  now: number;
};

/** The front page's moment: from `?at` (a recorded day), `?t` (deep time) or now; moves locally, settles in the address. */
export function useFrontPageTime(now: number, at: string | null, deepT: number | null, bounds: TimeMachineBounds | null) {
  const navigate = useNavigate();
  const { search } = useLocation();
  // In deep time the address is the needle: links that only change `t` (the era strip) move it without a load.
  const addressT = deepT === null ? null : (momentParam(new URLSearchParams(search).get("t"), now) ?? deepT);
  const initialT = at ? dateToYear(at) : (addressT ?? now);
  const [t, setT] = useState(initialT);
  useEffect(() => { setT(initialT); }, [initialT]);
  const commit = (next: number) => {
    const target = frontPageTarget(next, now, bounds);
    const day = parseAt(target.split("?")[1] ?? "", bounds?.today);
    setT(day ? dateToYear(day) : target === "/" ? now : next);
    // Deep time is one page whose needle moves: steps there replace the entry instead of piling up history.
    navigate(target, { replace: deepT !== null, preventScrollReset: true });
  };
  return { t, move: setT, commit };
}

/** What the band shows at the moment, for the heading under it. */
export type StripView = { label: string; title: string | undefined };

/** The front page's observation deck: the needle previews here and the page below follows it. */
export function TimeStrip({ chronicle, at, bounds, t, onMove, onCommit, children }: {
  chronicle: TimeStripData;
  at: string | null;
  bounds: TimeMachineBounds | null;
  t: number;
  onMove: (t: number) => void;
  onCommit: (t: number) => void;
  children: ReactNode | ((view: StripView) => ReactNode);
}) {
  const tx = useTranslate();
  const { eras, milestones, now } = chronicle;
  const era = eras.findLast((era) => era.from <= t) ?? eras[0];
  const u = toAxis(t, now);
  const focus = milestones.reduce<TimeStripData["milestones"][number] | null>((best, m) => {
    const d = Math.abs(toAxis(m.t, now) - u);
    return d < 0.0008 && (!best || d < Math.abs(toAxis(best.t, now) - u)) ? m : best;
  }, null);
  const moment = focus?.art ? focus : null;
  const label = tx(timeLabel(t, now));
  const parts = /^(\D*)(\d[\d.]*)(.*)$/.exec(label);
  const title = moment?.title ?? era?.title;
  const art = moment ? `moments/${moment.art}` : `epochs/${era?.art}`;
  return (
    <div className="time-strip-front" style={{ "--needle": `${u * 100}%` } as CSSProperties}>
      <section className="time-strip" aria-label={tx("加速")}>
        <h1 className="sr-only">{tx(SITE.homeHeading)}</h1>
        <div className="time-strip-stage">
          {era && <Plate key={art} src={`/media/art/${art}`} alt={title} className="time-strip-plate" />}
          <div className="time-strip-shade" aria-hidden="true" />
          <header className="time-strip-readout">
            <p className="time-strip-kicker"><Text value="加速史" /> · {at ? tx(atLabel(at)) : t === now ? tx("此刻") : tx(distanceLabel(t, now))}</p>
            <div className="time-strip-row">
              <p className="time-strip-time">
                {parts ? <><span className="time-strip-unit">{parts[1]}</span><span className="time-strip-figure">{parts[2]}</span><span className="time-strip-unit">{parts[3]}</span></> : label}
              </p>
              <p className="time-strip-title">{title ?? tx("尚无时代数据。")}</p>
            </div>
            <p className="time-strip-summary">{moment ? moment.summary : era?.summary}</p>
          </header>
          {bounds?.kardashev != null && <aside className="time-strip-meter"><KardashevMeter k={bounds.kardashev} /></aside>}
        </div>
        <section className="time-strip-dock" aria-label={tx("时间导航")}>
          <ChronicleAxis compact eras={eras} milestones={milestones} now={now} t={t} onMove={onMove} onCommit={onCommit} />
          <div className="time-strip-controls">
            <p><Text value="拖动指针回到过去，本页跟着走" /></p>
            <Link to={`/chronicle?t=${timeParam(t, now)}`}><Text value="展开时光机" /></Link>
          </div>
        </section>
      </section>
      <div className="time-strip-feed-head">
        <span className="time-strip-seam" aria-hidden="true" />
        {typeof children === "function" ? children({ label, title }) : children}
      </div>
    </div>
  );
}
