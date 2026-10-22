import { localeFromMatches, Text, useTranslate } from "../lib/i18n";
import { useLoaderData } from "react-router";
import { IntentLink } from "../components/ui/IntentLink";
import type { ReportIndexEntry, ReportIndexResponse } from "@aihot/contracts/site";
import { SITE, withSubject } from "@aihot/site";
import { apiGet, cachedPage } from "../lib/api.server";
import { pageReuse } from "../lib/page-reuse";
import { pageMeta } from "../lib/seo";
import { beijingDate } from "@aihot/contracts/time";
import { weekdayShort } from "../lib/format";
import { ReportLayout } from "../features/report/ReportLayout";
import { archiveGroups, ENTRIES_UNIT } from "../features/report/format";
import { Rows, SectionPage } from "../features/report/ReportPaper";
import { Deck } from "../components/shell/Deck";

export { pageHeaders as headers } from "../lib/api.server";
export const { clientLoader, shouldRevalidate } = pageReuse<typeof loader>();

export async function loader({ request }: { request: Request }) {
  const { items: index } = await apiGet<ReportIndexResponse>("/api/site/reports/daily", { request, signal: request.signal });
  return cachedPage(600, { index, today: beijingDate(Date.now()) });
}

export function meta({ matches }: { matches?: Array<{ id: string; data?: unknown }> } = {}) {
  return pageMeta({ title: `${withSubject("日报")} · 历史存档`, description: `${SITE.name} 历史日报，按日期归档。`, path: "/daily/archive", image: "/og/pages/daily.png" }, localeFromMatches(matches ?? []));
}

export default function DailyArchive() {
  const tx = useTranslate();
  const { index, today } = useLoaderData<typeof loader>();
  const months = archiveGroups("daily", index);
  return (
    <ReportLayout
      kind="daily"
      index={index}
      current={null}
      today={today}
      deck={
        <Deck
          art="masthead-press"
          label={tx("日报合订本")}
          kicker={<>{SITE.name} · {withSubject(tx("日报"))}<Text value="· 共" /><span className="num">{index[0]?.issueNumber ?? 0}</span><Text value="期" /></>}
          title={tx("日报合订本")}
          titleId="report-start"
          description={tx("每天 08:00 一期，按月装订。")}
        />
      }
    >
      <div className="@container">
        {months.map((m) => (
          <SectionPage key={m.id} id={`m-${m.id}`} label={tx(m.label)}>
            <Rows items={m.entries}>
              {(e, cell) => (
                <IntentLink key={e.key} to={`/daily/${e.key}`} className={`group flex gap-4 py-4 ${cell}`}>
                  <span className="flex w-9 shrink-0 flex-col items-center">
                    <span className="num text-[24px] font-black leading-none tracking-[-0.03em] text-ink transition-colors group-hover:text-accent">{e.key.slice(8, 10)}</span>
                    <span className="mt-1.5 text-[10.5px] leading-none text-ink-4">{tx(weekdayShort(e.key))}</span>
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[15px] font-bold leading-[1.55] text-ink transition-colors group-hover:text-accent">{e.title ?? `${withSubject(tx("日报"))} ${e.key}`}</span>
                    {!!e.count && (
                      <span className="mt-1 block text-[12px] text-ink-4">
                        <span className="num">{e.count}</span><Text value={ENTRIES_UNIT} />
                      </span>
                    )}
                  </span>
                </IntentLink>
              )}
            </Rows>
          </SectionPage>
        ))}
      </div>
    </ReportLayout>
  );
}
