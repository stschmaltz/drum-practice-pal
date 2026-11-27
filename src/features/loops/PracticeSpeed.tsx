import { ErrorAlert } from '@/components/ErrorAlert';
import { focusRing } from '@/components/styles';
import type { PlayerService, PlayerSnapshot } from '@/features/player/PlayerService';
import { nudgeSpeedRatio, ratioToPercent, SPEED_STEP_PERCENT } from '@/features/player/speed';
import { bpmAtSpeed } from '@/features/player/tempo';
import { failureCopy } from '@/lib/errorCopy';
import type { Loop } from './loopForm';
import { useLoopSpeed } from './useLoopSpeed';
import { fullSpeedLabel } from './mastery';

const roundButtonClass = `inline-flex size-12 shrink-0 items-center justify-center rounded-full border border-line-strong bg-raised text-2xl font-semibold text-ink transition-colors duration-150 hover:bg-raised-hover disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`;

/**
 * The practice screen's speed (Unit 16): the speed in large type with its BPM
 * and how far it is from full speed, and round − and + nudges of 5%. The
 * player plays a nudge at once and the screen saves it to the loop as it
 * happens (`useSaveLoopSpeed`), as in the loop panel (`useLoopSpeed` is shared
 * with `LoopSpeedControl`).
 */
export function PracticeSpeed({
  loop,
  player,
  snapshot,
}: {
  loop: Loop;
  player: PlayerService | null;
  snapshot: PlayerSnapshot;
}) {
  const { saves, canSetSpeed, tempo, ratio, setSpeed } = useLoopSpeed(loop, player, snapshot);
  const percent = ratioToPercent(ratio);

  return (
    // In a short window (`short`, a phone on its side) one row: the nudges and the speed;
    // the words on full speed stay for screen readers.
    <div
      role="group"
      aria-label="Loop speed"
      className="flex flex-col gap-1 short:flex-row short:flex-wrap short:items-center short:gap-x-4"
    >
      <div className="flex items-center gap-3">
        <button
          type="button"
          className={roundButtonClass}
          disabled={!canSetSpeed}
          aria-label={`Slower by ${SPEED_STEP_PERCENT}%`}
          onClick={() => setSpeed(nudgeSpeedRatio(ratio, -SPEED_STEP_PERCENT))}
        >
          −
        </button>
        <p className="flex min-w-0 flex-col items-center tabular-nums">
          <span
            className="text-4xl font-bold leading-none md:text-5xl short:text-3xl"
            data-testid="practice-speed"
          >
            {percent}%
          </span>
          <span className="text-sm text-ink-muted">
            {tempo === null ? '–' : bpmAtSpeed(tempo, ratio)} BPM
          </span>
        </p>
        <button
          type="button"
          className={roundButtonClass}
          disabled={!canSetSpeed}
          aria-label={`Faster by ${SPEED_STEP_PERCENT}%`}
          onClick={() => setSpeed(nudgeSpeedRatio(ratio, SPEED_STEP_PERCENT))}
        >
          +
        </button>
      </div>
      <p className="text-sm text-ink-soft short:sr-only" data-testid="practice-to-full-speed">
        {fullSpeedLabel(percent)}
      </p>
      {saves.waiting && (
        <p role="status" className="text-sm text-ink-muted" data-testid="loop-speed-queued">
          Saved on this device. It's sent when you're back online.
        </p>
      )}
      {saves.error && <ErrorAlert>Couldn't save the speed. {failureCopy(saves.error)}</ErrorAlert>}
    </div>
  );
}
