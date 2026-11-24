import { act, renderHook, waitFor } from '@testing-library/react';
import { onlineManager } from '@tanstack/react-query';
import { loopKeys } from '@/features/loops/loopKeys';
import type { Loop } from '@/features/loops/loopForm';
import { useUpdateLoop } from '@/features/loops/useLoops';
import type { SessionRecord } from '@/features/practice/sessionTracker';
import { useLogSession } from '@/features/practice/useSessions';
import {
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
  const loop = loopRow('a', { speed_ratio: 1, target_ratio: 0.855556 });

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
    ).toMatchObject({ speed_ratio: 0.8, target_ratio: 0.855556 });
    await waitFor(async () => expect(await outboxEntries(USER)).toEqual([]));
  });
});
