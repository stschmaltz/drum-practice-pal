import {
  barMeters,
  beatSeconds,
  COMMON_TIME,
  countInSchedule,
  countsInEveryRepeat,
  meterAtBar,
  type Meter,
} from './countIn';

const WALTZ: Meter = { beats: 3, beatValue: 4 };
const SIX_EIGHT: Meter = { beats: 6, beatValue: 8 };

const times = (schedule: ReturnType<typeof countInSchedule>) =>
  schedule?.clicks.map((click) => click.time) ?? [];

describe('beatSeconds', () => {
  it('is a quarter note at the tempo in x/4', () => {
    expect(beatSeconds(COMMON_TIME, 120, 1)).toBeCloseTo(0.5);
    expect(beatSeconds(WALTZ, 90, 1)).toBeCloseTo(2 / 3);
  });

  it('is an eighth note in x/8', () => {
    expect(beatSeconds(SIX_EIGHT, 120, 1)).toBeCloseTo(0.25);
  });

  it('follows the speed ratio', () => {
    expect(beatSeconds(COMMON_TIME, 120, 0.5)).toBeCloseTo(1);
    expect(beatSeconds(COMMON_TIME, 120, 2)).toBeCloseTo(0.25);
  });
});

describe('countInSchedule', () => {
  it('clicks four beats for one bar of 4/4 at 120 and lands on the downbeat', () => {
    const schedule = countInSchedule({
      bars: 1,
      meter: COMMON_TIME,
      tempo: 120,
      speedRatio: 1,
      startTime: 10,
    });
    expect(times(schedule)).toEqual([10, 10.5, 11, 11.5]);
    expect(schedule?.downbeat).toBe(12);
    expect(schedule?.beatSeconds).toBe(0.5);
  });

  it('accents the first beat of every counted bar', () => {
    const schedule = countInSchedule({
      bars: 2,
      meter: COMMON_TIME,
      tempo: 120,
      speedRatio: 1,
      startTime: 0,
    });
    expect(schedule?.clicks.map((click) => click.accent)).toEqual([
      true,
      false,
      false,
      false,
      true,
      false,
      false,
      false,
    ]);
    expect(schedule?.clicks.map((click) => `${click.bar}.${click.beat}`)).toEqual([
      '1.1',
      '1.2',
      '1.3',
      '1.4',
      '2.1',
      '2.2',
      '2.3',
      '2.4',
    ]);
    expect(schedule?.downbeat).toBe(4);
  });

  it('clicks three beats a bar in 3/4', () => {
    const schedule = countInSchedule({
      bars: 2,
      meter: WALTZ,
      tempo: 120,
      speedRatio: 1,
      startTime: 0,
    });
    expect(schedule?.clicks).toHaveLength(6);
    expect(schedule?.clicks.filter((click) => click.accent)).toHaveLength(2);
    expect(schedule?.downbeat).toBe(3);
  });

  it('clicks six eighths in 6/8', () => {
    const schedule = countInSchedule({
      bars: 1,
      meter: SIX_EIGHT,
      tempo: 120,
      speedRatio: 1,
      startTime: 0,
    });
    expect(times(schedule)).toEqual([0, 0.25, 0.5, 0.75, 1, 1.25]);
    expect(schedule?.downbeat).toBe(1.5);
  });

  it('uses the tempo it is given, such as the one after a tempo change', () => {
    const schedule = countInSchedule({
      bars: 1,
      meter: COMMON_TIME,
      tempo: 90,
      speedRatio: 1,
      startTime: 0,
    });
    expect(schedule?.beatSeconds).toBeCloseTo(2 / 3);
    expect(schedule?.downbeat).toBeCloseTo(8 / 3);
  });

  it.each([
    [0.25, 2],
    [0.5, 1],
    [1.5, 1 / 3],
    [2, 0.25],
  ])('scales with speed: at ratio %s a 120 BPM beat lasts %s s', (speedRatio, expected) => {
    const schedule = countInSchedule({
      bars: 1,
      meter: COMMON_TIME,
      tempo: 120,
      speedRatio,
      startTime: 0,
    });
    expect(schedule?.beatSeconds).toBeCloseTo(expected);
    expect(schedule?.downbeat).toBeCloseTo(expected * 4);
  });

  it('keeps the last click exactly one beat before the downbeat', () => {
    const schedule = countInSchedule({
      bars: 2,
      meter: { beats: 7, beatValue: 8 },
      tempo: 133,
      speedRatio: 0.85,
      startTime: 3.21,
    });
    const last = schedule?.clicks.at(-1);
    expect((schedule?.downbeat ?? 0) - (last?.time ?? 0)).toBeCloseTo(schedule?.beatSeconds ?? -1);
  });

  it.each([
    ['no bars', { bars: 0 }],
    ['a fractional bar count', { bars: 1.5 }],
    ['a zero tempo', { tempo: 0 }],
    ['a negative tempo', { tempo: -120 }],
    ['a NaN tempo', { tempo: Number.NaN }],
    ['a zero speed', { speedRatio: 0 }],
    ['a meter with no beats', { meter: { beats: 0, beatValue: 4 } }],
    ['a meter with no beat value', { meter: { beats: 4, beatValue: 0 } }],
    ['a start time that is not a number', { startTime: Number.NaN }],
  ])('returns null for %s', (_name, patch) => {
    expect(
      countInSchedule({
        bars: 1,
        meter: COMMON_TIME,
        tempo: 120,
        speedRatio: 1,
        startTime: 0,
        ...patch,
      }),
    ).toBeNull();
  });
});

describe('barMeters and meterAtBar', () => {
  const meters = barMeters({
    masterBars: [
      { timeSignatureNumerator: 4, timeSignatureDenominator: 4 },
      { timeSignatureNumerator: 3, timeSignatureDenominator: 4 },
    ],
  });

  it('reads each bar’s meter by 1-based bar number', () => {
    expect(meterAtBar(meters, 1)).toEqual(COMMON_TIME);
    expect(meterAtBar(meters, 2)).toEqual(WALTZ);
  });

  it('is null for a bar the song lacks', () => {
    expect(meterAtBar(meters, 0)).toBeNull();
    expect(meterAtBar(meters, 3)).toBeNull();
    expect(meterAtBar(meters, 1.5)).toBeNull();
  });
});

describe('countsInEveryRepeat', () => {
  it('needs both a count-in and the every-repeat mode', () => {
    expect(countsInEveryRepeat({ countInBars: 1, countInMode: 'every_repeat' })).toBe(true);
    expect(countsInEveryRepeat({ countInBars: 2, countInMode: 'start' })).toBe(false);
    expect(countsInEveryRepeat({ countInBars: 0, countInMode: 'every_repeat' })).toBe(false);
  });
});
