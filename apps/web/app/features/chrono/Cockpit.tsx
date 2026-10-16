import { Text } from "../../lib/i18n";
// The same civilization readouts as the page below, drawn as a dark instrument strip over the voyage.
// Decorative for sighted readers: the gauges in the document stay the accessible copy.
import { interpolateMetric, kardashev, type ChronicleMetric } from "@aihot/contracts/chronicle";
import { metricValue } from "./format";

export function Cockpit({ metrics, t, now }: { metrics: ChronicleMetric[]; t: number; now: number }) {
  const energy = metrics.find((metric) => metric.key === "energy");
  const watts = energy ? interpolateMetric(energy.points, t, now, energy.forecastFrom) : null;
  const k = watts === null ? null : kardashev(watts);
  return (
    <div className="cosmos-cockpit" aria-hidden="true">
      <div className="cosmos-cockpit-k">
        <span><Text value="卡尔达肖夫指数" /></span>
        <strong className="num">{k === null ? "—" : k.toFixed(3)}</strong>
      </div>
      {metrics.map((metric) => {
        const value = interpolateMetric(metric.points, t, now, metric.forecastFrom);
        const formatted = value === null ? null : metricValue(metric, value);
        const forecast = metric.forecastFrom !== undefined && t > metric.forecastFrom && value !== null;
        return (
          <div key={metric.key} className={forecast ? "is-forecast" : undefined}>
            <span>
              <Text value={metric.label} />
              {forecast && <> · <Text value="推测" /></>}
            </span>
            <strong className="num">
              <Text value={formatted?.value ?? "—"} />
              {formatted?.unit ? <small><Text value={formatted.unit} /></small> : null}
            </strong>
          </div>
        );
      })}
    </div>
  );
}
