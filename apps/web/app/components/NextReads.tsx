import type { NextReads as Reads } from "@aihot/contracts/site";
import { Link } from "../lib/navigation";
import { Text } from "../lib/i18n";
import { inNav } from "./shell/nav";
import { IconChevronRight } from "./icons";
import { readingLinks, type ReadingLink } from "./next-reads";

export function NextReads({ reads, related = [], currentStory = null, className = "mt-7" }: {
  reads: Reads | null;
  related?: ReadingLink[];
  currentStory?: string | null;
  className?: string;
}) {
  const links = readingLinks(reads ? { daily: inNav("/daily") ? reads.daily : null, hot: inNav("/hot") ? reads.hot : [] } : null, related, currentStory);
  const [primary, ...more] = links;
  if (!primary) return null;
  return (
    <section aria-labelledby="next-reads" className={className}>
      <h2 id="next-reads" className="mb-2 text-[12.5px] font-semibold text-ink-3"><Text value="接下来读什么" /></h2>
      <Link viewTransition to={primary.to} className="group flex items-center gap-4 rounded-card border border-accent/30 bg-surface px-5 py-4 transition-colors hover:border-accent">
        <span className="min-w-0 flex-1">
          <span className="block text-[12px] font-semibold text-accent"><Text value={primary.label} /></span>
          <span className="mt-1 block text-[17px] font-semibold leading-relaxed text-ink">{primary.title}</span>
        </span>
        <IconChevronRight size={18} className="shrink-0 text-accent" />
      </Link>
      {more.length > 0 && <ul className="mt-2 divide-y divide-line-soft">
        {more.map((link) => <li key={link.to}>
          <Link viewTransition to={link.to} className="group flex items-baseline gap-3 py-2.5 text-[13.5px]">
            <span className="shrink-0 text-[11.5px] text-ink-4"><Text value={link.label} /></span>
            <span className="min-w-0 text-ink-2 group-hover:text-accent">{link.title}</span>
          </Link>
        </li>)}
      </ul>}
    </section>
  );
}
