import { SONG_TEXT_MAX_LENGTH } from '@/lib/schema';
import {
  LIBRARY_SELECT,
  SONG_FIELDS,
  SONG_SELECT,
  changedSongFields,
  normaliseSongEdit,
  revertSongEdit,
  songFactsLabel,
  toLibrarySong,
  validateSongEdit,
  type Song,
} from './songForm';

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

describe('revertSongEdit', () => {
  const before = { title: 'Old', artist: 'Band' };

  it('restores each changed field that still holds the optimistic value', () => {
    const current = { id: 'a', title: 'New', artist: 'Other' };
    expect(revertSongEdit(current, before, { title: 'New', artist: 'Other' })).toEqual({
      id: 'a',
      title: 'Old',
      artist: 'Band',
    });
  });

  it('leaves fields the edit did not send, and ones changed since, alone', () => {
    const current = { id: 'a', title: 'Newer', artist: 'Someone' };
    expect(revertSongEdit(current, before, { title: 'New' })).toEqual(current);
  });

  it('restores an empty artist', () => {
    const current = { id: 'a', title: 'Old', artist: '' };
    expect(revertSongEdit(current, before, { artist: '' })).toEqual({ ...current, artist: 'Band' });
  });
});

it.each([
  [120, '16 bars · 120 BPM'],
  [92.5, '16 bars · 92.5 BPM'],
])('songFactsLabel at %d BPM', (original_tempo, label) => {
  expect(songFactsLabel({ bar_count: 16, original_tempo })).toBe(label);
});
