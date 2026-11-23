import { useId, type ReactNode } from 'react';
import { buttonClass, pressedButtonClass, primaryButtonClass } from '@/components/styles';
import { SPEED_RATIO_MAX, SPEED_RATIO_MIN } from '@/lib/schema';
import type { PlayerService, PlayerSnapshot } from './PlayerService';
import { percentToRatio, ratioToPercent, SPEED_STEP_PERCENT } from './speed';

interface PlayerControlsProps {
  /** Null while alphaTab loads; the controls show the snapshot but do nothing. */
  player: PlayerService | null;
  snapshot: PlayerSnapshot;
}

/**
 * The shared controls bar: play/pause, back to start, speed, metronome and
 * drum mute. Every change is live; none restarts playback.
 */
export function PlayerControls({ player, snapshot }: PlayerControlsProps) {
  const playing = snapshot.status === 'playing';
  const canPlay = player !== null && (snapshot.status === 'ready' || playing);

  return (
    <section
      aria-label="Player controls"
      className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-lg border border-neutral-800 bg-neutral-900/60 p-3"
    >
      <div className="flex gap-2">
        <button
          type="button"
          className={`${primaryButtonClass} min-w-24`}
          disabled={!canPlay}
          // No await before this: iOS only starts audio inside the tap itself.
          onClick={() => player?.togglePlay()}
        >
          {playing ? 'Pause' : 'Play'}
        </button>
        <button
          type="button"
          className={buttonClass}
          disabled={!canPlay}
          onClick={() => player?.stop()}
        >
          Back to start
        </button>
      </div>

      <SpeedSlider
        speedRatio={snapshot.speedRatio}
        disabled={player === null}
        onChange={(ratio) => player?.setSpeed(ratio)}
      />

      <div className="flex flex-wrap items-center gap-2">
        <ToggleButton
          pressed={snapshot.metronomeOn}
          disabled={player === null}
          onChange={(on) => player?.setMetronomeOn(on)}
        >
          Metronome
        </ToggleButton>
        <PercentSlider
          label="Metronome volume"
          value={Math.round(snapshot.metronomeVolume * 100)}
          min={0}
          max={100}
          step={5}
          disabled={player === null}
          onChange={(percent) => player?.setMetronomeVolume(percent / 100)}
        />
      </div>

      <ToggleButton
        pressed={snapshot.drumsMuted}
        disabled={player === null || !snapshot.hasDrumTrack}
        onChange={(muted) => player?.setDrumsMuted(muted)}
        title={snapshot.hasDrumTrack ? undefined : 'This song has no drum track'}
      >
        Mute drums
      </ToggleButton>
    </section>
  );
}

function SpeedSlider({
  speedRatio,
  disabled,
  onChange,
}: {
  speedRatio: number;
  disabled: boolean;
  onChange: (ratio: number) => void;
}) {
  return (
    <PercentSlider
      label="Speed"
      value={ratioToPercent(speedRatio)}
      min={ratioToPercent(SPEED_RATIO_MIN)}
      max={ratioToPercent(SPEED_RATIO_MAX)}
      step={SPEED_STEP_PERCENT}
      disabled={disabled}
      onChange={(percent) => onChange(percentToRatio(percent))}
    />
  );
}

function PercentSlider({
  label,
  value,
  min,
  max,
  step,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  disabled: boolean;
  onChange: (percent: number) => void;
}) {
  const id = useId();
  return (
    <div className="flex min-h-11 items-center gap-2 text-sm">
      <label htmlFor={id} className="whitespace-nowrap text-neutral-300">
        {label}
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-valuetext={`${value}%`}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-28 accent-sky-500 sm:w-36"
      />
      <output htmlFor={id} className="w-11 text-right tabular-nums">
        {value}%
      </output>
    </div>
  );
}

function ToggleButton({
  pressed,
  disabled,
  onChange,
  title,
  children,
}: {
  pressed: boolean;
  disabled: boolean;
  onChange: (pressed: boolean) => void;
  title?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      disabled={disabled}
      title={title}
      onClick={() => onChange(!pressed)}
      className={pressed ? pressedButtonClass : buttonClass}
    >
      {children}
    </button>
  );
}
