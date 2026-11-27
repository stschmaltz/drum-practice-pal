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

export interface StreakRun {
  days: number;
  /** Its first and last day. */
  start: DayKey;
  end: DayKey;
}

/**
 * The longest run of practice days there has ever been, with when it was;
 * null with no sessions. Of two runs as long, the earlier: a record stands
 * until it is beaten.
 */
export function longestStreakRun(sessions: readonly Dated[]): StreakRun | null {
  const days = [...practiceDayKeys(sessions)].sort();
  let longest: StreakRun | null = null;
  let run: StreakRun | null = null;
  for (const day of days) {
    run =
      run !== null && nextDayKey(run.end) === day
        ? { days: run.days + 1, start: run.start, end: day }
        : { days: 1, start: day, end: day };
    if (longest === null || run.days > longest.days) longest = run;
  }
  return longest;
}

/** How many days the longest run of practice days lasted. */
export function longestStreak(sessions: readonly Dated[]): number {
  return longestStreakRun(sessions)?.days ?? 0;
}
