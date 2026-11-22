// @vitest-environment node
/**
 * Loads real Songsterr exports from tests/fixtures/real/ when they exist.
 * That folder is gitignored, so in CI and on fresh clones this suite skips.
 */
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { drumTrackIndex, loadScoreFile, tempoAtBar } from './score-helpers';

const realDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'real');
const GUITAR_PRO = /\.(gp|gpx|gp3|gp4|gp5)$/i;

const files = existsSync(realDir) ? readdirSync(realDir).filter((f) => GUITAR_PRO.test(f)) : [];

interface KnownExport {
  match: RegExp;
  barCount: number;
  trackCount: number;
  drumTrackIndex: number;
  /** 1-based bar number -> tempo that bar starts at */
  tempos: Record<number, number>;
}

/** Values checked by hand in docs/units/00-scaffold.md. */
const known: KnownExport[] = [
  {
    match: /Little Sister/i,
    barCount: 119,
    trackCount: 6,
    drumTrackIndex: 5,
    tempos: { 1: 155, 10: 155, 11: 163 },
  },
];

// Vitest fails a file that registers no tests, so an empty folder gets an
// explicit skipped placeholder instead of an empty describe.each.
if (files.length === 0) {
  it.skip('no real exports in tests/fixtures/real (local only)', () => {});
}

describe.each(files)('real export %s', (file) => {
  const score = loadScoreFile(join(realDir, file));

  it('parses with a title, bars and a percussion track', () => {
    expect(score.title.trim()).not.toBe('');
    expect(score.masterBars.length).toBeGreaterThan(0);
    expect(drumTrackIndex(score)).not.toBeNull();
  });

  const expected = known.find((k) => k.match.test(file));
  it.skipIf(!expected)('matches the recorded metadata', () => {
    expect(score.masterBars).toHaveLength(expected!.barCount);
    expect(score.tracks).toHaveLength(expected!.trackCount);
    expect(drumTrackIndex(score)).toBe(expected!.drumTrackIndex);
    for (const [bar, tempo] of Object.entries(expected!.tempos)) {
      expect(tempoAtBar(score, Number(bar))).toBe(tempo);
    }
  });
});
