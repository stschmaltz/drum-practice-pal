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
import { offlineDb, type OutboxEntry } from './offlineDb';

/** Ids queued by this page, which the replay at start leaves alone: their own mutation is sending them. */
const queuedHere = new Set<string>();

/**
 * No generation check (offlineData.ts): that guards work which awaits
 * something before it writes, and this writes at once.
 */
export async function putOutboxEntry(entry: OutboxEntry): Promise<void> {
  queuedHere.add(entry.id);
  try {
    await offlineDb.outbox.put(entry);
  } catch {
    // See the module comment.
  }
}

export async function removeOutboxEntry(id: string): Promise<void> {
  queuedHere.delete(id);
  try {
    await offlineDb.outbox.delete(id);
  } catch {
    // Left behind, it is sent once more at the next start, which is harmless.
  }
}

/**
 * The user's entries left by earlier pages (or other tabs), oldest first, for
 * the replay to send. None that this page is sending already: what this
 * returns is claimed for the caller in the same step, so a second replay
 * started meanwhile (StrictMode, a remount) gets none of them.
 */
export async function takeLeftoverOutboxEntries(userId: string): Promise<OutboxEntry[]> {
  const leftover = (await outboxEntries(userId)).filter((entry) => !queuedHere.has(entry.id));
  for (const entry of leftover) queuedHere.add(entry.id);
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
