// @vitest-environment node
/**
 * barStartTempos over real alphaTab scores: the generated fixtures, so the
 * player's BPM readout agrees with what sources.ts says each file contains.
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { barStartTempos, bpmAtSpeed, tempoAtBar } from '../../src/features/player/tempo';
import { fixtures } from '../fixtures/sources';
import { loadScoreFile } from './score-helpers';

const gpDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'gp');

describe.each(fixtures)('tempos of fixture $name', ({ name, expected }) => {
  const tempos = barStartTempos(loadScoreFile(join(gpDir, `${name}.gp`)));

  it('has one tempo per bar, starting at the bar 1 tempo', () => {
    expect(tempos).toHaveLength(expected.barCount);
    expect(tempoAtBar(tempos, 1)).toBe(expected.tempoAtBar1);
  });

  it('changes tempo exactly where the source says', () => {
    const changes = expected.tempoChanges ?? {};
    let tempo = expected.tempoAtBar1;
    for (let barNumber = 1; barNumber <= expected.barCount; barNumber++) {
      tempo = changes[barNumber] ?? tempo;
      expect(tempoAtBar(tempos, barNumber), `bar ${barNumber}`).toBe(tempo);
    }
  });
});

describe('the tempo-change fixture (120 to 90 at bar 9)', () => {
  const tempos = barStartTempos(loadScoreFile(join(gpDir, 'tempo-change.gp')));

  it('reads 120 through bar 8 and 90 from bar 9', () => {
    expect(tempoAtBar(tempos, 8)).toBe(120);
    expect(tempoAtBar(tempos, 9)).toBe(90);
    expect(tempoAtBar(tempos, 16)).toBe(90);
  });

  it('gives the BPM heard at a speed from the bar playing', () => {
    expect(bpmAtSpeed(tempoAtBar(tempos, 8)!, 0.75)).toBe(90);
    expect(bpmAtSpeed(tempoAtBar(tempos, 9)!, 0.75)).toBe(68);
  });
});
