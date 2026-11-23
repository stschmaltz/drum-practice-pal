import { act, renderHook, waitFor } from '@testing-library/react';
import { opArgs, queryResult, resetFakeSupabase, type FakeResult } from '@/test/fakeSupabase';
import { signedInAs, testQueryClient, wrapperFor } from '@/test/render';
import type { Loop } from './loopForm';
import { loopKeys } from './loopKeys';
import { useCreateLoop, useDeleteLoop, useLoops, useUpdateLoop } from './useLoops';

vi.mock('@/lib/supabase', async () => (await import('@/test/fakeSupabase')).fakeSupabaseModule);

const SONG = 'song-1';

const loop = (id: string, overrides: Partial<Loop> = {}): Loop => ({
  id,
  song_id: SONG,
  name: `Loop ${id}`,
  start_bar: 5,
  end_bar: 8,
  speed_ratio: 1,
  target_ratio: null,
  status: 'active',
  last_practiced_at: null,
  created_at: '2026-11-20T10:00:00Z',
  ...overrides,
});

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
    queryResult.mockResolvedValueOnce(ok([loop('a'), loop('b')]));
    const { result } = renderLoopHooks('user-7', 'song-9');
    await waitFor(() => expect(result.current.loops.isSuccess).toBe(true));
    expect(result.current.loops.data).toEqual([loop('a'), loop('b')]);
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
    const view = await renderLoaded([loop('a')]);
    const insert = deferred();
    queryResult.mockReturnValueOnce(insert.promise);
    const saved = loop('new', { name: 'Chorus fill', start_bar: 9, end_bar: 12 });
    queryResult.mockResolvedValue(ok([loop('a'), saved]));

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
    queryResult.mockResolvedValue(ok(loop('new')));

    act(() => view.result.current.create.mutate(newLoop));
    await waitFor(() => expect(view.result.current.create.isSuccess).toBe(true));

    const insert = queryResult.mock.calls.map(([call]) => call).find((c) => opArgs(c, 'insert'));
    expect(opArgs(insert!, 'insert')).toEqual([{ ...newLoop, song_id: SONG, user_id: 'user-1' }]);
  });

  it('leaves the list alone when the insert fails', async () => {
    const view = await renderLoaded([loop('a')]);
    queryResult.mockResolvedValueOnce(fail('end_bar 20 is past the last bar'));
    queryResult.mockResolvedValue(ok([loop('a')]));

    act(() => view.result.current.create.mutate(newLoop));
    await waitFor(() => expect(view.result.current.create.isError).toBe(true));
    expect(view.cached()?.map((l) => l.id)).toEqual(['a']);
  });
});

describe('useUpdateLoop', () => {
  it('shows the edit at once, then the server row', async () => {
    const view = await renderLoaded([loop('a'), loop('b')]);
    const update = deferred();
    queryResult.mockReturnValueOnce(update.promise);
    const saved = loop('a', { speed_ratio: 0.9 });
    queryResult.mockResolvedValue(ok([saved, loop('b')]));

    act(() => view.result.current.update.mutate({ loopId: 'a', changes: { speed_ratio: 0.9 } }));
    await waitFor(() => expect(view.cached()?.[0]?.speed_ratio).toBe(0.9));
    expect(view.result.current.update.isPending).toBe(true);

    update.resolve(ok(saved));
    await waitFor(() => expect(view.result.current.update.isSuccess).toBe(true));
    expect(view.cached()).toEqual([saved, loop('b')]);
  });

  it('rolls back only the fields it sent when the save fails', async () => {
    const view = await renderLoaded([loop('a', { name: 'Old' }), loop('b')]);
    const update = deferred();
    queryResult.mockReturnValueOnce(update.promise);
    queryResult.mockResolvedValue(ok([loop('a', { name: 'Old', end_bar: 12 }), loop('b')]));

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
    const view = await renderLoaded([loop('a'), loop('b')]);
    const first = deferred();
    const second = deferred();
    queryResult.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    queryResult.mockResolvedValue(ok([loop('a', { name: 'A2' }), loop('b', { name: 'B2' })]));
    const selectsSoFar = () =>
      queryResult.mock.calls.filter(([call]) => !opArgs(call, 'update')).length;
    const before = selectsSoFar();

    act(() => view.result.current.update.mutate({ loopId: 'a', changes: { name: 'A2' } }));
    act(() => view.result.current.update.mutate({ loopId: 'b', changes: { name: 'B2' } }));
    await waitFor(() => expect(view.cached()?.map((l) => l.name)).toEqual(['A2', 'B2']));

    first.resolve(ok(loop('a', { name: 'A2' })));
    await waitFor(() => expect(view.cached()?.[0]?.name).toBe('A2'));
    // The second write's optimistic value is still there, and no list refetch ran over it.
    expect(view.cached()?.[1]?.name).toBe('B2');
    expect(selectsSoFar()).toBe(before);

    second.resolve(ok(loop('b', { name: 'B2' })));
    await waitFor(() => expect(selectsSoFar()).toBeGreaterThan(before));
  });
});

describe('useDeleteLoop', () => {
  it('keeps the loop listed until the server confirms, then drops it', async () => {
    const view = await renderLoaded([loop('a'), loop('b')]);
    const rowDelete = deferred();
    queryResult.mockReturnValueOnce(rowDelete.promise);
    queryResult.mockResolvedValue(ok([loop('b')]));

    act(() => view.result.current.remove.mutate('a'));
    await waitFor(() => expect(view.result.current.remove.isPending).toBe(true));
    expect(view.cached()?.map((l) => l.id)).toEqual(['a', 'b']);

    rowDelete.resolve(ok(null));
    await waitFor(() => expect(view.result.current.remove.isSuccess).toBe(true));
    expect(view.cached()?.map((l) => l.id)).toEqual(['b']);
  });

  it('keeps the loop when the delete fails', async () => {
    const view = await renderLoaded([loop('a')]);
    queryResult.mockResolvedValueOnce(fail('network'));
    queryResult.mockResolvedValue(ok([loop('a')]));

    act(() => view.result.current.remove.mutate('a'));
    await waitFor(() => expect(view.result.current.remove.isError).toBe(true));
    expect(view.result.current.remove.error?.message).toBe('network');
    expect(view.cached()?.map((l) => l.id)).toEqual(['a']);
  });
});
