/**
 * Practice streaks. Pure. A streak is a run of consecutive local calendar
 * days with at least one logged session. The current one ends today or
 * yesterday: a drummer who practised every day up to yesterday still has
 * their streak this morning, and loses it only once today has passed too.
 */
import { addDays, dayKeyOf, dayKeyOfIso, nextDayKey, type DayKey } from './days';

type Dated = { started_at: string };

/** Every local day with a session. */
export function practiceDayKeys(sessions: readonly Dated[]): Set<DayKey> {
  return new Set(sessions.map((session) => dayKeyOfIso(session.started_at)));
}

/** Days in the streak running now: 0 when neither today nor yesterday has a session. */
export function currentStreak(sessions: readonly Dated[], now: Date): number {
  const days = practiceDayKeys(sessions);
  let day = days.has(dayKeyOf(now)) ? now : addDays(now, -1);
  let count = 0;
  while (days.has(dayKeyOf(day))) {
    count += 1;
    day = addDays(day, -1);
  }
  return count;
}

/** The longest run of practice days there has ever been. */
export function longestStreak(sessions: readonly Dated[]): number {
  const days = [...practiceDayKeys(sessions)].sort();
  let longest = 0;
  let run = 0;
  let previous: DayKey | null = null;
  for (const day of days) {
    run = previous !== null && nextDayKey(previous) === day ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = day;
  }
  return longest;
}

/** "1 day" / "12 days". */
export function daysLabel(days: number): string {
  return days === 1 ? '1 day' : `${days} days`;
}
