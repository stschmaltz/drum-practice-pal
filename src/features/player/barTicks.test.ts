import {
  barAtTick,
  barIndexAtTick,
  barRangeToTicks,
  startTickOfBar,
  startTickOfBarWithin,
  type BarTicks,
} from './barTicks';

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

describe('barAtTick', () => {
  it('returns the played bar a tick falls in, with its start', () => {
    expect(barAtTick(sixteenBars, 3840 * 2 + 900)).toEqual({
      barIndex: 2,
      start: 3840 * 2,
      end: 3840 * 3,
    });
  });

  it('picks the playthrough the tick is in when a bar repeats', () => {
    const repeated = [
      { barIndex: 0, start: 0, end: 100 },
      { barIndex: 0, start: 100, end: 200 },
    ];
    expect(barAtTick(repeated, 150)?.start).toBe(100);
  });

  it('returns null outside the song', () => {
    expect(barAtTick(sixteenBars, -1)).toBeNull();
    expect(barAtTick(sixteenBars, 16 * 3840)).toBeNull();
  });
});

describe('edge cases', () => {
  it('returns null for an empty tick cache (score not loaded yet)', () => {
    expect(barRangeToTicks([], 1, 1)).toBeNull();
    expect(barIndexAtTick([], 0)).toBeNull();
  });

  it('rejects a reversed range, which is what silently turned the spike loop off', () => {
    expect(barRangeToTicks(sixteenBars, 8, 5)).toBeNull();
  });

  it('reports the repeated bar index on its second playthrough', () => {
    const repeated: BarTicks[] = [0, 1, 0, 1, 2].map((barIndex, i) => ({
      barIndex,
      start: i * 100,
      end: (i + 1) * 100,
    }));
    expect(barIndexAtTick(repeated, 250)).toBe(0);
    expect(barIndexAtTick(repeated, 450)).toBe(2);
  });
});

describe('startTickOfBar', () => {
  it('finds the first playthrough of a bar', () => {
    const repeated: BarTicks[] = [0, 1, 0, 1, 2].map((barIndex, i) => ({
      barIndex,
      start: i * 100,
      end: (i + 1) * 100,
    }));
    expect(startTickOfBar(repeated, 2)).toBe(100);
    expect(startTickOfBar(repeated, 3)).toBe(400);
  });

  it('returns null for a bar that does not exist', () => {
    expect(startTickOfBar(sixteenBars, 0)).toBeNull();
    expect(startTickOfBar(sixteenBars, 17)).toBeNull();
  });
});

describe('startTickOfBarWithin', () => {
  // Bars 1, 2, 3, 4, 3, 4, 5 as they play: bars 3 and 4 repeat once.
  const repeated: BarTicks[] = [0, 1, 2, 3, 2, 3, 4].map((barIndex, i) => ({
    barIndex,
    start: i * 100,
    end: (i + 1) * 100,
  }));

  it("finds a bar inside the range, at the range's first and last bars too", () => {
    const range = { startTick: 4 * 3840, endTick: 8 * 3840 };
    expect(startTickOfBarWithin(sixteenBars, 5, range)).toBe(startTickOfBar(sixteenBars, 5));
    expect(startTickOfBarWithin(sixteenBars, 8, range)).toBe(startTickOfBar(sixteenBars, 8));
  });

  it('returns null for a bar before or after the range, and for no such bar', () => {
    const range = { startTick: 4 * 3840, endTick: 8 * 3840 };
    expect(startTickOfBarWithin(sixteenBars, 4, range)).toBeNull();
    expect(startTickOfBarWithin(sixteenBars, 9, range)).toBeNull();
    expect(startTickOfBarWithin(sixteenBars, 0, range)).toBeNull();
    expect(startTickOfBarWithin(sixteenBars, 17, range)).toBeNull();
  });

  it('takes the playthrough the range plays, not the first in the song', () => {
    // Bars 4 to 5: the first bar 4, then 3, 4, 5.
    const range = { startTick: 300, endTick: 700 };
    expect(startTickOfBarWithin(repeated, 3, range)).toBe(400);
    expect(startTickOfBarWithin(repeated, 4, range)).toBe(300);
    expect(startTickOfBarWithin(repeated, 5, range)).toBe(600);
    expect(startTickOfBarWithin(repeated, 2, range)).toBeNull();
  });
});
