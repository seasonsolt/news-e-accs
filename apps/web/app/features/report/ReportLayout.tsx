import type { ReactNode } from "react";
import type { ReportNavigationEntry, ReportKind } from "@aihot/contracts/site";
import { ReportArchive, ReportPhoneNav } from "./ReportNav";

/**
 * A report page: its deck across the window, then the issue beside its archive column (desktop, a
 * card that follows the reader); phones get the kind tabs and recent issues above the issue instead.
 * Empty states (no issue yet) pass a plain deck.
 */
export function ReportLayout({ kind, index, current, today, deck, children }: { kind: ReportKind; index: ReportNavigationEntry[]; current: string | null; today: string; deck: ReactNode; children: ReactNode }) {
  return (
    <div className="report-shell pb-6 lg:pb-12">
      {deck}
      <div className="mt-6 lg:mt-10 lg:flex lg:items-start lg:gap-10">
        <ReportArchive kind={kind} index={index} current={current} />
        <div className="min-w-0 flex-1">
          <ReportPhoneNav kind={kind} index={index} current={current} today={today} />
          <div className="w-full lg:max-w-[1160px]">{children}</div>
        </div>
      </div>
    </div>
  );
}
