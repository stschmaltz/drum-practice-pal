/**
 * How the Stats page writes a date: short, in the reader's own locale, with
 * the year only when it isn't this one. Pure; `locale` is for tests, the page
 * leaves it to the browser.
 */

/** "26 Nov"; "26 Nov 2025" for a day in another year than `now`. */
export function shortDate(date: Date, now: Date, locale?: string): string {
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
  }).format(date);
}

/** "Sat 14 Nov": a single day worth naming, with its weekday (punctuated as the locale does). */
export function weekdayDate(date: Date, now: Date, locale?: string): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
  }).format(date);
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
  const format = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    ...(first.getFullYear() === last.getFullYear() ? {} : { year: 'numeric' }),
  });
  return [format.format(first), format.format(last)];
}
