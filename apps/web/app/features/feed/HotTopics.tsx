import { Link } from "../../lib/navigation";
import { Text, useTranslate } from "../../lib/i18n";

import type { HotStripEntry } from "@aihot/contracts/site";
import { IconArrowRight, IconMinus, IconTrendDown, IconTrendUp } from "../../components/icons";
import { Faces } from "../hot/Faces";
import { useAt, withAt } from "../chrono/at";

function hrefOf(e: HotStripEntry): string {
  return e.storyPublicId ? `/story/${e.storyPublicId}` : e.itemId ? `/items/${e.itemId}` : "/hot";
}

/** Where the heat is heading, as a small arrow (a "新" mark for a story new to the ranking). */
function TrendMark({ trend }: { trend: HotStripEntry["trend"] }) {
  const tx = useTranslate();
  if (trend === "up") return <IconTrendUp size={14} strokeWidth={2.2} className="text-[var(--heat)]" aria-label={tx("热度上升")} />;
  if (trend === "down") return <IconTrendDown size={14} strokeWidth={2.2} className="text-[var(--deck-faint)]" aria-label={tx("热度回落")} />;
  if (trend === "new") return <span className="rounded-full bg-[var(--heat)] px-1.5 text-[10.5px] font-semibold leading-4 text-[#140a03]"><Text value="新" /></span>;
  if (trend === "unknown") return null; // sources behind on collection: no comparison to show
  return <IconMinus size={14} strokeWidth={2.2} className="text-[var(--deck-faint)]" aria-label={tx("热度持平")} />;
}

/**
 * The top of the hot ranking on the home page, as the deck's pressure gauge: a dark brass card, a live
 * dot, ranks and titles, then columns of fixed width so every row lines up — who is talking (精选组
 * faces, from sm), the heat in the deck's figures and an arrow for where it is heading.
 */
export function HotTopics({ entries }: { entries: HotStripEntry[] }) {
  const tx = useTranslate();
  const at = useAt();
  if (entries.length === 0) return null;
  return (
    <section aria-labelledby="hot-topics" className="hot-gauge mb-6 px-4 pb-2 pt-4 lg:px-6">
      <div className="mb-1 flex items-center justify-between">
        <h2 id="hot-topics" className="flex items-center gap-2 font-mono text-[12px] font-medium tracking-[0.12em] text-[var(--brass)]">
          <span className="relative flex size-2" aria-hidden="true">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-[var(--heat)] opacity-40" />
            <span className="relative inline-flex size-2 rounded-full bg-[var(--heat)]" />
          </span><Text value="压力表 · 此刻最热" /></h2>
        <Link to={withAt("/hot", at)} className="group inline-flex items-center gap-1 text-[12.5px] text-[var(--deck-dim)] transition-colors hover:text-[var(--brass-hi)]"><Text value="完整热点榜" /><IconArrowRight size={13} className="transition-transform duration-200 group-hover:translate-x-0.5" />
        </Link>
      </div>
      <ol>
        {entries.slice(0, 5).map((e) => (
          <li key={e.rank}>
            <Link
              to={withAt(hrefOf(e), at)}
              className="group -mx-2 grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-x-3 rounded-tile px-2 py-2.5 transition-colors hover:bg-white/5 sm:grid-cols-[28px_minmax(0,1fr)_120px_72px_20px] sm:gap-x-4"
            >
              <span className="font-display text-[22px] italic leading-none text-[var(--brass)]">{e.rank}</span>
              <span className="line-clamp-2 min-w-0 text-[15px] font-medium leading-[1.5] text-[var(--deck-ink)] transition-colors group-hover:text-[var(--brass-hi)] lg:line-clamp-1">{e.title}</span>
              <span className="hidden justify-end sm:flex">
                <Faces interactive={false} participants={e.participants} total={e.participantCount} size={20} />
              </span>
              <span className="flex items-center justify-end gap-2.5 sm:contents">
                <span className="whitespace-nowrap text-right" title={tx("热度指数")}>
                  <span className="deck-figure text-[24px]">{e.heat.toFixed(1)}</span>
                </span>
                <span className="flex w-5 justify-center">
                  <TrendMark trend={e.trend} />
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
