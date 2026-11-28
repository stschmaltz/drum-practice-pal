import type { BarTicks } from '@/features/player/barTicks';
import { BAR_ONE_SECONDS_MAX } from '@/lib/schema';
import {
  barAtVideoSeconds,
  barTimesInPlayOrder,
  canNudge,
  lineUpSeconds,
  nudgedBarOne,
  NUDGE_SECONDS,
  typedBarOne,
  videoSecondsOfBar,
  type BarTime,
} from './videoSync';
import { videoClockLabel } from './videoClock';

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

describe('barTimesInPlayOrder: more shapes of a tab (19 Test)', () => {
  it('lists a bar played three times three times, each two seconds after the last pass began', () => {
    const times = barTimesInPlayOrder(bars([1, 2, 3, 2, 3, 2, 3, 4]), at(120));
    expect(times.map((bar) => bar.barNumber)).toEqual([1, 2, 3, 2, 3, 2, 3, 4]);
    expect(times.filter((bar) => bar.barNumber === 2).map((bar) => bar.startSeconds)).toEqual([
      2, 6, 10,
    ]);
    expect(times.at(-1)).toEqual({ barNumber: 4, startSeconds: 14, endSeconds: 16 });
  });

  it('times a tempo change inside a repeated bar at each playthrough, from that playthrough’s own ticks', () => {
    // Bar 2 slows from 120 to 60 half-way (1 s + 2 s), and is played twice; bar 3 is back at 120.
    const [one, first, second, three] = bars([1, 2, 2, 3]);
    const slowing = (bar: BarTicks): BarTicks => ({
      ...bar,
      tempoChanges: [
        { tick: bar.start, tempo: 120 },
        { tick: bar.start + 1920, tempo: 60 },
      ],
    });
    const opening = (bar: BarTicks): BarTicks => ({
      ...bar,
      tempoChanges: [{ tick: bar.start, tempo: 120 }],
    });
    const times = barTimesInPlayOrder(
      [opening(one!), slowing(first!), slowing(second!), opening(three!)],
      at(120),
    );
    expect(rounded(times)).toEqual([
      [1, 0, 2],
      [2, 2, 5],
      [2, 5, 8],
      [3, 8, 10],
    ]);
  });

  it('takes several changes in one bar in the order of their ticks, however they are listed', () => {
    // A bar that speeds up beat by beat: 60, 120, 240, 240 (1 + 0.5 + 0.25 + 0.25 s).
    const [bar] = bars([1]);
    const timed = barTimesInPlayOrder(
      [
        {
          ...bar!,
          tempoChanges: [
            { tick: 1920, tempo: 240 },
            { tick: 0, tempo: 60 },
            { tick: 960, tempo: 120 },
          ],
        },
      ],
      at(999),
    );
    expect(rounded(timed)).toEqual([[1, 0, 2]]);
  });

  it('times a pickup bar by the beats it has, and a tempo and a meter that change together', () => {
    // One beat of pickup at 120 (0.5 s), a 4/4 bar at 120 (2 s), then 6/8 at 90: six eighths, 2 s.
    const tempoOfBar = (barNumber: number) => (barNumber < 3 ? 120 : 90);
    expect(
      rounded(barTimesInPlayOrder(bars([1, 2, 3, 4], [960, BAR_44, 2880, 2880]), tempoOfBar)),
    ).toEqual([
      [1, 0, 0.5],
      [2, 0.5, 2.5],
      [3, 2.5, 4.5],
      [4, 4.5, 6.5],
    ]);
  });

  it('each bar starts where the one before ended, over a very long song at a tempo that divides badly', () => {
    const count = 3000;
    const times = barTimesInPlayOrder(
      bars(Array.from({ length: count }, (_, index) => index + 1)),
      at(137),
    );
    expect(times).toHaveLength(count);
    times.forEach((bar, index) => {
      expect(bar.startSeconds).toBe(index === 0 ? 0 : times[index - 1]!.endSeconds);
      expect(bar.endSeconds).toBeGreaterThan(bar.startSeconds);
    });
    // 3000 bars of 240/137 s: an hour and a half, with no drift worth a millionth of a second.
    expect(times.at(-1)!.endSeconds).toBeCloseTo((count * 240) / 137, 6);
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

/**
 * A tab with everything in it, in play order: bars 2 and 3 three times, a
 * 3/4 bar, tempos whose bars aren't whole seconds (90 and 137 BPM), and a
 * last bar that slows half-way.
 */
const MIXED: readonly BarTime[] = (() => {
  const order = [1, 2, 3, 2, 3, 2, 3, 4, 5, 6];
  const ticks = order.map((barNumber) => (barNumber === 4 ? BAR_34 : BAR_44));
  const tempoOfBar = (barNumber: number) => (barNumber < 4 ? 90 : 137);
  const played = bars(order, ticks);
  const last = played.at(-1)!;
  return barTimesInPlayOrder(
    [
      ...played.slice(0, -1),
      {
        ...last,
        tempoChanges: [
          { tick: last.start, tempo: 137 },
          { tick: last.start + 1920, tempo: 71 },
        ],
      },
    ],
    tempoOfBar,
  );
})();

/** Where bar 1 can fall: the video's start, a nudge, a press, an hour in, the column's end. */
const BAR_ONES = [0, 0.25, 7.432, 3600.001, BAR_ONE_SECONDS_MAX];

describe('on a bar line, and either side of it (19 Test)', () => {
  it('has the shape it was built with', () => {
    expect(MIXED.map((bar) => bar.barNumber)).toEqual([1, 2, 3, 2, 3, 2, 3, 4, 5, 6]);
    // 4/4 at 90 is 2.667 s, 3/4 at 137 is 1.314 s, and the last bar is 0.876 + 1.690 s.
    expect(MIXED[1]!.startSeconds).toBeCloseTo(240 / 90, 9);
    expect(MIXED[8]!.startSeconds - MIXED[7]!.startSeconds).toBeCloseTo(180 / 137, 9);
    expect(MIXED[9]!.endSeconds - MIXED[9]!.startSeconds).toBeCloseTo(120 / 137 + 120 / 71, 9);
  });

  it.each(BAR_ONES)(
    'with bar 1 at %s s: exactly on each bar’s line is that playthrough, a millisecond before it the one before',
    (barOne) => {
      MIXED.forEach((bar, playIndex) => {
        expect(barAtVideoSeconds(MIXED, barOne, barOne + bar.startSeconds)).toEqual({
          at: 'bar',
          barNumber: bar.barNumber,
          playIndex,
        });
        const before = barAtVideoSeconds(MIXED, barOne, barOne + bar.startSeconds - 0.001);
        expect(before).toEqual(
          playIndex === 0
            ? { at: 'notStarted' }
            : { at: 'bar', barNumber: MIXED[playIndex - 1]!.barNumber, playIndex: playIndex - 1 },
        );
        // And anywhere inside it, up to a millisecond before the next line.
        const inside = barAtVideoSeconds(MIXED, barOne, barOne + bar.endSeconds - 0.001);
        expect(inside).toMatchObject({ playIndex });
      });
      const end = MIXED.at(-1)!.endSeconds;
      expect(barAtVideoSeconds(MIXED, barOne, barOne + end)).toEqual({ at: 'ended' });
      expect(barAtVideoSeconds(MIXED, barOne, barOne + end + 0.001)).toEqual({ at: 'ended' });
    },
  );

  it.each(BAR_ONES)(
    'with bar 1 at %s s: a tap on any playthrough goes to its own line, which is that playthrough again',
    (barOne) => {
      MIXED.forEach((bar, playIndex) => {
        // The video is half a second into the playthrough tapped.
        const near = barOne + bar.startSeconds + 0.5;
        const target = videoSecondsOfBar(MIXED, barOne, bar.barNumber, near);
        expect(target).toBe(barOne + bar.startSeconds);
        expect(barAtVideoSeconds(MIXED, barOne, target!)).toMatchObject({ playIndex });
      });
    },
  );

  it('a sum with float noise in it is still the bar’s first instant, not the moment before bar 1', () => {
    // 0.1 + 0.2 is a hair over 0.3 in a double.
    expect(barAtVideoSeconds(STRAIGHT, 0.1 + 0.2, 0.3)).toEqual({
      at: 'bar',
      barNumber: 1,
      playIndex: 0,
    });
    expect(barAtVideoSeconds(STRAIGHT, 0.3, 0.1 + 0.2 + 2)).toMatchObject({ barNumber: 2 });
  });

  it('a tempo change inside a bar moves the next bar’s line, not the bar’s own start', () => {
    const start = MIXED[9]!.startSeconds;
    const half = 120 / 137;
    // Half-way through the bar's beats is 0.876 s in, not half its 2.566 s.
    expect(barAtVideoSeconds(MIXED, 0, start + half + 1.6)).toMatchObject({ barNumber: 6 });
    expect(barAtVideoSeconds(MIXED, 0, start + half + 1.7)).toEqual({ at: 'ended' });
  });
});

describe('a bar played three times (19 Test)', () => {
  /** 1 2 3 2 3 2 3 4 at two seconds a bar: bar 2 starts 2, 6 and 10 s into the tab. */
  const THRICE = barTimesInPlayOrder(bars([1, 2, 3, 2, 3, 2, 3, 4]), at(120));

  it('is followed through each pass in turn', () => {
    const seen = Array.from({ length: 8 }, (_, position) => {
      const found = barAtVideoSeconds(THRICE, 5, 5 + position * 2 + 1.9);
      return found?.at === 'bar' ? [found.barNumber, found.playIndex] : null;
    });
    expect(seen).toEqual([
      [1, 0],
      [2, 1],
      [3, 2],
      [2, 3],
      [3, 4],
      [2, 5],
      [3, 6],
      [4, 7],
    ]);
  });

  it.each([
    ['before the tab starts', 0, 7],
    ['in the first pass', 8.5, 7],
    ['in bar 3 of the first pass, nearer the second', 10.5, 11],
    ['in the second pass', 12, 11],
    ['in the third pass', 16.9, 15],
    ['in the last bar', 20, 15],
    ['long after the tab has run out', 500, 15],
    // Exactly half-way between two passes: back to the one already heard.
    ['half-way between the first and the second', 9, 7],
    ['half-way between the second and the third', 13, 11],
  ])('a tap on bar 2 with the video %s (%s s) goes to %s s', (_name, near, expected) => {
    expect(videoSecondsOfBar(THRICE, 5, 2, near)).toBe(expected);
  });

  it('a tap on a bar played once goes there wherever the video is', () => {
    for (const near of [0, 9, 13, 500, Number.NaN]) {
      expect(videoSecondsOfBar(THRICE, 5, 4, near)).toBe(19);
      expect(videoSecondsOfBar(THRICE, 5, 1, near)).toBe(5);
    }
  });

  it('with bar 1 before the video’s start, a pass that began before it is the video’s start', () => {
    // Bar 1 at -7 s: bar 2's passes would be at -5, -1 and 3 s of the video.
    expect(videoSecondsOfBar(THRICE, -7, 2, 0)).toBe(0);
    expect(videoSecondsOfBar(THRICE, -7, 2, 2.5)).toBe(3);
  });
});

describe('where a moment of the video is after nudges (19 Test)', () => {
  /** How many presses of one direction, from a line-up at `from`. */
  const nudged = (from: number, direction: 'earlier' | 'later', presses: number) => {
    let value = from;
    for (let press = 0; press < presses; press += 1) value = nudgedBarOne(value, direction);
    return value;
  };

  it.each([
    // The video stands at 7.1 s; bar 1 was lined up at 7 s, so it is just into bar 1.
    ['no nudge', 'later', 0, { at: 'bar', barNumber: 1, playIndex: 0 }],
    // "Tab later": bar 1 is now at 7.25 s, which hasn't come yet. The time since bar 1 is negative.
    ['one later', 'later', 1, { at: 'notStarted' }],
    ['four later', 'later', 4, { at: 'notStarted' }],
    ['one earlier', 'earlier', 1, { at: 'bar', barNumber: 1, playIndex: 0 }],
    // Seven earlier is 5.25 s: 1.85 s into bar 1. Eight is 5 s: 2.1 s in, bar 2.
    ['seven earlier', 'earlier', 7, { at: 'bar', barNumber: 1, playIndex: 0 }],
    ['eight earlier', 'earlier', 8, { at: 'bar', barNumber: 2, playIndex: 1 }],
    // As far back as it goes, the video's start: 7.1 s in is bar 4, and it stops there.
    ['twenty-eight earlier', 'earlier', 28, { at: 'bar', barNumber: 4, playIndex: 3 }],
    ['a hundred earlier', 'earlier', 100, { at: 'bar', barNumber: 4, playIndex: 3 }],
  ] as const)('%s', (_name, direction, presses, expected) => {
    expect(barAtVideoSeconds(STRAIGHT, nudged(7, direction, presses), 7.1)).toEqual(expected);
  });

  it('a video back at its start, before a bar 1 that was nudged later, has not started', () => {
    expect(barAtVideoSeconds(STRAIGHT, nudged(0, 'later', 1), 0)).toEqual({ at: 'notStarted' });
    expect(barAtVideoSeconds(STRAIGHT, nudged(0, 'later', 1), 0.25)).toMatchObject({
      barNumber: 1,
    });
    // And the tap that would go before the video's start goes to its start.
    expect(videoSecondsOfBar(STRAIGHT, nudged(0.1, 'earlier', 3), 1)).toBe(0);
  });
});

describe('lining up and nudging', () => {
  describe('in quarter-second steps (19 Test)', () => {
    it.each([0, 0.001, 0.25, 0.999, 7.432, 59.875, 3600.001, 12345.678])(
      'later then earlier from %s s is back on the stored value exactly, and so is earlier then later',
      (stored) => {
        expect(nudgedBarOne(nudgedBarOne(stored, 'later'), 'earlier')).toBe(stored);
        if (stored >= NUDGE_SECONDS) {
          expect(nudgedBarOne(nudgedBarOne(stored, 'earlier'), 'later')).toBe(stored);
        }
      },
    );

    it('a thousand presses from the video’s start are a thousand quarter seconds, with nothing lost or gained', () => {
      let value = 0;
      for (let press = 1; press <= 1000; press += 1) {
        value = nudgedBarOne(value, 'later');
        expect(value).toBe(press * NUDGE_SECONDS);
      }
      for (let press = 999; press >= 0; press -= 1) {
        value = nudgedBarOne(value, 'earlier');
        expect(value).toBe(press * NUDGE_SECONDS);
      }
    });

    it('keeps the thousandths a press was saved with, and never grows a fourth decimal', () => {
      let value = lineUpSeconds(7.4321)!;
      for (let press = 0; press < 200; press += 1) {
        value = nudgedBarOne(value, press % 3 === 0 ? 'earlier' : 'later');
        expect(Number(value.toFixed(3))).toBe(value);
        // 7.432 + a whole number of quarters: the thousandths stay 432, 682, 932 or 182.
        expect([432, 682, 932, 182]).toContain(Math.round((value % 1) * 1000));
      }
    });

    it.each([
      // A nudge an end cuts short lands on the end.
      [0.1, 'earlier', 0],
      [0.249, 'earlier', 0],
      [0.25, 'earlier', 0],
      [0.251, 'earlier', 0.001],
      [BAR_ONE_SECONDS_MAX - 0.1, 'later', BAR_ONE_SECONDS_MAX],
      [BAR_ONE_SECONDS_MAX - 0.25, 'later', BAR_ONE_SECONDS_MAX],
      [BAR_ONE_SECONDS_MAX - 0.251, 'later', BAR_ONE_SECONDS_MAX - 0.001],
    ] as const)('%s s nudged %s is %s s', (stored, direction, expected) => {
      expect(nudgedBarOne(stored, direction)).toBe(expected);
      expect(canNudge(stored, direction)).toBe(true);
    });

    it('from an end, the way back is a whole quarter: the tenth it was short by isn’t remembered', () => {
      expect(nudgedBarOne(nudgedBarOne(0.1, 'earlier'), 'later')).toBe(0.25);
      expect(nudgedBarOne(nudgedBarOne(BAR_ONE_SECONDS_MAX - 0.1, 'later'), 'earlier')).toBe(
        BAR_ONE_SECONDS_MAX - 0.25,
      );
    });

    // Down to the millisecond, never up: bar 1 must not start after the clock it was pressed
    // at, or a video lined up while paused would be "before bar 1" until it is played (19 QA
    // fix round 1, where a paused video can be lined up).
    it.each([
      [0.0004, 0],
      [0.0006, 0],
      [7.4999, 7.499],
      [59.9996, 59.999],
      [7.432, 7.432],
      [0.001, 0.001],
      [BAR_ONE_SECONDS_MAX - 0.0004, BAR_ONE_SECONDS_MAX - 0.001],
    ])('a press at %s s is saved to the millisecond at or before it: %s', (video, saved) => {
      expect(lineUpSeconds(video)).toBe(saved);
    });

    it('a video lined up on a clock that then stands still (paused) is in bar 1 on that clock', () => {
      const times = barTimesInPlayOrder(bars([1, 2, 3]), at(120));
      let checked = 0;
      for (let clock = 0; clock < 12; clock += 0.0137) {
        const barOne = lineUpSeconds(clock)!;
        expect(barOne).toBeLessThanOrEqual(clock + 1e-9);
        expect(clock - barOne).toBeLessThan(0.001 + 1e-9);
        expect(barAtVideoSeconds(times, barOne, clock)).toMatchObject({ at: 'bar', barNumber: 1 });
        checked += 1;
      }
      expect(checked).toBeGreaterThan(800);
    });

    it('what a press saves, the column takes: never under zero, never over its end, always a number', () => {
      for (const video of [-1e9, -0.0001, 0, 1e-9, 43199.9999, 43200, 43200.0001, 1e12]) {
        const saved = lineUpSeconds(video)!;
        expect(saved).toBeGreaterThanOrEqual(0);
        expect(saved).toBeLessThanOrEqual(BAR_ONE_SECONDS_MAX);
        for (const direction of ['earlier', 'later'] as const) {
          const moved = nudgedBarOne(saved, direction);
          expect(moved).toBeGreaterThanOrEqual(0);
          expect(moved).toBeLessThanOrEqual(BAR_ONE_SECONDS_MAX);
        }
      }
    });

    it.each([
      [7.432, 'later', '0:07.68'],
      [7.432, 'earlier', '0:07.18'],
      [59.875, 'later', '1:00.13'],
      [0.1, 'earlier', '0:00.00'],
      [3599.9, 'later', '1:00:00.15'],
      [BAR_ONE_SECONDS_MAX, 'later', '12:00:00.00'],
    ] as const)('bar 1 at %s s nudged %s reads %s', (stored, direction, label) => {
      expect(videoClockLabel(nudgedBarOne(stored, direction))).toBe(label);
    });
  });

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
});

describe('what saving a typed time comes to', () => {
  it('a new time is a change, to the millisecond', () => {
    expect(typedBarOne('0:07.25', '', null)).toEqual({ seconds: 7.25, changed: true });
    expect(typedBarOne('0:13', '0:12.50', 12.5)).toEqual({ seconds: 13, changed: true });
  });

  it.each(['0:02.02', '2.02', ' 0:02.020 ', '2,02s'])(
    'the time the field opened on, written as %j, keeps the stored value and changes nothing',
    (text) => {
      expect(typedBarOne(text, '0:02.02', 2.018)).toEqual({ seconds: 2.018, changed: false });
    },
  );

  it('a hundredth away from what the field opened on is a change', () => {
    expect(typedBarOne('0:02.03', '0:02.02', 2.018)).toEqual({ seconds: 2.03, changed: true });
  });

  it('the stored value itself, typed over a field that opened on another, changes nothing', () => {
    // Another device moved the line-up while the field was open.
    expect(typedBarOne('3', '0:02.02', 3)).toEqual({ seconds: 3, changed: false });
  });

  it('is null for what isn’t a time', () => {
    expect(typedBarOne('soon', '', null)).toBeNull();
    expect(typedBarOne('', '0:02.02', 2.018)).toBeNull();
  });
});
