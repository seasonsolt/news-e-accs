import { dailyBriefing } from "@aihot/contracts/report-briefing";
import type { ReportDetail } from "@aihot/contracts/site";
import { Link } from "../../lib/navigation";
import { useLocale } from "../../lib/i18n";

export function DailyBriefing({ report }: { report: ReportDetail }) {
  const zh = useLocale() === "zh";
  const { changes, followUps } = dailyBriefing(report);
  if (!changes.length) return null;
  return <nav aria-label={zh ? "今日变化与跟进" : "Changes and follow-ups"} className="grid gap-6 border-b border-line py-6 @[760px]:grid-cols-2">
    <div>
      <h2 className="text-sm font-semibold text-accent">{zh ? "今天发生了什么" : "What changed today"}</h2>
      <ul className="mt-3 space-y-2">{changes.map((c) => <li key={c.itemId}><Link to={`/items/${c.itemId}`} className="text-[14px] leading-relaxed text-ink-2 hover:text-accent">{c.title}</Link><span className="ml-2 text-xs text-ink-4">{c.sourceName}</span></li>)}</ul>
    </div>
    <div>
      <h2 className="text-sm font-semibold text-accent">{zh ? "持续跟进" : "Developments to follow"}</h2>
      {followUps.length ? <ul className="mt-3 space-y-2">{followUps.map((c) => <li key={c.itemId}><Link to={`/items/${c.itemId}`} className="text-[14px] leading-relaxed text-ink-2 hover:text-accent">{c.title}</Link><Link to={`/daily/${c.followUp}`} className="ml-2 text-xs text-ink-4 hover:text-accent">{zh ? "前情" : "Previously"} · {c.followUp}</Link></li>)}</ul> : <p className="mt-3 text-sm text-ink-3">{zh ? "本期没有已收录事件的新进展。" : "No updates to previously covered events in this issue."}</p>}
    </div>
  </nav>;
}
