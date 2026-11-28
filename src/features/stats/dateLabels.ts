/**
 * How the Stats page writes a date, and the parts of one its charts are
 * marked with: short, in English like the sentences round it (`COPY_LOCALE`,
 * never the browser's own: Unit 20, batch 9), with the year only when it
 * isn't this one. Pure; `locale` is for tests.
 */
import { COPY_LOCALE } from '@/lib/copyLocale';

/**
 * One formatter per locale and shape, kept: building one is slow next to
 * using it, and a heatmap with a year-long chart writes hundreds of dates a
 * render. The key space is tiny (a locale, a handful of shapes). Built on
 * first use, never when the module loads.
 */
const formats = new Map<string, Intl.DateTimeFormat>();

/**
 * Drops the kept formatters. For tests under `inBrowserLocale`: one built by
 * an earlier test in the file was built in that test's locale, and would hide
 * a formatter here that names none (20 batch 9, Test bug 2).
 */
export function forgetDateFormats(): void {
  formats.clear();
}

/** The zone the kept formatters were built in; null until `useToday` first says. */
let formatsZone: string | null = null;

/**
 * Says which time zone the device is in, dropping the kept formatters when it
 * isn't the one they were built in: a formatter keeps the zone the device had
 * when it was made, and after a change would go on writing the old zone's
 * dates (Copilot review on #42). Reading the zone at each date written would
 * cost what keeping formatters saves, so the one reader of it, `useToday`,
 * says here on every render and check, before anything under it writes a date.
 */
export function keepDateFormatsIn(zone: string): void {
  if (zone === formatsZone) return;
  formatsZone = zone;
  formats.clear();
}

function formatOf(
  locale: string,
  shape: string,
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  const key = `${locale}|${shape}`;
  let format = formats.get(key);
  if (!format) {
    format = new Intl.DateTimeFormat(locale, options);
    formats.set(key, format);
  }
  return format;
}

/** Day and short month; the year after them, and the weekday before, only when asked. */
function dayMonthFormat(
  locale: string,
  { year, weekday = false }: { year: boolean; weekday?: boolean },
): Intl.DateTimeFormat {
  return formatOf(locale, `${year}|${weekday}`, {
    ...(weekday ? { weekday: 'short' } : {}),
    day: 'numeric',
    month: 'short',
    ...(year ? { year: 'numeric' } : {}),
  });
}

const inAnotherYear = (date: Date, than: Date) => date.getFullYear() !== than.getFullYear();

/** "Nov 26"; "Nov 26, 2025" for a day in another year than `now`. */
export function shortDate(date: Date, now: Date, locale = COPY_LOCALE): string {
  return dayMonthFormat(locale, { year: inAnotherYear(date, now) }).format(date);
}

/** "Sat, Nov 14": a single day worth naming, with its weekday. */
export function weekdayDate(date: Date, now: Date, locale = COPY_LOCALE): string {
  return dayMonthFormat(locale, { year: inAnotherYear(date, now), weekday: true }).format(date);
}

/** "Nov 3 – Nov 9", or the one date when both ends are the same day. */
export function dateSpan(start: Date, end: Date, now: Date, locale = COPY_LOCALE): string {
  const first = shortDate(start, now, locale);
  const last = shortDate(end, now, locale);
  return first === last ? first : `${first} – ${last}`;
}

/**
 * The two dates under a loop's chart, its first and last practice day: each
 * with its year only when the two are in different years (17 QA issue 1: a
 * first date with its year ran under the next one). Within one year neither
 * needs it: the two only place the line between them.
 */
export function axisDates(first: Date, last: Date, locale = COPY_LOCALE): [string, string] {
  const format = dayMonthFormat(locale, { year: inAnotherYear(first, last) });
  return [format.format(first), format.format(last)];
}

/** A weekday as one letter ("M"): under a day's bar, beside a row of the heatmap. */
export function narrowWeekday(date: Date): string {
  return formatOf(COPY_LOCALE, 'weekday', { weekday: 'narrow' }).format(date);
}

/** A month's short name ("Nov"): over the heatmap's column where it begins. */
export function shortMonth(date: Date): string {
  return formatOf(COPY_LOCALE, 'month', { month: 'short' }).format(date);
}

/** The day of the month ("26"): under a day's bar, so the bar can be put to a date. */
export function dayOfMonth(date: Date): string {
  return formatOf(COPY_LOCALE, 'day', { day: 'numeric' }).format(date);
}
