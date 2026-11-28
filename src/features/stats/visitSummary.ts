/**
 * What the song overview's practice summary adds to its sittings: the streak
 * as it stands, and the badges earned since the first sitting began. Pure.
 * The sittings' last session may not have reached the list of every session
 * yet (it joins the cache as it is logged), so the day the sittings began
 * counts towards the streak either way; a badge waits for the list.
 */
import { newlyEarned, type BadgeProgress } from './badges';
import { currentStreak } from './streak';
import type { StatsLoop, StatsSession } from './totals';

export interface VisitSummaryExtras {
  streakDays: number;
  earned: BadgeProgress[];
}

export function visitSummaryExtras(
  /** Wall-clock ms when the first sitting began. */
  beganAt: number,
  sessions: readonly StatsSession[],
  loops: readonly Pick<StatsLoop, 'song_id' | 'status'>[],
  now: Date,
): VisitSummaryExtras {
  const before = sessions.filter((session) => Date.parse(session.started_at) < beganAt);
  const sittingDay = { started_at: new Date(beganAt).toISOString() };
  return {
    streakDays: currentStreak([...sessions, sittingDay], now),
    earned: newlyEarned({ sessions: before, loops }, { sessions, loops }),
  };
}
