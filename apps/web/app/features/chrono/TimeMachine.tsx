import { publicPath } from "../../lib/locale";
import { Link, useNavigate } from "../../lib/navigation";
import { Text, useTranslate } from "../../lib/i18n";
// The time machine's two controls: the brass dial in a page's deck while the site is on today, and the
// bar over every page while it is on a past day (phones also reach the dial from 更多).
import type { TimeMachineBounds } from "@aihot/contracts/chronicle";
import { dateToYear } from "@aihot/contracts/chronicle";
import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router";
import { IconChevronRight, IconHourglass } from "../../components/icons";
import { SplitFlapText } from "../motion/react-bits/SplitFlapText";
import { atLabel, followsTime, stepAt, useAt, withAt } from "./at";
import { addDays, beijingDate } from "@aihot/contracts/time";

/** Deep time on the four-dimensional view, centred on this day. */
export function chronicleHref(at: string | null): string {
  return at ? `/chronicle?t=${dateToYear(at).toFixed(4)}` : "/chronicle";
}

function travelPath(pathname: string): string {
  // A dated issue is where /daily redirected: a new day must choose its own latest issue.
  pathname = publicPath(pathname);
  const report = /^\/(daily|weekly|monthly)\/\d/.exec(pathname);
  return report ? `/${report[1]}` : pathname;
}

/** Where a new day goes: the same page when it follows time, else the front page on that day. */
function useTravel() {
  const { pathname, search, hash } = useLocation();
  const navigate = useNavigate();
  return (at: string | null) => {
    const here = followsTime(pathname) ? `${travelPath(pathname)}${search}${hash}` : "/";
    navigate(withAt(here, at));
  };
}

/** Counts changes of `value`, so a split-flap tile flips each time the day moves. */
function useFlips(value: string) {
  const [flips, setFlips] = useState(0);
  const last = useRef(value);
  useEffect(() => {
    if (last.current === value) return;
    last.current = value;
    setFlips((n) => n + 1);
  }, [value]);
  return flips;
}

/** Where `at` sits on the site's own record, 0 (its first day) to 1 (today); null without a record. */
function recordPosition(at: string | null, earliest: string | null, today: string): number | null {
  if (!earliest || earliest >= today) return null;
  const day = (d: string) => Date.parse(`${d}T00:00:00Z`) / 86400000;
  const span = day(today) - day(earliest);
  return at ? Math.min(1, Math.max(0, (day(at) - day(earliest)) / span)) : 1;
}

/** The sidebar dial: step a day at a time, pick a day, or open the four-dimensional view. */
export function TimeDial({ bounds, className = "" }: { bounds: TimeMachineBounds | null; className?: string }) {
  const tx = useTranslate();
  const at = useAt();
  const travel = useTravel();
  const today = bounds?.today ?? beijingDate(Date.now());
  const shown = at ? at.replaceAll("-", "·") : tx("现在");
  const flips = useFlips(shown);
  const earliest = bounds?.earliest ?? null;
  const position = recordPosition(at, earliest, today);
  return (
    <div className={`time-dial ${at ? "is-away" : ""} ${className}`}>
      <div className="time-dial-head">
        <span className="flex items-center gap-1"><IconHourglass size={12} /><Text value="时光机" /></span>
        <Link to={chronicleHref(at)} className="time-dial-link"><Text value="加速史" /><IconChevronRight size={12} /></Link>
      </div>
      <div className="mt-1.5 flex items-center gap-1.5">
        <button type="button" className="time-knob" aria-label={tx("前一天")} disabled={!!earliest && !!at && at <= earliest} onClick={() => travel(stepAt(at, -1, today))}>
          ‹
        </button>
        <label className="time-dial-face relative flex h-8 min-w-0 flex-1 cursor-pointer items-center justify-center">
          <SplitFlapText text={shown} trigger={flips} />
          <input
            type="date"
            aria-label={tx("选择日期")}
            className="absolute inset-0 cursor-pointer opacity-0"
            min={earliest ?? undefined}
            max={addDays(today, -1)}
            value={at ?? ""}
            onChange={(e) => e.target.value && travel(e.target.value)}
          />
        </label>
        <button type="button" className="time-knob" aria-label={tx("后一天")} disabled={!at} onClick={() => travel(stepAt(at, 1, today))}>
          ›
        </button>
      </div>
      {position !== null && (
        // The site's own record, from its first day to today, and where the dial stands on it.
        <div className="time-dial-ruler" aria-hidden="true" title={tx("本站记录始于 {0}", earliest)}>
          <span className="time-dial-needle" style={{ left: `${position * 100}%` }} />
        </div>
      )}
    </div>
  );
}

/** The dial in a page's deck, while the site is on today; on a past day the bar over the page does its work. */
export function DeckDial({ bounds }: { bounds: TimeMachineBounds | null }) {
  return useAt() ? null : <TimeDial bounds={bounds} className="w-[300px] max-w-full" />;
}

/** Over a page showing a past day: which day (pick another on it), a step either way (none before the records begin), and the way back. */
export function TimeBar({ bounds }: { bounds: TimeMachineBounds | null }) {
  const tx = useTranslate();
  const at = useAt();
  const travel = useTravel();
  const { pathname, search, hash } = useLocation();
  if (!at) return null;
  const today = bounds?.today ?? beijingDate(Date.now());
  const here = `${travelPath(pathname)}${search}${hash}`;
  const prev = stepAt(at, -1, today);
  const next = stepAt(at, 1, today);
  const beforeRecord = !!bounds?.earliest && at < bounds.earliest;
  const atStart = !!bounds?.earliest && at <= bounds.earliest;
  const note = beforeRecord ? tx("本站那时还没有记录") : null;
  return (
    <div role="region" aria-label={tx("时光机")} className="time-bar sticky top-0 z-30 -mx-4 mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5 lg:mx-0 lg:px-3">
      <span className="flex min-w-0 items-center gap-2.5">
        <span className="time-bar-badge" aria-hidden="true"><IconHourglass size={14} /></span>
        <span className="flex min-w-0 flex-col leading-tight">
          <span className="time-bar-label"><Text value="时光机停在" />{note && <span className="time-bar-note"> · {note}</span>}</span>
          <label className="time-bar-pick relative cursor-pointer">
            <strong className="time-bar-date">{atLabel(at)}</strong>
            <input
              type="date"
              aria-label={tx("选择日期")}
              className="absolute inset-0 cursor-pointer opacity-0"
              min={bounds?.earliest ?? undefined}
              max={addDays(today, -1)}
              value={at}
              onChange={(e) => e.target.value && travel(e.target.value)}
            />
          </label>
        </span>
      </span>
      <span className="ml-auto flex flex-wrap items-center gap-1.5">
        {!atStart && <Link to={withAt(here, prev)} className="time-bar-button" aria-label={tx("前一天")}><Text value="‹ 前一天" /></Link>}
        <Link to={withAt(here, next)} className="time-bar-button" aria-label={tx("后一天")}><Text value="后一天 ›" /></Link>
        <Link to={chronicleHref(at)} className="time-bar-button"><Text value="加速史" /></Link>
        <Link to={withAt(here, null)} className="time-bar-button is-primary"><Text value="回到现在" /></Link>
      </span>
    </div>
  );
}
