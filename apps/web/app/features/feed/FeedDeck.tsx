import { featuredProduct } from "@aihot/industry/products";
import { Link } from "../../lib/navigation";
import { Text, useTranslate } from "../../lib/i18n";
import type { Ref } from "react";
import { useRouteLoaderData } from "react-router";
import { beijingDate } from "@aihot/contracts/time";
import { Deck } from "../../components/shell/Deck";
import { KardashevMeter } from "../chrono/KardashevMeter";
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

/**
 * The deck above 精选 and 全部动态. Both feeds and all their categories share it, so switching feed or
 * category changes only the list below and the filter row stays where it was. A tag page (reached from a
 * link, not a tab) gets the compact deck with the tag as its title.
 */
export function FeedDeck({ label, heading, at, tag, subscribeRef }: { label: string; heading: string; at?: string | null; tag?: string | null; subscribeRef?: Ref<HTMLSpanElement> }) {
  const tx = useTranslate();
  const root = useRouteLoaderData<typeof rootLoader>("root");
  const k = root?.timeBounds?.kardashev ?? null;
  if (tag) return <Deck compact art="home-intelligence" label={label} kicker={<TodayLabel at={at} />} title={`#${tag}`} />;
  return (
    <Deck
      art="home-intelligence"
      label={label}
      heading={heading}
      kicker={<><TodayLabel at={at} /><Text value="· 智能体时代" /></>}
      title={<><Text value="宇宙在降温，" /><br /><Text value="文明在升温。" /></>}
      description={tx("站在时间之外看这一天：它在一百三十八亿年里的位置，以及刚刚推着文明往前走的那几件事。")}
      aside={k !== null && <KardashevMeter k={k} />}
    >
      <div className="flex flex-wrap gap-3">
        <span ref={subscribeRef} className="inline-flex">
          <Link to="/subscribe" onClick={() => recordEngagement("subscribe_click")} className="deck-button is-primary"><Text value="订阅每日 08:00 日报" /></Link>
        </span>
        <Link to="/chronicle" className="deck-button"><Text value="打开加速史" /></Link>
        {webModules().flatMap((m) => m.home?.links ?? []).map((l) => <Link key={l.to} to={l.to} className="deck-button"><Text value={l.label} /></Link>)}
      </div>
      {featuredProduct()?.url && <Link to={featuredProduct()!.url!} className="mt-3 inline-flex text-sm text-[#e8c98a]"><Text value="设为 4K 壁纸 →" /></Link>}
    </Deck>
  );
}
