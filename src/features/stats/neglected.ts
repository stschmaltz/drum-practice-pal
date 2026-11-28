/**
 * "Not practised lately": the active loops that have slipped, the Stats
 * page's answer to "what have I been neglecting" (Unit 17, QA fix round 1).
 * Pure. It only names them, each with a way to its practice screen: nothing
 * is asked of the user, and a finished loop is never one.
 */
import { daysBetween } from './days';
import { countLabel } from './statLabels';
import { latestSessionTimes, type StatsLoop, type StatsSession } from './totals';

/** Calendar days without a session before a loop is named. */
export const NEGLECTED_AFTER_DAYS = 7;
/** How many loops the block names. */
export const NEGLECTED_SHOWN = 3;

/** A loop as this needs it. `created_at` dates a loop that has never been practised. */
export type NeglectedInput = Pick<StatsLoop, 'id' | 'status'> & { created_at: string };

export interface NeglectedLoop<L> {
  loop: L;
  /** When its latest session began; null when it has never been practised. */
  lastPractised: Date | null;
  /** Calendar days since that session, or since the loop was saved. */
  days: number;
}

/**
 * Up to three active loops whose last session was `NEGLECTED_AFTER_DAYS`
 * calendar days ago or more, the most recently practised first: the loop that
 * slipped last week is the one a reminder helps, and with the longest left
 * first three loops dropped months ago held the block for good (17 QA after
 * fix round 1, issue 1). A loop never practised counts from the day it was
 * saved, so one saved this week isn't "neglected" before it has had the
 * chance to be practised; those come after every practised loop, the most
 * recently saved first.
 */
export function neglectedLoops<L extends NeglectedInput>(
  sessions: readonly Pick<StatsSession, 'loop_id' | 'started_at'>[],
  loops: readonly L[],
  now: Date,
): NeglectedLoop<L>[] {
  const latest = latestSessionTimes(sessions);
  return loops
    .filter((loop) => loop.status === 'active')
    .map((loop) => {
      const last = latest.get(loop.id);
      // Since when it has been left: its latest session, or its saving.
      const since = last ?? Date.parse(loop.created_at);
      return {
        loop,
        lastPractised: last === undefined ? null : new Date(last),
        since,
        days: daysBetween(new Date(since), now),
      };
    })
    .filter((each) => each.days >= NEGLECTED_AFTER_DAYS)
    .sort(
      (a, b) =>
        Number(a.lastPractised === null) - Number(b.lastPractised === null) ||
        b.since - a.since ||
        a.loop.id.localeCompare(b.loop.id),
    )
    .slice(0, NEGLECTED_SHOWN)
    .map(({ loop, lastPractised, days }) => ({ loop, lastPractised, days }));
}

/** "last practised 12 days ago", or "not practised yet, saved 12 days ago". */
export function neglectedLabel({
  days,
  lastPractised,
}: Pick<NeglectedLoop<unknown>, 'days' | 'lastPractised'>): string {
  return lastPractised === null
    ? `not practised yet, saved ${countLabel(days)} days ago`
    : `last practised ${countLabel(days)} days ago`;
}
