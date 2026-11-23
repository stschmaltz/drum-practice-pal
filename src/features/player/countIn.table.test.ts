/**
 * The count-in scheduler across every combination a song can ask for: meters,
 * tempos, the speed bounds and bar counts. countIn.test.ts has the worked
 * examples; this file checks the rules hold everywhere, against arithmetic
 * written out independently of the module.
 */
import {
  COUNT_IN_BAR_OPTIONS,
  COUNT_IN_MODES,
  SPEED_RATIO_MAX,
  SPEED_RATIO_MIN,
} from '@/lib/schema';
import {
  barMeters,
  beatSeconds,
  COMMON_TIME,
  countInSchedule,
  countsInEveryRepeat,
  meterAtBar,
  type CountInRequest,
  type Meter,
} from './countIn';

const METERS: readonly Meter[] = [
  { beats: 4, beatValue: 4 },
  { beats: 3, beatValue: 4 },
  { beats: 2, beatValue: 4 },
  { beats: 5, beatValue: 4 },
  { beats: 7, beatValue: 4 },
  { beats: 2, beatValue: 2 },
  { beats: 3, beatValue: 8 },
  { beats: 6, beatValue: 8 },
  { beats: 7, beatValue: 8 },
  { beats: 9, beatValue: 8 },
  { beats: 12, beatValue: 8 },
  { beats: 5, beatValue: 16 },
  { beats: 1, beatValue: 4 },
];
const TEMPOS = [40, 90, 120, 133, 240] as const;
const RATIOS = [SPEED_RATIO_MIN, 0.5, 1, 1.5, SPEED_RATIO_MAX] as const;
const BAR_COUNTS = [1, 2] as const;
const START_TIMES = [0, 1234.56] as const;

interface Case extends CountInRequest {
  name: string;
}

const CASES: Case[] = METERS.flatMap((meter) =>
  TEMPOS.flatMap((tempo) =>
    RATIOS.flatMap((speedRatio) =>
      BAR_COUNTS.flatMap((bars) =>
        START_TIMES.map((startTime) => ({
          name: `${bars} bar(s) of ${meter.beats}/${meter.beatValue} at ${tempo} BPM x ${speedRatio} from ${startTime}s`,
          bars,
          meter,
          tempo,
          speedRatio,
          startTime,
        })),
      ),
    ),
  ),
);

/** One beat, worked out the long way: quarter notes a minute, then the beat's share of a quarter. */
function expectedBeatSeconds({ meter, tempo, speedRatio }: CountInRequest): number {
  const quartersPerSecond = (tempo * speedRatio) / 60;
  const quartersPerBeat = 4 / meter.beatValue;
  return quartersPerBeat / quartersPerSecond;
}

describe('the speed bounds the table uses', () => {
  it('are the ones the database allows', () => {
    expect(SPEED_RATIO_MIN).toBe(0.25);
    expect(SPEED_RATIO_MAX).toBe(2);
  });
});

describe(`countInSchedule over ${CASES.length} combinations`, () => {
  it.each(CASES)('$name', (request) => {
    const schedule = countInSchedule(request);
    if (!schedule) throw new Error('No schedule');
    const beat = expectedBeatSeconds(request);
    const { clicks } = schedule;

    // One click per beat of the meter, for every bar asked for.
    expect(clicks).toHaveLength(request.bars * request.meter.beats);
    expect(schedule.beatSeconds).toBeCloseTo(beat, 9);

    // The first click sounds when asked; every later one is a whole number of beats after it.
    expect(clicks[0]?.time).toBe(request.startTime);
    clicks.forEach((click, index) => {
      expect(click.time).toBeCloseTo(request.startTime + index * beat, 6);
      expect(click.bar).toBe(Math.floor(index / request.meter.beats) + 1);
      expect(click.beat).toBe((index % request.meter.beats) + 1);
      // Accented on beat one of each bar and nowhere else.
      expect(click.accent).toBe(index % request.meter.beats === 0);
    });

    // Strictly in time order, evenly spaced.
    for (let index = 1; index < clicks.length; index++) {
      const gap = (clicks[index]?.time ?? 0) - (clicks[index - 1]?.time ?? 0);
      expect(gap).toBeGreaterThan(0);
      expect(gap).toBeCloseTo(beat, 6);
    }

    // Playback is heard one beat after the last click, a whole count of bars after the first.
    expect(schedule.downbeat - (clicks.at(-1)?.time ?? 0)).toBeCloseTo(beat, 6);
    expect(schedule.downbeat - request.startTime).toBeCloseTo(
      request.bars * request.meter.beats * beat,
      6,
    );
  });
});

describe('countInSchedule scaling rules', () => {
  const base: CountInRequest = {
    bars: 1,
    meter: COMMON_TIME,
    tempo: 120,
    speedRatio: 1,
    startTime: 0,
  };
  const length = (patch: Partial<CountInRequest>) => {
    const schedule = countInSchedule({ ...base, ...patch });
    if (!schedule) throw new Error('No schedule');
    return schedule.downbeat;
  };

  it.each(METERS)('two bars of $beats/$beatValue take twice as long as one', (meter) => {
    expect(length({ meter, bars: 2 })).toBeCloseTo(2 * length({ meter, bars: 1 }), 9);
  });

  it.each(TEMPOS)(
    'at %s BPM, half speed doubles the count-in and double speed halves it',
    (tempo) => {
      expect(length({ tempo, speedRatio: 0.5 })).toBeCloseTo(2 * length({ tempo }), 9);
      expect(length({ tempo, speedRatio: 2 })).toBeCloseTo(length({ tempo }) / 2, 9);
    },
  );

  it('counts the same at 120 BPM x 0.75 as at 90 BPM x 1: only tempo x speed matters', () => {
    expect(length({ tempo: 120, speedRatio: 0.75 })).toBeCloseTo(length({ tempo: 90 }), 9);
  });

  it('a bar of 6/8 lasts as long as a bar of 3/4 at the same tempo, in twice the clicks', () => {
    const waltz = countInSchedule({ ...base, meter: { beats: 3, beatValue: 4 } });
    const sixEight = countInSchedule({ ...base, meter: { beats: 6, beatValue: 8 } });
    expect(sixEight?.downbeat).toBeCloseTo(waltz?.downbeat ?? -1, 9);
    expect(sixEight?.clicks).toHaveLength(2 * (waltz?.clicks.length ?? 0));
  });

  it('at the slowest speed a 4/4 bar at 120 BPM takes eight seconds; at the fastest, one', () => {
    expect(length({ speedRatio: SPEED_RATIO_MIN })).toBeCloseTo(8, 9);
    expect(length({ speedRatio: SPEED_RATIO_MAX })).toBeCloseTo(1, 9);
  });

  it('moving the start moves every click and the downbeat by the same amount', () => {
    const early = countInSchedule({ ...base, bars: 2, startTime: 1 });
    const late = countInSchedule({ ...base, bars: 2, startTime: 101 });
    expect(late?.clicks.map((click) => click.time - 100)).toEqual(
      early?.clicks.map((click) => click.time),
    );
    expect((late?.downbeat ?? 0) - 100).toBeCloseTo(early?.downbeat ?? -1, 9);
  });

  it('does not drift over a long count: the last of many clicks is still on the grid', () => {
    // 12/8 at a tempo whose beat is not a round binary fraction.
    const schedule = countInSchedule({
      bars: 2,
      meter: { beats: 12, beatValue: 8 },
      tempo: 133,
      speedRatio: 0.85,
      startTime: 987.654,
    });
    const beat = 60 / (133 * 0.85) / 2;
    expect(schedule?.clicks.at(-1)?.time).toBeCloseTo(987.654 + 23 * beat, 9);
    expect(schedule?.downbeat).toBeCloseTo(987.654 + 24 * beat, 9);
  });

  it('accepts a negative start time (a clock that has not reached zero)', () => {
    const schedule = countInSchedule({ ...base, startTime: -1 });
    expect(schedule?.clicks.map((click) => click.time)).toEqual([-1, -0.5, 0, 0.5]);
    expect(schedule?.downbeat).toBe(1);
  });
});

describe('countInSchedule with nothing to count or bad input', () => {
  const base: CountInRequest = {
    bars: 1,
    meter: COMMON_TIME,
    tempo: 120,
    speedRatio: 1,
    startTime: 0,
  };

  it.each<[string, Partial<CountInRequest>]>([
    ['count-in off (0 bars)', { bars: 0 }],
    ['a negative bar count', { bars: -1 }],
    ['a fractional bar count', { bars: 0.5 }],
    ['a NaN bar count', { bars: Number.NaN }],
    ['an infinite bar count', { bars: Number.POSITIVE_INFINITY }],
    ['a zero tempo', { tempo: 0 }],
    ['a negative tempo', { tempo: -90 }],
    ['a NaN tempo', { tempo: Number.NaN }],
    ['an infinite tempo', { tempo: Number.POSITIVE_INFINITY }],
    ['a zero speed', { speedRatio: 0 }],
    ['a negative speed', { speedRatio: -1 }],
    ['a NaN speed', { speedRatio: Number.NaN }],
    ['an infinite speed', { speedRatio: Number.POSITIVE_INFINITY }],
    ['a negative tempo and a negative speed', { tempo: -120, speedRatio: -1 }],
    ['a meter with no beats', { meter: { beats: 0, beatValue: 4 } }],
    ['a meter with negative beats', { meter: { beats: -4, beatValue: 4 } }],
    ['a meter with fractional beats', { meter: { beats: 3.5, beatValue: 4 } }],
    ['a meter with NaN beats', { meter: { beats: Number.NaN, beatValue: 4 } }],
    ['a meter with infinite beats', { meter: { beats: Number.POSITIVE_INFINITY, beatValue: 4 } }],
    ['a meter with no beat value', { meter: { beats: 4, beatValue: 0 } }],
    ['a meter with a negative beat value', { meter: { beats: 4, beatValue: -4 } }],
    ['a meter with a NaN beat value', { meter: { beats: 4, beatValue: Number.NaN } }],
    [
      'a meter with an infinite beat value',
      { meter: { beats: 4, beatValue: Number.POSITIVE_INFINITY } },
    ],
    ['a NaN start time', { startTime: Number.NaN }],
    ['an infinite start time', { startTime: Number.POSITIVE_INFINITY }],
  ])('returns null for %s', (_name, patch) => {
    expect(countInSchedule({ ...base, ...patch })).toBeNull();
  });

  it('never returns a click at a time that is not a number', () => {
    // Every pairing of odd values: either null, or a schedule that is finite throughout.
    const odd = [0, -1, 0.5, 1, 2, Number.NaN, Number.POSITIVE_INFINITY];
    for (const bars of odd) {
      for (const tempo of odd) {
        for (const speedRatio of odd) {
          for (const beatValue of odd) {
            const schedule = countInSchedule({
              bars,
              tempo,
              speedRatio,
              meter: { beats: 4, beatValue },
              startTime: 0,
            });
            if (!schedule) continue;
            expect(schedule.clicks.length).toBeGreaterThan(0);
            expect(Number.isFinite(schedule.downbeat)).toBe(true);
            expect(schedule.beatSeconds).toBeGreaterThan(0);
            for (const click of schedule.clicks) expect(Number.isFinite(click.time)).toBe(true);
          }
        }
      }
    }
  });
});

describe('beatSeconds', () => {
  it.each([
    [{ beats: 4, beatValue: 4 }, 120, 1, 0.5],
    [{ beats: 3, beatValue: 4 }, 120, 1, 0.5],
    [{ beats: 6, beatValue: 8 }, 120, 1, 0.25],
    [{ beats: 2, beatValue: 2 }, 120, 1, 1],
    [{ beats: 5, beatValue: 16 }, 120, 1, 0.125],
    [{ beats: 4, beatValue: 4 }, 90, 1, 2 / 3],
    [{ beats: 4, beatValue: 4 }, 90, 0.75, 60 / 67.5],
    [{ beats: 4, beatValue: 4 }, 60, 0.25, 4],
    [{ beats: 4, beatValue: 4 }, 240, 2, 0.125],
  ] as const)('%o at %s BPM x %s is %s s', (meter, tempo, ratio, expected) => {
    expect(beatSeconds(meter, tempo, ratio)).toBeCloseTo(expected, 9);
  });

  it('does not depend on how many beats the bar has', () => {
    expect(beatSeconds({ beats: 3, beatValue: 4 }, 100, 1)).toBe(
      beatSeconds({ beats: 7, beatValue: 4 }, 100, 1),
    );
  });
});

describe('meterAtBar over a song whose meter changes', () => {
  const meters = barMeters({
    masterBars: [
      { timeSignatureNumerator: 4, timeSignatureDenominator: 4 },
      { timeSignatureNumerator: 4, timeSignatureDenominator: 4 },
      { timeSignatureNumerator: 7, timeSignatureDenominator: 8 },
      { timeSignatureNumerator: 3, timeSignatureDenominator: 4 },
    ],
  });

  it('gives each bar its own meter, by 1-based bar number', () => {
    expect(meters).toHaveLength(4);
    expect(meterAtBar(meters, 2)).toEqual({ beats: 4, beatValue: 4 });
    expect(meterAtBar(meters, 3)).toEqual({ beats: 7, beatValue: 8 });
    expect(meterAtBar(meters, 4)).toEqual({ beats: 3, beatValue: 4 });
  });

  it.each([0, -1, 5, 2.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'is null for bar %s',
    (barNumber) => {
      expect(meterAtBar(meters, barNumber)).toBeNull();
    },
  );

  it('is null for any bar of a song with no bars', () => {
    expect(meterAtBar(barMeters({ masterBars: [] }), 1)).toBeNull();
  });
});

describe('countsInEveryRepeat', () => {
  it.each(
    COUNT_IN_BAR_OPTIONS.flatMap((countInBars) =>
      COUNT_IN_MODES.map((countInMode) => ({ countInBars, countInMode })),
    ),
  )('$countInBars bar(s), mode $countInMode', (settings) => {
    expect(countsInEveryRepeat(settings)).toBe(
      settings.countInBars !== 0 && settings.countInMode === 'every_repeat',
    );
  });

  it('covers off, 1 and 2 bars in both modes', () => {
    expect([...COUNT_IN_BAR_OPTIONS]).toEqual([0, 1, 2]);
    expect([...COUNT_IN_MODES].sort()).toEqual(['every_repeat', 'start']);
  });
});
