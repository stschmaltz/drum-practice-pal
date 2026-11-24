/**
 * The one way to empty this device of a user's data: on sign-out, every
 * song file, queued write and persisted query goes.
 *
 * Writes to the database are async, so one begun before a sign-out could land
 * after the clear and leave a file or a write behind. Each writer reads the
 * `generation` when it starts and calls `stillCurrent` before it writes;
 * `clearOfflineData` moves the generation on first.
 */
import { offlineDb } from './offlineDb';

let generation = 0;

export function offlineGeneration(): number {
  return generation;
}

/** Whether no clear has happened since `startedAt` was read. */
export function stillCurrent(startedAt: number): boolean {
  return startedAt === generation;
}

/** Resolves once everything is gone; never rejects (a database that won't open holds nothing). */
export async function clearOfflineData(): Promise<void> {
  generation += 1;
  try {
    await offlineDb.transaction(
      'rw',
      [offlineDb.songFiles, offlineDb.outbox, offlineDb.queryCache],
      async () => {
        await offlineDb.songFiles.clear();
        await offlineDb.outbox.clear();
        await offlineDb.queryCache.clear();
      },
    );
  } catch {
    // Nothing more to do: the database is unusable, so there is nothing in it to read back either.
  }
}
