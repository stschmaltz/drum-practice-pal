/**
 * The songs columns the library reads and edits, plus pure validation, search
 * and sort. No client import, so songsApi.ts, the page and node tests share it.
 */
import type { Database } from '@/lib/database.types';
import { SONG_TEXT_MAX_LENGTH } from '@/lib/schema';

type SongRow = Database['public']['Tables']['songs']['Row'];

export const SONG_FIELDS = [
  'id',
  'title',
  'artist',
  'original_tempo',
  'bar_count',
  'drum_track_index',
  'created_at',
] as const satisfies readonly (keyof SongRow)[];

/** Literals, so supabase-js can type the selected row. Tested against SONG_FIELDS. */
export const SONG_SELECT =
  'id, title, artist, original_tempo, bar_count, drum_track_index, created_at';
// The newest last_practiced_at per song is enough for sorting; see fetchSongs.
export const LIBRARY_SELECT = `${SONG_SELECT}, loops(last_practiced_at)` as const;

export type SongField = (typeof SONG_FIELDS)[number];
export type Song = Pick<SongRow, SongField>;

/** A library entry: the song plus when any of its loops was last practiced. */
export interface LibrarySong extends Song {
  last_practiced_at: string | null;
}

export function toLibrarySong(
  row: Song & { loops: readonly { last_practiced_at: string | null }[] },
): LibrarySong {
  const { loops, ...song } = row;
  return { ...song, last_practiced_at: latest(loops.map((loop) => loop.last_practiced_at)) };
}

function latest(timestamps: readonly (string | null)[]): string | null {
  let newest: string | null = null;
  for (const timestamp of timestamps) {
    if (timestamp && (newest === null || Date.parse(timestamp) > Date.parse(newest))) {
      newest = timestamp;
    }
  }
  return newest;
}

// Editing ---------------------------------------------------------------------

export type SongEdit = Pick<Song, 'title' | 'artist'>;
export type SongEditErrors = Partial<Record<keyof SongEdit, string>>;

const codePoints = (text: string) => Array.from(text).length;

export function normaliseSongEdit(edit: SongEdit): SongEdit {
  return { title: edit.title.trim(), artist: edit.artist.trim() };
}

/** Expects normalised input (see normaliseSongEdit). */
export function validateSongEdit(edit: SongEdit): SongEditErrors {
  const errors: SongEditErrors = {};
  if (edit.title === '') errors.title = 'Give the song a title.';
  else if (codePoints(edit.title) > SONG_TEXT_MAX_LENGTH) {
    errors.title = `Keep the title to ${SONG_TEXT_MAX_LENGTH} characters or fewer.`;
  }
  if (codePoints(edit.artist) > SONG_TEXT_MAX_LENGTH) {
    errors.artist = `Keep the artist to ${SONG_TEXT_MAX_LENGTH} characters or fewer.`;
  }
  return errors;
}

/** Only the fields that differ, so a save never rewrites what another device just changed. */
export function changedSongFields(saved: SongEdit, draft: SongEdit): Partial<SongEdit> {
  const changes: Partial<SongEdit> = {};
  if (draft.title !== saved.title) changes.title = draft.title;
  if (draft.artist !== saved.artist) changes.artist = draft.artist;
  return changes;
}

// Search and sort -------------------------------------------------------------

export const LIBRARY_SORTS = ['practiced', 'added'] as const;
export type LibrarySort = (typeof LIBRARY_SORTS)[number];

export function isLibrarySort(value: string | null): value is LibrarySort {
  return (LIBRARY_SORTS as readonly (string | null)[]).includes(value);
}

/** Case- and accent-insensitive, so "beyonce" finds "Beyoncé". */
function searchable(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase();
}

/** Songs whose title or artist contains every word of the query. */
export function searchSongs<T extends Pick<Song, 'title' | 'artist'>>(
  songs: readonly T[],
  query: string,
): T[] {
  const words = searchable(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...songs];
  return songs.filter((song) => {
    const haystack = searchable(`${song.title} ${song.artist}`);
    return words.every((word) => haystack.includes(word));
  });
}

const time = (timestamp: string | null) => (timestamp ? Date.parse(timestamp) : -Infinity);

/**
 * "practiced": most recently practiced first, never-practiced songs after,
 * newest upload first among those. "added": newest upload first.
 */
export function sortSongs<T extends Pick<LibrarySong, 'created_at' | 'last_practiced_at' | 'id'>>(
  songs: readonly T[],
  sort: LibrarySort,
): T[] {
  return [...songs].sort((a, b) => {
    if (sort === 'practiced') {
      const byPractice = time(b.last_practiced_at) - time(a.last_practiced_at);
      if (byPractice !== 0 && !Number.isNaN(byPractice)) return byPractice;
    }
    const byAdded = time(b.created_at) - time(a.created_at);
    if (byAdded !== 0) return byAdded;
    // Same timestamp: keep a stable order across refetches.
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}
