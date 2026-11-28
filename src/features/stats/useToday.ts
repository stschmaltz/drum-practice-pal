import { useSyncExternalStore } from 'react';
import { keepDateFormatsIn } from './dateLabels';
import { addDays, dayKeyOf, type DayKey } from './days';

/**
 * The longest the page goes without asking what day it is. A timer set for
 * midnight alone is late whenever the clock and the timer part ways: a laptop
 * asleep overnight wakes with its timers where they were and no
 * `visibilitychange`, and a clock put forward moves no timer. A check a
 * minute costs nothing (the page is drawn again only when the day differs).
 */
export const DAY_CHECK_MS = 60_000;

/** How long until the day is asked again: at the next local midnight, or in a minute if that is sooner. Pure. */
export function msUntilNextCheck(now: Date): number {
  // The calendar's next midnight, not 24 hours on (a day the clocks change is 23 or 25).
  return Math.min(addDays(now, 1).getTime() - now.getTime(), DAY_CHECK_MS);
}

/** The device's time zone by name ("America/Edmonton"), as it is set now. */
const deviceTimeZone = (): string => new Intl.DateTimeFormat().resolvedOptions().timeZone;

/**
 * What a redraw is keyed on: the local day, and the zone it is a day of. The
 * zone too, because a change of zone can leave today's date as it was and
 * still move sessions from one day to another (at 20:00 UTC on the 27th, UTC
 * to UTC-7 keeps the 27th and takes a 02:00 UTC session back to the 26th), so
 * totals and streaks counted before it are wrong after (Copilot review on
 * #42). By name, not by offset: two zones an offset apart today can differ on
 * the days sessions were played. A string, so it is equal while nothing moved.
 */
function currentDay(): `${DayKey}@${string}` {
  const zone = deviceTimeZone();
  // Before the redraw this asks for, and before any other render reads it.
  keepDateFormatsIn(zone);
  return `${dayKeyOf(new Date())}@${zone}`;
}

/**
 * Tells `onCheck` whenever the local day or the time zone may have changed: at
 * each midnight, each minute between, and when the page is shown again (a phone unlocked, a
 * tab come back to). Every wait is worked out from the clock as it is then,
 * never from when the last timer was meant to fire, so one that comes early
 * or late, or a clock set forward or back, only moves the next check.
 */
function watchDay(onCheck: () => void): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const arm = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      onCheck();
      arm();
    }, msUntilNextCheck(new Date()));
  };
  const onVisibility = () => {
    onCheck();
    arm();
  };
  arm();
  document.addEventListener('visibilitychange', onVisibility);
  return () => {
    clearTimeout(timer);
    timer = undefined;
    document.removeEventListener('visibilitychange', onVisibility);
  };
}

/**
 * The time now, for a screen that counts in local days ("today", this week, a
 * streak): the component is drawn again when the day changes, so a page left
 * open past midnight doesn't go on showing yesterday's today (17 Review), and
 * when the device's time zone does, which changes what day each session was on.
 * Each render gets the clock as it is, as `new Date()` at render did.
 *
 * The day is an external store (`useSyncExternalStore`), not state set from
 * an effect: React reads it again once subscribed, so a midnight between the
 * render and the subscription isn't missed, and StrictMode's second mount
 * leaves one timer and one listener.
 */
export function useToday(): Date {
  useSyncExternalStore(watchDay, currentDay);
  return new Date();
}
