import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { songKeys } from '@/features/library/useSongs';
import { loopKeys } from '@/features/loops/loopKeys';
import { useSignedInUser } from '@/lib/auth';
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
  // A refetch while a write is pending would put the old row over its optimistic
  // value; that write refetches when it settles (invalidateWhenIdle), so leave it to it.
  if (queryClient.isMutating({ mutationKey: loopKeys.writes(userId) }) === 0) {
    void queryClient.invalidateQueries({ queryKey: loopKeys.forUser(userId) });
  }
  if (queryClient.isMutating({ mutationKey: songKeys.writes(userId) }) === 0) {
    void queryClient.invalidateQueries({ queryKey: songKeys.forUser(userId) });
  }
}

/** One definition of the write, for the hook and for a send after the screen has gone. */
function logSessionOptions(queryClient: QueryClient, userId: string) {
  return {
    mutationFn: (record: SessionRecord) => logSession(userId, record),
    onSuccess: (result: LogSessionResult, record: SessionRecord) => {
      if (result === 'logged') sessionLogged(queryClient, userId, record);
    },
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
