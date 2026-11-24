import { useId, type ReactNode } from 'react';
import {
  buttonClass,
  pressedButtonClass,
  primaryButtonClass,
  selectClass,
} from '@/components/styles';
import {
  COUNT_IN_BAR_OPTIONS,
  COUNT_IN_MODES,
  isCountInBars,
  isCountInMode,
  METRONOME_VOLUME_MAX,
  METRONOME_VOLUME_MIN,
  SPEED_RATIO_MAX,
  SPEED_RATIO_MIN,
  type CountInBars,
  type CountInMode,
} from '@/lib/schema';
import { COUNT_IN_BARS_LABELS, COUNT_IN_MODE_LABELS } from './countInLabels';
import { canChangeOptions, canPlay, canUseDrumToggles } from './controlGates';
import { isRunning, type PlayerService, type PlayerSnapshot } from './PlayerService';
import { percentToRatio, ratioToPercent, SPEED_STEP_PERCENT } from './speed';

const VOLUME_STEP_PERCENT = 5;

interface PlayerViewProps {
  /** Null while alphaTab loads; the controls show the snapshot but do nothing. */
  player: PlayerService | null;
  snapshot: PlayerSnapshot;
}

interface PlayerControlsProps extends PlayerViewProps {
  /**
   * False when the screen shows `PlayPauseButton` elsewhere, such as a sticky
   * bar that stays on screen while the page scrolls to the score.
   */
  showPlayButton?: boolean;
}

/** Play/Pause. Part of `PlayerControls` unless the screen places it itself. */
export function PlayPauseButton({ player, snapshot }: PlayerViewProps) {
  return (
    <button
      type="button"
      className={`${primaryButtonClass} min-w-24`}
      disabled={!canPlay(player, snapshot)}
      // No await before this: iOS only starts audio inside the tap itself.
      onClick={() => player?.togglePlay()}
    >
      {isRunning(snapshot.status) ? 'Pause' : 'Play'}
    </button>
  );
}

/**
 * The shared controls bar: play/pause (unless `showPlayButton` is false),
 * back to start, speed, metronome, count-in, drum mute and drums only. Every
 * change is live; none restarts playback.
 */
export function PlayerControls({ player, snapshot, showPlayButton = true }: PlayerControlsProps) {
  // Unlike Play, options work before the song is ready; they only wait for the player to exist.
  const noPlayer = !canChangeOptions(player);
  const noDrumToggles = !canUseDrumToggles(player, snapshot);
  const noDrumsReason = snapshot.hasDrumTrack ? undefined : 'This song has no drum track';

  return (
    <section
      aria-label="Player controls"
      className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-lg border border-neutral-800 bg-neutral-900/60 p-3"
    >
      <div className="flex gap-2">
        {showPlayButton && <PlayPauseButton player={player} snapshot={snapshot} />}
        <button
          type="button"
          className={buttonClass}
          disabled={!canPlay(player, snapshot)}
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

      <CountInControls
        bars={snapshot.countInBars}
        mode={snapshot.countInMode}
        disabled={noPlayer}
        onBarsChange={(bars) => player?.setCountInBars(bars)}
        onModeChange={(mode) => player?.setCountInMode(mode)}
      />

      {/* One group, so the pair shares a row on a phone and the bar gets no taller. */}
      <div className="flex gap-2">
        <ToggleButton
          pressed={snapshot.drumsMuted}
          disabled={noDrumToggles}
          onChange={(muted) => player?.setDrumsMuted(muted)}
          title={noDrumsReason}
        >
          Mute drums
        </ToggleButton>
        <ToggleButton
          pressed={snapshot.drumsOnly}
          disabled={noDrumToggles}
          onChange={(drumsOnly) => player?.setDrumsOnly(drumsOnly)}
          title={noDrumsReason}
        >
          Drums only
        </ToggleButton>
      </div>
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

/**
 * Starts from the user's settings and changes only this player: the Settings
 * page owns the saved defaults.
 */
function CountInControls({
  bars,
  mode,
  disabled,
  onBarsChange,
  onModeChange,
}: {
  bars: CountInBars;
  mode: CountInMode;
  disabled: boolean;
  onBarsChange: (bars: CountInBars) => void;
  onModeChange: (mode: CountInMode) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <LabelledSelect
        label="Count-in"
        value={String(bars)}
        disabled={disabled}
        onChange={(value) => {
          const next = Number(value);
          if (isCountInBars(next)) onBarsChange(next);
        }}
      >
        {COUNT_IN_BAR_OPTIONS.map((option) => (
          <option key={option} value={option}>
            {COUNT_IN_BARS_LABELS[option]}
          </option>
        ))}
      </LabelledSelect>
      <LabelledSelect
        label="When to count in"
        hideLabel
        value={mode}
        // The mode only matters when there's a count-in to play.
        disabled={disabled || bars === 0}
        onChange={(value) => {
          if (isCountInMode(value)) onModeChange(value);
        }}
      >
        {COUNT_IN_MODES.map((option) => (
          <option key={option} value={option}>
            {COUNT_IN_MODE_LABELS[option]}
          </option>
        ))}
      </LabelledSelect>
    </div>
  );
}

function LabelledSelect({
  label,
  hideLabel = false,
  value,
  disabled,
  onChange,
  children,
}: {
  label: string;
  hideLabel?: boolean;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <div className="flex min-h-11 items-center gap-2 text-sm">
      <label htmlFor={id} className={hideLabel ? 'sr-only' : 'whitespace-nowrap text-neutral-300'}>
        {label}
      </label>
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={selectClass}
      >
        {children}
      </select>
    </div>
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
        className="min-h-11 w-28 accent-sky-500 sm:w-36"
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
