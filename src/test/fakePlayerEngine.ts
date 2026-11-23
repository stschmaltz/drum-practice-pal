/**
 * A PlayerEngine for tests: records every call and lets the test fire the
 * events alphaTab would. Pair with PlayerService directly, or hand
 * `fakeEngineFactory(engine)` to usePlayer.
 */
import { createEmitter } from '@/features/player/emitter';
import type { BarTicks } from '@/features/player/barTicks';
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

export class FakePlayerEngine implements PlayerEngine {
  private readonly emitter = createEmitter<EngineEvents>();
  mount: EngineMount | null = null;
  loadScoreResult = true;
  soundFont: Promise<void> = Promise.resolve();

  loadScore = vi.fn<PlayerEngine['loadScore']>(() => this.loadScoreResult);
  loadSoundFont = vi.fn<PlayerEngine['loadSoundFont']>(() => this.soundFont);
  setLayout = vi.fn();
  play = vi.fn();
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
   * straight bars. Every bar is at 120 BPM unless `barTempos` says otherwise.
   */
  finishLoading({
    barCount = 16,
    trackCount = 3,
    barTempos = Array.from({ length: barCount }, () => 120),
  }: { barCount?: number; trackCount?: number; barTempos?: number[] } = {}): void {
    this.fire('scoreLoaded', { barCount, trackCount, barTempos });
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
