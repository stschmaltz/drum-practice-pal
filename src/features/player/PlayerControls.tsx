import { useId, type ReactNode } from 'react';
import { buttonClass, pressedButtonClass, primaryButtonClass } from '@/components/styles';
import {
  METRONOME_VOLUME_MAX,
  METRONOME_VOLUME_MIN,
  SPEED_RATIO_MAX,
  SPEED_RATIO_MIN,
} from '@/lib/schema';
import type { PlayerService, PlayerSnapshot } from './PlayerService';
import { percentToRatio, ratioToPercent, SPEED_STEP_PERCENT } from './speed';

const VOLUME_STEP_PERCENT = 5;

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
  // Unlike Play, options work before the song is ready; they only wait for the player to exist.
  const noPlayer = player === null;

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
        disabled={noPlayer}
        onChange={(ratio) => player?.setSpeed(ratio)}
      />

      <div className="flex flex-wrap items-center gap-2">
        <ToggleButton
          pressed={snapshot.metronomeOn}
          disabled={noPlayer}
          onChange={(on) => player?.setMetronomeOn(on)}
        >
          Metronome
        </ToggleButton>
        <VolumeSlider
          volume={snapshot.metronomeVolume}
          disabled={noPlayer}
          onChange={(volume) => player?.setMetronomeVolume(volume)}
        />
      </div>

      <ToggleButton
        pressed={snapshot.drumsMuted}
        disabled={noPlayer || !snapshot.hasDrumTrack}
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

function VolumeSlider({
  volume,
  disabled,
  onChange,
}: {
  volume: number;
  disabled: boolean;
  onChange: (volume: number) => void;
}) {
  return (
    <PercentSlider
      label="Metronome volume"
      value={ratioToPercent(volume)}
      min={ratioToPercent(METRONOME_VOLUME_MIN)}
      max={ratioToPercent(METRONOME_VOLUME_MAX)}
      step={VOLUME_STEP_PERCENT}
      disabled={disabled}
      onChange={(percent) => onChange(percent / 100)}
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
