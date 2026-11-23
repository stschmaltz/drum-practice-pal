/**
 * The one player every screen uses. It owns playback state and the options
 * the controls bar changes, and talks to alphaTab only through PlayerEngine,
 * so it has no alphaTab import and its state machine is unit tested with a
 * fake engine. React reads it through usePlayer (subscribe / getSnapshot).
 *
 * Bar numbers here are 1-based; the engine works in ticks and 0-based bar
 * indexes (see barTicks.ts).
 */
import type { CountInBars, CountInMode } from '@/lib/schema';
import { preferPlaybackAudioSession } from './audioSession';
import {
  barAtTick,
  barIndexAtTick,
  barRangeToTicks,
  startTickOfBar,
  startTickOfBarWithin,
  type BarTicks,
} from './barTicks';
import { webClickOutput, type ClickOutput } from './clickOutput';
import { countsInEveryRepeat, meterAtBar, type Meter } from './countIn';
import { startCountIn } from './countInRunner';
import { createEmitter, type Handler } from './emitter';
import type { LayoutChoice } from './layout';
import type { PlayerEngine } from './playerEngine';
import { clampVolume, effectiveMetronomeVolume, type PlayerOptions } from './playerOptions';
import { PLAYER_SOUND_FONT_URL } from './soundFont';
import { clampSpeedRatio } from './speed';
import { orderedBars } from './tapGesture';
import { tempoAtBar } from './tempo';
import { screenWakeLock, type WakeLockControl } from './wakeLock';

/**
 * loading: score or soundfont not ready yet. ready: stopped or paused, can
 * play. countingIn: the count-in is clicking and playback follows on its
 * downbeat. playing: sound is coming out. error: the song can't be played.
 */
export type PlayerStatus = 'loading' | 'ready' | 'countingIn' | 'playing' | 'error';

/** Play has been pressed and Pause undoes it: playing, or counting in to it. */
export function isRunning(status: PlayerStatus): boolean {
  return status === 'playing' || status === 'countingIn';
}

/** The song can be played or is playing: Play, or anything else that starts playback, will work. */
export function isLoaded(status: PlayerStatus): boolean {
  return status === 'ready' || isRunning(status);
}

/** Where a running count-in is, for the on-screen counter. All 1-based. */
export interface CountInBeat {
  bar: number;
  beat: number;
  bars: number;
  beatsPerBar: number;
}

/** What failed; the UI maps it to fixed copy (playerMessages.ts). engine: alphaTab itself didn't start. */
export type PlayerError = 'score' | 'soundFont' | 'engine';

/** 1-based, inclusive. */
export interface BarRange {
  startBar: number;
  endBar: number;
}

/** Whether two ranges cover the same bars; two nulls are the same. */
export function isSameBarRange(a: BarRange | null, b: BarRange | null): boolean {
  if (a === null || b === null) return a === b;
  return a.startBar === b.startBar && a.endBar === b.endBar;
}

export interface PlayerSnapshot extends PlayerOptions {
  status: PlayerStatus;
  error: PlayerError | null;
  /** Null until the score has loaded. */
  barCount: number | null;
  /** The bar playing now, or where playback will resume. */
  barNumber: number | null;
  /** The tempo `barNumber` starts at, in the file's BPM (before speed). Null until the score loads. */
  barTempo: number | null;
  hasDrumTrack: boolean;
  /**
   * Every track but the drum track is silenced, to hear the part on its own.
   * Never on together with `drumsMuted`, and always off when a song opens.
   */
  drumsOnly: boolean;
  range: BarRange | null;
  looping: boolean;
  /** The bars marked on the score: a drawing only, set by the screen (see setHighlight). */
  highlight: BarRange | null;
  /** The count-in beat sounding now; null outside a count-in and before its first click. */
  countIn: CountInBeat | null;
}

export type PlayerEvents = {
  position: { tick: number; barNumber: number | null };
  barChanged: { barNumber: number | null };
  /**
   * A loop pass ended and playback went back to the range start. With a
   * count-in before every repeat, this fires as that count-in begins.
   */
  loopWrapped: undefined;
  /** Playback reached the end with looping off, and stopped. */
  finished: undefined;
  /** The user tapped a bar in the score. Jam mode seeks there; nothing happens by itself. */
  barTapped: { barNumber: number };
  /**
   * The user dragged a mouse across bars (desktop only; a finger scrolls).
   * 1-based and in ascending order whichever way the drag ran. Fires as the
   * drag reaches each bar, and once more with `done` on release. No barTapped
   * follows a drag. Like a tap, nothing happens by itself.
   */
  barsDragged: BarRange & { done: boolean };
};

/**
 * How long a seek waits for the engine to report a position inside the bar it
 * asked for. Positions from anywhere else in that time were posted by
 * alphaTab's worker before the seek reached it, and would flick the current
 * bar back for one update. Past this, whatever the engine reports is believed.
 */
export const SEEK_SETTLE_MS = 500;

export interface PlayerServiceConfig {
  /** From songs.drum_track_index: the track that renders and that "Mute drums" mutes. */
  drumTrackIndex: number | null;
  options: PlayerOptions;
  soundFontUrl?: string;
  wakeLock?: WakeLockControl;
  /** Runs inside the play tap, before the engine starts. */
  unlockAudio?: () => void;
  /** Where count-in clicks sound; tests pass a fake. */
  clicks?: ClickOutput;
}

/** What the player shows before it has loaded anything, also used while the engine starts. */
export function initialPlayerSnapshot(
  drumTrackIndex: number | null,
  options: PlayerOptions,
): PlayerSnapshot {
  return {
    speedRatio: clampSpeedRatio(options.speedRatio),
    metronomeOn: options.metronomeOn,
    metronomeVolume: clampVolume(options.metronomeVolume),
    drumsMuted: drumTrackIndex !== null && options.drumsMuted,
    countInBars: options.countInBars,
    countInMode: options.countInMode,
    status: 'loading',
    error: null,
    barCount: null,
    barNumber: null,
    barTempo: null,
    hasDrumTrack: drumTrackIndex !== null,
    drumsOnly: false,
    range: null,
    looping: false,
    highlight: null,
    countIn: null,
  };
}

export class PlayerService {
  private readonly engine: PlayerEngine;
  private readonly drumTrackIndex: number | null;
  private readonly soundFontUrl: string;
  private readonly wakeLock: WakeLockControl;
  private readonly unlockAudio: () => void;
  private readonly clicks: ClickOutput;
  private readonly events = createEmitter<PlayerEvents>();
  private readonly listeners = new Set<() => void>();
  /**
   * The mute asked for per track index, kept across loads and applied once
   * tracks exist. Drums only overrides it without changing it (see
   * isTrackSilenced), so turning Drums only off brings these back.
   */
  private readonly mutedTracks = new Map<number, boolean>();
  private bars: BarTicks[] = [];
  /** By 0-based bar index, from the score. */
  private barTempos: number[] = [];
  /** By 0-based bar index, from the score. */
  private barMeters: Meter[] = [];
  /** Where playback is, from the engine's last position or a seek; null until one arrives. */
  private lastTick: number | null = null;
  /** The bar a seek asked for, until the engine reports a position in it (see SEEK_SETTLE_MS). */
  private pendingSeek: { bar: BarTicks; until: number } | null = null;
  /** Cancels the count-in that is clicking now; null once it has handed over to playback. */
  private cancelCountIn: (() => void) | null = null;
  /**
   * Pause or stop was sent to a playing engine, and nothing has asked for
   * playback since. A pass end already on its way from alphaTab's worker must
   * not start the next count-in over the user's Pause, whether it lands before
   * or after the engine's "stopped", so only play() and load() clear this.
   */
  private haltRequested = false;
  private trackCount = 0;
  /** The engine was last sent Drums only's mutes, which it keeps until every track is sent again. */
  private engineHoldsDrumsOnly = false;
  private soundFontRequested = false;
  private disposed = false;
  private snapshot: PlayerSnapshot;

  constructor(engine: PlayerEngine, config: PlayerServiceConfig) {
    this.engine = engine;
    this.drumTrackIndex = config.drumTrackIndex;
    this.soundFontUrl = config.soundFontUrl ?? PLAYER_SOUND_FONT_URL;
    this.wakeLock = config.wakeLock ?? screenWakeLock();
    this.unlockAudio = config.unlockAudio ?? (() => preferPlaybackAudioSession());
    this.clicks = config.clicks ?? webClickOutput();
    this.snapshot = initialPlayerSnapshot(config.drumTrackIndex, config.options);
    if (this.drumTrackIndex !== null) {
      this.mutedTracks.set(this.drumTrackIndex, this.snapshot.drumsMuted);
    }
    this.wireEngine();
  }

  // --- React store contract (useSyncExternalStore) ---

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): PlayerSnapshot => this.snapshot;

  /** Typed playback events. Returns the unsubscribe. */
  on<K extends keyof PlayerEvents>(event: K, handler: Handler<PlayerEvents[K]>): () => void {
    return this.events.on(event, handler);
  }

  // --- Loading ---

  /** Loads a Guitar Pro file. The soundfont is fetched with the first load. */
  load(bytes: Uint8Array): void {
    if (this.disposed) return;
    this.abandonCountIn();
    this.haltRequested = false;
    if (this.isLoaded()) this.engine.stop();
    this.bars = [];
    this.barTempos = [];
    this.barMeters = [];
    this.lastTick = null;
    this.pendingSeek = null;
    this.trackCount = 0;
    this.update({
      status: 'loading',
      error: null,
      barCount: null,
      barNumber: null,
      barTempo: null,
    });
    this.wakeLock.setActive(false);
    if (!this.soundFontRequested) {
      this.soundFontRequested = true;
      this.engine.loadSoundFont(this.soundFontUrl).catch(() => {
        // So the next load tries again instead of waiting forever for sounds.
        this.soundFontRequested = false;
        this.fail('soundFont');
      });
    }
    if (!this.engine.loadScore(bytes, [this.drumTrackIndex ?? 0])) this.fail('score');
  }

  // --- Transport ---

  /** Call straight from the tap handler, with no await before it: iOS only unlocks audio inside the gesture. */
  play(): void {
    if (this.disposed || this.snapshot.status !== 'ready') return;
    this.haltRequested = false;
    this.unlockAudio();
    if (this.snapshot.countInBars > 0) {
      // Playback starts from a timer after the count-in, outside this tap, so
      // both audio outputs are woken here while the gesture still counts.
      this.clicks.unlock();
      this.engine.unlockAudio();
      if (this.beginCountIn(this.rewindToBarStart())) return;
    }
    this.engine.play();
  }

  /** Pauses playback, or calls off a count-in. */
  pause(): void {
    if (this.disposed) return;
    if (this.snapshot.status === 'countingIn') {
      this.callOffCountIn();
      return;
    }
    if (this.snapshot.status === 'playing') {
      this.haltRequested = true;
      this.engine.pause();
    }
  }

  togglePlay(): void {
    if (isRunning(this.snapshot.status)) this.pause();
    else this.play();
  }

  /** Stops and goes back to the start of the song, or of the range when one is set. */
  stop(): void {
    if (this.disposed || !this.isLoaded()) return;
    this.abandonCountIn();
    if (this.snapshot.status === 'playing') this.haltRequested = true;
    // The engine rewinds now, so a seek still settling no longer says where playback is.
    this.pendingSeek = null;
    this.engine.stop();
  }

  /**
   * Moves playback to the start of a bar, playing or not. False, and nothing
   * moves, when the bar doesn't exist (yet) or lies outside the range that is set.
   */
  seekToBar(barNumber: number): boolean {
    if (this.disposed) return false;
    const tick = this.seekTickOfBar(barNumber);
    if (tick === null) return false;
    // A count-in under way was for the old bar, which may differ in tempo or meter.
    const recount = this.cancelCountIn !== null;
    if (recount) this.stopCountInClicks();
    this.engine.seek(tick);
    this.lastTick = tick;
    const bar = barAtTick(this.bars, tick);
    this.pendingSeek = bar ? { bar, until: Date.now() + SEEK_SETTLE_MS } : null;
    // Shown at once: while paused, alphaTab's position echo arrives a moment later from its worker.
    this.moveToBar(barNumber);
    if (recount && !this.beginCountIn(barNumber)) this.engine.play();
    return true;
  }

  /**
   * Where a seek to a bar goes: its first playthrough, or with a range set
   * its first playthrough inside the range. Null for a bar outside the range:
   * alphaTab clamps that seek in its worker but reports the bar asked for and
   * then stops reporting positions, so the readout would sit on a bar that
   * isn't playing.
   */
  private seekTickOfBar(barNumber: number): number | null {
    const { range } = this.snapshot;
    const rangeTicks = range ? barRangeToTicks(this.bars, range.startBar, range.endBar) : null;
    return rangeTicks
      ? startTickOfBarWithin(this.bars, barNumber, rangeTicks)
      : startTickOfBar(this.bars, barNumber);
  }

  /**
   * Scrolls the score box so a bar can be read, if it isn't all on show
   * already. For a bar the user didn't pick on the score itself, such as a
   * loop's first bar chosen from the panel: alphaTab follows its cursor only
   * while it plays, so this does nothing then. seekToBar doesn't do it, since
   * a tapped bar would move under the finger. Scrolling only.
   */
  showBar(barNumber: number): void {
    if (this.disposed || !this.isLoaded() || this.snapshot.status === 'playing') return;
    if (startTickOfBar(this.bars, barNumber) === null) return;
    this.engine.scrollToBar(barNumber - 1);
  }

  /** The tempo a 1-based bar starts at, in the file's BPM; null before the score loads or for no such bar. */
  tempoAtBar(barNumber: number): number | null {
    return tempoAtBar(this.barTempos, barNumber);
  }

  // --- Range and looping ---

  /**
   * Limits playback to a bar range, or the whole song for null. Throws a
   * RangeError for a range outside the loaded score; validate input with
   * isValidBarRange first. Before the score loads the range is kept and
   * applied once bars are known.
   */
  setRange(range: BarRange | null): void {
    if (this.disposed) return;
    if (
      range &&
      this.bars.length > 0 &&
      !barRangeToTicks(this.bars, range.startBar, range.endBar)
    ) {
      throw new RangeError(`Bars ${range.startBar} to ${range.endBar} aren't in this song`);
    }
    // Its downbeat would no longer be where playback starts; Play counts in again.
    this.callOffCountIn();
    // alphaTab moves playback to the start of a new range itself.
    if (range) this.pendingSeek = null;
    this.update({ range });
    this.applyRange();
  }

  /** Repeats the range (or the whole song) until turned off. */
  setLooping(looping: boolean): void {
    if (this.disposed) return;
    this.update({ looping });
    this.applyLooping();
  }

  // --- Live options: none of these restart playback ---

  setSpeed(ratio: number): void {
    if (this.disposed) return;
    const speedRatio = clampSpeedRatio(ratio);
    this.update({ speedRatio });
    this.engine.setSpeed(speedRatio);
  }

  setMetronomeOn(metronomeOn: boolean): void {
    if (this.disposed) return;
    this.update({ metronomeOn });
    this.applyMetronome();
  }

  setMetronomeVolume(volume: number): void {
    if (this.disposed) return;
    this.update({ metronomeVolume: clampVolume(volume) });
    this.applyMetronome();
  }

  /**
   * 0 turns the count-in off, and ends one under way: playback starts at once.
   * 1 or 2 take effect from the next count-in; one under way finishes as it began.
   */
  setCountInBars(countInBars: CountInBars): void {
    if (this.disposed) return;
    this.update({ countInBars });
    this.countInOptionsChanged();
    if (countInBars === 0 && this.cancelCountIn !== null) {
      // Off while the counter runs reads as "stop counting", not "from next time".
      // Status stays countingIn until the engine reports it is playing, as after a downbeat.
      this.stopCountInClicks();
      this.update({ countIn: null });
      this.engine.play();
    }
  }

  setCountInMode(countInMode: CountInMode): void {
    if (this.disposed) return;
    this.update({ countInMode });
    this.countInOptionsChanged();
  }

  /**
   * Mutes or unmutes one track. Muting the drum track turns Drums only off.
   * While Drums only is on, a change to another track is remembered and heard
   * once Drums only is turned off.
   */
  setTrackMuted(trackIndex: number, muted: boolean): void {
    if (this.disposed) return;
    this.mutedTracks.set(trackIndex, muted);
    if (trackIndex !== this.drumTrackIndex) {
      this.applyTrackMute(trackIndex);
      return;
    }
    // Muted drums with everything else silenced would be a song with no sound.
    const leavesDrumsOnly = muted && this.snapshot.drumsOnly;
    this.update(leavesDrumsOnly ? { drumsMuted: muted, drumsOnly: false } : { drumsMuted: muted });
    if (leavesDrumsOnly) this.applyEveryTrackMute();
    else this.applyTrackMute(trackIndex);
  }

  /** A no-op for a song without a drum track. */
  setDrumsMuted(muted: boolean): void {
    if (this.drumTrackIndex !== null) this.setTrackMuted(this.drumTrackIndex, muted);
  }

  /**
   * Silences every track except the drum track, or lets them sound again as
   * they were (a track muted with setTrackMuted stays muted). Turning it on
   * unmutes the drums. A no-op for a song without a drum track.
   */
  setDrumsOnly(drumsOnly: boolean): void {
    if (this.disposed || this.drumTrackIndex === null) return;
    if (drumsOnly === this.snapshot.drumsOnly) return;
    if (drumsOnly) this.mutedTracks.set(this.drumTrackIndex, false);
    this.update(drumsOnly ? { drumsOnly, drumsMuted: false } : { drumsOnly });
    this.applyEveryTrackMute();
  }

  setLayout(layout: LayoutChoice): void {
    if (this.disposed) return;
    this.engine.setLayout(layout);
  }

  /**
   * Marks a range of bars on the score (1-based, inclusive), or clears the
   * mark for null. A drawing only: what plays is setRange's business, and the
   * two can differ, as while a new loop's bars are picked during another loop.
   * Bars the song lacks are simply not drawn.
   */
  setHighlight(highlight: BarRange | null): void {
    if (this.disposed) return;
    // An equal range in a new object would otherwise redraw and re-render for nothing.
    if (isSameBarRange(this.snapshot.highlight, highlight)) return;
    this.update({ highlight });
    this.applyHighlight();
  }

  // --- Teardown ---

  /** Stops sound, releases the wake lock and alphaTab's worker and audio. Safe to call twice. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stopCountInClicks();
    this.clicks.dispose();
    this.wakeLock.dispose();
    this.events.clear();
    this.listeners.clear();
    this.engine.destroy();
  }

  // --- Engine events ---

  private wireEngine(): void {
    // Every handler checks `disposed`: alphaTab's worker can still post after destroy().
    const engine = this.engine;
    engine.on('scoreLoaded', ({ barCount, trackCount, barTempos, barMeters }) => {
      if (this.disposed) return;
      this.trackCount = trackCount;
      this.barTempos = barTempos;
      this.barMeters = barMeters;
      this.update({ barCount, barNumber: 1, barTempo: tempoAtBar(barTempos, 1) });
      this.applyMutes();
    });
    engine.on('ticksReady', ({ bars }) => {
      if (this.disposed) return;
      this.bars = bars;
      this.applyAll();
    });
    engine.on('readyForPlayback', () => {
      if (this.disposed || this.snapshot.status !== 'loading') return;
      // Sent again so being ready never rests on what alphaTab kept while it loaded. Nothing
      // is known to be lost: alphaTab 1.9 holds its channel mutes until told otherwise.
      this.applyAll();
      this.update({ status: 'ready' });
    });
    engine.on('stateChanged', ({ playing }) => {
      if (this.disposed) return;
      if (this.snapshot.status === 'error') return;
      if (this.snapshot.status === 'loading' && !playing) return;
      // Before a repeat's count-in alphaTab stops at the end of the pass; that isn't a pause.
      if (this.snapshot.status === 'countingIn' && !playing) return;
      if (playing) this.stopCountInClicks();
      this.update({ status: playing ? 'playing' : 'ready', countIn: null });
      this.wakeLock.setActive(playing);
    });
    engine.on('position', ({ tick }) => {
      if (this.disposed || this.isOutsideRange(tick) || this.isStaleAfterSeek(tick)) return;
      this.lastTick = tick;
      const barIndex = barIndexAtTick(this.bars, tick);
      const barNumber = barIndex === null ? this.snapshot.barNumber : barIndex + 1;
      this.events.emit('position', { tick, barNumber });
      this.moveToBar(barNumber);
    });
    engine.on('finished', () => {
      if (this.disposed) return;
      if (!this.snapshot.looping) {
        this.events.emit('finished', undefined);
        return;
      }
      this.events.emit('loopWrapped', undefined);
      this.countInBeforeRepeat();
    });
    engine.on('error', () => {
      if (this.disposed) return;
      this.fail('score');
    });
    engine.on('barTapped', ({ barIndex }) => {
      if (this.disposed || !this.isLoaded()) return;
      this.events.emit('barTapped', { barNumber: barIndex + 1 });
    });
    engine.on('barsDragged', ({ fromBarIndex, toBarIndex, done }) => {
      if (this.disposed || !this.isLoaded()) return;
      const [startBar, endBar] = orderedBars(fromBarIndex + 1, toBarIndex + 1);
      this.events.emit('barsDragged', { startBar, endBar, done });
    });
  }

  /**
   * Whether a position lies outside the range that is set. Nothing plays
   * there: alphaTab reports the tick a range ends on, which is the start of
   * the next bar, just before it wraps or stops, and positions posted before
   * the range was set can still arrive after it.
   */
  private isOutsideRange(tick: number): boolean {
    const { range } = this.snapshot;
    const ticks = range ? barRangeToTicks(this.bars, range.startBar, range.endBar) : null;
    return ticks !== null && (tick < ticks.startTick || tick >= ticks.endTick);
  }

  /**
   * Whether a position is one alphaTab's worker posted before the last seek
   * reached it. A tick alone can't say which side of a seek it is from, so
   * until the engine reports one inside the bar that was asked for (or
   * SEEK_SETTLE_MS passes), positions outside that bar are dropped.
   */
  private isStaleAfterSeek(tick: number): boolean {
    const seek = this.pendingSeek;
    if (!seek) return false;
    const arrived = tick >= seek.bar.start && tick < seek.bar.end;
    if (!arrived && Date.now() < seek.until) return true;
    this.pendingSeek = null;
    return false;
  }

  /** Updates the current bar and its tempo, and tells listeners when the bar changed. */
  private moveToBar(barNumber: number | null): void {
    if (barNumber === this.snapshot.barNumber) return;
    this.update({
      barNumber,
      barTempo: barNumber === null ? null : tempoAtBar(this.barTempos, barNumber),
    });
    this.events.emit('barChanged', { barNumber });
  }

  // --- Count-in ---

  /**
   * Starts a count-in for playback from `barNumber`: clicks in that bar's
   * meter at its tempo x the current speed, then engine.play() timed to be
   * heard on the downbeat. False when there is nothing to count (count-in
   * off, or no usable tempo or meter), and the caller plays straight away.
   */
  private beginCountIn(barNumber: number): boolean {
    const { countInBars, speedRatio, metronomeVolume } = this.snapshot;
    const meter = meterAtBar(this.barMeters, barNumber);
    const tempo = tempoAtBar(this.barTempos, barNumber);
    if (countInBars < 1 || !meter || tempo === null) return false;

    const cancel = startCountIn(
      this.clicks,
      // The metronome's volume, but not its on/off: a count-in that was asked for should be heard.
      { bars: countInBars, meter, tempo, speedRatio, volume: metronomeVolume },
      {
        onBeat: ({ bar, beat }) => {
          this.update({ countIn: { bar, beat, bars: countInBars, beatsPerBar: meter.beats } });
        },
        onDownbeat: () => {
          // Status stays countingIn until the engine reports it is playing.
          this.cancelCountIn = null;
          this.engine.play();
        },
      },
    );
    if (!cancel) return false;
    this.cancelCountIn = cancel;
    // The count-in is for reading the bar ahead, and the engine, not playing yet, won't scroll
    // to it: the user may have scrolled away, or a repeat's pass ended lines below its start.
    this.engine.scrollToBar(barNumber - 1);
    this.update({ status: 'countingIn', countIn: null });
    this.wakeLock.setActive(true);
    return true;
  }

  /**
   * With a count-in before every repeat the engine's own looping is off (see
   * applyLooping), so at the end of a pass it has stopped, rewound to the
   * start of the range, and waits here for the count-in to start it again.
   */
  private countInBeforeRepeat(): void {
    if (!countsInEveryRepeat(this.snapshot) || this.haltRequested) return;
    const { status, range } = this.snapshot;
    if (status !== 'playing' && status !== 'ready') return;
    if (!this.beginCountIn(range?.startBar ?? 1)) this.engine.play();
  }

  /** Silences the count-in's remaining clicks and drops its timers; status is the caller's business. */
  private stopCountInClicks(): void {
    this.cancelCountIn?.();
    this.cancelCountIn = null;
  }

  /** Calls off a count-in, back to ready. Does nothing outside one. */
  private abandonCountIn(): void {
    this.stopCountInClicks();
    if (this.snapshot.status !== 'countingIn') return;
    this.update({ status: 'ready', countIn: null });
    this.wakeLock.setActive(false);
  }

  /**
   * Calls off a count-in and whatever it has already set going: past the
   * downbeat the engine has been told to play but hasn't said so yet, and
   * would otherwise start under a status of ready.
   */
  private callOffCountIn(): void {
    const handedOver = this.snapshot.status === 'countingIn' && this.cancelCountIn === null;
    this.abandonCountIn();
    if (handedOver) this.engine.pause();
  }

  /**
   * The bar playback is in, as a 1-based number, after moving a mid-bar
   * position back to that bar's start: a count-in has to end on a downbeat.
   */
  private rewindToBarStart(): number {
    const bar = this.lastTick === null ? null : barAtTick(this.bars, this.lastTick);
    if (!bar) return this.snapshot.barNumber ?? this.snapshot.range?.startBar ?? 1;
    if (this.lastTick !== bar.start) {
      this.engine.seek(bar.start);
      this.lastTick = bar.start;
    }
    return bar.barIndex + 1;
  }

  private countInOptionsChanged(): void {
    // Changing a <select> is a gesture too, and it may be the only one before a repeat's count-in.
    if (this.snapshot.countInBars > 0) this.clicks.unlock();
    this.applyLooping();
  }

  private fail(error: PlayerError): void {
    if (this.disposed || this.snapshot.status === 'error') return;
    // Past a count-in's downbeat the engine has been told to play, though it hasn't said so yet.
    const handedOver = this.snapshot.status === 'countingIn' && this.cancelCountIn === null;
    const engineStarted = this.snapshot.status === 'playing' || handedOver;
    this.stopCountInClicks();
    this.update({ status: 'error', error, countIn: null });
    this.wakeLock.setActive(false);
    if (engineStarted) this.engine.stop();
  }

  private isLoaded(): boolean {
    return isLoaded(this.snapshot.status);
  }

  /** Pushes every option to the engine, for when alphaTab has (re)loaded and may have reset them. */
  private applyAll(): void {
    this.engine.setSpeed(this.snapshot.speedRatio);
    this.applyMetronome();
    this.applyLooping();
    this.applyMutes();
    this.applyRange();
    this.applyHighlight();
  }

  private applyHighlight(): void {
    const highlight = this.snapshot.highlight;
    this.engine.setHighlight(
      highlight && {
        startBarIndex: highlight.startBar - 1,
        endBarIndex: highlight.endBar - 1,
      },
    );
  }

  private applyMetronome(): void {
    this.engine.setMetronomeVolume(effectiveMetronomeVolume(this.snapshot));
  }

  /**
   * alphaTab loops by itself unless every repeat gets a count-in. Then its
   * looping stays off, so it stops cleanly at the end of each pass (the Unit 01
   * finding: pausing a native loop on its wrap clips the last bar) and the
   * service restarts it after the count-in. A property change either way.
   */
  private applyLooping(): void {
    this.engine.setLooping(this.snapshot.looping && !countsInEveryRepeat(this.snapshot));
  }

  /**
   * Sends the mutes a freshly loaded engine lacks: it starts with every track
   * sounding, so only tracks with a mute on record need a call. Every track
   * goes while Drums only is on, and once more after it went off unsent:
   * alphaTab's synth keeps its channel mutes across a reload, so tracks it
   * silenced before one would otherwise stay silent.
   */
  private applyMutes(): void {
    if (this.snapshot.drumsOnly || this.engineHoldsDrumsOnly) this.applyEveryTrackMute();
    else for (const trackIndex of this.mutedTracks.keys()) this.applyTrackMute(trackIndex);
  }

  /** For Drums only going on or off, which changes tracks that have no mute on record. */
  private applyEveryTrackMute(): void {
    if (this.trackCount === 0) return;
    for (let trackIndex = 0; trackIndex < this.trackCount; trackIndex++) {
      this.applyTrackMute(trackIndex);
    }
    this.engineHoldsDrumsOnly = this.snapshot.drumsOnly;
  }

  /** Tracks the loaded score doesn't have yet are skipped; applyMutes sends them once it does. */
  private applyTrackMute(trackIndex: number): void {
    if (trackIndex >= this.trackCount) return;
    this.engine.setTrackMuted(trackIndex, this.isTrackSilenced(trackIndex));
  }

  /** What the engine should have for a track: Drums only wins over the mute on record. */
  private isTrackSilenced(trackIndex: number): boolean {
    if (this.snapshot.drumsOnly) return trackIndex !== this.drumTrackIndex;
    return this.mutedTracks.get(trackIndex) ?? false;
  }

  private applyRange(): void {
    if (this.bars.length === 0) return;
    const range = this.snapshot.range;
    const ticks = range ? barRangeToTicks(this.bars, range.startBar, range.endBar) : null;
    // A range set before loading that this song doesn't have: drop it rather than loop nothing.
    if (range && !ticks) this.update({ range: null });
    this.engine.setPlaybackRange(ticks);
  }

  /** Notifies subscribers only when a value really changed, so React doesn't re-render for nothing. */
  private update(patch: Partial<PlayerSnapshot>): void {
    const keys = Object.keys(patch) as (keyof PlayerSnapshot)[];
    if (!keys.some((key) => this.snapshot[key] !== patch[key])) return;
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener();
  }
}
