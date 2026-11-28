import type { BarTicks } from '@/features/player/barTicks';
import { BAR_ONE_SECONDS_MAX } from '@/lib/schema';
import {
  barAtVideoSeconds,
  barTimesInPlayOrder,
  canNudge,
  lineUpSeconds,
  nudgedBarOne,
  NUDGE_SECONDS,
  parseVideoClock,
  videoClockLabel,
  videoSecondsOfBar,
  type BarTime,
} from './videoSync';

/** Ticks in a 4/4 bar: four quarter notes of 960. */
const BAR_44 = 3840;
/** Ticks in a 3/4 bar. */
const BAR_34 = 2880;

/** Bars in play order (1-based numbers), each `ticks` long, with no tempo data of their own. */
function bars(numbers: readonly number[], ticks: number | readonly number[] = BAR_44): BarTicks[] {
  let start = 0;
  return numbers.map((barNumber, position) => {
    const length = typeof ticks === 'number' ? ticks : (ticks[position] ?? BAR_44);
    const bar = { barIndex: barNumber - 1, start, end: start + length };
    start += length;
    return bar;
  });
}

const at = (tempo: number) => () => tempo;
const rounded = (times: readonly BarTime[]) =>
  times.map((bar) => [
    bar.barNumber,
    Number(bar.startSeconds.toFixed(3)),
    Number(bar.endSeconds.toFixed(3)),
  ]);

describe('barTimesInPlayOrder', () => {
  it('times straight 4/4 bars at 120 BPM at two seconds each', () => {
    expect(rounded(barTimesInPlayOrder(bars([1, 2, 3]), at(120)))).toEqual([
      [1, 0, 2],
      [2, 2, 4],
      [3, 4, 6],
    ]);
  });

  it.each([
    ['60 BPM', 60, 4],
    ['90 BPM', 90, 2.667],
    ['140 BPM', 140, 1.714],
    ['200 BPM', 200, 1.2],
  ])('a 4/4 bar at %s lasts as long as its four beats', (_name, tempo, seconds) => {
    expect(rounded(barTimesInPlayOrder(bars([1]), at(tempo)))).toEqual([[1, 0, seconds]]);
  });

  it('follows a tempo change at a bar line, from the tempo each bar starts at', () => {
    const tempoOfBar = (barNumber: number) => (barNumber < 3 ? 120 : 90);
    expect(rounded(barTimesInPlayOrder(bars([1, 2, 3, 4]), tempoOfBar))).toEqual([
      [1, 0, 2],
      [2, 2, 4],
      [3, 4, 6.667],
      [4, 6.667, 9.333],
    ]);
  });

  it('follows a tempo change part-way through a bar, from the bar’s own tick data', () => {
    const [first, second] = bars([1, 2]);
    const timed = barTimesInPlayOrder(
      [
        // Two beats at 120 (1 s), then two at 60 (2 s).
        {
          ...first!,
          tempoChanges: [
            { tick: 0, tempo: 120 },
            { tick: 1920, tempo: 60 },
          ],
        },
        // The next bar opens at the tempo the last one ended on.
        { ...second!, tempoChanges: [{ tick: 3840, tempo: 60 }] },
      ],
      // What the bar started at, which is not what it ended at.
      at(120),
    );
    expect(rounded(timed)).toEqual([
      [1, 0, 3],
      [2, 3, 7],
    ]);
  });

  it('takes the tick data’s tempo over the written one when both are there', () => {
    const [bar] = bars([1]);
    expect(
      rounded(barTimesInPlayOrder([{ ...bar!, tempoChanges: [{ tick: 0, tempo: 60 }] }], at(120))),
    ).toEqual([[1, 0, 4]]);
  });

  it('times a change of meter by each bar’s own length', () => {
    // 4/4, 3/4, 4/4 at 120: 2 s, 1.5 s, 2 s.
    expect(
      rounded(barTimesInPlayOrder(bars([1, 2, 3], [BAR_44, BAR_34, BAR_44]), at(120))),
    ).toEqual([
      [1, 0, 2],
      [2, 2, 3.5],
      [3, 3.5, 5.5],
    ]);
  });

  it('lists a repeated bar once per playthrough, in the order played', () => {
    expect(rounded(barTimesInPlayOrder(bars([1, 2, 3, 2, 3, 4]), at(120)))).toEqual([
      [1, 0, 2],
      [2, 2, 4],
      [3, 4, 6],
      [2, 6, 8],
      [3, 8, 10],
      [4, 10, 12],
    ]);
  });

  it.each([
    ['null', null],
    ['zero', 0],
    ['negative', -120],
    ['not a number', Number.NaN],
  ])('a bar whose tempo is %s runs on at the tempo before it', (_name, bad) => {
    const tempoOfBar = (barNumber: number) => (barNumber === 2 ? bad : 120);
    expect(rounded(barTimesInPlayOrder(bars([1, 2, 3]), tempoOfBar))).toEqual([
      [1, 0, 2],
      [2, 2, 4],
      [3, 4, 6],
    ]);
  });

  it('times nothing when the first bar has no tempo at all', () => {
    expect(barTimesInPlayOrder(bars([1, 2]), () => null)).toEqual([]);
    expect(barTimesInPlayOrder([], at(120))).toEqual([]);
  });

  it('ignores tempo changes that are unusable or lie past the bar', () => {
    const [bar] = bars([1]);
    const timed = barTimesInPlayOrder(
      [
        {
          ...bar!,
          tempoChanges: [
            { tick: 960, tempo: 0 },
            { tick: 9999, tempo: 30 },
          ],
        },
      ],
      at(120),
    );
    expect(rounded(timed)).toEqual([[1, 0, 2]]);
  });
});

/** Four bars of two seconds, bars 2 and 3 played twice: 1 2 3 2 3 4. */
const REPEATED = barTimesInPlayOrder(bars([1, 2, 3, 2, 3, 4]), at(120));
/** Four straight bars of two seconds. */
const STRAIGHT = barTimesInPlayOrder(bars([1, 2, 3, 4]), at(120));

describe('barAtVideoSeconds', () => {
  it.each([
    // bar 1 at 7 s of the video
    ['before bar 1', 7, 0, { at: 'notStarted' }],
    ['a moment before bar 1', 7, 6.999, { at: 'notStarted' }],
    ['on bar 1’s first instant', 7, 7, { at: 'bar', barNumber: 1, playIndex: 0 }],
    ['inside bar 1', 7, 8.9, { at: 'bar', barNumber: 1, playIndex: 0 }],
    ['on bar 2’s line', 7, 9, { at: 'bar', barNumber: 2, playIndex: 1 }],
    ['in the last bar', 7, 14.99, { at: 'bar', barNumber: 4, playIndex: 3 }],
    ['at the tab’s end', 7, 15, { at: 'ended' }],
    ['long after the end', 7, 600, { at: 'ended' }],
    // the tab starts with the video
    ['at zero with no offset', 0, 0, { at: 'bar', barNumber: 1, playIndex: 0 }],
    // the video starts part-way into the tab: bar 1 would be before the video's start
    ['with a negative offset', -3, 0, { at: 'bar', barNumber: 2, playIndex: 1 }],
    ['with a negative offset, later', -3, 4.5, { at: 'bar', barNumber: 4, playIndex: 3 }],
    ['with a negative offset, past the end', -3, 5, { at: 'ended' }],
  ] as const)('%s', (_name, barOne, video, expected) => {
    expect(barAtVideoSeconds(STRAIGHT, barOne, video)).toEqual(expected);
  });

  it('follows the bars in the order they are played through a repeat', () => {
    const numbers = [0, 2, 4, 6, 8, 10].map((seconds) => {
      const position = barAtVideoSeconds(REPEATED, 0, seconds + 0.5);
      return position?.at === 'bar' ? position.barNumber : null;
    });
    expect(numbers).toEqual([1, 2, 3, 2, 3, 4]);
  });

  it('follows a tempo change: bars after it are longer', () => {
    const tempoOfBar = (barNumber: number) => (barNumber < 3 ? 120 : 60);
    const times = barTimesInPlayOrder(bars([1, 2, 3, 4]), tempoOfBar);
    expect(barAtVideoSeconds(times, 0, 3.9)).toMatchObject({ barNumber: 2 });
    expect(barAtVideoSeconds(times, 0, 7.9)).toMatchObject({ barNumber: 3 });
    expect(barAtVideoSeconds(times, 0, 8)).toMatchObject({ barNumber: 4 });
  });

  it.each([0.25, 0.5, 0.75, 1, 1.25, 1.5, 2])(
    'is the same bar whatever rate the video plays at (%sx): its clock is in its own seconds',
    (rate) => {
      // Ten seconds of watching at this rate moves the video's clock by 10 x rate.
      const videoSeconds = 2 + 0.5 * rate;
      expect(barAtVideoSeconds(STRAIGHT, 2, videoSeconds)).toEqual({
        at: 'bar',
        barNumber: 1,
        playIndex: 0,
      });
    },
  );

  it('has no answer without timed bars or for a reading that isn’t a time', () => {
    expect(barAtVideoSeconds([], 0, 5)).toBeNull();
    expect(barAtVideoSeconds(STRAIGHT, 0, Number.NaN)).toBeNull();
    expect(barAtVideoSeconds(STRAIGHT, Number.NaN, 5)).toBeNull();
  });

  it('finds every bar of a long song', () => {
    const count = 400;
    const long = barTimesInPlayOrder(
      bars(Array.from({ length: count }, (_, index) => index + 1)),
      at(120),
    );
    for (let barNumber = 1; barNumber <= count; barNumber += 1) {
      expect(barAtVideoSeconds(long, 1.5, 1.5 + (barNumber - 1) * 2 + 1)).toMatchObject({
        barNumber,
      });
    }
  });
});

describe('videoSecondsOfBar', () => {
  it.each([
    [1, 7, 7],
    [2, 7, 9],
    [4, 7, 13],
    [1, 0, 0],
    // Bar 1 would be before the video's start: the video's start is as far back as it goes.
    [1, -3, 0],
    [3, -3, 1],
  ])('bar %i with bar 1 at %s s starts at %s s of the video', (barNumber, barOne, expected) => {
    expect(videoSecondsOfBar(STRAIGHT, barOne, barNumber)).toBe(expected);
  });

  it('is barAtVideoSeconds the other way round', () => {
    for (const barNumber of [1, 2, 3, 4]) {
      const seconds = videoSecondsOfBar(STRAIGHT, 12.345, barNumber);
      expect(barAtVideoSeconds(STRAIGHT, 12.345, seconds!)).toMatchObject({ barNumber });
    }
  });

  it('goes to a repeated bar’s first playthrough when it isn’t told where the video is', () => {
    expect(videoSecondsOfBar(REPEATED, 1, 2)).toBe(3);
  });

  it.each([
    ['in the first pass', 4, 3],
    ['just into the second pass', 7.5, 7],
    ['near the end', 11, 7],
    ['before the tab starts', 0, 3],
  ])('goes to the playthrough nearest the video’s time: %s', (_name, near, expected) => {
    expect(videoSecondsOfBar(REPEATED, 1, 2, near)).toBe(expected);
  });

  it('has no answer for a bar the tab doesn’t play', () => {
    expect(videoSecondsOfBar(STRAIGHT, 0, 5)).toBeNull();
    expect(videoSecondsOfBar(STRAIGHT, 0, 0)).toBeNull();
    expect(videoSecondsOfBar([], 0, 1)).toBeNull();
  });
});

describe('lining up and nudging', () => {
  it.each([
    [7.4321, 7.432],
    [0, 0],
    [-0.2, 0],
    [BAR_ONE_SECONDS_MAX + 5, BAR_ONE_SECONDS_MAX],
  ])('a press at %s s of the video saves %s', (video, saved) => {
    expect(lineUpSeconds(video)).toBe(saved);
  });

  it('saves nothing for a reading that isn’t a time', () => {
    expect(lineUpSeconds(Number.NaN)).toBeNull();
    expect(lineUpSeconds(Number.POSITIVE_INFINITY)).toBeNull();
  });

  it('a nudge moves bar 1 a quarter of a second, on the stored value', () => {
    expect(NUDGE_SECONDS).toBe(0.25);
    expect(nudgedBarOne(7.432, 'later')).toBe(7.682);
    expect(nudgedBarOne(7.432, 'earlier')).toBe(7.182);
    // No float noise builds up over many presses.
    let value = 0.1;
    for (let press = 0; press < 40; press += 1) value = nudgedBarOne(value, 'later');
    expect(value).toBe(10.1);
  });

  it('never goes before the video’s start or past what the column takes', () => {
    expect(nudgedBarOne(0.1, 'earlier')).toBe(0);
    expect(nudgedBarOne(BAR_ONE_SECONDS_MAX, 'later')).toBe(BAR_ONE_SECONDS_MAX);
    expect(canNudge(0, 'earlier')).toBe(false);
    expect(canNudge(0.1, 'earlier')).toBe(true);
    expect(canNudge(0, 'later')).toBe(true);
    expect(canNudge(BAR_ONE_SECONDS_MAX, 'later')).toBe(false);
  });

  it.each([
    [0, '0:00.00'],
    [7.25, '0:07.25'],
    [7.432, '0:07.43'],
    [59.999, '1:00.00'],
    [75.5, '1:15.50'],
    [3723.5, '1:02:03.50'],
  ])('shows %s s as %s', (seconds, label) => {
    expect(videoClockLabel(seconds)).toBe(label);
  });
});

// Shane, after trying it: "let's allow users to enter a timestamp directly".
describe('a typed time for bar 1', () => {
  it.each([
    ['7', 7],
    ['7.25', 7.25],
    ['7,25', 7.25],
    ['0:07', 7],
    ['0:07.25', 7.25],
    ['1:15.5', 75.5],
    ['01:15', 75],
    ['1:02:03.5', 3723.5],
    [' 0:07.25 ', 7.25],
    ['90', 90],
    ['90s', 90],
    ['1m30s', 90],
    ['1m30.5s', 90.5],
    ['2m', 120],
    ['0', 0],
    ['7.4321', 7.432],
    // What the line shows reads back as itself.
    [videoClockLabel(3723.5), 3723.5],
  ])('reads %j as %s seconds', (text, seconds) => {
    expect(parseVideoClock(text)).toBe(seconds);
  });

  it.each([
    [''],
    ['   '],
    ['abc'],
    ['-5'],
    ['1:75'],
    ['1:60:00'],
    ['1:2:3:4'],
    ['1:'],
    [':30'],
    ['1..5'],
    ['1e3'],
    ['Infinity'],
    ['0x10'],
    [String(BAR_ONE_SECONDS_MAX + 1)],
    ['99:59:59'],
  ])('refuses %j', (text) => {
    expect(parseVideoClock(text)).toBeNull();
  });
});
