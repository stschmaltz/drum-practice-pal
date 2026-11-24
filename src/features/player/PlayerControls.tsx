import { useId, type ReactNode } from 'react';
import { Icon, type IconName } from '@/components/icons';
import { cardClass, primaryButtonClass, selectClass, toolButtonClass } from '@/components/styles';
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
  const running = isRunning(snapshot.status);
  return (
    <button
      type="button"
      className={`${primaryButtonClass} min-w-24 md:min-w-28 md:text-lg`}
      disabled={!canPlay(player, snapshot)}
      // No await before this: iOS only starts audio inside the tap itself.
      onClick={() => player?.togglePlay()}
    >
      <Icon name={running ? 'pause' : 'play'} className="size-6" />
      {running ? 'Pause' : 'Play'}
    </button>
  );
}

/**
 * The shared controls bar: play/pause (unless `showPlayButton` is false),
 * back to start, speed, metronome, count-in, drum mute and drums only. Every
 * change is live; none restarts playback.
 *
 * Three rows on a phone: the buttons as one row of tiles, the speed beside
 * the metronome volume, then the count-in; a tablet the same. From 1024 px
 * the buttons are a line of icon-and-label buttons beside the sliders.
 */
export function PlayerControls({ player, snapshot, showPlayButton = true }: PlayerControlsProps) {
  // Unlike Play, options work before the song is ready; they only wait for the player to exist.
  const optionsDisabled = !canChangeOptions(player);
  const drumTogglesDisabled = !canUseDrumToggles(player, snapshot);
  const noDrumsReason = snapshot.hasDrumTrack ? undefined : 'This song has no drum track';

  return (
    <section
      aria-label="Player controls"
      className={`${cardClass} flex flex-col gap-3 p-3 md:p-4 lg:flex-row lg:flex-wrap lg:items-center lg:gap-x-6`}
    >
      <div className="grid auto-cols-fr grid-flow-col gap-2 max-[359px]:gap-1 lg:flex lg:flex-wrap">
        {showPlayButton && <PlayPauseButton player={player} snapshot={snapshot} />}
        <button
          type="button"
          className={toolButtonClass(false)}
          disabled={!canPlay(player, snapshot)}
          onClick={() => player?.stop()}
        >
          <Icon name="backToStart" />
          Back to start
        </button>
        <ToggleButton
          icon="metronome"
          pressed={snapshot.metronomeOn}
          disabled={optionsDisabled}
          onChange={(on) => player?.setMetronomeOn(on)}
        >
          Metronome
        </ToggleButton>
        <ToggleButton
          icon="drumMuted"
          pressed={snapshot.drumsMuted}
          disabled={drumTogglesDisabled}
          onChange={(muted) => player?.setDrumsMuted(muted)}
          title={noDrumsReason}
        >
          Mute drums
        </ToggleButton>
        <ToggleButton
          icon="headphones"
          pressed={snapshot.drumsOnly}
          disabled={drumTogglesDisabled}
          onChange={(drumsOnly) => player?.setDrumsOnly(drumsOnly)}
          title={noDrumsReason}
        >
          Drums only
        </ToggleButton>
      </div>

      {/* Speed takes the larger share; on the narrowest phones the volume wraps under it. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 lg:min-w-80 lg:flex-1">
        <SpeedSlider
          speedRatio={snapshot.speedRatio}
          disabled={optionsDisabled}
          onChange={(ratio) => player?.setSpeed(ratio)}
        />
        <VolumeSlider
          volume={snapshot.metronomeVolume}
          disabled={optionsDisabled}
          onChange={(volume) => player?.setMetronomeVolume(volume)}
        />
      </div>

      <CountInControls
        bars={snapshot.countInBars}
        mode={snapshot.countInMode}
        disabled={optionsDisabled}
        onBarsChange={(bars) => player?.setCountInBars(bars)}
        onModeChange={(mode) => player?.setCountInMode(mode)}
      />
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
      className="flex-[3_1_12rem]"
      sliderClassName="min-w-20"
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
      icon="volume"
      // The row has no room for the words or the readout on a phone; the speaker stands for them.
      compact
      className="flex-[1_1_5rem]"
      sliderClassName="min-w-12"
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
    <div className="flex items-center gap-2">
      <LabelledSelect
        label="Count-in"
        icon="countIn"
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
        // It gives way before the row wraps: its option's text is cut short on a narrow phone.
        className="min-w-0 flex-1"
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

/** The words (and icon) before a select or slider in the bar. */
const controlLabelClass = 'flex items-center gap-2 whitespace-nowrap text-ink-soft';

function LabelIcon({ name }: { name: IconName }) {
  return <Icon name={name} className="size-5 text-ink-muted" />;
}

function LabelledSelect({
  label,
  icon,
  hideLabel = false,
  className = '',
  value,
  disabled,
  onChange,
  children,
}: {
  label: string;
  icon?: IconName;
  hideLabel?: boolean;
  className?: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <div className={`flex min-h-touch items-center gap-2 text-sm ${className}`}>
      <label htmlFor={id} className={hideLabel ? 'sr-only' : controlLabelClass}>
        {icon && <LabelIcon name={icon} />}
        {label}
      </label>
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={`${selectClass} min-w-0 ${hideLabel ? 'w-full' : ''}`}
      >
        {children}
      </select>
    </div>
  );
}

function PercentSlider({
  label,
  icon,
  compact = false,
  className,
  sliderClassName,
  value,
  min,
  max,
  step,
  disabled,
  onChange,
}: {
  label: string;
  /** Beside the label's words; in place of them when `compact`. */
  icon?: IconName;
  /** The label's words and the readout are left to screen readers below 768 px (`aria-valuetext` says the value). */
  compact?: boolean;
  /** The slider's share of its row. */
  className: string;
  /** The narrowest the slider itself gets before the row wraps. */
  sliderClassName: string;
  value: number;
  min: number;
  max: number;
  step: number;
  disabled: boolean;
  onChange: (percent: number) => void;
}) {
  const id = useId();
  return (
    <div className={`flex min-h-touch items-center gap-2 text-sm ${className}`}>
      <label htmlFor={id} className={controlLabelClass}>
        {icon && <LabelIcon name={icon} />}
        <span className={compact ? 'max-md:sr-only' : undefined}>{label}</span>
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
        // w-0: left to its own width (129 px in Chromium), a slider pushes the volume onto a fourth row on a phone.
        className={`min-h-touch w-0 min-w-0 flex-1 ${sliderClassName}`}
      />
      <output
        htmlFor={id}
        className={`w-11 shrink-0 text-right font-semibold tabular-nums ${compact ? 'max-md:sr-only' : ''}`}
      >
        {value}%
      </output>
    </div>
  );
}

function ToggleButton({
  icon,
  pressed,
  disabled,
  onChange,
  title,
  children,
}: {
  icon: IconName;
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
      className={toolButtonClass(pressed)}
    >
      <Icon name={icon} />
      {children}
    </button>
  );
}
