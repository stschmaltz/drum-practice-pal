/**
 * Badges: a fixed list in code, each worked out from the user's sessions and
 * loops with its progress. Pure. Nothing is stored, so a badge is earned for
 * as long as what earned it is there (deleting a loop's history can take a
 * streak badge back).
 */
import { songMastery } from '@/features/loops/mastery';
import { longestStreak } from './streak';
import type { StatsLoop, StatsSession } from './totals';

export type BadgeId =
  | 'streak-3'
  | 'streak-7'
  | 'streak-30'
  | 'hours-1'
  | 'hours-10'
  | 'hours-50'
  | 'passes-100'
  | 'passes-1000'
  | 'mastered-1'
  | 'mastered-5'
  | 'song-mastered';

type Measure = 'streakDays' | 'hours' | 'passes' | 'loopsMastered' | 'songsMastered';

interface BadgeDefinition {
  id: BadgeId;
  label: string;
  measure: Measure;
  target: number;
}

export const BADGES: readonly BadgeDefinition[] = [
  { id: 'streak-3', label: '3-day streak', measure: 'streakDays', target: 3 },
  { id: 'streak-7', label: '7-day streak', measure: 'streakDays', target: 7 },
  { id: 'streak-30', label: '30-day streak', measure: 'streakDays', target: 30 },
  { id: 'hours-1', label: '1 hour practised', measure: 'hours', target: 1 },
  { id: 'hours-10', label: '10 hours practised', measure: 'hours', target: 10 },
  { id: 'hours-50', label: '50 hours practised', measure: 'hours', target: 50 },
  { id: 'passes-100', label: '100 passes', measure: 'passes', target: 100 },
  { id: 'passes-1000', label: '1,000 passes', measure: 'passes', target: 1000 },
  { id: 'mastered-1', label: 'First loop mastered', measure: 'loopsMastered', target: 1 },
  { id: 'mastered-5', label: '5 loops mastered', measure: 'loopsMastered', target: 5 },
  { id: 'song-mastered', label: 'Song mastered', measure: 'songsMastered', target: 1 },
];

export interface BadgeProgress {
  id: BadgeId;
  label: string;
  /** How far along, in the badge's unit, never past the target. */
  current: number;
  target: number;
  earned: boolean;
  /** "2 of 3 days", "36 of 60 min", "Every loop of a song". */
  progressLabel: string;
}

export interface BadgeInput {
  sessions: readonly Pick<StatsSession, 'started_at' | 'duration_seconds' | 'repeats'>[];
  loops: readonly Pick<StatsLoop, 'song_id' | 'status'>[];
}

function measures(input: BadgeInput): Record<Measure, number> {
  const seconds = input.sessions.reduce((total, session) => total + session.duration_seconds, 0);
  const songs = [...songMastery(input.loops).values()];
  return {
    // Longest, not current: a badge once earned isn't lost by a day off.
    streakDays: longestStreak(input.sessions),
    hours: seconds / 3600,
    passes: input.sessions.reduce((total, session) => total + session.repeats, 0),
    loopsMastered: input.loops.filter((loop) => loop.status === 'finished').length,
    songsMastered: songs.filter((song) => song.total > 0 && song.finished === song.total).length,
  };
}

function progressLabel(measure: Measure, current: number, target: number): string {
  switch (measure) {
    case 'streakDays':
      return `${current} of ${target} days in a row`;
    case 'hours':
      // In minutes below the first hour, where "0 of 1 hours" says nothing.
      return target === 1
        ? `${Math.floor(current * 60)} of 60 min`
        : `${Math.floor(current)} of ${target} hours`;
    case 'passes':
      return `${current.toLocaleString('en')} of ${target.toLocaleString('en')} passes`;
    case 'loopsMastered':
      return `${current} of ${target} loops`;
    case 'songsMastered':
      return 'Every loop of one song';
  }
}

export function badgeProgress(input: BadgeInput): BadgeProgress[] {
  const values = measures(input);
  return BADGES.map(({ id, label, measure, target }) => {
    const current = Math.min(values[measure], target);
    return {
      id,
      label,
      current,
      target,
      earned: values[measure] >= target,
      progressLabel: progressLabel(measure, current, target),
    };
  });
}

/** Badges earned in `after` that weren't in `before`: what a session just earned. */
export function newlyEarned(before: BadgeInput, after: BadgeInput): BadgeProgress[] {
  const had = new Set(
    badgeProgress(before)
      .filter((badge) => badge.earned)
      .map((badge) => badge.id),
  );
  return badgeProgress(after).filter((badge) => badge.earned && !had.has(badge.id));
}

/** How many unearned badges "Next up" names. */
export const NEXT_UP_BADGES = 3;

/**
 * The unearned badges closest to done, closest first: by the share of the
 * target reached, and between equals in the list's own order (the smaller
 * target of a kind comes first there). The rest, in list order, are what
 * "Show all badges" opens.
 */
export function nextUpBadges(
  badges: readonly BadgeProgress[],
  count = NEXT_UP_BADGES,
): { nextUp: BadgeProgress[]; rest: BadgeProgress[] } {
  const share = (badge: BadgeProgress) => badge.current / badge.target;
  const unearned = badges.filter((badge) => !badge.earned);
  const nextUp = unearned
    .map((badge, index) => ({ badge, index }))
    .sort((a, b) => share(b.badge) - share(a.badge) || a.index - b.index)
    .slice(0, count)
    .map(({ badge }) => badge);
  return { nextUp, rest: unearned.filter((badge) => !nextUp.includes(badge)) };
}
