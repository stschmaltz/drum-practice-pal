/**
 * Copy for a loop's speed, shared by the loop list, the speed control and the
 * loop form. Pure, so the wording is tested once.
 */
import { ratioToPercent } from '@/features/player/speed';
import { bpmAtSpeed } from '@/features/player/tempo';

/**
 * "85% (102 BPM)": the speed and the BPM it gives at `tempo`, the file's
 * tempo at the loop's first bar. Just the percent while the tempo isn't known
 * (the score is still loading).
 */
export function speedLabel(ratio: number, tempo: number | null): string {
  const percent = `${ratioToPercent(ratio)}%`;
  return tempo === null ? percent : `${percent} (${bpmAtSpeed(tempo, ratio)} BPM)`;
}

/** How far a loop's saved speed has come towards its target, as the percents its line shows. */
export interface TargetProgress {
  speedPercent: number;
  targetPercent: number;
  /** The speed's share of the target, 0 to 1: a speed past the target fills the bar. */
  fraction: number;
  /** At or past the target, compared as shown (like `hasReachedTarget`). */
  reached: boolean;
}

/**
 * The home page's progress bar. Worked out from the whole percents on show,
 * never the stored ratios, so a bar never disagrees with the "71% · target
 * 71%" beside it. Null without a target: there is nothing to make progress to.
 */
export function targetProgress(
  speedRatio: number,
  targetRatio: number | null,
): TargetProgress | null {
  if (targetRatio === null) return null;
  const speedPercent = ratioToPercent(speedRatio);
  const targetPercent = ratioToPercent(targetRatio);
  return {
    speedPercent,
    targetPercent,
    fraction: Math.min(speedPercent / targetPercent, 1),
    reached: speedPercent >= targetPercent,
  };
}
