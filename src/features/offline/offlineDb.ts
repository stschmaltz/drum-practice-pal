/**
 * The app's IndexedDB database (Dexie), for what has to outlive the page:
 *
 * - `songFiles`: the Guitar Pro bytes of every song opened on this device, so
 *   it plays offline (songFileStore.ts).
 * - `outbox`: writes made on this device that the server hasn't confirmed yet
 *   (outbox.ts), sent again on the next start.
 * - `queryCache`: TanStack Query's persisted cache, so the library, the loops
 *   and the settings read offline (queryPersister.ts).
 *
 * Everything in it belongs to the signed-in user and goes on sign-out
 * (offlineData.ts). Every caller treats it as best effort: private browsing,
 * a full disk or a blocked database must never stop the app working online.
 */
import Dexie, { type Table } from 'dexie';
import type { LoopEdit } from '@/features/loops/loopForm';
import type { SessionRecord } from '@/features/practice/sessionTracker';

export interface StoredSongFile {
  userId: string;
  songId: string;
  bytes: Uint8Array;
}

/** A practice session to log, by the tracker's record (its id is the row's). */
export interface QueuedSession {
  kind: 'session';
  /** The session's own id, so queueing it twice keeps one entry. */
  id: string;
  userId: string;
  queuedAt: number;
  record: SessionRecord;
}

/** A change to a loop's fields (a saved speed, finish or reopen, an edit). */
export interface QueuedLoopEdit {
  kind: 'loopEdit';
  /** Made for the edit when it is first sent. */
  id: string;
  userId: string;
  queuedAt: number;
  songId: string;
  loopId: string;
  changes: Partial<LoopEdit>;
}

export type OutboxEntry = QueuedSession | QueuedLoopEdit;

export interface StoredValue {
  key: string;
  value: string;
}

class DrumPalDb extends Dexie {
  songFiles!: Table<StoredSongFile, [string, string]>;
  outbox!: Table<OutboxEntry, string>;
  queryCache!: Table<StoredValue, string>;

  constructor() {
    super('drum-practice-pal');
    this.version(1).stores({
      songFiles: '[userId+songId], userId',
      outbox: 'id, userId, queuedAt',
      queryCache: 'key',
    });
  }
}

export const offlineDb = new DrumPalDb();
