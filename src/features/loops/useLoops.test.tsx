import { act, renderHook, waitFor } from '@testing-library/react';
import { opArgs, queryResult, resetFakeSupabase, type FakeResult } from '@/test/fakeSupabase';
import { LOOP_SONG_ID, loopRow } from '@/test/loopTable';
import { signedInAs, testQueryClient, wrapperFor } from '@/test/render';
import type { Loop } from './loopForm';
import { loopKeys } from './loopKeys';
import { useCreateLoop, useDeleteLoop, useLoops, useUpdateLoop } from './useLoops';

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
