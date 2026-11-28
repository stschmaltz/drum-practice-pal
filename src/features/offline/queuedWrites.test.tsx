import { AuthRetryableFetchError } from '@supabase/supabase-js';
import { act, renderHook, waitFor } from '@testing-library/react';
import { IsRestoringProvider, onlineManager } from '@tanstack/react-query';
import { loopKeys } from '@/features/loops/loopKeys';
import type { Loop } from '@/features/loops/loopForm';
import { useUpdateLoop } from '@/features/loops/useLoops';
import type { SessionRecord } from '@/features/practice/sessionTracker';
import { useLogSession } from '@/features/practice/useSessions';
import {
  FAKE_AUTH_STORAGE_KEY,
  fakeSession,
  fakeSupabase,
  opArgs,
  queryResult,
  resetFakeSupabase,
  type FakeResult,
  type QueryCall,
} from '@/test/fakeSupabase';
import { LOOP_SONG_ID, loopRow } from '@/test/loopTable';
import { settle, testQueryClient, wrapperFor } from '@/test/render';
import { offlineDb, type OutboxEntry } from './offlineDb';
import { outboxEntries } from './outbox';
import { hasUnsentWrites, useHasUnsentWrites } from './unsentWrites';
import { useOutboxReplay } from './useOutboxReplay';

vi.mock('@/lib/supabase', async () => (await import('@/test/fakeSupabase')).fakeSupabaseModule);

const USER = 'user-1';
const ok = (data: unknown): FakeResult => ({ data, error: null });
const dropped: FakeResult = {
  data: null,
  error: { message: 'TypeError: Failed to fetch', code: '' },
};
const refused: FakeResult = { data: null, error: { message: 'nope', code: '23514' } };

const record = (id: string): SessionRecord => ({
  id,
  loopId: 'loop-1',
  startedAt: '2026-11-23T18:00:00.000Z',
  durationSeconds: 45,
  speedRatio: 0.8,
  repeats: 3,
});

const sessionInserts = () =>
  queryResult.mock.calls
    .map(([call]) => call)
    .filter((call) => call.table === 'practice_sessions' && opArgs(call, 'upsert'))
    .map((call) => (opArgs(call, 'upsert')?.[0] as { id: string }).id);

const loopUpdates = () =>
  queryResult.mock.calls
    .map(([call]) => opArgs(call, 'update')?.[0] as Partial<Loop> | undefined)
    .filter((changes) => changes !== undefined);

/** Loop updates answer with the row as it would be; everything else (lists, sessions) answers ok. */
function answerWith(row: Loop) {
  let saved = row;
  queryResult.mockImplementation(async (call: QueryCall) => {
    const changes = opArgs(call, 'update')?.[0] as Partial<Loop> | undefined;
    if (changes) {
      saved = { ...saved, ...changes };
      return ok(saved);
    }
    if (call.table === 'loops') return ok([saved]);
    return ok(null);
  });
}

beforeEach(() => {
  resetFakeSupabase();
});

describe('session logs, offline', () => {
  it('waits for the connection, kept on the device, and is sent once when it is back', async () => {
    queryResult.mockResolvedValue(ok(null));
    const queryClient = testQueryClient();
    const { result } = renderHook(() => useLogSession(), { wrapper: wrapperFor(queryClient) });
    act(() => onlineManager.setOnline(false));

    act(() => result.current.mutate(record('s1')));
    await waitFor(() => expect(result.current.isPaused).toBe(true));
    await waitFor(async () => expect((await outboxEntries(USER)).map((e) => e.id)).toEqual(['s1']));
    expect(sessionInserts()).toEqual([]);

    act(() => onlineManager.setOnline(true));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(sessionInserts()).toEqual(['s1']);
    await waitFor(async () => expect(await outboxEntries(USER)).toEqual([]));
  });

  it('tries again after a request the connection dropped, rather than failing', async () => {
    queryResult.mockResolvedValueOnce(dropped).mockResolvedValue(ok(null));
    const { result } = renderHook(() => useLogSession(), {
      wrapper: wrapperFor(testQueryClient()),
    });
    act(() => result.current.mutate(record('s1')));
    await waitFor(() => expect(result.current.isSuccess).toBe(true), { timeout: 3000 });
    expect(sessionInserts()).toEqual(['s1', 's1']);
    expect(result.current.failureCount).toBe(0);
  });

  it("fails on the server's refusal, and leaves the device's outbox", async () => {
    queryResult.mockResolvedValue(refused);
    const { result } = renderHook(() => useLogSession(), {
      wrapper: wrapperFor(testQueryClient()),
    });
    act(() => result.current.mutate(record('s1')));
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(sessionInserts()).toEqual(['s1']);
    await waitFor(async () => expect(await outboxEntries(USER)).toEqual([]));
  });
});

describe('loop edits, offline', () => {
  const loop = loopRow('a', { speed_ratio: 1 });

  function renderEdit() {
    const queryClient = testQueryClient();
    queryClient.setQueryData(loopKeys.forSong(USER, LOOP_SONG_ID), [loop]);
    const view = renderHook(() => useUpdateLoop(LOOP_SONG_ID), {
      wrapper: wrapperFor(queryClient),
    });
    const cached = () =>
      queryClient.getQueryData<Loop[]>(loopKeys.forSong(USER, LOOP_SONG_ID))?.[0];
    return { ...view, queryClient, cached };
  }

  it('shows saved speeds at once, keeps them through the wait, and sends them in order', async () => {
    answerWith(loop);
    const { result, cached } = renderEdit();
    act(() => onlineManager.setOnline(false));

    act(() => result.current.mutate({ loopId: 'a', changes: { speed_ratio: 0.9 } }));
    await waitFor(() => expect(cached()?.speed_ratio).toBe(0.9));
    act(() => result.current.mutate({ loopId: 'a', changes: { speed_ratio: 0.8 } }));
    await waitFor(() => expect(cached()?.speed_ratio).toBe(0.8));
    await waitFor(async () => expect(await outboxEntries(USER)).toHaveLength(2));
    await settle();
    expect(loopUpdates()).toEqual([]);

    act(() => onlineManager.setOnline(true));
    await waitFor(() => expect(loopUpdates()).toHaveLength(2));
    // One at a time: the newer speed is the one the server keeps.
    expect(loopUpdates()).toEqual([{ speed_ratio: 0.9 }, { speed_ratio: 0.8 }]);
    await waitFor(async () => expect(await outboxEntries(USER)).toEqual([]));
    await waitFor(() => expect(cached()?.speed_ratio).toBe(0.8));
  });

  it("keeps the newer speed on show while the older edit's answer lands and the newer is still on its way", async () => {
    answerWith(loop);
    const answer = queryResult.getMockImplementation()!;
    let updates = 0;
    // The second update never answers: a connection that stalls after the first.
    queryResult.mockImplementation((call: QueryCall) =>
      opArgs(call, 'update') && ++updates === 2 ? new Promise<FakeResult>(() => {}) : answer(call),
    );
    const { result, cached } = renderEdit();
    act(() => onlineManager.setOnline(false));
    act(() => result.current.mutate({ loopId: 'a', changes: { speed_ratio: 0.9 } }));
    act(() => result.current.mutate({ loopId: 'a', changes: { speed_ratio: 0.8 } }));
    await waitFor(() => expect(cached()?.speed_ratio).toBe(0.8));
    await waitFor(async () => expect(await outboxEntries(USER)).toHaveLength(2));

    act(() => onlineManager.setOnline(true));
    // The first has been answered once the second is sent (one queue).
    await waitFor(() => expect(loopUpdates()).toHaveLength(2));
    await settle();
    expect(cached()?.speed_ratio).toBe(0.8);
  });

  it('does not roll back an edit whose request the connection dropped', async () => {
    answerWith(loop);
    const answer = queryResult.getMockImplementation()!;
    queryResult.mockImplementationOnce(async () => dropped);
    const { result, cached } = renderEdit();

    act(() => result.current.mutate({ loopId: 'a', changes: { status: 'finished' } }));
    await waitFor(() => expect(cached()?.status).toBe('finished'));
    await waitFor(() => expect(loopUpdates()).toHaveLength(1));
    expect(cached()?.status).toBe('finished');
    expect(result.current.isError).toBe(false);

    queryResult.mockImplementation(answer);
    await waitFor(() => expect(result.current.isSuccess).toBe(true), { timeout: 3000 });
    expect(cached()?.status).toBe('finished');
  });

  it("rolls back on the server's refusal, as before", async () => {
    queryResult.mockResolvedValue(refused);
    const { result, cached } = renderEdit();
    act(() => result.current.mutate({ loopId: 'a', changes: { speed_ratio: 0.5 } }));
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(cached()?.speed_ratio).toBe(1);
    await waitFor(async () => expect(await outboxEntries(USER)).toEqual([]));
  });
});

describe('queued writes with no session in memory (13.23)', () => {
  /** supabase-js after a refresh that failed for the connection; the session is still in storage. */
  function sessionLostOnce() {
    localStorage.setItem(FAKE_AUTH_STORAGE_KEY, JSON.stringify(fakeSession(USER)));
    fakeSupabase.auth.getSession.mockResolvedValueOnce({
      data: { session: null },
      error: new AuthRetryableFetchError('Failed to fetch', 0),
    });
  }

  it('a session log is kept on the device, never sent as anon, and lands once when the session is back', async () => {
    queryResult.mockResolvedValue(ok(null));
    sessionLostOnce();
    const { result } = renderHook(() => useLogSession(), {
      wrapper: wrapperFor(testQueryClient()),
    });
    act(() => result.current.mutate(record('s1')));

    await waitFor(() => expect(result.current.failureCount).toBe(1));
    expect(result.current.isPending).toBe(true);
    expect(sessionInserts()).toEqual([]);
    expect((await outboxEntries(USER)).map((entry) => entry.id)).toEqual(['s1']);

    await waitFor(() => expect(result.current.isSuccess).toBe(true), { timeout: 3000 });
    expect(sessionInserts()).toEqual(['s1']);
    await waitFor(async () => expect(await outboxEntries(USER)).toEqual([]));
  });

  it('a loop edit keeps its value on show and is sent once, not rolled back', async () => {
    const loop = loopRow('a', { speed_ratio: 1 });
    answerWith(loop);
    sessionLostOnce();
    const queryClient = testQueryClient();
    queryClient.setQueryData(loopKeys.forSong(USER, LOOP_SONG_ID), [loop]);
    const speed = () =>
      queryClient.getQueryData<Loop[]>(loopKeys.forSong(USER, LOOP_SONG_ID))?.[0]?.speed_ratio;
    const { result } = renderHook(() => useUpdateLoop(LOOP_SONG_ID), {
      wrapper: wrapperFor(queryClient),
    });
    act(() => result.current.mutate({ loopId: 'a', changes: { speed_ratio: 0.5 } }));

    await waitFor(() => expect(result.current.failureCount).toBe(1));
    expect(loopUpdates()).toEqual([]);
    expect(speed()).toBe(0.5);

    await waitFor(() => expect(result.current.isSuccess).toBe(true), { timeout: 3000 });
    expect(loopUpdates()).toEqual([{ speed_ratio: 0.5 }]);
    expect(speed()).toBe(0.5);
  });
});

describe('useOutboxReplay', () => {
  const entries: OutboxEntry[] = [
    { kind: 'session', id: 's-left', userId: USER, queuedAt: 1, record: record('s-left') },
    {
      kind: 'loopEdit',
      id: 'e1',
      userId: USER,
      queuedAt: 2,
      songId: LOOP_SONG_ID,
      loopId: 'a',
      changes: { speed_ratio: 0.7 },
    },
    {
      kind: 'loopEdit',
      id: 'e2',
      userId: USER,
      queuedAt: 3,
      songId: LOOP_SONG_ID,
      loopId: 'a',
      changes: { status: 'finished' },
    },
    {
      kind: 'session',
      id: 's-other',
      userId: 'someone-else',
      queuedAt: 4,
      record: record('s-other'),
    },
  ];

  it("sends what an earlier page left, once each, the user's own only, and empties the outbox", async () => {
    await offlineDb.outbox.bulkPut(entries);
    answerWith(loopRow('a'));
    renderHook(() => useOutboxReplay(), {
      wrapper: wrapperFor(testQueryClient()),
      reactStrictMode: true,
    });

    await waitFor(() => expect(loopUpdates()).toHaveLength(2));
    await waitFor(() => expect(sessionInserts()).toEqual(['s-left']));
    expect(loopUpdates()).toEqual([{ speed_ratio: 0.7 }, { status: 'finished' }]);
    await waitFor(async () => expect(await outboxEntries(USER)).toEqual([]));
    expect((await outboxEntries('someone-else')).map((e) => e.id)).toEqual(['s-other']);
    await settle();
    expect(sessionInserts()).toEqual(['s-left']);
  });

  /** The replay and a loop's speed control on one page, with the cache restore held until `restored()`. */
  function renderReplayWithEdit(leftoverSpeed: Loop) {
    const queryClient = testQueryClient();
    let restoring = true;
    const Wrapper = wrapperFor(queryClient);
    const view = renderHook(
      () => {
        useOutboxReplay();
        return useUpdateLoop(LOOP_SONG_ID);
      },
      {
        wrapper: ({ children }) => (
          <Wrapper>
            <IsRestoringProvider value={restoring}>{children}</IsRestoringProvider>
          </Wrapper>
        ),
      },
    );
    const restored = (rows: Loop[] = [leftoverSpeed]) => {
      // As the persisted cache would: the song's loops as the last page left them.
      queryClient.setQueryData(loopKeys.forSong(USER, LOOP_SONG_ID), rows);
      restoring = false;
      view.rerender();
    };
    const cached = () =>
      queryClient.getQueryData<Loop[]>(loopKeys.forSong(USER, LOOP_SONG_ID))?.[0];
    return { ...view, restored, cached };
  }

  const leftoverSpeed = (queuedAt: number): OutboxEntry => ({
    kind: 'loopEdit',
    id: 'left-speed',
    userId: USER,
    queuedAt,
    songId: LOOP_SONG_ID,
    loopId: 'a',
    changes: { speed_ratio: 0.8 },
  });

  it('waits for the restored cache, so the replayed value lands on the restored list', async () => {
    await offlineDb.outbox.put(leftoverSpeed(1));
    answerWith(loopRow('a', { speed_ratio: 1 }));
    act(() => onlineManager.setOnline(false));
    const { restored, cached } = renderReplayWithEdit(loopRow('a', { speed_ratio: 1 }));
    await settle();
    // Read only after the restore: still claimable, so nothing has taken it yet.
    expect((await offlineDb.outbox.toArray()).map((entry) => entry.id)).toEqual(['left-speed']);

    act(() => restored());
    await waitFor(() => expect(cached()?.speed_ratio).toBe(0.8));
    act(() => onlineManager.setOnline(true));
    await waitFor(() => expect(loopUpdates()).toEqual([{ speed_ratio: 0.8 }]));
  });

  it('never sends an older replayed value after an edit the user made before it was read', async () => {
    await offlineDb.outbox.put(leftoverSpeed(Date.now() - 60_000));
    answerWith(loopRow('a', { speed_ratio: 1 }));
    act(() => onlineManager.setOnline(false));
    const { result, restored, cached } = renderReplayWithEdit(loopRow('a', { speed_ratio: 1 }));
    // The cache is in memory already (the song page), and the user saves a speed at once.
    act(() => restored([loopRow('a', { speed_ratio: 1 })]));
    act(() => result.current.mutate({ loopId: 'a', changes: { speed_ratio: 0.9 } }));
    await waitFor(() => expect(cached()?.speed_ratio).toBe(0.9));
    await waitFor(async () =>
      expect((await offlineDb.outbox.toArray()).map((entry) => entry.id)).not.toContain(
        'left-speed',
      ),
    );

    act(() => onlineManager.setOnline(true));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    await settle();
    expect(loopUpdates()).toEqual([{ speed_ratio: 0.9 }]);
    expect(cached()?.speed_ratio).toBe(0.9);
  });

  it('keeps the first queued time of a replayed edit that is left unsent again', async () => {
    await offlineDb.outbox.put(leftoverSpeed(5));
    act(() => onlineManager.setOnline(false));
    const { restored } = renderReplayWithEdit(loopRow('a'));
    act(() => restored());
    await settle();
    expect(await outboxEntries(USER)).toEqual([
      expect.objectContaining({ id: 'left-speed', queuedAt: 5 }),
    ]);
  });

  it('waits for the connection when the app starts offline', async () => {
    await offlineDb.outbox.bulkPut([entries[0]!]);
    queryResult.mockResolvedValue(ok(null));
    act(() => onlineManager.setOnline(false));
    renderHook(() => useOutboxReplay(), { wrapper: wrapperFor(testQueryClient()) });
    await settle();
    expect(sessionInserts()).toEqual([]);
    act(() => onlineManager.setOnline(true));
    await waitFor(() => expect(sessionInserts()).toEqual(['s-left']));
  });
});

describe('loop edits, round trips and lost answers', () => {
  const loop = loopRow('a', { speed_ratio: 1, name: 'Verse' });

  it('a speed typed as a BPM is kept on the device and sent at its exact ratio, after a reload too', async () => {
    answerWith(loop);
    const first = testQueryClient();
    first.setQueryData(loopKeys.forSong(USER, LOOP_SONG_ID), [loop]);
    const { result, unmount } = renderHook(() => useUpdateLoop(LOOP_SONG_ID), {
      wrapper: wrapperFor(first),
    });
    act(() => onlineManager.setOnline(false));
    act(() => result.current.mutate({ loopId: 'a', changes: { speed_ratio: 0.708333 } }));
    await waitFor(async () =>
      expect(await outboxEntries(USER)).toEqual([
        expect.objectContaining({ kind: 'loopEdit', changes: { speed_ratio: 0.708333 } }),
      ]),
    );
    // The page goes before the connection comes back; the next one replays what it left.
    // (This test's module is the same "page", which never replays its own entries, so the
    // entry is handed over as the next page would read it: the same data, from the database.)
    const [stored] = await offlineDb.outbox.toArray();
    unmount();
    first.clear();
    await offlineDb.outbox.clear();
    await offlineDb.outbox.put({ ...stored!, id: 'from-the-last-page' });
    act(() => onlineManager.setOnline(true));
    renderHook(() => useOutboxReplay(), { wrapper: wrapperFor(testQueryClient()) });

    await waitFor(() => expect(loopUpdates()).toEqual([{ speed_ratio: 0.708333 }]));
    await waitFor(async () => expect(await outboxEntries(USER)).toEqual([]));
  });

  it('an edit the server applied but whose answer was lost is sent again with the same values, and settles', async () => {
    answerWith(loop);
    const answer = queryResult.getMockImplementation()!;
    // The server takes it; the answer never arrives.
    queryResult.mockImplementationOnce(async (call) => {
      await answer(call);
      return dropped;
    });
    const queryClient = testQueryClient();
    queryClient.setQueryData(loopKeys.forSong(USER, LOOP_SONG_ID), [loop]);
    const { result } = renderHook(() => useUpdateLoop(LOOP_SONG_ID), {
      wrapper: wrapperFor(queryClient),
    });

    act(() => result.current.mutate({ loopId: 'a', changes: { speed_ratio: 0.8 } }));
    await waitFor(() => expect(result.current.isSuccess).toBe(true), { timeout: 3000 });
    expect(loopUpdates()).toEqual([{ speed_ratio: 0.8 }, { speed_ratio: 0.8 }]);
    expect(
      queryClient.getQueryData<Loop[]>(loopKeys.forSong(USER, LOOP_SONG_ID))?.[0],
    ).toMatchObject({ speed_ratio: 0.8, name: 'Verse' });
    await waitFor(async () => expect(await outboxEntries(USER)).toEqual([]));
  });
});

// Unit 20 Test (13.23, 14.6): the windows the Build note lists, through the hooks.
describe('queued writes while supabase-js has no session, window by window', () => {
  const permissionDenied: FakeResult = {
    data: null,
    error: { message: 'permission denied for table loops', code: '42501' },
  };
  const noSession = {
    data: { session: null },
    error: new AuthRetryableFetchError('Failed to fetch', 0),
  };
  const signedIn = () => ({ data: { session: fakeSession(USER) }, error: null });
  const storeSession = () =>
    localStorage.setItem(FAKE_AUTH_STORAGE_KEY, JSON.stringify(fakeSession(USER)));

  /** No session in memory, one stored, until `sessionBack()`. */
  function loseSession() {
    storeSession();
    let lost = true;
    fakeSupabase.auth.getSession.mockImplementation(async () => (lost ? noSession : signedIn()));
    return () => {
      lost = false;
    };
  }
  const asked = () => fakeSupabase.auth.getSession.mock.calls.length;
  const loopWrites = () =>
    queryResult.mock.calls
      .map(([call]) => call)
      .filter((call) => call.table === 'loops' && opArgs(call, 'update'))
      .map((call) => opArgs(call, 'update')?.[0] as Partial<Loop>);
  const playedWrites = () =>
    queryResult.mock.calls
      .map(([call]) => call)
      .filter((call) => call.table === 'songs' && opArgs(call, 'update'))
      .map((call) => (opArgs(call, 'update')?.[0] as { last_played_at: string }).last_played_at);
  const queuedIds = async () => (await outboxEntries(USER)).map((entry) => entry.id).sort();

  function renderLoopEdit(loop = loopRow('a', { speed_ratio: 1 })) {
    const queryClient = testQueryClient();
    queryClient.setQueryData(loopKeys.forSong(USER, LOOP_SONG_ID), [loop]);
    const view = renderHook(
      () => ({ edit: useUpdateLoop(LOOP_SONG_ID), unsent: useHasUnsentWrites(USER) }),
      { wrapper: wrapperFor(queryClient) },
    );
    const cached = () =>
      queryClient.getQueryData<Loop[]>(loopKeys.forSong(USER, LOOP_SONG_ID))?.[0];
    return { ...view, queryClient, cached };
  }

  it('keeps sign-out off for as long as a write is held back, and lets it go once the write has landed', async () => {
    answerWith(loopRow('a', { speed_ratio: 1 }));
    const sessionBack = loseSession();
    const { result, queryClient } = renderLoopEdit();
    act(() => result.current.edit.mutate({ loopId: 'a', changes: { speed_ratio: 0.5 } }));

    await waitFor(() => expect(result.current.edit.failureCount).toBe(1));
    // Between tries, not only during one: the mutation is pending, and its entry is stored.
    expect(hasUnsentWrites(queryClient, USER)).toBe(true);
    await waitFor(() => expect(result.current.unsent).toBe(true));
    expect(loopWrites()).toEqual([]);

    sessionBack();
    await waitFor(() => expect(result.current.edit.isSuccess).toBe(true), { timeout: 3000 });
    await waitFor(() => expect(result.current.unsent).toBe(false));
    expect(hasUnsentWrites(queryClient, USER)).toBe(false);
    expect(loopWrites()).toEqual([{ speed_ratio: 0.5 }]);
  });

  it('a second edit of the loop made while the first is held back waits behind it, and both land once, in order', async () => {
    answerWith(loopRow('a', { speed_ratio: 1 }));
    const sessionBack = loseSession();
    const { result, cached } = renderLoopEdit();
    act(() => result.current.edit.mutate({ loopId: 'a', changes: { speed_ratio: 0.9 } }));
    await waitFor(() => expect(asked()).toBe(1));
    act(() => result.current.edit.mutate({ loopId: 'a', changes: { speed_ratio: 0.8 } }));
    await waitFor(async () => expect(await queuedIds()).toHaveLength(2));
    await settle();
    // The second hasn't asked for a session of its own: it is behind the first in the queue.
    expect(asked()).toBe(1);
    expect(loopWrites()).toEqual([]);
    expect(cached()?.speed_ratio).toBe(0.8);

    sessionBack();
    await waitFor(() => expect(loopWrites()).toHaveLength(2), { timeout: 3000 });
    expect(loopWrites()).toEqual([{ speed_ratio: 0.9 }, { speed_ratio: 0.8 }]);
    await waitFor(async () => expect(await queuedIds()).toEqual([]));
    expect(cached()?.speed_ratio).toBe(0.8);
  });

  it('going offline while a write is held back pauses its retries, and it lands once when the connection and the session are back', async () => {
    queryResult.mockResolvedValue(ok(null));
    const sessionBack = loseSession();
    const { result } = renderHook(() => useLogSession(), {
      wrapper: wrapperFor(testQueryClient()),
    });
    act(() => result.current.mutate(record('s1')));
    await waitFor(() => expect(result.current.failureCount).toBe(1));

    act(() => onlineManager.setOnline(false));
    await waitFor(() => expect(result.current.isPaused).toBe(true), { timeout: 3000 });
    // Paused, it asks for nothing more and sends nothing.
    expect(asked()).toBe(1);
    expect(sessionInserts()).toEqual([]);
    expect(await queuedIds()).toEqual(['s1']);

    sessionBack();
    act(() => onlineManager.setOnline(true));
    await waitFor(() => expect(result.current.isSuccess).toBe(true), { timeout: 3000 });
    expect(sessionInserts()).toEqual(['s1']);
    await waitFor(async () => expect(await queuedIds()).toEqual([]));
  });

  it("a 42501 with a session in memory is still the server's refusal: the edit fails, rolls back and leaves the outbox", async () => {
    queryResult.mockResolvedValue(permissionDenied);
    const { result, cached } = renderLoopEdit();
    act(() => result.current.edit.mutate({ loopId: 'a', changes: { speed_ratio: 0.5 } }));

    await waitFor(() => expect(result.current.edit.isError).toBe(true));
    expect(result.current.edit.failureCount).toBe(1);
    expect(asked()).toBe(1);
    expect(loopWrites()).toEqual([{ speed_ratio: 0.5 }]);
    expect(cached()?.speed_ratio).toBe(1);
    await waitFor(async () => expect(await queuedIds()).toEqual([]));
    await settle();
    expect(loopWrites()).toHaveLength(1);
  });

  it('a 42501 with a session in memory fails a session log too, sent once', async () => {
    storeSession();
    queryResult.mockResolvedValue(permissionDenied);
    const { result } = renderHook(() => useLogSession(), {
      wrapper: wrapperFor(testQueryClient()),
    });
    act(() => result.current.mutate(record('s1')));
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(sessionInserts()).toEqual(['s1']);
    await waitFor(async () => expect(await queuedIds()).toEqual([]));
  });

  it('a sign-out the server forces while the write is asking for its session: sent, refused, rolled back, not held for ever', async () => {
    queryResult.mockResolvedValue(permissionDenied);
    storeSession();
    let answer!: (result: typeof noSession) => void;
    fakeSupabase.auth.getSession.mockReturnValueOnce(
      new Promise<typeof noSession>((resolve) => (answer = resolve)),
    );
    const { result, cached } = renderLoopEdit();
    act(() => result.current.edit.mutate({ loopId: 'a', changes: { speed_ratio: 0.5 } }));
    await waitFor(() => expect(asked()).toBe(1));
    await settle();
    expect(loopWrites()).toEqual([]);
    expect(cached()?.speed_ratio).toBe(0.5);

    // The refresh was refused: supabase-js empties its storage, then answers "no session".
    localStorage.removeItem(FAKE_AUTH_STORAGE_KEY);
    await act(async () =>
      answer({ data: { session: null }, error: new AuthRetryableFetchError('refused', 400) }),
    );

    await waitFor(() => expect(result.current.edit.isError).toBe(true));
    expect(loopWrites()).toEqual([{ speed_ratio: 0.5 }]);
    expect(cached()?.speed_ratio).toBe(1);
    await waitFor(async () => expect(await queuedIds()).toEqual([]));
  });

  describe('replayed from an earlier page', () => {
    const left: OutboxEntry[] = [
      { kind: 'session', id: 's-left', userId: USER, queuedAt: 1, record: record('s-left') },
      {
        kind: 'loopEdit',
        id: 'e-left',
        userId: USER,
        queuedAt: 2,
        songId: LOOP_SONG_ID,
        loopId: 'a',
        changes: { speed_ratio: 0.7 },
      },
      {
        kind: 'songPlayed',
        id: 'p-left',
        userId: USER,
        queuedAt: 3,
        songId: 'song-9',
        playedAt: '2026-11-26T09:00:00.000Z',
      },
    ];

    it('every kind of entry stays in the outbox while the session is missing, with nothing sent, and lands once each when it is back', async () => {
      await offlineDb.outbox.bulkPut(left);
      answerWith(loopRow('a'));
      const sessionBack = loseSession();
      const queryClient = testQueryClient();
      renderHook(() => useOutboxReplay(), {
        wrapper: wrapperFor(queryClient),
        reactStrictMode: true,
      });

      // Each entry's write has asked for a session and been held back.
      await waitFor(() => expect(asked()).toBe(3));
      await settle();
      expect(sessionInserts()).toEqual([]);
      expect(loopWrites()).toEqual([]);
      expect(playedWrites()).toEqual([]);
      expect(await queuedIds()).toEqual(['e-left', 'p-left', 's-left']);
      expect(hasUnsentWrites(queryClient, USER)).toBe(true);

      sessionBack();
      await waitFor(
        async () => {
          expect(sessionInserts()).toEqual(['s-left']);
          expect(loopWrites()).toEqual([{ speed_ratio: 0.7 }]);
          expect(playedWrites()).toEqual(['2026-11-26T09:00:00.000Z']);
          expect(await queuedIds()).toEqual([]);
        },
        { timeout: 3000 },
      );
      await settle();
      expect(sessionInserts()).toHaveLength(1);
      expect(loopWrites()).toHaveLength(1);
      expect(playedWrites()).toHaveLength(1);
    });

    it('a replayed edit the server refuses with 42501, session in memory, rolls back and leaves the outbox', async () => {
      await offlineDb.outbox.put(left[1]!);
      queryResult.mockImplementation(async (call: QueryCall) =>
        opArgs(call, 'update') ? permissionDenied : ok([loopRow('a', { speed_ratio: 1 })]),
      );
      const queryClient = testQueryClient();
      queryClient.setQueryData(loopKeys.forSong(USER, LOOP_SONG_ID), [
        loopRow('a', { speed_ratio: 1 }),
      ]);
      renderHook(() => useOutboxReplay(), { wrapper: wrapperFor(queryClient) });

      await waitFor(() => expect(loopWrites()).toEqual([{ speed_ratio: 0.7 }]));
      await waitFor(async () => expect(await queuedIds()).toEqual([]));
      await waitFor(() =>
        expect(
          queryClient.getQueryData<Loop[]>(loopKeys.forSong(USER, LOOP_SONG_ID))?.[0]?.speed_ratio,
        ).toBe(1),
      );
      await settle();
      expect(loopWrites()).toHaveLength(1);
    });
  });
});

describe('the outbox while an answered write is being taken out of it (14.6), through the hooks', () => {
  /** The next delete of an outbox row waits `where` the real delete until `release()`. */
  function holdNextDelete(where: 'before' | 'after') {
    const real = offlineDb.outbox.delete.bind(offlineDb.outbox);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const spy = vi.spyOn(offlineDb.outbox, 'delete').mockImplementationOnce(((id: string) =>
      (async () => {
        if (where === 'before') await gate;
        await real(id);
        if (where === 'after') await gate;
      })()) as never);
    return { spy, release };
  }
  afterEach(() => vi.restoreAllMocks());

  it('a replay mounted again (StrictMode) while the row is still being deleted sends nothing a second time', async () => {
    queryResult.mockResolvedValue(ok(null));
    const queryClient = testQueryClient();
    const { result } = renderHook(() => useLogSession(), { wrapper: wrapperFor(queryClient) });
    const held = holdNextDelete('before');
    act(() => result.current.mutate(record('s1')));
    // Answered: its removal has started, the row is still there.
    await waitFor(() => expect(held.spy).toHaveBeenCalledWith('s1'));
    expect((await outboxEntries(USER)).map((entry) => entry.id)).toEqual(['s1']);

    renderHook(() => useOutboxReplay(), {
      wrapper: wrapperFor(queryClient),
      reactStrictMode: true,
    });
    await settle();
    expect(sessionInserts()).toEqual(['s1']);

    held.release();
    await waitFor(async () => expect(await outboxEntries(USER)).toEqual([]));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    await settle();
    expect(sessionInserts()).toEqual(['s1']);
  });

  it('an answered write whose row could not be deleted is not sent again by a replay on this page', async () => {
    queryResult.mockResolvedValue(ok(null));
    const queryClient = testQueryClient();
    const { result } = renderHook(() => useLogSession(), { wrapper: wrapperFor(queryClient) });
    vi.spyOn(offlineDb.outbox, 'delete').mockRejectedValueOnce(new Error('quota'));
    act(() => result.current.mutate(record('s1')));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect((await outboxEntries(USER)).map((entry) => entry.id)).toEqual(['s1']);

    renderHook(() => useOutboxReplay(), {
      wrapper: wrapperFor(queryClient),
      reactStrictMode: true,
    });
    await settle();
    expect(sessionInserts()).toEqual(['s1']);
  });
});
