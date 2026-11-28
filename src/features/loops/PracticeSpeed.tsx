import { useEffect, useRef, type ReactNode } from 'react';
import { ErrorAlert } from '@/components/ErrorAlert';
import { Icon } from '@/components/icons';
import { ProgressBar } from '@/components/ProgressMarks';
import { focusRing, inputClass } from '@/components/styles';
import type { SpeedGate } from '@/features/player/controlGates';
import type { PlayerService, PlayerSnapshot } from '@/features/player/PlayerService';
import {
  nudgeSpeedBpm,
  nudgeSpeedRatio,
  parseSpeedBpm,
  parseSpeedPercent,
  ratioToPercent,
  SPEED_STEP_PERCENT,
} from '@/features/player/speed';
import { bpmAtSpeed } from '@/features/player/tempo';
import { failureCopy } from '@/lib/errorCopy';
import type { Loop } from './loopForm';
import { useLoopSpeed } from './useLoopSpeed';
import { useTypedValue } from './useTypedValue';
import { fullSpeedFraction, fullSpeedLabel } from './mastery';

/** The stepper's ±5% ends: its own rounded ends, the full height of the pill. */
const endButtonClass = `inline-flex w-14 shrink-0 flex-col items-center justify-center self-stretch rounded-full text-ink transition-colors duration-150 hover:bg-raised-hover disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`;
/** The ±1 BPM steps beside the BPM: quiet text, still a 44 px target. */
const bpmStepClass = `inline-flex min-h-touch min-w-touch items-center justify-center rounded-full text-xs font-semibold text-ink-muted tabular-nums transition-colors duration-150 hover:bg-raised-hover hover:text-ink disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`;
/** The two values, tapped to type: on the pill's fill, so they light up a step above it. */
const valueButtonClass = 'hover:bg-raised-hover';

/** The BPM steps, in BPM. */
const BPM_STEP = 1;

/**
 * The practice screen's speed (Unit 16), as one stepper: a pill whose ends
 * nudge by 5%, holding the speed in large type over its BPM, each typed
 * exactly by tapping it, with quiet steps of 1 BPM either side of the BPM.
 * Under it, a thin bar of the way to full speed (the overview rows' mark),
 * its words for screen readers. The player plays a change at once and the
 * screen saves it to the loop as it happens (`useSaveLoopSpeed`), as in the
 * loop panel (`useLoopSpeed` is shared with `LoopSpeedControl`). A BPM,
 * stepped or typed, is saved as the exact ratio it implies (`bpmToRatio`).
 * In a short window (`short`, a phone on its side) the BPM sits beside the
 * percent, so the pill is one 44 px row.
 */
export function PracticeSpeed({
  loop,
  player,
  snapshot,
  gate,
}: {
  loop: Loop;
  player: PlayerService | null;
  snapshot: PlayerSnapshot;
  /** When the speed can be changed; the screen's speed keys go by the same one. */
  gate: SpeedGate;
}) {
  const { saves, canSetSpeed, tempo, ratio, setSpeed } = useLoopSpeed(loop, player, snapshot, gate);
  const percent = ratioToPercent(ratio);
  const bpm = tempo === null ? null : bpmAtSpeed(tempo, ratio);
  const bpmOff = !canSetSpeed || tempo === null;
  const stepBpm = (delta: number) =>
    setSpeed(tempo === null ? null : nudgeSpeedBpm(ratio, tempo, delta));

  return (
    <div role="group" aria-label="Loop speed" className="flex flex-col items-stretch gap-1.5">
      <div className="flex items-stretch rounded-full border border-line bg-raised p-1">
        <button
          type="button"
          className={endButtonClass}
          disabled={!canSetSpeed}
          aria-label={`Slower by ${SPEED_STEP_PERCENT}%`}
          onClick={() => setSpeed(nudgeSpeedRatio(ratio, -SPEED_STEP_PERCENT))}
        >
          <Icon name="minus" />
          <span className="text-xs text-ink-muted">{SPEED_STEP_PERCENT}%</span>
        </button>
        <div className="flex min-w-28 flex-col items-center justify-center short:flex-row short:gap-1">
          <TapToType
            label="Speed %"
            tapLabel={`Type a speed, now ${percent}%`}
            shown={String(percent)}
            disabled={!canSetSpeed}
            className={valueButtonClass}
            inputClassName="w-20 text-2xl font-bold"
            onCommit={(text) => setSpeed(parseSpeedPercent(text))}
          >
            <span
              className="text-3xl font-bold leading-none short:text-2xl"
              data-testid="practice-speed"
            >
              {percent}%
            </span>
          </TapToType>
          <div className="flex items-center">
            <button
              type="button"
              className={bpmStepClass}
              disabled={bpmOff}
              aria-label={`Slower by ${BPM_STEP} BPM`}
              onClick={() => stepBpm(-BPM_STEP)}
            >
              −{BPM_STEP}
            </button>
            <TapToType
              label="BPM"
              tapLabel={`Type a BPM, now ${bpm ?? 'unknown'}`}
              shown={bpm === null ? '' : String(bpm)}
              disabled={bpmOff}
              className={valueButtonClass}
              inputClassName="w-20 text-base font-semibold"
              onCommit={(text) => setSpeed(tempo === null ? null : parseSpeedBpm(text, tempo))}
            >
              <span className="text-sm leading-none text-ink-soft" data-testid="practice-bpm">
                {bpm ?? '–'} BPM
              </span>
            </TapToType>
            <button
              type="button"
              className={bpmStepClass}
              disabled={bpmOff}
              aria-label={`Faster by ${BPM_STEP} BPM`}
              onClick={() => stepBpm(BPM_STEP)}
            >
              +{BPM_STEP}
            </button>
          </div>
        </div>
        <button
          type="button"
          className={endButtonClass}
          disabled={!canSetSpeed}
          aria-label={`Faster by ${SPEED_STEP_PERCENT}%`}
          onClick={() => setSpeed(nudgeSpeedRatio(ratio, SPEED_STEP_PERCENT))}
        >
          <Icon name="plus" />
          <span className="text-xs text-ink-muted">{SPEED_STEP_PERCENT}%</span>
        </button>
      </div>
      <ProgressBar fraction={fullSpeedFraction(percent)} className="mx-8" />
      <p className="sr-only" data-testid="practice-to-full-speed">
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

/**
 * A value on show that becomes a field when tapped: type, then Enter or leave
 * the field to set it, Escape to keep it. Enter and Escape put focus back on
 * the value. Text left as it was shown sets nothing, so a ratio shown rounded
 * (70.8333% as 71%) isn't rewritten as the rounded one by a look.
 */
function TapToType({
  label,
  tapLabel,
  shown,
  disabled,
  className = '',
  inputClassName,
  onCommit,
  children,
}: {
  /** The field's name while typing. */
  label: string;
  /** The value's name as a button: what a tap does, and the value now. */
  tapLabel: string;
  /** The value as text, what the field starts with. */
  shown: string;
  disabled: boolean;
  /** More classes for the value as a button. */
  className?: string;
  inputClassName: string;
  onCommit: (text: string) => void;
  children: ReactNode;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const refocus = useRef(false);
  const { typed, change, commit, onKeyDown } = useTypedValue(
    (text) => {
      if (text.trim() !== shown) onCommit(text);
    },
    () => {
      refocus.current = true;
    },
  );
  const typing = typed !== null;

  useEffect(() => {
    if (typing || !refocus.current) return;
    refocus.current = false;
    buttonRef.current?.focus();
  }, [typing]);

  if (typing) {
    return (
      <input
        aria-label={label}
        className={`${inputClass} text-center tabular-nums ${inputClassName}`}
        inputMode="decimal"
        autoComplete="off"
        // The tap that put the field here asked to type in it.
        autoFocus
        onFocus={(event) => event.target.select()}
        value={typed}
        onChange={(event) => change(event.target.value)}
        onBlur={commit}
        onKeyDown={onKeyDown}
      />
    );
  }
  return (
    <button
      ref={buttonRef}
      type="button"
      aria-label={tapLabel}
      disabled={disabled}
      className={`flex min-h-touch min-w-touch flex-col items-center justify-center rounded-full px-2 tabular-nums transition-colors duration-150 disabled:cursor-not-allowed ${focusRing} ${className}`}
      onClick={() => change(shown)}
    >
      {children}
    </button>
  );
}
