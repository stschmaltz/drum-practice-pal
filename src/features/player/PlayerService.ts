/**
 * The one player every screen uses. It owns playback state and the options
 * the controls bar changes, and talks to alphaTab only through PlayerEngine,
 * so it has no alphaTab import and its state machine is unit tested with a
 * fake engine. React reads it through usePlayer (subscribe / getSnapshot).
 *
 * Bar numbers here are 1-based; the engine works in ticks and 0-based bar
 * indexes (see barTicks.ts).
 */
import { preferPlaybackAudioSession } from './audioSession';
import { barIndexAtTick, barRangeToTicks, startTickOfBar, type BarTicks } from './barTicks';
import { createEmitter, type Handler } from './emitter';
import type { LayoutChoice } from './layout';
import type { PlayerEngine } from './playerEngine';
import { clampVolume, effectiveMetronomeVolume, type PlayerOptions } from './playerOptions';
import { PLAYER_SOUND_FONT_URL } from './soundFont';
import { clampSpeedRatio } from './speed';
import { screenWakeLock, type WakeLockControl } from './wakeLock';

/**
 * loading: score or soundfont not ready yet. ready: stopped or paused, can
 * play. playing: sound is coming out. error: the song can't be played.
 */
export type PlayerStatus = 'loading' | 'ready' | 'playing' | 'error';

/** What failed; the UI maps it to fixed copy (playerMessages.ts). engine: alphaTab itself didn't start. */
export type PlayerError = 'score' | 'soundFont' | 'engine';

/** 1-based, inclusive. */
export interface BarRange {
  startBar: number;
  endBar: number;
}

export interface PlayerSnapshot extends PlayerOptions {
  status: PlayerStatus;
  error: PlayerError | null;
  /** Null until the score has loaded. */
  barCount: number | null;
  /** The bar playing now, or where playback will resume. */
  barNumber: number | null;
  hasDrumTrack: boolean;
  range: BarRange | null;
  looping: boolean;
}

export type PlayerEvents = {
  position: { tick: number; barNumber: number | null };
  barChanged: { barNumber: number | null };
  /** A loop pass ended and playback went back to the range start. */
  loopWrapped: undefined;
  /** Playback reached the end with looping off, and stopped. */
  finished: undefined;
};

export interface PlayerServiceConfig {
  /** From songs.drum_track_index: the track that renders and that "Mute drums" mutes. */
  drumTrackIndex: number | null;
  options: PlayerOptions;
  soundFontUrl?: string;
  wakeLock?: WakeLockControl;
  /** Runs inside the play tap, before the engine starts. */
  unlockAudio?: () => void;
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
    status: 'loading',
    error: null,
    barCount: null,
    barNumber: null,
    hasDrumTrack: drumTrackIndex !== null,
    range: null,
    looping: false,
  };
}

export class PlayerService {
  private readonly engine: PlayerEngine;
  private readonly drumTrackIndex: number | null;
  private readonly soundFontUrl: string;
  private readonly wakeLock: WakeLockControl;
  private readonly unlockAudio: () => void;
  private readonly events = createEmitter<PlayerEvents>();
  private readonly listeners = new Set<() => void>();
  /** Mute state per track index, kept across loads and applied once tracks exist. */
  private readonly mutedTracks = new Map<number, boolean>();
  private bars: BarTicks[] = [];
  private trackCount = 0;
  private soundFontRequested = false;
  private disposed = false;
  private snapshot: PlayerSnapshot;

  constructor(engine: PlayerEngine, config: PlayerServiceConfig) {
    this.engine = engine;
    this.drumTrackIndex = config.drumTrackIndex;
    this.soundFontUrl = config.soundFontUrl ?? PLAYER_SOUND_FONT_URL;
    this.wakeLock = config.wakeLock ?? screenWakeLock();
    this.unlockAudio = config.unlockAudio ?? (() => preferPlaybackAudioSession());
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
    if (this.isLoaded()) this.engine.stop();
    this.bars = [];
    this.trackCount = 0;
    this.update({ status: 'loading', error: null, barCount: null, barNumber: null });
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
    this.unlockAudio();
    this.engine.play();
  }

  pause(): void {
    if (this.disposed || this.snapshot.status !== 'playing') return;
    this.engine.pause();
  }

  togglePlay(): void {
    if (this.snapshot.status === 'playing') this.pause();
    else this.play();
  }

  /** Stops and goes back to the start of the song, or of the range when one is set. */
  stop(): void {
    if (this.disposed || !this.isLoaded()) return;
    this.engine.stop();
  }

  /** Moves playback to the start of a bar, playing or not. False when the bar doesn't exist (yet). */
  seekToBar(barNumber: number): boolean {
    if (this.disposed) return false;
    const tick = startTickOfBar(this.bars, barNumber);
    if (tick === null) return false;
    this.engine.seek(tick);
    return true;
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
    this.update({ range });
    this.applyRange();
  }

  /** Repeats the range (or the whole song) until turned off. */
  setLooping(looping: boolean): void {
    if (this.disposed) return;
    this.update({ looping });
    this.engine.setLooping(looping);
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
    this.engine.setMetronomeVolume(effectiveMetronomeVolume(this.snapshot));
  }

  setMetronomeVolume(volume: number): void {
    if (this.disposed) return;
    this.update({ metronomeVolume: clampVolume(volume) });
    this.engine.setMetronomeVolume(effectiveMetronomeVolume(this.snapshot));
  }

  setTrackMuted(trackIndex: number, muted: boolean): void {
    if (this.disposed) return;
    this.mutedTracks.set(trackIndex, muted);
    if (trackIndex === this.drumTrackIndex) this.update({ drumsMuted: muted });
    if (trackIndex < this.trackCount) this.engine.setTrackMuted(trackIndex, muted);
  }

  /** A no-op for a song without a drum track. */
  setDrumsMuted(muted: boolean): void {
    if (this.drumTrackIndex !== null) this.setTrackMuted(this.drumTrackIndex, muted);
  }

  setLayout(layout: LayoutChoice): void {
    if (this.disposed) return;
    this.engine.setLayout(layout);
  }

  // --- Teardown ---

  /** Stops sound, releases the wake lock and alphaTab's worker and audio. Safe to call twice. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.wakeLock.dispose();
    this.events.clear();
    this.listeners.clear();
    this.engine.destroy();
  }

  // --- Engine events ---

  private wireEngine(): void {
    // Every handler checks `disposed`: alphaTab's worker can still post after destroy().
    const engine = this.engine;
    engine.on('scoreLoaded', ({ barCount, trackCount }) => {
      if (this.disposed) return;
      this.trackCount = trackCount;
      this.update({ barCount, barNumber: 1 });
      this.applyMutes();
    });
    engine.on('ticksReady', ({ bars }) => {
      if (this.disposed) return;
      this.bars = bars;
      this.applyAll();
    });
    engine.on('readyForPlayback', () => {
      if (this.disposed || this.snapshot.status !== 'loading') return;
      // alphaTab resets channel volumes when it gets ready, so mutes go on again after.
      this.applyAll();
      this.update({ status: 'ready' });
    });
    engine.on('stateChanged', ({ playing }) => {
      if (this.disposed || this.snapshot.status === 'error') return;
      if (this.snapshot.status === 'loading' && !playing) return;
      this.update({ status: playing ? 'playing' : 'ready' });
      this.wakeLock.setActive(playing);
    });
    engine.on('position', ({ tick }) => {
      if (this.disposed) return;
      const barIndex = barIndexAtTick(this.bars, tick);
      const barNumber = barIndex === null ? this.snapshot.barNumber : barIndex + 1;
      this.events.emit('position', { tick, barNumber });
      if (barNumber !== this.snapshot.barNumber) {
        this.update({ barNumber });
        this.events.emit('barChanged', { barNumber });
      }
    });
    engine.on('finished', () => {
      if (this.disposed) return;
      this.events.emit(this.snapshot.looping ? 'loopWrapped' : 'finished', undefined);
    });
    engine.on('error', () => {
      if (this.disposed) return;
      this.fail('score');
    });
  }

  private fail(error: PlayerError): void {
    if (this.disposed || this.snapshot.status === 'error') return;
    const wasPlaying = this.snapshot.status === 'playing';
    this.update({ status: 'error', error });
    this.wakeLock.setActive(false);
    if (wasPlaying) this.engine.stop();
  }

  private isLoaded(): boolean {
    return this.snapshot.status === 'ready' || this.snapshot.status === 'playing';
  }

  private applyAll(): void {
    this.engine.setSpeed(this.snapshot.speedRatio);
    this.engine.setMetronomeVolume(effectiveMetronomeVolume(this.snapshot));
    this.engine.setLooping(this.snapshot.looping);
    this.applyMutes();
    this.applyRange();
  }

  private applyMutes(): void {
    for (const [trackIndex, muted] of this.mutedTracks) {
      if (trackIndex < this.trackCount) this.engine.setTrackMuted(trackIndex, muted);
    }
  }

  private applyRange(): void {
    if (this.bars.length === 0) return;
    const range = this.snapshot.range;
    const ticks = range ? barRangeToTicks(this.bars, range.startBar, range.endBar) : null;
    // A range set before loading that this song doesn't have: drop it rather than loop nothing.
    if (range && !ticks) this.update({ range: null });
    this.engine.setPlaybackRange(ticks);
  }

  private update(patch: Partial<PlayerSnapshot>): void {
    let changed = false;
    for (const key of Object.keys(patch) as (keyof PlayerSnapshot)[]) {
      if (this.snapshot[key] !== patch[key]) changed = true;
    }
    if (!changed) return;
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener();
  }
}
