// Reader state kept only in this browser, and the site's one guarded way to browser storage. Keep the
// keys and formats once readers have data under them: existing readers' data must stay readable as-is.
// Storage failures degrade silently.
import { useEffect, useSyncExternalStore } from "react";
import { beijingDate } from "@aihot/contracts/time";
import { recordEngagement } from "./engagement.ts";

export const KEYS = {
  starred: "aihot-starred-items",
  read: "aihot-read-items",
  theme: "aihot-theme",
  font: "aihot-font",
  motion: "eacc-reduce-motion",
  changelogSeen: "aihot-changelog-seen-version",
  feedbackDraft: "aihot-feedback-draft-v1",
  onboarded: "eacc-onboarded",
  recentSearches: "aihot-recent-searches",
  firstStar: "eacc-first-star",
  lastBackup: "eacc-last-backup",
} as const;

const STARRED_LIMIT = 500;
const READ_LIMIT = 5000;
const RECENT_SEARCH_LIMIT = 10;
const RECENT_SEARCH_MAX_CHARS = 200;
const IMPORT_MAX_CHARS = 2_000_000;
const ID_PATTERN = /^[a-zA-Z0-9_-]{1,80}$/;

export interface LocalStarredItem {
  id: string;
  title: string;
  summary: string | null;
  sourceName: string;
  savedAt: string;
  publishedAt: string | null;
  score: number | null;
  aiSelected: boolean;
}

type StorageKind = "local" | "session";

// Reading the storage property itself throws where the browser blocks storage.
function storage(kind: StorageKind): Storage | null {
  try {
    return kind === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

/** A stored string; null when it is missing or storage is unavailable. */
export function readRaw(key: string, kind: StorageKind = "local"): string | null {
  try {
    return storage(kind)?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

/** A stored JSON value; null when it is missing, unreadable or not JSON. */
export function readJson(key: string, kind: StorageKind = "local"): unknown {
  const raw = readRaw(key, kind);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Stores a string, or removes the key for null; false when nothing was saved (storage full or unavailable). */
export function writeRaw(key: string, value: string | null, kind: StorageKind = "local"): boolean {
  try {
    const s = storage(kind);
    if (!s) return false;
    if (value === null) s.removeItem(key);
    else s.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

/** The keys in this browser's storage; none when it is unavailable. */
export function storedKeys(kind: StorageKind): string[] {
  const s = storage(kind);
  return s ? Array.from({ length: s.length }, (_, i) => s.key(i)!) : [];
}

// change notification (same tab via events, other tabs via the storage event)
const listeners = new Map<string, Set<() => void>>();
let subscribers = 0;
function emit(key?: string) {
  for (const [subscribedKey, callbacks] of listeners) {
    if (key === undefined || key === subscribedKey) for (const callback of callbacks) callback();
  }
}
function onStorage(event: StorageEvent) {
  if (event.storageArea && event.storageArea !== storage("local")) return;
  if (event.key === null || event.key === KEYS.font) unsavedFont = undefined;
  if (event.key === null) cache.clear();
  else cache.delete(event.key);
  // Clear the snapshot once, before notifying all cards. Each key is parsed at most once.
  emit(event.key ?? undefined);
}
function subscribeKey(key: string) {
  return (listener: () => void) => {
    let callbacks = listeners.get(key);
    if (!callbacks) listeners.set(key, callbacks = new Set());
    callbacks.add(listener);
    if (subscribers++ === 0) window.addEventListener("storage", onStorage);
    return () => {
      callbacks.delete(listener);
      if (callbacks.size === 0) listeners.delete(key);
      if (--subscribers === 0) window.removeEventListener("storage", onStorage);
    };
  };
}
const subscribeStarred = subscribeKey(KEYS.starred);
const subscribeRead = subscribeKey(KEYS.read);
const subscribeTheme = subscribeKey(KEYS.theme);
const subscribeFont = subscribeKey(KEYS.font);
const subscribeChangelog = subscribeKey(KEYS.changelogSeen);
const subscribeRecentSearches = subscribeKey(KEYS.recentSearches);
const subscribeLastBackup = subscribeKey(KEYS.lastBackup);

// Snapshot cache so useSyncExternalStore gets stable references between changes.
const cache = new Map<string, unknown>();
function cached<T>(key: string, compute: () => T): T {
  if (!cache.has(key)) cache.set(key, compute());
  return cache.get(key) as T;
}
function invalidate(key: string) {
  cache.delete(key);
  emit(key);
}

// Another tab may have written since this tab cached its snapshots (its storage event can still be on
// the way): every edit reads fresh values first.
function editLocalData<T>(change: () => T): T {
  cache.clear();
  return change();
}

// starred
function isStarredItem(v: unknown): v is LocalStarredItem {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return typeof o.id === "string" && ID_PATTERN.test(o.id) && typeof o.title === "string";
}

// A parseable instant can still overflow when shifted into the page's display timezone.
function isDisplayableDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    beijingDate(value);
    return true;
  } catch {
    return false;
  }
}

function normalizeStarred(v: Record<string, unknown>): LocalStarredItem {
  return {
    id: String(v.id),
    title: String(v.title),
    summary: typeof v.summary === "string" ? v.summary : null,
    sourceName: typeof v.sourceName === "string" ? v.sourceName : "",
    savedAt: isDisplayableDate(v.savedAt) ? v.savedAt : new Date().toISOString(),
    publishedAt: isDisplayableDate(v.publishedAt) ? v.publishedAt : null,
    score: typeof v.score === "number" ? v.score : null,
    aiSelected: v.aiSelected === true,
  };
}

export function getStarred(): LocalStarredItem[] {
  return cached(KEYS.starred, () => {
    const parsed = readJson(KEYS.starred);
    return Array.isArray(parsed) ? parsed.filter(isStarredItem).map((v) => normalizeStarred(v as unknown as Record<string, unknown>)).slice(0, STARRED_LIMIT) : [];
  });
}

const starredSetCache = { items: null as LocalStarredItem[] | null, ids: new Set<string>() };
function isStarred(id: string): boolean {
  const items = getStarred();
  if (starredSetCache.items !== items) {
    starredSetCache.items = items;
    starredSetCache.ids = new Set(items.map((item) => item.id));
  }
  return starredSetCache.ids.has(id);
}

function starredBefore(): boolean {
  return readRaw(KEYS.firstStar) === "1";
}

/** A device that already has stars is not new. Sets the flag without counting a first star. */
export function noteExistingStars() {
  if (typeof window === "undefined" || starredBefore()) return;
  if (getStarred().length > 0) writeRaw(KEYS.firstStar, "1");
}

const firstStarListeners = new Set<() => void>();
/** Calls `listener` when this device saves its first story. Returns the unsubscribe. */
export function onFirstStar(listener: () => void): () => void {
  firstStarListeners.add(listener);
  return () => { firstStarListeners.delete(listener); };
}

function recordStarChange(id: string, added: boolean, firstDevice: boolean) {
  if (!ID_PATTERN.test(id)) return;
  recordEngagement(added ? "star_add" : "star_remove", id);
  if (added && firstDevice && writeRaw(KEYS.firstStar, "1")) {
    recordEngagement("first_star");
    for (const listener of firstStarListeners) listener();
  }
}

export function toggleStar(item: Omit<LocalStarredItem, "savedAt">): boolean {
  return editLocalData(() => {
    if (starredUnreadable()) return false;
    noteExistingStars();
    const list = getStarred();
    const firstDevice = !starredBefore() && list.length === 0;
    const exists = list.some((s) => s.id === item.id);
    const next = exists ? list.filter((s) => s.id !== item.id) : [{ ...item, savedAt: new Date().toISOString() }, ...list].slice(0, STARRED_LIMIT);
    const saved = writeRaw(KEYS.starred, JSON.stringify(next));
    invalidate(KEYS.starred);
    if (saved) recordStarChange(item.id, !exists, firstDevice);
    return saved && !exists;
  });
}

/** Removes these stars; returns the ones removed, for restoreStars to undo. */
export function removeStars(ids: string[]): LocalStarredItem[] {
  return editLocalData(() => {
    if (starredUnreadable()) return [];
    noteExistingStars();
    const drop = new Set(ids);
    const list = getStarred();
    const removed = list.filter((s) => drop.has(s.id));
    if (removed.length === 0) return [];
    const saved = writeRaw(KEYS.starred, JSON.stringify(list.filter((s) => !drop.has(s.id))));
    invalidate(KEYS.starred);
    if (!saved) return [];
    for (const s of removed) recordStarChange(s.id, false, false);
    return removed;
  });
}

/** Undoes removeStars: puts the stars back with their saved time, unless the list filled up meanwhile. */
export function restoreStars(items: LocalStarredItem[]) {
  editLocalData(() => {
    if (starredUnreadable()) return;
    const list = getStarred();
    const have = new Set(list.map((s) => s.id));
    const back = items.filter((s) => !have.has(s.id)).slice(0, Math.max(0, STARRED_LIMIT - list.length));
    if (back.length === 0) return;
    const next = [...list, ...back].sort((a, b) => Date.parse(b.savedAt) - Date.parse(a.savedAt));
    const saved = writeRaw(KEYS.starred, JSON.stringify(next));
    invalidate(KEYS.starred);
    if (saved) for (const s of back) recordStarChange(s.id, true, false);
  });
}

// read items (LRU, newest first)
export function getReadIds(): string[] {
  return cached(KEYS.read, () => {
    const parsed = readJson(KEYS.read);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string" && ID_PATTERN.test(v)).slice(0, READ_LIMIT) : [];
  });
}

const readSetCache = { ids: null as string[] | null, set: new Set<string>() };
function getReadSet(): Set<string> {
  const ids = getReadIds();
  if (readSetCache.ids !== ids) {
    readSetCache.ids = ids;
    readSetCache.set = new Set(ids);
  }
  return readSetCache.set;
}

export function markRead(id: string) {
  editLocalData(() => {
    if (!ID_PATTERN.test(id)) return;
    const ids = getReadIds();
    if (ids[0] === id) return;
    const next = [id, ...ids.filter((v) => v !== id)].slice(0, READ_LIMIT);
    writeRaw(KEYS.read, JSON.stringify(next));
    invalidate(KEYS.read);
  });
}

// appearance
export type FontPreference = "browser" | null;
let unsavedFont: FontPreference | undefined;

export function getFontPreference(): FontPreference {
  return unsavedFont !== undefined ? unsavedFont : readRaw(KEYS.font) === "browser" ? "browser" : null;
}

export function setFontPreference(pref: FontPreference) {
  // A denied write still leaves the choice usable in this tab, like an unsaved preference.
  unsavedFont = writeRaw(KEYS.font, pref) ? undefined : pref;
  emit(KEYS.font);
}

export type ThemePreference = "light" | "dark" | null;

export function getThemePreference(): ThemePreference {
  const v = readRaw(KEYS.theme);
  return v === "light" || v === "dark" ? v : null;
}

export function setThemePreference(pref: ThemePreference) {
  writeRaw(KEYS.theme, pref);
  invalidate(KEYS.theme);
}

export function resolvedTheme(pref: ThemePreference = getThemePreference()): "light" | "dark" {
  if (pref) return pref;
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } catch {
    return "light";
  }
}

const THEME_COLOR = { light: "#f4ecdc", dark: "#15110d" } as const;

// --- motion (same storage and pre-paint mechanism as theme) ---
export function setReduceMotion(reduced: boolean) {
  writeRaw(KEYS.motion, reduced ? "reduced" : null);
  if (reduced) document.documentElement.setAttribute("data-motion", "reduced");
  else document.documentElement.removeAttribute("data-motion");
  invalidate(KEYS.motion);
}

export const MOTION_BOOT_SCRIPT = `(function(){try{if(localStorage.getItem('${KEYS.motion}')==='reduced')document.documentElement.setAttribute('data-motion','reduced')}catch(e){}})();`;

// --- newsletter onboarding ---
/** Subscribed or skipped: the front page opens straight on the news from then on. */
export function markOnboarded() {
  writeRaw(KEYS.onboarded, new Date().toISOString());
  document.documentElement.removeAttribute("data-onboarding");
}

/**
 * Inline script run before paint: a first visit to the front page opens on the newsletter onboarding
 * (html[data-onboarding] shows it, see app.css). Crawlers and readers who already chose see the news;
 * so does anyone whose storage is unavailable, as the choice could not be remembered. Discover the
 * matching poster here, before styles or hydration, but never spend returning readers' bandwidth on it.
 * Complementary media queries keep the preload and the CSS poster in step in either orientation.
 */
export const ONBOARDING_BOOT_SCRIPT = `(function(){try{if(location.pathname!=='/'||/bot|crawl|spider|slurp|preview|lighthouse|headless/i.test(navigator.userAgent))return;if(localStorage.getItem('${KEYS.onboarded}'))return;document.documentElement.setAttribute('data-onboarding','');['portrait','landscape'].forEach(function(o){var l=document.createElement('link');l.rel='preload';l.as='image';l.setAttribute('fetchpriority','high');l.media='(orientation: '+o+')';l.href='/media/hero-'+(o==='portrait'?'9x16':'16x9')+'-poster.jpg';document.head.appendChild(l)})}catch(e){}})();`;

/** Puts a theme on the page: the document's data-theme and the browser's theme colour. */
export function applyTheme(theme: "light" | "dark", followsSystem: boolean) {
  document.documentElement.setAttribute("data-theme", theme);
  // The two theme-color tags answer the system scheme; a chosen theme sets both to its own colour.
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    const scheme = meta.media.includes("dark") ? "dark" : "light";
    meta.content = followsSystem ? THEME_COLOR[scheme] : THEME_COLOR[theme];
  }
}

/**
 * Keeps the page on the reader's theme after the first paint: a choice made in another tab or by an
 * import, and the system switching between light and dark while the page follows it.
 */
export function useAppearanceSync() {
  const pref = useThemePreference();
  const font = useFontPreference();
  useEffect(() => {
    document.documentElement.setAttribute("data-font", getFontPreference() ?? "system");
  }, [font]);
  useEffect(() => {
    // Read the stored choice itself: during hydration the hook still reports the server's "none".
    const current = getThemePreference();
    applyTheme(resolvedTheme(current), current === null);
    if (current !== null) return;
    let query: MediaQueryList;
    try {
      query = window.matchMedia("(prefers-color-scheme: dark)");
    } catch {
      return;
    }
    const onChange = () => applyTheme(query.matches ? "dark" : "light", true);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [pref]);
}

/** Inline script run before paint so the first frame already has the reader's appearance. */
export const APPEARANCE_BOOT_SCRIPT = `(function(){var f='system';try{f=localStorage.getItem('${KEYS.font}')==='browser'?'browser':'system'}catch(e){}document.documentElement.setAttribute('data-font',f);try{var t=localStorage.getItem('${KEYS.theme}');if(t==='light'||t==='dark'){var c=t==='dark'?'${THEME_COLOR.dark}':'${THEME_COLOR.light}';document.querySelectorAll('meta[name="theme-color"]').forEach(function(m){m.content=c})}else{t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}document.documentElement.setAttribute('data-theme',t)}catch(e){document.documentElement.setAttribute('data-theme','light')}})();`;

// changelog red dot
function getChangelogSeen(): string | null {
  const v = readRaw(KEYS.changelogSeen);
  return v && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v) ? v : null;
}

export function setChangelogSeen(version: string) {
  writeRaw(KEYS.changelogSeen, version);
  invalidate(KEYS.changelogSeen);
}

// recent searches (newest first, at most RECENT_SEARCH_LIMIT; this browser only)
function getRecentSearches(): string[] {
  return cached(KEYS.recentSearches, () => {
    const parsed = readJson(KEYS.recentSearches);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string" && v.trim() !== "").slice(0, RECENT_SEARCH_LIMIT) : [];
  });
}

/** Puts a search first (the same words in another case replace the older entry). */
export function addRecentSearch(query: string) {
  const q = query.trim().slice(0, RECENT_SEARCH_MAX_CHARS);
  if (!q) return;
  const rest = getRecentSearches().filter((v) => v.toLowerCase() !== q.toLowerCase());
  writeRaw(KEYS.recentSearches, JSON.stringify([q, ...rest].slice(0, RECENT_SEARCH_LIMIT)));
  invalidate(KEYS.recentSearches);
}

export function clearRecentSearches() {
  writeRaw(KEYS.recentSearches, null);
  invalidate(KEYS.recentSearches);
}

// the page the reader was on (feedback records where a problem was seen)
const LAST_PAGE_KEY = "aihot:last-page";
const NOT_A_PLACE = /^\/(feedback|more)(\/|$)|^\/admin(\/|$)/;

/** Called on every in-site navigation: remembers the latest real page, never feedback, "更多" or the admin. */
export function rememberPage(path: string) {
  if (!NOT_A_PLACE.test(path)) writeRaw(LAST_PAGE_KEY, path, "session");
}

export function lastPage(): string | null {
  const v = readRaw(LAST_PAGE_KEY, "session");
  return v && v.startsWith("/") && !v.startsWith("//") ? v : null;
}

// export / import (version 1)
export interface ExportBundle {
  version: 1;
  starred: LocalStarredItem[];
  read: string[];
  theme: "light" | "dark" | "auto" | null;
  font?: "system" | "browser";
}

export function exportBundle(): ExportBundle {
  const pref = getThemePreference();
  return { version: 1, starred: getStarred(), read: getReadIds(), theme: pref ?? "auto", font: getFontPreference() ?? "system" };
}

// last export (the saved page reminds readers to back up when there is none, or it is old)
export function getLastBackup(): string | null {
  const v = readRaw(KEYS.lastBackup);
  return v && isDisplayableDate(v) ? v : null;
}

export function markBackedUp(at = new Date()) {
  writeRaw(KEYS.lastBackup, at.toISOString());
  invalidate(KEYS.lastBackup);
}

export interface ImportReport {
  starredAdded: number;
  starredSkipped: number;
  readAdded: number;
  readSkipped: number;
  themeApplied: boolean;
  fontApplied: boolean;
  /** The stars were saved but the read marks could not be (storage full or unavailable). */
  readFailed: boolean;
}

/** Merge: existing stars are not overwritten, read ids are unioned, appearance only if unset. */
export function importBundle(text: string): ImportReport {
  if (text.length > IMPORT_MAX_CHARS) throw new Error("文件过大（上限 2,000,000 字符）");
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("不是有效的 JSON 文件");
  }
  const d = data as Partial<ExportBundle>;
  if (!d || typeof d !== "object" || d.version !== 1) throw new Error("文件格式不对（需要 version: 1）");
  return mergeLocalData({
    starred: Array.isArray(d.starred) ? d.starred : [],
    read: Array.isArray(d.read) ? d.read : [],
    theme: d.theme ?? null,
    font: d.font ?? null,
  });
}

/** Stored stars that cannot be read (not JSON, not a list): an import must not write over them. */
function starredUnreadable(): boolean {
  const raw = readRaw(KEYS.starred);
  if (!raw) return false;
  try {
    return !Array.isArray(JSON.parse(raw));
  } catch {
    return true;
  }
}

function mergeLocalData(incoming: { starred: unknown[]; read: unknown[]; theme: unknown; font?: unknown }): ImportReport {
  return editLocalData(() => {
    // The reader's own data stays recoverable (export it, or fix it) rather than replaced by the import.
    if (starredUnreadable()) throw new Error("这台设备上已有的收藏数据无法读取，为避免覆盖，这次没有导入。");
    const current = getStarred();
    const have = new Set(current.map((s) => s.id));
    const additions: LocalStarredItem[] = [];
    let starredSkipped = 0;
    for (const s of incoming.starred) {
      if (!isStarredItem(s)) { starredSkipped++; continue; }
      if (have.has(s.id)) continue;
      have.add(s.id);
      additions.push(normalizeStarred(s as unknown as Record<string, unknown>));
    }
    const room = Math.max(0, STARRED_LIMIT - current.length);
    const accepted = additions.slice(0, room);
    starredSkipped += additions.length - accepted.length;
    const mergedStarred = [...current, ...accepted].sort((a, b) => Date.parse(b.savedAt) - Date.parse(a.savedAt));
    // An import is reported only after it was written; a failure here leaves the browser as it was.
    if (!writeRaw(KEYS.starred, JSON.stringify(mergedStarred))) throw new Error("浏览器存储已满或不可用，这次没有导入任何内容。");

    const readIds = getReadIds();
    const readHave = new Set(readIds);
    const readAdditions: string[] = [];
    let readSkipped = 0;
    for (const id of incoming.read) {
      if (typeof id !== "string" || !ID_PATTERN.test(id)) { readSkipped++; continue; }
      if (readHave.has(id)) continue;
      readHave.add(id);
      readAdditions.push(id);
    }
    const readRoom = Math.max(0, READ_LIMIT - readIds.length);
    readSkipped += Math.max(0, readAdditions.length - readRoom);
    const readFailed = !writeRaw(KEYS.read, JSON.stringify([...readIds, ...readAdditions.slice(0, readRoom)]));

    let themeApplied = false;
    if (!getThemePreference() && (incoming.theme === "light" || incoming.theme === "dark")) {
      themeApplied = writeRaw(KEYS.theme, incoming.theme);
    }
    const fontApplied = !getFontPreference() && incoming.font === "browser" && writeRaw(KEYS.font, "browser");
    if (mergedStarred.length > 0 && !starredBefore()) writeRaw(KEYS.firstStar, "1");
    cache.clear();
    emit();
    return { starredAdded: accepted.length, starredSkipped, readAdded: readFailed ? 0 : Math.min(readAdditions.length, readRoom), readSkipped, themeApplied, fontApplied, readFailed };
  });
}

/** Imports from elsewhere (the site's modules') merge through the same path. */
export { mergeLocalData };

// React hooks
const EMPTY_STARRED: LocalStarredItem[] = [];
const EMPTY_SET = new Set<string>();

export function useStarred(): LocalStarredItem[] {
  return useSyncExternalStore(subscribeStarred, getStarred, () => EMPTY_STARRED);
}

export function useIsStarred(id: string): boolean {
  return useSyncExternalStore(subscribeStarred, () => isStarred(id), () => false);
}

export function useReadSet(): Set<string> {
  return useSyncExternalStore(subscribeRead, getReadSet, () => EMPTY_SET);
}

export function useThemePreference(): ThemePreference {
  return useSyncExternalStore(subscribeTheme, getThemePreference, () => null);
}

export function useFontPreference(): FontPreference {
  return useSyncExternalStore(subscribeFont, getFontPreference, () => null);
}

export function useChangelogSeen(): string | null {
  return useSyncExternalStore(subscribeChangelog, getChangelogSeen, () => null);
}

const NO_SEARCHES: string[] = [];
export function useRecentSearches(): string[] {
  return useSyncExternalStore(subscribeRecentSearches, getRecentSearches, () => NO_SEARCHES);
}

export function useLastBackup(): string | null {
  return useSyncExternalStore(subscribeLastBackup, getLastBackup, () => null);
}
