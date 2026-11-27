/**
 * A PlayerEngine for tests: records every call and lets the test fire the
 * events alphaTab would. Pair with PlayerService directly, or hand
 * `fakeEngineFactory(engine)` to usePlayer.
 */
import { createEmitter } from '@/features/player/emitter';
import type { BarTicks } from '@/features/player/barTicks';
import type { ClickOutput, ClickSession } from '@/features/player/clickOutput';
import { COMMON_TIME, type CountInClick, type Meter } from '@/features/player/countIn';
import type {
  EngineEvents,
  EngineFactory,
  EngineMount,
  PlayerEngine,
} from '@/features/player/playerEngine';

export const TICKS_PER_BAR = 3840;

/** `count` bars of 4/4 in play order, with no repeats. */
export function straightBars(count: number): BarTicks[] {
  return Array.from({ length: count }, (_, barIndex) => ({
    barIndex,
    start: barIndex * TICKS_PER_BAR,
    end: (barIndex + 1) * TICKS_PER_BAR,
  }));
}

/** Bar `barNumber`'s start tick in a song of 4/4 bars played straight through. */
export const startOfBar = (barNumber: number) => (barNumber - 1) * TICKS_PER_BAR;

/** Bars of 4/4 in the order they play (1-based numbers), for a song whose repeats play some twice. */
export function barsInPlayOrder(barNumbers: readonly number[]): BarTicks[] {
  return barNumbers.map((barNumber, position) => ({
    barIndex: barNumber - 1,
    start: position * TICKS_PER_BAR,
    end: (position + 1) * TICKS_PER_BAR,
  }));
}

/** `barTempos` like the tempo-change fixture: 16 bars, 120 BPM for bars 1 to 8, 90 from bar 9. */
export const TEMPO_CHANGE_BAR_TEMPOS: readonly number[] = Array.from(
  { length: 16 },
  (_, barIndex) => (barIndex < 8 ? 120 : 90),
);

export class FakePlayerEngine implements PlayerEngine {
  private readonly emitter = createEmitter<EngineEvents>();
  mount: EngineMount | null = null;
  loadScoreResult = true;
  soundFont: Promise<void> = Promise.resolve();
  /** False until the notation has rendered, for a test where the sounds are in first: scrollToBar can't scroll yet. */
  laidOut = true;

  loadScore = vi.fn<PlayerEngine['loadScore']>(() => this.loadScoreResult);
  loadSoundFont = vi.fn<PlayerEngine['loadSoundFont']>(() => this.soundFont);
  setLayout = vi.fn();
  play = vi.fn();
  unlockAudio = vi.fn();
  pause = vi.fn();
  stop = vi.fn();
  seek = vi.fn();
  setSpeed = vi.fn();
  setMetronomeVolume = vi.fn();
  setMetronomeVoice = vi.fn();
  setTrackMuted = vi.fn();
  setPlaybackRange = vi.fn();
  setLooping = vi.fn();
  setHighlight = vi.fn();
  scrollToBar = vi.fn<PlayerEngine['scrollToBar']>(() => this.laidOut);
  destroy = vi.fn();

  on<K extends keyof EngineEvents>(event: K, handler: (payload: EngineEvents[K]) => void): void {
    this.emitter.on(event, handler);
  }

  fire<K extends keyof EngineEvents>(event: K, payload: EngineEvents[K]): void {
    this.emitter.emit(event, payload);
  }

  /**
   * What alphaTab does after a successful load of a song with `barCount`
   * straight bars (or `bars`, for a song whose repeats play some twice).
   * Every bar is 4/4 at 120 BPM unless `meter`, `barMeters` or `barTempos`
   * says otherwise.
   */
  finishLoading({
    barCount = 16,
    trackCount = 3,
    barTempos = Array.from({ length: barCount }, () => 120),
    meter = COMMON_TIME,
    barMeters = Array.from({ length: barCount }, () => meter),
    bars = straightBars(barCount),
  }: {
    barCount?: number;
    trackCount?: number;
    barTempos?: readonly number[];
    /** Every bar's time signature. */
    meter?: Meter;
    /** One meter per bar, for a song whose time signature changes; pass a matching `barCount`. */
    barMeters?: readonly Meter[];
    /** The bars in play order, when that isn't 1 to `barCount` straight through. */
    bars?: readonly BarTicks[];
  } = {}): void {
    this.fire('scoreLoaded', {
      barCount,
      trackCount,
      barTempos: [...barTempos],
      barMeters: [...barMeters],
    });
    this.fire('ticksReady', { bars: [...bars] });
    this.fire('readyForPlayback', undefined);
  }

  /**
   * The tracks left sounding, out of `trackCount`, after every mute sent so
   * far. Like alphaTab's synth, a track sounds until it is muted and a mute
   * stays until it is taken off again: nothing resets it, a reload included.
   */
  soundingTracks(trackCount = 3): number[] {
    const muted = new Map<number, boolean>();
    for (const [trackIndex, mute] of this.setTrackMuted.mock.calls as [number, boolean][]) {
      muted.set(trackIndex, mute);
    }
    return Array.from({ length: trackCount }, (_, trackIndex) => trackIndex).filter(
      (trackIndex) => !muted.get(trackIndex),
    );
  }

  /** The engine calls that would interrupt or restart playback. */
  restartCalls(): number {
    return (
      this.play.mock.calls.length +
      this.pause.mock.calls.length +
      this.stop.mock.calls.length +
      this.loadScore.mock.calls.length
    );
  }
}

export function fakeEngineFactory(engine: FakePlayerEngine): EngineFactory {
  return async (mount) => {
    engine.mount = mount;
    return engine;
  };
}

/**
 * A ClickOutput for tests: no sound, and a clock that follows Date.now(), so
 * `vi.useFakeTimers()` plus `vi.advanceTimersByTime` moves a count-in along.
 */
export class FakeClickOutput implements ClickOutput {
  /** Every click handed over for scheduling, across count-ins. */
  scheduled: { click: CountInClick; volume: number }[] = [];
  unlock = vi.fn();
  dispose = vi.fn();
  cancelSession = vi.fn();

  open(onOpen: (session: ClickSession) => void): () => void {
    onOpen({
      now: () => Date.now() / 1000,
      schedule: (clicks, volume) => {
        for (const click of clicks) this.scheduled.push({ click, volume });
      },
      cancel: this.cancelSession,
    });
    return () => {};
  }
}
