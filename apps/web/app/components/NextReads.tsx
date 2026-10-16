// The end of a story or an item page: most readers arrive from search and leave after one page, and
// related stories are rarely there, so the latest daily and what is hot now are always offered.
import type { NextReads as Reads } from "@aihot/contracts/site";
import { Link } from "../lib/navigation";
import { Text, useTranslate } from "../lib/i18n";
import { inNav } from "./shell/nav";
import { IconChevronRight } from "./icons";

const HOT_SHOWN = 4;

export function NextReads({ reads, currentStory = null, className = "mt-9" }: { reads: Reads | null; currentStory?: string | null; className?: string }) {
  const tx = useTranslate();
  const daily = reads && inNav("/daily") ? reads.daily : null;
  const hot = reads && inNav("/hot") ? reads.hot.filter((h) => h.storyPublicId !== currentStory).slice(0, HOT_SHOWN) : [];
  if (!daily && hot.length === 0) return null;
  return (
    <section aria-labelledby="next-reads" className={className}>
      <h2 id="next-reads" className="text-[12.5px] font-semibold text-ink-3"><Text value="继续阅读" /></h2>
      {daily && (
        <Link viewTransition to={`/daily/${daily.key}`} className="group mt-2 flex items-center gap-3 rounded-card border border-line bg-surface px-4 py-3 transition-colors hover:border-accent">
          <span className="min-w-0 flex-1">
            <span className="block text-[12px] text-ink-4">
              <Text value="最新日报" /> · {tx("第 {0} 期", daily.issueNumber)}
            </span>
            {daily.title && <span className="mt-0.5 block text-[14.5px] font-semibold leading-[1.55] text-ink transition-colors group-hover:text-accent">{daily.title}</span>}
          </span>
          <IconChevronRight size={14} className="shrink-0 text-ink-4" />
        </Link>
      )}
      {hot.length > 0 && (
        <>
          <h3 className="mt-5 text-[12px] text-ink-4"><Text value="正在热议" /></h3>
          <ol className="mt-1 divide-y divide-line-soft">
            {hot.map((h) => (
              <li key={h.storyPublicId}>
                <Link viewTransition to={`/story/${h.storyPublicId}`} className="group flex items-baseline gap-3 py-2.5">
                  <span className="num w-4 shrink-0 text-[12px] text-ink-4">{h.rank}</span>
                  <span className="min-w-0 flex-1 text-[14px] text-ink-2 transition-colors group-hover:text-accent">{h.title}</span>
                </Link>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}
