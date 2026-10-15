// What the saved page works out from this browser's stars and the availability answer: which group a
// star sits in, how many of its event's developments came after it, whether a backup is due, and the
// local search.
import { addDays, beijingDate } from "@aihot/contracts/time";
import type { LocalStarredItem } from "../../lib/local-state";

export type SavedGroup = "today" | "week" | "earlier";

const DAY = 86_400_000;
/** Safari may clear a site's storage after seven days without a visit; a backup older than that is due. */
const BACKUP_DUE_AFTER = 7 * DAY;
/** With fewer stars than this and never a backup, the reminder stays quiet. */
const BACKUP_DUE_COUNT = 5;

/** Today and this calendar week (from Monday) by Beijing date, as the rest of the site counts days. */
export function savedGroup(savedAt: string, now = new Date()): SavedGroup {
  const today = beijingDate(now);
  const day = beijingDate(savedAt);
  if (day >= today) return "today";
  const monday = addDays(today, -((new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7));
  return day >= monday ? "week" : "earlier";
}

/** The event's developments that first appeared after the star was saved. */
export function developmentsSince(savedAt: string, developments: readonly string[] | undefined): number {
  const saved = Date.parse(savedAt);
  return (developments ?? []).filter((at) => Date.parse(at) > saved).length;
}

export function backupDue(count: number, lastBackup: string | null, now = Date.now()): boolean {
  if (count === 0) return false;
  if (!lastBackup) return count >= BACKUP_DUE_COUNT;
  return now - Date.parse(lastBackup) > BACKUP_DUE_AFTER;
}

/** Every word of the query appears in the title, summary or source name (any case). */
export function matchesQuery(item: Pick<LocalStarredItem, "title" | "summary" | "sourceName">, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const text = `${item.title}\n${item.summary ?? ""}\n${item.sourceName}`.toLowerCase();
  return words.every((w) => text.includes(w));
}
