import { useEffect, useState } from "react";
import type { GroupInfo } from "@aihot/contracts/site";
import { Link } from "../../lib/navigation";
import { Text, useTranslate } from "../../lib/i18n";
import { outboundLink } from "../../lib/engagement";
import { reportsUrl, useReports } from "../feed/ReadingGroup";
import { IconArrowUpRight, IconChevronDown } from "../../components/icons";

const SHOWN = 5;

/** "谁在报道": the other reports of this item's news fact, listed on the page rather than behind a toggle. */
export function ItemSources({ group, parentId }: { group: GroupInfo; parentId: string }) {
  const tx = useTranslate();
  const reports = useReports(reportsUrl(group.factId, undefined));
  const [all, setAll] = useState(false);
  useEffect(() => {
    void reports.load();
  }, [group.factId]);
  const others = (reports.reports ?? []).filter((r) => r.id !== parentId);
  const shown = all ? others : others.slice(0, SHOWN);
  const heading = group.additionalSourceCount > 0 ? tx("{0} 家信源报道", group.additionalSourceCount + 1) : tx("{0} 篇报道", group.reportCount);
  return (
    <section className="mt-9">
      <h2 className="text-[12.5px] font-semibold text-ink-3">{heading}</h2>
      <ul className="mt-2 divide-y divide-line-soft">
        {shown.map((r) => (
          <li key={r.id} className="flex items-baseline gap-3 py-2.5">
            <span className="w-[120px] shrink-0 truncate text-[12.5px] text-ink-4 sm:w-[150px]">{r.source.name}</span>
            <Link viewTransition to={`/items/${r.id}`} className="min-w-0 flex-1 text-[14px] leading-snug text-ink-2 transition-colors hover:text-accent">
              {r.title}
            </Link>
            <a href={r.originalUrl} target="_blank" rel="noopener noreferrer" {...outboundLink(r.originalUrl)} aria-label={tx("打开原文")} className="-my-2 grid size-8 shrink-0 place-items-center rounded-full text-ink-4 transition-colors hover:text-accent">
              <IconArrowUpRight size={14} />
            </a>
          </li>
        ))}
        {reports.loading && others.length === 0 && [0, 1].map((i) => <li key={i} className="py-3"><div className="skeleton h-4" /></li>)}
      </ul>
      {reports.error && <button type="button" onClick={() => reports.load()} className="mt-1 text-[12.5px] text-hot"><Text value="暂时无法加载，点此重试" /></button>}
      {!all && others.length > SHOWN && (
        <button type="button" onClick={() => setAll(true)} className="mt-1 inline-flex items-center gap-1 text-[12.5px] text-ink-3 transition-colors hover:text-accent">
          {tx("展开其余 {0} 篇", others.length - SHOWN)}
          <IconChevronDown size={13} />
        </button>
      )}
    </section>
  );
}
