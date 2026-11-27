/**
 * What the Session complete summary adds to the session itself: the streak
 * it leaves and the badges it just earned. Pure. The session may or may not
 * be in the list of every session yet (it joins the cache as it is logged),
 * so it is taken out and put back in once either way.
 */
import { newlyEarned, type BadgeProgress } from './badges';
import { currentStreak } from './streak';
import type { StatsLoop, StatsSession } from './totals';

export interface SummaryExtras {
  streakDays: number;
  earned: BadgeProgress[];
}

export function sessionSummaryExtras(
  session: StatsSession,
  sessions: readonly StatsSession[],
  loops: readonly Pick<StatsLoop, 'song_id' | 'status'>[],
  now: Date,
): SummaryExtras {
  const before = sessions.filter((other) => other.id !== session.id);
  const after = [...before, session];
  return {
    streakDays: currentStreak(after, now),
    earned: newlyEarned({ sessions: before, loops }, { sessions: after, loops }),
  };
}
