/**
 * The count-in through PlayerService, beyond the worked examples in
 * PlayerService.countIn.test.ts: every meter, speed bound and bar count as a
 * table, every way a count-in can be called off (at the start and before a
 * repeat), settings changed in the middle of a loop, and what is left behind
 * afterwards (timers, scheduled clicks, the wake lock).
 */
import {
  BAR_MS,
  clickOffsets,
  engineFinishesPass,
  enginePlays,
  EVERY_REPEAT,
  LEAD_MS,
  LOOP_START_TICK,
  loopingBars5To8,
  setupCountIn,
  START_DELAY_MS,
  START_ONLY,
  type CountInContext,
  type CountInSetup,
} from '@/test/countInPlayer';
import { TEMPO_CHANGE_BAR_TEMPOS, TICKS_PER_BAR } from '@/test/fakePlayerEngine';
import { SPEED_RATIO_MAX, SPEED_RATIO_MIN, type CountInBars } from '@/lib/schema';
import type { Meter } from './countIn';
import type { BarRange, PlayerService, PlayerSnapshot } from './PlayerService';

/** Four bars whose meter and tempo change: 4/4 at 120, then 7/8 and 3/4 at 100. */
const MIXED_METERS = {
  barTempos: [120, 120, 100, 100],
  barMeters: [
    { beats: 4, beatValue: 4 },
    { beats: 4, beatValue: 4 },
    { beats: 7, beatValue: 8 },
    { beats: 3, beatValue: 4 },
  ],
} satisfies CountInSetup;

/** The moments in a one-bar count-in at which it is interrupted, as [name, ms after Play]. */
const MOMENTS: readonly [string, number][] = [
  ['before the first click', 0],
  ['between clicks', START_DELAY_MS + 700],
  ['just before the downbeat', START_DELAY_MS + BAR_MS - LEAD_MS - 10],
];

/** Every status and count-in beat the service goes through from now on. */
function record(service: PlayerService) {
  const statuses: PlayerSnapshot['status'][] = [service.getSnapshot().status];
  const beats: string[] = [];
  service.subscribe(() => {
    const { status, countIn } = service.getSnapshot();
    if (statuses.at(-1) !== status) statuses.push(status);
    const beat = countIn ? `${countIn.bar}.${countIn.beat}/${countIn.beatsPerBar}` : null;
    if (beat && beats.at(-1) !== beat) beats.push(beat);
  });
  return { statuses, beats };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('count-in follows meter, tempo, speed and bar count', () => {
  const METERS: readonly Meter[] = [
    { beats: 4, beatValue: 4 },
    { beats: 3, beatValue: 4 },
    { beats: 6, beatValue: 8 },
    { beats: 7, beatValue: 8 },
    { beats: 5, beatValue: 4 },
  ];
  const cases = METERS.flatMap((meter) =>
    [120, 90].flatMap((tempo) =>
      [SPEED_RATIO_MIN, 0.5, 1, SPEED_RATIO_MAX].flatMap((speedRatio) =>
        ([1, 2] as const).map((bars) => ({
          name: `${bars} bar(s) of ${meter.beats}/${meter.beatValue} at ${tempo} BPM x ${speedRatio}`,
          meter,
          tempo,
          speedRatio,
          bars,
        })),
      ),
    ),
  );

  it.each(cases)('$name', ({ meter, tempo, speedRatio, bars }) => {
    const { engine, service, clicks } = setupCountIn({
      options: { countInBars: bars },
      meter,
      barTempos: Array.from({ length: 16 }, () => tempo),
    });
    service.setSpeed(speedRatio);
    const { beats } = record(service);
    service.play();

    const beatSeconds = (60 / (tempo * speedRatio)) * (4 / meter.beatValue);
    const total = bars * meter.beats;

    // One click per beat, evenly spaced at the bar's tempo x speed, beat one of each bar accented.
    expect(clicks.scheduled).toHaveLength(total);
    clickOffsets(clicks).forEach((offset, index) => {
      expect(offset).toBeCloseTo(index * beatSeconds, 5);
    });
    expect(clicks.scheduled.map(({ click }) => click.accent)).toEqual(
      Array.from({ length: total }, (_, index) => index % meter.beats === 0),
    );

    // Playback starts on the downbeat (just ahead of it), not before.
    const downbeatMs = START_DELAY_MS + total * beatSeconds * 1000;
    vi.advanceTimersByTime(downbeatMs - LEAD_MS - 20);
    expect(engine.play).not.toHaveBeenCalled();
    expect(service.getSnapshot().status).toBe('countingIn');
    vi.advanceTimersByTime(40);
    expect(engine.play).toHaveBeenCalledTimes(1);

    // The counter saw every beat, in order, with the meter's beats per bar.
    expect(beats).toEqual(
      Array.from(
        { length: total },
        (_, index) =>
          `${Math.floor(index / meter.beats) + 1}.${(index % meter.beats) + 1}/${meter.beats}`,
      ),
    );
    expect(service.getSnapshot().countIn).toMatchObject({ bars, beatsPerBar: meter.beats });

    enginePlays(engine);
    expect(service.getSnapshot()).toMatchObject({ status: 'playing', countIn: null });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('with the count-in off, Play never passes through a count-in', () => {
    const { engine, service, clicks } = setupCountIn({ options: { countInBars: 0 } });
    const { statuses, beats } = record(service);
    service.play();
    enginePlays(engine);
    vi.advanceTimersByTime(10_000);

    expect(statuses).toEqual(['ready', 'playing']);
    expect(beats).toEqual([]);
    expect(clicks.scheduled).toHaveLength(0);
    expect(engine.play).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('with the count-in off, resuming from the middle of a bar does not move playback', () => {
    const { engine, service } = setupCountIn({ options: { countInBars: 0 } });
    engine.fire('position', { tick: 2 * TICKS_PER_BAR + 900 });
    service.play();
    expect(engine.seek).not.toHaveBeenCalled();
    expect(engine.play).toHaveBeenCalledTimes(1);
  });

  it('applies the speed set after the tempo change: bar 9 at 90 BPM x 0.75 is 67.5 BPM', () => {
    const { service, clicks } = setupCountIn({ barTempos: TEMPO_CHANGE_BAR_TEMPOS });
    service.seekToBar(9);
    service.setSpeed(0.75);
    service.play();
    clickOffsets(clicks).forEach((offset, index) => {
      expect(offset).toBeCloseTo((index * 60) / 67.5, 5);
    });
  });

  it('counts from the bar before a tempo change at the old tempo', () => {
    const { service, clicks } = setupCountIn({ barTempos: TEMPO_CHANGE_BAR_TEMPOS });
    service.seekToBar(8);
    service.play();
    expect(clickOffsets(clicks)).toEqual([0, 0.5, 1, 1.5]);
  });

  describe('in a song whose meter changes', () => {
    it('uses the meter and tempo of the bar playback starts on', () => {
      const { service, clicks } = setupCountIn(MIXED_METERS);
      service.seekToBar(3);
      service.play();
      // Seven eighths at 100 BPM: 0.3 s apart.
      expect(clickOffsets(clicks)).toEqual([0, 0.3, 0.6, 0.9, 1.2, 1.5, 1.8]);
      expect(clicks.scheduled.filter(({ click }) => click.accent)).toHaveLength(1);
    });

    it('counts a repeat in the meter of the loop’s first bar, not the bar it ended on', () => {
      const { engine, service, clicks } = setupCountIn({ ...MIXED_METERS, ...EVERY_REPEAT });
      service.setRange({ startBar: 2, endBar: 4 });
      service.setLooping(true);
      engine.fire('position', { tick: TICKS_PER_BAR });
      service.play();
      vi.advanceTimersByTime(START_DELAY_MS + BAR_MS);
      enginePlays(engine);
      engine.fire('position', { tick: 3 * TICKS_PER_BAR + 10 });

      const before = clicks.scheduled.length;
      engineFinishesPass(engine, TICKS_PER_BAR);
      expect(clickOffsets(clicks, before)).toEqual([0, 0.5, 1, 1.5]);
    });
  });
});

describe('Play while a count-in cannot or should not start', () => {
  it('does nothing before the song has loaded', () => {
    const { engine, service, clicks } = setupCountIn({
      options: { countInBars: 2 },
      loaded: false,
    });
    service.play();
    vi.advanceTimersByTime(10_000);
    expect(clicks.scheduled).toHaveLength(0);
    expect(engine.play).not.toHaveBeenCalled();
    expect(service.getSnapshot().status).toBe('loading');
  });

  it('a second Play during the count-in does not start another', () => {
    const { engine, service, clicks } = setupCountIn();
    service.play();
    vi.advanceTimersByTime(START_DELAY_MS + 700);
    service.play();
    service.play();
    expect(clicks.scheduled).toHaveLength(4);

    vi.advanceTimersByTime(BAR_MS);
    expect(engine.play).toHaveBeenCalledTimes(1);
  });

  it('counts in again, in full, on every Play after a pause', () => {
    const { engine, service, clicks } = setupCountIn();
    for (let round = 1; round <= 3; round++) {
      service.play();
      expect(service.getSnapshot().status).toBe('countingIn');
      vi.advanceTimersByTime(START_DELAY_MS + BAR_MS);
      enginePlays(engine);
      expect(engine.play).toHaveBeenCalledTimes(round);
      expect(clicks.scheduled).toHaveLength(4 * round);

      service.pause();
      engine.fire('stateChanged', { playing: false });
      expect(service.getSnapshot().status).toBe('ready');
    }
  });

  it('after a cancelled count-in, the next Play counts the whole bar again', () => {
    const { engine, service, clicks } = setupCountIn();
    service.play();
    vi.advanceTimersByTime(START_DELAY_MS + 1700);
    service.pause();

    service.play();
    expect(clickOffsets(clicks, 4)).toEqual([0, 0.5, 1, 1.5]);
    // The first count-in's downbeat (300 ms away when it was cancelled) passes silently.
    vi.advanceTimersByTime(START_DELAY_MS + BAR_MS - 100);
    expect(engine.play).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(engine.play).toHaveBeenCalledTimes(1);
  });
});

/** Each way a count-in is called off. `leavesStatus` is where the player ends up. */
const CANCELS: readonly {
  name: string;
  act: (ctx: CountInContext) => void;
  leavesStatus: PlayerSnapshot['status'];
}[] = [
  { name: 'pause', act: ({ service }) => service.pause(), leavesStatus: 'ready' },
  { name: 'togglePlay', act: ({ service }) => service.togglePlay(), leavesStatus: 'ready' },
  { name: 'stop', act: ({ service }) => service.stop(), leavesStatus: 'ready' },
  {
    name: 'setRange',
    act: ({ service }) => service.setRange({ startBar: 9, endBar: 12 }),
    leavesStatus: 'ready',
  },
  { name: 'setRange(null)', act: ({ service }) => service.setRange(null), leavesStatus: 'ready' },
  {
    name: 'load',
    act: ({ service }) => service.load(new Uint8Array([2])),
    leavesStatus: 'loading',
  },
  {
    name: 'an engine error',
    act: ({ engine }) => engine.fire('error', { error: new Error('render failed') }),
    leavesStatus: 'error',
  },
];

describe.each(CANCELS)('$name during a count-in', ({ act, leavesStatus }) => {
  it.each(MOMENTS)(
    '%s: nothing plays, the clicks are silenced and no timer is left',
    (_when, afterMs) => {
      const ctx = setupCountIn();
      const { engine, service, clicks, wakeLock } = ctx;
      service.play();
      vi.advanceTimersByTime(afterMs);
      expect(service.getSnapshot().status).toBe('countingIn');

      act(ctx);

      expect(service.getSnapshot()).toMatchObject({ status: leavesStatus, countIn: null });
      expect(clicks.cancelSession).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(0);
      expect(wakeLock.setActive).toHaveBeenLastCalledWith(false);

      vi.advanceTimersByTime(10_000);
      expect(engine.play).not.toHaveBeenCalled();
      expect(service.getSnapshot()).toMatchObject({ status: leavesStatus, countIn: null });
    },
  );

  it('before a loop repeat: the loop stops there', () => {
    const ctx = loopingBars5To8(EVERY_REPEAT);
    const { engine, service, clicks } = ctx;
    engineFinishesPass(engine, LOOP_START_TICK);
    vi.advanceTimersByTime(START_DELAY_MS + 700);
    expect(service.getSnapshot().status).toBe('countingIn');

    act(ctx);

    expect(service.getSnapshot()).toMatchObject({ status: leavesStatus, countIn: null });
    expect(clicks.cancelSession).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(10_000);
    expect(engine.play).not.toHaveBeenCalled();
  });
});

describe('dispose', () => {
  it.each(MOMENTS)('during a count-in, %s: silences it and leaves no timer', (_when, afterMs) => {
    const { engine, service, clicks, wakeLock } = setupCountIn();
    const listener = vi.fn();
    service.play();
    vi.advanceTimersByTime(afterMs);
    service.subscribe(listener);

    service.dispose();

    expect(clicks.cancelSession).toHaveBeenCalledTimes(1);
    expect(clicks.dispose).toHaveBeenCalledTimes(1);
    expect(wakeLock.dispose).toHaveBeenCalledTimes(1);
    expect(engine.destroy).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);

    vi.advanceTimersByTime(10_000);
    expect(engine.play).not.toHaveBeenCalled();
    expect(listener).not.toHaveBeenCalled();
  });

  it('during a repeat’s count-in: silences it and leaves no timer', () => {
    const { engine, service, clicks } = loopingBars5To8(EVERY_REPEAT);
    engineFinishesPass(engine, LOOP_START_TICK);
    vi.advanceTimersByTime(START_DELAY_MS + 700);

    service.dispose();

    expect(clicks.cancelSession).toHaveBeenCalledTimes(1);
    expect(clicks.dispose).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(10_000);
    expect(engine.play).not.toHaveBeenCalled();
  });

  it('after a count-in has run its course: nothing to silence, no timer, output closed', () => {
    const { engine, service, clicks } = setupCountIn();
    service.play();
    vi.advanceTimersByTime(START_DELAY_MS + BAR_MS);
    enginePlays(engine);

    service.dispose();

    expect(clicks.cancelSession).not.toHaveBeenCalled();
    expect(clicks.dispose).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('twice closes the click output once', () => {
    const { service, clicks } = setupCountIn();
    service.play();
    service.dispose();
    service.dispose();
    expect(clicks.dispose).toHaveBeenCalledTimes(1);
    expect(clicks.cancelSession).toHaveBeenCalledTimes(1);
  });

  it('ignores everything afterwards: no count-in from Play, a late pass end or a setting', () => {
    const { engine, service, clicks } = loopingBars5To8(EVERY_REPEAT);
    service.dispose();
    clicks.unlock.mockClear();

    // alphaTab's worker can still report after destroy().
    engineFinishesPass(engine, LOOP_START_TICK);
    service.play();
    service.togglePlay();
    service.setCountInBars(2);
    service.setCountInMode('start');
    service.seekToBar(3);
    vi.advanceTimersByTime(10_000);

    expect(clicks.scheduled).toHaveLength(0);
    expect(clicks.unlock).not.toHaveBeenCalled();
    expect(engine.play).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('seeking during a count-in', () => {
  it('starts over in the new bar’s meter and tempo, and plays once, on the new downbeat', () => {
    const { engine, service, clicks } = setupCountIn(MIXED_METERS);
    const { statuses } = record(service);
    service.play();
    vi.advanceTimersByTime(START_DELAY_MS + 1200);

    expect(service.seekToBar(3)).toBe(true);

    expect(engine.seek).toHaveBeenLastCalledWith(2 * TICKS_PER_BAR);
    expect(clicks.cancelSession).toHaveBeenCalledTimes(1);
    expect(service.getSnapshot()).toMatchObject({
      status: 'countingIn',
      barNumber: 3,
      countIn: null,
    });
    expect(clickOffsets(clicks, 4)).toEqual([0, 0.3, 0.6, 0.9, 1.2, 1.5, 1.8]);

    // Seven beats of 0.3 s from the seek; the old downbeat (800 ms away) passes without playing.
    vi.advanceTimersByTime(START_DELAY_MS + 2100 - LEAD_MS - 20);
    expect(engine.play).not.toHaveBeenCalled();
    vi.advanceTimersByTime(40);
    expect(engine.play).toHaveBeenCalledTimes(1);

    enginePlays(engine);
    // Never dropped out of the count-in on the way.
    expect(statuses).toEqual(['ready', 'countingIn', 'playing']);
    expect(engine.pause).not.toHaveBeenCalled();
    expect(engine.stop).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('shows the new count from beat one', () => {
    const { service } = setupCountIn(MIXED_METERS);
    service.play();
    vi.advanceTimersByTime(START_DELAY_MS + 1200);
    expect(service.getSnapshot().countIn).toMatchObject({ beat: 3, beatsPerBar: 4 });

    service.seekToBar(4);
    vi.advanceTimersByTime(START_DELAY_MS);
    expect(service.getSnapshot().countIn).toEqual({ bar: 1, beat: 1, bars: 1, beatsPerBar: 3 });
  });

  it('seeking again and again leaves one count-in running and no stray timers', () => {
    const { engine, service, clicks } = setupCountIn();
    service.play();
    for (const bar of [3, 7, 2, 11]) {
      vi.advanceTimersByTime(300);
      service.seekToBar(bar);
    }
    expect(clicks.cancelSession).toHaveBeenCalledTimes(4);
    expect(service.getSnapshot()).toMatchObject({ status: 'countingIn', barNumber: 11 });

    vi.advanceTimersByTime(START_DELAY_MS + BAR_MS);
    expect(engine.play).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('to a bar the song lacks changes nothing: the count-in carries on', () => {
    const { engine, service, clicks } = setupCountIn();
    service.play();
    vi.advanceTimersByTime(START_DELAY_MS + 600);

    expect(service.seekToBar(99)).toBe(false);

    expect(clicks.cancelSession).not.toHaveBeenCalled();
    expect(clicks.scheduled).toHaveLength(4);
    expect(engine.seek).not.toHaveBeenCalled();
    vi.advanceTimersByTime(BAR_MS - 600);
    expect(engine.play).toHaveBeenCalledTimes(1);
  });

  it('during a repeat’s count-in, counts in again for the bar sought', () => {
    const { engine, service, clicks } = loopingBars5To8({
      ...EVERY_REPEAT,
      barTempos: TEMPO_CHANGE_BAR_TEMPOS,
    });
    engineFinishesPass(engine, LOOP_START_TICK);
    vi.advanceTimersByTime(START_DELAY_MS + 600);

    service.seekToBar(9);
    expect(service.getSnapshot().status).toBe('countingIn');
    // Bar 9 is at 90 BPM.
    clickOffsets(clicks, 4).forEach((offset, index) => {
      expect(offset).toBeCloseTo((index * 2) / 3, 5);
    });
  });
});

describe('count-in settings changed in the middle of a loop', () => {
  it('start only: counts in once, then loops round with no more count-ins', () => {
    const { engine, service, clicks } = loopingBars5To8(START_ONLY);
    const { statuses } = record(service);
    expect(engine.setLooping).toHaveBeenLastCalledWith(true);

    for (let pass = 0; pass < 5; pass++) {
      // alphaTab wraps a native loop itself and keeps playing.
      engine.fire('finished', undefined);
      engine.fire('position', { tick: LOOP_START_TICK });
      vi.advanceTimersByTime(4 * BAR_MS);
    }

    expect(clicks.scheduled).toHaveLength(0);
    expect(statuses).toEqual(['playing']);
    expect(engine.restartCalls()).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('start only to every repeat mid-pass: no restart, and the next repeat is counted in', () => {
    const { engine, service, clicks } = loopingBars5To8(START_ONLY);
    engine.fire('position', { tick: LOOP_START_TICK + TICKS_PER_BAR + 5 });

    service.setCountInMode('every_repeat');

    expect(engine.restartCalls()).toBe(0);
    expect(engine.seek).not.toHaveBeenCalled();
    expect(service.getSnapshot().status).toBe('playing');
    expect(clicks.scheduled).toHaveLength(0);
    expect(engine.setLooping).toHaveBeenLastCalledWith(false);

    engineFinishesPass(engine, LOOP_START_TICK);
    expect(service.getSnapshot().status).toBe('countingIn');
    expect(clickOffsets(clicks)).toEqual([0, 0.5, 1, 1.5]);
    vi.advanceTimersByTime(START_DELAY_MS + BAR_MS);
    expect(engine.play).toHaveBeenCalledTimes(1);
  });

  it('every repeat to start only mid-pass: no restart, and the loop then wraps with no count-in', () => {
    const { engine, service, clicks } = loopingBars5To8(EVERY_REPEAT);
    engine.fire('position', { tick: LOOP_START_TICK + TICKS_PER_BAR + 5 });

    service.setCountInMode('start');

    expect(engine.restartCalls()).toBe(0);
    expect(service.getSnapshot().status).toBe('playing');
    expect(engine.setLooping).toHaveBeenLastCalledWith(true);

    engine.fire('finished', undefined);
    vi.advanceTimersByTime(10_000);
    expect(clicks.scheduled).toHaveLength(0);
    expect(engine.play).not.toHaveBeenCalled();
    expect(service.getSnapshot().status).toBe('playing');
  });

  it('1 bar to 2 bars mid-pass: no restart, and the next repeat counts two bars', () => {
    const { engine, service, clicks } = loopingBars5To8(EVERY_REPEAT);
    service.setCountInBars(2);
    expect(engine.restartCalls()).toBe(0);
    expect(clicks.scheduled).toHaveLength(0);

    engineFinishesPass(engine, LOOP_START_TICK);
    expect(clicks.scheduled).toHaveLength(8);
    vi.advanceTimersByTime(START_DELAY_MS + BAR_MS);
    expect(engine.play).not.toHaveBeenCalled();
    vi.advanceTimersByTime(BAR_MS);
    expect(engine.play).toHaveBeenCalledTimes(1);
  });

  it('count-in turned off mid-pass: no restart, and the loop then wraps with no count-in', () => {
    const { engine, service, clicks } = loopingBars5To8(EVERY_REPEAT);
    service.setCountInBars(0);
    expect(engine.restartCalls()).toBe(0);
    expect(engine.setLooping).toHaveBeenLastCalledWith(true);
    // The mode is remembered for when the count-in comes back on.
    expect(service.getSnapshot()).toMatchObject({ countInBars: 0, countInMode: 'every_repeat' });

    engine.fire('finished', undefined);
    vi.advanceTimersByTime(10_000);
    expect(clicks.scheduled).toHaveLength(0);
    expect(engine.play).not.toHaveBeenCalled();
  });

  it('count-in turned on mid-pass with every repeat already chosen: the next repeat is counted in', () => {
    const { engine, service, clicks } = loopingBars5To8({
      options: { countInBars: 0, countInMode: 'every_repeat' },
    });
    expect(engine.setLooping).toHaveBeenLastCalledWith(true);

    service.setCountInBars(1);
    expect(engine.restartCalls()).toBe(0);
    expect(engine.setLooping).toHaveBeenLastCalledWith(false);

    engineFinishesPass(engine, LOOP_START_TICK);
    expect(clicks.scheduled).toHaveLength(4);
    expect(service.getSnapshot().status).toBe('countingIn');
  });

  it('speed changed mid-pass: the next repeat’s count-in is at the new speed', () => {
    const { engine, service, clicks } = loopingBars5To8(EVERY_REPEAT);
    service.setSpeed(SPEED_RATIO_MAX);
    expect(engine.restartCalls()).toBe(0);

    engineFinishesPass(engine, LOOP_START_TICK);
    expect(clickOffsets(clicks)).toEqual([0, 0.25, 0.5, 0.75]);
    vi.advanceTimersByTime(START_DELAY_MS + BAR_MS / 2);
    expect(engine.play).toHaveBeenCalledTimes(1);
  });

  it.each<[string, (service: PlayerService) => void]>([
    ['the mode', (service) => service.setCountInMode('start')],
    ['the bar count', (service) => service.setCountInBars(2)],
    ['the speed', (service) => service.setSpeed(0.5)],
    ['the metronome', (service) => service.setMetronomeOn(false)],
  ])(
    'changing %s during a repeat’s count-in lets it finish as it began, with no restart',
    (_name, change) => {
      const { engine, service, clicks } = loopingBars5To8(EVERY_REPEAT);
      engineFinishesPass(engine, LOOP_START_TICK);
      vi.advanceTimersByTime(START_DELAY_MS + 600);

      change(service);

      expect(clicks.cancelSession).not.toHaveBeenCalled();
      expect(clicks.scheduled).toHaveLength(4);
      expect(engine.restartCalls()).toBe(0);
      expect(service.getSnapshot().status).toBe('countingIn');

      vi.advanceTimersByTime(BAR_MS - 600);
      expect(engine.play).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(0);
    },
  );
});

describe('every repeat over many passes', () => {
  it('goes count-in, play, count-in, play without ever reading as paused', () => {
    const ctx = setupCountIn(EVERY_REPEAT);
    const { engine, service, clicks } = ctx;
    service.setRange({ startBar: 5, endBar: 8 });
    service.setLooping(true);
    engine.fire('position', { tick: LOOP_START_TICK });
    const { statuses, beats } = record(service);
    const wrapped = vi.fn();
    service.on('loopWrapped', wrapped);

    service.play();
    for (let pass = 0; pass < 4; pass++) {
      vi.advanceTimersByTime(START_DELAY_MS + BAR_MS);
      enginePlays(engine);
      engine.fire('position', { tick: LOOP_START_TICK + 3 * TICKS_PER_BAR + 100 });
      engineFinishesPass(engine, LOOP_START_TICK);
    }

    expect(statuses).toEqual([
      'ready',
      'countingIn',
      'playing',
      'countingIn',
      'playing',
      'countingIn',
      'playing',
      'countingIn',
      'playing',
      'countingIn',
    ]);
    expect(wrapped).toHaveBeenCalledTimes(4);
    expect(engine.play).toHaveBeenCalledTimes(4);
    expect(clicks.scheduled).toHaveLength(5 * 4);
    expect(beats.slice(0, 5)).toEqual(['1.1/4', '1.2/4', '1.3/4', '1.4/4', '1.1/4']);
    expect(service.getSnapshot().barNumber).toBe(5);
    // Never rewound or paused by the service between passes.
    expect(engine.pause).not.toHaveBeenCalled();
    expect(engine.stop).not.toHaveBeenCalled();
  });

  it('a pass end reported twice starts one count-in, not two', () => {
    const { engine, clicks } = loopingBars5To8(EVERY_REPEAT);
    engineFinishesPass(engine, LOOP_START_TICK);
    engine.fire('finished', undefined);

    expect(clicks.scheduled).toHaveLength(4);
    vi.advanceTimersByTime(START_DELAY_MS + BAR_MS);
    expect(engine.play).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('counts in when alphaTab reports stopped before finished, too', () => {
    const { engine, service, clicks } = loopingBars5To8(EVERY_REPEAT);
    engine.fire('stateChanged', { playing: false });
    engine.fire('finished', undefined);
    engine.fire('position', { tick: LOOP_START_TICK });

    expect(service.getSnapshot().status).toBe('countingIn');
    expect(clicks.scheduled).toHaveLength(4);
  });

  it('a pause in the middle of a pass is a pause: no count-in until Play, which then counts in', () => {
    const { engine, service, clicks } = loopingBars5To8(EVERY_REPEAT);
    engine.fire('position', { tick: LOOP_START_TICK + TICKS_PER_BAR + 700 });
    service.pause();
    engine.fire('stateChanged', { playing: false });
    vi.advanceTimersByTime(10_000);
    expect(service.getSnapshot().status).toBe('ready');
    expect(clicks.scheduled).toHaveLength(0);

    service.play();
    expect(service.getSnapshot().status).toBe('countingIn');
    // Back to the line of the bar it was paused in, so the count ends on a downbeat.
    expect(engine.seek).toHaveBeenLastCalledWith(LOOP_START_TICK + TICKS_PER_BAR);
  });

  it('with two bars, counts both before every pass', () => {
    const { engine, clicks } = loopingBars5To8({
      options: { countInBars: 2, countInMode: 'every_repeat' },
    });
    for (let pass = 1; pass <= 3; pass++) {
      engineFinishesPass(engine, LOOP_START_TICK);
      expect(clicks.scheduled).toHaveLength(8 * pass);
      vi.advanceTimersByTime(START_DELAY_MS + BAR_MS);
      expect(engine.play).toHaveBeenCalledTimes(pass - 1);
      vi.advanceTimersByTime(BAR_MS);
      expect(engine.play).toHaveBeenCalledTimes(pass);
      enginePlays(engine);
    }
  });

  it('a single-bar loop is counted in before every pass', () => {
    const { engine, service, clicks } = setupCountIn(EVERY_REPEAT);
    service.setRange({ startBar: 5, endBar: 5 });
    service.setLooping(true);
    engine.fire('position', { tick: LOOP_START_TICK });
    service.play();
    for (let pass = 1; pass <= 3; pass++) {
      vi.advanceTimersByTime(START_DELAY_MS + BAR_MS);
      expect(engine.play).toHaveBeenCalledTimes(pass);
      enginePlays(engine);
      engineFinishesPass(engine, LOOP_START_TICK);
    }
    expect(clicks.scheduled).toHaveLength(16);
  });
});

describe('count-in options on the service', () => {
  it.each<[CountInBars, 'start' | 'every_repeat']>([
    [0, 'start'],
    [0, 'every_repeat'],
    [1, 'start'],
    [1, 'every_repeat'],
    [2, 'start'],
    [2, 'every_repeat'],
  ])('starts at %s bar(s), mode %s when given them', (countInBars, countInMode) => {
    const { service } = setupCountIn({ options: { countInBars, countInMode } });
    expect(service.getSnapshot()).toMatchObject({ countInBars, countInMode });
  });

  it('a change made on the player is used by the very next Play', () => {
    const { service, clicks } = setupCountIn({ options: { countInBars: 0 } });
    service.setCountInBars(2);
    service.play();
    expect(service.getSnapshot().status).toBe('countingIn');
    expect(clicks.scheduled).toHaveLength(8);
  });

  it('turning the count-in off on the player makes the next Play immediate', () => {
    const { engine, service, clicks } = setupCountIn({ options: { countInBars: 2 } });
    service.setCountInBars(0);
    service.play();
    expect(engine.play).toHaveBeenCalledTimes(1);
    expect(clicks.scheduled).toHaveLength(0);
  });

  it('tells subscribers when a count-in option changes, and not when it is set to what it was', () => {
    const { service } = setupCountIn({ options: { countInBars: 1, countInMode: 'start' } });
    const listener = vi.fn();
    service.subscribe(listener);

    service.setCountInBars(1);
    service.setCountInMode('start');
    expect(listener).not.toHaveBeenCalled();

    service.setCountInBars(2);
    service.setCountInMode('every_repeat');
    expect(listener).toHaveBeenCalledTimes(2);
  });
});

describe('review: races and partial failures', () => {
  it('count-in set to off during a count-in ends it and plays at once', () => {
    const { engine, service, clicks, wakeLock } = setupCountIn({ options: { countInBars: 2 } });
    service.play();
    vi.advanceTimersByTime(START_DELAY_MS + 700);
    expect(service.getSnapshot().countIn).not.toBeNull();

    service.setCountInBars(0);

    expect(clicks.cancelSession).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    expect(engine.play).toHaveBeenCalledTimes(1);
    // Still running, with no number up, until the engine says it is playing.
    expect(service.getSnapshot()).toMatchObject({ status: 'countingIn', countIn: null });
    expect(wakeLock.setActive).toHaveBeenLastCalledWith(true);

    enginePlays(engine);
    expect(service.getSnapshot().status).toBe('playing');
    // The old downbeat passes without a second play.
    vi.advanceTimersByTime(10_000);
    expect(engine.play).toHaveBeenCalledTimes(1);
  });

  it('count-in set to off during a repeat’s count-in goes straight into the next pass, then loops natively', () => {
    const { engine, service, clicks } = loopingBars5To8(EVERY_REPEAT);
    engineFinishesPass(engine, LOOP_START_TICK);
    vi.advanceTimersByTime(START_DELAY_MS + 600);

    service.setCountInBars(0);

    expect(clicks.cancelSession).toHaveBeenCalledTimes(1);
    expect(engine.play).toHaveBeenCalledTimes(1);
    expect(engine.setLooping).toHaveBeenLastCalledWith(true);
    expect(engine.stop).not.toHaveBeenCalled();
    expect(engine.pause).not.toHaveBeenCalled();
    enginePlays(engine);
    vi.advanceTimersByTime(10_000);
    expect(engine.play).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('count-in set to off after the downbeat, or outside a count-in, plays nothing extra', () => {
    const { engine, service } = setupCountIn();
    service.setCountInBars(0);
    expect(engine.play).not.toHaveBeenCalled();

    service.setCountInBars(1);
    service.play();
    vi.advanceTimersByTime(START_DELAY_MS + BAR_MS);
    expect(engine.play).toHaveBeenCalledTimes(1);
    service.setCountInBars(0);
    expect(engine.play).toHaveBeenCalledTimes(1);
  });

  it.each<[string, (service: PlayerService) => void]>([
    ['Pause', (service) => service.pause()],
    ['Back to start', (service) => service.stop()],
  ])(
    '%s sent just before a pass end already on its way: no count-in starts over it',
    (_name, halt) => {
      const { engine, service, clicks, wakeLock } = loopingBars5To8(EVERY_REPEAT);

      halt(service);
      // alphaTab's worker had finished the pass before it saw the pause.
      engineFinishesPass(engine, LOOP_START_TICK);

      expect(service.getSnapshot()).toMatchObject({ status: 'ready', countIn: null });
      expect(clicks.scheduled).toHaveLength(0);
      expect(wakeLock.setActive).toHaveBeenLastCalledWith(false);
      vi.advanceTimersByTime(10_000);
      expect(engine.play).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it.each<[string, (service: PlayerService) => void]>([
    ['Pause', (service) => service.pause()],
    ['Back to start', (service) => service.stop()],
  ])(
    '%s answered by the engine before the pass end arrives: still no count-in starts over it',
    (_name, halt) => {
      const { engine, service, clicks, wakeLock } = loopingBars5To8(EVERY_REPEAT);

      halt(service);
      engine.fire('stateChanged', { playing: false });
      expect(service.getSnapshot().status).toBe('ready');
      // The pass end was posted before the worker saw the pause, and lands after its answer.
      engine.fire('finished', undefined);

      expect(service.getSnapshot()).toMatchObject({ status: 'ready', countIn: null });
      expect(clicks.scheduled).toHaveLength(0);
      expect(wakeLock.setActive).toHaveBeenLastCalledWith(false);
      vi.advanceTimersByTime(10_000);
      expect(engine.play).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it.each<[string, BarRange | null]>([
    ['another range', { startBar: 9, endBar: 12 }],
    ['no range', null],
  ])(
    'setRange to %s after the downbeat, before the engine reports playing, pauses the engine',
    (_name, range) => {
      const { engine, service, wakeLock } = loopingBars5To8(START_ONLY);
      service.pause();
      engine.fire('stateChanged', { playing: false });
      engine.pause.mockClear();
      service.play();
      vi.advanceTimersByTime(START_DELAY_MS + BAR_MS);
      expect(engine.play).toHaveBeenCalledTimes(1);
      expect(service.getSnapshot().status).toBe('countingIn');

      service.setRange(range);

      // Otherwise the play already sent would start the song under "ready".
      expect(engine.pause).toHaveBeenCalledTimes(1);
      expect(service.getSnapshot()).toMatchObject({ status: 'ready', countIn: null, range });
      expect(wakeLock.setActive).toHaveBeenLastCalledWith(false);
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it('setRange during the clicks leaves the engine alone: it was never started', () => {
    const { engine, service } = setupCountIn();
    service.play();
    vi.advanceTimersByTime(START_DELAY_MS + 700);
    service.setRange({ startBar: 9, endBar: 12 });
    expect(service.getSnapshot().status).toBe('ready');
    expect(engine.pause).not.toHaveBeenCalled();
    expect(engine.play).not.toHaveBeenCalled();
  });

  it('a Pause that was answered doesn’t stop later repeats from counting in', () => {
    const { engine, service, clicks } = loopingBars5To8(EVERY_REPEAT);
    service.pause();
    engine.fire('stateChanged', { playing: false });
    service.play();
    vi.advanceTimersByTime(START_DELAY_MS + BAR_MS);
    enginePlays(engine);
    clicks.scheduled = [];

    engineFinishesPass(engine, LOOP_START_TICK);
    expect(service.getSnapshot().status).toBe('countingIn');
    expect(clicks.scheduled).toHaveLength(4);
  });

  it('an engine error after the downbeat, before the engine reports playing, stops the engine', () => {
    const { engine, service, wakeLock } = setupCountIn();
    service.play();
    vi.advanceTimersByTime(START_DELAY_MS + BAR_MS);
    expect(engine.play).toHaveBeenCalledTimes(1);
    expect(service.getSnapshot().status).toBe('countingIn');

    engine.fire('error', { error: new Error('render failed') });

    expect(service.getSnapshot()).toMatchObject({ status: 'error', countIn: null });
    // Otherwise the song would start under an error screen with no Pause to press.
    expect(engine.stop).toHaveBeenCalledTimes(1);
    expect(wakeLock.setActive).toHaveBeenLastCalledWith(false);
  });

  it('an engine error during the clicks leaves the engine alone: it was never started', () => {
    const { engine, service } = setupCountIn();
    service.play();
    vi.advanceTimersByTime(START_DELAY_MS + 700);
    engine.fire('error', { error: new Error('render failed') });
    expect(service.getSnapshot().status).toBe('error');
    expect(engine.stop).not.toHaveBeenCalled();
  });
});
