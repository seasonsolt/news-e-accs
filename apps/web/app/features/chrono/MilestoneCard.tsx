import { Text, useTranslate } from "../../lib/i18n";
// The milestone a star opens: the same fields the rail already shows (time, category, detail, source).
import { useEffect, useRef } from "react";
import { timeLabel, type ChronicleMilestone } from "@aihot/contracts/chronicle";
import { CATEGORY } from "./MomentList";

export function MilestoneCard({ milestone, now, onClose }: { milestone: ChronicleMilestone; now: number; onClose: () => void }) {
  const tx = useTranslate();
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => { close.current?.focus({ preventScroll: true }); }, [milestone.id]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <article className={`cosmos-card cat-${milestone.category} ${milestone.forecast ? "is-forecast" : ""}`} role="dialog" aria-modal="false" aria-labelledby="cosmos-card-title">
      <button ref={close} type="button" className="cosmos-card-close" onClick={onClose} aria-label={tx("关闭里程碑")}><Text value="关闭" /></button>
      <p className="cosmos-card-meta">
        <span className="num">{tx(timeLabel(milestone.t, now, milestone.precision, milestone.date))}</span>
        <span>{tx(CATEGORY[milestone.category])}</span>
        {milestone.forecast && <span className="cosmos-card-badge"><Text value="预测" /></span>}
      </p>
      <h2 id="cosmos-card-title">{milestone.title}</h2>
      {milestone.art && <img src={`/media/art/moments/${milestone.art}-800.webp`} alt="" width={320} height={180} />}
      <p>
        {milestone.detail}{" "}
        <a href={milestone.source} target="_blank" rel="noopener noreferrer"><Text value="来源" /></a>
        {milestone.forecast && (
          <>
            {tx(" · 预测方 ")}
            <a href={milestone.forecast.url} target="_blank" rel="noopener noreferrer">{milestone.forecast.by}</a>
          </>
        )}
      </p>
    </article>
  );
}
