import { useId, useState, type KeyboardEvent } from 'react';
import { ErrorAlert } from '@/components/ErrorAlert';
import { buttonClass, inputClass, labelClass, primaryButtonClass } from '@/components/styles';
import { canChangeOptions } from '@/features/player/controlGates';
import type { PlayerService, PlayerSnapshot } from '@/features/player/PlayerService';
import {
  nudgeSpeedRatio,
  parseSpeedBpm,
  parseSpeedPercent,
  ratioToPercent,
} from '@/features/player/speed';
import { bpmAtSpeed } from '@/features/player/tempo';
import { useOnline } from '@/lib/network';
import type { Loop } from './loopForm';
import { LOOP_SPEED_ATTRIBUTES } from './loopFocus';
import { speedLabel } from './loopLabels';
import { useUpdateLoop } from './useLoops';
import { failureCopy } from '@/lib/errorCopy';

/** The nudge buttons, in percent. */
const NUDGES = [-5, -1, 1, 5] as const;

/**
 * The playing loop's speed as % and BPM, each editable, with nudge buttons.
 * Changes go to the player at once and to the loop only on "Save speed". BPM
 * is the speed times the tempo at the loop's first bar, never stored; a typed
 * BPM sets the exact ratio it implies.
 */
export function LoopSpeedControl({
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
  const update = useUpdateLoop(songId);
  const online = useOnline();
  const canSetSpeed = canChangeOptions(player, snapshot);
  // Offline a save waits for the connection; another may be saved behind it (loop edits
  // go in order). One that is being sent locks the button, so two never race.
  const sending = update.isPending && !update.isPaused;
  // Null until the score has loaded; the BPM field waits for it.
  const tempo = player?.tempoAtBar(loop.start_bar) ?? null;
  const ratio = snapshot.speedRatio;
  const unsaved = ratio !== loop.speed_ratio;

  const setSpeed = (next: number | null) => {
    if (next === null || !canChangeOptions(player, snapshot)) return;
    // A failed save's message is about the old speed. Not while one is in flight:
    // reset() would forget it, and Save speed would be offered again alongside it.
    if (update.isError) update.reset();
    player.setSpeed(next);
  };

  return (
    <div
      role="group"
      aria-label="Loop speed"
      // Focus lands here from the controls bar's "Loop speed"; not a field, or a phone's keyboard comes up.
      tabIndex={-1}
      {...LOOP_SPEED_ATTRIBUTES}
      className="flex flex-col gap-2 rounded-control focus:outline-none"
    >
      <div className="flex flex-wrap items-end gap-2">
        <CommitField
          label="Speed %"
          value={String(ratioToPercent(ratio))}
          disabled={!canSetSpeed}
          onCommit={(text) => setSpeed(parseSpeedPercent(text))}
        />
        <CommitField
          label="BPM"
          value={tempo === null ? '' : String(bpmAtSpeed(tempo, ratio))}
          disabled={!canSetSpeed || tempo === null}
          onCommit={(text) => setSpeed(tempo === null ? null : parseSpeedBpm(text, tempo))}
        />
      </div>
      {/* One even row, in the sheet and in the column: never three buttons and a stray fourth. */}
      <div className="grid grid-cols-4 gap-2">
        {NUDGES.map((delta) => (
          <button
            key={delta}
            type="button"
            className={`${buttonClass} px-2 tabular-nums`}
            disabled={!canSetSpeed}
            aria-label={`${delta < 0 ? 'Slower' : 'Faster'} by ${Math.abs(delta)}%`}
            onClick={() => setSpeed(nudgeSpeedRatio(ratio, delta))}
          >
            {delta < 0 ? '−' : '+'}
            {Math.abs(delta)}%
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <button
          type="button"
          className={primaryButtonClass}
          disabled={!unsaved || sending}
          onClick={() => update.mutate({ loopId: loop.id, changes: { speed_ratio: ratio } })}
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

/**
 * A text field that shows `value` and reports what was typed when the user
 * leaves it or presses Enter (Escape puts the value back). Committing per
 * keystroke would turn "8" on the way to "85" into the slowest speed.
 */
function CommitField({
  label,
  value,
  disabled,
  onCommit,
}: {
  label: string;
  value: string;
  disabled: boolean;
  onCommit: (text: string) => void;
}) {
  const id = useId();
  // What is being typed; null shows the current value.
  const [typed, setTyped] = useState<string | null>(null);

  const commit = () => {
    if (typed === null) return;
    setTyped(null);
    onCommit(typed);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') commit();
    if (event.key === 'Escape') setTyped(null);
  };

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <input
        id={id}
        className={`${inputClass} w-24 text-lg font-semibold tabular-nums disabled:opacity-50`}
        inputMode="decimal"
        autoComplete="off"
        value={typed ?? value}
        disabled={disabled}
        onChange={(event) => setTyped(event.target.value)}
        onBlur={commit}
        onKeyDown={onKeyDown}
      />
    </div>
  );
}
