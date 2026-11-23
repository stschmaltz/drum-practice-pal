/**
 * A PlayerService set up for count-in tests: a loaded song over a fake engine
 * and a fake click output, plus the steps alphaTab would take. Shared by the
 * count-in test files; call `vi.useFakeTimers()` first, since the click
 * output's clock follows the fake timers.
 */
import type { Meter } from '@/features/player/countIn';
import {
  COUNT_IN_START_DELAY_SECONDS,
  PLAY_START_LEAD_SECONDS,
} from '@/features/player/countInRunner';
import { DEFAULT_PLAYER_OPTIONS, type PlayerOptions } from '@/features/player/playerOptions';
import { PlayerService } from '@/features/player/PlayerService';
import type { WakeLockControl } from '@/features/player/wakeLock';
import { FakeClickOutput, FakePlayerEngine, TICKS_PER_BAR } from './fakePlayerEngine';

/** From Play to the first click. */
export const START_DELAY_MS = COUNT_IN_START_DELAY_SECONDS * 1000;
/** How far ahead of the downbeat engine.play() is called. */
export const LEAD_MS = PLAY_START_LEAD_SECONDS * 1000;
/** One bar of 4/4 at 120 BPM and 100%. */
export const BAR_MS = 2000;
/** Where the loop `loopingBars5To8` sets up starts. */
export const LOOP_START_TICK = 4 * TICKS_PER_BAR;

export const EVERY_REPEAT = { options: { countInBars: 1, countInMode: 'every_repeat' } } as const;
export const START_ONLY = { options: { countInBars: 1, countInMode: 'start' } } as const;

export interface CountInSetup {
  /** On top of the defaults with a one-bar count-in. */
  options?: Partial<PlayerOptions>;
  barTempos?: readonly number[];
  /** Every bar's time signature. */
  meter?: Meter;
  /** One meter per bar, for a song whose time signature changes. */
  barMeters?: readonly Meter[];
  /** False leaves the song loading. */
  loaded?: boolean;
}

/** A song stopped at bar 1 (16 bars of 4/4 at 120 BPM unless told otherwise), counting one bar in. */
export function setupCountIn({
  options,
  barTempos,
  meter,
  barMeters,
  loaded = true,
}: CountInSetup = {}) {
  const engine = new FakePlayerEngine();
  const clicks = new FakeClickOutput();
  const wakeLock = { setActive: vi.fn(), dispose: vi.fn() } satisfies WakeLockControl;
  const service = new PlayerService(engine, {
    drumTrackIndex: 0,
    wakeLock,
    unlockAudio: vi.fn(),
    clicks,
    options: { ...DEFAULT_PLAYER_OPTIONS, countInBars: 1, ...options },
  });
  service.load(new Uint8Array([1]));
  if (loaded) engine.finishLoading({ barCount: barMeters?.length, barTempos, meter, barMeters });
  engine.setLooping.mockClear();
  // So restartCalls() counts only what the test itself causes.
  engine.loadScore.mockClear();
  return { engine, clicks, wakeLock, service };
}

export type CountInContext = ReturnType<typeof setupCountIn>;

/** What alphaTab reports once play() takes effect. */
export function enginePlays(engine: FakePlayerEngine): void {
  engine.fire('stateChanged', { playing: true });
}

/** What alphaTab does at the end of a pass with its own looping off: finished, then stopped. */
export function engineFinishesPass(engine: FakePlayerEngine, rangeStartTick = 0): void {
  engine.fire('finished', undefined);
  engine.fire('stateChanged', { playing: false });
  engine.fire('position', { tick: rangeStartTick });
}

/**
 * Looping bars 5 to 8 and playing, with the first count-in (if any) done and
 * its clicks and engine.play() call cleared, so a test sees only the repeats.
 */
export function loopingBars5To8(setup: CountInSetup): CountInContext {
  const ctx = setupCountIn(setup);
  ctx.service.setRange({ startBar: 5, endBar: 8 });
  ctx.service.setLooping(true);
  ctx.engine.fire('position', { tick: LOOP_START_TICK });
  ctx.service.play();
  // Long enough for a two-bar count-in.
  vi.advanceTimersByTime(START_DELAY_MS + 2 * BAR_MS);
  enginePlays(ctx.engine);
  ctx.engine.play.mockClear();
  ctx.clicks.scheduled = [];
  ctx.clicks.cancelSession.mockClear();
  return ctx;
}

/** Seconds from the first click to each click, counting only the clicks scheduled from index `from` on. */
export function clickOffsets(clicks: FakeClickOutput, from = 0): number[] {
  const scheduled = clicks.scheduled.slice(from);
  const first = scheduled[0]?.click.time ?? 0;
  return scheduled.map(({ click }) => Number((click.time - first).toFixed(6)));
}
