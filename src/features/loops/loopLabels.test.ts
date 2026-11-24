import { speedLabel, targetProgress } from './loopLabels';

describe('speedLabel', () => {
  it.each([
    [1, 120, '100% (120 BPM)'],
    [0.85, 120, '85% (102 BPM)'],
    [0.708333, 120, '71% (85 BPM)'],
    [0.5, 90, '50% (45 BPM)'],
    [2, 92.5, '200% (185 BPM)'],
  ])('%f at a tempo of %f is %j', (ratio, tempo, label) => {
    expect(speedLabel(ratio, tempo)).toBe(label);
  });

  it('gives only the percent until the tempo is known', () => {
    expect(speedLabel(0.85, null)).toBe('85%');
  });
});

describe('targetProgress', () => {
  it('is nothing without a target', () => {
    expect(targetProgress(0.8, null)).toBeNull();
  });

  it.each([
    [0.5, 1, 50, 100, 0.5, false],
    [0.9, 0.9, 90, 90, 1, true],
    [1.2, 1, 120, 100, 1, true],
    // Shown as 71% and 71%: reached, though the stored ratios differ.
    [0.708333, 0.71, 71, 71, 1, true],
    [0.704, 0.71, 70, 71, 70 / 71, false],
  ])(
    '%f towards %f is %i%% of %i%%',
    (speed, target, speedPercent, targetPercent, fraction, reached) => {
      expect(targetProgress(speed, target)).toEqual({
        speedPercent,
        targetPercent,
        fraction,
        reached,
      });
    },
  );
});
