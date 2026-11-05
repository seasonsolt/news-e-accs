import { Link } from "../../lib/navigation";
import { Text, useLocale, useTranslate } from "../../lib/i18n";
// The front page's view of the chronicle: the whole axis with a needle at this day, along the first screen's
// foot, beside one reading of how fast the curve is moving. The loader cuts the chronicle down to this
// summary, so the front page carries a few hundred bytes of it.
import { beijingDate } from "@aihot/contracts/time";
import { dateToYear, eraAt, toAxis, type ChronicleResponse } from "@aihot/contracts/chronicle";
import { chronicleHref } from "./TimeMachine";

export interface ChronicleNow {
  epochs: Array<{ id: string; title: string; from: number; to: number; forecast: boolean }>;
  /** This day on the axis, 0..1. */
  u: number;
}

/** What the reading takes of the indices module's answer (modules/indices/contracts.ts). */
export interface CostIndex {
  tiers: Array<{ reference: string; ratio: number | null; halvingMonths: number | null; points: Array<{ date: string }> }>;
}

export interface CostReading {
  reference: string;
  ratio: number;
  halvingMonths: number;
  /** The day the line starts, YYYY-MM-DD. */
  since: string;
}

/** The tier the index's own page leads with: the longest record with a fall to show. */
export function costReading(index: CostIndex): CostReading | null {
  const tier = index.tiers.find((t) => t.ratio);
  const since = tier?.points[0]?.date;
  return tier?.ratio && tier.halvingMonths && since ? { reference: tier.reference, ratio: tier.ratio, halvingMonths: tier.halvingMonths, since } : null;
}

/** The chronicle as it stands on `at` (a past day of the time machine), else today. */
export function chronicleNow(chronicle: ChronicleResponse, at: string | null): ChronicleNow | null {
  // By the day, not the instant, so every request of a day gets the same summary.
  const now = dateToYear(beijingDate(Date.now()));
  const t = at ? dateToYear(at) : now;
  if (!eraAt(chronicle.eras, t)) return null;
  return {
    epochs: chronicle.eras.flatMap((e, i) => {
      if (!e.epoch) return [];
      const next = chronicle.eras.slice(i + 1).find((n) => n.epoch);
      return [{ id: e.id, title: e.epoch, from: toAxis(e.from, now), to: next ? toAxis(next.from, now) : 1, forecast: !!e.forecast }];
    }),
    u: toAxis(t, now),
  };
}

/** On a phone, only an epoch's first word fits: "Machines and minds" reads as "Machines". */
function EpochLabel({ title }: { title: string }) {
  const space = title.indexOf(" ");
  return space < 0 ? <span>{title}</span> : <span>{title.slice(0, space)}<span className="now-axis-epoch-rest">{title.slice(space)}</span></span>;
}

function CostLine({ cost }: { cost: CostReading }) {
  const locale = useLocale();
  const [year, month] = cost.since.split("-").map(Number) as [number, number];
  const ratio = cost.ratio >= 10 ? cost.ratio.toFixed(0) : cost.ratio.toFixed(1);
  const halving = cost.halvingMonths.toFixed(1);
  return (
    <Link to="/index/cost-of-intelligence" className="now-reading">
      {locale === "en" ? (
        <><span className="now-reading-reference">{cost.reference}-level intelligence: </span><b>{ratio}× cheaper</b> since <span className="now-reading-month">{new Date(Date.UTC(year, month - 1)).toLocaleDateString("en", { month: "long", timeZone: "UTC" })} </span>{year}, halving every {halving} months</>
      ) : (
        <>{cost.reference} 级智能自 {year} 年<b>便宜了 {ratio} 倍</b>，每 {halving} 个月减半</>
      )}
    </Link>
  );
}

/** The whole axis with this day's needle along the first screen's foot, and today's reading beside its caption. */
export function NowInstruments({ now, at, cost }: { now: ChronicleNow; at: string | null; cost: CostReading | null }) {
  const tx = useTranslate();
  return (
    <div className="now-instruments">
      <Link to={chronicleHref(at)} className="now-axis" aria-label={tx("从大爆炸到预测的对数时间轴，指针在{0}", tx(at ? "那一天" : "现在"))}>
        <span className="now-axis-track" aria-hidden="true">
          <span className="now-axis-bands">
            {now.epochs.map((e) => (
              <span key={e.id} className={`now-axis-epoch ${e.forecast ? "is-forecast" : ""} ${e.from <= now.u && now.u < e.to ? "is-current" : ""}`} style={{ left: `${e.from * 100}%`, width: `${(e.to - e.from) * 100}%` }}>
                {e.to - e.from > 0.05 && <EpochLabel title={e.title} />}
              </span>
            ))}
          </span>
          <span className="now-axis-needle" style={{ left: `${now.u * 100}%` }}><span><Text value={at ? "那一天" : "现在"} /></span></span>
        </span>
      </Link>
      <div className="now-foot">
        <span className="now-axis-caption"><Text value="大爆炸 → 现在 → 预测 · 对数时间" /></span>
        {cost && <CostLine cost={cost} />}
      </div>
    </div>
  );
}
