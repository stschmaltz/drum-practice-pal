/**
 * Writes the server hasn't confirmed yet, kept on this device so a reload, a
 * closed tab or a phone that drops the page doesn't lose them. The queued
 * mutations themselves (useLogSession, useUpdateLoop) are what send them:
 * each puts its entry here before it sends and takes it out when the server
 * has answered, either way. What is left at the next start was never
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
 * Ids queued by this page, which the replay leaves alone: their own mutation
 * is sending them, or has had its answer. Each holds the number of the claim
 * that put it there, so a removal still deleting its row can tell that the id
 * has been queued again since and is no longer its to forget.
 */
const queuedHere = new Map<string, number>();
let claims = 0;

function claim(id: string): void {
  claims += 1;
  queuedHere.set(id, claims);
}

/**
 * No generation check (offlineData.ts): that guards work which awaits
 * something before it writes, and this writes at once.
 */
export async function putOutboxEntry(entry: OutboxEntry): Promise<void> {
  claim(entry.id);
  try {
    await offlineDb.outbox.put(entry);
  } catch {
    // See the module comment.
  }
}

/**
 * The id is forgotten only once its row is gone: forgotten first, a replay
 * whose read found the row before the delete landed would take the entry and
 * send an answered write again.
 */
export async function removeOutboxEntry(id: string): Promise<void> {
  const claimed = queuedHere.get(id);
  try {
    await offlineDb.outbox.delete(id);
  } catch {
    // The row is left behind, so the id stays claimed and this page never replays it.
    // The next page to start sends it once more, which is harmless.
    return;
  }
  if (queuedHere.get(id) === claimed) queuedHere.delete(id);
}

/**
 * The user's entries left by earlier pages (or other tabs), oldest first, for
 * the replay to send. None that this page is sending already: what this
 * returns is claimed for the caller in the same step, so a second replay
 * started meanwhile (StrictMode, a remount) gets none of them.
 */
export async function takeLeftoverOutboxEntries(userId: string): Promise<OutboxEntry[]> {
  const leftover = (await outboxEntries(userId)).filter((entry) => !queuedHere.has(entry.id));
  for (const entry of leftover) claim(entry.id);
  return leftover;
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
