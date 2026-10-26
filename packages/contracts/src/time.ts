// Beijing (Asia/Shanghai, fixed UTC+8, no DST) calendar helpers shared by web and backend.

const OFFSET_MS = 8 * 3600 * 1000;

/** YYYY-MM-DD of the instant in Beijing time. */
export function beijingDate(instant: Date | string | number): string {
  const d = new Date(new Date(instant).getTime() + OFFSET_MS);
  return d.toISOString().slice(0, 10);
}

/** HH:mm of the instant in Beijing time. */
export function beijingTime(instant: Date | string | number): string {
  const d = new Date(new Date(instant).getTime() + OFFSET_MS);
  return d.toISOString().slice(11, 16);
}

/** The instant as ISO 8601 in Beijing time, to the millisecond: "2026-09-26T08:07:13.000+08:00". */
export function beijingIso(instant: Date | string | number): string {
  return `${new Date(new Date(instant).getTime() + OFFSET_MS).toISOString().slice(0, 23)}+08:00`;
}

/**
 * "9月28日" of a calendar date (YYYY-MM-DD). Given `today` (YYYY-MM-DD, Beijing), a day of another year carries its
 * year, so an archived item is not read as this year's: "2019年2月19日".
 */
export function monthDay(date: string, today?: string): string {
  const year = today && date.slice(0, 4) !== today.slice(0, 4) ? `${date.slice(0, 4)}年` : "";
  return `${year}${Number(date.slice(5, 7))}月${Number(date.slice(8, 10))}日`;
}

/** "9月29日" in Beijing time. */
export const beijingDay = (instant: Date | string | number) => monthDay(beijingDate(instant));

/** "9月29日 13:40" in Beijing time. */
export const beijingStamp = (instant: Date | string | number) => `${beijingDay(instant)} ${beijingTime(instant)}`;

/** The zone's name, for whatever takes one (a scheduler, a report's metadata, SQL `AT TIME ZONE`). */
export const BEIJING_TIMEZONE = "Asia/Shanghai" as const;

/** UTC instant of 00:00 Beijing on the given calendar day. */
export function beijingMidnight(date: string): Date {
  return new Date(Date.parse(`${date}T00:00:00+08:00`));
}

/** Last instant (23:59:59.999 Beijing) of the given calendar day: the moment a time-machine slice shows. */
export function beijingDayEnd(date: string): Date {
  return new Date(beijingMidnight(addDays(date, 1)).getTime() - 1);
}

/** UTC instant of an HH:mm Beijing time on the given calendar day. */
export function beijingAt(date: string, time: string): Date {
  return new Date(Date.parse(`${date}T${time}:00+08:00`));
}

export function addDays(date: string, days: number): string {
  const t = Date.parse(`${date}T00:00:00Z`) + days * 86400000;
  return new Date(t).toISOString().slice(0, 10);
}

const WEEKDAYS = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];

export function beijingWeekday(date: string): string {
  return WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()]!;
}

/** ISO week label (e.g. 2026-W38) of a calendar date. */
export function isoWeekLabel(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const day = (d.getUTCDay() + 6) % 7; // Monday = 0
  d.setUTCDate(d.getUTCDate() - day + 3); // Thursday of this week
  const year = d.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(year, 0, 4));
  const firstDay = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDay + 3);
  const week = 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * 86400000));
  return `${year}-W${String(week).padStart(2, "0")}`;
}

/** Monday..Sunday calendar dates of an ISO week label. */
export function isoWeekRange(label: string): { start: string; end: string } | null {
  const m = /^(\d{4})-W(\d{2})$/.exec(label);
  if (!m) return null;
  const year = Number(m[1]);
  const week = Number(m[2]);
  if (week < 1 || week > 53) return null;
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const mondayWeek1 = new Date(jan4);
  mondayWeek1.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() + 6) % 7));
  const start = new Date(mondayWeek1);
  start.setUTCDate(mondayWeek1.getUTCDate() + (week - 1) * 7);
  const startDate = start.toISOString().slice(0, 10);
  if (isoWeekLabel(startDate) !== label) return null;
  return { start: startDate, end: addDays(startDate, 6) };
}

/** First and last day (YYYY-MM-DD) of a calendar month label such as 2026-09; null for anything else. */
export function monthRange(label: string): { start: string; end: string } | null {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(label);
  if (!m) return null;
  const next = Number(m[2]) === 12 ? `${Number(m[1]) + 1}-01-01` : `${m[1]}-${String(Number(m[2]) + 1).padStart(2, "0")}-01`;
  return { start: `${label}-01`, end: addDays(next, -1) };
}

export function isValidDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const t = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === date;
}

/** Formats an instant as RFC 3339 with the +08:00 offset (used by the reset monitor API). */
export function toBeijingIso(instant: Date | string | number): string {
  const d = new Date(new Date(instant).getTime() + OFFSET_MS);
  return `${d.toISOString().slice(0, 19)}+08:00`;
}

// IANA calendar helpers for report operations. The Beijing helpers above deliberately retain
// their historical meaning for time-machine slices and the reset monitor.
const calendars = new Map<string, Intl.DateTimeFormat>();

export function assertTimeZone(timeZone: string): string {
  if (/^[+-]/.test(timeZone)) throw new RangeError("Expected an IANA time zone, not a fixed offset");
  new Intl.DateTimeFormat("en-US", { timeZone }).format(0);
  return timeZone;
}

function calendarParts(instant: Date | string | number, timeZone: string): Record<string, string> {
  let formatter = calendars.get(timeZone);
  if (!formatter) {
    assertTimeZone(timeZone);
    formatter = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
    calendars.set(timeZone, formatter);
  }
  return Object.fromEntries(formatter.formatToParts(new Date(instant)).map(p => [p.type, p.value]));
}

/** Calendar date at an instant in an IANA zone, independent of editorial/UI language. */
export function calendarDate(instant: Date | string | number, timeZone: string): string {
  const p = calendarParts(instant, timeZone);
  return `${p.year}-${p.month}-${p.day}`;
}

/** UTC instant of local midnight; a missing local midnight is rejected rather than shifted. */
export function calendarMidnight(date: string, timeZone: string): Date {
  return zonedDateTime(date, "00:00", timeZone);
}

export const zonedDate = calendarDate;
export const zonedMidnight = calendarMidnight;

/** HH:mm at an instant in an IANA zone. */
export function zonedTime(instant: Date | string | number, timeZone: string): string {
  const p = calendarParts(instant, timeZone);
  return `${p.hour}:${p.minute}`;
}

/** Local wall time to UTC: reject DST gaps; choose the earliest instant in an overlap. */
export function zonedDateTime(date: string, time: string, timeZone: string): Date {
  if (!isValidDate(date)) throw new RangeError("Invalid calendar date");
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new RangeError("Invalid local time; expected HH:mm");
  const [hour, minute] = time.split(":");
  const nominal = Date.parse(`${date}T${time}:00Z`);
  const candidates = new Set<number>();
  // Sample both sides of a transition; convert the requested wall time with each observed offset.
  for (let hours = -36; hours <= 36; hours += 6) {
    const sample = nominal + hours * 3600_000;
    const p = calendarParts(sample, timeZone);
    const offset = Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`) - sample;
    const candidate = nominal - offset;
    const check = calendarParts(candidate, timeZone);
    if (calendarDate(candidate, timeZone) === date && check.hour === hour && check.minute === minute && check.second === "00") candidates.add(candidate);
  }
  if (!candidates.size) throw new RangeError("Local date/time does not exist in this time zone");
  return new Date(Math.min(...candidates));
}

/** End of a local calendar day; DST days may contain 23 or 25 hours. */
export function calendarDayEnd(date: string, timeZone: string): Date {
  if (!isValidDate(date)) throw new RangeError("Invalid calendar date");
  return new Date(calendarMidnight(addDays(date, 1), timeZone).getTime() - 1);
}
