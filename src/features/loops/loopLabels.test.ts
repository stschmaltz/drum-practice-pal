import { speedLabel, statusRefusalCopy } from './loopLabels';

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

describe('statusRefusalCopy', () => {
  it('says which change the server refused', () => {
    expect(statusRefusalCopy('finished')).toBe("Couldn't mark the loop finished.");
    expect(statusRefusalCopy('active')).toBe("Couldn't reopen the loop.");
  });
});
