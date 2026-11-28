/**
 * Writes the server hasn't confirmed yet, kept on this device so a reload, a
 * closed tab or a phone that drops the page doesn't lose them. The queued
 * mutations themselves (useLogSession, useUpdateLoop) are what send them:
 * each puts its entry here before it sends and lets go of it when the server
 * has answered, either way (`OutboxHold`). What is left at the next start was never
 * answered, and `useOutboxReplay` sends it again. Every queued write is safe
 * to send twice: a session is "insert, on conflict do nothing" on its own id,
 * and a loop edit sets fields to values.
 *
 * Best effort like the rest of the database: if it can't be written, the
 * mutation still sends; only the copy that would survive a reload is missing.
 */
import { liveQuery } from 'dexie';
import { offlineDb, type OutboxEntry } from './offlineDb';

/**
 * A send's claim on its entry, from the moment it is queued. While any send on
 * this page holds an id, its row stays and the replay leaves it alone.
 */
export interface OutboxHold {
  /** Settles once the row is written, or couldn't be (best effort, never rejects). */
  readonly stored: Promise<void>;
  /**
   * The send has its answer. The row goes once every send holding the id has
   * let go, so a send answered first never takes the copy of one of the same
   * id still on its way. Safe to call twice.
   */
  readonly release: () => Promise<void>;
}

/** An entry an earlier page left, held for the caller until it calls `release`. */
export interface LeftoverEntry {
  readonly entry: OutboxEntry;
  readonly release: () => Promise<void>;
}

/**
 * Ids this page is sending, which the replay leaves alone. `holds` counts the
 * sends that have no answer yet; `deleting` the row deletes on their way. An
 * id is forgotten only when both are zero and its last delete succeeded.
 */
interface Claims {
  holds: number;
  deleting: number;
}
const queuedHere = new Map<string, Claims>();

/** Claims the id for one send; what it returns lets that one claim go. */
function hold(id: string): () => Promise<void> {
  // The same object for as long as the id is in the map, so every hold of it counts together.
  const claims = queuedHere.get(id) ?? { holds: 0, deleting: 0 };
  queuedHere.set(id, claims);
  claims.holds += 1;
  let released = false;
  return async () => {
    if (released) return;
    released = true;
    claims.holds -= 1;
    // Another send of this id has no answer yet: the row and the claim are its to drop.
    if (claims.holds > 0) return;
    // The id is forgotten only once its row is gone: forgotten first, a replay whose read
    // found the row before the delete landed would take the entry and send an answered
    // write again.
    claims.deleting += 1;
    try {
      await offlineDb.outbox.delete(id);
    } catch {
      // The row is left behind, so the id stays claimed and this page never replays it.
      // The next page to start sends it once more, which is harmless.
      claims.deleting -= 1;
      return;
    }
    claims.deleting -= 1;
    // Queued again meanwhile (its put came after this delete), or a later delete still on
    // its way: not this one's to forget.
    if (claims.holds === 0 && claims.deleting === 0) queuedHere.delete(id);
  };
}

/**
 * Queues an entry and gives back the send's hold on it, at once: a page going
 * away can keep the hold without waiting for the write.
 *
 * No generation check (offlineData.ts): that guards work which awaits
 * something before it writes, and this writes at once.
 */
export function putOutboxEntry(entry: OutboxEntry): OutboxHold {
  const release = hold(entry.id);
  const stored = offlineDb.outbox.put(entry).then(
    () => {},
    // See the module comment.
    () => {},
  );
  return { stored, release };
}

/**
 * The user's entries left by earlier pages (or other tabs), oldest first, for
 * the replay to send. None that this page is sending already: what this
 * returns is held for the caller in the same step, so a second replay
 * started meanwhile (StrictMode, a remount) gets none of them. The caller
 * releases each once its send has settled.
 */
export async function takeLeftoverOutboxEntries(userId: string): Promise<LeftoverEntry[]> {
  const leftover = (await outboxEntries(userId)).filter((entry) => !queuedHere.has(entry.id));
  return leftover.map((entry) => ({ entry, release: hold(entry.id) }));
}

/** Every entry of the user's on this device, oldest first; none if the database can't be read. */
export async function outboxEntries(userId: string): Promise<OutboxEntry[]> {
  try {
    return await offlineDb.outbox.where('userId').equals(userId).sortBy('queuedAt');
  } catch {
    return [];
  }
}

/** Whether the user has any entry on this device, whichever tab queued it; false if it can't be read. */
export async function hasOutboxEntries(userId: string): Promise<boolean> {
  try {
    return (await offlineDb.outbox.where('userId').equals(userId).count()) > 0;
  } catch {
    return false;
  }
}

/**
 * Calls `onChange` with whether the user has outbox entries, now and after
 * every change, made by this tab or another (Dexie tells the others). Returns
 * the unsubscribe. An unreadable database reads as none.
 */
export function watchOutboxEntries(
  userId: string,
  onChange: (hasEntries: boolean) => void,
): () => void {
  const subscription = liveQuery(() => hasOutboxEntries(userId)).subscribe({
    next: onChange,
    error: () => onChange(false),
  });
  return () => subscription.unsubscribe();
}
