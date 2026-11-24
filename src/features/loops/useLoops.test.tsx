import { act, renderHook, waitFor } from '@testing-library/react';
import { AuthApiError } from '@supabase/supabase-js';
import { focusManager, onlineManager } from '@tanstack/react-query';
import {
  fakeSupabase,
  opArgs,
  queryResult,
  resetFakeSupabase,
  type FakeResult,
} from '@/test/fakeSupabase';
import { LOOP_SONG_ID, loopRow } from '@/test/loopTable';
import { settle, signedInAs, testQueryClient, wrapperFor } from '@/test/render';
import { songKeys } from '@/features/library/useSongs';
import { sessionKeys } from '@/features/practice/sessionKeys';
import type { Loop } from './loopForm';
import { loopKeys } from './loopKeys';
import type { PracticeLoop } from './practiceList';
import {
  isStatusWriteOf,
  useCreateLoop,
  useDeleteLoop,
  useLoops,
  usePracticeLoops,
  useSetLoopStatus,
  useUpdateLoop,
} from './useLoops';

vi.mock('@/lib/supabase', async () => (await import('@/test/fakeSupabase')).fakeSupabaseModule);

const SONG = LOOP_SONG_ID;

const ok = (data: unknown): FakeResult => ({ data, error: null });
const fail = (message: string): FakeResult => ({ data: null, error: { message } });

function deferred() {
  let resolve!: (value: FakeResult) => void;
  const promise = new Promise<FakeResult>((r) => (resolve = r));
  return { promise, resolve };
}

function renderLoopHooks(userId = 'user-1', songId = SONG) {
  const queryClient = testQueryClient();
  const hooks = renderHook(
    () => ({
      loops: useLoops(songId),
      create: useCreateLoop(songId),
      update: useUpdateLoop(songId),
      remove: useDeleteLoop(songId),
    }),
    { wrapper: wrapperFor(queryClient, signedInAs(userId)) },
  );
  const cached = () => queryClient.getQueryData<Loop[]>(loopKeys.forSong(userId, songId));
  return { ...hooks, queryClient, cached };
}

async function renderLoaded(loops: Loop[]) {
  queryResult.mockResolvedValueOnce(ok(loops));
  const view = renderLoopHooks();
  await waitFor(() => expect(view.result.current.loops.isSuccess).toBe(true));
  return view;
}

const newLoop = {
  id: 'new',
  name: 'Chorus fill',
  start_bar: 9,
  end_bar: 12,
  speed_ratio: 0.85,
  target_ratio: null,
};

beforeEach(() => {
  resetFakeSupabase();
});

afterEach(() => {
  // Back to following the document, after a test that set focus by hand.
  focusManager.setFocused(undefined);
});

describe('loopKeys', () => {
  it('includes the user id and the song id', () => {
    expect(loopKeys.forSong('a', 's')).not.toEqual(loopKeys.forSong('b', 's'));
    expect(loopKeys.forSong('a', 's')).not.toEqual(loopKeys.forSong('a', 't'));
    expect(loopKeys.forSong('a', 's').slice(0, 2)).toEqual(loopKeys.forUser('a'));
  });
});

describe('useLoops', () => {
  it("loads the song's loops for the signed-in user", async () => {
    queryResult.mockResolvedValueOnce(ok([loopRow('a'), loopRow('b')]));
    const { result } = renderLoopHooks('user-7', 'song-9');
    await waitFor(() => expect(result.current.loops.isSuccess).toBe(true));
    expect(result.current.loops.data).toEqual([loopRow('a'), loopRow('b')]);
    const call = queryResult.mock.calls[0]![0];
    expect(call.ops.filter((op) => op.method === 'eq').map((op) => op.args)).toEqual([
      ['user_id', 'user-7'],
      ['song_id', 'song-9'],
    ]);
  });

  it('reports a failed load', async () => {
    queryResult.mockResolvedValueOnce(fail('offline'));
    const { result } = renderLoopHooks();
    await waitFor(() => expect(result.current.loops.isError).toBe(true));
    expect(result.current.loops.error?.message).toBe('offline');
  });
});

describe('useCreateLoop', () => {
  it('adds the saved row once the server has it, not before', async () => {
    const view = await renderLoaded([loopRow('a')]);
    const insert = deferred();
    queryResult.mockReturnValueOnce(insert.promise);
    const saved = loopRow('new', { name: 'Chorus fill', start_bar: 9, end_bar: 12 });
    queryResult.mockResolvedValue(ok([loopRow('a'), saved]));

    act(() => view.result.current.create.mutate(newLoop));
    await waitFor(() => expect(view.result.current.create.isPending).toBe(true));
    expect(view.cached()?.map((l) => l.id)).toEqual(['a']);

    insert.resolve(ok(saved));
    await waitFor(() => expect(view.result.current.create.isSuccess).toBe(true));
    expect(view.cached()?.map((l) => l.id)).toEqual(['a', 'new']);
    expect(view.result.current.create.data).toEqual(saved);
  });

  it('sends the caller’s id and the song, so the same variables never insert twice', async () => {
    const view = await renderLoaded([]);
    queryResult.mockResolvedValue(ok(loopRow('new')));

    act(() => view.result.current.create.mutate(newLoop));
    await waitFor(() => expect(view.result.current.create.isSuccess).toBe(true));

    const insert = queryResult.mock.calls.map(([call]) => call).find((c) => opArgs(c, 'insert'));
    expect(opArgs(insert!, 'insert')).toEqual([{ ...newLoop, song_id: SONG, user_id: 'user-1' }]);
  });

  it('leaves the list alone when the insert fails', async () => {
    const view = await renderLoaded([loopRow('a')]);
    queryResult.mockResolvedValueOnce(fail('end_bar 20 is past the last bar'));
    queryResult.mockResolvedValue(ok([loopRow('a')]));

    act(() => view.result.current.create.mutate(newLoop));
    await waitFor(() => expect(view.result.current.create.isError).toBe(true));
    expect(view.cached()?.map((l) => l.id)).toEqual(['a']);
  });
});

describe('useUpdateLoop', () => {
  it('shows the edit at once, then the server row', async () => {
    const view = await renderLoaded([loopRow('a'), loopRow('b')]);
    const update = deferred();
    queryResult.mockReturnValueOnce(update.promise);
    const saved = loopRow('a', { speed_ratio: 0.9 });
    queryResult.mockResolvedValue(ok([saved, loopRow('b')]));

    act(() => view.result.current.update.mutate({ loopId: 'a', changes: { speed_ratio: 0.9 } }));
    await waitFor(() => expect(view.cached()?.[0]?.speed_ratio).toBe(0.9));
    expect(view.result.current.update.isPending).toBe(true);

    update.resolve(ok(saved));
    await waitFor(() => expect(view.result.current.update.isSuccess).toBe(true));
    expect(view.cached()).toEqual([saved, loopRow('b')]);
  });

  it('rolls back only the fields it sent when the save fails', async () => {
    const view = await renderLoaded([loopRow('a', { name: 'Old' }), loopRow('b')]);
    const update = deferred();
    queryResult.mockReturnValueOnce(update.promise);
    queryResult.mockResolvedValue(ok([loopRow('a', { name: 'Old', end_bar: 12 }), loopRow('b')]));

    act(() => view.result.current.update.mutate({ loopId: 'a', changes: { name: 'New' } }));
    await waitFor(() => expect(view.cached()?.[0]?.name).toBe('New'));
    // Something else changed the same loop meanwhile; the rollback must keep it.
    view.queryClient.setQueryData<Loop[]>(loopKeys.forSong('user-1', SONG), (loops) =>
      loops?.map((l) => (l.id === 'a' ? { ...l, end_bar: 12 } : l)),
    );

    update.resolve(fail('permission denied'));
    await waitFor(() => expect(view.result.current.update.isError).toBe(true));
    expect(view.cached()?.[0]).toMatchObject({ name: 'Old', end_bar: 12 });
  });

  it('a token the server refuses is refreshed, and the edit sent again with the new one (Copilot review)', async () => {
    const view = await renderLoaded([loopRow('a'), loopRow('b')]);
    const saved = loopRow('a', { speed_ratio: 0.9 });
    queryResult.mockResolvedValueOnce({
      data: null,
      error: { message: 'JWSError JWSInvalidSignature', code: 'PGRST301' },
    });
    queryResult.mockResolvedValueOnce(ok(saved));
    queryResult.mockResolvedValue(ok([saved, loopRow('b')]));

    act(() => view.result.current.update.mutate({ loopId: 'a', changes: { speed_ratio: 0.9 } }));

    await waitFor(() => expect(view.result.current.update.isSuccess).toBe(true));
    expect(fakeSupabase.auth.refreshSession).toHaveBeenCalledTimes(1);
    expect(view.cached()?.[0]?.speed_ratio).toBe(0.9);
  });

  it('a token that can’t be refreshed fails the edit and rolls it back, rather than resending it for ever', async () => {
    const view = await renderLoaded([loopRow('a'), loopRow('b')]);
    fakeSupabase.auth.refreshSession.mockResolvedValue({
      data: { session: null, user: null },
      error: new AuthApiError('Invalid Refresh Token', 400, 'refresh_token_not_found'),
    });
    queryResult.mockResolvedValueOnce({
      data: null,
      error: { message: 'JWSError JWSInvalidSignature', code: 'PGRST301' },
    });
    queryResult.mockResolvedValue(ok([loopRow('a'), loopRow('b')]));

    act(() => view.result.current.update.mutate({ loopId: 'a', changes: { speed_ratio: 0.9 } }));

    await waitFor(() => expect(view.result.current.update.isError).toBe(true));
    expect(view.cached()?.[0]?.speed_ratio).toBe(loopRow('a').speed_ratio);
  });

  it('does not refetch while another loop write is still pending', async () => {
    const view = await renderLoaded([loopRow('a'), loopRow('b')]);
    const first = deferred();
    const second = deferred();
    queryResult.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    queryResult.mockResolvedValue(ok([loopRow('a', { name: 'A2' }), loopRow('b', { name: 'B2' })]));
    const selectsSoFar = () =>
      queryResult.mock.calls.filter(([call]) => !opArgs(call, 'update')).length;
    const before = selectsSoFar();

    act(() => view.result.current.update.mutate({ loopId: 'a', changes: { name: 'A2' } }));
    act(() => view.result.current.update.mutate({ loopId: 'b', changes: { name: 'B2' } }));
    await waitFor(() => expect(view.cached()?.map((l) => l.name)).toEqual(['A2', 'B2']));

    first.resolve(ok(loopRow('a', { name: 'A2' })));
    await waitFor(() => expect(view.cached()?.[0]?.name).toBe('A2'));
    // The second write's optimistic value is still there, and no list refetch ran over it.
    expect(view.cached()?.[1]?.name).toBe('B2');
    expect(selectsSoFar()).toBe(before);

    second.resolve(ok(loopRow('b', { name: 'B2' })));
    await waitFor(() => expect(selectsSoFar()).toBeGreaterThan(before));
  });

  // Bug hunt D1: a write waiting between retries is pending, not paused, and the list's
  // refetch on focus or reconnect brought the old row back over its optimistic value.
  it.each([
    [
      'the window regains focus',
      () => {
        focusManager.setFocused(false);
        focusManager.setFocused(true);
      },
    ],
    [
      'the connection comes back',
      () => {
        onlineManager.setOnline(false);
        onlineManager.setOnline(true);
      },
    ],
  ])(
    'does not refetch over a pending edit when %s, and reads the list once it settles',
    async (_name, trigger) => {
      const view = await renderLoaded([loopRow('a', { start_bar: 5, end_bar: 8 })]);
      const update = deferred();
      queryResult.mockReturnValueOnce(update.promise);
      queryResult.mockResolvedValue(ok([loopRow('a', { start_bar: 5, end_bar: 8 })]));
      const selectsSoFar = () =>
        queryResult.mock.calls.filter(([call]) => !opArgs(call, 'update')).length;
      const before = selectsSoFar();

      act(() =>
        view.result.current.update.mutate({ loopId: 'a', changes: { start_bar: 9, end_bar: 12 } }),
      );
      await waitFor(() => expect(view.cached()?.[0]?.start_bar).toBe(9));
      act(trigger);
      await settle();

      expect(selectsSoFar()).toBe(before);
      expect(view.cached()?.[0]).toMatchObject({ start_bar: 9, end_bar: 12 });

      queryResult.mockResolvedValue(ok([loopRow('a', { start_bar: 9, end_bar: 12 })]));
      update.resolve(ok(loopRow('a', { start_bar: 9, end_bar: 12 })));
      await waitFor(() => expect(selectsSoFar()).toBeGreaterThan(before));
    },
  );
});

describe('useDeleteLoop', () => {
  it('keeps the loop listed until the server confirms, then drops it', async () => {
    const view = await renderLoaded([loopRow('a'), loopRow('b')]);
    const rowDelete = deferred();
    queryResult.mockReturnValueOnce(rowDelete.promise);
    queryResult.mockResolvedValue(ok([loopRow('b')]));

    act(() => view.result.current.remove.mutate('a'));
    await waitFor(() => expect(view.result.current.remove.isPending).toBe(true));
    expect(view.cached()?.map((l) => l.id)).toEqual(['a', 'b']);

    rowDelete.resolve(ok(null));
    await waitFor(() => expect(view.result.current.remove.isSuccess).toBe(true));
    expect(view.cached()?.map((l) => l.id)).toEqual(['b']);
  });

  it('keeps the loop when the delete fails', async () => {
    const view = await renderLoaded([loopRow('a')]);
    queryResult.mockResolvedValueOnce(fail('network'));
    queryResult.mockResolvedValue(ok([loopRow('a')]));

    act(() => view.result.current.remove.mutate('a'));
    await waitFor(() => expect(view.result.current.remove.isError).toBe(true));
    expect(view.result.current.remove.error?.message).toBe('network');
    expect(view.cached()?.map((l) => l.id)).toEqual(['a']);
  });
});

// Added by the Unit 08 Test stage: writes of different kinds in flight together.
describe('loop writes alongside each other', () => {
  const listReads = () =>
    queryResult.mock.calls.filter(
      ([call]) => !opArgs(call, 'update') && !opArgs(call, 'insert') && !opArgs(call, 'delete'),
    ).length;

  it('create, update and delete share one mutation key per user', async () => {
    const view = await renderLoaded([loopRow('a'), loopRow('b')]);
    const held = [deferred(), deferred(), deferred()];
    for (const each of held) queryResult.mockReturnValueOnce(each.promise);
    queryResult.mockResolvedValue(ok([loopRow('a')]));
    const pending = (userId: string) =>
      view.queryClient.isMutating({ mutationKey: loopKeys.writes(userId) });

    act(() => view.result.current.create.mutate(newLoop));
    act(() => view.result.current.update.mutate({ loopId: 'a', changes: { name: 'A2' } }));
    act(() => view.result.current.remove.mutate('b'));

    await waitFor(() => expect(pending('user-1')).toBe(3));
    // Another account's writes are another key.
    expect(pending('user-2')).toBe(0);

    held[0]!.resolve(ok(loopRow('new')));
    held[1]!.resolve(ok(loopRow('a', { name: 'A2' })));
    held[2]!.resolve(ok(null));
    await waitFor(() => expect(pending('user-1')).toBe(0));
  });

  it('a create that settles while an edit is pending does not refetch over the edit', async () => {
    const view = await renderLoaded([loopRow('a')]);
    const insert = deferred();
    const update = deferred();
    queryResult.mockImplementation((call) => {
      if (opArgs(call, 'insert')) return insert.promise;
      if (opArgs(call, 'update')) return update.promise;
      // The server hasn't seen the rename yet.
      return Promise.resolve(ok([loopRow('a'), loopRow('new')]));
    });
    const before = listReads();

    act(() => view.result.current.create.mutate(newLoop));
    act(() => view.result.current.update.mutate({ loopId: 'a', changes: { name: 'A2' } }));
    await waitFor(() => expect(view.cached()?.[0]?.name).toBe('A2'));

    insert.resolve(ok(loopRow('new')));
    await waitFor(() => expect(view.cached()?.map((l) => l.id)).toEqual(['a', 'new']));
    expect(view.cached()?.[0]?.name).toBe('A2');
    expect(listReads()).toBe(before);

    update.resolve(ok(loopRow('a', { name: 'A2' })));
    // Idle now: one refetch brings the list in line with the server.
    await waitFor(() => expect(listReads()).toBe(before + 1));
  });

  it('a failed edit rolls back only its own loop, keeping another loop’s pending edit', async () => {
    const view = await renderLoaded([loopRow('a', { name: 'A' }), loopRow('b', { name: 'B' })]);
    const first = deferred();
    const second = deferred();
    queryResult.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    queryResult.mockResolvedValue(ok([loopRow('a', { name: 'A' }), loopRow('b', { name: 'B2' })]));

    act(() => view.result.current.update.mutate({ loopId: 'a', changes: { name: 'A2' } }));
    act(() => view.result.current.update.mutate({ loopId: 'b', changes: { name: 'B2' } }));
    await waitFor(() => expect(view.cached()?.map((l) => l.name)).toEqual(['A2', 'B2']));

    first.resolve(fail('permission denied'));
    await waitFor(() => expect(view.cached()?.[0]?.name).toBe('A'));
    expect(view.cached()?.[1]?.name).toBe('B2');

    second.resolve(ok(loopRow('b', { name: 'B2' })));
    await waitFor(() => expect(view.result.current.update.isSuccess).toBe(true));
  });

  it('a saved edit leaves alone the fields of another edit of the same loop that is still pending', async () => {
    const view = await renderLoaded([loopRow('a', { start_bar: 5, end_bar: 8, speed_ratio: 1 })]);
    const speed = deferred();
    const bars = deferred();
    queryResult.mockReturnValueOnce(speed.promise).mockReturnValueOnce(bars.promise);
    const final = loopRow('a', { start_bar: 9, end_bar: 12, speed_ratio: 0.9 });
    queryResult.mockResolvedValue(ok([final]));

    // "Save speed", then the edit form's new range before the speed's answer is back.
    act(() => view.result.current.update.mutate({ loopId: 'a', changes: { speed_ratio: 0.9 } }));
    act(() =>
      view.result.current.update.mutate({ loopId: 'a', changes: { start_bar: 9, end_bar: 12 } }),
    );
    await waitFor(() =>
      expect(view.cached()?.[0]).toMatchObject({ start_bar: 9, end_bar: 12, speed_ratio: 0.9 }),
    );
    const seen: Loop[] = [];
    const stop = view.queryClient.getQueryCache().subscribe(() => {
      const loop = view.cached()?.[0];
      if (loop) seen.push(loop);
    });

    // The server answered the speed before it had the range: its row has the old bars.
    speed.resolve(ok(loopRow('a', { start_bar: 5, end_bar: 8, speed_ratio: 0.9 })));
    await waitFor(() => expect(view.queryClient.isMutating()).toBe(1));
    bars.resolve(ok(final));
    await waitFor(() => expect(view.queryClient.isMutating()).toBe(0));
    stop();

    expect(view.cached()).toEqual([final]);
    // Never back on the old bars on the way: the playing loop's range follows this cache.
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.filter((loop) => loop.start_bar !== 9 || loop.end_bar !== 12)).toEqual([]);
  });

  it('a saved edit takes the whole server row once no other write is pending', async () => {
    const view = await renderLoaded([loopRow('a', { name: 'Old' })]);
    // Another device renamed it; the server's row after this save says so.
    const saved = loopRow('a', { name: 'Renamed elsewhere', speed_ratio: 0.9 });
    const update = deferred();
    queryResult.mockReturnValueOnce(update.promise);
    // The refetch that follows never lands, so only onSuccess can have set the name.
    queryResult.mockReturnValue(new Promise<FakeResult>(() => {}));

    act(() => view.result.current.update.mutate({ loopId: 'a', changes: { speed_ratio: 0.9 } }));
    update.resolve(ok(saved));
    await waitFor(() => expect(view.cached()).toEqual([saved]));
  });

  it('a failed edit does not bring back a loop deleted while it was pending', async () => {
    const view = await renderLoaded([loopRow('a'), loopRow('b')]);
    const update = deferred();
    queryResult.mockImplementation((call) => {
      if (opArgs(call, 'update')) return update.promise;
      if (opArgs(call, 'delete')) return Promise.resolve(ok(null));
      return Promise.resolve(ok([loopRow('b')]));
    });

    act(() => view.result.current.update.mutate({ loopId: 'a', changes: { speed_ratio: 0.5 } }));
    await waitFor(() => expect(view.cached()?.[0]?.speed_ratio).toBe(0.5));
    act(() => view.result.current.remove.mutate('a'));
    await waitFor(() => expect(view.cached()?.map((l) => l.id)).toEqual(['b']));

    update.resolve(fail('gone'));
    await waitFor(() => expect(view.result.current.update.isError).toBe(true));
    expect(view.cached()?.map((l) => l.id)).toEqual(['b']);
  });

  it('a failed edit keeps a loop created while it was pending', async () => {
    const view = await renderLoaded([loopRow('a')]);
    const update = deferred();
    queryResult.mockImplementation((call) => {
      if (opArgs(call, 'update')) return update.promise;
      if (opArgs(call, 'insert')) return Promise.resolve(ok(loopRow('new')));
      return Promise.resolve(ok([loopRow('a'), loopRow('new')]));
    });

    act(() => view.result.current.update.mutate({ loopId: 'a', changes: { end_bar: 12 } }));
    await waitFor(() => expect(view.cached()?.[0]?.end_bar).toBe(12));
    act(() => view.result.current.create.mutate(newLoop));
    await waitFor(() => expect(view.cached()?.map((l) => l.id)).toEqual(['a', 'new']));

    update.resolve(fail('end_bar 12 is past the last bar'));
    await waitFor(() => expect(view.result.current.update.isError).toBe(true));
    expect(view.cached()).toEqual([loopRow('a'), loopRow('new')]);
  });

  it('the rollback leaves a field alone once something newer has changed it', async () => {
    const view = await renderLoaded([loopRow('a', { speed_ratio: 0.8 })]);
    const update = deferred();
    queryResult.mockReturnValueOnce(update.promise);
    queryResult.mockResolvedValue(ok([loopRow('a', { speed_ratio: 0.95 })]));

    act(() => view.result.current.update.mutate({ loopId: 'a', changes: { speed_ratio: 0.9 } }));
    await waitFor(() => expect(view.cached()?.[0]?.speed_ratio).toBe(0.9));
    // Saved from another device and refetched meanwhile.
    view.queryClient.setQueryData<Loop[]>(loopKeys.forSong('user-1', SONG), [
      loopRow('a', { speed_ratio: 0.95 }),
    ]);

    update.resolve(fail('network'));
    await waitFor(() => expect(view.result.current.update.isError).toBe(true));
    expect(view.cached()?.[0]?.speed_ratio).toBe(0.95);
  });

  it('an edit of a loop that is not in the list makes nothing up', async () => {
    const view = await renderLoaded([loopRow('a')]);
    queryResult.mockResolvedValueOnce(fail('no rows'));
    queryResult.mockResolvedValue(ok([loopRow('a')]));

    act(() => view.result.current.update.mutate({ loopId: 'ghost', changes: { name: 'Boo' } }));
    await waitFor(() => expect(view.result.current.update.isError).toBe(true));
    expect(view.cached()).toEqual([loopRow('a')]);
  });

  it('a saved row replaces a loop of the same id rather than listing it twice', async () => {
    const view = await renderLoaded([loopRow('new', { name: 'First answer' })]);
    queryResult.mockResolvedValueOnce(ok(loopRow('new', { name: 'Chorus fill' })));
    queryResult.mockResolvedValue(ok([loopRow('new', { name: 'Chorus fill' })]));

    // The same variables sent again (a retry after a lost response).
    act(() => view.result.current.create.mutate(newLoop));
    await waitFor(() => expect(view.result.current.create.isSuccess).toBe(true));
    expect(view.cached()?.map((l) => l.name)).toEqual(['Chorus fill']);
  });

  it("one song's writes leave another song's list as it is, and mark it for a refetch", async () => {
    const queryClient = testQueryClient();
    const otherKey = loopKeys.forSong('user-1', 'song-2');
    queryClient.setQueryData<Loop[]>(otherKey, [loopRow('z', { song_id: 'song-2' })]);
    queryResult.mockResolvedValueOnce(ok([loopRow('a')]));
    const { result } = renderHook(() => ({ loops: useLoops(SONG), remove: useDeleteLoop(SONG) }), {
      wrapper: wrapperFor(queryClient, signedInAs('user-1')),
    });
    await waitFor(() => expect(result.current.loops.isSuccess).toBe(true));
    queryResult.mockResolvedValueOnce(ok(null));
    queryResult.mockResolvedValue(ok([]));

    act(() => result.current.remove.mutate('a'));
    await waitFor(() => expect(result.current.remove.isSuccess).toBe(true));

    expect(queryClient.getQueryData<Loop[]>(otherKey)?.map((l) => l.id)).toEqual(['z']);
    // Under loopKeys.forUser, so the same invalidation marks it stale.
    await waitFor(() => expect(queryClient.getQueryState(otherKey)?.isInvalidated).toBe(true));
  });
});

const withSong = (loop: Loop): PracticeLoop => ({
  ...loop,
  song: { title: 'Groove 120', artist: 'Fixture Band' },
});

describe('the home page list (usePracticeLoops)', () => {
  it("reads every loop with its song's name under the user's loops key", async () => {
    queryResult.mockResolvedValueOnce(ok([withSong(loopRow('a'))]));
    const queryClient = testQueryClient();
    const { result } = renderHook(() => usePracticeLoops(), {
      wrapper: wrapperFor(queryClient, signedInAs('user-1')),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual([withSong(loopRow('a'))]);
    const key = loopKeys.practice('user-1');
    expect(key.slice(0, 2)).toEqual([...loopKeys.forUser('user-1')]);
    expect(queryClient.getQueryData(key)).toEqual([withSong(loopRow('a'))]);
  });

  it('an edit shows in the home page list too, keeps the song, and rolls back there on failure', async () => {
    const view = await renderLoaded([loopRow('a')]);
    const practiceKey = loopKeys.practice('user-1');
    view.queryClient.setQueryData<PracticeLoop[]>(practiceKey, [withSong(loopRow('a'))]);
    const pending = deferred();
    queryResult.mockReturnValueOnce(pending.promise);

    act(() => view.result.current.update.mutate({ loopId: 'a', changes: { status: 'finished' } }));

    await waitFor(() =>
      expect(view.queryClient.getQueryData<PracticeLoop[]>(practiceKey)?.[0]).toMatchObject({
        status: 'finished',
        song: { title: 'Groove 120' },
      }),
    );
    expect(view.cached()?.[0]?.status).toBe('finished');

    queryResult.mockResolvedValue(ok([loopRow('a')]));
    await act(async () => pending.resolve(fail('nope')));
    await waitFor(() => expect(view.result.current.update.isError).toBe(true));
    expect(view.queryClient.getQueryData<PracticeLoop[]>(practiceKey)?.[0]?.status).toBe('active');
  });

  it('an edit from the home page alone, with no song list cached, is optimistic and rolls back', async () => {
    const queryClient = testQueryClient();
    const practiceKey = loopKeys.practice('user-1');
    queryClient.setQueryData<PracticeLoop[]>(practiceKey, [withSong(loopRow('a'))]);
    const { result } = renderHook(() => useUpdateLoop(SONG), {
      wrapper: wrapperFor(queryClient, signedInAs('user-1')),
    });
    const pending = deferred();
    queryResult.mockReturnValueOnce(pending.promise);
    queryResult.mockResolvedValue(ok([withSong(loopRow('a'))]));

    act(() => result.current.mutate({ loopId: 'a', changes: { status: 'finished' } }));
    await waitFor(() =>
      expect(queryClient.getQueryData<PracticeLoop[]>(practiceKey)?.[0]?.status).toBe('finished'),
    );

    await act(async () => pending.resolve(fail('nope')));
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(queryClient.getQueryData<PracticeLoop[]>(practiceKey)?.[0]?.status).toBe('active');
    // Never a song list made up from the home page's rows.
    expect(queryClient.getQueryData(loopKeys.forSong('user-1', SONG))).toBeUndefined();
  });

  it("takes the server's row on success, finished_at included", async () => {
    const view = await renderLoaded([loopRow('a')]);
    const practiceKey = loopKeys.practice('user-1');
    view.queryClient.setQueryData<PracticeLoop[]>(practiceKey, [withSong(loopRow('a'))]);
    const saved = loopRow('a', { status: 'finished', finished_at: '2026-11-23T18:00:00Z' });
    queryResult.mockResolvedValueOnce(ok(saved));
    queryResult.mockResolvedValue(ok([saved]));

    act(() => view.result.current.update.mutate({ loopId: 'a', changes: { status: 'finished' } }));
    await waitFor(() => expect(view.result.current.update.isSuccess).toBe(true));

    expect(view.queryClient.getQueryData<PracticeLoop[]>(practiceKey)?.[0]).toEqual(
      withSong(saved),
    );
    expect(view.cached()?.[0]).toEqual(saved);
  });

  it("a deleted loop leaves the home page list, and its history's cache goes with it", async () => {
    const view = await renderLoaded([loopRow('a'), loopRow('b')]);
    const practiceKey = loopKeys.practice('user-1');
    view.queryClient.setQueryData<PracticeLoop[]>(practiceKey, [
      withSong(loopRow('a')),
      withSong(loopRow('b')),
    ]);
    view.queryClient.setQueryData(sessionKeys.forLoop('user-1', 'a'), []);
    view.queryClient.setQueryData(sessionKeys.forLoop('user-1', 'b'), []);
    queryResult.mockResolvedValueOnce(ok(null));
    queryResult.mockResolvedValue(ok([loopRow('b')]));

    act(() => view.result.current.remove.mutate('a'));
    await waitFor(() => expect(view.result.current.remove.isSuccess).toBe(true));

    expect(
      view.queryClient.getQueryData<PracticeLoop[]>(practiceKey)?.map((loop) => loop.id),
    ).toEqual(['b']);
    expect(view.queryClient.getQueryData(sessionKeys.forLoop('user-1', 'a'))).toBeUndefined();
    expect(view.queryClient.getQueryData(sessionKeys.forLoop('user-1', 'b'))).toEqual([]);
  });
});

describe('a new loop and the home page list', () => {
  const practiceKey = loopKeys.practice('user-1');
  const saved = loopRow('new', { name: 'Chorus fill', start_bar: 9, end_bar: 12 });

  async function createWith({ songCached }: { songCached: boolean }) {
    const view = await renderLoaded([loopRow('a')]);
    view.queryClient.setQueryData<PracticeLoop[]>(practiceKey, [withSong(loopRow('a'))]);
    if (songCached) {
      view.queryClient.setQueryData(songKeys.detail('user-1', SONG), {
        id: SONG,
        title: 'Groove 120',
        artist: 'Fixture Band',
      });
    }
    // The refetch after the insert never lands: what the cache holds is the mutation's doing.
    queryResult.mockResolvedValueOnce(ok(saved));
    queryResult.mockReturnValue(new Promise<FakeResult>(() => {}));
    act(() => view.result.current.create.mutate(newLoop));
    await waitFor(() => expect(view.cached()?.map((loop) => loop.id)).toEqual(['a', 'new']));
    return view;
  }

  it("joins it with its song's name, so the home page doesn't open on a list without it", async () => {
    const view = await createWith({ songCached: true });

    expect(view.queryClient.getQueryData<PracticeLoop[]>(practiceKey)).toEqual([
      withSong(loopRow('a')),
      withSong(saved),
    ]);
  });

  it('is left to the refetch when the song is not cached: never a row without its song', async () => {
    const view = await createWith({ songCached: false });

    expect(view.queryClient.getQueryData<PracticeLoop[]>(practiceKey)).toEqual([
      withSong(loopRow('a')),
    ]);
  });

  it('makes no home page list when none is cached', async () => {
    const view = await renderLoaded([]);
    view.queryClient.setQueryData(songKeys.detail('user-1', SONG), {
      id: SONG,
      title: 'Groove 120',
      artist: 'Fixture Band',
    });
    queryResult.mockResolvedValueOnce(ok(saved));
    queryResult.mockResolvedValue(ok([saved]));

    act(() => view.result.current.create.mutate(newLoop));
    await waitFor(() => expect(view.result.current.create.isSuccess).toBe(true));

    expect(view.queryClient.getQueryData(practiceKey)).toBeUndefined();
  });
});

describe('isStatusWriteOf', () => {
  it.each([
    [{ loopId: 'a', changes: { status: 'finished' } }, true],
    [{ loopId: 'a', changes: { status: 'active', name: 'x' } }, true],
    [{ loopId: 'b', changes: { status: 'finished' } }, false],
    [{ loopId: 'a', changes: { speed_ratio: 1 } }, false],
    [{ loopId: 'a' }, false],
    ['a', false],
    [null, false],
    [undefined, false],
  ])('%j for loop a: %s', (variables, expected) => {
    expect(isStatusWriteOf(variables, 'a')).toBe(expected);
  });
});

describe('useSetLoopStatus', () => {
  function renderStatus(queryClient = testQueryClient()) {
    queryClient.setQueryData<Loop[]>(loopKeys.forSong('user-1', SONG), [
      loopRow('a'),
      loopRow('b'),
    ]);
    // Two controls for loop a (the list's button and the prompt's), and one for loop b.
    return renderHook(
      () => ({
        first: useSetLoopStatus(SONG, 'a'),
        second: useSetLoopStatus(SONG, 'a'),
        other: useSetLoopStatus(SONG, 'b'),
        update: useUpdateLoop(SONG),
      }),
      { wrapper: wrapperFor(queryClient, signedInAs('user-1')) },
    );
  }
  const statusWrites = () =>
    queryResult.mock.calls
      .map(([call]) => opArgs(call, 'update')?.[0] as Partial<Loop> | undefined)
      .filter((changes) => changes !== undefined);

  it('sends the status alone', async () => {
    const { result } = renderStatus();
    queryResult.mockResolvedValueOnce(ok(loopRow('a', { status: 'finished' })));
    queryResult.mockResolvedValue(ok([]));

    act(() => result.current.first.setStatus('finished'));

    await waitFor(() => expect(statusWrites()).toEqual([{ status: 'finished' }]));
  });

  it('is pending for every control of that loop, and ignores a press on any of them meanwhile', async () => {
    const { result } = renderStatus();
    const pending = deferred();
    queryResult.mockReturnValueOnce(pending.promise);
    queryResult.mockResolvedValue(ok([]));

    act(() => result.current.first.setStatus('finished'));
    await waitFor(() => expect(result.current.second.isPending).toBe(true));
    expect(result.current.first.isPending).toBe(true);
    expect(result.current.other.isPending).toBe(false);

    // The other control now reads "Reopen": a press would race the finish to the server.
    act(() => result.current.second.setStatus('active'));
    act(() => result.current.first.setStatus('active'));
    expect(statusWrites()).toEqual([{ status: 'finished' }]);

    await act(async () => pending.resolve(ok(loopRow('a', { status: 'finished' }))));
    await waitFor(() => expect(result.current.second.isPending).toBe(false));
    act(() => result.current.second.setStatus('active'));
    await waitFor(() => expect(statusWrites()).toHaveLength(2));
  });

  it('is not locked by another kind of write to the same loop, and goes after it', async () => {
    const { result } = renderStatus();
    const speedWrite = deferred();
    queryResult.mockReturnValueOnce(speedWrite.promise);
    queryResult.mockResolvedValue(ok(loopRow('a', { status: 'finished' })));

    act(() => result.current.update.mutate({ loopId: 'a', changes: { speed_ratio: 0.9 } }));
    await waitFor(() => expect(result.current.update.isPending).toBe(true));

    expect(result.current.first.isPending).toBe(false);
    let sent = false;
    act(() => {
      sent = result.current.first.setStatus('finished');
    });
    expect(sent).toBe(true);
    await waitFor(() => expect(result.current.first.isPending).toBe(true));
    // Loop edits go one at a time (their scope), so the finish waits for the speed's answer.
    await settle();
    expect(statusWrites()).toEqual([{ speed_ratio: 0.9 }]);

    await act(async () => speedWrite.resolve(ok(loopRow('a', { speed_ratio: 0.9 }))));
    await waitFor(() =>
      expect(statusWrites()).toEqual([{ speed_ratio: 0.9 }, { status: 'finished' }]),
    );
  });

  it('reports a failure on every control of that loop, until its next status write', async () => {
    const { result } = renderStatus();
    queryResult.mockResolvedValueOnce(fail('nope'));
    queryResult.mockResolvedValue(ok([loopRow('a'), loopRow('b')]));

    act(() => result.current.first.setStatus('finished'));

    await waitFor(() => expect(result.current.first.error?.message).toBe('nope'));
    // The pressed control may have unmounted with the optimistic move; another one says it.
    expect(result.current.second.error?.message).toBe('nope');
    expect(result.current.other.error).toBeNull();

    queryResult.mockResolvedValueOnce(ok(loopRow('a', { status: 'finished' })));
    act(() => result.current.second.setStatus('finished'));
    await waitFor(() => expect(result.current.first.error).toBeNull());
  });

  it('a control mounted after the failure still reports it', async () => {
    const queryClient = testQueryClient();
    const first = renderStatus(queryClient);
    queryResult.mockResolvedValueOnce(fail('nope'));
    queryResult.mockResolvedValue(ok([loopRow('a'), loopRow('b')]));
    act(() => first.result.current.first.setStatus('finished'));
    await waitFor(() => expect(first.result.current.first.error?.message).toBe('nope'));
    first.unmount();

    const later = renderHook(() => useSetLoopStatus(SONG, 'a'), {
      wrapper: wrapperFor(queryClient, signedInAs('user-1')),
    });

    expect(later.result.current.error?.message).toBe('nope');
    expect(later.result.current.isPending).toBe(false);
  });
});
