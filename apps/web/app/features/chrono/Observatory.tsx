import { featuredProduct } from "@aihot/industry/products";
import type { ReactNode } from "react";
import { Link } from "../../lib/navigation";
import { Text, useTranslate } from "../../lib/i18n";
// The observation deck: the era's plate fills a dark stage and the moment is read out large over it; the
// chronometer docks along its foot. Standing on a milestone that has its own plate (drawn in the look of
// that very year), the deck shows that plate and that event instead. Dark in either theme: an instrument.
// On a desktop the plate is the tunnel's (DepthTunnel.tsx) once it is drawn, and a milestone with a scene
// offers a way in; elsewhere DepthLayer moves the plate.
import type { ChronicleEra, ChronicleMilestone } from "@aihot/contracts/chronicle";
import { Plate } from "../../components/shell/Deck";
import { DepthLayer } from "./DepthLayer";
import { plateOf } from "./format";

/** "138亿年前" → ["", "138", "亿年前"]; "公元前3201年" → ["公元前", "3201", "年"]; a date keeps its tail. */
function splitLabel(label: string): [string, string, string] {
  const m = /^(\D*)(\d[\d.]*)(.*)$/.exec(label);
  return m ? [m[1]!, m[2]!, m[3]!] : ["", label, ""];
}

/** The way into the focused milestone's scene: its page, and the tunnel's hand-over when it can take it. */
export interface ObservatoryScene {
  path: string;
  label: string;
  /** Null where the tunnel does not run: the link opens the page. */
  enter: (() => void) | null;
  /** The tunnel is still loading the scene behind the plate. */
  loading: boolean;
}

export function Observatory({ era, focus, nearby, label, distance, flat, scene, tools }: {
  era: ChronicleEra;
  focus: ChronicleMilestone | null;
  nearby: string[];
  label: string;
  distance: string;
  /** The tunnel draws the plate instead: no DepthLayer. */
  flat: boolean;
  scene: ObservatoryScene | null;
  /** Buttons in the deck's top corner, before the featured product's. */
  tools?: ReactNode;
}) {
  const tx = useTranslate();
  const [lead, figure, tail] = splitLabel(label);
  const moment = focus?.art ? focus : null;
  const plate = plateOf(era, focus);
  return (
    <section id="observatory" className={`observatory ${era.forecast ? "is-forecast" : ""}`} aria-label={tx("观测舱")}>
      <Plate key={plate.key} src={plate.src} alt={plate.alt} className="observatory-plate" />
      {/* Kept mounted across plates: it flies from one to the next. */}
      {!flat && <DepthLayer src={plate.src} at={plate.at} nearby={nearby} />}
      <div className="observatory-shade" aria-hidden="true" />
      <div className="observatory-tools">
        {tools}
        {featuredProduct()?.url && <Link to={featuredProduct()!.url!} className="observatory-wallpaper"><Text value="设为 4K 壁纸 →" /></Link>}
      </div>
      <header className="observatory-readout">
        <p className="observatory-kicker">
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
        {scene && (
          <Link
            to={scene.path}
            className="observatory-enter"
            aria-disabled={scene.loading || undefined}
            onClick={(event) => {
              if (!scene.enter && !scene.loading) return;
              event.preventDefault();
              scene.enter?.();
            }}
          >
            <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true"><path d="M6 .8 11.2 6 6 11.2.8 6Z" fill="currentColor" /></svg>
            {scene.loading ? tx("正在打开场景…") : scene.label}
          </Link>
        )}
      </header>
    </section>
  );
}
