import { Text, useTranslate } from "../../lib/i18n";
// The observation deck: the era's plate fills a dark stage and the moment is read out large over it; the
// chronometer docks along its foot. Standing on a milestone that has its own plate (drawn in the look of
// that very year), the deck shows that plate and that event instead. Dark in either theme: an instrument.
// `voyage` is the optional 3D layer. While it is active the plate and this readout stay in the document
// (search engines and screen readers keep them) and the depth parallax steps aside so it does not hold
// a second WebGL context.
import type { ReactNode } from "react";
import type { ChronicleEra, ChronicleMilestone } from "@aihot/contracts/chronicle";
import { Plate } from "../../components/shell/Deck";
import { DepthLayer } from "./DepthLayer";
import { plateOf } from "./format";

/** "138亿年前" → ["", "138", "亿年前"]; "公元前3201年" → ["公元前", "3201", "年"]; a date keeps its tail. */
function splitLabel(label: string): [string, string, string] {
  const m = /^(\D*)(\d[\d.]*)(.*)$/.exec(label);
  return m ? [m[1]!, m[2]!, m[3]!] : ["", label, ""];
}

export function Observatory({ era, focus, nearby, label, distance, cosmos = false, voyage = null }: {
  era: ChronicleEra;
  focus: ChronicleMilestone | null;
  nearby: string[];
  label: string;
  distance: string;
  cosmos?: boolean;
  voyage?: ReactNode;
}) {
  const tx = useTranslate();
  const [lead, figure, tail] = splitLabel(label);
  const moment = focus?.art ? focus : null;
  const plate = plateOf(era, focus);
  return (
    <section className={`observatory ${era.forecast ? "is-forecast" : ""} ${cosmos ? "is-cosmos" : ""}`} aria-label={tx("观测舱")}>
      <Plate key={plate.key} src={plate.src} alt={plate.alt} className="observatory-plate" />
      {/* Kept mounted across plates: it flies from one to the next. The voyage replaces it while it flies. */}
      {!cosmos && <DepthLayer src={plate.src} at={plate.at} nearby={nearby} />}
      <div className="observatory-shade" aria-hidden="true" />
      <header className="observatory-readout">
        <p className="observatory-kicker">
          <span><Text value="加速史" /></span>
          <span aria-hidden="true">·</span>
          <span><Text value="四维视角" /></span>
          <span aria-hidden="true">·</span>
          <span>{distance}</span>
          {moment && <span className="observatory-chip">{era.title}</span>}
          {era.forecast && <span className="observatory-forecast"><Text value="推测" /></span>}
        </p>
        <h1 className="observatory-time">
          {lead && <span className="observatory-time-unit">{lead}</span>}
          <span className="observatory-time-figure">{figure}</span>
          {tail && <span className="observatory-time-unit">{tail}</span>}
        </h1>
        <h2 className="observatory-era">{moment ? moment.title : era.title}</h2>
        <p className="observatory-summary">{moment ? moment.detail : era.summary}</p>
        <p className="observatory-style"><Text value="画风 ·" />{moment ? (moment.artStyle ?? era.artStyle) : era.artStyle}</p>
      </header>
      {voyage}
    </section>
  );
}
