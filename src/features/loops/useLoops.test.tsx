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
  useLoopStatusRefusals,
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

  // Copilot review on #30: only invalidated, the deleted history stayed counted (and
  // persisted) whenever the refetch after the delete failed.
  it("a deleted loop's sessions leave the Stats cache at once, even when the refetch fails", async () => {
    const view = await renderLoaded([loopRow('a'), loopRow('b')]);
    const everyKey = sessionKeys.every('user-1');
    view.queryClient.setQueryData(everyKey, [
      { id: 's1', loop_id: 'a' },
      { id: 's2', loop_id: 'b' },
      { id: 's3', loop_id: 'a' },
    ]);
    // The delete answers; every read after it fails.
    queryResult.mockResolvedValueOnce(ok(null));
    queryResult.mockResolvedValue({ data: null, error: { message: 'boom', code: '500' } });

    act(() => view.result.current.remove.mutate('a'));
    await waitFor(() => expect(view.result.current.remove.isSuccess).toBe(true));

    expect(view.queryClient.getQueryData(everyKey)).toEqual([{ id: 's2', loop_id: 'b' }]);
    expect(view.queryClient.getQueryState(everyKey)?.isInvalidated).toBe(true);
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

// 20 batch 8 (13.21, 13.35c): a refused status change is a failed mutation the cache keeps.
// The screen hears it as it happens, a control can put it away, and so does leaving.
describe('refused status changes: dismissed, and heard by the screen', () => {
  /** What the screen has on show: the loops it draws, and whether it is itself drawn. */
  interface ScreenShows {
    loopIds: string[];
    isOnShow?: () => boolean;
  }
  function renderScreen({
    queryClient = testQueryClient(),
    strict = false,
    shows = { loopIds: ['a', 'b'] } as ScreenShows,
  } = {}) {
    queryClient.setQueryData<Loop[]>(loopKeys.forSong('user-1', SONG), [
      loopRow('a'),
      loopRow('b'),
    ]);
    const heard: [string, string][] = [];
    const hooks = renderHook(
      (shown: ScreenShows) => {
        useLoopStatusRefusals({
          ...shown,
          onRefused: (loopId, refused) => heard.push([loopId, refused]),
        });
        return {
          a: useSetLoopStatus(SONG, 'a'),
          b: useSetLoopStatus(SONG, 'b'),
          update: useUpdateLoop(SONG),
        };
      },
      {
        initialProps: shows,
        wrapper: wrapperFor(queryClient, signedInAs('user-1')),
        reactStrictMode: strict,
      },
    );
    /** The loop writes the cache holds as failed, by what they sent. */
    const failed = () =>
      queryClient
        .getMutationCache()
        .findAll({ status: 'error' })
        .map((mutation) => (mutation.state.variables as { changes: Partial<Loop> }).changes);
    return { ...hooks, queryClient, heard, failed };
  }
  /** Each write refused in turn, each list read answered. */
  const refuseWrites = () =>
    queryResult.mockImplementation(async (call) =>
      opArgs(call, 'update') ? fail('nope') : ok([loopRow('a'), loopRow('b')]),
    );

  it('dismissError puts the loop’s refusal away for each of its controls, and sends nothing', async () => {
    const view = renderScreen();
    refuseWrites();
    act(() => void view.result.current.a.setStatus('finished'));
    await waitFor(() => expect(view.result.current.a.error?.message).toBe('nope'));
    const sent = queryResult.mock.calls.length;

    act(() => view.result.current.a.dismissError());

    await waitFor(() => expect(view.result.current.a.error).toBeNull());
    expect(view.failed()).toEqual([]);
    await settle();
    expect(queryResult.mock.calls).toHaveLength(sent);
    // Nothing of the loop changed with it.
    expect(view.queryClient.getQueryData<Loop[]>(loopKeys.forSong('user-1', SONG))).toEqual([
      loopRow('a'),
      loopRow('b'),
    ]);
  });

  it('dismissError leaves another loop’s refusal, and a failed write of another kind', async () => {
    const view = renderScreen();
    refuseWrites();
    act(() => void view.result.current.a.setStatus('finished'));
    await waitFor(() => expect(view.result.current.a.error).not.toBeNull());
    act(() => void view.result.current.b.setStatus('finished'));
    await waitFor(() => expect(view.result.current.b.error).not.toBeNull());
    act(() => view.result.current.update.mutate({ loopId: 'a', changes: { speed_ratio: 0.9 } }));
    await waitFor(() => expect(view.failed()).toHaveLength(3));

    act(() => view.result.current.a.dismissError());

    await waitFor(() => expect(view.result.current.a.error).toBeNull());
    expect(view.result.current.b.error?.message).toBe('nope');
    expect(view.failed()).toEqual([{ status: 'finished' }, { speed_ratio: 0.9 }]);
  });

  it('dismissError never takes a status write that is still on its way', async () => {
    const view = renderScreen();
    const pending = deferred();
    queryResult.mockReturnValueOnce(pending.promise);
    queryResult.mockResolvedValue(ok([loopRow('a', { status: 'finished' }), loopRow('b')]));
    act(() => void view.result.current.a.setStatus('finished'));
    await waitFor(() => expect(view.result.current.a.isPending).toBe(true));

    act(() => view.result.current.a.dismissError());

    expect(view.result.current.a.isPending).toBe(true);
    await act(async () => pending.resolve(ok(loopRow('a', { status: 'finished' }))));
    await waitFor(() => expect(view.result.current.a.isPending).toBe(false));
    expect(
      view.queryClient.getQueryData<Loop[]>(loopKeys.forSong('user-1', SONG))?.[0]?.status,
    ).toBe('finished');
  });

  it.each([
    ['', false],
    [' (StrictMode: once, not twice)', true],
  ])('the screen hears a refusal, with the loop and what was asked%s', async (_, strict) => {
    const view = renderScreen({ strict });
    refuseWrites();
    act(() => void view.result.current.b.setStatus('finished'));
    await waitFor(() => expect(view.result.current.b.error).not.toBeNull());
    expect(view.heard).toEqual([['b', 'finished']]);
  });

  it('hears nothing for a status change that went through, or a refused write of another kind', async () => {
    const view = renderScreen();
    queryResult.mockResolvedValueOnce(ok(loopRow('a', { status: 'finished' })));
    queryResult.mockResolvedValue(ok([loopRow('a', { status: 'finished' }), loopRow('b')]));
    act(() => void view.result.current.a.setStatus('finished'));
    await waitFor(() => expect(view.result.current.a.isPending).toBe(false));

    refuseWrites();
    act(() => view.result.current.update.mutate({ loopId: 'b', changes: { speed_ratio: 0.9 } }));
    // The refused speed did fail, so the silence isn't a write that never settled.
    await waitFor(() => expect(view.failed()).toEqual([{ speed_ratio: 0.9 }]));
    expect(view.heard).toEqual([]);
  });

  it('leaving the screen puts every loop’s refusal away, and nothing else', async () => {
    const view = renderScreen();
    refuseWrites();
    act(() => void view.result.current.a.setStatus('finished'));
    await waitFor(() => expect(view.result.current.a.error).not.toBeNull());
    act(() => void view.result.current.b.setStatus('finished'));
    await waitFor(() => expect(view.result.current.b.error).not.toBeNull());
    act(() => view.result.current.update.mutate({ loopId: 'a', changes: { speed_ratio: 0.9 } }));
    await waitFor(() => expect(view.failed()).toHaveLength(3));

    view.unmount();

    await waitFor(() => expect(view.failed()).toEqual([{ speed_ratio: 0.9 }]));
  });

  // What the message says goes by what was asked, not by the list the loop is in: the
  // refusal can be drawn before the loop has moved back (20 batch 8, Build's known gap).
  it('reports what the refused change asked for, and nothing once it is dismissed', async () => {
    const view = renderScreen();
    expect(view.result.current.a.refused).toBeNull();
    refuseWrites();
    act(() => void view.result.current.a.setStatus('finished'));
    await waitFor(() => expect(view.result.current.a.refused).toBe('finished'));
    expect(view.result.current.b.refused).toBeNull();

    act(() => void view.result.current.a.setStatus('active'));
    await waitFor(() => expect(view.result.current.a.refused).toBe('active'));

    act(() => view.result.current.a.dismissError());
    await waitFor(() => expect(view.result.current.a.refused).toBeNull());
    expect(view.result.current.a.error).toBeNull();
  });

  /** Both loops' "Mark finished" refused, one after the other. */
  async function bothRefused(view: ReturnType<typeof renderScreen>) {
    refuseWrites();
    act(() => void view.result.current.a.setStatus('finished'));
    await waitFor(() => expect(view.result.current.a.error).not.toBeNull());
    act(() => void view.result.current.b.setStatus('finished'));
    await waitFor(() => expect(view.result.current.b.error).not.toBeNull());
  }

  // 20 batch 8, Review (Test's bug 1): a screen puts away what it showed, nothing more.
  it('leaving a screen that shows one loop’s status keeps another loop’s refusal for the screen that shows it', async () => {
    const view = renderScreen({ shows: { loopIds: ['a'] } });
    await bothRefused(view);
    // Heard for both, as before: only the putting away is the one loop's.
    expect(view.heard).toEqual([
      ['a', 'finished'],
      ['b', 'finished'],
    ]);

    view.unmount();

    await waitFor(() => expect(view.failed()).toEqual([{ status: 'finished' }]));
    await settle();
    expect(
      view.queryClient
        .getMutationCache()
        .findAll({ status: 'error' })
        .map((mutation) => (mutation.state.variables as { loopId: string }).loopId),
    ).toEqual(['b']);
  });

  it('leaving a screen that never had its refusals on show keeps them all', async () => {
    const view = renderScreen({ shows: { loopIds: [] } });
    await bothRefused(view);

    view.unmount();
    await settle();

    expect(view.failed()).toEqual([{ status: 'finished' }, { status: 'finished' }]);
  });

  it('a refusal that came while hidden and was then shown is put away on leaving', async () => {
    const view = renderScreen({ shows: { loopIds: [] } });
    await bothRefused(view);
    view.rerender({ loopIds: ['a', 'b'] });
    // Hidden again before leaving: it was seen, which is what counts.
    view.rerender({ loopIds: [] });

    view.unmount();

    await waitFor(() => expect(view.failed()).toEqual([]));
  });

  // Copilot on #41: "every loop's" is too many. A screen draws one song's loops, and the
  // cache holds the refusals of every song's.
  it('leaving a screen keeps the refusal of a loop it never drew (another song’s), which it could not have said', async () => {
    const queryClient = testQueryClient();
    // Song A's page: its loop's change is refused with no screen of song A up.
    const songA = renderHook(() => useSetLoopStatus('song-a', 'elsewhere'), {
      wrapper: wrapperFor(queryClient, signedInAs('user-1')),
    });
    queryClient.setQueryData<Loop[]>(loopKeys.forSong('user-1', 'song-a'), [loopRow('elsewhere')]);
    refuseWrites();
    act(() => void songA.result.current.setStatus('finished'));
    await waitFor(() => expect(songA.result.current.error).not.toBeNull());
    songA.unmount();

    // Song B's page, up and left again, with a refusal of its own that it did show.
    const view = renderScreen({ queryClient });
    act(() => void view.result.current.a.setStatus('finished'));
    await waitFor(() => expect(view.result.current.a.error).not.toBeNull());
    const refusedLoops = () =>
      queryClient
        .getMutationCache()
        .findAll({ status: 'error' })
        .map((mutation) => (mutation.state.variables as { loopId: string }).loopId);
    expect(refusedLoops()).toEqual(['elsewhere', 'a']);

    view.unmount();

    await waitFor(() => expect(refusedLoops()).toEqual(['elsewhere']));
    await settle();
    expect(refusedLoops()).toEqual(['elsewhere']);
  });

  it('a screen whose list has not loaded (no loops drawn) puts nothing away; once one is drawn, only that one’s', async () => {
    const view = renderScreen({ shows: { loopIds: [] } });
    await bothRefused(view);
    // Only loop a is drawn in the end: b's is still not this screen's to put away.
    view.rerender({ loopIds: ['a'] });

    view.unmount();

    await waitFor(() => expect(view.failed()).toHaveLength(1));
    expect(
      view.queryClient
        .getMutationCache()
        .findAll({ status: 'error' })
        .map((mutation) => (mutation.state.variables as { loopId: string }).loopId),
    ).toEqual(['b']);
  });

  // Copilot on #41: mounted is not drawn. The page can hide the screen that lists the loops
  // (the loop sheet under a recording) without the screen's own state saying so.
  it('a screen that lists the loops but is itself hidden when the refusal lands keeps it on leaving', async () => {
    const view = renderScreen({ shows: { loopIds: ['a', 'b'], isOnShow: () => false } });
    await bothRefused(view);

    view.unmount();
    await settle();

    expect(view.failed()).toEqual([{ status: 'finished' }, { status: 'finished' }]);
  });

  it('a refusal that landed with the screen hidden is put away once the screen has been drawn with it', async () => {
    let drawn = false;
    const shows = { loopIds: ['a', 'b'], isOnShow: () => drawn };
    const view = renderScreen({ shows });
    await bothRefused(view);
    // The page draws the screen again, which renders it; nothing of the screen's own changed.
    drawn = true;
    view.rerender({ ...shows });
    drawn = false;
    view.rerender({ ...shows });

    view.unmount();

    await waitFor(() => expect(view.failed()).toEqual([]));
  });

  it('a refusal from before the screen opened, on show as it opens, is put away on leaving (StrictMode too)', async () => {
    const queryClient = testQueryClient();
    const before = renderHook(() => useSetLoopStatus(SONG, 'a'), {
      wrapper: wrapperFor(queryClient, signedInAs('user-1')),
    });
    queryClient.setQueryData<Loop[]>(loopKeys.forSong('user-1', SONG), [loopRow('a')]);
    refuseWrites();
    act(() => void before.result.current.setStatus('finished'));
    await waitFor(() => expect(before.result.current.error).not.toBeNull());
    before.unmount();

    const view = renderScreen({ queryClient, strict: true });
    await settle();
    expect(view.failed()).toEqual([{ status: 'finished' }]);
    view.unmount();

    await waitFor(() => expect(view.failed()).toEqual([]));
  });

  it('a refusal from before the screen opened is still there under StrictMode, whose first clean-up is no leaving', async () => {
    const queryClient = testQueryClient();
    // Refused with no screen up to hear it or to put it away.
    const before = renderHook(() => useSetLoopStatus(SONG, 'a'), {
      wrapper: wrapperFor(queryClient, signedInAs('user-1')),
    });
    queryClient.setQueryData<Loop[]>(loopKeys.forSong('user-1', SONG), [loopRow('a')]);
    refuseWrites();
    act(() => void before.result.current.setStatus('finished'));
    await waitFor(() => expect(before.result.current.error).not.toBeNull());
    before.unmount();

    const view = renderScreen({ queryClient, strict: true });
    await settle();

    expect(view.result.current.a.error?.message).toBe('nope');
    // It was refused before the screen opened: not heard, so nothing takes focus for it.
    expect(view.heard).toEqual([]);
  });
});
