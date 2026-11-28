/**
 * Copy for a loop's speed, shared by the loop list, the speed control and the
 * loop form, and for a refused status change, shared by the three places that
 * say it. Pure, so the wording is tested once.
 */
import { ratioToPercent } from '@/features/player/speed';
import { bpmAtSpeed } from '@/features/player/tempo';
import type { LoopStatus } from '@/lib/schema';

/**
 * What a refused "Mark finished" or "Reopen" says first, before the reason
 * (`failureCopy`). By what the refused change asked for, not by the list the
 * loop is in: the refusal can be drawn a moment before the loop has moved back.
 */
export function statusRefusalCopy(asked: LoopStatus): string {
  return asked === 'finished' ? "Couldn't mark the loop finished." : "Couldn't reopen the loop.";
}

/**
 * "85% (102 BPM)": the speed and the BPM it gives at `tempo`, the file's
 * tempo at the loop's first bar. Just the percent while the tempo isn't known
 * (the score is still loading).
 */
export function speedLabel(ratio: number, tempo: number | null): string {
  const percent = `${ratioToPercent(ratio)}%`;
  return tempo === null ? percent : `${percent} (${bpmAtSpeed(tempo, ratio)} BPM)`;
}
