/**
 * Supabase calls for songs and their files. Plain async functions that throw
 * on error; the hooks in useSongs.ts are the only callers.
 */
import { fetchAllPages } from '@/lib/fetchAllPages';
import { randomUuid } from '@/lib/randomUuid';
import { GP_FILES_BUCKET, songFilePath } from '@/lib/schema';
import { sha256Hex } from '@/lib/sha256';
import { supabase } from '@/lib/supabase';
import { throwIfError, unwrap } from '@/lib/supabaseResult';
import { checkSongFile, SONG_FILE_MESSAGES } from './songFile';
import {
  LIBRARY_SELECT,
  SONG_SELECT,
  toLibrarySong,
  type LibrarySong,
  type Song,
  type SongEdit,
} from './songForm';
import type { SongMetadata } from './songMetadata';

/** Postgres unique_violation: here, songs_user_file_hash_key. */
const UNIQUE_VIOLATION = '23505';

export async function fetchSongs(userId: string): Promise<LibrarySong[]> {
  const rows = await fetchAllPages(async (from, to) =>
    unwrap(
      await supabase
        .from('songs')
        .select(LIBRARY_SELECT)
        .eq('user_id', userId)
        // Only the latest practice matters for sorting, so embed one loop per song.
        .order('last_practiced_at', {
          referencedTable: 'loops',
          ascending: false,
          nullsFirst: false,
        })
        .limit(1, { referencedTable: 'loops' })
        // A total order, so pages don't overlap or skip rows.
        .order('created_at', { ascending: false })
        .order('id')
        .range(from, to),
      'songs',
    ),
  );
  return rows.map(toLibrarySong);
}

export async function findSongByHash(userId: string, fileHash: string): Promise<Song | null> {
  const result = await supabase
    .from('songs')
    .select(SONG_SELECT)
    .eq('user_id', userId)
    .eq('file_hash', fileHash)
    .maybeSingle();
  throwIfError(result);
  return result.data;
}

/** A file the app refuses, with copy fit to show as is. */
export class SongFileError extends Error {
  override name = 'SongFileError';
}

export type UploadStep = 'reading' | 'checking' | 'uploading' | 'saving';

export type UploadResult =
  { kind: 'uploaded'; song: LibrarySong } | { kind: 'duplicate'; song: Song };

export interface UploadOptions {
  /** Aborting stops before the next step and removes a file already sent. */
  signal?: AbortSignal;
  onStep?: (step: UploadStep) => void;
}

/**
 * Checks, parses and hashes the file in the browser, then uploads it and
 * inserts its row. Nothing is created for a refused file, a duplicate or a
 * cancel, and a failed insert removes the uploaded file again.
 */
export async function uploadSong(
  userId: string,
  file: File,
  { signal, onStep }: UploadOptions = {},
): Promise<UploadResult> {
  onStep?.('reading');
  const { bytes, metadata } = await readSongFile(file);

  onStep?.('checking');
  const fileHash = await sha256Hex(bytes);
  const existing = await findSongByHash(userId, fileHash);
  if (existing) return { kind: 'duplicate', song: existing };
  signal?.throwIfAborted();

  onStep?.('uploading');
  const songId = randomUuid();
  const filePath = songFilePath(userId, songId);
  throwIfError(
    await supabase.storage
      .from(GP_FILES_BUCKET)
      .upload(filePath, bytes, { contentType: 'application/octet-stream', upsert: false }),
  );
  // The upload can't be aborted mid-request, so a cancel during it lands here.
  if (signal?.aborted) await removeUploadedFile(filePath, signal.reason);
  signal?.throwIfAborted();

  // Past this point a cancel is ignored: aborting the insert could leave a
  // committed row whose file we'd then delete.
  onStep?.('saving');
  const inserted = await supabase
    .from('songs')
    .insert({
      id: songId,
      user_id: userId,
      title: metadata.title,
      artist: metadata.artist,
      file_path: filePath,
      file_hash: fileHash,
      original_tempo: metadata.originalTempo,
      bar_count: metadata.barCount,
      drum_track_index: metadata.drumTrackIndex,
    })
    .select(SONG_SELECT)
    .single();

  if (inserted.error) {
    await removeUploadedFile(filePath, inserted.error);
    // Another tab or device added the same file since the check above.
    if (inserted.error.code === UNIQUE_VIOLATION) {
      const winner = await findSongByHash(userId, fileHash);
      if (winner) return { kind: 'duplicate', song: winner };
    }
    throw inserted.error;
  }
  const song = unwrap(inserted, 'song');
  return { kind: 'uploaded', song: { ...song, last_practiced_at: null } };
}

/** The file's bytes and score metadata, or a SongFileError for a file the app refuses. */
async function readSongFile(file: File): Promise<{ bytes: Uint8Array; metadata: SongMetadata }> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const check = checkSongFile(file.name, bytes);
  if (!check.ok) throw new SongFileError(SONG_FILE_MESSAGES[check.problem]);

  // Lazy, so alphaTab isn't in the main bundle.
  const { parseScore } = await import('./parseScore');
  const parsed = parseScore(bytes, file.name);
  if (!parsed.ok) throw new SongFileError(SONG_FILE_MESSAGES.unreadable);
  return { bytes, metadata: parsed.metadata };
}

/** Rollback for a file whose row won't exist. Throws if the file stays behind. */
async function removeUploadedFile(filePath: string, cause: unknown): Promise<void> {
  const removed = await supabase.storage.from(GP_FILES_BUCKET).remove([filePath]);
  if (removed.error) {
    throw new Error(
      `${messageOf(cause)} The uploaded file couldn't be removed either: ${removed.error.message}`,
      { cause },
    );
  }
}

/** supabase-js errors aren't always Error instances, but all carry a message. */
function messageOf(cause: unknown): string {
  return typeof cause === 'object' && cause !== null && 'message' in cause
    ? String(cause.message)
    : String(cause);
}

/** Returns the saved row, so the cache holds what the DB actually stored. */
export async function updateSong(
  userId: string,
  songId: string,
  changes: Partial<SongEdit>,
): Promise<Song> {
  return unwrap(
    await supabase
      .from('songs')
      .update(changes)
      .eq('id', songId)
      .eq('user_id', userId)
      .select(SONG_SELECT)
      .single(),
    'song',
  );
}

/**
 * Removes the file, then the row (loops and sessions cascade). File first: if
 * the second step fails the song is still listed, so the error shows and
 * Delete can be tried again, and removing a file that's already gone succeeds.
 * Row first would leave an orphan file nothing can reach.
 */
export async function deleteSong(userId: string, songId: string): Promise<void> {
  throwIfError(await supabase.storage.from(GP_FILES_BUCKET).remove([songFilePath(userId, songId)]));
  throwIfError(await supabase.from('songs').delete().eq('id', songId).eq('user_id', userId));
}
