import {
  FakeClickOutput,
  FakePlayerEngine,
  TEMPO_CHANGE_BAR_TEMPOS,
  TICKS_PER_BAR,
} from '@/test/fakePlayerEngine';
import type { Meter } from './countIn';
import { COUNT_IN_START_DELAY_SECONDS } from './countInRunner';
import { DEFAULT_PLAYER_OPTIONS, type PlayerOptions } from './playerOptions';
import { PlayerService } from './PlayerService';
import type { WakeLockControl } from './wakeLock';

const START_DELAY_MS = COUNT_IN_START_DELAY_SECONDS * 1000;
/** One bar of 4/4 at 120 BPM and 100%. */
const BAR_MS = 2000;
const WALTZ: Meter = { beats: 3, beatValue: 4 };

interface SetupOptions {
  options?: Partial<PlayerOptions>;
  barTempos?: readonly number[];
  meter?: Meter;
}

/** A loaded song, stopped at bar 1, with a fake click output on the fake-timer clock. */
function setup({ options, barTempos, meter }: SetupOptions = {}) {
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
  engine.finishLoading({ barTempos, meter });
  engine.setLooping.mockClear();
  // So restartCalls() counts only what the test itself causes.
  engine.loadScore.mockClear();
  return { engine, clicks, wakeLock, service };
}

/** What alphaTab reports once play() takes effect. */
function enginePlays(engine: FakePlayerEngine) {
  engine.fire('stateChanged', { playing: true });
}

/** What alphaTab does at the end of a pass with its own looping off: finished, then stopped. */
function engineFinishesPass(engine: FakePlayerEngine, rangeStartTick = 0) {
  engine.fire('finished', undefined);
  engine.fire('stateChanged', { playing: false });
  engine.fire('position', { tick: rangeStartTick });
}

const clickOffsets = (clicks: FakeClickOutput) => {
  const first = clicks.scheduled[0]?.click.time ?? 0;
  return clicks.scheduled.map(({ click }) => Number((click.time - first).toFixed(6)));
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('PlayerService count-in at the start', () => {
  it('plays straight away with the count-in off', () => {
    const { engine, service, clicks } = setup({ options: { countInBars: 0 } });
    service.play();
    expect(engine.play).toHaveBeenCalledTimes(1);
    expect(clicks.scheduled).toHaveLength(0);
    expect(clicks.unlock).not.toHaveBeenCalled();
  });

  it('counts one bar, then starts the engine on the downbeat', () => {
    const { engine, service, clicks } = setup();
    service.play();

    expect(service.getSnapshot().status).toBe('countingIn');
    expect(engine.play).not.toHaveBeenCalled();
    expect(clickOffsets(clicks)).toEqual([0, 0.5, 1, 1.5]);

    vi.advanceTimersByTime(START_DELAY_MS + BAR_MS - 100);
    expect(engine.play).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);
    expect(engine.play).toHaveBeenCalledTimes(1);

    enginePlays(engine);
    expect(service.getSnapshot()).toMatchObject({ status: 'playing', countIn: null });
  });

  it('wakes both audio outputs inside the play call, before anything is awaited', () => {
    const { engine, service, clicks } = setup();
    service.play();
    expect(clicks.unlock).toHaveBeenCalledTimes(1);
    expect(engine.unlockAudio).toHaveBeenCalledTimes(1);
  });

  it('counts two bars when asked', () => {
    const { engine, service, clicks } = setup({ options: { countInBars: 2 } });
    service.play();
    expect(clicks.scheduled).toHaveLength(8);
    expect(clicks.scheduled.filter(({ click }) => click.accent)).toHaveLength(2);

    vi.advanceTimersByTime(START_DELAY_MS + BAR_MS);
    expect(engine.play).not.toHaveBeenCalled();
    vi.advanceTimersByTime(BAR_MS);
    expect(engine.play).toHaveBeenCalledTimes(1);
  });

  it('shows each beat in the snapshot', () => {
    const { service } = setup({ options: { countInBars: 2 } });
    service.play();
    expect(service.getSnapshot().countIn).toBeNull();

    vi.advanceTimersByTime(START_DELAY_MS);
    expect(service.getSnapshot().countIn).toEqual({ bar: 1, beat: 1, bars: 2, beatsPerBar: 4 });

    vi.advanceTimersByTime(1500);
    expect(service.getSnapshot().countIn).toMatchObject({ bar: 1, beat: 4 });

    vi.advanceTimersByTime(500);
    expect(service.getSnapshot().countIn).toMatchObject({ bar: 2, beat: 1 });
  });

  it('follows the meter: three clicks a bar in 3/4', () => {
    const { service, clicks } = setup({ meter: WALTZ });
    service.play();
    expect(clickOffsets(clicks)).toEqual([0, 0.5, 1]);
    expect(clicks.scheduled.map(({ click }) => click.accent)).toEqual([true, false, false]);
  });

  it('follows the speed', () => {
    const { service, clicks } = setup();
    service.setSpeed(0.5);
    service.play();
    expect(clickOffsets(clicks)).toEqual([0, 1, 2, 3]);
  });

  it('uses the tempo of the bar playback starts on, after a tempo change', () => {
    const { service, clicks } = setup({ barTempos: TEMPO_CHANGE_BAR_TEMPOS });
    service.seekToBar(9);
    service.play();
    // 90 BPM: two thirds of a second per beat.
    expect(clickOffsets(clicks)).toEqual([0, 0.666667, 1.333333, 2]);
  });

  it('clicks at the metronome volume even with the metronome off', () => {
    const { service, clicks } = setup({ options: { metronomeOn: false, metronomeVolume: 0.4 } });
    service.play();
    expect(clicks.scheduled.every(({ volume }) => volume === 0.4)).toBe(true);
  });

  it('goes back to the start of the bar when paused part-way through it', () => {
    const { engine, service } = setup();
    engine.fire('position', { tick: 2 * TICKS_PER_BAR + 900 });
    service.play();
    expect(engine.seek).toHaveBeenCalledWith(2 * TICKS_PER_BAR);
  });

  it('does not seek when already on a bar line', () => {
    const { engine, service } = setup();
    engine.fire('position', { tick: 2 * TICKS_PER_BAR });
    service.play();
    expect(engine.seek).not.toHaveBeenCalled();
  });

  it('holds the wake lock through the count-in', () => {
    const { service, wakeLock } = setup();
    service.play();
    expect(wakeLock.setActive).toHaveBeenLastCalledWith(true);
  });

  it('plays at once when the bar has no usable tempo', () => {
    const { engine, service } = setup({ barTempos: Array<number>(16).fill(0) });
    service.play();
    expect(engine.play).toHaveBeenCalledTimes(1);
    expect(service.getSnapshot().status).toBe('ready');
  });
});

describe('PlayerService count-in interruptions', () => {
  it('pause calls the count-in off without touching the engine', () => {
    const { engine, service, clicks, wakeLock } = setup();
    service.play();
    vi.advanceTimersByTime(START_DELAY_MS + 600);

    service.pause();
    vi.advanceTimersByTime(5000);

    expect(service.getSnapshot()).toMatchObject({ status: 'ready', countIn: null });
    expect(engine.play).not.toHaveBeenCalled();
    expect(engine.pause).not.toHaveBeenCalled();
    expect(clicks.cancelSession).toHaveBeenCalledTimes(1);
    expect(wakeLock.setActive).toHaveBeenLastCalledWith(false);
  });

  it('togglePlay during a count-in cancels it, and again starts a new one', () => {
    const { service, clicks } = setup();
    service.togglePlay();
    service.togglePlay();
    expect(service.getSnapshot().status).toBe('ready');
    service.togglePlay();
    expect(service.getSnapshot().status).toBe('countingIn');
    expect(clicks.scheduled).toHaveLength(8);
  });

  it('pauses the engine when Pause lands between the downbeat and alphaTab reporting play', () => {
    const { engine, service } = setup();
    service.play();
    vi.advanceTimersByTime(START_DELAY_MS + BAR_MS);
    expect(engine.play).toHaveBeenCalledTimes(1);

    service.pause();
    expect(engine.pause).toHaveBeenCalledTimes(1);
    expect(service.getSnapshot().status).toBe('ready');
  });

  it('stop calls the count-in off and rewinds', () => {
    const { engine, service } = setup();
    service.play();
    service.stop();
    vi.advanceTimersByTime(5000);
    expect(engine.stop).toHaveBeenCalledTimes(1);
    expect(engine.play).not.toHaveBeenCalled();
    expect(service.getSnapshot().status).toBe('ready');
  });

  it('seeking during a count-in counts in again for the new bar', () => {
    const { engine, service, clicks } = setup({ barTempos: TEMPO_CHANGE_BAR_TEMPOS });
    service.play();
    vi.advanceTimersByTime(START_DELAY_MS + 600);

    service.seekToBar(9);
    expect(clicks.cancelSession).toHaveBeenCalledTimes(1);
    expect(service.getSnapshot()).toMatchObject({ status: 'countingIn', barNumber: 9 });
    const recount = clicks.scheduled.slice(4).map(({ click }) => click.time);
    expect((recount[1] ?? 0) - (recount[0] ?? 0)).toBeCloseTo(2 / 3);

    // The old count-in's downbeat passes without starting playback.
    vi.advanceTimersByTime(1500);
    expect(engine.play).not.toHaveBeenCalled();
  });

  it('setting a range calls the count-in off', () => {
    const { engine, service } = setup();
    service.play();
    service.setRange({ startBar: 5, endBar: 8 });
    vi.advanceTimersByTime(5000);
    expect(service.getSnapshot().status).toBe('ready');
    expect(engine.play).not.toHaveBeenCalled();
  });

  it('changing speed or the count-in settings mid count-in neither restarts nor cancels it', () => {
    const { engine, service, clicks } = setup();
    service.play();
    service.setSpeed(0.5);
    service.setCountInBars(2);
    service.setCountInMode('every_repeat');
    expect(clicks.scheduled).toHaveLength(4);
    expect(clicks.cancelSession).not.toHaveBeenCalled();
    expect(engine.restartCalls()).toBe(0);

    vi.advanceTimersByTime(START_DELAY_MS + BAR_MS);
    expect(engine.play).toHaveBeenCalledTimes(1);
  });

  it('a failure during the count-in stops it', () => {
    const { engine, service } = setup();
    service.play();
    engine.fire('error', { error: new Error('render failed') });
    vi.advanceTimersByTime(5000);
    expect(service.getSnapshot()).toMatchObject({ status: 'error', countIn: null });
    expect(engine.play).not.toHaveBeenCalled();
  });

  it('dispose stops the count-in and closes the click output', () => {
    const { engine, service, clicks } = setup();
    service.play();
    service.dispose();
    vi.advanceTimersByTime(5000);
    expect(engine.play).not.toHaveBeenCalled();
    expect(clicks.cancelSession).toHaveBeenCalledTimes(1);
    expect(clicks.dispose).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('loading another file stops the count-in', () => {
    const { engine, service } = setup();
    service.play();
    service.load(new Uint8Array([2]));
    vi.advanceTimersByTime(5000);
    expect(engine.play).not.toHaveBeenCalled();
    expect(service.getSnapshot().status).toBe('loading');
  });
});

describe('PlayerService count-in before every repeat', () => {
  const everyRepeat = { options: { countInBars: 1, countInMode: 'every_repeat' } } as const;

  /** Looping bars 5 to 8 and playing, the first count-in done. */
  function looping(config: SetupOptions = everyRepeat) {
    const ctx = setup(config);
    ctx.service.setRange({ startBar: 5, endBar: 8 });
    ctx.service.setLooping(true);
    ctx.engine.fire('position', { tick: 4 * TICKS_PER_BAR });
    ctx.service.play();
    vi.advanceTimersByTime(START_DELAY_MS + BAR_MS);
    enginePlays(ctx.engine);
    ctx.engine.play.mockClear();
    ctx.clicks.scheduled = [];
    return ctx;
  }

  it('keeps the engine from looping by itself, so it stops at the end of each pass', () => {
    const { engine } = looping();
    expect(engine.setLooping).toHaveBeenLastCalledWith(false);
  });

  it('lets the engine loop natively when the count-in is at the start only', () => {
    const { engine, service } = looping({ options: { countInBars: 1, countInMode: 'start' } });
    expect(engine.setLooping).toHaveBeenLastCalledWith(true);

    engine.fire('finished', undefined);
    expect(service.getSnapshot().status).toBe('playing');
    expect(engine.play).not.toHaveBeenCalled();
  });

  it('counts in at the end of a pass and resumes on the downbeat', () => {
    const { engine, service, clicks } = looping();
    const wrapped = vi.fn();
    service.on('loopWrapped', wrapped);

    engineFinishesPass(engine, 4 * TICKS_PER_BAR);

    expect(wrapped).toHaveBeenCalledTimes(1);
    // alphaTab stopping for the count-in must not read as a pause.
    expect(service.getSnapshot().status).toBe('countingIn');
    expect(clickOffsets(clicks)).toEqual([0, 0.5, 1, 1.5]);
    expect(engine.play).not.toHaveBeenCalled();

    vi.advanceTimersByTime(START_DELAY_MS + BAR_MS);
    expect(engine.play).toHaveBeenCalledTimes(1);
    enginePlays(engine);
    expect(service.getSnapshot().status).toBe('playing');
  });

  it('counts in before every pass, not just the first repeat', () => {
    const { engine } = looping();
    for (let pass = 0; pass < 3; pass++) {
      engineFinishesPass(engine, 4 * TICKS_PER_BAR);
      vi.advanceTimersByTime(START_DELAY_MS + BAR_MS);
      enginePlays(engine);
    }
    expect(engine.play).toHaveBeenCalledTimes(3);
  });

  it('counts the repeat at the tempo of the loop’s first bar, not the bar it ended on', () => {
    // Bars 7 to 10 cross the change: the pass ends at 90 BPM but restarts at 120.
    const ctx = setup({ ...everyRepeat, barTempos: TEMPO_CHANGE_BAR_TEMPOS });
    ctx.service.setRange({ startBar: 7, endBar: 10 });
    ctx.service.setLooping(true);
    ctx.service.play();
    vi.advanceTimersByTime(START_DELAY_MS + BAR_MS);
    enginePlays(ctx.engine);
    ctx.engine.fire('position', { tick: 9 * TICKS_PER_BAR + 100 });
    ctx.clicks.scheduled = [];

    ctx.engine.fire('finished', undefined);
    expect(clickOffsets(ctx.clicks)).toEqual([0, 0.5, 1, 1.5]);
  });

  it('holds the wake lock between passes', () => {
    const { engine, wakeLock } = looping();
    engineFinishesPass(engine, 4 * TICKS_PER_BAR);
    expect(wakeLock.setActive).toHaveBeenLastCalledWith(true);
  });

  it('works for a whole-song loop with no range', () => {
    const ctx = setup(everyRepeat);
    ctx.service.setLooping(true);
    ctx.service.play();
    vi.advanceTimersByTime(START_DELAY_MS + BAR_MS);
    enginePlays(ctx.engine);
    ctx.engine.play.mockClear();

    engineFinishesPass(ctx.engine);
    expect(ctx.service.getSnapshot().status).toBe('countingIn');
    vi.advanceTimersByTime(START_DELAY_MS + BAR_MS);
    expect(ctx.engine.play).toHaveBeenCalledTimes(1);
  });

  it('does not count in or restart when looping is off', () => {
    const ctx = setup(everyRepeat);
    const finished = vi.fn();
    ctx.service.on('finished', finished);
    ctx.service.play();
    vi.advanceTimersByTime(START_DELAY_MS + BAR_MS);
    enginePlays(ctx.engine);
    ctx.engine.play.mockClear();

    engineFinishesPass(ctx.engine);
    vi.advanceTimersByTime(5000);
    expect(finished).toHaveBeenCalledTimes(1);
    expect(ctx.engine.play).not.toHaveBeenCalled();
    expect(ctx.service.getSnapshot().status).toBe('ready');
  });

  it('Pause during a repeat’s count-in stops the loop there', () => {
    const { engine, service } = looping();
    engineFinishesPass(engine, 4 * TICKS_PER_BAR);
    service.pause();
    vi.advanceTimersByTime(5000);
    expect(engine.play).not.toHaveBeenCalled();
    expect(service.getSnapshot().status).toBe('ready');
  });

  it('switches between native looping and counted repeats live, as a property change only', () => {
    const { engine, service } = looping();
    engine.setLooping.mockClear();

    service.setCountInMode('start');
    expect(engine.setLooping).toHaveBeenLastCalledWith(true);
    service.setCountInMode('every_repeat');
    expect(engine.setLooping).toHaveBeenLastCalledWith(false);
    service.setCountInBars(0);
    expect(engine.setLooping).toHaveBeenLastCalledWith(true);
    service.setCountInBars(2);
    expect(engine.setLooping).toHaveBeenLastCalledWith(false);
    service.setLooping(false);
    expect(engine.setLooping).toHaveBeenLastCalledWith(false);

    expect(engine.restartCalls()).toBe(0);
    expect(service.getSnapshot().status).toBe('playing');
  });

  it('applies the looping choice again when alphaTab reloads its MIDI', () => {
    const { engine } = looping();
    engine.setLooping.mockClear();
    engine.fire('ticksReady', { bars: [] });
    expect(engine.setLooping).toHaveBeenLastCalledWith(false);
  });
});

describe('PlayerService count-in options', () => {
  it('starts from the options it was given', () => {
    const { service } = setup({ options: { countInBars: 2, countInMode: 'every_repeat' } });
    expect(service.getSnapshot()).toMatchObject({ countInBars: 2, countInMode: 'every_repeat' });
  });

  it('wakes the click output when a count-in is turned on, since that tap may be the only one', () => {
    const { service, clicks } = setup({ options: { countInBars: 0 } });
    service.setCountInMode('every_repeat');
    expect(clicks.unlock).not.toHaveBeenCalled();
    service.setCountInBars(1);
    expect(clicks.unlock).toHaveBeenCalledTimes(1);
  });
});
