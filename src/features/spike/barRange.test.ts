import { barIndexAtTick, barRangeToTicks, clampSpeedRatio, type BarTicks } from './barRange';

const sixteenBars: BarTicks[] = Array.from({ length: 16 }, (_, barIndex) => ({
  barIndex,
  start: barIndex * 3840,
  end: (barIndex + 1) * 3840,
}));

describe('barRangeToTicks', () => {
  it('covers bars 5 to 8 inclusive', () => {
    expect(barRangeToTicks(sixteenBars, 5, 8)).toEqual({ startTick: 4 * 3840, endTick: 8 * 3840 });
  });

  it('handles a single bar', () => {
    expect(barRangeToTicks(sixteenBars, 1, 1)).toEqual({ startTick: 0, endTick: 3840 });
  });

  it('handles the last bar', () => {
    expect(barRangeToTicks(sixteenBars, 16, 16)).toEqual({
      startTick: 15 * 3840,
      endTick: 16 * 3840,
    });
  });

  it.each([
    [0, 4],
    [5, 4],
    [5, 17],
    [17, 17],
  ])('rejects bars %i to %i', (start, end) => {
    expect(barRangeToTicks(sixteenBars, start, end)).toBeNull();
  });

  it('uses the first playthrough when bars repeat', () => {
    // Bars 1-2 repeated once: played order 0, 1, 0, 1, 2
    const repeated: BarTicks[] = [0, 1, 0, 1, 2].map((barIndex, i) => ({
      barIndex,
      start: i * 100,
      end: (i + 1) * 100,
    }));
    expect(barRangeToTicks(repeated, 1, 2)).toEqual({ startTick: 0, endTick: 200 });
    expect(barRangeToTicks(repeated, 2, 3)).toEqual({ startTick: 100, endTick: 500 });
  });
});

describe('clampSpeedRatio', () => {
  it.each([
    [0.1, 0.25],
    [0.25, 0.25],
    [1, 1],
    [2, 2],
    [3, 2],
    [Number.NaN, 1],
  ])('clamps %f to %f', (input, expected) => {
    expect(clampSpeedRatio(input)).toBe(expected);
  });
});

describe('barIndexAtTick', () => {
  it('finds the bar containing a tick', () => {
    expect(barIndexAtTick(sixteenBars, 0)).toBe(0);
    expect(barIndexAtTick(sixteenBars, 3839)).toBe(0);
    expect(barIndexAtTick(sixteenBars, 3840)).toBe(1);
  });

  it('returns null past the end', () => {
    expect(barIndexAtTick(sixteenBars, 16 * 3840)).toBeNull();
  });
});
