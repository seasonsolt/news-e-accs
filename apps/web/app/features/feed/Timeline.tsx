import { contentFetch } from "../../lib/content-fetch";
import { Text, useTranslate } from "../../lib/i18n";
// The day-grouped feed (精选 home, topics): a time rail with cards on desktop, rows under grey day bars on
// phones. Keeps its place across back navigation and loads further pages. There is no "new items"
// prompt: readers refresh for the latest head (feedback #1199).
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigation } from "react-router";
import { Collapse } from "../../components/ui/Presence";
import { ToggleChip } from "../../components/ui/Controls";
import type { TimelineCard, TimelineFilters, TimelineResponse } from "@aihot/contracts/site";
import { FeedItem } from "./FeedItem";
import { IconChevronDown } from "../../components/icons";
import { RingMark } from "@aihot/site/brand/Logo.tsx";
import { EmptyState } from "../../components/ui/Page";
import { beijingDate, beijingTime, beijingWeekday } from "@aihot/contracts/time";
import { byBeijingDay, weekdayShort } from "../../lib/format";
import { isHydrated } from "../../lib/hydration";
import { markRead, useReadSet } from "../../lib/local-state";
import { filterParams, listPath } from "../../lib/seo";
import { isReload, readSnapshot, restoreAnchor, saveSnapshot, useSaveOnLeave } from "../../lib/restore";
import { addedCardKeys, useCardArrival } from "../motion/reading-flow";

const AUTO_BATCHES = 3;

interface ListState {
  version: 2;
  cards: TimelineCard[];
  nextCursor: string | null;
  dayCounts: Record<string, number>;
  collapsed: string[];
  batches: number;
  /** The reader's unread-only filter: off by default, and kept when the same list is rebuilt. */
  unreadOnly: boolean;
}

/** The list's address: the filters (the chronicle's topic and moment included) as the timeline api reads them. */
function timelineKey(f: TimelineFilters, extra: Record<string, string | null> = {}) {
  return listPath("/api/site/timeline", { ...filterParams(f), topic: f.topic ?? null, at: f.at ?? null, ...extra });
}

function fromResponse(r: TimelineResponse, unreadOnly = false): ListState {
  return { version: 2, cards: r.cards, nextCursor: r.nextCursor, dayCounts: r.dayCounts, collapsed: [], batches: 1, unreadOnly };
}

/** Sticky day header: a quiet row on desktop, a grey full-width bar on phones. */
export function DayHeader({ day, today, count, collapsed, onToggle, aside, asideOnPhone = true }: { day: string; today: string; count: number | null; collapsed?: boolean; onToggle?: () => void; aside?: React.ReactNode; asideOnPhone?: boolean }) {
  const tx = useTranslate();
  const [, m, d] = day.split("-").map(Number) as [number, number, number];
  const date = day.slice(0, 4) === today.slice(0, 4) ? tx("{0}月{1}日", m, d) : `${day.slice(0, 4)} · ${tx("{0}月{1}日", m, d)}`;
  const weekday = tx(beijingWeekday(day));
  const short = weekdayShort(day);
  return (
    <div className="sticky top-0 z-20 -mx-4 bg-daybar px-4 lg:mx-0 lg:bg-bg lg:px-0">
      {/* Phones: a full-width day bar. */}
      <div className="flex h-9 items-center gap-2 lg:hidden">
        <span className="text-[14px] font-bold text-ink">{day === today ? tx("今天") : date}</span>
        {day === today && <span className="text-[12.5px] text-ink-4">{date}</span>}
        <span className="text-[12.5px] text-ink-4"><Text value={short} /></span>
      </div>
      {/* Desktop: the date ends where the times end, the fold toggle sits on the rail. */}
      <div className="hidden h-11 grid-cols-[64px_22px_minmax(0,1fr)] items-center lg:grid">
        <button type="button" onClick={onToggle} disabled={!onToggle} className="justify-self-end whitespace-nowrap text-right text-[18px] font-semibold leading-6 text-ink">
          {date}
        </button>
        {onToggle ? (
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={!collapsed}
            aria-label={collapsed ? tx("展开{0}", date) : tx("收起{0}", date)}
            className="grid size-6 place-items-center justify-self-center rounded-full text-ink-4 transition-colors hover:bg-bg-sunk hover:text-ink"
          >
            <IconChevronDown size={14} className={`transition-transform duration-200 ${collapsed ? "-rotate-90" : ""}`} />
          </button>
        ) : (
          <span />
        )}
        <span className="flex items-baseline gap-3 text-[13px] text-ink-4">
          <span>
            <Text value={weekday} />
            {count !== null && (
              <>
                {" · "}
                <span className="num">{count}</span><Text value="条" /></>
            )}
          </span>
          {aside && <span className="ml-auto text-[12px]">{aside}</span>}
        </span>
      </div>
    </div>
  );
}

/**
 * One dated slot: the time, the rail (desktop) and the item. As on the original timeline, the rail is a
 * 1px line from this node's centre to the next one's, so the day reads as one continuous thread.
 */
export function TimelineSlot({ at, children, fresh = false, arrived = false, delay = 0, dataKey }: { at: string; children: React.ReactNode; fresh?: boolean; arrived?: boolean; delay?: number; dataKey?: string }) {
  const ref = useRef<HTMLLIElement>(null);
  useCardArrival(ref, arrived && !fresh, delay);
  return (
    <li
      ref={ref}
      data-card-key={dataKey}
      className={`group/slot bleed touch:has-[a:active]:bg-bg-sunk/70 lg:mx-0 lg:px-0 lg:touch:has-[a:active]:bg-transparent ${fresh ? "animate-fade-up" : ""}`}
      style={fresh ? { animationDelay: `${delay}ms` } : undefined}
    >
      {/* Phones: the row without the rail (the item shows its time); a hairline between rows. */}
      <div className="grid grid-cols-[minmax(0,1fr)] border-b border-line-soft py-3.5 group-last/slot:border-b-0 lg:grid-cols-[64px_22px_minmax(0,1fr)] lg:border-b-0 lg:py-0 lg:pb-3 lg:group-last/slot:pb-0">
        <time dateTime={at} className="mono hidden text-ink-3 lg:block lg:pt-[17px] lg:text-[12.5px] lg:font-semibold lg:leading-6">
          {beijingTime(at)}
        </time>
        <span aria-hidden="true" className="relative hidden lg:block">
          <span className="absolute -bottom-[41px] left-[10.5px] top-[29px] w-px bg-line-strong group-last/slot:hidden" />
          <span className="absolute left-[7.5px] top-[25.5px] size-[7px] rounded-full bg-accent shadow-[0_0_0_4px_var(--bg)] transition-transform duration-300 group-hover/slot:scale-[1.15]" />
        </span>
        {children}
      </div>
    </li>
  );
}

export function Timeline({ initial, filters }: { initial: TimelineResponse; filters: TimelineFilters }) {
  const tx = useTranslate();
  const location = useLocation();
  const navigation = useNavigation();
  const readSet = useReadSet();
  const historyKey = location.key;

  // Back navigation (client side): restore synchronously from the snapshot. A full reload restores
  // after hydration so the first client render matches the server HTML.
  const [state, setState] = useState<ListState>(() => {
    if (isHydrated()) {
      const snap = readSnapshot<ListState>(historyKey);
      if (snap?.data.version === 2 && snap.data.cards.length > 0) return snap.data;
    }
    return fromResponse(initial);
  });
  const restoredRef = useRef(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [freshKeys, setFreshKeys] = useState<Set<string>>(() => new Set());
  const [arrivalKind, setArrivalKind] = useState<"refresh" | "page">("refresh");
  const stateRef = useRef(state);
  stateRef.current = state;

  // Filters (i.e. the loader data) changed. A page still loading for the old filters is cancelled, and a
  // response that arrives anyway is dropped (it belongs to another list and cursor). Back or forward to a
  // filter already visited restores what that history entry had loaded and folded; a new one starts over.
  const filterKey = timelineKey(filters);
  const lastFilterKey = useRef(filterKey);
  const lastInitial = useRef(initial);
  const lastHistoryKey = useRef(historyKey);
  const pageRequest = useRef<AbortController | null>(null);
  useEffect(() => () => pageRequest.current?.abort(), []);
  useLayoutEffect(() => {
    const responseChanged = lastInitial.current !== initial;
    lastInitial.current = initial;
    if (lastFilterKey.current !== filterKey || lastHistoryKey.current !== historyKey) {
      lastFilterKey.current = filterKey;
      lastHistoryKey.current = historyKey;
      setFreshKeys(new Set());
      pageRequest.current?.abort();
      pageRequest.current = null;
      setLoadingMore(false);
      setLoadError(false);
      const snap = readSnapshot<ListState>(historyKey);
      if (snap?.data.version === 2 && snap.data.cards.length > 0) {
        setState(snap.data);
        restoreAnchor(snap.anchor, snap.scrollY);
      } else {
        setState(fromResponse(initial, stateRef.current.unreadOnly));
      }
    } else if (responseChanged) {
      // Same history entry, new loader head: retain paged cards and animate only genuinely new keys.
      // refreshAt is a cache deadline, not a polling timer. Nothing runs without a new response.
      const prev = stateRef.current;
      setArrivalKind("refresh");
      setFreshKeys(addedCardKeys(prev.cards, initial.cards));
      const headKeys = new Set(initial.cards.map((card) => card.key));
      setState({ ...prev, cards: [...initial.cards, ...prev.cards.filter((card) => !headKeys.has(card.key))], dayCounts: { ...prev.dayCounts, ...initial.dayCounts } });
    }
  }, [filterKey, initial, historyKey]);

  useLayoutEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    const snap = readSnapshot<ListState>(historyKey);
    if (!isHydrated()) {
      // A full load keeps the server's fresh list when the reader reloaded; after a back/forward
      // that reloaded the document, it restores the saved list and position.
      if (snap?.data.version === 2 && snap.data.cards.length > 0 && !isReload()) {
        setState(snap.data);
        requestAnimationFrame(() => restoreAnchor(snap.anchor, snap.scrollY));
      }
      return;
    }
    if (snap?.data.version === 2 && snap.data.cards.length > 0) restoreAnchor(snap.anchor, snap.scrollY);
  }, [historyKey]);

  // Save the snapshot whenever we leave this history entry.
  useEffect(() => {
    if (navigation.state === "loading" && navigation.location && navigation.location.key !== historyKey) {
      saveSnapshot(historyKey, stateRef.current);
    }
  }, [navigation.state, navigation.location, historyKey]);
  useSaveOnLeave(historyKey, () => stateRef.current);

  const loadMore = useCallback(async () => {
    const s = stateRef.current;
    if (!s.nextCursor || pageRequest.current) return;
    const key = timelineKey(filters);
    const controller = new AbortController();
    pageRequest.current = controller;
    const current = () => lastFilterKey.current === key && !controller.signal.aborted;
    setLoadingMore(true);
    setLoadError(false);
    try {
      const res = await contentFetch(timelineKey(filters, { cursor: s.nextCursor }), { signal: controller.signal });
      if (res.status === 400) {
        // Cursor no longer fits: start over from the head.
        const head = await contentFetch(key, { signal: controller.signal });
        if (!head.ok) throw new Error(String(head.status));
        if (current()) {
          const response = (await head.json()) as TimelineResponse;
          setArrivalKind("refresh");
          setFreshKeys(addedCardKeys(stateRef.current.cards, response.cards));
          setState(fromResponse(response, stateRef.current.unreadOnly));
        }
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      const page = (await res.json()) as TimelineResponse;
      if (!current()) return;
      // Pagination already owns a CSS rise. Keep it exactly; the new tween is for refresh arrivals.
      setArrivalKind("page");
      setState((prev) => {
        const seen = new Set(prev.cards.map((c) => c.key));
        const added = page.cards.filter((c) => !seen.has(c.key));
        setFreshKeys(addedCardKeys(prev.cards, added));
        return {
          ...prev,
          cards: [...prev.cards, ...added],
          nextCursor: page.nextCursor,
          dayCounts: { ...prev.dayCounts, ...page.dayCounts },
          batches: prev.batches + 1,
        };
      });
    } catch {
      if (current()) setLoadError(true);
    } finally {
      if (pageRequest.current === controller) {
        pageRequest.current = null;
        setLoadingMore(false);
      }
    }
  }, [filters]);

  // Auto-load a few batches when the sentinel nears the viewport, then hand over to a button.
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !state.nextCursor || state.batches >= AUTO_BATCHES) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) void loadMore();
    }, { rootMargin: "900px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [state.nextCursor, state.batches, loadMore]);

  const today = beijingDate(Date.now());
  const unreadOnly = state.unreadOnly;
  // 只看未读 hides cards read in this browser: an ordinary card by its own id, a reading group by any
  // of its selected reports, so a read representative does not hide the unread reports behind it.
  // A group kept that way is not drawn as read; its expansion marks which reports are unread.
  const unreadVisible = useCallback(
    (card: TimelineCard) => !readSet.has(card.item.id) || (card.group?.memberIds?.some((id) => !readSet.has(id)) ?? false),
    [readSet],
  );
  const days = useMemo(
    () => byBeijingDay(unreadOnly ? state.cards.filter(unreadVisible) : state.cards, (c) => c.anchorAt),
    [state.cards, unreadOnly, unreadVisible],
  );

  const visibleCount = useMemo(() => days.reduce((n, d) => n + d.entries.length, 0), [days]);
  // With the filter on, a page whose cards are all read would show nothing: keep paging until
  // something is visible. It stops at the list's own automatic bound and leaves the rest to the
  // button, so loading keeps a clear edge and a manual way to continue.
  useEffect(() => {
    if (!unreadOnly || visibleCount > 0 || loadingMore || loadError) return;
    if (!state.nextCursor || state.batches >= AUTO_BATCHES) return;
    void loadMore();
  }, [unreadOnly, visibleCount, loadingMore, loadError, state.nextCursor, state.batches, loadMore]);

  const toggleDay = (day: string) => {
    // A collapsed slot may remount; arrival eligibility must not survive a reader's fold toggle.
    setFreshKeys(new Set());
    setState((s) => ({ ...s, collapsed: s.collapsed.includes(day) ? s.collapsed.filter((d) => d !== day) : [...s.collapsed, day] }));
  };

  let order = 0;
  const unreadToggle = (
    <ToggleChip on={unreadOnly} onToggle={() => setState((s) => ({ ...s, unreadOnly: !s.unreadOnly }))}>
      <Text value="只看未读" />
    </ToggleChip>
  );
  return (
    <div className="relative">
      {/* Desktop puts it on the first date row; phones, and a list the filter left empty, keep its own row. */}
      <div className={`mb-2 flex justify-end ${days.length ? "lg:hidden" : ""}`}>{unreadToggle}</div>

      {days.length === 0 && !loadingMore && (
        <div className="lg:card">
          {unreadOnly ? (
            <EmptyState title={tx(state.nextCursor ? "这批精选都读过了" : "没有未读的精选内容")}><Text value={state.nextCursor ? "点下方的按钮，继续找更早的未读精选。" : "关掉「只看未读」可以看到全部内容。"} /></EmptyState>
          ) : <EmptyState title={tx("这个筛选下还没有精选内容")}><Text value="换个类别看看，或者去全部动态里找找。" /></EmptyState>}
        </div>
      )}

      {days.map(({ day, entries: cards }, dayIndex) => {
        const collapsed = state.collapsed.includes(day);
        // The server counts whole days; with the filter on, only the visible cards count.
        const count = unreadOnly ? cards.length : (state.dayCounts[day] ?? cards.length);
        return (
          <section key={day} aria-label={day} className="lg:mb-1">
            <DayHeader day={day} today={today} count={count} collapsed={collapsed} onToggle={() => toggleDay(day)} aside={dayIndex === 0 ? unreadToggle : undefined} asideOnPhone={false} />
            <Collapse open={!collapsed}>
                <ol className="lg:pt-1">
                  {cards.map((c) => {
                    const fresh = freshKeys.has(c.key);
                    const arrived = fresh && arrivalKind === "refresh";
                    const delay = fresh ? Math.min(order++, arrived ? 7 : 10) * (arrived ? 25 : 40) : 0;
                    return (
                      <TimelineSlot key={c.key} dataKey={c.key} at={c.anchorAt} fresh={fresh && !arrived} arrived={arrived} delay={delay}>
                        <FeedItem item={c.item} group={c.group} filters={filters} read={readSet.has(c.item.id) && !(unreadOnly && unreadVisible(c))} onOpen={markRead} at={c.anchorAt} />
                      </TimelineSlot>
                    );
                  })}
                </ol>
            </Collapse>
          </section>
        );
      })}

      <div ref={sentinel} aria-hidden="true" />
      <FeedEnd loading={loadingMore} error={loadError} hasMore={!!state.nextCursor} manual={state.batches >= AUTO_BATCHES} empty={visibleCount === 0} onMore={loadMore} />
    </div>
  );
}

/** The foot of a paged list: loading, retry, "加载更多" after a few automatic pages, or the end. */
function FeedEnd({ loading, error, hasMore, manual, empty, onMore }: { loading: boolean; error: boolean; hasMore: boolean; manual: boolean; empty: boolean; onMore: () => void }) {
  return (
    <div className="flex justify-center py-6">
      {loading ? (
        <span className="inline-flex items-center gap-2 text-[12.5px] text-ink-4">
          <RingMark className="size-4 text-accent" spinning /><Text value="正在加载" /></span>
      ) : error ? (
        <button type="button" onClick={onMore} className="h-9 rounded-full border border-hot/30 px-4 text-[13px] text-hot hover:bg-hot-soft"><Text value="加载失败，点此重试" /></button>
      ) : hasMore ? (
        manual && (
          <button type="button" onClick={onMore} className="h-9 rounded-full border border-line-strong bg-surface px-5 text-[13px] font-medium text-ink-2 transition-colors hover:border-ink-4 hover:text-ink"><Text value="加载更多" /></button>
        )
      ) : (
        !empty && <span className="text-[12px] text-ink-4"><Text value="已经到底了" /></span>
      )}
    </div>
  );
}
