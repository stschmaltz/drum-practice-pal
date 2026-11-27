/**
 * Records: the bests the Stats page lists (Unit 17). Pure, all time. A record
 * stands until it is beaten, so a tie stays with the earlier day or session.
 */
import { dateOfDayKey } from './days';
import { longestStreakRun } from './streak';
import { secondsByDay, type StatsSession } from './totals';

export interface PracticeRecords {
  /** The longest run of practice days, with its first and last day; null with no sessions. */
  longestStreak: { days: number; start: Date; end: Date } | null;
  /** The local day with the most play time. */
  bestDay: { date: Date; seconds: number } | null;
  /** The longest single session, and the loop it was on. */
  longestSession: { startedAt: Date; seconds: number; loopId: string } | null;
}

export function practiceRecords(sessions: readonly StatsSession[]): PracticeRecords {
  const run = longestStreakRun(sessions);

  let bestDay: PracticeRecords['bestDay'] = null;
  // Day keys sort in date order, so the earlier of two equal days is met first and kept.
  for (const [key, seconds] of [...secondsByDay(sessions)].sort(([a], [b]) => a.localeCompare(b))) {
    if (seconds > 0 && (bestDay === null || seconds > bestDay.seconds)) {
      bestDay = { date: dateOfDayKey(key), seconds };
    }
  }

  let longest: StatsSession | null = null;
  for (const session of sessions) {
    if (session.duration_seconds <= 0) continue;
    const earlier =
      longest !== null &&
      (Date.parse(session.started_at) < Date.parse(longest.started_at) ||
        (session.started_at === longest.started_at && session.id < longest.id));
    if (
      longest === null ||
      session.duration_seconds > longest.duration_seconds ||
      (session.duration_seconds === longest.duration_seconds && earlier)
    ) {
      longest = session;
    }
  }

  return {
    longestStreak:
      run === null
        ? null
        : { days: run.days, start: dateOfDayKey(run.start), end: dateOfDayKey(run.end) },
    bestDay,
    longestSession:
      longest === null
        ? null
        : {
            startedAt: new Date(longest.started_at),
            seconds: longest.duration_seconds,
            loopId: longest.loop_id,
          },
  };
}
