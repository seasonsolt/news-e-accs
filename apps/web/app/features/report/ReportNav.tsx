import { Link } from "../../lib/navigation";
import { IntentLink } from "../../components/ui/IntentLink";
import { contentFetch } from "../../lib/content-fetch";
import { Text, useTranslate } from "../../lib/i18n";
// Moving between reports: the archive card beside the issue on desktop, a tab row and recent-issue chips on phones.
import { useEffect, useState } from "react";

import type { ReportNavigationEntry, ReportNavigationResponse, ReportKind } from "@aihot/contracts/site";
import { useAt, withAt } from "../chrono/at";
import { PillTabs } from "../../components/ui/Tabs";
import { IconChevronRight } from "../../components/icons";
import { KINDS, KIND_LABEL, KIND_PATH, archiveGroups, archiveMark, chipLabel, reportPath } from "./format";

/** 日报 / 周报 / 月报 as the site's pill switch, spread across the column. */
function KindSwitch({ kind }: { kind: ReportKind }) {
  const tx = useTranslate();
  const at = useAt();
  return <PillTabs fill layoutId="report-kind" label={tx("切换日报、周报、月报")} active={kind} items={KINDS.map((k) => ({ key: k, label: tx(KIND_LABEL[k]), to: withAt(KIND_PATH[k], at), prefetch: "intent" as const }))} />;
}

/** Desktop archive column: every issue of this kind, grouped, the current one highlighted. */
export function ReportArchive({ kind, index, current }: { kind: ReportKind; index: ReportNavigationEntry[]; current: string | null }) {
  const tx = useTranslate();
  const at = useAt();
  const groups = archiveGroups(kind, index);
  const openId = groups.find((g) => g.entries.some((e) => e.key === current))?.id ?? groups[0]?.id;
  return (
    <aside className="sticky top-6 hidden max-h-[calc(100dvh-48px)] w-[260px] shrink-0 flex-col rounded-panel border border-line bg-surface pl-4 pr-2 lg:flex">
      <div className="pb-4 pt-5">
        <KindSwitch kind={kind} />
      </div>
      <div className="border-b border-line-strong pb-2 pl-1 text-[11.5px] font-semibold tracking-[0.3em] text-ink"><Text value="往期" /></div>
      <nav aria-label={tx("{0}历史", tx(KIND_LABEL[kind]))} className="scrollbar-thin -mr-3 flex-1 overflow-y-auto pb-6 pr-3">
        {groups.map((g) => (
          <ArchiveGroup key={g.id} g={g} kind={kind} current={current} initiallyOpen={g.id === openId} />
        ))}
      </nav>
      {kind === "daily" && (
        <IntentLink to={withAt("/daily/archive", at)} className="flex h-12 shrink-0 items-center justify-between border-t border-line pl-1 pr-1.5 text-[12.5px] font-medium text-ink-2 transition-colors hover:text-accent"><Text value="日报合订本" /><IconChevronRight size={14} />
        </IntentLink>
      )}
    </aside>
  );
}

/** Closed daily months keep only keys; titles load when opened, and the full archive is SSR. */
function ArchiveGroup({ g, kind, current, initiallyOpen }: {
  g: ReturnType<typeof archiveGroups>[number]; kind: ReportKind; current: string | null; initiallyOpen: boolean;
}) {
  const tx = useTranslate();
  const at = useAt();
  const [open, setOpen] = useState(initiallyOpen);
  useEffect(() => setOpen(initiallyOpen), [initiallyOpen]);
  const [loaded, setLoaded] = useState<ReportNavigationEntry[] | null>(null);
  useEffect(() => {
    if (!open || loaded || kind !== "daily" || !g.entries.some((e) => e.title === undefined)) return;
    const controller = new AbortController();
    contentFetch(`/api/site/reports/daily/months/${g.id}`, { signal: controller.signal })
      .then((r) => r.ok ? r.json() : null)
      .then((data: ReportNavigationResponse | null) => { if (data && !controller.signal.aborted) setLoaded(data.items); })
      .catch(() => {});
    return () => controller.abort();
  }, [open, kind, g.id, loaded]);
  const entries = loaded ?? g.entries;
  const mark = (key: string) => archiveMark(kind, key);
  return (
    <details open={open} onToggle={(event) => setOpen(event.currentTarget.open)} className="disclosure group/month border-b border-line">
      <summary className="flex h-11 items-center gap-1.5 pl-1 pr-1.5 text-[13px] text-ink transition-colors hover:text-accent">
        <IconChevronRight size={14} className="text-ink-4 transition-transform duration-200 group-open/month:rotate-90" />
        <span className="flex-1 font-semibold"><Text value={g.label} /></span>
        <span className="num text-[11.5px] text-ink-4">{g.entries.length}</span>
      </summary>
      {(kind !== "daily" || open) && <ul className="space-y-0.5 pb-3">
        {entries.map((e) => {
          const on = e.key === current;
          return (
            <li key={e.key}>
              <IntentLink
                to={withAt(reportPath(kind, e.key), at)}
                aria-current={on ? "page" : undefined}
                title={e.title ?? undefined}

                className={`group flex gap-3 rounded-tile py-2.5 pl-2.5 pr-2 transition-colors ${on ? "bg-accent-soft" : "hover:bg-bg-sunk"}`}
              >
                <span className="flex w-8 shrink-0 flex-col items-center">
                  <span className={`num text-[19px] font-black leading-none tracking-[-0.03em] ${on ? "text-accent" : "text-ink"}`}>{mark(e.key).big}</span>
                  {mark(e.key).small && <span className="mt-1 whitespace-nowrap text-[10px] leading-none text-ink-4">{tx(mark(e.key).small ?? "")}</span>}
                </span>
                <span className={`line-clamp-2 min-w-0 text-[12.5px] leading-[18px] transition-colors ${on ? "font-semibold text-ink" : "text-ink-2 group-hover:text-ink"}`}>{e.title ?? `${tx(KIND_LABEL[kind])} ${e.key}`}</span>
              </IntentLink>
            </li>
          );
        })}
      </ul>}
      {kind === "daily" && !open && <noscript><Link to="/daily/archive"><Text value="查看完整日报归档" /></Link></noscript>}
    </details>
  );
}

/** Phones, under the bar: the three latest issues and a way further back. */
export function ReportPhoneNav({ kind, index, current, today }: { kind: ReportKind; index: ReportNavigationEntry[]; current: string | null; today: string }) {
  const tx = useTranslate();
  const at = useAt();
  const recent = index.slice(0, 3);
  const earlier = kind === "daily" ? "/daily/archive" : "#report-history";
  const chip = "inline-flex h-11 shrink-0 items-center rounded-full border px-4 text-[13px] transition-colors";
  if (recent.length === 0) return null;
  return (
    <div className="pt-3 lg:hidden">
      <PillTabs fill layoutId="report-kind-phone" label={tx("切换日报、周报、月报")} active={kind} items={KINDS.map((k) => ({ key: k, label: tx(KIND_LABEL[k]), to: withAt(KIND_PATH[k], at), prefetch: "intent" as const }))} />
      {recent.length > 0 && (
        <div className="scrollbar-none -mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1">
          {recent.map((e) => {
            const on = e.key === current;
            return (
              <IntentLink key={e.key} to={withAt(reportPath(kind, e.key), at)} aria-current={on ? "page" : undefined} className={`${chip} ${on ? "border-ink bg-ink font-semibold text-bg" : "border-line-strong bg-surface text-ink-2 active:bg-bg-sunk"}`}>
                {tx(chipLabel(kind, e.key, index, today))}
              </IntentLink>
            );
          })}
          {index.length > 3 && (
            <IntentLink to={earlier.startsWith("#") ? earlier : withAt(earlier, at)} className={`${chip} border-line-strong bg-surface text-ink-2 active:bg-bg-sunk`}><Text value="更早" /></IntentLink>
          )}
        </div>
      )}
    </div>
  );
}
