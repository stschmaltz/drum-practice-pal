import { SONG_TEXT_MAX_LENGTH } from '@/lib/schema';
import {
  LIBRARY_SELECT,
  SONG_FIELDS,
  SONG_SELECT,
  changedSongFields,
  isLibrarySort,
  normaliseSongEdit,
  searchSongs,
  sortSongs,
  toLibrarySong,
  validateSongEdit,
  type LibrarySong,
  type Song,
} from './songForm';

const song = (overrides: Partial<LibrarySong> = {}): LibrarySong => ({
  id: 'song-1',
  title: 'Little Sister',
  artist: 'Queens of the Stone Age',
  original_tempo: 155,
  bar_count: 119,
  drum_track_index: 5,
  created_at: '2026-11-01T10:00:00Z',
  last_practiced_at: null,
  ...overrides,
});

describe('select strings', () => {
  it('SONG_SELECT names exactly SONG_FIELDS', () => {
    expect(SONG_SELECT.split(', ')).toEqual([...SONG_FIELDS]);
  });

  it('LIBRARY_SELECT adds the loops embed', () => {
    expect(LIBRARY_SELECT).toBe(`${SONG_SELECT}, loops(last_practiced_at)`);
  });
});

describe('toLibrarySong', () => {
  const base: Song = {
    id: 'song-1',
    title: 'Little Sister',
    artist: 'Queens of the Stone Age',
    original_tempo: 155,
    bar_count: 119,
    drum_track_index: 5,
    created_at: '2026-11-01T10:00:00Z',
  };

  it('takes the newest practice time across loops', () => {
    const row = {
      ...base,
      loops: [
        { last_practiced_at: '2026-11-03T10:00:00Z' },
        { last_practiced_at: null },
        { last_practiced_at: '2026-11-05T09:00:00+00:00' },
      ],
    };
    expect(toLibrarySong(row)).toEqual({ ...base, last_practiced_at: '2026-11-05T09:00:00+00:00' });
  });

  it('gives null with no loops or none practiced', () => {
    expect(toLibrarySong({ ...base, loops: [] }).last_practiced_at).toBeNull();
    expect(
      toLibrarySong({ ...base, loops: [{ last_practiced_at: null }] }).last_practiced_at,
    ).toBeNull();
  });

  it('drops the loops array', () => {
    expect(toLibrarySong({ ...base, loops: [] })).not.toHaveProperty('loops');
  });
});

describe('editing', () => {
  it('trims before validating', () => {
    expect(normaliseSongEdit({ title: '  Song ', artist: ' Band  ' })).toEqual({
      title: 'Song',
      artist: 'Band',
    });
  });

  it('needs a title; artist may be empty', () => {
    expect(validateSongEdit({ title: '', artist: '' })).toEqual({
      title: 'Give the song a title.',
    });
    expect(validateSongEdit({ title: 'x', artist: '' })).toEqual({});
  });

  it('enforces the DB length limit by code point', () => {
    const max = '🥁'.repeat(SONG_TEXT_MAX_LENGTH);
    expect(validateSongEdit({ title: max, artist: max })).toEqual({});
    const over = `${max}x`;
    const errors = validateSongEdit({ title: over, artist: over });
    expect(errors.title).toMatch(String(SONG_TEXT_MAX_LENGTH));
    expect(errors.artist).toMatch(String(SONG_TEXT_MAX_LENGTH));
  });

  it('sends only changed fields', () => {
    const saved = { title: 'A', artist: 'B' };
    expect(changedSongFields(saved, saved)).toEqual({});
    expect(changedSongFields(saved, { title: 'C', artist: 'B' })).toEqual({ title: 'C' });
    expect(changedSongFields(saved, { title: 'A', artist: '' })).toEqual({ artist: '' });
  });
});

describe('searchSongs', () => {
  const songs = [
    song({ id: '1', title: 'Little Sister', artist: 'Queens of the Stone Age' }),
    song({ id: '2', title: 'Halo', artist: 'Beyoncé' }),
    song({ id: '3', title: 'Sister Christian', artist: 'Night Ranger' }),
  ];
  const ids = (query: string) => searchSongs(songs, query).map((s) => s.id);

  it('returns everything for a blank query', () => {
    expect(ids('')).toEqual(['1', '2', '3']);
    expect(ids('   ')).toEqual(['1', '2', '3']);
  });

  it('matches title or artist, ignoring case and accents', () => {
    expect(ids('sister')).toEqual(['1', '3']);
    expect(ids('QUEENS')).toEqual(['1']);
    expect(ids('beyonce')).toEqual(['2']);
    expect(ids('Beyoncé')).toEqual(['2']);
  });

  it('needs every word, across title and artist', () => {
    expect(ids('sister queens')).toEqual(['1']);
    expect(ids('sister ranger')).toEqual(['3']);
    expect(ids('sister halo')).toEqual([]);
  });
});

describe('sortSongs', () => {
  const never1 = song({ id: 'a', created_at: '2026-11-10T00:00:00Z', last_practiced_at: null });
  const never2 = song({ id: 'b', created_at: '2026-11-12T00:00:00Z', last_practiced_at: null });
  const old = song({
    id: 'c',
    created_at: '2026-10-01T00:00:00Z',
    last_practiced_at: '2026-11-20T00:00:00Z',
  });
  const recent = song({
    id: 'd',
    created_at: '2026-09-01T00:00:00Z',
    last_practiced_at: '2026-11-21T00:00:00Z',
  });
  const all = [never1, old, never2, recent];
  const ids = (sort: 'practiced' | 'added') => sortSongs(all, sort).map((s) => s.id);

  it('practiced: latest practice first, then never-practiced by newest upload', () => {
    expect(ids('practiced')).toEqual(['d', 'c', 'b', 'a']);
  });

  it('added: newest upload first', () => {
    expect(ids('added')).toEqual(['b', 'a', 'c', 'd']);
  });

  it('breaks ties by id and leaves the input alone', () => {
    const twinA = song({ id: 'x2' });
    const twinB = song({ id: 'x1' });
    const input = [twinA, twinB];
    expect(sortSongs(input, 'added').map((s) => s.id)).toEqual(['x1', 'x2']);
    expect(input.map((s) => s.id)).toEqual(['x2', 'x1']);
  });
});

describe('isLibrarySort', () => {
  it.each(['practiced', 'added'])('accepts %s', (value) => {
    expect(isLibrarySort(value)).toBe(true);
  });

  it.each([null, '', 'title', 'ADDED'])('rejects %j', (value) => {
    expect(isLibrarySort(value)).toBe(false);
  });
});
