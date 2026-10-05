// The film strip of eras: every plate in its own period style, in order, the current one lit. Real links,
// so it is also the way through time without JavaScript.
import { useEffect, useRef } from "react";
import { Link } from "react-router";
import type { ChronicleEra } from "@aihot/contracts/chronicle";
import { timeParam } from "./format";

export function EraStrip({ eras, current, now }: { eras: ChronicleEra[]; current: string; now: number }) {
  const strip = useRef<HTMLDivElement>(null);
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
        <h2 id="era-strip">时代画卷</h2>
        <p>每个时代用它自己的画风来画。</p>
      </div>
      <nav aria-label="时代">
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
    </section>
  );
}
