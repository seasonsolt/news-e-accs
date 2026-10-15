import { contentFetch } from "../lib/content-fetch";
import { Link } from "../lib/navigation";
import { localeFromMatches, Text, useLocale, useTranslate } from "../lib/i18n";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLocation } from "react-router";
import type { ItemAvailability } from "@aihot/contracts/site";
import { SITE } from "@aihot/site";
import { Presence } from "../components/ui/Presence";
import { edgeTtl } from "../lib/api.server";
import { pageMeta } from "../lib/seo";
import { exportBundle, importBundle, removeStar, useStarred, type ImportReport } from "../lib/local-state";
import { recordEngagement } from "../lib/engagement";
import { fullDateTime } from "../lib/format";
import { IconBookmark, IconDownload, IconClose } from "../components/icons";
import { Deck } from "../components/shell/Deck";
import { readSnapshot, restoreAnchor, useSaveOnLeave } from "../lib/restore";
import { webModules } from "../site-modules";

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

export default function StarredPage() {
  const tx = useTranslate();
  const locale = useLocale();
  const starred = useStarred();
  const [mounted, setMounted] = useState(false);
  const [availability, setAvailability] = useState<Record<string, ItemAvailability>>({});
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => setMounted(true), []);

  const starredIds = starred.map((s) => s.id).join(",");
  useEffect(() => {
    if (!mounted || !starredIds) return;
    const controller = new AbortController();
    // Batches of 100: a request line with all 500 ids is longer than the front servers accept.
    const ids = starredIds.split(",");
    const batches: string[][] = [];
    for (let i = 0; i < ids.length; i += 100) batches.push(ids.slice(i, i + 100));
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
  }, [mounted, starredIds]);

  // Back from an item: the list renders only after mounting (it lives in this browser), so the
  // position comes back once it is there, by the same card anchor the other lists use.
  const historyKey = useLocation().key;
  useLayoutEffect(() => {
    if (!mounted || starred.length === 0) return;
    const snap = readSnapshot<null>(historyKey);
    if (snap) restoreAnchor(snap.anchor, snap.scrollY);
  }, [mounted, historyKey]);
  useSaveOnLeave(historyKey, () => null);

  const doExport = () => {
    recordEngagement("starred_export");
    const blob = new Blob([JSON.stringify(exportBundle(), null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${SITE.mcpPrefix}-local-data-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const doImport = async (file: File | undefined) => {
    if (!file) return;
    try {
      const report = importBundle(await file.text());
      recordEngagement("starred_import");
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

  const action = "text-[12.5px] text-ink-3 transition-colors hover:text-accent";
  return (
    <div className="pb-12">
      <Deck compact label={tx("收藏")} title={tx("收藏")} description={tx("本机收藏的 {0} 内容，适合稍后阅读和回看。", SITE.name)} />
      <header className="flex flex-col gap-2 pb-4 pt-5 sm:flex-row sm:items-start sm:justify-end">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {webModules().flatMap((m) => m.starredImports ?? []).map((i) => (
            <button key={i.label} type="button" onClick={() => importFrom(i.run)} className={action}>
              {i.label}
            </button>
          ))}
          <button type="button" onClick={() => fileRef.current?.click()} className={action}><Text value="导入文件" /></button>
          {mounted && starred.length > 0 && (
            <button type="button" onClick={doExport} className={`${action} inline-flex items-center gap-1`}>
              <IconDownload size={13} /><Text value="导出" /></button>
          )}
          <input ref={fileRef} type="file" accept="application/json,.json" className="sr-only" onChange={(e) => doImport(e.target.files?.[0])} />
        </div>
      </header>
      <p className="rounded-tile border border-line bg-surface px-4 py-2.5 text-[12.5px] text-ink-3"><Text value="收藏只保存在当前浏览器；清除浏览器数据或换设备后不会同步。" /></p>
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
        <div className="mt-3 flex flex-col items-center rounded-card border border-dashed border-line-strong px-6 py-12 text-center">
          <IconBookmark size={20} className="text-ink-4" />
          <p className="mt-3 text-[13px] text-ink-3"><Text value="还没有收藏内容。点开任意一条内容，在详情页点击收藏即可添加。" /></p>
          <Link to="/" className="mt-4 text-[12.5px] font-medium text-accent hover:text-accent-ink"><Text value="去看精选 →" /></Link>
        </div>
      ) : (
        <ul className="mt-3 lg:space-y-3">
          {starred.map((s) => {
            const current = availability[s.id];
            const status = current?.status;
            const unavailable = status === "unavailable";
            return (
              <li key={s.id} data-card-key={s.id} className={`relative border-b border-line-soft py-4 lg:card lg:px-[18px] lg:py-[15px] ${unavailable ? "opacity-70" : "lg:card-hover"}`}>
                <div className="flex items-center gap-2 text-[12.5px] text-ink-4">
                  <span className="min-w-0 truncate text-ink-3">{current?.sourceName ?? s.sourceName}</span>
                  {s.publishedAt && <span className="num shrink-0">· {fullDateTime(s.publishedAt)}</span>}
                  <span className="ml-auto hidden shrink-0 sm:inline"><Text value="收藏于" /><span className="num">{fullDateTime(s.savedAt)}</span>
                  </span>
                  <button type="button" aria-label={tx("取消收藏")} title={tx("取消收藏")} onClick={() => removeStar(s.id)} className="relative z-10 -my-1 ml-auto grid size-7 shrink-0 place-items-center rounded-full text-ink-4 transition-colors hover:bg-bg-sunk hover:text-ink sm:ml-0">
                    <IconClose size={14} />
                  </button>
                </div>
                <h2 className="mt-1.5 text-[16px] font-[650] leading-[1.55] text-ink">
                  {unavailable ? (
                    s.title
                  ) : (
                    <Link to={`/items/${s.id}`} className="transition-colors after:absolute after:inset-0 after:content-[''] hover:text-accent">
                      {s.title}
                    </Link>
                  )}
                </h2>
                {s.summary && <p className="mt-1.5 line-clamp-2 text-[14px] leading-[1.75] text-ink-3">{s.summary}</p>}
                {unavailable && <p className="mt-2 text-[12.5px] text-hot"><Text value="这条内容已不再公开，收藏会保留直到你手动移除。" /></p>}
                {status === "summary-only" && <p className="mt-2 text-[12.5px] text-amber-ink"><Text value="应来源方要求，这条内容现在只提供摘要。" /></p>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
