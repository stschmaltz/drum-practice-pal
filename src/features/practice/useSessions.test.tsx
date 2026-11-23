import { renderHook, waitFor } from '@testing-library/react';
import { songKeys } from '@/features/library/useSongs';
import { loopKeys } from '@/features/loops/loopKeys';
import { queryResult, resetFakeSupabase, type FakeResult } from '@/test/fakeSupabase';
import { signedInAs, testQueryClient, wrapperFor } from '@/test/render';
import { sessionKeys } from './sessionKeys';
import type { PracticeSession } from './sessions';
import type { SessionRecord } from './sessionTracker';
import { logSessionUnobserved, sessionLogged, useLogSession, useLoopSessions } from './useSessions';

vi.mock('@/lib/supabase', async () => (await import('@/test/fakeSupabase')).fakeSupabaseModule);

const USER = 'user-1';
const LOOP = 'loop-1';

const ok = (data: unknown): FakeResult => ({ data, error: null });
const fail = (message: string, code?: string): FakeResult => ({
  data: null,
  error: { message, code },
});

const record: SessionRecord = {
  id: 'session-new',
  loopId: LOOP,
  startedAt: '2026-11-23T18:00:00.000Z',
  durationSeconds: 61,
  speedRatio: 0.855556,
  repeats: 7,
};

const earlier: PracticeSession = {
  id: 'session-old',
  loop_id: LOOP,
  started_at: '2026-11-20T18:00:00.000Z',
  duration_seconds: 120,
  speed_ratio: 0.8,
  repeats: 12,
};

const historyKey = sessionKeys.forLoop(USER, LOOP);
const practiceKey = loopKeys.practice(USER);
const songsKey = songKeys.forUser(USER);

/** A client with the caches a logged session touches already filled, none of them stale. */
function cachedClient({ history = [earlier] as PracticeSession[] | null } = {}) {
  const queryClient = testQueryClient();
  if (history) queryClient.setQueryData(historyKey, history);
  queryClient.setQueryData(practiceKey, []);
  queryClient.setQueryData(songsKey, []);
  return queryClient;
}

const isInvalidated = (queryClient: ReturnType<typeof testQueryClient>, key: readonly unknown[]) =>
  queryClient.getQueryState(key)?.isInvalidated;

/** A loop or song write that never settles, as one in flight looks to the cache. */
function pendingWrite(
  queryClient: ReturnType<typeof testQueryClient>,
  mutationKey: readonly unknown[],
) {
  const mutation = queryClient
    .getMutationCache()
    .build(queryClient, { mutationKey, mutationFn: () => new Promise<void>(() => {}) });
  void mutation.execute(undefined);
}

beforeEach(() => {
  resetFakeSupabase();
});

describe('sessionLogged', () => {
  it("puts the session at the head of its loop's cached history, as the row will read back", () => {
    const queryClient = cachedClient();

    sessionLogged(queryClient, USER, record);

    expect(queryClient.getQueryData<PracticeSession[]>(historyKey)).toEqual([
      {
        id: 'session-new',
        loop_id: LOOP,
        started_at: '2026-11-23T18:00:00.000Z',
        duration_seconds: 61,
        speed_ratio: 0.855556,
        repeats: 7,
      },
      earlier,
    ]);
  });

  it('adds nothing when the session is already there (a retry, or a keepalive seen twice)', () => {
    const queryClient = cachedClient();

    sessionLogged(queryClient, USER, record);
    sessionLogged(queryClient, USER, record);

    expect(queryClient.getQueryData<PracticeSession[]>(historyKey)).toHaveLength(2);
  });

  it('makes no history cache for a loop whose history was never opened', () => {
    const queryClient = cachedClient({ history: null });

    sessionLogged(queryClient, USER, record);

    expect(queryClient.getQueryData(historyKey)).toBeUndefined();
  });

  it('refetches what only the server knows: the history, every loop list and the songs', () => {
    const queryClient = cachedClient();
    const otherLoop = sessionKeys.forLoop(USER, 'loop-2');
    const otherUser = loopKeys.practice('user-2');
    queryClient.setQueryData(otherLoop, []);
    queryClient.setQueryData(otherUser, []);

    sessionLogged(queryClient, USER, record);

    expect(isInvalidated(queryClient, historyKey)).toBe(true);
    expect(isInvalidated(queryClient, practiceKey)).toBe(true);
    expect(isInvalidated(queryClient, songsKey)).toBe(true);
    // Nothing of another loop's history, or of another account.
    expect(isInvalidated(queryClient, otherLoop)).toBe(false);
    expect(isInvalidated(queryClient, otherUser)).toBe(false);
  });

  it('leaves the loops alone while a loop write is pending: its own settle refetches them', () => {
    const queryClient = cachedClient();
    pendingWrite(queryClient, loopKeys.writes(USER));
    // The write is really seen as pending, or the assertion below proves nothing.
    expect(queryClient.isMutating({ mutationKey: loopKeys.writes(USER) })).toBe(1);

    sessionLogged(queryClient, USER, record);

    expect(isInvalidated(queryClient, practiceKey)).toBe(false);
    expect(isInvalidated(queryClient, songsKey)).toBe(true);
    expect(queryClient.getQueryData<PracticeSession[]>(historyKey)).toHaveLength(2);
  });

  it('leaves the songs alone while a song write is pending', () => {
    const queryClient = cachedClient();
    pendingWrite(queryClient, songKeys.writes(USER));
    expect(queryClient.isMutating({ mutationKey: songKeys.writes(USER) })).toBe(1);

    sessionLogged(queryClient, USER, record);

    expect(isInvalidated(queryClient, songsKey)).toBe(false);
    expect(isInvalidated(queryClient, practiceKey)).toBe(true);
  });
});

describe('useLogSession', () => {
  const renderLog = (queryClient = cachedClient()) => ({
    queryClient,
    ...renderHook(() => useLogSession(), { wrapper: wrapperFor(queryClient, signedInAs(USER)) }),
  });

  it('updates the caches once the row is in', async () => {
    queryResult.mockResolvedValue(ok(null));
    const { queryClient, result } = renderLog();

    await expect(result.current.mutateAsync(record)).resolves.toBe('logged');

    expect(queryClient.getQueryData<PracticeSession[]>(historyKey)?.[0]?.id).toBe('session-new');
    expect(isInvalidated(queryClient, practiceKey)).toBe(true);
  });

  it('touches no cache for a loop that has been deleted', async () => {
    queryResult.mockResolvedValue(fail('violates foreign key constraint', '23503'));
    const { queryClient, result } = renderLog();

    await expect(result.current.mutateAsync(record)).resolves.toBe('loopGone');

    expect(queryClient.getQueryData<PracticeSession[]>(historyKey)).toEqual([earlier]);
    expect(isInvalidated(queryClient, practiceKey)).toBe(false);
  });

  it('touches no cache when the log fails, and rejects so the caller can keep the session', async () => {
    queryResult.mockResolvedValue(fail('offline'));
    const { queryClient, result } = renderLog();

    await expect(result.current.mutateAsync(record)).rejects.toThrow();

    expect(queryClient.getQueryData<PracticeSession[]>(historyKey)).toEqual([earlier]);
    expect(isInvalidated(queryClient, practiceKey)).toBe(false);
  });

  it('still updates the caches when the screen that sent it has gone', async () => {
    let answer!: (result: FakeResult) => void;
    queryResult.mockReturnValue(new Promise<FakeResult>((resolve) => (answer = resolve)));
    const { queryClient, result, unmount } = renderLog();
    const sent = result.current.mutateAsync(record);
    await waitFor(() => expect(queryResult).toHaveBeenCalled());

    unmount();
    answer(ok(null));

    await expect(sent).resolves.toBe('logged');
    expect(queryClient.getQueryData<PracticeSession[]>(historyKey)?.[0]?.id).toBe('session-new');
    expect(isInvalidated(queryClient, practiceKey)).toBe(true);
  });
});

describe('logSessionUnobserved', () => {
  it('logs with no component behind it, and updates the caches', async () => {
    queryResult.mockResolvedValue(ok(null));
    const queryClient = cachedClient();

    await expect(logSessionUnobserved(queryClient, USER, record)).resolves.toBe(true);

    expect(queryClient.getQueryData<PracticeSession[]>(historyKey)?.[0]?.id).toBe('session-new');
    expect(isInvalidated(queryClient, practiceKey)).toBe(true);
  });

  it('says so, without rejecting, when the log fails: nobody is left to catch it', async () => {
    queryResult.mockResolvedValue(fail('offline'));
    const queryClient = cachedClient();

    await expect(logSessionUnobserved(queryClient, USER, record)).resolves.toBe(false);

    expect(queryClient.getQueryData<PracticeSession[]>(historyKey)).toEqual([earlier]);
  });
});

describe('useLoopSessions', () => {
  it("keeps a loop's history under the user's and the loop's key", async () => {
    queryResult.mockResolvedValue(ok([earlier]));
    const queryClient = testQueryClient();

    const { result } = renderHook(() => useLoopSessions(LOOP), {
      wrapper: wrapperFor(queryClient, signedInAs(USER)),
    });

    await waitFor(() => expect(result.current.data).toEqual([earlier]));
    expect(queryClient.getQueryData(historyKey)).toEqual([earlier]);
    expect(queryClient.getQueryData(sessionKeys.forLoop('user-2', LOOP))).toBeUndefined();
  });
});
