// Page-view reports for the admin's reader counts (docs/analytics.md). The browser keeps two dates of its own (its
// first and previous visit day) so the server can tell new readers from returning ones without any identifier,
// and reports where a full page load came from. A failed send never affects the page.
import { beijingDate } from "@aihot/contracts/time";
import { KEYS, readRaw, writeRaw } from "./local-state";

const UTM = ["source", "medium", "campaign"] as const;

function send(body: Record<string, unknown>): void {
  void fetch("/api/site/analytics", {
    method: "POST",
    credentials: "omit",
    cache: "no-store",
    keepalive: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => {});
}

/** This browser's first visit day and the visit day before today (site days), kept in local storage. */
function visitDates(): { first: string | null; prev: string | null } {
  const day = beijingDate(Date.now());
  let first = readRaw(KEYS.firstVisit);
  if (!first && writeRaw(KEYS.firstVisit, day)) first = day;
  const last = readRaw(KEYS.lastVisit);
  if (last !== day) {
    if (last) writeRaw(KEYS.prevVisit, last);
    writeRaw(KEYS.lastVisit, day);
  }
  return { first, prev: readRaw(KEYS.prevVisit) };
}

/** The owner's own reading is left out of the counts once this browser has opened the admin. */
export function markOwner(): void {
  writeRaw(KEYS.owner, "1");
}

const isOwner = () => readRaw(KEYS.owner) === "1";

/** Reports a page view. A full load (nav false) also reports the referring site and campaign tags. */
export function reportView(path: string, nav: boolean, search: string): void {
  const body: Record<string, unknown> = { event: "page_view", path, nav, ...visitDates() };
  if (isOwner()) body.own = true;
  if (navigator.webdriver) body.wd = true;
  if (navigator.maxTouchPoints > 1) body.touch = true;
  body.lang = (navigator.language || "").split("-")[0];
  if (!nav) {
    let referrer = "";
    try { referrer = document.referrer && new URL(document.referrer).host !== location.host ? document.referrer : ""; } catch { /* unreadable */ }
    const params = new URLSearchParams(search);
    const utm = Object.fromEntries(UTM.map((key) => [key, params.get(`utm_${key}`) ?? (key === "source" ? params.get("ref") ?? "" : "")]).filter(([, v]) => v));
    if (referrer) body.ref = referrer;
    if (Object.keys(utm).length) body.utm = utm;
    if (params.get("via")) body.via = params.get("via");
  }
  send(body);
}

/** Measures how long the page is visible and reports it when the reader leaves or switches away. */
export function trackVisibleTime(path: string): () => void {
  let total = 0;
  let since = document.visibilityState === "visible" ? performance.now() : 0;
  const flush = () => {
    if (since) { total += performance.now() - since; since = 0; }
    if (total >= 1000) send({ event: "page_leave", path, ms: Math.round(total), ...(isOwner() ? { own: true } : {}) });
    total = 0;
  };
  const change = () => {
    if (document.visibilityState === "visible") since = performance.now();
    else flush();
  };
  document.addEventListener("visibilitychange", change);
  return () => {
    document.removeEventListener("visibilitychange", change);
    flush();
  };
}
