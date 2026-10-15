import { Link } from "../../lib/navigation";
import { contentFetch } from "../../lib/content-fetch";
import { useTranslate, Text } from "../../lib/i18n";
import { useEffect, useRef, useState } from "react";

import type { StoryFollowup, StoryFollowupsResponse, StoryRef } from "@aihot/contracts/site";
import { MoreLink } from "../../components/ui/Page";
import { monthDayTime } from "../../lib/format";

/** The report this page shows, placed among the event's developments. */
export interface CurrentReport { id: string; title: string; timelineAt: string }

/**
 * "这件事的进展": the event's developments as a dated line, newest first, with this page's own report
 * marked where it falls and a link to the whole event. Loaded after the page so the article renders
 * without waiting for it.
 */
export function StoryFollowups({ story, current }: { story: StoryRef; current: CurrentReport }) {
  const [items, setItems] = useState<StoryFollowup[] | null>(null);
  const [more, setMore] = useState(false);
  const anchor = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    let started = false;
    setItems(null);
    const load = () => {
      if (started) return;
      started = true;
      contentFetch(`/api/site/stories/${encodeURIComponent(story.publicId)}/followups`, { signal: controller.signal })
        .then((r) => (r.ok ? r.json() : null))
        .then((body: StoryFollowupsResponse | null) => {
          if (!body || controller.signal.aborted) return;
          setItems(body.items.filter((d) => d.representative.id !== current.id));
          setMore(body.more);
        }).catch(() => {});
    };
    const observer = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { observer?.disconnect(); load(); }
    }, { rootMargin: "500px" });
    if (observer && anchor.current) observer.observe(anchor.current);
    else load();
    return () => { observer?.disconnect(); controller.abort(); };
  }, [story.publicId, current.id]);
  return <div ref={anchor}>
    <noscript><Link to={`/story/${story.publicId}`}><Text value="查看事件全部后续" /></Link></noscript>
    {items && items.length > 0 && <Timeline items={items} more={more} story={story} current={current} />}
  </div>;
}

type Row = { key: string; id: string; title: string; source: string | null; at: string; here: boolean };

function Timeline({ items, more, story, current }: { items: StoryFollowup[]; more: boolean; story: StoryRef; current: CurrentReport }) {
  const tx = useTranslate();
  const rows: Row[] = items.map((d) => ({ key: d.factId, id: d.representative.id, title: d.representative.title, source: d.representative.source.name, at: d.representative.timelineAt, here: false }));
  rows.push({ key: `here:${current.id}`, id: current.id, title: current.title, source: null, at: current.timelineAt, here: true });
  rows.sort((a, b) => b.at.localeCompare(a.at));
  return (
    <section className="mt-9">
      <div className="flex items-center justify-between">
        <h2 className="text-[12.5px] font-semibold text-ink-3"><Text value="这件事的进展" /><span className="num font-normal text-ink-4"> · {rows.length}{more ? "+" : ""}</span></h2>
        <MoreLink to={`/story/${story.publicId}`}><Text value="查看完整事件" /></MoreLink>
      </div>
      <ol className="mt-3 border-l border-line-strong">
        {rows.map((r) => (
          <li key={r.key} className="relative pb-3.5 pl-4 last:pb-0">
            <span aria-hidden="true" className={`absolute -left-[4.5px] top-[7px] size-2 rounded-full ${r.here ? "bg-accent" : "bg-line-strong"}`} />
            <div className="num text-[11.5px] text-ink-4" suppressHydrationWarning>{tx(monthDayTime(r.at))}</div>
            {r.here ? (
              <p className="mt-0.5 text-[14px] leading-snug text-ink">{r.title} <span className="whitespace-nowrap text-[12px] font-semibold text-accent"><Text value="本条" /></span></p>
            ) : (
              <Link viewTransition to={`/items/${r.id}`} className="group mt-0.5 block">
                <span className="text-[14px] leading-snug text-ink-2 transition-colors group-hover:text-accent">{r.title}</span>
                <span className="ml-2 whitespace-nowrap text-[12px] text-ink-4">{r.source}</span>
              </Link>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
