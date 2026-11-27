/**
 * Local calendar days, the unit every streak, total and chart counts in.
 * Pure. Days are the device's: a session at 23:50 counts for that evening,
 * wherever the server's clock is. Days are stepped with the calendar
 * (`new Date(y, m, d + n)`), never by adding 24 hours, so a change to or from
 * summer time doesn't skip or repeat a day.
 */

/** A local day as "2026-11-26". Sorts as text in date order. */
export type DayKey = string;

const pad = (value: number) => String(value).padStart(2, '0');

export function dayKeyOf(date: Date): DayKey {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** The local day a timestamp from the database falls on. */
export function dayKeyOfIso(iso: string): DayKey {
  return dayKeyOf(new Date(iso));
}

/** Midnight, local time, at the start of the date's day. */
export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** The same local day `days` later (or earlier, for a negative count), at midnight. */
export function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/**
 * Calendar days from one date's day to another's (negative when `to` is the
 * earlier): counted on the calendar, so a 23- or 25-hour day is still one.
 */
export function daysBetween(from: Date, to: Date): number {
  const dayNumber = (date: Date) =>
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000;
  return Math.round(dayNumber(to) - dayNumber(from));
}

/** Midnight at the start of a day key's day. */
export function dateOfDayKey(key: DayKey): Date {
  const [year = 0, month = 1, day = 1] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/** The key of the day after. */
export function nextDayKey(key: DayKey): DayKey {
  return dayKeyOf(addDays(dateOfDayKey(key), 1));
}
