import { ErrorAlert } from '@/components/ErrorAlert';
import { focusRing, ghostButtonClass } from '@/components/styles';
import type { PlayerService, PlayerSnapshot } from '@/features/player/PlayerService';
import { nudgeSpeedRatio, ratioToPercent, SPEED_STEP_PERCENT } from '@/features/player/speed';
import { bpmAtSpeed } from '@/features/player/tempo';
import { failureCopy } from '@/lib/errorCopy';
import type { Loop } from './loopForm';
import { speedLabel } from './loopLabels';
import { useLoopSpeed } from './useLoopSpeed';
import { fullSpeedLabel } from './mastery';

const roundButtonClass = `inline-flex size-12 shrink-0 items-center justify-center rounded-full border border-line-strong bg-raised text-2xl font-semibold text-ink transition-colors duration-150 hover:bg-raised-hover disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`;

/**
 * The practice screen's speed (Unit 14): the speed in large type with its BPM
 * and how far it is from full speed, round − and + nudges of 5%, and "Save
 * speed". The player plays a nudge at once; the loop keeps it only on Save,
 * as in the loop panel (`useLoopSpeed` is shared with `LoopSpeedControl`).
 */
export function PracticeSpeed({
  songId,
  loop,
  player,
  snapshot,
}: {
  songId: string;
  loop: Loop;
  player: PlayerService | null;
  snapshot: PlayerSnapshot;
}) {
  const { update, online, canSetSpeed, sending, tempo, ratio, unsaved, setSpeed, save } =
    useLoopSpeed(songId, loop, player, snapshot);
  const percent = ratioToPercent(ratio);

  return (
    <div role="group" aria-label="Loop speed" className="flex flex-col gap-1">
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
            className="text-4xl font-bold leading-none md:text-5xl"
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
      <p className="text-sm text-ink-soft" data-testid="practice-to-full-speed">
        {fullSpeedLabel(percent)}
      </p>
      <div className="flex flex-wrap items-center gap-x-3">
        <button
          type="button"
          className={`${ghostButtonClass} -ml-4`}
          disabled={!unsaved || sending}
          onClick={save}
        >
          Save speed
        </button>
        <p className="text-sm text-ink-muted" data-testid="loop-saved-speed">
          Saved: {speedLabel(loop.speed_ratio, tempo)}
        </p>
      </div>
      {update.isPending && !online && (
        <p role="status" className="text-sm text-ink-muted" data-testid="loop-speed-queued">
          Saved on this device. It's sent when you're back online.
        </p>
      )}
      {update.isError && (
        <ErrorAlert>Couldn't save the speed. {failureCopy(update.error)}</ErrorAlert>
      )}
    </div>
  );
}
