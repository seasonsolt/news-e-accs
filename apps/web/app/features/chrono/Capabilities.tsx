// What humanity can and cannot yet do at the moment: one notch per capability on record, filled up to
// now, then the most recent gains and the next ones still ahead.
import { capabilitiesAt, timeLabel, type ChronicleMilestone } from "@aihot/contracts/chronicle";
import { untilLabel } from "./format";

export function Capabilities({ milestones, t, now, onCommit }: { milestones: ChronicleMilestone[]; t: number; now: number; onCommit: (t: number) => void }) {
  const { held, next } = capabilitiesAt(milestones, t);
  const all = milestones.filter((m) => m.capability && !m.forecast);
  const row = "chronicle-cap-row";
  return (
    <section aria-labelledby="capabilities" className="min-w-0">
      <div className="chronicle-section-head">
        <h2 id="capabilities">能力进度</h2>
        <p>
          已经掌握 <strong className="num">{held.length}</strong> / {all.length} 项
        </p>
      </div>
      <div className="chronicle-notches" role="img" aria-label={`已经掌握 ${held.length} 项，共 ${all.length} 项`}>
        {all.map((m) => (
          <span key={m.id} className={m.t <= t ? "is-held" : undefined} title={`${m.capability} · ${timeLabel(m.t, now, m.precision, m.date)}`} />
        ))}
      </div>
      <div className="mt-4 grid gap-5 sm:grid-cols-2">
        <div>
          <h3 className="chronicle-cap-head">最近掌握</h3>
          {held.length ? (
            <ul>
              {held.slice(-6).reverse().map((m) => (
                <li key={m.id}>
                  <button type="button" className={row} onClick={() => onCommit(m.t)}>
                    <span>{m.capability}</span>
                    <span className="num">{timeLabel(m.t, now, m.precision, m.date)}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="chronicle-cap-empty">人类尚未出现。</p>
          )}
        </div>
        <div>
          <h3 className="chronicle-cap-head">尚未出现</h3>
          {next.length ? (
            <ul>
              {next.map((m) => (
                <li key={m.id}>
                  <button type="button" className={`${row} is-ahead`} onClick={() => onCommit(m.t)}>
                    <span>{m.capability}</span>
                    <span className="num">{untilLabel(t, m.t)}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="chronicle-cap-empty">有据可查的能力都已出现；再往后是预测。</p>
          )}
        </div>
      </div>
    </section>
  );
}
