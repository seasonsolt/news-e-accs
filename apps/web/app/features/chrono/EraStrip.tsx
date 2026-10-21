import { Link } from "../../lib/navigation";
import { Text, useTranslate } from "../../lib/i18n";
// The film strip of eras: every plate in its own period style, in order, the current one lit. Real links,
// so it is also the way through time without JavaScript.
import { useEffect, useRef } from "react";

import { timeLabel, type ChronicleMilestone, type ChronicleEra } from "@aihot/contracts/chronicle";
import { timeParam } from "./format";

export function EraStrip({ eras, milestones, current, now }: { eras: ChronicleEra[]; milestones: ChronicleMilestone[]; current: string; now: number }) {
  const tx = useTranslate();
  const strip = useRef<HTMLDivElement>(null);
  const index = eras.findIndex((era) => era.id === current);
  const selected = eras[index];
  const until = eras[index + 1]?.from ?? Infinity;
  const scenes = selected ? milestones.filter((m) => m.art && m.t >= selected.from && m.t < until) : [];
  // Keep the lit frame in view, moving the strip only (never the page).
  useEffect(() => {
    const box = strip.current;
    const frame = box?.querySelector<HTMLElement>('[aria-current="true"]');
    if (!box || !frame) return;
    const target = frame.offsetLeft - (box.clientWidth - frame.offsetWidth) / 2;
    box.scrollTo({ left: Math.max(0, target), behavior: "smooth" });
  }, [current]);
  return (
    <section aria-labelledby="era-strip">
      <div className="chronicle-section-head">
        <h2 id="era-strip"><Text value="时代画卷" /></h2>
        <p><Text value="选择一个时代，展开它的场景。" /></p>
      </div>
      <nav aria-label={tx("时代")}>
        <div ref={strip} className="chronicle-strip">
          {eras.map((era) => (
            <Link
              key={era.id}
              to={`?t=${timeParam(era.from + 1e-9, now)}`}
              preventScrollReset
              aria-current={era.id === current ? "true" : undefined}
              className={`chronicle-frame ${era.forecast ? "is-forecast" : ""}`}
              title={era.artStyle}
            >
              <img src={`/media/art/epochs/${era.art}-800.webp`} alt="" loading="lazy" decoding="async" width={160} height={107} />
              <span>{era.title}</span>
            </Link>
          ))}
        </div>
      </nav>
      {selected && (
        <section className="chronicle-scenes" aria-labelledby="era-scenes-title">
          <div className="chronicle-section-head">
            <h3 id="era-scenes-title">{selected.title}</h3>
            <p>{scenes.length ? tx("{0} 幅场景 · 点选查看这一刻", scenes.length) : tx("时代概览")}</p>
          </div>
          <p className="chronicle-scenes-summary">{selected.summary}</p>
          {scenes.length ? (
            <ul className="chronicle-scenes-grid">
              {scenes.map((m) => (
                <li key={m.id}>
                  <Link className="chronicle-scene" to={`?t=${timeParam(m.t, now)}#observatory`}>
                    <img src={`/media/art/moments/${m.art}-800.webp`} alt="" loading="lazy" decoding="async" width={800} height={533} title={m.artStyle} />
                    <span className="chronicle-scene-date num">{tx(timeLabel(m.t, now, m.precision, m.date))}{m.forecast && <> · <Text value="预测" /></>}</span>
                    <span className="chronicle-scene-title">{m.title}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <img className="chronicle-era-overview" src={`/media/art/epochs/${selected.art}-800.webp`} alt={`${selected.title}（${selected.artStyle}）`} loading="lazy" decoding="async" width={800} height={533} />
          )}
        </section>
      )}
    </section>
  );
}
