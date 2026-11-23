import { SONG_TEXT_MAX_LENGTH } from '@/lib/schema';
import {
  cleanSongText,
  drumTrackIndexOf,
  extractSongMetadata,
  tempoAtFirstBar,
  type ScoreLike,
} from './songMetadata';

const bar = (tempo?: number) => ({
  tempoAutomations: tempo === undefined ? [] : [{ value: tempo }],
});
const drums = { staves: [{ isPercussion: true }] };
const guitar = { staves: [{ isPercussion: false }] };

const score = (overrides: Partial<ScoreLike> = {}): ScoreLike => ({
  title: 'Song',
  artist: 'Band',
  tempo: 120,
  masterBars: [bar(), bar(), bar()],
  tracks: [guitar, drums],
  ...overrides,
});

describe('extractSongMetadata', () => {
  it('reads title, artist, tempo, bars and the drum track', () => {
    expect(extractSongMetadata(score(), 'file.gp')).toEqual({
      ok: true,
      metadata: {
        title: 'Song',
        artist: 'Band',
        originalTempo: 120,
        barCount: 3,
        drumTrackIndex: 1,
      },
    });
  });

  it('gives null for a score with no percussion track', () => {
    const result = extractSongMetadata(score({ tracks: [guitar, guitar] }), 'file.gp');
    expect(result.ok && result.metadata.drumTrackIndex).toBeNull();
  });

  it('falls back to the file name, then "Untitled", for a blank title', () => {
    const fromName = extractSongMetadata(score({ title: '  ' }), 'My Tab.gp');
    expect(fromName.ok && fromName.metadata.title).toBe('My Tab');
    const untitled = extractSongMetadata(score({ title: '' }), '.gp5');
    expect(untitled.ok && untitled.metadata.title).toBe('.gp5');
    const nothing = extractSongMetadata(score({ title: '' }), '   ');
    expect(nothing.ok && nothing.metadata.title).toBe('Untitled');
  });

  it('refuses an empty score, which is what alphaTab makes of junk bytes', () => {
    expect(extractSongMetadata(score({ masterBars: [] }), 'x.gp')).toEqual({
      ok: false,
      reason: 'no-bars',
    });
    expect(extractSongMetadata(score({ tracks: [] }), 'x.gp')).toEqual({
      ok: false,
      reason: 'no-tracks',
    });
  });

  it.each([0, -10, 1001, Number.NaN, Number.POSITIVE_INFINITY])(
    'refuses a tempo of %s, which the DB would reject',
    (tempo) => {
      expect(extractSongMetadata(score({ tempo }), 'x.gp')).toEqual({
        ok: false,
        reason: 'bad-tempo',
      });
    },
  );

  it('accepts the tempo limits', () => {
    expect(extractSongMetadata(score({ tempo: 1000 }), 'x.gp').ok).toBe(true);
    expect(extractSongMetadata(score({ tempo: 0.5 }), 'x.gp').ok).toBe(true);
  });
});

describe('tempoAtFirstBar', () => {
  it('uses the score tempo without an automation on bar 1', () => {
    expect(tempoAtFirstBar(score({ masterBars: [bar(), bar(90)] }))).toBe(120);
  });

  it('prefers an automation on bar 1', () => {
    expect(tempoAtFirstBar(score({ masterBars: [bar(155), bar(163)] }))).toBe(155);
  });
});

describe('drumTrackIndexOf', () => {
  it('finds the first track with any percussion staff', () => {
    const twoStaves = { staves: [{ isPercussion: false }, { isPercussion: true }] };
    expect(drumTrackIndexOf(score({ tracks: [guitar, twoStaves, drums] }))).toBe(1);
  });
});

describe('cleanSongText', () => {
  it('trims and collapses whitespace', () => {
    expect(cleanSongText('  Little \n\t Sister  ')).toBe('Little Sister');
  });

  it('cuts to the DB limit by code point, keeping emoji whole', () => {
    const long = '🥁'.repeat(SONG_TEXT_MAX_LENGTH + 5);
    const cleaned = cleanSongText(long);
    expect(Array.from(cleaned)).toHaveLength(SONG_TEXT_MAX_LENGTH);
    expect(cleaned).toBe('🥁'.repeat(SONG_TEXT_MAX_LENGTH));
  });
});
