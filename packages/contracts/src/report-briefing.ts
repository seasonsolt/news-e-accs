import type { ReportCitation, ReportDetail } from "./site.ts";

/** A reading index of published material only, preserving the editor's order and actual follow-up evidence. */
export function dailyBriefing(report: ReportDetail): { changes: ReportCitation[]; followUps: ReportCitation[] } {
  if (report.kind !== "daily") return { changes: [], followUps: [] };
  const seen = new Set<string>();
  const sections = report.sections.flatMap((s) => s.items);
  const lead = sections.find((c) => c.itemId === report.leadItemId);
  const items = [...(lead ? [lead] : []), ...report.highlights, ...sections, ...report.flashes].filter((c) => {
    if (!c.available || !c.itemId || seen.has(c.itemId)) return false;
    seen.add(c.itemId);
    return true;
  });
  return { changes: items.slice(0, 3), followUps: items.filter((c) => c.followUp).slice(0, 3) };
}
