import { Link } from "@aihot/web/lib/navigation";
import { Text, useTranslate } from "@aihot/web/lib/i18n";
import { SITE } from "@aihot/site";
import { FEATURES } from "@aihot/industry/features";
import { Outlet, useRouteLoaderData } from "react-router";
import type { loader as rootLoader } from "@aihot/web/root";
import { Deck } from "@aihot/web/components/shell/Deck";
import { TimeDial } from "@aihot/web/features/chrono/TimeMachine";
import { BoardTabs } from "../features/BoardTabs";
import { IconArrowUpRight } from "@aihot/web/components/icons";

/** Shared caches may keep this page for five minutes. */
export function headers() {
  return { "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=600" };
}

/** Shared frame for the overall and category boards: the deck, then the board tabs; only the board below changes. */
export default function LeaderboardFrame() {
  const tx = useTranslate();
  const root = useRouteLoaderData<typeof rootLoader>("root");
  return (
    <div className="pb-10">
      <Deck
        art="cat-models"
        label={tx("模型榜")}
        kicker={tx("{0} 模型榜 · 汇总公开评测的共识排名", SITE.name)}
        title={tx("算力的前沿，此刻在哪")}
        description={tx("汇集多种能力的真实评测，按多项公开评测的共同证据排名。共识分不是正确率，缺测不记零分，价格不参与排名。")}
        aside={FEATURES.timeMachine && <TimeDial bounds={root?.timeBounds ?? null} className="w-[300px] max-w-full" />}
      >
        <div className="flex flex-wrap gap-2.5">
          <Link to="/leaderboard/sources" className="deck-button"><Text value="评测来源" /><IconArrowUpRight size={14} className="ml-1" /></Link>
          <Link to="/leaderboard/rules" className="deck-button"><Text value="排名怎么算" /><IconArrowUpRight size={14} className="ml-1" /></Link>
        </div>
      </Deck>
      <div className="-mx-4 mt-6 px-4 lg:mx-0 lg:px-0">
        <BoardTabs />
      </div>
      <Outlet />
    </div>
  );
}
