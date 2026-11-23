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
  setTrackMuted = vi.fn();
  setPlaybackRange = vi.fn();
  setLooping = vi.fn();
  destroy = vi.fn();

  on<K extends keyof EngineEvents>(event: K, handler: (payload: EngineEvents[K]) => void): void {
    this.emitter.on(event, handler);
  }

  fire<K extends keyof EngineEvents>(event: K, payload: EngineEvents[K]): void {
    this.emitter.emit(event, payload);
  }

  /**
   * What alphaTab does after a successful load of a song with `barCount`
   * straight bars. Every bar is 4/4 at 120 BPM unless `meter` or `barTempos` says otherwise.
   */
  finishLoading({
    barCount = 16,
    trackCount = 3,
    barTempos = Array.from({ length: barCount }, () => 120),
    meter = COMMON_TIME,
  }: {
    barCount?: number;
    trackCount?: number;
    barTempos?: readonly number[];
    /** Every bar's time signature. */
    meter?: Meter;
  } = {}): void {
    this.fire('scoreLoaded', {
      barCount,
      trackCount,
      barTempos: [...barTempos],
      barMeters: Array.from({ length: barCount }, () => meter),
    });
    this.fire('ticksReady', { bars: straightBars(barCount) });
    this.fire('readyForPlayback', undefined);
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
