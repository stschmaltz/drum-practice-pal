/**
 * Whether the user has writes the server hasn't answered yet: loop edits and
 * creates and deletes (one mutation key), practice session logs, those sent
 * with `keepalive` from a hidden page included (keepaliveSends.ts), song
 * uploads, edits and deletes, a settings save, a save of a song's links, a
 * "recording opened" time (Unit 14), and every entry in the outbox,
 * which is shared by the user's tabs on this device. Signing out empties the
 * device, the outbox with it, and ends this tab's session mid-request, so it
 * waits until these have gone (SignOutButton). Paused offline or retrying a
 * dropped request, a write is still pending, so this covers both.
 *
 * The outbox is what sees another tab's queued writes (this tab's mutation
 * cache knows only its own) and entries an earlier page left before the
 * replay has sent them. It is read asynchronously, so the press asks
 * `hasUnsentWritesAnywhere`.
 */
import { useEffect, useState, useSyncExternalStore } from 'react';
import { useIsMutating, type QueryClient } from '@tanstack/react-query';
import { songKeys } from '@/features/library/useSongs';
import { loopKeys } from '@/features/loops/loopKeys';
import { keepaliveSendsPending, subscribeKeepaliveSends } from '@/features/practice/keepaliveSends';
import { sessionKeys } from '@/features/practice/sessionKeys';
import { songLinkKeys } from '@/features/recordings/songLinkKeys';
import { settingsKeys } from '@/features/settings/useSettings';
import { hasOutboxEntries, watchOutboxEntries } from './outbox';

const unsentFilters = (userId: string) => [
  { mutationKey: loopKeys.writes(userId) },
  { mutationKey: sessionKeys.logs(userId) },
  { mutationKey: songKeys.writes(userId) },
  { mutationKey: settingsKeys.writes(userId) },
  { mutationKey: songLinkKeys.writes(userId) },
  { mutationKey: songKeys.plays(userId) },
];

/** Whether a mutation's key is one of the user's writes above (TanStack's prefix match). */
function isUnsentWriteKey(key: readonly unknown[] | undefined, userId: string): boolean {
  if (!key) return false;
  return unsentFilters(userId).some(
    ({ mutationKey }) =>
      mutationKey.length <= key.length && mutationKey.every((part, index) => key[index] === part),
  );
}

/** At the press: asked of the mutation cache, not taken from the last render. */
export function hasUnsentWrites(queryClient: QueryClient, userId: string): boolean {
  return (
    keepaliveSendsPending(userId) > 0 ||
    unsentFilters(userId).some((filters) => queryClient.isMutating(filters) > 0)
  );
}

/**
 * At the press, the outbox too. Async, so a caller that acts on the answer
 * asks `hasUnsentWrites` again once it is in: a write may have started meanwhile.
 */
export async function hasUnsentWritesAnywhere(
  queryClient: QueryClient,
  userId: string,
): Promise<boolean> {
  return hasUnsentWrites(queryClient, userId) || (await hasOutboxEntries(userId));
}

/** `hasUnsentWritesAnywhere` for React, for the control's `disabled` and its note. */
export function useHasUnsentWrites(userId: string): boolean {
  // One count over every kind `unsentFilters` lists, so a new kind there is counted here too.
  const pendingWrites = useIsMutating({
    predicate: (mutation) => isUnsentWriteKey(mutation.options.mutationKey, userId),
  });
  const keepalives = useSyncExternalStore(subscribeKeepaliveSends, () =>
    keepaliveSendsPending(userId),
  );
  const outbox = useOutboxHasEntries(userId);
  return pendingWrites + keepalives > 0 || outbox;
}

function useOutboxHasEntries(userId: string): boolean {
  const [hasEntries, setHasEntries] = useState<{ userId: string; value: boolean } | null>(null);
  useEffect(
    () => watchOutboxEntries(userId, (value) => setHasEntries({ userId, value })),
    [userId],
  );
  // Another user's answer, from before a switch of account, says nothing about this one.
  return hasEntries?.userId === userId && hasEntries.value;
}
