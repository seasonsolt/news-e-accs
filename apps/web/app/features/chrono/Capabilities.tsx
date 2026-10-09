import { Text, useTranslate } from "../../lib/i18n";
// What humanity can and cannot yet do at the moment: one notch per capability on record, filled up to
// now, then the most recent gains and the next ones still ahead.
import { capabilitiesAt, timeLabel, type ChronicleMilestone } from "@aihot/contracts/chronicle";
import { untilLabel } from "./format";

export function Capabilities({ milestones, t, now, onCommit }: { milestones: ChronicleMilestone[]; t: number; now: number; onCommit: (t: number) => void }) {
  const tx = useTranslate();
  const { held, next } = capabilitiesAt(milestones, t);
  const all = milestones.filter((m) => m.capability && !m.forecast);
  const row = "chronicle-cap-row";
  return (
    <section aria-labelledby="capabilities" className="min-w-0">
      <div className="chronicle-section-head">
        <h2 id="capabilities"><Text value="能力进度" /></h2>
        <p><Text value="已经掌握" /><strong className="num">{held.length}</strong> / {all.length}<Text value="项" /></p>
      </div>
      <div className="chronicle-notches" role="img" aria-label={tx("已经掌握 {0} 项，共 {1} 项", held.length, all.length)}>
        {all.map((m) => (
          <span key={m.id} className={m.t <= t ? "is-held" : undefined} title={`${m.capability} · ${tx(timeLabel(m.t, now, m.precision, m.date))}`} />
        ))}
      </div>
      <div className="mt-4 grid gap-5 sm:grid-cols-2">
        <div>
          <h3 className="chronicle-cap-head"><Text value="最近掌握" /></h3>
          {held.length ? (
            <ul>
              {held.slice(-6).reverse().map((m) => (
                <li key={m.id}>
                  <button type="button" className={row} onClick={() => onCommit(m.t)}>
                    <span>{m.capability}</span>
                    <span className="num">{tx(timeLabel(m.t, now, m.precision, m.date))}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="chronicle-cap-empty"><Text value="人类尚未出现。" /></p>
          )}
        </div>
        <div>
          <h3 className="chronicle-cap-head"><Text value="尚未出现" /></h3>
          {next.length ? (
            <ul>
              {next.map((m) => (
                <li key={m.id}>
                  <button type="button" className={`${row} is-ahead`} onClick={() => onCommit(m.t)}>
                    <span>{m.capability}</span>
                    <span className="num">{tx(untilLabel(t, m.t))}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="chronicle-cap-empty"><Text value="有据可查的能力都已出现；再往后是预测。" /></p>
          )}
        </div>
      </div>
    </section>
  );
}
