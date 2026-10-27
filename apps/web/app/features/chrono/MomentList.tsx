import { Text, useTranslate } from "../../lib/i18n";
import { artUrl } from "./art";
// The milestones nearest the moment on the axis, as one compact rail; the closest is lit.
import { timeLabel, toAxis, type ChronicleCategory, type ChronicleMilestone } from "@aihot/contracts/chronicle";

export const CATEGORY: Record<ChronicleCategory, string> = { cosmos: "宇宙", life: "生命", human: "人类", energy: "能源", compute: "计算", ai: "智能", culture: "文化" };

export function MomentList({ milestones, t, now, onCommit }: { milestones: ChronicleMilestone[]; t: number; now: number; onCommit: (t: number) => void }) {
  const tx = useTranslate();
  const u = toAxis(t, now);
  const distance = (m: ChronicleMilestone) => Math.abs(toAxis(m.t, now) - u);
  const nearby = [...milestones].sort((a, b) => distance(a) - distance(b)).slice(0, 8).sort((a, b) => a.t - b.t);
  const closest = nearby.reduce<ChronicleMilestone | null>((best, m) => (!best || distance(m) < distance(best) ? m : best), null);
  return (
    <section aria-labelledby="nearby-moments" className="min-w-0">
      <div className="chronicle-section-head">
        <h2 id="nearby-moments"><Text value="此刻附近" /></h2>
        <p><Text value="轴上离此刻最近的八件事，点标题跳过去。" /></p>
      </div>
      <ol className="chronicle-rail">
        {nearby.map((m) => (
          <li key={m.id} className={`chronicle-rail-item cat-${m.category} ${m.forecast ? "is-forecast" : ""} ${m === closest ? "is-closest" : ""}`}>
            <span className="chronicle-rail-dot" aria-hidden="true" />
            {m.art && <img className="chronicle-rail-thumb" src={artUrl(`/media/art/moments/${m.art}`, 800)} alt="" loading="lazy" decoding="async" width={96} height={64} title={m.artStyle} />}
            <div className="chronicle-rail-meta">
              <span className="num">{tx(timeLabel(m.t, now, m.precision, m.date))}</span>
              <span>{tx(CATEGORY[m.category])}</span>
              {m.forecast && <span className="chronicle-gauge-badge"><Text value="预测" /></span>}
            </div>
            <button type="button" onClick={() => onCommit(m.t)} className="chronicle-rail-title">{m.title}</button>
            <p className="chronicle-rail-detail">
              {m.detail}{" "}
              <a href={m.source} target="_blank" rel="noopener noreferrer"><Text value="来源" /></a>
              {m.forecast && (
                <>
                  {tx(" · 预测方 ")}
                  <a href={m.forecast.url} target="_blank" rel="noopener noreferrer">{m.forecast.by}</a>
                </>
              )}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}
