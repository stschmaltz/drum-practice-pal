import { useId, useLayoutEffect, useRef, type ReactNode } from 'react';
import { Icon, type IconName } from '@/components/icons';
import { SegmentedControl } from '@/components/SegmentedControl';
import {
  buttonClass,
  cardClass,
  ghostButtonClass,
  primaryButtonClass,
  toolButtonClass,
} from '@/components/styles';
import {
  COUNT_IN_BAR_OPTIONS,
  COUNT_IN_MODES,
  METRONOME_VOLUME_MAX,
  METRONOME_VOLUME_MIN,
  SPEED_RATIO_MAX,
  SPEED_RATIO_MIN,
  type CountInBars,
  type CountInMode,
} from '@/lib/schema';
import { COUNT_IN_BARS_LABELS, COUNT_IN_MODE_SHORT_LABELS } from './countInLabels';
import { canChangeOptions, canPlay, canUseDrumToggles } from './controlGates';
import { isRunning, type PlayerService, type PlayerSnapshot } from './PlayerService';
import { percentToRatio, ratioToPercent, SPEED_STEP_PERCENT } from './speed';

const VOLUME_STEP_PERCENT = 5;

interface PlayerViewProps {
  /** Null while alphaTab loads; the controls show the snapshot but do nothing. */
  player: PlayerService | null;
  snapshot: PlayerSnapshot;
}

/** Folding the bar while playback runs (the song page's `useControlsFold`). */
export interface ControlsFold {
  /** Folded: the metronome, the speed and "Show controls" only, as a strip under the sticky bar. */
  folded: boolean;
  /** Playback runs, so the bar can fold: "Show controls" / "Hide controls" is on show. */
  canFold: boolean;
  onFoldedChange: (folded: boolean) => void;
}

interface PlayerControlsProps extends PlayerViewProps {
  /**
   * False when the screen shows `PlayPauseButton` elsewhere, such as a sticky
   * bar that stays on screen while the page scrolls to the score.
   */
  showPlayButton?: boolean;
  /** Absent: never folds (every screen but the song page). */
  fold?: ControlsFold;
  /**
   * A loop is playing, and its own speed control (with "Save speed") is the
   * one to use: the slider gives way to a button that shows it. Two speed
   * controls that look alike, of which only one saves, read as one that saves.
   */
  onShowLoopSpeed?: (() => void) | null;
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
 *
 * Folded (`fold`, while playback runs on the song page) it is one strip: the
 * metronome, the speed and "Show controls". The two kept are the same
 * elements as in the full bar (each keeps its place among its siblings), so
 * focus on either survives the fold; what is left out still answers to its
 * keyboard shortcut, which acts on the player, not on the button.
 */
export function PlayerControls({
  player,
  snapshot,
  showPlayButton = true,
  fold,
  onShowLoopSpeed = null,
}: PlayerControlsProps) {
  // Unlike Play, options work before the song is ready; they only wait for the player to exist.
  const optionsDisabled = !canChangeOptions(player);
  const drumTogglesDisabled = !canUseDrumToggles(player, snapshot);
  const noDrumsReason = snapshot.hasDrumTrack ? undefined : 'This song has no drum track';
  const folded = fold?.folded ?? false;
  const keepFocus = useFocusKeptInBar(folded, fold?.canFold ?? false);

  return (
    <section
      ref={keepFocus.ref}
      onFocus={keepFocus.onFocus}
      aria-label="Player controls"
      data-folded={folded || undefined}
      className={
        folded
          ? 'flex items-center gap-2 py-1'
          : `${cardClass} flex flex-col gap-3 p-3 md:p-4 lg:flex-row lg:flex-wrap lg:items-center lg:gap-x-6`
      }
    >
      <div
        className={
          folded
            ? 'flex shrink-0'
            : 'grid auto-cols-fr grid-flow-col gap-2 max-[359px]:gap-1 lg:flex lg:flex-wrap'
        }
      >
        {showPlayButton && !folded && <PlayPauseButton player={player} snapshot={snapshot} />}
        {!folded && (
          <button
            type="button"
            className={toolButtonClass(false)}
            disabled={!canPlay(player, snapshot)}
            onClick={() => player?.stop()}
          >
            <Icon name="backToStart" />
            Back to start
          </button>
        )}
        <ToggleButton
          icon="metronome"
          inline={folded}
          pressed={snapshot.metronomeOn}
          disabled={optionsDisabled}
          onChange={(on) => player?.setMetronomeOn(on)}
        >
          Metronome
        </ToggleButton>
        {!folded && (
          <ToggleButton
            icon="drumMuted"
            pressed={snapshot.drumsMuted}
            disabled={drumTogglesDisabled}
            onChange={(muted) => player?.setDrumsMuted(muted)}
            title={noDrumsReason}
          >
            Mute drums
          </ToggleButton>
        )}
        {!folded && (
          <ToggleButton
            icon="headphones"
            pressed={snapshot.drumsOnly}
            disabled={drumTogglesDisabled}
            onChange={(drumsOnly) => player?.setDrumsOnly(drumsOnly)}
            title={noDrumsReason}
          >
            Drums only
          </ToggleButton>
        )}
      </div>

      {/* Speed takes the larger share; on the narrowest phones the volume wraps under it. */}
      <div
        className={
          folded
            ? 'flex min-w-0 flex-1 items-center'
            : 'flex flex-wrap items-center gap-x-4 gap-y-1 lg:min-w-80 lg:flex-1'
        }
      >
        {onShowLoopSpeed ? (
          <LoopSpeedButton
            speedRatio={snapshot.speedRatio}
            compact={folded}
            onShow={onShowLoopSpeed}
          />
        ) : (
          <SpeedSlider
            speedRatio={snapshot.speedRatio}
            disabled={optionsDisabled}
            onChange={(ratio) => player?.setSpeed(ratio)}
          />
        )}
        {!folded && (
          <VolumeSlider
            volume={snapshot.metronomeVolume}
            disabled={optionsDisabled}
            onChange={(volume) => player?.setMetronomeVolume(volume)}
          />
        )}
      </div>

      {!folded && (
        <CountInControls
          bars={snapshot.countInBars}
          mode={snapshot.countInMode}
          disabled={optionsDisabled}
          onBarsChange={(bars) => player?.setCountInBars(bars)}
          onModeChange={(mode) => player?.setCountInMode(mode)}
        />
      )}

      {fold?.canFold && <FoldToggle folded={folded} onFoldedChange={fold.onFoldedChange} />}
    </section>
  );
}

/**
 * Folding takes controls off the page, and one of them may have had focus
 * (Mute drums clicked, then Space to play). Focus would fall to `<body>` and a
 * keyboard user start again from the top; it goes to the fold toggle instead,
 * or, once playback has stopped and the toggle has gone with it, to the
 * metronome, which is always there (checklist 5, a control that replaces itself).
 */
function useFocusKeptInBar(folded: boolean, canFold: boolean) {
  const ref = useRef<HTMLElement>(null);
  const lastFocused = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    const last = lastFocused.current;
    if (!last || last.isConnected) return;
    lastFocused.current = null;
    const active = document.activeElement;
    if (active !== null && active !== document.body) return;
    const bar = ref.current;
    const target =
      bar?.querySelector<HTMLElement>('[data-fold-toggle]') ??
      bar?.querySelector<HTMLElement>('[aria-pressed]');
    target?.focus();
  }, [folded, canFold]);
  return {
    ref,
    onFocus: (event: { target: EventTarget }) => {
      if (event.target instanceof HTMLElement) lastFocused.current = event.target;
    },
  };
}

/**
 * "Show controls" in the folded strip, "Hide controls" in the full bar while
 * playback runs. A disclosure: `aria-expanded` says whether the full bar is out.
 */
function FoldToggle({
  folded,
  onFoldedChange,
}: {
  folded: boolean;
  onFoldedChange: (folded: boolean) => void;
}) {
  return (
    <button
      type="button"
      className={`${ghostButtonClass} shrink-0 px-3 text-sm ${folded ? '' : 'self-end lg:ml-auto lg:self-auto'}`}
      aria-expanded={!folded}
      data-fold-toggle=""
      onClick={() => onFoldedChange(!folded)}
    >
      <Icon name={folded ? 'chevronDown' : 'chevronUp'} className="size-4" />
      {/* "Controls" on a phone, where the strip has little room; the name keeps the verb. */}
      <span className="max-sm:capitalize">
        <span className="max-sm:sr-only">{folded ? 'Show ' : 'Hide '}</span>controls
      </span>
    </button>
  );
}

/**
 * In place of the slider while a loop plays: its speed now, and the way to
 * the loop's own control. In the folded strip on a phone the words are left
 * to screen readers; the loop icon and the percent show.
 */
function LoopSpeedButton({
  speedRatio,
  compact,
  onShow,
}: {
  speedRatio: number;
  compact: boolean;
  onShow: () => void;
}) {
  return (
    <button type="button" className={`${buttonClass} shrink-0 text-sm`} onClick={onShow}>
      <Icon name="loop" className="size-5 text-ink-muted" />
      <span className={compact ? 'max-sm:sr-only' : undefined}>Loop speed</span>
      <span className="font-semibold tabular-nums">{ratioToPercent(speedRatio)}%</span>
    </button>
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
 * page owns the saved defaults. Two segmented controls (a few fixed choices,
 * every one on show and none cut short, which a select on a phone was): how
 * many bars and, only while there is a count-in, when it plays.
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
  const labelId = useId();
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
      <span id={labelId} className={controlLabelClass}>
        <LabelIcon name="countIn" />
        Count-in
      </span>
      <SegmentedControl
        labelledBy={labelId}
        className="min-w-0 flex-[1_1_13rem]"
        options={COUNT_IN_BAR_OPTIONS.map((option) => ({
          value: option,
          label: COUNT_IN_BARS_LABELS[option],
        }))}
        value={bars}
        disabled={disabled}
        onChange={onBarsChange}
      />
      {/* The mode only matters when there is a count-in to play, so it shows only then. */}
      {bars !== 0 && (
        <SegmentedControl
          label="When to count in"
          className="min-w-0 flex-[1_1_15rem]"
          options={COUNT_IN_MODES.map((option) => ({
            value: option,
            label: COUNT_IN_MODE_SHORT_LABELS[option],
          }))}
          value={mode}
          disabled={disabled}
          onChange={onModeChange}
        />
      )}
    </div>
  );
}

/** The words (and icon) before a control in the bar. */
const controlLabelClass = 'flex items-center gap-2 whitespace-nowrap text-ink-soft';

function LabelIcon({ name }: { name: IconName }) {
  return <Icon name={name} className="size-5 text-ink-muted" />;
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
  inline = false,
  pressed,
  disabled,
  onChange,
  title,
  children,
}: {
  icon: IconName;
  /** Laid out as a row whatever the width (the folded strip). */
  inline?: boolean;
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
      className={toolButtonClass(pressed, { inline })}
    >
      <Icon name={icon} />
      {/* In the folded strip on a phone the icon and the mark stand for the words. */}
      {inline ? <span className="max-sm:sr-only">{children}</span> : children}
      <ToggleMark on={pressed} inline={inline} />
    </button>
  );
}

/**
 * A toggle's state as a shape as well as a fill (WCAG 1.4.1): a check in a
 * filled circle when on, an empty ring when off. Actions (Back to start) have
 * none, so a toggle reads as a toggle before it is pressed. `aria-pressed`
 * says the same to screen readers; this is decoration.
 */
function ToggleMark({ on, inline }: { on: boolean; inline: boolean }) {
  return (
    <span
      aria-hidden="true"
      data-toggle-mark={on ? 'on' : 'off'}
      className={`flex size-4 shrink-0 items-center justify-center rounded-full ${
        inline ? '' : 'absolute top-1 right-1 lg:static'
      } ${on ? 'bg-selected-line text-canvas' : 'border-2 border-ink-muted'}`}
    >
      {on && <Icon name="check" className="size-3" />}
    </span>
  );
}
