/**
 * Supabase calls for songs and their files. Plain async functions that throw
 * on error; the hooks in useSongs.ts are the only callers.
 */
import { failureCopy, failureKind, UserFacingError } from '@/lib/errorCopy';
import { fetchAllPages } from '@/lib/fetchAllPages';
import { PG } from '@/lib/postgresCodes';
import { randomUuid } from '@/lib/randomUuid';
import { GP_FILE_MAX_BYTES, GP_FILES_BUCKET, songFilePath } from '@/lib/schema';
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

/** One song, or null when it doesn't exist (or isn't this user's). */
export async function fetchSong(userId: string, songId: string): Promise<Song | null> {
  const result = await supabase
    .from('songs')
    .select(SONG_SELECT)
    .eq('id', songId)
    .eq('user_id', userId)
    .maybeSingle();
  throwIfError(result);
  return result.data;
}

/** The song's Guitar Pro file from Storage. */
export async function downloadSongFile(userId: string, songId: string): Promise<Uint8Array> {
  const blob = unwrap(
    await supabase.storage.from(GP_FILES_BUCKET).download(songFilePath(userId, songId)),
    'song file',
  );
  return new Uint8Array(await blob.arrayBuffer());
}

/** A file the app refuses, with copy fit to show as is. */
export class SongFileError extends UserFacingError {
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
 * cancel, and an insert the server refused removes the uploaded file again;
 * one whose answer was lost keeps it, since the row may yet name it.
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
  const uploaded = await supabase.storage
    .from(GP_FILES_BUCKET)
    .upload(filePath, bytes, { contentType: 'application/octet-stream', upsert: false });
  if (uploaded.error) {
    // A lost answer can hide a file that was stored: remove it, as nothing will name it.
    if (failureKind(uploaded.error) === 'network') {
      await removeUploadedFile(filePath, uploaded.error);
    }
    throw uploaded.error;
  }
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
    if (failureKind(inserted.error) === 'network') {
      // The row may have committed with only its answer lost, or may still
      // commit: the insert can be running yet when a look-up finds nothing.
      // So only a row found settles it, and otherwise the file stays. Removing
      // it could leave a listed song with nothing to play; keeping it at worst
      // leaves a file no row names, which blocks nothing (a new upload takes a
      // new id and path).
      const landed = await findSavedSong(userId, songId, inserted.error);
      if (landed) return uploadedSong(landed);
      throw mayHaveBeenAdded(inserted.error);
    }
    await removeUploadedFile(filePath, inserted.error);
    // Another tab or device added the same file since the check above
    // (songs_user_file_hash_key).
    if (inserted.error.code === PG.UNIQUE_VIOLATION) {
      const winner = await findSongByHash(userId, fileHash);
      if (winner) return { kind: 'duplicate', song: winner };
    }
    throw inserted.error;
  }
  return uploadedSong(unwrap(inserted, 'song'));
}

/** A song just added has never been practiced. */
function uploadedSong(song: Song): UploadResult {
  return { kind: 'uploaded', song: { ...song, last_practiced_at: null } };
}

/** The file's bytes and score metadata, or a SongFileError for a file the app refuses. */
async function readSongFile(file: File): Promise<{ bytes: Uint8Array; metadata: SongMetadata }> {
  // Before reading: a phone would otherwise load a picked video into memory just to refuse it.
  if (file.size > GP_FILE_MAX_BYTES) throw new SongFileError(SONG_FILE_MESSAGES['too-large']);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const check = checkSongFile(file.name, bytes);
  if (!check.ok) throw new SongFileError(SONG_FILE_MESSAGES[check.problem]);

  // Lazy, so alphaTab isn't in the main bundle.
  const { parseScore } = await import('./parseScore');
  const parsed = parseScore(bytes, file.name);
  if (!parsed.ok) throw new SongFileError(SONG_FILE_MESSAGES.unreadable);
  return { bytes, metadata: parsed.metadata };
}

/**
 * After an insert whose answer never came: the row, if it is saved by now.
 * Null doesn't mean it never will be, and a failed read is just as unsure.
 */
async function findSavedSong(userId: string, songId: string, cause: unknown): Promise<Song | null> {
  const landed = await supabase
    .from('songs')
    .select(SONG_SELECT)
    .eq('id', songId)
    .eq('user_id', userId)
    .maybeSingle();
  if (landed.error) throw mayHaveBeenAdded(cause);
  return landed.data;
}

/** An insert whose outcome can't be known from here: the file is kept, and the user told to look. */
function mayHaveBeenAdded(cause: unknown): UserFacingError {
  return new UserFacingError(
    `${failureCopy(cause)} The song may have been added anyway: reload the library to see.`,
    { cause },
  );
}

/** Rollback for a file whose row won't exist. Throws if the file stays behind. */
async function removeUploadedFile(filePath: string, cause: unknown): Promise<void> {
  const removed = await supabase.storage.from(GP_FILES_BUCKET).remove([filePath]);
  if (removed.error) {
    throw new UserFacingError(
      `${failureCopy(cause)} A copy of the file may be left on the server.`,
      {
        cause,
      },
    );
  }
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
