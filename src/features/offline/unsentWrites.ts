/**
 * Whether the user has writes the server hasn't answered yet: loop edits and
 * creates and deletes (one mutation key), and practice session logs. Signing
 * out empties the device, the outbox with it, so it waits until these have
 * gone (SignOutButton). Paused offline or retrying a dropped request, a write
 * is still pending, so this covers both.
 *
 * Not covered: entries an earlier page left in the outbox in the moment
 * before the replay has read them (useOutboxReplay), a fraction of a second
 * after the app opens.
 */
import { useIsMutating, type QueryClient } from '@tanstack/react-query';
import { loopKeys } from '@/features/loops/loopKeys';
import { sessionKeys } from '@/features/practice/sessionKeys';

const unsentFilters = (userId: string) => [
  { mutationKey: loopKeys.writes(userId) },
  { mutationKey: sessionKeys.logs(userId) },
];

/** At the press: asked of the mutation cache, not taken from the last render. */
export function hasUnsentWrites(queryClient: QueryClient, userId: string): boolean {
  return unsentFilters(userId).some((filters) => queryClient.isMutating(filters) > 0);
}

/** `hasUnsentWrites` for React, for the control's `disabled` and its note. */
export function useHasUnsentWrites(userId: string): boolean {
  const [loops, sessions] = unsentFilters(userId);
  const loopWrites = useIsMutating(loops);
  const sessionLogs = useIsMutating(sessions);
  return loopWrites + sessionLogs > 0;
}
