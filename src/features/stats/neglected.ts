/**
 * "Not practised lately": the active loops left longest, the Stats page's
 * answer to "what have I been neglecting" (Unit 17, QA fix round 1). Pure.
 * It only names them, each with a way to its practice screen: nothing is
 * asked of the user, and a finished loop is never one.
 */
import { daysBetween } from './days';
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
 * calendar days ago or more, the longest left first. A loop never practised
 * counts from the day it was saved, so one saved this week isn't "neglected"
 * before it has had the chance to be practised.
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
      const lastPractised = last === undefined ? null : new Date(last);
      const since = lastPractised ?? new Date(loop.created_at);
      return { loop, lastPractised, days: daysBetween(since, now) };
    })
    .filter((each) => each.days >= NEGLECTED_AFTER_DAYS)
    .sort((a, b) => b.days - a.days || a.loop.id.localeCompare(b.loop.id))
    .slice(0, NEGLECTED_SHOWN);
}

/** "last practised 12 days ago", or "not practised yet, saved 12 days ago". */
export function neglectedLabel({
  days,
  lastPractised,
}: Pick<NeglectedLoop<unknown>, 'days' | 'lastPractised'>): string {
  return lastPractised === null
    ? `not practised yet, saved ${days} days ago`
    : `last practised ${days} days ago`;
}
