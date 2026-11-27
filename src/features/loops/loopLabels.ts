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
