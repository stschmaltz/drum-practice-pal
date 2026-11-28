/**
 * Search and sort for the library list. Pure, so node tests cover them; the
 * page keeps the query and sort in the URL.
 */
import type { LibrarySong, Song } from './songForm';

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

/**
 * Songs whose title or artist contains every word of the query, plus any
 * whose id is in `keep` whether or not they match.
 */
export function searchSongs<T extends Pick<Song, 'id' | 'title' | 'artist'>>(
  songs: readonly T[],
  query: string,
  keep: ReadonlySet<string> = new Set(),
): T[] {
  const words = searchable(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...songs];
  return songs.filter((song) => {
    if (keep.has(song.id)) return true;
    const haystack = searchable(`${song.title} ${song.artist}`);
    return words.every((word) => haystack.includes(word));
  });
}

const time = (timestamp: string | null | undefined) =>
  timestamp ? Date.parse(timestamp) : -Infinity;

/** When the song was last worked on: a loop practised, or a recording opened (Unit 14), whichever is later. */
const lastActive = (song: Pick<LibrarySong, 'last_practiced_at' | 'last_played_at'>) =>
  Math.max(time(song.last_practiced_at), time(song.last_played_at));

/**
 * "practiced": most recently practiced or played along to first, songs with
 * neither after, newest upload first among those. "added": newest upload first.
 */
export function sortSongs<
  T extends Pick<LibrarySong, 'created_at' | 'last_practiced_at' | 'last_played_at' | 'id'>,
>(songs: readonly T[], sort: LibrarySort): T[] {
  return [...songs].sort((a, b) => {
    if (sort === 'practiced') {
      const byPractice = lastActive(b) - lastActive(a);
      // NaN when neither was practiced (-Infinity minus -Infinity): fall through.
      if (byPractice !== 0 && !Number.isNaN(byPractice)) return byPractice;
    }
    const byAdded = time(b.created_at) - time(a.created_at);
    if (byAdded !== 0) return byAdded;
    // Same timestamp: keep a stable order across refetches.
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}
