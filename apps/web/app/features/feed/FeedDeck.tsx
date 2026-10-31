import { featuredProduct } from "@aihot/industry/products";
import { Link } from "../../lib/navigation";
import { Text, useTranslate } from "../../lib/i18n";
import type { Ref } from "react";
import { useRouteLoaderData } from "react-router";
import type { TimelineCard } from "@aihot/contracts/site";
import { beijingDate, beijingTime } from "@aihot/contracts/time";
import { Deck, Plate } from "../../components/shell/Deck";
import { KardashevMeter } from "../chrono/KardashevMeter";
import { NowCard, NowInstruments, type ChronicleNow } from "../chrono/ChronicleNow";
import { recordEngagement } from "../../lib/engagement";
import { weekdayShort } from "../../lib/format";
import { webModules } from "../../site-modules";
import type { loader as rootLoader } from "../../root";

/** The day the page shows (the time machine's, else today), in the deck's kicker. */
function TodayLabel({ at }: { at?: string | null }) {
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

export function LeadStory({ card, past }: { card: TimelineCard; past: boolean }) {
  const tx = useTranslate();
  const sources = sourcesOf(card);
  return (
    <Link viewTransition to={`/items/${card.item.id}`} className="home-lead">
      <span className="home-lead-kicker">
        <Text value={past ? "当天头条" : "今日头条"} />
        <span>{sources > 1 && `${tx("{0} 家信源", sources)} · `}{beijingTime(card.anchorAt)}</span>
      </span>
      <span className="home-lead-title">{card.item.title}</span>
      {card.item.summary && <span className="home-lead-summary">{card.item.summary}</span>}
      <span className="home-lead-go"><Text value="读这件事" /> →</span>
    </Link>
  );
}

/**
 * The deck above 精选 and 全部动态: the front page's night plate across the first screen, the line, and
 * beside it the chronicle's latest moment with the axis and civilization readings along its foot (the
 * front page, with the time machine), else the day's lead story and the Kardashev rail. Both feeds and all their categories
 * share it, so switching feed or category changes only the list below and the filter row stays where it
 * was. A tag page (reached from a link, not a tab) gets the compact deck with the tag as its title.
 */
export function FeedDeck({ label, heading, at, tag, front = false, lead, chronicle, subscribeRef }: { label: string; heading: string; at?: string | null; tag?: string | null; /** The front page: the plate fills the first screen. */ front?: boolean; lead?: TimelineCard | null; chronicle?: ChronicleNow | null; subscribeRef?: Ref<HTMLSpanElement> }) {
  const tx = useTranslate();
  const root = useRouteLoaderData<typeof rootLoader>("root");
  const k = root?.timeBounds?.kardashev ?? null;
  if (tag) return <Deck compact art="home-intelligence" label={label} kicker={<TodayLabel at={at} />} title={`#${tag}`} />;
  return (
    <section className={`deck home-hero ${front ? "is-front" : ""}`} aria-label={label}>
      <Plate src="/media/art/epochs/agents" className="deck-plate" />
      <div className="deck-shade" aria-hidden="true" />
      <div className="deck-inner">
        <div className="home-hero-row">
          <div className="home-hero-copy">
            <h1 className="deck-heading">{heading}</h1>
            <div className="deck-kicker"><TodayLabel at={at} /><Text value="· 智能体时代" /></div>
            <p className="home-hero-title"><Text value="宇宙在降温，" /><br /><Text value="文明在升温。" /></p>
            <p className="deck-desc">{tx("站在时间之外看这一天，和刚刚推着文明往前走的那几件事。")}</p>
            <div className="home-hero-actions">
              <span ref={subscribeRef} className="inline-flex">
                <Link to="/subscribe" onClick={() => recordEngagement("subscribe_click")} className="deck-button is-primary"><Text value="订阅每日 08:00 日报" /></Link>
              </span>
              <Link to="/chronicle" className="deck-button"><Text value="打开加速史" /></Link>
              {webModules().flatMap((m) => m.home?.links ?? []).map((l) => <Link key={l.to} to={l.to} className="deck-button home-hero-extra"><Text value={l.label} /></Link>)}
            </div>
            {featuredProduct()?.url && <Link to={featuredProduct()!.url!} className="home-hero-wallpaper home-hero-extra"><Text value="设为 4K 壁纸 →" /></Link>}
          </div>
          {chronicle ? <NowCard now={chronicle} at={at ?? null} /> : lead && <LeadStory card={lead} past={!!at} />}
        </div>
        {chronicle ? <NowInstruments now={chronicle} at={at ?? null} /> : k !== null && <KardashevMeter k={k} />}
      </div>
    </section>
  );
}
