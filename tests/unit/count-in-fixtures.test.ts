// @vitest-environment node
/**
 * The count-in over real alphaTab scores: each generated fixture's meter and
 * tempo, so the clicks agree with what sources.ts says the file contains.
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { barMeters, countInSchedule, meterAtBar } from '../../src/features/player/countIn';
import { barStartTempos, tempoAtBar } from '../../src/features/player/tempo';
import { fixtures } from '../fixtures/sources';
import { loadScoreFile } from './score-helpers';

const gpDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'gp');

describe.each(fixtures)('count-in for fixture $name', ({ name, expected }) => {
  const score = loadScoreFile(join(gpDir, `${name}.gp`));
  const meters = barMeters(score);
  const [beats, beatValue] = expected.timeSignature;

  it('reads the meter of every bar', () => {
    expect(meters).toHaveLength(expected.barCount);
    for (const meter of meters) expect(meter).toEqual({ beats, beatValue });
  });

  it('clicks one bar of that meter at the bar 1 tempo', () => {
    const meter = meterAtBar(meters, 1);
    if (!meter) throw new Error('No meter for bar 1');
    const schedule = countInSchedule({
      bars: 1,
      meter,
      tempo: expected.tempoAtBar1,
      speedRatio: 1,
      startTime: 0,
    });
    expect(schedule?.clicks).toHaveLength(beats);
    expect(schedule?.downbeat).toBeCloseTo((beats * 60 * (4 / beatValue)) / expected.tempoAtBar1);
  });
});

describe('the tempo-change fixture (120 to 90 at bar 9)', () => {
  const score = loadScoreFile(join(gpDir, 'tempo-change.gp'));
  const tempos = barStartTempos(score);
  const meters = barMeters(score);

  const oneBarFrom = (barNumber: number, speedRatio: number) => {
    const meter = meterAtBar(meters, barNumber);
    const tempo = tempoAtBar(tempos, barNumber);
    if (!meter || tempo === null) throw new Error(`No bar ${barNumber}`);
    return countInSchedule({ bars: 1, meter, tempo, speedRatio, startTime: 0 });
  };

  it('counts a loop starting before the change at 120 and one after it at 90', () => {
    expect(oneBarFrom(8, 1)?.beatSeconds).toBeCloseTo(0.5);
    expect(oneBarFrom(9, 1)?.beatSeconds).toBeCloseTo(60 / 90);
  });

  it('applies the speed on top of the bar tempo', () => {
    // 90 BPM at 75% is 67.5 BPM.
    expect(oneBarFrom(9, 0.75)?.beatSeconds).toBeCloseTo(60 / 67.5);
  });
});
