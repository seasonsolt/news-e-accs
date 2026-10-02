// The hot list's pressure gauge: a brass dial whose needle rises, as the page opens, to how hot the
// top story runs (its heat against FULL_SCALE). Decoration with a text twin: the zone name is read out.
import type { CSSProperties } from "react";

/** Heat at which the needle reaches the end of the dial (a story about 40 independent sources discuss). */
const FULL_SCALE = 40;
/** The dial spans 240°, from -120° (empty) to +120° (full). */
const SWEEP = 240;

/** Zone names in the light theme's inks: the label always sits on the dial's parchment. */
function zoneOf(ratio: number): { label: string; tone: string } {
  if (ratio >= 0.66) return { label: "沸腾", tone: "#a3321c" };
  if (ratio >= 0.33) return { label: "升温", tone: "#7a5a1c" };
  return { label: "平静", tone: "#356a5a" };
}

export function HeatGauge({ heat, className = "" }: { heat: number; className?: string }) {
  const ratio = Math.max(0, Math.min(1, heat / FULL_SCALE));
  const zone = zoneOf(ratio);
  const angle = -SWEEP / 2 + ratio * SWEEP;
  // Tick marks every 20°, the last third of the dial in the hot colour.
  const ticks = Array.from({ length: SWEEP / 20 + 1 }, (_, i) => -SWEEP / 2 + i * 20);
  return (
    <div className={`heat-gauge ${className}`} role="img" aria-label={`今日热度：${zone.label}`}>
      <svg viewBox="0 0 100 100" className="size-full" aria-hidden="true">
        <circle cx="50" cy="50" r="47" fill="#2a1f16" />
        <circle cx="50" cy="50" r="44" fill="#f4ecdc" stroke="#b0802f" strokeWidth="3" />
        {ticks.map((t) => (
          <line
            key={t}
            x1="50"
            y1="12"
            x2="50"
            y2={t % 60 === 0 ? "19" : "16"}
            stroke={t >= SWEEP / 2 - SWEEP / 3 ? "#a3321c" : "#62513f"}
            strokeWidth={t % 60 === 0 ? 2.2 : 1.3}
            transform={`rotate(${t} 50 50)`}
          />
        ))}
        <g className="heat-gauge-needle" style={{ "--needle": `${angle}deg` } as CSSProperties}>
          <path d="M50 50 L48.4 52 L50 16 L51.6 52 Z" fill="#7c4514" />
        </g>
        <circle cx="50" cy="50" r="5" fill="#b0802f" stroke="#2a1f16" strokeWidth="1.2" />
      </svg>
      <span className="heat-gauge-label" style={{ color: zone.tone }}>
        {zone.label}
      </span>
    </div>
  );
}
