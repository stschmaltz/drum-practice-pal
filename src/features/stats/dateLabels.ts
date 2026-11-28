/**
 * How the Stats page writes a date: short, in the reader's own locale, with
 * the year only when it isn't this one. Pure; `locale` is for tests, the page
 * leaves it to the browser.
 */

/**
 * One formatter per locale and shape, kept: building one is slow next to
 * using it, and a heatmap with a year-long chart writes hundreds of dates a
 * render. The key space is tiny (a locale or none, two flags).
 */
const formats = new Map<string, Intl.DateTimeFormat>();

/** Day and short month; the year after them, and the weekday before, only when asked. */
function dayMonthFormat(
  locale: string | undefined,
  { year, weekday = false }: { year: boolean; weekday?: boolean },
): Intl.DateTimeFormat {
  const key = `${locale ?? ''}|${year}|${weekday}`;
  let format = formats.get(key);
  if (!format) {
    format = new Intl.DateTimeFormat(locale, {
      ...(weekday ? { weekday: 'short' } : {}),
      day: 'numeric',
      month: 'short',
      ...(year ? { year: 'numeric' } : {}),
    });
    formats.set(key, format);
  }
  return format;
}

const inAnotherYear = (date: Date, than: Date) => date.getFullYear() !== than.getFullYear();

/** "26 Nov"; "26 Nov 2025" for a day in another year than `now`. */
export function shortDate(date: Date, now: Date, locale?: string): string {
  return dayMonthFormat(locale, { year: inAnotherYear(date, now) }).format(date);
}

/** "Sat 14 Nov": a single day worth naming, with its weekday (punctuated as the locale does). */
export function weekdayDate(date: Date, now: Date, locale?: string): string {
  return dayMonthFormat(locale, { year: inAnotherYear(date, now), weekday: true }).format(date);
}

/** "3 Nov – 9 Nov", or the one date when both ends are the same day. */
export function dateSpan(start: Date, end: Date, now: Date, locale?: string): string {
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
export function axisDates(first: Date, last: Date, locale?: string): [string, string] {
  const format = dayMonthFormat(locale, { year: inAnotherYear(first, last) });
  return [format.format(first), format.format(last)];
}
