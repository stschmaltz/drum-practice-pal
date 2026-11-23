import { act, renderHook, waitFor } from '@testing-library/react';
import {
  opArgs,
  queryResult,
  resetFakeSupabase,
  storageResult,
  type FakeResult,
} from '@/test/fakeSupabase';
import { loopKeys } from '@/features/loops/loopKeys';
import { signedInAs, testQueryClient, wrapperFor } from '@/test/render';
import type { ParseResult } from './parseScore';
import type { LibrarySong, Song } from './songForm';
import {
  songFileKeys,
  songKeys,
  useDeleteSong,
  useSongs,
  useUpdateSong,
  useUploadSong,
} from './useSongs';

vi.mock('@/lib/supabase', async () => (await import('@/test/fakeSupabase')).fakeSupabaseModule);

// alphaTab is covered by parseScore.test.ts; these tests are about the cache.
const parseScore = vi.fn<(bytes: Uint8Array, fileName: string) => ParseResult>();
vi.mock('./parseScore', () => ({
  parseScore: (...args: [Uint8Array, string]) => parseScore(...args),
}));

const song = (id: string, overrides: Partial<LibrarySong> = {}): LibrarySong => ({
  id,
  title: `Song ${id}`,
  artist: 'Band',
  original_tempo: 120,
  bar_count: 16,
  drum_track_index: 0,
  created_at: '2026-11-20T00:00:00Z',
  last_practiced_at: null,
  ...overrides,
});
/** What the list query returns per row: the song plus its embedded loops. */
const listRow = ({ last_practiced_at, ...rest }: LibrarySong) => ({
  ...rest,
  loops: last_practiced_at ? [{ last_practiced_at }] : [],
});
/** The row the song page caches: the song without the library's practice date. */
const songRow = (id: string): Song => {
  const row: Partial<LibrarySong> = song(id);
  delete row.last_practiced_at;
  return row as Song;
};
const ok = (data: unknown): FakeResult => ({ data, error: null });
const fail = (message: string): FakeResult => ({ data: null, error: { message } });
const gpFile = () => new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04, 9])], 'new.gp');

function deferred() {
  let resolve!: (value: FakeResult) => void;
  const promise = new Promise<FakeResult>((r) => (resolve = r));
  return { promise, resolve };
}

function renderSongHooks(userId = 'user-1') {
  const queryClient = testQueryClient();
  const hooks = renderHook(
    () => ({
      songs: useSongs(),
      upload: useUploadSong(),
      update: useUpdateSong(),
      remove: useDeleteSong(),
    }),
    { wrapper: wrapperFor(queryClient, signedInAs(userId)) },
  );
  const cached = () => queryClient.getQueryData<LibrarySong[]>(songKeys.forUser(userId));
  return { ...hooks, queryClient, cached };
}

/** Renders the hooks with `songs` loaded, then lets later queries answer from `next`. */
async function renderLoaded(songs: LibrarySong[]) {
  queryResult.mockResolvedValueOnce(ok(songs.map(listRow)));
  const view = renderSongHooks();
  await waitFor(() => expect(view.result.current.songs.isSuccess).toBe(true));
  return view;
}

beforeEach(() => {
  resetFakeSupabase();
  parseScore.mockReset().mockReturnValue({
    ok: true,
    metadata: { title: 'New', artist: 'Band', originalTempo: 100, barCount: 8, drumTrackIndex: 0 },
  });
});

describe('songKeys', () => {
  it('includes the user id, so two accounts never share a cache entry', () => {
    expect(songKeys.forUser('a')).not.toEqual(songKeys.forUser('b'));
    expect(songKeys.forUser('a').slice(0, 1)).toEqual(songKeys.all);
  });
});

describe('useSongs', () => {
  it("loads the signed-in user's songs with their latest practice", async () => {
    queryResult.mockResolvedValueOnce(
      ok([listRow(song('a', { last_practiced_at: '2026-11-21T08:00:00Z' })), listRow(song('b'))]),
    );
    const { result } = renderSongHooks('user-7');
    await waitFor(() => expect(result.current.songs.isSuccess).toBe(true));
    expect(result.current.songs.data).toEqual([
      song('a', { last_practiced_at: '2026-11-21T08:00:00Z' }),
      song('b'),
    ]);
    const call = queryResult.mock.calls[0]![0];
    expect(call.table).toBe('songs');
    expect(opArgs(call, 'eq')).toEqual(['user_id', 'user-7']);
  });

  it('surfaces a Supabase error as a query error', async () => {
    queryResult.mockResolvedValueOnce(fail('JWT expired'));
    const { result } = renderSongHooks();
    await waitFor(() => expect(result.current.songs.isError).toBe(true));
    expect(result.current.songs.error?.message).toBe('JWT expired');
  });
});

describe('useUploadSong', () => {
  it('puts a new song at the top of the list as soon as it is saved', async () => {
    const view = await renderLoaded([song('old')]);
    const inserted: Song = { ...song('new'), title: 'New' };
    const refetch = deferred();
    queryResult
      .mockResolvedValueOnce(ok(null)) // no duplicate
      .mockResolvedValueOnce(ok(inserted)) // insert
      .mockReturnValueOnce(refetch.promise);

    act(() => view.result.current.upload.mutate({ file: gpFile() }));
    // Before the refetch answers, the cache already has the new song.
    await waitFor(() => expect(view.cached()?.map((s) => s.id)).toEqual(['new', 'old']));
    expect(view.cached()?.[0]).toMatchObject({ title: 'New', last_practiced_at: null });

    refetch.resolve(ok([listRow(song('new')), listRow(song('old'))]));
    await waitFor(() => expect(view.cached()?.[0]?.title).toBe('Song new'));
  });

  it('leaves the list alone for a duplicate', async () => {
    const view = await renderLoaded([song('old')]);
    queryResult.mockResolvedValueOnce(ok(song('old'))); // hash matches
    queryResult.mockResolvedValue(ok([listRow(song('old'))]));

    act(() => view.result.current.upload.mutate({ file: gpFile() }));
    await waitFor(() => expect(view.result.current.upload.isSuccess).toBe(true));
    expect(view.result.current.upload.data?.kind).toBe('duplicate');
    expect(view.cached()?.map((s) => s.id)).toEqual(['old']);
    expect(storageResult).not.toHaveBeenCalled();
  });
});

describe('useUpdateSong', () => {
  it('shows the edit at once, sends only the changes, then keeps the saved row', async () => {
    const view = await renderLoaded([song('a'), song('b')]);
    const write = deferred();
    queryResult.mockReturnValueOnce(write.promise);
    queryResult.mockResolvedValue(
      ok([listRow({ ...song('a'), title: 'Renamed' }), listRow(song('b'))]),
    );

    act(() => view.result.current.update.mutate({ songId: 'a', changes: { title: 'Renamed' } }));
    await waitFor(() => expect(view.cached()?.[0]?.title).toBe('Renamed'));
    expect(view.cached()?.[1]?.title).toBe('Song b');

    const updateCall = queryResult.mock.calls[1]![0];
    expect(opArgs(updateCall, 'update')).toEqual([{ title: 'Renamed' }]);
    expect(updateCall.ops.filter((op) => op.method === 'eq').map((op) => op.args)).toEqual([
      ['id', 'a'],
      ['user_id', 'user-1'],
    ]);

    write.resolve(ok({ ...song('a'), title: 'Renamed' }));
    await waitFor(() => expect(view.result.current.update.isSuccess).toBe(true));
    expect(view.cached()?.[0]?.title).toBe('Renamed');
  });

  it('rolls the edit back when the save fails', async () => {
    const view = await renderLoaded([song('a')]);
    const write = deferred();
    queryResult.mockReturnValueOnce(write.promise);
    queryResult.mockResolvedValue(ok([listRow(song('a'))]));

    act(() => view.result.current.update.mutate({ songId: 'a', changes: { artist: 'Other' } }));
    await waitFor(() => expect(view.cached()?.[0]?.artist).toBe('Other'));
    write.resolve(fail('offline'));
    await waitFor(() => expect(view.result.current.update.isError).toBe(true));
    expect(view.cached()?.[0]?.artist).toBe('Band');
  });

  it("updates the song page's cached row, so it opens with the new title", async () => {
    const view = await renderLoaded([song('a')]);
    const detailKey = songKeys.detail('user-1', 'a');
    view.queryClient.setQueryData<Song>(detailKey, songRow('a'));
    queryResult.mockResolvedValueOnce(ok({ ...songRow('a'), title: 'Renamed' }));
    queryResult.mockResolvedValue(ok([listRow({ ...song('a'), title: 'Renamed' })]));

    act(() => view.result.current.update.mutate({ songId: 'a', changes: { title: 'Renamed' } }));
    await waitFor(() => expect(view.result.current.update.isSuccess).toBe(true));
    expect(view.queryClient.getQueryData<Song>(detailKey)?.title).toBe('Renamed');
  });

  it('makes up no song page row for a song whose page was never opened', async () => {
    const view = await renderLoaded([song('a')]);
    queryResult.mockResolvedValueOnce(ok({ ...songRow('a'), title: 'Renamed' }));
    queryResult.mockResolvedValue(ok([listRow({ ...song('a'), title: 'Renamed' })]));

    act(() => view.result.current.update.mutate({ songId: 'a', changes: { title: 'Renamed' } }));
    await waitFor(() => expect(view.result.current.update.isSuccess).toBe(true));
    expect(view.queryClient.getQueryData(songKeys.detail('user-1', 'a'))).toBeUndefined();
  });
});

describe('useUpdateSong alongside other writes', () => {
  it("rolls back only the failed song, keeping another song's pending edit", async () => {
    const view = await renderLoaded([song('a'), song('b')]);
    const writeA = deferred();
    const writeB = deferred();
    queryResult.mockReturnValueOnce(writeA.promise).mockReturnValueOnce(writeB.promise);
    queryResult.mockResolvedValue(
      ok([listRow(song('a')), listRow({ ...song('b'), title: 'B renamed' })]),
    );

    act(() => view.result.current.update.mutate({ songId: 'a', changes: { title: 'A renamed' } }));
    await waitFor(() => expect(queryResult).toHaveBeenCalledTimes(2));
    act(() => view.result.current.update.mutate({ songId: 'b', changes: { title: 'B renamed' } }));
    await waitFor(() => expect(queryResult).toHaveBeenCalledTimes(3));
    expect(view.cached()?.map((s) => s.title)).toEqual(['A renamed', 'B renamed']);

    writeA.resolve(fail('offline'));
    await waitFor(() => expect(view.cached()?.[0]?.title).toBe('Song a'));
    // b's optimistic title survives, and no refetch replaces it while b is pending.
    expect(view.cached()?.[1]?.title).toBe('B renamed');
    expect(queryResult).toHaveBeenCalledTimes(3);

    writeB.resolve(ok({ ...song('b'), title: 'B renamed' }));
    await waitFor(() => expect(queryResult).toHaveBeenCalledTimes(4));
    expect(view.cached()?.map((s) => s.title)).toEqual(['Song a', 'B renamed']);
  });

  it('does not bring back a song deleted while the edit was pending', async () => {
    const view = await renderLoaded([song('a'), song('b')]);
    const write = deferred();
    queryResult.mockReturnValueOnce(write.promise).mockResolvedValueOnce(ok(null)); // edit, delete
    queryResult.mockResolvedValue(ok([listRow(song('a'))]));

    act(() => view.result.current.update.mutate({ songId: 'a', changes: { title: 'A renamed' } }));
    await waitFor(() => expect(queryResult).toHaveBeenCalledTimes(2));
    act(() => view.result.current.remove.mutate('b'));
    await waitFor(() => expect(view.cached()?.map((s) => s.id)).toEqual(['a']));

    write.resolve(fail('offline'));
    await waitFor(() => expect(view.result.current.update.isError).toBe(true));
    expect(view.cached()).toEqual([song('a')]);
  });

  it('keeps an upload that landed while the edit was pending', async () => {
    const view = await renderLoaded([song('a')]);
    const write = deferred();
    const inserted: Song = { ...song('new'), title: 'New' };
    queryResult
      .mockReturnValueOnce(write.promise) // edit
      .mockResolvedValueOnce(ok(null)) // no duplicate
      .mockResolvedValueOnce(ok(inserted)); // insert
    queryResult.mockResolvedValue(ok([listRow(song('new')), listRow(song('a'))]));

    act(() => view.result.current.update.mutate({ songId: 'a', changes: { artist: 'Other' } }));
    await waitFor(() => expect(queryResult).toHaveBeenCalledTimes(2));
    act(() => view.result.current.upload.mutate({ file: gpFile() }));
    await waitFor(() => expect(view.result.current.upload.isSuccess).toBe(true));
    expect(view.cached()?.map((s) => s.id)).toEqual(['new', 'a']);

    write.resolve(fail('offline'));
    await waitFor(() => expect(view.result.current.update.isError).toBe(true));
    expect(view.cached()?.map((s) => [s.id, s.artist])).toEqual([
      ['new', 'Band'],
      ['a', 'Band'],
    ]);
  });
});

describe('useDeleteSong', () => {
  it('keeps the song listed until the server confirms, then drops it', async () => {
    const view = await renderLoaded([song('a'), song('b')]);
    const rowDelete = deferred();
    queryResult.mockReturnValueOnce(rowDelete.promise);
    queryResult.mockResolvedValue(ok([listRow(song('b'))]));

    act(() => view.result.current.remove.mutate('a'));
    await waitFor(() => expect(view.result.current.remove.isPending).toBe(true));
    expect(view.cached()?.map((s) => s.id)).toEqual(['a', 'b']);

    rowDelete.resolve(ok(null));
    await waitFor(() => expect(view.result.current.remove.isSuccess).toBe(true));
    expect(view.cached()?.map((s) => s.id)).toEqual(['b']);
  });

  it("forgets the deleted song's page row and downloaded file", async () => {
    const view = await renderLoaded([song('a'), song('b')]);
    const detailKey = songKeys.detail('user-1', 'a');
    const fileKey = songFileKeys.forSong('user-1', 'a');
    const otherFileKey = songFileKeys.forSong('user-1', 'b');
    view.queryClient.setQueryData<Song>(detailKey, songRow('a'));
    view.queryClient.setQueryData(fileKey, new Uint8Array([1]));
    view.queryClient.setQueryData(otherFileKey, new Uint8Array([2]));
    queryResult.mockResolvedValueOnce(ok(null));
    queryResult.mockResolvedValue(ok([listRow(song('b'))]));

    act(() => view.result.current.remove.mutate('a'));
    await waitFor(() => expect(view.result.current.remove.isSuccess).toBe(true));
    // Null is "no such song", which the song page shows as not found.
    expect(view.queryClient.getQueryData(detailKey)).toBeNull();
    expect(view.queryClient.getQueryData(fileKey)).toBeUndefined();
    expect(view.queryClient.getQueryData(otherFileKey)).toEqual(new Uint8Array([2]));
  });

  it("forgets the deleted song's loops, and only that song's", async () => {
    const view = await renderLoaded([song('a'), song('b')]);
    const loopsKey = loopKeys.forSong('user-1', 'a');
    const otherLoopsKey = loopKeys.forSong('user-1', 'b');
    view.queryClient.setQueryData(loopsKey, [{ id: 'loop-a' }]);
    view.queryClient.setQueryData(otherLoopsKey, [{ id: 'loop-b' }]);
    queryResult.mockResolvedValueOnce(ok(null));
    queryResult.mockResolvedValue(ok([listRow(song('b'))]));

    act(() => view.result.current.remove.mutate('a'));
    await waitFor(() => expect(view.result.current.remove.isSuccess).toBe(true));
    expect(view.queryClient.getQueryData(loopsKey)).toBeUndefined();
    expect(view.queryClient.getQueryData(otherLoopsKey)).toEqual([{ id: 'loop-b' }]);
  });

  it('keeps the loops of a song whose delete fails', async () => {
    const view = await renderLoaded([song('a')]);
    const loopsKey = loopKeys.forSong('user-1', 'a');
    view.queryClient.setQueryData(loopsKey, [{ id: 'loop-a' }]);
    storageResult.mockResolvedValueOnce(fail('storage down'));
    queryResult.mockResolvedValue(ok([listRow(song('a'))]));

    act(() => view.result.current.remove.mutate('a'));
    await waitFor(() => expect(view.result.current.remove.isError).toBe(true));
    expect(view.queryClient.getQueryData(loopsKey)).toEqual([{ id: 'loop-a' }]);
  });

  it('keeps the song and its downloaded file when the delete fails', async () => {
    const view = await renderLoaded([song('a')]);
    const fileKey = songFileKeys.forSong('user-1', 'a');
    view.queryClient.setQueryData(fileKey, new Uint8Array([1]));
    storageResult.mockResolvedValueOnce(fail('storage down'));
    queryResult.mockResolvedValue(ok([listRow(song('a'))]));

    act(() => view.result.current.remove.mutate('a'));
    await waitFor(() => expect(view.result.current.remove.isError).toBe(true));
    expect(view.result.current.remove.error?.message).toBe('storage down');
    expect(view.cached()?.map((s) => s.id)).toEqual(['a']);
    expect(view.queryClient.getQueryData(fileKey)).toEqual(new Uint8Array([1]));
  });
});
