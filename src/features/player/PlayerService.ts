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
import type { PlayerEngine, WindowRect } from './playerEngine';
import { isSameVoice, type MetronomeVoice } from './metronomeSounds';
import { clampVolume, effectiveMetronomeVolume, type PlayerOptions } from './playerOptions';

/**
 * The drum track's level over the file's own (1). The kit was really quiet in
 * the mix under guitars and bass (Shane, 2026-11-27); alphaTab doesn't cap a
 * channel's volume. Tune by ear here.
 */
export const DRUM_TRACK_GAIN = 2.5;
import { PLAYER_SOUND_FONT_URLS } from './soundFont';
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

/**
 * Whether the score's bars are known and drawn, so they can be picked on it
 * (a loop's bars): from the score's load on, before its sounds are in, and
 * after the sounds failed, which still leaves the notation readable. Not
 * after a failure that leaves nothing on show.
 */
export function showsScoreBars(snapshot: PlayerSnapshot): boolean {
  return snapshot.barCount !== null && snapshot.error !== 'score' && snapshot.error !== 'engine';
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

/** One track in the mixer: by index, with its name and the mute the user chose for it. */
export interface TrackMix {
  index: number;
  name: string;
  /**
   * The mute chosen for this track (the drum track's is Mute drums). Drums
   * only silences every other track over it without changing it.
   */
  muted: boolean;
  /** The song's drum track, which Mute drums and Drums only act on. */
  drums: boolean;
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
  /**
   * Every track is silenced, drums included, to read the tab along with the
   * real recording playing somewhere else. Over the other mutes without
   * changing them, so off brings back what was there. The metronome is its own
   * switch. Always off when a song opens.
   */
  allMuted: boolean;
  range: BarRange | null;
  looping: boolean;
  /** The bars marked on the score: a drawing only, set by the screen (see setHighlight). */
  highlight: BarRange | null;
  /** The bars the score draws, or null for all of them (see setVisibleBars). */
  visibleBars: BarRange | null;
  /** The score's tracks for the mixer; empty until the score has loaded. */
  tracks: readonly TrackMix[];
  /** The count-in beat sounding now; null outside a count-in and before its first click. */
  countIn: CountInBeat | null;
  /**
   * What the count-in under way is for: the `start` of a run the user asked for, or
   * a `repeat` of the loop. Null outside a count-in. A screen can't tell the two from
   * the statuses it saw: alphaTab may report "stopped" before "finished" at the end
   * of a pass, and a render between them sees `ready`, then `countingIn`, as for Play.
   */
  countInCause: CountInCause | null;
}

export type CountInCause = 'start' | 'repeat';

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
   * The score has been drawn, or drawn again (a new width, a change of
   * layout): every bar may be somewhere else, and `barRectInWindow` answers
   * for the new drawing. For a screen that keeps a bar on show itself.
   */
  rendered: undefined;
  /**
   * The user dragged a mouse across bars (desktop only; a finger scrolls).
   * 1-based and in ascending order whichever way the drag ran. Fires as the
   * drag reaches each bar, and once more with `done` on release. No barTapped
   * follows a drag. Like a tap, nothing happens by itself.
   */
  /** `done` on release; with `cancelled` too when the browser took the press away, picking nothing. */
  barsDragged: BarRange & { done: boolean; cancelled?: true };
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
  soundFontUrls?: readonly string[];
  wakeLock?: WakeLockControl;
  /** Runs inside the play tap, before the engine starts. */
  unlockAudio?: () => void;
  /** Where count-in clicks sound; tests pass a fake. */
  clicks?: ClickOutput;
  /** The bars the score starts drawn with (see setVisibleBars); the whole score when absent. */
  visibleBars?: BarRange | null;
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
    metronomeVoice: options.metronomeVoice,
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
    allMuted: false,
    range: null,
    looping: false,
    highlight: null,
    visibleBars: null,
    tracks: [],
    countIn: null,
    countInCause: null,
  };
}

export class PlayerService {
  private readonly engine: PlayerEngine;
  private readonly drumTrackIndex: number | null;
  private readonly soundFontUrls: readonly string[];
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
  /** A showBar asked for before the song was ready, done once it is (see showBar). */
  private pendingShowBar: { barNumber: number; nextBarNumber: number | null } | null = null;
  /** Counts what has asked for `pendingShowBar`, so only the latest asker can drop it (see showBar). */
  private showBarRequests = 0;
  /** Cancels the count-in that is clicking now; null once it has handed over to playback. */
  private cancelCountIn: (() => void) | null = null;
  /**
   * Pause or stop was sent to a playing engine, and nothing has asked for
   * playback since. A pass end already on its way from alphaTab's worker must
   * not start the next count-in over the user's Pause, whether it lands before
   * or after the engine's "stopped", so only play() and load() clear this.
   */
  private haltRequested = false;
  /**
   * The engine was told to play and then, before it said it was playing,
   * told to pause (callOffCountIn). Its "playing" for that play() may still
   * be on its way, and must not end a count-in started since. Cleared by the
   * next startEngine().
   */
  private playCalledOff = false;
  /** The loaded score's track names, by index; empty until it has loaded. */
  private trackNames: readonly string[] = [];
  /** The engine was last sent Drums only's mutes, which it keeps until every track is sent again. */
  private engineHoldsDrumsOnly = false;
  private soundFontRequested = false;
  private disposed = false;
  private snapshot: PlayerSnapshot;

  constructor(engine: PlayerEngine, config: PlayerServiceConfig) {
    this.engine = engine;
    this.drumTrackIndex = config.drumTrackIndex;
    this.soundFontUrls = config.soundFontUrls ?? PLAYER_SOUND_FONT_URLS;
    this.wakeLock = config.wakeLock ?? screenWakeLock();
    this.unlockAudio = config.unlockAudio ?? (() => preferPlaybackAudioSession());
    this.clicks = config.clicks ?? webClickOutput();
    this.snapshot = initialPlayerSnapshot(config.drumTrackIndex, config.options);
    if (this.drumTrackIndex !== null) {
      this.mutedTracks.set(this.drumTrackIndex, this.snapshot.drumsMuted);
    }
    this.wireEngine();
    // Before any load, so the first drawing is already the bars asked for.
    if (config.visibleBars) this.setVisibleBars(config.visibleBars);
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
    this.trackNames = [];
    this.update({
      status: 'loading',
      error: null,
      barCount: null,
      barNumber: null,
      barTempo: null,
      tracks: [],
    });
    this.wakeLock.setActive(false);
    this.requestSoundFont();
    // Before the score, so the first MIDI already has the right clicks.
    this.engine.setMetronomeVoice(this.snapshot.metronomeVoice);
    // The part being practised sits on top of the band, not level with it.
    if (this.drumTrackIndex !== null) {
      this.engine.setTrackVolume(this.drumTrackIndex, DRUM_TRACK_GAIN);
    }
    if (!this.engine.loadScore(bytes, [this.drumTrackIndex ?? 0])) this.fail('score');
  }

  /**
   * After the soundfont failed to load (offline before the service worker had
   * it, say), tries again: the page calls this when the connection comes
   * back. Does nothing in any other state. alphaTab reports ready for playback
   * once the sounds are in, as it would have the first time.
   */
  retrySoundFont(): void {
    if (this.disposed || this.snapshot.error !== 'soundFont') return;
    this.update({ status: 'loading', error: null });
    this.requestSoundFont();
  }

  private requestSoundFont(): void {
    if (this.soundFontRequested) return;
    this.soundFontRequested = true;
    this.engine.loadSoundFont(this.soundFontUrls).catch(() => {
      // So a later load or retry tries again instead of waiting forever for sounds.
      this.soundFontRequested = false;
      this.fail('soundFont');
    });
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
    this.startEngine();
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
    if (recount && !this.beginCountIn(barNumber)) this.startEngine();
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
   * a tapped bar would move under the finger. Scrolling only. Asked before the
   * song is ready (a loop opened by link while the sounds load), or before the
   * notation has rendered (the sounds cached, the score still drawing), it is
   * kept and done when both are; a setRange meanwhile drops it.
   *
   * `nextBarNumber` is the bar played after it, for a screen that keeps a bar
   * on show while something else plays (a recording): the box then turns a
   * line early, so the line after the bar is on show too (`scrollToShow`).
   *
   * Returns a way to drop the request while it is still kept, for a caller that may
   * stop wanting the bar before it can be shown (a form whose typed bars change, or
   * that closes). It drops only its own: once anything else has asked for a bar, or
   * a count-in has, it does nothing. Callers whose bar is the range's needn't keep it.
   */
  showBar(barNumber: number, nextBarNumber: number | null = null): () => void {
    this.showBarRequests += 1;
    const request = this.showBarRequests;
    this.requestShowBar(barNumber, nextBarNumber);
    return () => {
      if (this.showBarRequests === request) this.pendingShowBar = null;
    };
  }

  private requestShowBar(barNumber: number, nextBarNumber: number | null = null): void {
    if (this.disposed) return;
    if (!this.isLoaded()) {
      this.pendingShowBar = { barNumber, nextBarNumber };
      return;
    }
    if (this.snapshot.status === 'playing') return;
    if (startTickOfBar(this.bars, barNumber) === null) return;
    const next =
      nextBarNumber !== null && startTickOfBar(this.bars, nextBarNumber) !== null
        ? nextBarNumber
        : null;
    this.scrollToBarWhenRendered(barNumber, next);
  }

  /** The engine can't scroll to a bar before the score has bounds; then it waits for `rendered`. */
  private scrollToBarWhenRendered(barNumber: number, nextBarNumber: number | null = null): void {
    const done =
      nextBarNumber === null
        ? this.engine.scrollToBar(barNumber - 1)
        : this.engine.scrollToBar(barNumber - 1, nextBarNumber - 1);
    this.pendingShowBar = done ? null : { barNumber, nextBarNumber };
  }

  private showPendingBar(): void {
    const shown = this.pendingShowBar;
    this.pendingShowBar = null;
    // Not showBar: the bar is still its first asker's to drop.
    if (shown !== null) this.requestShowBar(shown.barNumber, shown.nextBarNumber);
  }

  /** The tempo a 1-based bar starts at, in the file's BPM; null before the score loads or for no such bar. */
  tempoAtBar(barNumber: number): number | null {
    return tempoAtBar(this.barTempos, barNumber);
  }

  /**
   * The song's bars in the order they are played, with their ticks and the
   * tempos inside them: what a screen times the tab from when something
   * else's clock says where the song is (a recording, Unit 19). Empty until
   * the ticks are in, which is before the status leaves `loading`.
   */
  playedBars(): readonly BarTicks[] {
    return this.bars;
  }

  /**
   * Where a 1-based bar is drawn in the window now, or null when it can't be
   * told (nothing rendered yet, a redraw on its way, a bar not drawn). A
   * reading only; `showBar` is what scrolls the score box.
   */
  barRectInWindow(barNumber: number): WindowRect | null {
    if (this.disposed || !showsScoreBars(this.snapshot)) return null;
    return this.engine.barRectInWindow(barNumber - 1);
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
    // A bar kept to show was for the range this replaces.
    this.pendingShowBar = null;
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
   * The metronome's sounds and subdivision, at any time. The engine rebuilds the
   * song's MIDI for it; while playing it starts again from the same tick and
   * reports neither the stop nor the start, so to the service it is live like
   * the other options (a short gap may be heard). Refused (false) once failed.
   */
  setMetronomeVoice(voice: MetronomeVoice): boolean {
    if (this.disposed || this.snapshot.status === 'error') return false;
    if (isSameVoice(voice, this.snapshot.metronomeVoice)) return true;
    this.update({ metronomeVoice: voice });
    this.engine.setMetronomeVoice(voice);
    return true;
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
      this.startEngine();
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
      this.update(this.tracksPatch());
      this.applyTrackMute(trackIndex);
      return;
    }
    // Muted drums with everything else silenced would be a song with no sound.
    const leavesDrumsOnly = muted && this.snapshot.drumsOnly;
    this.update({
      drumsMuted: muted,
      ...(leavesDrumsOnly && { drumsOnly: false }),
      ...this.tracksPatch(),
    });
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
    this.update(
      drumsOnly ? { drumsOnly, drumsMuted: false, ...this.tracksPatch() } : { drumsOnly },
    );
    this.applyEveryTrackMute();
  }

  /**
   * Silences every track, or lets them sound again as they were: Mute drums,
   * Drums only and each track's own switch keep what they are set to
   * underneath, and can be changed meanwhile. Live, like the other options.
   */
  setAllMuted(allMuted: boolean): void {
    if (this.disposed || allMuted === this.snapshot.allMuted) return;
    this.update({ allMuted });
    this.applyEveryTrackMute();
  }

  setLayout(layout: LayoutChoice): void {
    if (this.disposed) return;
    this.engine.setLayout(layout);
  }

  /**
   * Whether the score box follows the tab's own cursor (alphaTab's scroll
   * while playing and after every drawing). Off while the score is only read
   * under a recording, where the screen keeps another bar on show and the
   * tab's cursor is hidden. Live: nothing is drawn again, stopped or played.
   * `showBar` works either way.
   */
  setCursorScroll(on: boolean): void {
    if (this.disposed) return;
    this.engine.setCursorScroll(on);
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

  /**
   * Draws only these bars of the score (1-based, inclusive), or the whole
   * score for null: the practice screen shows its loop and a bar either side.
   * A drawing only, like setHighlight: what plays, the playback position and
   * the range are untouched, so it is live. Bars outside it can't be tapped
   * (they aren't drawn), and a showBar for one is a no-op.
   */
  setVisibleBars(visibleBars: BarRange | null): void {
    if (this.disposed) return;
    if (isSameBarRange(this.snapshot.visibleBars, visibleBars)) return;
    this.update({ visibleBars });
    this.engine.setVisibleBars(
      visibleBars && {
        startBarIndex: visibleBars.startBar - 1,
        endBarIndex: visibleBars.endBar - 1,
      },
    );
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
    engine.on('scoreLoaded', ({ barCount, trackNames, barTempos, barMeters }) => {
      if (this.disposed) return;
      this.trackNames = trackNames;
      this.barTempos = barTempos;
      this.barMeters = barMeters;
      this.update({
        barCount,
        barNumber: 1,
        barTempo: tempoAtBar(barTempos, 1),
        ...this.tracksPatch(),
      });
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
      this.showPendingBar();
    });
    engine.on('rendered', () => {
      if (this.disposed) return;
      if (this.isLoaded()) this.showPendingBar();
      this.events.emit('rendered', undefined);
    });
    engine.on('stateChanged', ({ playing }) => {
      if (this.disposed) return;
      if (this.snapshot.status === 'error') return;
      if (this.snapshot.status === 'loading' && !playing) return;
      // Before a repeat's count-in alphaTab stops at the end of the pass; that isn't a pause.
      if (this.snapshot.status === 'countingIn' && !playing) return;
      // The answer to a play() the service has since called off (a loop switched just
      // after its downbeat), with the pause sent then still to come: the count-in now
      // clicking is the current one, and it plays the engine itself at its downbeat.
      if (playing && this.cancelCountIn !== null && this.playCalledOff) return;
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
    // Taps and drags pick bars as soon as the score shows them; jam mode's seek has its own gate.
    engine.on('barTapped', ({ barIndex }) => {
      if (this.disposed || !showsScoreBars(this.snapshot)) return;
      this.events.emit('barTapped', { barNumber: barIndex + 1 });
    });
    engine.on('barsDragged', ({ fromBarIndex, toBarIndex, done, cancelled }) => {
      if (this.disposed || !showsScoreBars(this.snapshot)) return;
      const [startBar, endBar] = orderedBars(fromBarIndex + 1, toBarIndex + 1);
      this.events.emit('barsDragged', { startBar, endBar, done, ...(cancelled && { cancelled }) });
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
  private beginCountIn(
    barNumber: number,
    // A count-in restarted by a seek is still for what it was for; from ready it is a start.
    cause: CountInCause = this.snapshot.countInCause ?? 'start',
  ): boolean {
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
          this.startEngine();
        },
      },
    );
    if (!cancel) return false;
    this.cancelCountIn = cancel;
    // The count-in is for reading the bar ahead, and the engine, not playing yet, won't scroll
    // to it: the user may have scrolled away, or a repeat's pass ended lines below its start.
    this.scrollToBarWhenRendered(barNumber);
    // The bar kept to show is now the count-in's, not a screen's to drop.
    this.showBarRequests += 1;
    this.update({ status: 'countingIn', countIn: null, countInCause: cause });
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
    if (!this.beginCountIn(range?.startBar ?? 1, 'repeat')) this.startEngine();
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
    if (!handedOver) return;
    this.engine.pause();
    this.playCalledOff = true;
  }

  /** Every engine.play() goes through here. */
  private startEngine(): void {
    this.playCalledOff = false;
    this.engine.play();
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
    if (this.overridesTrackMutes() || this.engineHoldsDrumsOnly) this.applyEveryTrackMute();
    else for (const trackIndex of this.mutedTracks.keys()) this.applyTrackMute(trackIndex);
  }

  /** For Drums only going on or off, which changes tracks that have no mute on record. */
  private applyEveryTrackMute(): void {
    if (this.trackNames.length === 0) return;
    for (let trackIndex = 0; trackIndex < this.trackNames.length; trackIndex++) {
      this.applyTrackMute(trackIndex);
    }
    this.engineHoldsDrumsOnly = this.overridesTrackMutes();
  }

  /** Drums only or Mute all: tracks with no mute on record are silenced too. */
  private overridesTrackMutes(): boolean {
    return this.snapshot.drumsOnly || this.snapshot.allMuted;
  }

  /** Tracks the loaded score doesn't have yet are skipped; applyMutes sends them once it does. */
  private applyTrackMute(trackIndex: number): void {
    if (trackIndex >= this.trackNames.length) return;
    this.engine.setTrackMuted(trackIndex, this.isTrackSilenced(trackIndex));
  }

  /**
   * The mixer's view of the loaded score's tracks (the mute on record, not
   * Drums only's), as a patch for update(): empty when nothing in it changed,
   * since a new array would notify subscribers for nothing.
   */
  private tracksPatch(): { tracks?: TrackMix[] } {
    const tracks = this.trackNames.map((name, index) => ({
      index,
      // A file may leave a track unnamed; the mixer still needs words for its switch.
      name: name.trim() || `Track ${index + 1}`,
      muted: this.mutedTracks.get(index) ?? false,
      drums: index === this.drumTrackIndex,
    }));
    const current = this.snapshot.tracks;
    const same =
      tracks.length === current.length &&
      tracks.every((track, index) => {
        const was = current[index];
        return was?.name === track.name && was.muted === track.muted && was.drums === track.drums;
      });
    return same ? {} : { tracks };
  }

  /** What the engine should have for a track: Drums only wins over the mute on record. */
  private isTrackSilenced(trackIndex: number): boolean {
    if (this.snapshot.allMuted) return true;
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
  private update(change: Partial<PlayerSnapshot>): void {
    // A count-in's cause goes with it, whichever way the count-in ends.
    const counting = (change.status ?? this.snapshot.status) === 'countingIn';
    const patch = counting ? change : { ...change, countInCause: null };
    const keys = Object.keys(patch) as (keyof PlayerSnapshot)[];
    if (!keys.some((key) => this.snapshot[key] !== patch[key])) return;
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener();
  }
}
