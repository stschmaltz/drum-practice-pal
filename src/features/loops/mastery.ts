/**
 * How much of a song is mastered: its finished loops out of all of them.
 * Pure. Derived, never stored, like "in progress" (docs/plan.md, Data model).
 */
import type { Loop } from './loopForm';

export interface Mastery {
  finished: number;
  total: number;
}

const NONE: Mastery = { finished: 0, total: 0 };

/** Each song's mastery, by song id. A song with no loops has no entry. */
export function songMastery(
  loops: readonly Pick<Loop, 'song_id' | 'status'>[],
): Map<string, Mastery> {
  const bySong = new Map<string, Mastery>();
  for (const loop of loops) {
    const counted = bySong.get(loop.song_id) ?? NONE;
    bySong.set(loop.song_id, {
      finished: counted.finished + (loop.status === 'finished' ? 1 : 0),
      total: counted.total + 1,
    });
  }
  return bySong;
}

/** One song's mastery from its own loops. */
export function masteryOf(loops: readonly Pick<Loop, 'status'>[]): Mastery {
  return {
    finished: loops.filter((loop) => loop.status === 'finished').length,
    total: loops.length,
  };
}

/** Every loop is finished (and there is at least one). */
export const isMastered = ({ finished, total }: Mastery) => total > 0 && finished === total;

/** The share of the ring to fill, 0 to 1. */
export const masteryFraction = ({ finished, total }: Mastery) =>
  total === 0 ? 0 : finished / total;

/** The line under a song's name: "No loops yet", "2 of 4 loops mastered", "Mastered". */
export function masteryLine(mastery: Mastery): string {
  if (mastery.total === 0) return 'No loops yet';
  if (isMastered(mastery)) return 'Mastered';
  return `${mastery.finished} of ${mastery.total} ${mastery.total === 1 ? 'loop' : 'loops'} mastered`;
}

/** The song overview's header line: "2 of 4 mastered". */
export function masterySummary({ finished, total }: Mastery): string {
  return `${finished} of ${total} mastered`;
}

/**
 * "8% to full speed", "Full speed", "10% over full speed": a loop's speed
 * against 100%, as the whole percents shown. Full speed is always 100% here
 * (docs/plan.md, Unit 14: no target speed).
 */
export function fullSpeedLabel(percent: number): string {
  if (percent === 100) return 'Full speed';
  return percent < 100 ? `${100 - percent}% to full speed` : `${percent - 100}% over full speed`;
}

/** How full the bar of a speed towards 100% is, 0 to 1: past full speed is a full bar. */
export const fullSpeedFraction = (percent: number) => Math.min(Math.max(percent / 100, 0), 1);
