import { Text, useTranslate } from "../../lib/i18n";
// The desktop deck's three readouts, under the moment: how many people, how much power and how long a
// message takes, each against today. They move as the axis is dragged, so the acceleration is felt while
// scrubbing; the full set with their histories is in the layer (CivilizationGauges).
import { interpolateMetric, timeLabel, type ChronicleMetric } from "@aihot/contracts/chronicle";
import { versusToday } from "./CivilizationGauges";
import { metricValue } from "./format";

const READOUTS: Array<[key: string, label: string]> = [["population", "世界人口"], ["energy", "一次能源功率"], ["messaging", "伦敦→纽约消息"]];

export function StageReadouts({ metrics, t, now }: { metrics: ChronicleMetric[]; t: number; now: number }) {
  const tx = useTranslate();
  return (
    <section className="chronicle-readouts" aria-label={tx("文明读数")}>
      {READOUTS.map(([key, label]) => {
        const metric = metrics.find((m) => m.key === key);
        if (!metric) return null;
        const v = interpolateMetric(metric.points, t, now, metric.forecastFrom);
        const shown = v === null ? null : metricValue(metric, v);
        const comparison = v === null ? null : versusToday(metric, v, interpolateMetric(metric.points, now, now, metric.forecastFrom));
        const first = metric.points[0]?.[0];
        return (
          <div key={key} className={`chronicle-readout ${v === null ? "is-empty" : ""}`} title={metric.label}>
            <div className="chronicle-readout-label"><Text value={label} /></div>
            <div className="chronicle-readout-value">
              <span className="num"><Text value={shown?.value ?? "—"} /></span>
              {shown?.unit && <span className="chronicle-readout-unit"><Text value={shown.unit} /></span>}
            </div>
            <div className="chronicle-readout-note">
              {v === null
                ? first !== undefined && t < first ? tx("从{0}起有数据", tx(timeLabel(first, now, first < 0 ? "ka" : "year"))) : tx("尚无可靠数据")
                : comparison ? tx(comparison.message, tx(comparison.count ?? "")) : " "}
            </div>
          </div>
        );
      })}
    </section>
  );
}
