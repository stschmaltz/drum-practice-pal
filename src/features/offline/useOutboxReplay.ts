import { useEffect } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { loopEditOptions } from '@/features/loops/useLoops';
import { logSessionUnobserved } from '@/features/practice/useSessions';
import { useSignedInUser } from '@/lib/auth';
import type { OutboxEntry } from './offlineDb';
import { takeLeftoverOutboxEntries } from './outbox';

/**
 * Sends again what earlier pages queued and never heard back about: practice
 * logged offline and then closed, a speed saved just before the phone locked.
 * Once per signed-in user per page, from the signed-in layout. Each entry goes
 * through the same mutation that queued it, so it waits for the connection,
 * updates the caches and leaves the outbox the same way; loop edits keep their
 * order through the mutation's scope.
 *
 * No cancel on unmount: entries are claimed as they are read (so StrictMode's
 * second run finds none), and a claimed entry that isn't sent would wait for
 * the next page. After a sign-out the server refuses them, which drops them.
 */
export function useOutboxReplay(): void {
  const user = useSignedInUser();
  const queryClient = useQueryClient();
  const userId = user.id;

  useEffect(() => {
    void takeLeftoverOutboxEntries(userId).then((entries) => {
      for (const entry of entries) replayEntry(queryClient, userId, entry);
    });
  }, [queryClient, userId]);
}

/** Starts one entry's mutation, unobserved: nothing on screen waits for it. */
function replayEntry(queryClient: QueryClient, userId: string, entry: OutboxEntry): void {
  if (entry.kind === 'session') {
    void logSessionUnobserved(queryClient, userId, entry.record);
    return;
  }
  const mutation = queryClient
    .getMutationCache()
    .build(queryClient, loopEditOptions(queryClient, userId, entry.songId));
  // A refusal has rolled back and left the outbox in the mutation's own callbacks.
  mutation
    .execute({ loopId: entry.loopId, changes: entry.changes, queueId: entry.id })
    .catch(() => {});
}
