// @vitest-environment node
/**
 * Proves the fixture pipeline: every generated .gp file exists and loads back
 * through alphaTab's importer with the metadata recorded in sources.ts.
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fixtures } from '../fixtures/sources';
import { drumTrackIndex, loadScoreFile, tempoAtBar } from './score-helpers';

const gpDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'gp');

describe.each(fixtures)('fixture $name', ({ name, expected }) => {
  const score = loadScoreFile(join(gpDir, `${name}.gp`));

  it('keeps title, bar count and tracks', () => {
    expect(score.title).toBe(expected.title);
    expect(score.masterBars).toHaveLength(expected.barCount);
    expect(score.tracks).toHaveLength(expected.trackCount);
  });

  it('keeps the time signature', () => {
    const first = score.masterBars[0]!;
    expect([first.timeSignatureNumerator, first.timeSignatureDenominator]).toEqual(
      expected.timeSignature,
    );
  });

  it('keeps tempo at bar 1 and any tempo changes', () => {
    expect(tempoAtBar(score, 1)).toBe(expected.tempoAtBar1);
    for (const [bar, tempo] of Object.entries(expected.tempoChanges ?? {})) {
      expect(tempoAtBar(score, Number(bar))).toBe(tempo);
    }
  });

  it('marks the drum track as percussion', () => {
    expect(drumTrackIndex(score)).toBe(expected.drumTrackIndex);
  });
});
