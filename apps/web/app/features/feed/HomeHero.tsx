import { FEATURES } from "@aihot/industry/features";
import { Link } from "../../lib/navigation";
import { Text, useTranslate } from "../../lib/i18n";
import type { TimelineCard } from "@aihot/contracts/site";
import { beijingDate, beijingTime } from "@aihot/contracts/time";
import { Plate } from "../../components/shell/Deck";
import { chronicleHref } from "../chrono/TimeMachine";
import { NowInstruments, type ChronicleNow, type CostReading } from "../chrono/ChronicleNow";
import { weekdayShort } from "../../lib/format";

/** The day the page shows (the time machine's, else today), in a deck's kicker. */
export function TodayLabel({ at }: { at?: string | null }) {
  const tx = useTranslate();
  const day = at ?? beijingDate(Date.now());
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  return (
    <span suppressHydrationWarning>
      {y}.{String(m).padStart(2, "0")}.{String(d).padStart(2, "0")} · {tx(weekdayShort(day))}
    </span>
  );
}

const sourcesOf = (c: TimelineCard) => (c.group ? c.group.additionalSourceCount + 1 : 1);

/** The day's lead: of the newest day's picks, the one most sources reported, then the highest scored. */
export function leadCard(cards: TimelineCard[]): TimelineCard | null {
  if (cards.length === 0) return null;
  const day = beijingDate(cards[0]!.anchorAt);
  return cards
    .filter((c) => beijingDate(c.anchorAt) === day && c.item.title)
    .reduce<TimelineCard | null>((best, c) => (!best || sourcesOf(c) > sourcesOf(best) || (sourcesOf(c) === sourcesOf(best) && (c.item.score ?? 0) > (best.item.score ?? 0)) ? c : best), null);
}

function LeadStory({ card, past }: { card: TimelineCard; past: boolean }) {
  const tx = useTranslate();
  const sources = sourcesOf(card);
  return (
    <Link viewTransition to={`/items/${card.item.id}`} className="home-lead">
      <span className="home-lead-kicker">
        <Text value={past ? "当天头条" : "今日头条"} />
        <span>{sources > 1 && `${tx("{0} 家信源", sources)} · `}{beijingTime(card.anchorAt)}</span>
      </span>
      <span className="home-lead-title">{card.item.title}</span>
      <span className="home-lead-go"><Text value="读这件事" /> →</span>
    </Link>
  );
}

/**
 * The front page's first screen: the plate, the line and what it means, the day's lead, and at the foot
 * the axis with one reading of how fast the curve is moving. Anything narrower than the plain front page
 * (a tag, a category) gets a compact deck instead.
 */
export function HomeHero({ label, heading, at, lead, chronicle, cost }: { label: string; heading: string; at?: string | null; lead: TimelineCard | null; chronicle: ChronicleNow | null; cost: CostReading | null }) {
  const tx = useTranslate();
  return (
    <section className="deck home-hero" aria-label={label}>
      {/* Cover-fit to the hero's height, so a phone shows a slice of a much wider picture. */}
      <Plate src="/media/art/home-wheat-monolith" className="deck-plate" highResolution sizes="max(100vw, calc(min(100svh, 1040px) * 1.5))" />
      <div className="deck-shade" aria-hidden="true" />
      <div className="deck-inner">
        <div className="home-hero-copy">
          <h1 className="deck-heading">{heading}</h1>
          <div className="deck-kicker"><TodayLabel at={at} /><Text value="· 智能体时代" /></div>
          <p className="home-hero-title"><Text value="降临不是一个日期，" /><br /><Text value="而是一条曲线。" /></p>
          <p className="deck-desc">{tx("人和 AI 正在共同演化，就像人和小麦。")}<span className="home-hero-desc-more">{tx("我们每天记下这条曲线走到了哪里。")}</span></p>
          <div className="home-hero-links">
            {chronicle && <Link to={chronicleHref(at ?? null)} className="home-hero-chronicle"><Text value="走进加速史 →" /></Link>}
            {FEATURES.eaccConcepts && <Link to="/manifesto" className="home-hero-manifesto"><Text value="读《降临派宣言》→" /></Link>}
          </div>
        </div>
        {lead && <LeadStory card={lead} past={!!at} />}
        {chronicle && <NowInstruments now={chronicle} at={at ?? null} cost={cost} />}
      </div>
    </section>
  );
}
