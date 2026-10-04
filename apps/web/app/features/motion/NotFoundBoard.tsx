// The missing-page signal is a small brass flap, not a loading animation. SSR keeps one final
// status string; a fine-pointer hover or a real button activation supplies the optional trigger.
// SplitFlapText owns reduction and the bounded clock, just as on the leaderboard.
import { useState } from "react";
import { hasFinePointer } from "./preferences";
import { SplitFlapText } from "./react-bits/SplitFlapText";

export function NotFoundBoard() {
  const [trigger, setTrigger] = useState(0);
  return (
    <button type="button" aria-label="翻动 404 状态牌" onClick={() => setTrigger((value) => value + 1)}
      onPointerEnter={(event) => { if (event.pointerType !== "touch" && hasFinePointer()) setTrigger((value) => value + 1); }}
      className="not-found-board mono relative rounded-control border border-amber/60 px-3 py-2 text-[24px] font-semibold leading-none tracking-[0.18em] text-ink">
      <SplitFlapText text="404" trigger={trigger} />
    </button>
  );
}
