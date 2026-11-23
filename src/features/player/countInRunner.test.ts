import { LEAD_MS, START_DELAY_MS } from '@/test/countInPlayer';
import { FakeClickOutput } from '@/test/fakePlayerEngine';
import type { ClickOutput, ClickSession } from './clickOutput';
import { COMMON_TIME, type CountInClick } from './countIn';
import { COUNT_IN_START_DELAY_SECONDS, startCountIn, type CountInRun } from './countInRunner';

const ONE_BAR_AT_120: CountInRun = {
  bars: 1,
  meter: COMMON_TIME,
  tempo: 120,
  speedRatio: 1,
  volume: 0.8,
};

function run(request: CountInRun = ONE_BAR_AT_120, output: ClickOutput = new FakeClickOutput()) {
  const beats: CountInClick[] = [];
  const onDownbeat = vi.fn();
  const cancel = startCountIn(output, request, {
    onBeat: (click) => beats.push(click),
    onDownbeat,
  });
  return { beats, onDownbeat, cancel, output };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('startCountIn', () => {
  it('schedules every click on the output clock, a moment ahead of now', () => {
    const output = new FakeClickOutput();
    const now = Date.now() / 1000;
    run(ONE_BAR_AT_120, output);

    const offsets = output.scheduled.map(({ click }) => click.time - now);
    expect(offsets).toHaveLength(4);
    [0, 0.5, 1, 1.5].forEach((offset, index) => {
      expect(offsets[index]).toBeCloseTo(offset + COUNT_IN_START_DELAY_SECONDS, 5);
    });
    expect(output.scheduled.map(({ click }) => click.accent)).toEqual([true, false, false, false]);
    expect(output.scheduled.every(({ volume }) => volume === 0.8)).toBe(true);
  });

  it('reports each beat as it sounds', () => {
    const { beats } = run();
    expect(beats).toHaveLength(0);

    vi.advanceTimersByTime(START_DELAY_MS);
    expect(beats.map((click) => click.beat)).toEqual([1]);

    vi.advanceTimersByTime(500);
    expect(beats.map((click) => click.beat)).toEqual([1, 2]);

    vi.advanceTimersByTime(1000);
    expect(beats.map((click) => click.beat)).toEqual([1, 2, 3, 4]);
  });

  it('asks for playback once, just ahead of the downbeat', () => {
    const { onDownbeat } = run();
    const downbeatMs = START_DELAY_MS + 2000;

    vi.advanceTimersByTime(downbeatMs - LEAD_MS - 5);
    expect(onDownbeat).not.toHaveBeenCalled();

    vi.advanceTimersByTime(5);
    expect(onDownbeat).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(5000);
    expect(onDownbeat).toHaveBeenCalledTimes(1);
  });

  it('takes twice as long at half speed', () => {
    const { onDownbeat } = run({ ...ONE_BAR_AT_120, speedRatio: 0.5 });
    vi.advanceTimersByTime(START_DELAY_MS + 2000);
    expect(onDownbeat).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2000);
    expect(onDownbeat).toHaveBeenCalledTimes(1);
  });

  it('cancels: no more beats, no downbeat, and the scheduled clicks are silenced', () => {
    const output = new FakeClickOutput();
    const { beats, onDownbeat, cancel } = run(ONE_BAR_AT_120, output);
    vi.advanceTimersByTime(START_DELAY_MS + 600);

    cancel?.();
    vi.advanceTimersByTime(5000);

    expect(beats.map((click) => click.beat)).toEqual([1, 2]);
    expect(onDownbeat).not.toHaveBeenCalled();
    expect(output.cancelSession).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('leaves the clicks alone when cancelled after the downbeat', () => {
    const output = new FakeClickOutput();
    const { cancel } = run(ONE_BAR_AT_120, output);
    vi.advanceTimersByTime(START_DELAY_MS + 2000);
    cancel?.();
    expect(output.cancelSession).not.toHaveBeenCalled();
  });

  it('returns null and calls nothing when there is nothing to count', () => {
    const output = new FakeClickOutput();
    const { cancel, onDownbeat } = run({ ...ONE_BAR_AT_120, bars: 0 }, output);
    expect(cancel).toBeNull();
    vi.advanceTimersByTime(5000);
    expect(onDownbeat).not.toHaveBeenCalled();
    expect(output.scheduled).toHaveLength(0);
  });

  it('follows the output clock, not the timers: a clock that runs slow delays the downbeat', () => {
    // An audio clock at half the page clock's rate, as when the context stalls.
    const started = Date.now();
    const slowSession: ClickSession = {
      now: () => (Date.now() - started) / 2000,
      schedule: vi.fn(),
      cancel: vi.fn(),
    };
    const output: ClickOutput = {
      unlock: vi.fn(),
      dispose: vi.fn(),
      open(onOpen) {
        onOpen(slowSession);
        return () => {};
      },
    };
    const { onDownbeat } = run(ONE_BAR_AT_120, output);

    vi.advanceTimersByTime(START_DELAY_MS + 2000);
    expect(onDownbeat).not.toHaveBeenCalled();
    vi.advanceTimersByTime(START_DELAY_MS + 2000);
    expect(onDownbeat).toHaveBeenCalledTimes(1);
  });

  it('reports every beat of two bars of 3/4 in order, then the downbeat, and leaves no timer behind', () => {
    const order: string[] = [];
    const cancel = startCountIn(
      new FakeClickOutput(),
      { ...ONE_BAR_AT_120, bars: 2, meter: { beats: 3, beatValue: 4 } },
      {
        onBeat: (click) => order.push(`${click.bar}.${click.beat}`),
        onDownbeat: () => order.push('downbeat'),
      },
    );
    expect(cancel).not.toBeNull();

    vi.advanceTimersByTime(START_DELAY_MS + 3000);

    expect(order).toEqual(['1.1', '1.2', '1.3', '2.1', '2.2', '2.3', 'downbeat']);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    ['the slowest speed', 0.25, 8000],
    ['the fastest speed', 2, 1000],
  ])('at %s the downbeat comes after the whole bar, no sooner', (_name, speedRatio, barMs) => {
    const { beats, onDownbeat } = run({ ...ONE_BAR_AT_120, speedRatio });

    vi.advanceTimersByTime(START_DELAY_MS + barMs - LEAD_MS - 5);
    expect(beats.map((click) => click.beat)).toEqual([1, 2, 3, 4]);
    expect(onDownbeat).not.toHaveBeenCalled();

    vi.advanceTimersByTime(5);
    expect(onDownbeat).toHaveBeenCalledTimes(1);
  });

  it('still counts and reaches the downbeat at zero volume', () => {
    const output = new FakeClickOutput();
    const { beats, onDownbeat } = run({ ...ONE_BAR_AT_120, volume: 0 }, output);
    vi.advanceTimersByTime(START_DELAY_MS + 2000);
    expect(beats).toHaveLength(4);
    expect(onDownbeat).toHaveBeenCalledTimes(1);
    expect(output.scheduled.every(({ volume }) => volume === 0)).toBe(true);
  });

  it('cancelling twice is the same as once', () => {
    const output = new FakeClickOutput();
    const { cancel, onDownbeat } = run(ONE_BAR_AT_120, output);
    vi.advanceTimersByTime(START_DELAY_MS + 100);
    cancel?.();
    cancel?.();
    vi.advanceTimersByTime(5000);
    expect(output.cancelSession).toHaveBeenCalledTimes(1);
    expect(onDownbeat).not.toHaveBeenCalled();
  });

  it('cancelling before the first click reports no beat at all', () => {
    const { cancel, beats, onDownbeat } = run();
    cancel?.();
    vi.advanceTimersByTime(5000);
    expect(beats).toHaveLength(0);
    expect(onDownbeat).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('a cancel from inside a beat handler stops the rest', () => {
    const beats: number[] = [];
    const onDownbeat = vi.fn();
    const cancel = startCountIn(new FakeClickOutput(), ONE_BAR_AT_120, {
      onBeat: (click) => {
        beats.push(click.beat);
        if (click.beat === 2) cancel?.();
      },
      onDownbeat,
    });
    vi.advanceTimersByTime(5000);
    expect(beats).toEqual([1, 2]);
    expect(onDownbeat).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('a clock that stalls holds the count where it is, and the downbeat moves back by the stall', () => {
    // The audio clock follows the page clock except while `stalledSince` is set.
    const started = Date.now();
    let stalledMs = 0;
    let stalledSince: number | null = null;
    const output: ClickOutput = {
      unlock: vi.fn(),
      dispose: vi.fn(),
      open(onOpen) {
        onOpen({
          now: () => ((stalledSince ?? Date.now()) - started - stalledMs) / 1000,
          schedule: vi.fn(),
          cancel: vi.fn(),
        });
        return () => {};
      },
    };
    const { beats, onDownbeat } = run(ONE_BAR_AT_120, output);

    vi.advanceTimersByTime(START_DELAY_MS + 300);
    expect(beats.map((click) => click.beat)).toEqual([1]);

    // A second with the audio clock stopped: beat two (200 ms away) does not come.
    stalledSince = Date.now();
    vi.advanceTimersByTime(1000);
    expect(beats.map((click) => click.beat)).toEqual([1]);
    stalledMs += Date.now() - stalledSince;
    stalledSince = null;

    vi.advanceTimersByTime(150);
    expect(beats.map((click) => click.beat)).toEqual([1]);
    vi.advanceTimersByTime(100);
    expect(beats.map((click) => click.beat)).toEqual([1, 2]);

    // 550 ms into the count on the audio clock; the downbeat is at 2000.
    vi.advanceTimersByTime(1450 - LEAD_MS - 20);
    expect(beats.map((click) => click.beat)).toEqual([1, 2, 3, 4]);
    expect(onDownbeat).not.toHaveBeenCalled();
    vi.advanceTimersByTime(40);
    expect(onDownbeat).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    ['a tempo of zero', { tempo: 0 }],
    ['a meter with no beats', { meter: { beats: 0, beatValue: 4 } }],
    ['a speed of zero', { speedRatio: 0 }],
  ])('returns null without opening the output for %s', (_name, patch) => {
    const open = vi.fn(() => () => {});
    const output: ClickOutput = { unlock: vi.fn(), dispose: vi.fn(), open };
    const { cancel } = run({ ...ONE_BAR_AT_120, ...patch }, output);
    expect(cancel).toBeNull();
    expect(open).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('can be cancelled while waiting for the output, and ignores a late open', () => {
    const opens: ((session: ClickSession) => void)[] = [];
    const cancelOpen = vi.fn();
    const output: ClickOutput = {
      unlock: vi.fn(),
      dispose: vi.fn(),
      open(onOpen) {
        opens.push(onOpen);
        return cancelOpen;
      },
    };
    const { cancel, beats } = run(ONE_BAR_AT_120, output);

    cancel?.();
    expect(cancelOpen).toHaveBeenCalledTimes(1);

    const schedule = vi.fn();
    opens[0]?.({ now: () => 0, schedule, cancel: vi.fn() });
    vi.advanceTimersByTime(5000);
    expect(schedule).not.toHaveBeenCalled();
    expect(beats).toHaveLength(0);
  });
});
