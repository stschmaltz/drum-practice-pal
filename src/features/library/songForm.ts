/**
 * The songs columns the library reads and edits, plus pure edit validation.
 * No client import, so songsApi.ts, the page and node tests share it. Search
 * and sort live in songList.ts.
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

/**
 * Undoes a failed optimistic edit on the current cached song: each changed
 * field goes back to its value before the edit, but only while it still holds
 * the optimistic value, so a newer edit or refetch of that field survives.
 */
export function revertSongEdit<T extends SongEdit>(
  current: T,
  before: SongEdit,
  changes: Partial<SongEdit>,
): T {
  const reverted = { ...current };
  for (const field of ['title', 'artist'] as const) {
    const sent = changes[field];
    if (sent !== undefined && current[field] === sent) reverted[field] = before[field];
  }
  return reverted;
}
