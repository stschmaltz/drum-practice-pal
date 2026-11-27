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
  it.each([
    [0.5, 50, 0.5, false],
    [1, 100, 1, true],
    [1.2, 120, 1, true],
    [0.25, 25, 0.25, false],
    // 99.5% shows as 100%, so it has reached full speed.
    [0.995, 100, 1, true],
    [0.704, 70, 0.7, false],
  ])('%f is %i%% of full speed', (speed, speedPercent, fraction, reached) => {
    expect(targetProgress(speed)).toEqual({ speedPercent, targetPercent: 100, fraction, reached });
  });
});
