// @vitest-environment node
/**
 * parseScore against the committed fixtures and, when present, the local real
 * Songsterr exports (tests/fixtures/real/ is gitignored and may be empty).
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fixtures } from '../../../tests/fixtures/sources';
import { drumTrackIndex, loadScoreFile, tempoAtBar } from '../../../tests/unit/score-helpers';
import { guitarProImporters, loadGuitarPro, parseScore } from './parseScore';
import { checkSongFile } from './songFile';

const fixturesDir = join(process.cwd(), 'tests', 'fixtures');
const read = (path: string) => new Uint8Array(readFileSync(path));

describe.each(fixtures)('fixture $name', ({ name, expected }) => {
  it('gives the metadata recorded in sources.ts', () => {
    expect(parseScore(read(join(fixturesDir, 'gp', `${name}.gp`)), `${name}.gp`)).toEqual({
      ok: true,
      metadata: {
        title: expected.title,
        artist: 'Fixture',
        originalTempo: expected.tempoAtBar1,
        barCount: expected.barCount,
        drumTrackIndex: expected.drumTrackIndex,
      },
    });
  });
});

describe('guitarProImporters', () => {
  // Fails loudly if an alphaTab upgrade renames or drops an importer.
  it('keeps exactly the Guitar Pro importers', () => {
    expect(guitarProImporters().map((importer) => importer.name)).toEqual([
      'Guitar Pro 3-5',
      'Guitar Pro 6',
      'Guitar Pro 7-8',
    ]);
  });
});

describe('loadGuitarPro', () => {
  it('reads a Guitar Pro file into a score', () => {
    const score = loadGuitarPro(read(join(fixturesDir, 'gp', 'groove-120.gp')));
    expect(score?.masterBars).toHaveLength(16);
  });

  // The player hands its result to alphaTab, so junk must come back null, not a one-bar score.
  it('gives null for junk', () => {
    const junk = new Uint8Array(4096).map((_, i) => (i * 7919) % 256);
    expect(loadGuitarPro(junk)).toBeNull();
  });
});

describe('bad bytes', () => {
  it('refuses a truncated Guitar Pro file', () => {
    const bytes = read(join(fixturesDir, 'gp', 'groove-120.gp'));
    expect(parseScore(bytes.subarray(0, 200), 'cut.gp').ok).toBe(false);
  });

  // ScoreLoader would hand these to its alphaTex importer and get a one-bar score.
  it('refuses junk', () => {
    const junk = new Uint8Array(4096).map((_, i) => (i * 7919) % 256);
    expect(parseScore(junk, 'garbage.gp')).toEqual({ ok: false, reason: 'parse-error' });
  });

  it('refuses junk behind a zip header, as a damaged .gp would look', () => {
    const junk = new Uint8Array(4096).map((_, i) => (i * 7919) % 256);
    junk.set([0x50, 0x4b, 0x03, 0x04]);
    expect(parseScore(junk, 'damaged.gp')).toEqual({ ok: false, reason: 'parse-error' });
  });

  it('refuses junk behind a GP5 version string', () => {
    const version = 'FICHIER GUITAR PRO v5.00';
    const bytes = new Uint8Array(4096).map((_, i) => (i * 7919) % 256);
    bytes.set([version.length, ...Array.from(version, (c) => c.charCodeAt(0))]);
    expect(parseScore(bytes, 'damaged.gp5')).toEqual({ ok: false, reason: 'parse-error' });
  });
});

const realDir = join(fixturesDir, 'real');
const realFiles = existsSync(realDir)
  ? readdirSync(realDir).filter((file) => /\.(gp|gpx|gp3|gp4|gp5)$/i.test(file))
  : [];

if (realFiles.length === 0) {
  it.skip('no real exports in tests/fixtures/real (local only)', () => {});
}

describe.each(realFiles)('real export %s', (file) => {
  it('passes the file check and matches the score helpers', () => {
    const bytes = read(join(realDir, file));
    expect(checkSongFile(file, bytes).ok).toBe(true);
    const score = loadScoreFile(join(realDir, file));
    const result = parseScore(bytes, file);
    expect(result).toMatchObject({
      ok: true,
      metadata: {
        originalTempo: tempoAtBar(score, 1),
        barCount: score.masterBars.length,
        drumTrackIndex: drumTrackIndex(score),
      },
    });
    expect(result.ok && result.metadata.title).not.toBe('');
  });
});

const realMidi = existsSync(realDir)
  ? readdirSync(realDir).filter((file) => /\.midi?$/i.test(file))
  : [];

describe.each(realMidi)('real MIDI %s', (file) => {
  it('is refused as MIDI', () => {
    expect(checkSongFile(file, read(join(realDir, file)))).toEqual({ ok: false, problem: 'midi' });
  });
});
