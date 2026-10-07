// The observation deck: the era's plate fills a dark stage and the moment is read out large over it; the
// chronometer docks along its foot. Standing on a milestone that has its own plate (drawn in the look of
// that very year), the deck shows that plate and that event instead. Dark in either theme: an instrument.
import type { ChronicleEra, ChronicleMilestone } from "@aihot/contracts/chronicle";
import { Plate } from "../../components/shell/Deck";

/** "138亿年前" → ["", "138", "亿年前"]; "公元前3201年" → ["公元前", "3201", "年"]; a date keeps its tail. */
function splitLabel(label: string): [string, string, string] {
  const m = /^(\D*)(\d[\d.]*)(.*)$/.exec(label);
  return m ? [m[1]!, m[2]!, m[3]!] : ["", label, ""];
}

export function Observatory({ era, focus, label, distance }: { era: ChronicleEra; focus: ChronicleMilestone | null; label: string; distance: string }) {
  const [lead, figure, tail] = splitLabel(label);
  const moment = focus?.art ? focus : null;
  const plate = moment
    ? { key: `m-${moment.id}`, src: `/media/art/moments/${moment.art}`, alt: `${moment.title}（${moment.artStyle ?? era.artStyle}）` }
    : { key: `e-${era.id}`, src: `/media/art/epochs/${era.art}`, alt: `${era.title}（${era.artStyle}）` };
  return (
    <section className={`observatory ${era.forecast ? "is-forecast" : ""}`} aria-label="观测舱">
      <Plate key={plate.key} src={plate.src} alt={plate.alt} className="observatory-plate" />
      <div className="observatory-shade" aria-hidden="true" />
      <header className="observatory-readout">
        <p className="observatory-kicker">
          <span>四维视角</span>
          <span aria-hidden="true">·</span>
          <span>{distance}</span>
          {moment && <span className="observatory-chip">{era.title}</span>}
          {era.forecast && <span className="observatory-forecast">推测</span>}
        </p>
        <h1 className="observatory-time">
          {lead && <span className="observatory-time-unit">{lead}</span>}
          <span className="observatory-time-figure">{figure}</span>
          {tail && <span className="observatory-time-unit">{tail}</span>}
        </h1>
        <h2 className="observatory-era">{moment ? moment.title : era.title}</h2>
        <p className="observatory-summary">{moment ? moment.detail : era.summary}</p>
        <p className="observatory-style">画风 · {moment ? (moment.artStyle ?? era.artStyle) : era.artStyle}</p>
      </header>
    </section>
  );
}
