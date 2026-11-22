import { barDurationMs, countInClicks, loopDurationMs } from './timing';

const fourFour120 = { beats: 4, beatValue: 4, tempo: 120 };

describe('barDurationMs', () => {
  it('is 2 s for 4/4 at 120', () => {
    expect(barDurationMs(fourFour120, 1)).toBe(2000);
  });

  it('scales with speed', () => {
    expect(barDurationMs(fourFour120, 0.5)).toBe(4000);
    expect(barDurationMs(fourFour120, 2)).toBe(1000);
  });

  it('handles 3/4 and 6/8', () => {
    expect(barDurationMs({ beats: 3, beatValue: 4, tempo: 120 }, 1)).toBe(1500);
    expect(barDurationMs({ beats: 6, beatValue: 8, tempo: 120 }, 1)).toBe(1500);
  });
});

describe('loopDurationMs', () => {
  it('sums bars across a tempo change', () => {
    const bars = [fourFour120, fourFour120, { ...fourFour120, tempo: 90 }];
    expect(loopDurationMs(bars, 1)).toBeCloseTo(2000 + 2000 + 2666.667, 2);
  });

  it('is 8 s for bars 5 to 8 of the 120 BPM groove', () => {
    expect(loopDurationMs([fourFour120, fourFour120, fourFour120, fourFour120], 1)).toBe(8000);
  });
});

describe('countInClicks', () => {
  it('clicks once per beat with the first beat of each bar accented', () => {
    const { clicks, downbeat } = countInClicks(fourFour120, 2, 1, 10);
    expect(clicks.map((c) => c.time)).toEqual([10, 10.5, 11, 11.5, 12, 12.5, 13, 13.5]);
    expect(clicks.map((c) => c.accent)).toEqual([
      true,
      false,
      false,
      false,
      true,
      false,
      false,
      false,
    ]);
    expect(downbeat).toBe(14);
  });

  it('follows 3/4 and speed', () => {
    const { clicks, downbeat } = countInClicks({ beats: 3, beatValue: 4, tempo: 90 }, 1, 0.5, 0);
    expect(clicks).toHaveLength(3);
    expect(clicks[1]?.time).toBeCloseTo(4 / 3);
    expect(downbeat).toBeCloseTo(4);
  });

  it('returns no clicks for zero bars', () => {
    expect(countInClicks(fourFour120, 0, 1, 5)).toEqual({ clicks: [], downbeat: 5 });
  });
});
