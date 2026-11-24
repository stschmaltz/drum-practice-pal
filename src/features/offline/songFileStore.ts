/**
 * Song files kept on this device. A stored file never changes (its path in
 * Storage is the song id), so a copy here is good for as long as the song
 * exists. Best effort throughout: a failure reads as "not stored" and the
 * file comes from the network, as it did before there was a store.
 */
import { offlineDb } from './offlineDb';
import { offlineGeneration, stillCurrent } from './offlineData';

export async function readStoredSongFile(
  userId: string,
  songId: string,
): Promise<Uint8Array | null> {
  try {
    const stored = await offlineDb.songFiles.get([userId, songId]);
    return stored ? stored.bytes : null;
  } catch {
    return null;
  }
}

/**
 * The stored copy, or else `download()`'s bytes, which are kept for next time.
 * The caller checks the bytes the same way whichever it gets.
 */
export async function loadSongFile(
  userId: string,
  songId: string,
  download: () => Promise<Uint8Array>,
): Promise<Uint8Array> {
  const stored = await readStoredSongFile(userId, songId);
  if (stored) return stored;
  const startedAt = offlineGeneration();
  const bytes = await download();
  await storeSongFile(userId, songId, bytes, startedAt);
  return bytes;
}

/** `startedAt`: `offlineGeneration()` when the download began. */
async function storeSongFile(
  userId: string,
  songId: string,
  bytes: Uint8Array,
  startedAt: number,
): Promise<void> {
  try {
    // Signed out while the file was on its way: it belongs to nobody on this device now.
    if (!stillCurrent(startedAt)) return;
    await offlineDb.songFiles.put({ userId, songId, bytes });
    void askToKeepStorage();
  } catch {
    // Quota or a blocked database: the song plays, it just won't offline.
  }
}

export async function removeStoredSongFile(userId: string, songId: string): Promise<void> {
  try {
    await offlineDb.songFiles.delete([userId, songId]);
  } catch {
    // Nothing to do; a leftover file is only ever read for a song that exists.
  }
}

let askedToKeep = false;

/**
 * Asks the browser not to evict the stored songs under storage pressure
 * (Safari drops a site's data after a week without a visit otherwise). Once
 * per page; the browser may say no, and that's fine.
 */
async function askToKeepStorage(): Promise<void> {
  if (askedToKeep) return;
  askedToKeep = true;
  try {
    if (await navigator.storage?.persisted?.()) return;
    await navigator.storage?.persist?.();
  } catch {
    // Unsupported or refused.
  }
}
