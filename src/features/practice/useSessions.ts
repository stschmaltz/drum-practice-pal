import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { songKeys } from '@/features/library/useSongs';
import { loopKeys } from '@/features/loops/loopKeys';
import { putOutboxEntry, removeOutboxEntry } from '@/features/offline/outbox';
import { useSignedInUser } from '@/lib/auth';
import { queuedWriteRetry } from '@/lib/network';
import { sendRefreshingToken } from '@/lib/tokenRefresh';
import { sessionKeys } from './sessionKeys';
import { fetchLoopSessions, logSession, type LogSessionResult } from './sessionsApi';
import { sessionFromRecord, type PracticeSession } from './sessions';
import type { SessionRecord } from './sessionTracker';

/** One loop's practice history, newest first. */
export function useLoopSessions(loopId: string) {
  const user = useSignedInUser();
  return useQuery({
    queryKey: sessionKeys.forLoop(user.id, loopId),
    queryFn: () => fetchLoopSessions(user.id, loopId),
  });
}

/**
 * Brings the caches in line with a session that is now in the database,
 * however it got there (the mutation below, or the tracker's keepalive
 * request). The session joins its loop's history if that is cached. The
 * server alone knows what else moved: the loop's last_practiced_at, and with
 * it the order of On the go and of the library's "recently practiced".
 */
export function sessionLogged(queryClient: QueryClient, userId: string, record: SessionRecord) {
  const historyKey = sessionKeys.forLoop(userId, record.loopId);
  queryClient.setQueryData<PracticeSession[]>(historyKey, (sessions) =>
    sessions && !sessions.some((session) => session.id === record.id)
      ? [sessionFromRecord(record), ...sessions]
      : sessions,
  );
  void queryClient.invalidateQueries({ queryKey: historyKey });
  refetchLoopsWhenIdle(queryClient, userId);
  if (queryClient.isMutating({ mutationKey: songKeys.writes(userId) }) === 0) {
    void queryClient.invalidateQueries({ queryKey: songKeys.forUser(userId) });
  }
}

/**
 * A session refused because its loop is gone (deleted on another device):
 * nothing to log, but the lists still show the loop, and the song page would
 * go on looping it. Read them again.
 */
export function sessionLoopGone(queryClient: QueryClient, userId: string) {
  refetchLoopsWhenIdle(queryClient, userId);
}

// A refetch while a write is pending would put the old row over its optimistic
// value; that write refetches when it settles (invalidateWhenIdle), so leave it to it.
function refetchLoopsWhenIdle(queryClient: QueryClient, userId: string) {
  if (queryClient.isMutating({ mutationKey: loopKeys.writes(userId) }) === 0) {
    void queryClient.invalidateQueries({ queryKey: loopKeys.forUser(userId) });
  }
}

/**
 * Keeps a session on this device until the server has it (outbox.ts), so
 * practice done offline, or on a page closed before its log got through, is
 * logged at the next start. Called before every send, whichever way it goes.
 */
export function queueSession(userId: string, record: SessionRecord): Promise<void> {
  return putOutboxEntry({ kind: 'session', id: record.id, userId, queuedAt: Date.now(), record });
}

/**
 * One definition of the write, for the hook, for a send after the screen has
 * gone and for the replay of sessions an earlier page left unsent. Offline it
 * waits (TanStack Query pauses it) and goes when the connection is back; a
 * request the connection dropped is tried again, so only the server's refusal
 * fails it.
 */
function logSessionOptions(queryClient: QueryClient, userId: string) {
  return {
    mutationKey: sessionKeys.logs(userId),
    mutationFn: (record: SessionRecord) => sendRefreshingToken(() => logSession(userId, record)),
    onMutate: (record: SessionRecord) => queueSession(userId, record),
    ...queuedWriteRetry,
    onSuccess: (result: LogSessionResult, record: SessionRecord) => {
      if (result === 'logged') sessionLogged(queryClient, userId, record);
      else sessionLoopGone(queryClient, userId);
    },
    // Answered either way: logged, its loop gone, or refused (it would be refused again).
    onSettled: (
      _result: LogSessionResult | undefined,
      _error: Error | null,
      record: SessionRecord,
    ) => removeOutboxEntry(record.id),
  };
}

/**
 * Logs one tracked session. Not optimistic: nothing on screen waits for it.
 * Safe to send again with the same record (its id is the row's), which is how
 * a failed log is retried.
 */
export function useLogSession() {
  const user = useSignedInUser();
  const queryClient = useQueryClient();
  return useMutation(logSessionOptions(queryClient, user.id));
}

/**
 * The same mutation, run from the cache with no component behind it: for the
 * session that ends as the song page unmounts, when the hook's own observer is
 * on its way out. Resolves to whether it went through; there is nobody left to
 * show a failure to, so it doesn't reject.
 */
export async function logSessionUnobserved(
  queryClient: QueryClient,
  userId: string,
  record: SessionRecord,
): Promise<boolean> {
  const mutation = queryClient
    .getMutationCache()
    .build(queryClient, logSessionOptions(queryClient, userId));
  try {
    await mutation.execute(record);
    return true;
  } catch {
    return false;
  }
}
