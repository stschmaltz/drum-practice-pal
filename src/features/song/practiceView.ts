/**
 * What the practice screen draws of the score. Pure, so the edges are tested
 * on their own. Bar numbers are 1-based.
 */
import type { BarRange } from '@/features/player/PlayerService';

/** Bars drawn either side of the loop, so its first bar is read with what leads into it. */
export const LOOP_CONTEXT_BARS = 1;

/**
 * The loop's bars and `LOOP_CONTEXT_BARS` either side, within the song's
 * `barCount` bars: what the practice screen draws until "Show whole song".
 */
export function barsAroundLoop(loop: BarRange, barCount: number): BarRange {
  const last = Math.max(1, barCount);
  return {
    startBar: Math.min(last, Math.max(1, loop.startBar - LOOP_CONTEXT_BARS)),
    endBar: Math.min(last, loop.endBar + LOOP_CONTEXT_BARS),
  };
}
