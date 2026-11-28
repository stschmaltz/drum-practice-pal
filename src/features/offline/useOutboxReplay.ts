import { useEffect } from 'react';
import { useIsRestoring, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { sendSongPlayedUnobserved } from '@/features/library/songPlayed';
import type { LoopEdit } from '@/features/loops/loopForm';
import { loopKeys } from '@/features/loops/loopKeys';
import { loopEditOptions, type LoopUpdate } from '@/features/loops/useLoops';
import { logSessionUnobserved } from '@/features/practice/useSessions';
import { useSignedInUser } from '@/lib/auth';
import type { QueuedLoopEdit } from './offlineDb';
import { takeLeftoverOutboxEntries, type LeftoverEntry } from './outbox';

/**
 * Sends again what earlier pages queued and never heard back about: practice
 * logged offline and then closed, a speed saved just before the phone locked.
 * Once per signed-in user per page, from the signed-in layout. Each entry goes
 * through the same mutation that queued it, so it waits for the connection,
 * updates the caches and leaves the outbox the same way; loop edits keep their
 * order through the mutation's scope.
 *
 * Starts once the persisted cache is restored (`useIsRestoring`): a replayed
 * edit's optimistic value set before then would find no list to change, and
 * the restore would then put back the older row.
 *
 * No cancel on unmount: entries are claimed as they are read (so StrictMode's
 * second run finds none), and a claimed entry that isn't sent would wait for
 * the next page. After a sign-out the server refuses them, which drops them.
 */
export function useOutboxReplay(): void {
  const user = useSignedInUser();
  const queryClient = useQueryClient();
  const restoring = useIsRestoring();
  const userId = user.id;

  useEffect(() => {
    if (restoring) return;
    void takeLeftoverOutboxEntries(userId).then((entries) => {
      for (const leftover of entries) replayEntry(queryClient, userId, leftover);
    });
  }, [queryClient, userId, restoring]);
}

/**
 * Starts one entry's mutation, unobserved: nothing on screen waits for it. The
 * mutation holds the entry for itself as it queues it again; the replay's own
 * hold, from the read, is let go once that send has settled, so the entry is
 * this page's without a gap and its row goes with the last hold.
 */
function replayEntry(
  queryClient: QueryClient,
  userId: string,
  { entry, release }: LeftoverEntry,
): void {
  if (entry.kind === 'session') {
    void logSessionUnobserved(queryClient, userId, entry.record).then(release);
    return;
  }
  if (entry.kind === 'songPlayed') {
    void sendSongPlayedUnobserved(queryClient, userId, {
      songId: entry.songId,
      playedAt: entry.playedAt,
      queueId: entry.id,
      queuedAt: entry.queuedAt,
    }).then(release);
    return;
  }
  // An edit made on this page before the outbox was read is newer, and joined the queue
  // first: sent after it, the replay would put the older value back.
  const changes = withoutNewerEdits(entry, editsMadeSince(queryClient, userId, entry));
  if (Object.keys(changes).length === 0) {
    void release();
    return;
  }
  const mutation = queryClient
    .getMutationCache()
    .build(queryClient, loopEditOptions(queryClient, userId, entry.songId));
  // A refusal has rolled back in the mutation's own callbacks.
  void mutation
    .execute({
      loopId: entry.loopId,
      changes,
      queueId: entry.id,
      queuedAt: entry.queuedAt,
    })
    .then(release, release);
}

/** The changes of this page's own edits of the entry's loop made after it was queued. */
function editsMadeSince(
  queryClient: QueryClient,
  userId: string,
  entry: QueuedLoopEdit,
): Partial<LoopEdit>[] {
  return queryClient
    .getMutationCache()
    .findAll({ mutationKey: loopKeys.writes(userId) })
    .flatMap((mutation) => {
      const variables = mutation.state.variables as Partial<LoopUpdate> | undefined;
      // Creates and deletes share the key; replays carry a queueId and are older by definition.
      if (typeof variables !== 'object' || variables === null) return [];
      if (variables.loopId !== entry.loopId || variables.queueId !== undefined) return [];
      if (!variables.changes || mutation.state.submittedAt < entry.queuedAt) return [];
      return [variables.changes];
    });
}

/** The entry's changes minus every field a newer edit has set. */
function withoutNewerEdits(
  entry: Pick<QueuedLoopEdit, 'changes'>,
  newer: readonly Partial<LoopEdit>[],
): Partial<LoopEdit> {
  const changes: Partial<LoopEdit> = { ...entry.changes };
  for (const edit of newer) {
    for (const field of Object.keys(edit) as (keyof LoopEdit)[]) delete changes[field];
  }
  return changes;
}
