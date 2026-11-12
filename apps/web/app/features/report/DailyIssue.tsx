// A daily issue as one page worth forwarding: the lead told in the deck with ways to share the issue,
// one numbered list of the day's events to scan, and a column beside it to subscribe, share the
// issue's card and reach the other issues. The stories in full follow the list (ReportPaper).
import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { distributionUrl } from "@aihot/contracts/distribution";
import type { ReportCitation, ReportDetail, ReportNavigationEntry } from "@aihot/contracts/site";
import { Badge } from "../../components/ui/Badge";
import { IntentLink } from "../../components/ui/IntentLink";
import { IconArrowUpRight, IconChevronRight, IconImage, IconShare } from "../../components/icons";
import { Link } from "../../lib/navigation";
import { Text, useLocale, useTranslate } from "../../lib/i18n";
import { localePath } from "../../lib/locale";
import { siteUrl } from "../../lib/seo";
import { outboundLink, recordEngagement } from "../../lib/engagement";
import { shareOrCopy } from "../item/share";
import { useAt, withAt } from "../chrono/at";
import { SubscribeCta } from "../subscribe/SubscribeCta";
import { KindSwitch } from "./ReportNav";
import { metricItems, reportPath } from "./format";

const PosterSheet = lazy(() => import("../item/PosterSheet"));

const pad = (n: number) => String(n).padStart(2, "0");
const ENTRY_METRICS = new Set(["totalEvents", "totalStories"]);
const keyOf = (c: ReportCitation) => c.itemId ?? c.title;

/** The headline a daily is shared under: its lead, else its first story, else its own title. */
export function dailyHeadline(report: ReportDetail, leadStory: ReportCitation | null): string {
  return report.lead?.title ?? leadStory?.title ?? report.title;
}

/** The issue's share card (/og/reports/daily), opened on demand in the poster sheet. */
function useShareCard(report: ReportDetail, title: string) {
  const [requested, setRequested] = useState(false);
  const [open, setOpen] = useState(false);
  const sheet = requested && (
    <Suspense fallback={null}>
      <PosterSheet path={`/og/reports/daily/${report.key}.png`} name={`daily-${report.key}`} title={title} heading="分享图" wide open={open} onClose={() => setOpen(false)} />
    </Suspense>
  );
  return { sheet, show: () => { setRequested(true); setOpen(true); recordEngagement("share_click"); } };
}

/** Under the lead in the deck: its source and original, then the ways to pass the issue on. */
export function DailyDeckFoot({ report, leadStory }: { report: ReportDetail; leadStory: ReportCitation | null }) {
  const tx = useTranslate();
  const locale = useLocale();
  const title = dailyHeadline(report, leadStory);
  const card = useShareCard(report, title);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2400);
    return () => clearTimeout(timer);
  }, [copied]);
  // Built on click: the page's own origin is only known in the browser.
  const url = () => `${siteUrl()}${localePath(reportPath("daily", report.key), locale)}`;
  const button = "deck-button min-h-10 gap-2 px-4 text-[14px]";
  return (
    <div className="flex flex-col gap-5">
      {leadStory && (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-[var(--deck-dim)]">
          <span className="text-[var(--deck-ink)]">{leadStory.sourceName}</span>
          {leadStory.firstParty && <span className="rounded-full border border-[rgb(217_164_65/.55)] px-2 text-[12px] leading-[18px] text-[var(--brass)]"><Text value="一手" /></span>}
          {!!leadStory.otherSources && (leadStory.storyId
            ? <IntentLink viewTransition to={`/story/${leadStory.storyId}`} className="underline decoration-[rgb(244_236_220/.3)] underline-offset-[3px] hover:text-[var(--deck-ink)]">{tx("另有 {0} 家信源报道", leadStory.otherSources)}</IntentLink>
            : <span>{tx("另有 {0} 家信源报道", leadStory.otherSources)}</span>)}
          {leadStory.itemId && <IntentLink viewTransition to={`/items/${leadStory.itemId}`} className="inline-flex items-center gap-0.5 hover:text-[var(--deck-ink)]"><Text value="阅读全文" /><IconChevronRight size={13} /></IntentLink>}
          <a href={leadStory.sourceUrl} target="_blank" rel="noopener noreferrer" {...outboundLink(leadStory.sourceUrl)} className="inline-flex items-center gap-0.5 hover:text-[var(--deck-ink)]"><Text value="原文" /><IconArrowUpRight size={12} /></a>
        </p>
      )}
      <div role="group" aria-label={tx("转发这期")} className="flex flex-wrap items-center gap-2.5">
        <button type="button" className={button} onClick={async () => { if (await shareOrCopy(title, url()) === "copied") setCopied(true); }}>
          <IconShare size={15} /><Text value="分享链接" />
        </button>
        <button
          type="button"
          className={button}
          onClick={() => {
            recordEngagement("share_click");
            window.open(`https://x.com/intent/post?text=${encodeURIComponent(title)}&url=${encodeURIComponent(distributionUrl(url(), "share"))}`, "_blank", "noopener,noreferrer");
          }}
        >
          <span aria-hidden="true" className="font-bold">𝕏</span><Text value="发到 X" />
        </button>
        <button type="button" className={button} onClick={card.show}>
          <IconImage size={15} /><Text value="分享图" />
        </button>
        <span role="status" className="text-[13px] text-[var(--brass-hi)]">{copied ? tx("链接已复制") : ""}</span>
      </div>
      {card.sheet}
    </div>
  );
}

/**
 * Every event of the day in one numbered list, by the issue's sections, then the briefs. An event in the
 * issue's pages jumps to its story there; the lead, told in the deck, opens its own page.
 */
export function TodayList({ report, leadStory, leadRelated }: { report: ReportDetail; leadStory: ReportCitation | null; leadRelated?: ReactNode }) {
  const tx = useTranslate();
  // A story cited in two sections is listed once, where it first appears; numbering runs across sections.
  const seen = new Set<string>();
  let n = 0;
  const groups = report.sections.flatMap((s) => {
    const items = s.items.filter((c) => {
      if (seen.has(keyOf(c))) return false;
      seen.add(keyOf(c));
      return true;
    });
    return items.length > 0 ? [{ label: s.label, items: items.map((c) => ({ c, n: ++n })) }] : [];
  });
  // The count is the heading's; the other figures go beside it.
  const figures = metricItems(report.metrics).filter((m) => !ENTRY_METRICS.has(m.key) && m.value > 0).map((m) => tx(`{0} ${m.unit}`, m.value));
  if (report.flashes.length > 0) figures.push(tx("另有 {0} 条快讯", report.flashes.length));
  const lead = leadStory ? keyOf(leadStory) : null;
  return (
    <section id="today" aria-labelledby="today-title" className="scroll-mt-[calc(var(--bar-h)+1.5rem)] pt-7 lg:pt-10">
      <header className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-line-strong pb-3">
        <h2 id="today-title" className="text-[24px] font-black tracking-[-0.02em] text-ink @[880px]:text-[28px]">{tx("今天这 {0} 件事", n)}</h2>
        {figures.length > 0 && <p className="num text-[12.5px] text-ink-4">{figures.join(" · ")}</p>}
      </header>
      {groups.map((g, i) => (
        <div key={g.label} className="pt-5">
          <p className="pb-1 text-[12px] font-semibold tracking-[0.1em] text-accent"><span className="num">{pad(i + 1)}</span>　{g.label}</p>
          <ol>
            {g.items.map(({ c, n: no }) => (
              <li key={keyOf(c)} className="border-b border-line">
                <Entry c={c} no={no} lead={keyOf(c) === lead} />
                {keyOf(c) === lead && leadRelated}
              </li>
            ))}
          </ol>
        </div>
      ))}
      {report.flashes.length > 0 && (
        <div className="pt-5">
          <p className="pb-1 text-[12px] font-semibold tracking-[0.1em] text-accent"><span className="num">{pad(groups.length + 1)}</span>　<Text value="快讯" /></p>
          <ul>
            {report.flashes.map((f, i) => (
              <li key={`${keyOf(f)}-${i}`} className="flex gap-3.5 border-b border-line py-2.5 text-[14.5px] leading-[1.6]">
                <span className="mt-[10px] ml-[22px] size-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
                <span className="min-w-0">
                  {!f.available ? <span className="text-ink-4 line-through">{f.title}</span>
                    : f.itemId ? <Link viewTransition to={`/items/${f.itemId}`} className="text-ink-2 transition-colors hover:text-accent">{f.title}</Link>
                    : <span className="text-ink-2">{f.title}</span>}
                  {f.available && <span className="ml-2 text-[12px] text-ink-4">{f.sourceName}</span>}
                  {f.available && f.followUp && <Badge className="ml-2 align-[1px]"><Text value="跟进" /></Badge>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function Entry({ c, no, lead }: { c: ReportCitation; no: number; lead: boolean }) {
  const body = (
    <>
      <span className={`num w-7 shrink-0 text-right text-[22px] font-black leading-[1.15] tracking-[-0.03em] ${c.available ? "text-accent" : "text-ink-4"}`}>{no}</span>
      <span className="min-w-0 flex-1">
        <span className={`block text-[15.5px] font-semibold leading-[1.6] [overflow-wrap:anywhere] ${c.available ? "text-ink transition-colors group-hover:text-accent" : "text-ink-4 line-through"}`}>{c.title}</span>
        {c.available && (
          <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[12px] text-ink-4">
            {lead && <Badge tone="accent"><Text value="头条" /></Badge>}
            {c.firstParty && <Badge tone="accent"><Text value="一手" /></Badge>}
            {c.followUp && <Badge><Text value="跟进" /></Badge>}
            <span className="truncate">{c.sourceName}</span>
          </span>
        )}
      </span>
    </>
  );
  const row = "group flex items-start gap-3.5 py-3";
  if (!c.available) return <div className={row}>{body}</div>;
  if (c.itemId) return <Link viewTransition={lead} to={lead ? `/items/${c.itemId}` : `#r-${c.itemId}`} className={row}>{body}</Link>;
  return <a href={c.sourceUrl} target="_blank" rel="noopener noreferrer" {...outboundLink(c.sourceUrl)} className={row}>{body}</a>;
}

/**
 * Beside the issue on desktop: subscribe, the share card and the other issues, following the reader.
 * On a phone it sits between the list and the stories, and only the subscribe card shows.
 */
export function DailyAside({ report, index, leadStory, className = "" }: { report: ReportDetail; index: ReportNavigationEntry[]; leadStory: ReportCitation | null; className?: string }) {
  const tx = useTranslate();
  const locale = useLocale();
  const at = useAt();
  const card = useShareCard(report, dailyHeadline(report, leadStory));
  const others = index.filter((e) => e.key !== report.key).slice(0, 5);
  return (
    <aside aria-label={tx("订阅与往期")} className={`min-w-0 pt-7 lg:pt-10 ${className}`}>
      <div className="flex flex-col gap-7 lg:sticky lg:top-[calc(var(--bar-h)+1.5rem)]">
        <div className="hidden lg:block"><KindSwitch kind="daily" /></div>
        <SubscribeCta source="daily_inline" place="aside" />
        <section aria-labelledby="share-card" className="hidden lg:block">
          <h2 id="share-card" className="text-[13px] font-semibold text-ink-2"><Text value="分享图" /></h2>
          <button type="button" onClick={card.show} className="mt-2.5 block w-full overflow-hidden rounded-card border border-line bg-bg-sunk transition-colors hover:border-accent">
            <img src={`/og/reports/daily/${report.key}.png?lang=${locale}`} alt={tx("{0} · 分享图", dailyHeadline(report, leadStory))} width={1200} height={630} loading="lazy" decoding="async" className="block aspect-[1200/630] w-full object-cover" />
          </button>
          <p className="mt-2 text-[12px] leading-relaxed text-ink-4"><Text value="手机上长按保存，发到微信群或朋友圈。" /></p>
        </section>
        {others.length > 0 && (
          <nav aria-labelledby="daily-others" className="hidden lg:block">
            <h2 id="daily-others" className="border-b border-line-strong pb-2 text-[11.5px] font-semibold tracking-[0.3em] text-ink"><Text value="往期" /></h2>
            <ul>
              {others.map((e) => (
                <li key={e.key}>
                  <IntentLink to={withAt(reportPath("daily", e.key), at)} className="group flex gap-3 border-b border-line py-2.5 text-[13.5px] leading-[1.55]">
                    <span className="num w-11 shrink-0 pt-px text-[12px] text-ink-4">{e.key.slice(5)}</span>
                    <span className="line-clamp-2 min-w-0 text-ink-2 transition-colors group-hover:text-accent">{e.title ?? e.key}</span>
                  </IntentLink>
                </li>
              ))}
            </ul>
            <IntentLink to={withAt("/daily/archive", at)} className="mt-3 inline-flex items-center gap-0.5 text-[13px] font-medium text-accent"><Text value="日报合订本" /><IconChevronRight size={14} /></IntentLink>
          </nav>
        )}
      </div>
      {card.sheet}
    </aside>
  );
}
