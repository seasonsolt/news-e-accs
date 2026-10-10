import { Text, useTranslate } from "../../lib/i18n";
// The civilization readouts: each metric's value at the moment, how it compares with today, and its whole
// sourced history as a small log-scale curve with the moment marked on it. Read along the axis, the
// curves steepen toward the present: the acceleration, drawn by the data rather than said in words.
import { interpolateMetric, kardashev, timeLabel, toAxis, type ChronicleMetric } from "@aihot/contracts/chronicle";
import { IconArrowUpRight } from "../../components/icons";
import { chineseCount, metricValue } from "./format";

/** How the moment compares with today: "今天的 1/620", "比今天慢 1.7 亿倍", "今天的 1.4 倍". */
function versusToday(metric: ChronicleMetric, v: number, today: number | null): string | null {
  if (today === null || v <= 0 || today <= 0) return null;
  const ratio = v / today;
  if (ratio > 0.95 && ratio < 1.05) return "与今天相当";
  // A message's delivery time: more is slower.
  if (metric.key === "messaging") return ratio > 1 ? `比今天慢 ${chineseCount(ratio)} 倍` : `比今天快 ${chineseCount(1 / ratio)} 倍`;
  return ratio < 1 ? `今天的 1/${chineseCount(1 / ratio)}` : `今天的 ${chineseCount(ratio)} 倍`;
}

/** The metric's sourced history over its own span of the axis, log-scaled, with the moment marked. */
function Trace({ metric, t, now }: { metric: ChronicleMetric; t: number; now: number }) {
  const xs = metric.points.map(([pt]) => toAxis(pt, now));
  const ys = metric.points.map(([, pv]) => Math.log10(pv));
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
  const [y0, y1] = [Math.min(...ys), Math.max(...ys)];
  const sx = (x: number) => (x1 === x0 ? 50 : ((x - x0) / (x1 - x0)) * 100);
  const sy = (y: number) => (y1 === y0 ? 16 : 30 - ((y - y0) / (y1 - y0)) * 28);
  const line = metric.points.map((_, i) => `${sx(xs[i]!).toFixed(2)},${sy(ys[i]!).toFixed(2)}`).join(" ");
  const v = interpolateMetric(metric.points, t, now, metric.forecastFrom);
  const ux = toAxis(t, now);
  const forecastX = metric.forecastFrom !== undefined ? sx(toAxis(metric.forecastFrom, now)) : null;
  return (
    <svg viewBox="0 0 100 32" preserveAspectRatio="none" className="chronicle-trace" aria-hidden="true">
      {forecastX !== null && forecastX < 100 && <rect x={forecastX} y="0" width={100 - forecastX} height="32" className="chronicle-trace-forecast" />}
      <polyline points={line} className="chronicle-trace-line" vectorEffect="non-scaling-stroke" />
      {v !== null && ux >= x0 && ux <= x1 && (
        <>
          <line x1={sx(ux)} x2={sx(ux)} y1="0" y2="32" className="chronicle-trace-cursor" vectorEffect="non-scaling-stroke" />
          <circle cx={sx(ux)} cy={sy(Math.log10(v))} r="1.6" className="chronicle-trace-dot" />
        </>
      )}
    </svg>
  );
}

/** Half-dial from 0 to a Type I civilization (1). */
function KardashevDial({ k }: { k: number | null }) {
  const f = k === null ? 0 : Math.min(1, Math.max(0, k));
  const angle = Math.PI * (1 - f);
  const nx = 50 + 38 * Math.cos(angle);
  const ny = 46 - 38 * Math.sin(angle);
  const arc = (to: number) => `M 12 46 A 38 38 0 0 1 ${(50 + 38 * Math.cos(Math.PI * (1 - to))).toFixed(2)} ${(46 - 38 * Math.sin(Math.PI * (1 - to))).toFixed(2)}`;
  return (
    <svg viewBox="0 0 100 54" className="chronicle-dial" aria-hidden="true">
      <path d={arc(1)} className="chronicle-dial-track" />
      {k !== null && f > 0 && <path d={arc(f)} className="chronicle-dial-fill" />}
      {[0, 0.25, 0.5, 0.75, 1].map((s) => {
        const a = Math.PI * (1 - s);
        return <line key={s} x1={50 + 31 * Math.cos(a)} y1={46 - 31 * Math.sin(a)} x2={50 + 34 * Math.cos(a)} y2={46 - 34 * Math.sin(a)} className="chronicle-dial-tick" />;
      })}
      {k !== null && <line x1="50" y1="46" x2={nx} y2={ny} className="chronicle-dial-needle" />}
      <circle cx="50" cy="46" r="3" className="chronicle-dial-hub" />
    </svg>
  );
}

export function CivilizationGauges({ metrics, t, now }: { metrics: ChronicleMetric[]; t: number; now: number }) {
  const tx = useTranslate();
  const energy = metrics.find((m) => m.key === "energy");
  const watts = energy ? interpolateMetric(energy.points, t, now, energy.forecastFrom) : null;
  const k = watts === null ? null : kardashev(watts);
  return (
    <section aria-labelledby="civilization-gauges">
      <div className="chronicle-section-head">
        <h2 id="civilization-gauges"><Text value="文明读数" /></h2>
        <p><Text value="小曲线是每项指标的全部有据历史，横轴同样按对数时间；圆点是此刻。" /></p>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <article className="chronicle-gauge is-dial">
          <div className="chronicle-gauge-label"><Text value="卡尔达肖夫指数" /></div>
          <KardashevDial k={k} />
          <p className="num chronicle-gauge-value text-center">{k === null ? "—" : k.toFixed(3)}</p>
          <p className="chronicle-gauge-note text-center">{k === null ? tx("尚无可靠数据") : tx("按一次能源功率换算 · I 型文明 = 1")}</p>
        </article>
        {metrics.map((metric) => {
          const v = interpolateMetric(metric.points, t, now, metric.forecastFrom);
          const formatted = v === null ? null : metricValue(metric, v);
          const forecast = metric.forecastFrom !== undefined && t > metric.forecastFrom && v !== null;
          const today = interpolateMetric(metric.points, now, now, metric.forecastFrom);
          const first = metric.points[0]?.[0];
          return (
            <article key={metric.key} title={metric.note} className={`chronicle-gauge ${forecast ? "is-forecast" : ""}`}>
              <div className="chronicle-gauge-label">
                <span className="min-w-0 truncate"><Text value={metric.label} /></span>
                {forecast && <span className="chronicle-gauge-badge"><Text value="推测" /></span>}
                <a href={metric.source.url} title={tx("来源：{0}", metric.source.name)} target="_blank" rel="noopener noreferrer" className="chronicle-gauge-source" aria-label={tx("{0}的来源", metric.label)}>
                  <IconArrowUpRight size={12} />
                </a>
              </div>
              <p className="chronicle-gauge-value">
                <span className="num"><Text value={formatted?.value ?? "—"} /></span>
                {formatted?.unit && <span className="chronicle-gauge-unit"><Text value={formatted.unit} /></span>}
              </p>
              <p className="chronicle-gauge-note">
                {v === null ? tx("尚无可靠数据{0}", first !== undefined && t < first ? ` · ${tx("数据始于{0}", tx(timeLabel(first, now, first < 0 ? "ka" : "year")))}` : "") : tx(versusToday(metric, v, today) ?? " ")}
              </p>
              <Trace metric={metric} t={t} now={now} />
            </article>
          );
        })}
      </div>
    </section>
  );
}
