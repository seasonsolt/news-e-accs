import { publicPath } from "@aihot/web/lib/locale";
import { Text, useTranslate } from "@aihot/web/lib/i18n";
import { useLocation } from "react-router";
import { LEADERBOARD_BOARD_LABELS, LEADERBOARD_PUBLIC_BOARDS } from "@aihot/leaderboard/taxonomy";
import { PillTabs } from "@aihot/web/components/ui/Tabs";
import { boardHref } from "./format";
import { useAt, withAt } from "@aihot/web/features/chrono/at";

/** Board switcher. It lives in the shared layout, so the thumb glides between boards. */
export function BoardTabs() {
  const tx = useTranslate();
  const { pathname } = useLocation();
  const active = LEADERBOARD_PUBLIC_BOARDS.find((k) => boardHref(k) === publicPath(pathname)) ?? "overall";
  const at = useAt();
  return (
    <PillTabs
      layoutId="lb-board"
      label={tx("榜单")}
      active={active}
      items={LEADERBOARD_PUBLIC_BOARDS.map((k) => ({ key: k, label: LEADERBOARD_BOARD_LABELS[k], to: withAt(boardHref(k), at) }))}
    />
  );
}
