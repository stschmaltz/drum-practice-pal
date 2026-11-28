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
import {
  canChangeMetronomeVoice,
  canChangeOptions,
  canPlay,
  canUseDrumToggles,
  type PlayGate,
} from './controlGates';
import { MetronomeVoiceFields } from './MetronomeVoiceFields';
import { metronomeVoiceSummary } from './metronomeSounds';
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
   * A loop is playing, and its own speed control (% and BPM, nudges) is the
   * one to use: the slider gives way to a button that shows it, so there is
   * one speed control on screen, not two that look alike.
   */
  onShowLoopSpeed?: (() => void) | null;
  /** False where the screen has a speed control of its own (the practice screen's). */
  showSpeed?: boolean;
}

/**
 * Play/Pause. Part of `PlayerControls` unless the screen places it itself.
 * `round`: the practice screen's one big round button, its word left to
 * screen readers (the name stays "Play" / "Pause").
 */
export function PlayPauseButton({
  player,
  snapshot,
  round = false,
  gate = canPlay,
}: PlayerViewProps & {
  round?: boolean;
  /** When the button is on; the screen's Space key goes by the same gate. */
  gate?: PlayGate;
}) {
  const running = isRunning(snapshot.status);
  const shape = round
    ? // Smaller in a short window (a phone on its side), still past the 44 px target.
      'size-16 shrink-0 rounded-full! px-0! md:size-20 short:size-14'
    : 'min-w-24 md:min-w-28 md:text-lg';
  return (
    <button
      type="button"
      className={`${primaryButtonClass} ${shape}`}
      disabled={!gate(player, snapshot)}
      // No await before this: iOS only starts audio inside the tap itself.
      onClick={() => player?.togglePlay()}
    >
      <Icon name={running ? 'pause' : 'play'} className={round ? 'size-8' : 'size-6'} />
      <span className={round ? 'sr-only' : undefined}>{running ? 'Pause' : 'Play'}</span>
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
  showSpeed = true,
}: PlayerControlsProps) {
  // Unlike Play, options work before the song is ready; they only wait for the player to exist
  // (and are off once it has failed).
  const optionsDisabled = !canChangeOptions(player, snapshot);
  const playDisabled = !canPlay(player, snapshot);
  const drumTogglesDisabled = !canUseDrumToggles(player, snapshot);
  const noDrumsReason = snapshot.hasDrumTrack ? undefined : 'This song has no drum track';
  const folded = fold?.folded ?? false;
  const keepFocus = useFocusKeptInBar(folded, fold?.canFold ?? false, snapshot.countInBars);

  return (
    <section
      ref={keepFocus.ref}
      onFocus={keepFocus.onFocus}
      onBlur={keepFocus.onBlur}
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
            disabled={playDisabled}
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
        {/* Every track silent, the cursor still moving: for reading the tab along with the
            real recording playing somewhere else. Works without a drum track too. */}
        {!folded && (
          <ToggleButton
            icon="muted"
            pressed={snapshot.allMuted}
            disabled={optionsDisabled}
            onChange={(allMuted) => player?.setAllMuted(allMuted)}
          >
            Mute all
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
        {!showSpeed ? null : onShowLoopSpeed ? (
          <LoopSpeedButton
            speedRatio={snapshot.speedRatio}
            compact={folded}
            onShow={onShowLoopSpeed}
          />
        ) : (
          <SpeedSlider
            speedRatio={snapshot.speedRatio}
            folded={folded}
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

      {!folded && <MetronomeVoiceControls player={player} snapshot={snapshot} />}

      {!folded && <TrackMixer player={player} snapshot={snapshot} />}

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
 *
 * The count-in turned off (the C key acts with focus anywhere) takes "When to
 * count in" away the same way: focus on one of its options goes to the checked
 * option of the count-in's bars, the group beside it, which stays.
 */
function useFocusKeptInBar(folded: boolean, canFold: boolean, countInBars: CountInBars) {
  const ref = useRef<HTMLElement>(null);
  const lastFocused = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    const last = lastFocused.current;
    if (!last || last.isConnected) return;
    lastFocused.current = null;
    const active = document.activeElement;
    if (active !== null && active !== document.body) return;
    const bar = ref.current;
    // A radio that went was a count-in choice. Folded, the bars' group has gone too, and
    // the fold toggle takes focus as for any other control folded away.
    const countInChoice = last.matches('input[type="radio"]')
      ? bar?.querySelector<HTMLElement>('input[type="radio"]:checked:not(:disabled)')
      : null;
    const target =
      countInChoice ??
      bar?.querySelector<HTMLElement>('[data-fold-toggle]') ??
      bar?.querySelector<HTMLElement>('[aria-pressed]');
    target?.focus();
  }, [folded, canFold, countInBars]);
  return {
    ref,
    onFocus: (event: { target: EventTarget }) => {
      if (event.target instanceof HTMLElement) lastFocused.current = event.target;
    },
    // Focus given up while the control was still there (a tap on the score) was not lost
    // to a fold: nothing is handed on, or a radio would take the arrow keys from the page.
    onBlur: (event: { target: EventTarget }) => {
      const last = lastFocused.current;
      if (event.target === last && last.isConnected) lastFocused.current = null;
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
      className={`${ghostButtonClass} min-w-touch shrink-0 px-3 text-sm ${folded ? '' : 'self-end lg:ml-auto lg:self-auto'}`}
      aria-expanded={!folded}
      data-fold-toggle=""
      onClick={() => onFoldedChange(!folded)}
    >
      <Icon name={folded ? 'chevronDown' : 'chevronUp'} className="size-4" />
      {/* "Controls" on a phone, where the strip has little room, and the chevron alone below
          360 px, where the word ran into the speed's readout; the name keeps the verb. */}
      <span className={`max-sm:capitalize ${folded ? 'max-[359px]:sr-only' : ''}`}>
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
  folded,
  disabled,
  onChange,
}: {
  speedRatio: number;
  /** In the folded strip below 360 px the word "Speed" is left to screen readers, for room. */
  folded: boolean;
  disabled: boolean;
  onChange: (ratio: number) => void;
}) {
  return (
    <PercentSlider
      label="Speed"
      labelWordsClassName={folded ? 'max-[359px]:sr-only' : undefined}
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

/** The metronome's sounds for this song, changeable while it plays. */
function MetronomeVoiceControls({ player, snapshot }: PlayerViewProps) {
  const voice = snapshot.metronomeVoice;
  return (
    // Closed by default: chosen once in a while, and open it would push the score
    // a screen down on a phone. Native details, so it needs no state or keys.
    <details className="group text-sm lg:basis-full">
      <summary className={disclosureSummaryClass}>
        <Icon name="metronome" />
        Metronome sounds
        <span className="text-ink-muted">{metronomeVoiceSummary(voice)}</span>
        <Icon name="chevronDown" className="size-4 group-open:rotate-180" />
      </summary>
      <div className="flex flex-col gap-1 pt-2">
        <MetronomeVoiceFields
          voice={voice}
          soundLabel="Metronome sound"
          disabled={!canChangeMetronomeVoice(player, snapshot)}
          onChange={(next) => player?.setMetronomeVoice(next)}
        />
      </div>
    </details>
  );
}

/**
 * Each of the song's tracks on or off, by name, for this player only: nothing
 * is saved, and every track is on when a song opens. Live, like the other
 * options. The drum track's switch is Mute drums; Drums only silences the
 * others over their switches without changing them, and says so.
 */
function TrackMixer({ player, snapshot }: PlayerViewProps) {
  const { tracks, drumsOnly, allMuted } = snapshot;
  // One track has nothing to mix: Mute drums, or the song itself, covers it.
  if (tracks.length < 2) return null;
  const onCount = tracks.filter((track) => !track.muted).length;
  const disabled = !canChangeOptions(player, snapshot);
  return (
    // Closed by default, as the metronome's sounds are: open it pushes the score down.
    <details className="group text-sm lg:basis-full">
      <summary className={disclosureSummaryClass}>
        <Icon name="controls" />
        Tracks
        <span className="text-ink-muted">
          {onCount} of {tracks.length} on
        </span>
        <Icon name="chevronDown" className="size-4 group-open:rotate-180" />
      </summary>
      <div role="group" aria-label="Tracks" className="flex flex-col gap-2 pt-2">
        <div className="flex flex-wrap gap-2">
          {tracks.map((track) => (
            <button
              key={track.index}
              type="button"
              aria-pressed={!track.muted}
              disabled={disabled}
              onClick={() => player?.setTrackMuted(track.index, !track.muted)}
              className={`${toolButtonClass(!track.muted, { inline: true })} max-w-full`}
            >
              <ToggleMark on={!track.muted} inline />
              {/* A name from the file, which can be one long word. */}
              <span className="min-w-0 wrap-anywhere">{track.name}</span>
            </button>
          ))}
        </div>
        {allMuted && (
          <p className="text-ink-soft">Mute all is on: every track is silent until it's off.</p>
        )}
        {!allMuted && drumsOnly && tracks.some((track) => !track.drums) && (
          <p className="text-ink-soft">
            Drums only is on: the other tracks are silent until it's off.
          </p>
        )}
      </div>
    </details>
  );
}

/** A closed-by-default disclosure's summary in the bar, drawn as a quiet button. */
const disclosureSummaryClass = `${ghostButtonClass} w-fit cursor-pointer list-none [&::-webkit-details-marker]:hidden`;

/** The words (and icon) before a control in the bar. */
const controlLabelClass = 'flex items-center gap-2 whitespace-nowrap text-ink-soft';

function LabelIcon({ name }: { name: IconName }) {
  return <Icon name={name} className="size-5 text-ink-muted" />;
}

function PercentSlider({
  label,
  icon,
  compact = false,
  labelWordsClassName,
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
  /** Where else the label's words are left to screen readers. */
  labelWordsClassName?: string;
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
        <span className={compact ? 'max-md:sr-only' : labelWordsClassName}>{label}</span>
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
