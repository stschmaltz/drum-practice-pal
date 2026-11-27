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
