import { Link } from "../../lib/navigation";
import { Text, useTranslate } from "../../lib/i18n";
// The front page's view of the chronicle: the latest illustrated moment as a card beside the line, and along
// the deck's foot the whole axis with a needle at this day and four readings of where civilization stands.
// The loader cuts the chronicle down to this summary, so the front page carries a few hundred bytes of it.
import { beijingDate } from "@aihot/contracts/time";
import { dateToYear, eraAt, interpolateMetric, kardashev, timeLabel, toAxis, type ChronicleMetricKey, type ChronicleResponse } from "@aihot/contracts/chronicle";
import { artUrl } from "./art";
import { metricValue, plateOf } from "./format";
import { chronicleHref } from "./TimeMachine";

export interface ChronicleNow {
  moment: { title: string; summary: string; label: string; src: string; alt: string };
  epochs: Array<{ id: string; title: string; from: number; to: number; forecast: boolean }>;
  /** This day on the axis, 0..1. */
  u: number;
  /** Kardashev rating on this day, from the energy series. */
  k: number | null;
  readouts: Array<{ key: ChronicleMetricKey; value: string; unit: string }>;
}

const READOUTS: Array<[key: ChronicleMetricKey, label: string]> = [["energy", "一次能源功率"], ["compute", "每美元算力"], ["population", "世界人口"]];

/** The chronicle as it stands on `at` (a past day of the time machine), else today. */
export function chronicleNow(chronicle: ChronicleResponse, at: string | null): ChronicleNow | null {
  // By the day, not the instant, so every request of a day gets the same summary.
  const now = dateToYear(beijingDate(Date.now()));
  const t = at ? dateToYear(at) : now;
  const era = eraAt(chronicle.eras, t);
  if (!era) return null;
  // The era's latest illustrated milestone; early in an era, before any, the era's own plate.
  const latest = chronicle.milestones.filter((m) => m.art && !m.forecast && m.t <= t).at(-1);
  const shown = latest && latest.t >= era.from ? latest : null;
  const plate = plateOf(era, shown);
  const energy = chronicle.metrics.find((m) => m.key === "energy");
  const watts = energy ? interpolateMetric(energy.points, t, now, energy.forecastFrom) : null;
  return {
    moment: {
      title: shown?.title ?? era.title,
      summary: shown?.detail ?? era.summary,
      label: shown ? timeLabel(shown.t, now, shown.precision, shown.date) : timeLabel(era.from, now),
      src: plate.src,
      alt: plate.alt,
    },
    epochs: chronicle.eras.flatMap((e, i) => {
      if (!e.epoch) return [];
      const next = chronicle.eras.slice(i + 1).find((n) => n.epoch);
      return [{ id: e.id, title: e.epoch, from: toAxis(e.from, now), to: next ? toAxis(next.from, now) : 1, forecast: !!e.forecast }];
    }),
    u: toAxis(t, now),
    k: watts === null ? null : Math.round(kardashev(watts) * 1000) / 1000,
    readouts: READOUTS.flatMap(([key]) => {
      const metric = chronicle.metrics.find((m) => m.key === key);
      const v = metric ? interpolateMetric(metric.points, t, now, metric.forecastFrom) : null;
      if (!metric || v === null) return [];
      const display = metricValue(metric, v);
      return [{ key, value: display.value, unit: key === "compute" ? "FLOP/s/$" : display.unit }];
    }),
  };
}

/** The latest illustrated moment, beside the front page's line. */
export function NowCard({ now, at }: { now: ChronicleNow; at: string | null }) {
  const tx = useTranslate();
  const { moment } = now;
  return (
    <Link to={chronicleHref(at)} className="now-card">
      <span className="now-card-art">
        <img src={artUrl(moment.src, 800)} alt={moment.alt} width={800} height={533} decoding="async" />
        <span className="now-card-badge"><Text value={at ? "那一刻" : "此刻"} /></span>
      </span>
      <span className="now-card-body">
        <span className="now-card-date">{tx(moment.label)}</span>
        <span className="now-card-title">{moment.title}</span>
        <span className="now-card-summary">{moment.summary}</span>
        <span className="now-card-go"><Text value="在加速史里看" /> →</span>
      </span>
    </Link>
  );
}

/** The whole axis with this day's needle, and four readings, along the deck's foot. */
export function NowInstruments({ now, at }: { now: ChronicleNow; at: string | null }) {
  const tx = useTranslate();
  return (
    <div className="now-instruments">
      <Link to={chronicleHref(at)} className="now-axis" aria-label={tx("从大爆炸到预测的对数时间轴，指针在{0}", tx(at ? "那一天" : "现在"))}>
        <span className="now-axis-caption"><Text value="大爆炸 → 现在 → 预测 · 对数时间" /></span>
        <span className="now-axis-track" aria-hidden="true">
          <span className="now-axis-bands">
            {now.epochs.map((e) => (
              <span key={e.id} className={`now-axis-epoch ${e.forecast ? "is-forecast" : ""} ${e.from <= now.u && now.u < e.to ? "is-current" : ""}`} style={{ left: `${e.from * 100}%`, width: `${(e.to - e.from) * 100}%` }}>
                {e.to - e.from > 0.05 && <span>{e.title}</span>}
              </span>
            ))}
          </span>
          <span className="now-axis-needle" style={{ left: `${now.u * 100}%` }}><span><Text value={at ? "那一天" : "现在"} /></span></span>
        </span>
      </Link>
      <dl className="now-readouts">
        {now.k !== null && (
          <div className="now-readout is-lead">
            <dt><Text value="卡尔达肖夫指数" /></dt>
            <dd><span className="num">{now.k.toFixed(3)}</span></dd>
          </div>
        )}
        {now.readouts.map((r) => (
          <div key={r.key} className="now-readout">
            <dt><Text value={READOUTS.find(([key]) => key === r.key)![1]} /></dt>
            <dd><span className="num"><Text value={r.value} /></span>{r.unit && <span className="now-readout-unit"><Text value={r.unit} /></span>}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
