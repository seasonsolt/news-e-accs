import { contentFetch } from "../lib/content-fetch";
import { Link } from "../lib/navigation";
import { localeFromMatches, Text, useLocale, useTranslate } from "../lib/i18n";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router";
import type { ItemAvailability } from "@aihot/contracts/site";
import { CATEGORY_LABELS } from "@aihot/contracts/taxonomy";
import { SITE } from "@aihot/site";
import { Presence } from "../components/ui/Presence";
import { Menu, MenuItem } from "../components/ui/Menu";
import { edgeTtl } from "../lib/api.server";
import { pageMeta } from "../lib/seo";
import {
  exportBundle, importBundle, markBackedUp, removeStars, restoreStars, useLastBackup, useReadSet, useStarred,
  type ImportReport, type LocalStarredItem,
} from "../lib/local-state";
import { recordEngagement } from "../lib/engagement";
import { relativeTime } from "../lib/format";
import { IconBookmark, IconChevronDown, IconClose, IconDownload, IconSearch } from "../components/icons";
import { readSnapshot, restoreAnchor, useSaveOnLeave } from "../lib/restore";
import { webModules } from "../site-modules";
import { backupDue, developmentsSince, matchesQuery, savedGroup, type SavedGroup } from "../features/starred/saved-list";

export function headers() {
  return edgeTtl(300);
}

export function meta({ matches }: { matches?: Array<{ id: string; data?: unknown }> } = {}) {
  return pageMeta({ title: "我的收藏", description: `保存在这台设备上的 ${SITE.name} 收藏。`, path: "/starred", noindex: true }, localeFromMatches(matches ?? []));
}

function reportText(r: ImportReport, tx: (message: string, ...values: unknown[]) => string, locale: string): string {
  const parts = [tx("新增收藏 {0} 条", r.starredAdded), tx("已读记录 {0} 条", r.readAdded)];
  if (r.starredSkipped || r.readSkipped) parts.push(tx("超出上限或格式不对而跳过 {0} 条", r.starredSkipped + r.readSkipped));
  if (r.themeApplied) parts.push(tx("已沿用导入的深浅色设置"));
  if (r.fontApplied) parts.push(tx("已沿用导入的字体设置"));
  if (r.readFailed) parts.push(tx("已读记录没能保存（浏览器存储已满或不可用）"));
  return parts.join(locale === "en" ? ", " : "，");
}

type Filter = "all" | "unread" | "developments";
const GROUPS: Array<{ key: SavedGroup; label: string }> = [
  { key: "today", label: "今天" },
  { key: "week", label: "本周" },
  { key: "earlier", label: "更早" },
];
const UNDO_MS = 6000;

/** Availability in batches of 100: a request line with all 500 ids is longer than the front servers accept. */
function useAvailability(ids: string, enabled: boolean): Record<string, ItemAvailability> {
  const [availability, setAvailability] = useState<Record<string, ItemAvailability>>({});
  useEffect(() => {
    if (!enabled || !ids) return;
    const controller = new AbortController();
    const all = ids.split(",");
    const batches: string[][] = [];
    for (let i = 0; i < all.length; i += 100) batches.push(all.slice(i, i + 100));
    Promise.all(
      batches.map((batch) =>
        contentFetch(`/api/site/items/availability?ids=${encodeURIComponent(batch.join(","))}`, { signal: controller.signal })
          .then((r) => (r.ok ? (r.json() as Promise<Record<string, ItemAvailability>>) : {}))
          .catch(() => ({})),
      ),
    ).then((parts) => {
      if (!controller.signal.aborted) setAvailability(Object.assign({}, ...parts));
    });
    return () => controller.abort();
  }, [enabled, ids]);
  return availability;
}

export default function StarredPage() {
  const tx = useTranslate();
  const locale = useLocale();
  const starred = useStarred();
  const readSet = useReadSet();
  const lastBackup = useLastBackup();
  const [mounted, setMounted] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [showGone, setShowGone] = useState(false);
  const [undo, setUndo] = useState<{ items: LocalStarredItem[]; at: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => setMounted(true), []);
  const availability = useAvailability(starred.map((s) => s.id).join(","), mounted);

  useEffect(() => {
    if (!undo) return;
    const timer = setTimeout(() => setUndo(null), UNDO_MS);
    return () => clearTimeout(timer);
  }, [undo]);

  // Back from an item: the list renders only after mounting (it lives in this browser), so the
  // position comes back once it is there, by the same card anchor the other lists use.
  const historyKey = useLocation().key;
  useLayoutEffect(() => {
    if (!mounted || starred.length === 0) return;
    const snap = readSnapshot<null>(historyKey);
    if (snap) restoreAnchor(snap.anchor, snap.scrollY);
  }, [mounted, historyKey]);
  useSaveOnLeave(historyKey, () => null);

  const { shown, gone, unread, withDevelopments } = useMemo(() => {
    const live = starred.filter((s) => availability[s.id]?.status !== "unavailable");
    const fresh = (s: LocalStarredItem) => developmentsSince(s.savedAt, availability[s.id]?.story?.developments);
    const unread = live.filter((s) => !readSet.has(s.id));
    const withDevelopments = live.filter((s) => fresh(s) > 0);
    const pool = filter === "unread" ? unread : filter === "developments" ? withDevelopments : live;
    return {
      shown: pool.filter((s) => matchesQuery(s, query)),
      gone: starred.filter((s) => availability[s.id]?.status === "unavailable"),
      unread: unread.length,
      withDevelopments: withDevelopments.length,
    };
  }, [starred, availability, readSet, filter, query]);

  const remove = (ids: string[]) => {
    const items = removeStars(ids);
    if (items.length > 0) setUndo({ items, at: Date.now() });
  };

  const doExport = () => {
    recordEngagement("starred_export");
    const blob = new Blob([JSON.stringify(exportBundle(), null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${SITE.mcpPrefix}-local-data-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    markBackedUp();
  };

  const doImport = async (file: File | undefined) => {
    if (!file) return;
    try {
      const report = importBundle(await file.text());
      if (report.starredAdded + report.readAdded > 0 || report.themeApplied || report.fontApplied) recordEngagement("starred_import");
      setNotice({ kind: report.readFailed ? "error" : "ok", text: tx("导入完成：{0}", reportText(report, tx, locale)) });
    } catch (e) {
      setNotice({ kind: "error", text: e instanceof Error ? e.message : tx("导入失败") });
    }
  };

  // Imports from elsewhere that the site's modules offer.
  const importFrom = (run: () => Promise<{ ok: boolean; text: string }>) =>
    run().then(
      (r) => {
        if (r.ok) recordEngagement("starred_import");
        setNotice({ kind: r.ok ? "ok" : "error", text: r.text });
      },
      (err: Error) => setNotice({ kind: "error", text: err.message }),
    );

  const due = mounted && backupDue(starred.length, lastBackup);
  const groups = GROUPS.map((g) => ({ ...g, items: shown.filter((s) => savedGroup(s.savedAt) === g.key) })).filter((g) => g.items.length > 0);
  const filters: Array<{ key: Filter; label: string; count?: number }> = [
    { key: "all", label: "全部" },
    { key: "unread", label: "未读", count: unread },
    { key: "developments", label: "有新进展", count: withDevelopments },
  ];

  return (
    <div className="pb-12">
      <div className="page-band" aria-hidden="true" />
      <header className="flex items-end justify-between gap-3 pt-6">
        <div className="min-w-0">
          <h1 className="text-[26px] font-[700] leading-tight text-ink"><Text value="收藏" /></h1>
          {mounted && starred.length > 0 && (
            <p className="num mt-1 text-[13px] text-ink-3">
              {[tx("{0} 条", starred.length), tx("{0} 条未读", unread), withDevelopments > 0 ? tx("{0} 件有新进展", withDevelopments) : null].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
        <Menu labeled label={tx("备份")} trigger={<><Text value="备份" /><IconChevronDown size={14} /></>}>
          {(close) => (
            <>
              {starred.length > 0 && (
                <MenuItem icon={<IconDownload size={14} />} onSelect={() => { close(); doExport(); }}><Text value="导出备份" /></MenuItem>
              )}
              <MenuItem onSelect={() => { close(); fileRef.current?.click(); }}><Text value="从文件导入" /></MenuItem>
              {webModules().flatMap((m) => m.starredImports ?? []).map((i) => (
                <MenuItem key={i.label} onSelect={() => { close(); void importFrom(i.run); }}>{i.label}</MenuItem>
              ))}
            </>
          )}
        </Menu>
        <input ref={fileRef} type="file" accept="application/json,.json" className="sr-only" onChange={(e) => doImport(e.target.files?.[0])} />
      </header>
      {mounted && (
        <p className={`mt-2 text-[12.5px] ${due ? "font-medium text-hot" : "text-ink-4"}`}>
          <Text value="只存在这台设备" />
          {" · "}
          {lastBackup ? tx("上次备份 {0}", tx(relativeTime(lastBackup))) : <Text value="还没备份过" />}
          {due && <>{" · "}<button type="button" onClick={doExport} className="underline underline-offset-2 hover:text-ink"><Text value="现在导出一份" /></button></>}
          {due && <span className="block font-normal text-ink-4"><Text value="清除浏览器数据会删掉收藏，Safari 在 7 天没打开本站后也可能自动清除。" /></span>}
        </p>
      )}
      <Presence show={!!notice} enter="anim-notice-in" exit="anim-fade-out" duration={160}>
        <div
          role="status"
          className={`mt-3 flex items-start justify-between gap-3 rounded-tile px-4 py-2.5 text-[13px] ${notice?.kind === "ok" ? "bg-accent-soft text-accent-ink dark:text-accent" : "bg-hot-soft text-hot"}`}
        >
          {notice?.text}
          <button type="button" aria-label={tx("关闭")} onClick={() => setNotice(null)} className="shrink-0 opacity-70 hover:opacity-100">
            <IconClose size={14} />
          </button>
        </div>
      </Presence>
      {!mounted ? null : starred.length === 0 ? (
        <div className="mt-5 flex flex-col items-center rounded-card border border-dashed border-line-strong px-6 py-12 text-center">
          <IconBookmark size={20} className="text-ink-4" />
          <p className="mt-3 text-[13px] text-ink-3"><Text value="还没有收藏内容。点任意卡片或详情页上的收藏图标即可添加。" /></p>
          <Link to="/" className="mt-4 text-[12.5px] font-medium text-accent hover:text-accent-ink"><Text value="去看精选 →" /></Link>
        </div>
      ) : (
        <>
          <div className="mt-5 flex flex-col gap-2.5 sm:flex-row sm:items-center">
            <label className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-control border border-line bg-surface px-3 text-ink-4 focus-within:border-accent">
              <IconSearch size={14} />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={tx("搜索收藏")}
                aria-label={tx("搜索收藏")}
                className="min-w-0 flex-1 bg-transparent text-[13.5px] text-ink outline-none placeholder:text-ink-4"
              />
            </label>
            <div role="group" aria-label={tx("筛选")} className="flex shrink-0 rounded-control bg-bg-sunk p-0.5">
              {filters.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  aria-pressed={filter === f.key}
                  onClick={() => setFilter(f.key)}
                  className={`flex-1 rounded-[calc(var(--radius-control)-2px)] px-3 py-1.5 text-[12.5px] transition-colors sm:flex-none ${filter === f.key ? "bg-raised font-medium text-ink shadow-sm" : "text-ink-3 hover:text-ink"}`}
                >
                  {tx(f.label)}{f.count ? <span className="num ml-1 text-ink-4">{f.count}</span> : null}
                </button>
              ))}
            </div>
          </div>

          {groups.length === 0 && (
            <p className="mt-8 text-center text-[13px] text-ink-3"><Text value="没有符合条件的收藏。" /></p>
          )}
          {groups.map((g) => (
            <section key={g.key} className="mt-6">
              <h2 className="mb-1 text-[12px] font-medium tracking-wide text-ink-4 lg:mb-3"><Text value={g.label} /></h2>
              <ul className="lg:space-y-3">
                {g.items.map((s) => (
                  <SavedCard key={s.id} item={s} availability={availability[s.id]} read={readSet.has(s.id)} onRemove={() => remove([s.id])} />
                ))}
              </ul>
            </section>
          ))}

          {gone.length > 0 && filter === "all" && !query && (
            <section className="mt-6 rounded-card border border-dashed border-line-strong px-4 py-3">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px]">
                <span className="text-ink-3">{tx("{0} 条已不再公开", gone.length)}</span>
                <button type="button" onClick={() => setShowGone(!showGone)} aria-expanded={showGone} className="text-ink-3 hover:text-accent">
                  <Text value={showGone ? "收起" : "查看"} />
                </button>
                <button type="button" onClick={() => remove(gone.map((s) => s.id))} className="text-hot hover:underline"><Text value="全部移除" /></button>
              </div>
              {showGone && (
                <ul className="mt-2 space-y-1.5">
                  {gone.map((s) => (
                    <li key={s.id} className="flex items-center gap-2 text-[13px] text-ink-4">
                      <span className="min-w-0 flex-1 truncate">{s.title}</span>
                      <button type="button" aria-label={tx("取消收藏")} title={tx("取消收藏")} onClick={() => remove([s.id])} className="grid size-6 shrink-0 place-items-center rounded-full hover:bg-bg-sunk hover:text-ink">
                        <IconClose size={12} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </>
      )}

      <Presence show={!!undo} enter="anim-notice-in" exit="anim-fade-out" duration={160}>
        <div role="status" className="fixed inset-x-4 bottom-[calc(env(safe-area-inset-bottom)+76px)] z-50 mx-auto flex max-w-[420px] items-center gap-3 rounded-tile bg-ink px-4 py-2.5 text-[13px] text-bg shadow-[var(--shadow-pop)] lg:bottom-6">
          <span className="min-w-0 flex-1 truncate">
            {undo && (undo.items.length === 1 ? tx("已移除“{0}”", undo.items[0]!.title) : tx("已移除 {0} 条收藏", undo.items.length))}
          </span>
          <button type="button" onClick={() => { if (undo) restoreStars(undo.items); setUndo(null); }} className="shrink-0 font-semibold underline underline-offset-2 hover:opacity-80">
            <Text value="撤销" />
          </button>
        </div>
      </Presence>
    </div>
  );
}

function SavedCard({ item: s, availability, read, onRemove }: { item: LocalStarredItem; availability?: ItemAvailability; read: boolean; onRemove: () => void }) {
  const tx = useTranslate();
  const fresh = developmentsSince(s.savedAt, availability?.story?.developments);
  const category = availability?.category;
  return (
    <li data-card-key={s.id} className="relative border-b border-line-soft py-4 lg:card lg:card-hover lg:px-[18px] lg:py-[15px]">
      <div className="flex items-center gap-2 text-[12.5px] text-ink-4">
        {category && (
          <Link to={`/all?category=${category}`} className="relative z-10 shrink-0 rounded-[5px] bg-bg-sunk px-1.5 py-px text-[11.5px] text-ink-3 hover:text-accent">
            {tx(CATEGORY_LABELS[category])}
          </Link>
        )}
        <span className="min-w-0 truncate text-ink-3">{availability?.sourceName ?? s.sourceName}</span>
        {s.publishedAt && <time dateTime={s.publishedAt} className="num shrink-0">· {tx(relativeTime(s.publishedAt))}</time>}
        <button type="button" aria-label={tx("取消收藏")} title={tx("取消收藏")} onClick={onRemove} className="relative z-10 -my-1 ml-auto grid size-7 shrink-0 place-items-center rounded-full text-ink-4 transition-colors hover:bg-bg-sunk hover:text-ink">
          <IconClose size={14} />
        </button>
      </div>
      <h3 className={`mt-1.5 text-[16px] font-[650] leading-[1.55] ${read ? "text-ink-3" : "text-ink"}`}>
        {!read && <span className="mr-2 inline-block size-[7px] -translate-y-px rounded-full bg-accent align-middle" role="img" aria-label={tx("未读")} />}
        <Link to={`/items/${s.id}`} className="transition-colors after:absolute after:inset-0 after:content-[''] hover:text-accent">
          {s.title}
        </Link>
      </h3>
      {s.summary && <p className="mt-1.5 line-clamp-2 text-[14px] leading-[1.75] text-ink-3">{s.summary}</p>}
      {fresh > 0 && availability?.story && (
        <Link to={`/story/${availability.story.id}`} className="relative z-10 mt-2 inline-flex text-[13px] font-medium text-accent hover:text-accent-ink">
          {tx("这件事有 {0} 条新进展 →", fresh)}
        </Link>
      )}
      {availability?.status === "summary-only" && <p className="mt-2 text-[12.5px] text-amber-ink"><Text value="应来源方要求，这条内容现在只提供摘要。" /></p>}
    </li>
  );
}
