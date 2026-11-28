/**
 * How the Stats page writes a play time and a count: one writer each, so a
 * total, its bar, its caption and its table row always agree. Pure.
 */
import { STATS_LOCALE } from './statsLocale';

/**
 * A count as the page writes it: grouped from a thousand up, the English way
 * ("1,100"), whatever the browser's locale, since the words beside it are
 * English. The one formatter of every whole number on the page that can
 * reach a thousand (Unit 20, batch 9: "1,100" days stood beside "1100 h" and
 * a "1100-day streak"): a total and the line under it, days, hours, a bar's
 * minutes. `locale` is for tests.
 */
export function countLabel(value: number, locale = STATS_LOCALE): string {
  return value.toLocaleString(locale);
}

/** "1 day" / "12 days" / "1,100 days". */
export function daysLabel(days: number): string {
  return days === 1 ? '1 day' : `${countLabel(days)} days`;
}

/** "3-day" / "1,100-day": a count of days before what it measures ("On a 3-day streak"). */
export function dayCountAdjective(days: number): string {
  return `${countLabel(days)}-day`;
}

/** "4:12" for minutes and seconds, "1:04:12" from an hour up: the practice screen's live time. */
export function clockLabel(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = String(seconds % 60).padStart(2, '0');
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}` : `${minutes}:${rest}`;
}

/** Play time in whole minutes, as `minutesLabel` shows it: what two play times are compared by. */
export const wholeMinutes = (totalSeconds: number) => Math.floor(Math.max(0, totalSeconds) / 60);

/**
 * "45 min", "2 h 5 min", "1,100 h": play time to the minute, wherever the Stats page
 * writes one. Under a minute is "<1 min" and only no time at all is "0 min"
 * (17 QA issue 2: a 45-second session read "0 min" beside "1 day").
 */
export function minutesLabel(totalSeconds: number): string {
  if (totalSeconds > 0 && totalSeconds < 60) return '<1 min';
  const minutes = wholeMinutes(totalSeconds);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${minutes} min`;
  return rest === 0 ? `${countLabel(hours)} h` : `${countLabel(hours)} h ${rest} min`;
}

/**
 * The number over a day's bar: its minutes with no unit, since the chart
 * counts in minutes ("12", "75", "<1"). The same rounding as `minutesLabel`,
 * so a bar and its row in the table agree.
 */
export function barMinutesLabel(totalSeconds: number): string {
  return totalSeconds > 0 && totalSeconds < 60 ? '<1' : countLabel(wholeMinutes(totalSeconds));
}
