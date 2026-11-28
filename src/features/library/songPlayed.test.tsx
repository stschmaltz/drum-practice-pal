import { StrictMode, type ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { onlineManager, type QueryClient } from '@tanstack/react-query';
import { offlineDb, type OutboxEntry } from '@/features/offline/offlineDb';
import { outboxEntries } from '@/features/offline/outbox';
import { hasUnsentWrites, useHasUnsentWrites } from '@/features/offline/unsentWrites';
import { useOutboxReplay } from '@/features/offline/useOutboxReplay';
import {
  fakeSupabase,
  opArgs,
  queryResult,
  resetFakeSupabase,
  type FakeResult,
} from '@/test/fakeSupabase';
import { settle, testQueryClient, wrapperFor } from '@/test/render';
import type { LibrarySong } from './songForm';
import { markSongPlayedUnobserved, useMarkSongPlayed } from './songPlayed';
import { songKeys } from './useSongs';

vi.mock('@/lib/supabase', async () => (await import('@/test/fakeSupabase')).fakeSupabaseModule);

const USER = 'user-1';
const NOW = '2026-11-27T18:30:00.000Z';
const dropped: FakeResult = {
  data: null,
  error: { message: 'TypeError: Failed to fetch', code: '' },
};

const librarySong = (id: string, overrides: Partial<LibrarySong> = {}): LibrarySong => ({
  id,
  title: `Song ${id}`,
  artist: '',
  original_tempo: 120,
  bar_count: 16,
  drum_track_index: 0,
  created_at: '2026-11-20T12:00:00Z',
  last_practiced_at: null,
  ...overrides,
});

/** Every "played" write sent: the time it carried. */
const sentTimes = () =>
  queryResult.mock.calls
    .map(([call]) => call)
    .filter((call) => call.table === 'songs' && opArgs(call, 'update'))
    .map((call) => (opArgs(call, 'update')?.[0] as { last_played_at: string }).last_played_at);

/** The database's answer: the later of what it holds and what was sent, never past its own clock. */
function serveSong(heldAt: string | null = null, serverNow = '2026-11-27T18:31:00.000Z') {
  let held = heldAt;
  queryResult.mockImplementation(async (call) => {
    const sent = (opArgs(call, 'update')?.[0] as { last_played_at: string } | undefined)
      ?.last_played_at;
    if (sent === undefined) return { data: null, error: null };
    const capped = Date.parse(sent) > Date.parse(serverNow) ? serverNow : sent;
    if (held === null || Date.parse(capped) > Date.parse(held)) held = capped;
    return { data: { last_played_at: held }, error: null };
  });
}

function renderMark(songs: LibrarySong[] | null = [librarySong('a'), librarySong('b')]) {
  const queryClient = testQueryClient();
  if (songs) queryClient.setQueryData(songKeys.forUser(USER), songs);
  const view = renderHook(() => ({ mark: useMarkSongPlayed(), unsent: useHasUnsentWrites(USER) }), {
    wrapper: wrapperFor(queryClient),
  });
  const cachedPlayedAt = (id: string) =>
    queryClient.getQueryData<LibrarySong[]>(songKeys.forUser(USER))?.find((song) => song.id === id)
      ?.last_played_at;
  return { ...view, queryClient, cachedPlayedAt };
}

const pendingPlays = (queryClient: QueryClient) =>
  queryClient.isMutating({ mutationKey: songKeys.plays(USER) });

beforeEach(() => {
  resetFakeSupabase();
  vi.useFakeTimers({ toFake: ['Date'], now: new Date(NOW) });
});
afterEach(() => vi.useRealTimers());

describe('marking a song played', () => {
  it('sends now for the song, scoped to the user, and moves the cached list at once', async () => {
    serveSong();
    const { result, cachedPlayedAt, queryClient } = renderMark();
    act(() => result.current.mark('a'));

    // Before any answer: the list has it already.
    expect(cachedPlayedAt('a')).toBe(NOW);
    expect(cachedPlayedAt('b')).toBeUndefined();
    await waitFor(() => expect(sentTimes()).toEqual([NOW]));
    const call = queryResult.mock.calls
      .map(([sent]) => sent)
      .find((sent) => opArgs(sent, 'update'))!;
    expect(call.ops).toContainEqual({ method: 'eq', args: ['id', 'a'] });
    expect(call.ops).toContainEqual({ method: 'eq', args: ['user_id', USER] });
    await waitFor(() => expect(pendingPlays(queryClient)).toBe(0));
    await waitFor(async () => expect(await outboxEntries(USER)).toEqual([]));
    expect(cachedPlayedAt('a')).toBe(NOW);
  });

  it('takes the time the database kept when this device’s clock runs ahead', async () => {
    serveSong(null, '2026-11-27T10:00:00.000Z');
    const { result, cachedPlayedAt } = renderMark();
    act(() => result.current.mark('a'));
    await waitFor(() => expect(cachedPlayedAt('a')).toBe('2026-11-27T10:00:00.000Z'));
  });

  it('never moves the cached time back: an older write that lands late changes nothing shown', async () => {
    serveSong('2026-11-27T18:00:00.000Z');
    const { queryClient, cachedPlayedAt } = renderMark([
      librarySong('a', { last_played_at: '2026-11-27T18:00:00.000Z' }),
    ]);
    act(() =>
      markSongPlayedUnobserved(queryClient, USER, {
        songId: 'a',
        playedAt: '2026-11-01T09:00:00.000Z',
      }),
    );
    expect(cachedPlayedAt('a')).toBe('2026-11-27T18:00:00.000Z');
    await waitFor(() => expect(sentTimes()).toEqual(['2026-11-01T09:00:00.000Z']));
    await waitFor(() => expect(pendingPlays(queryClient)).toBe(0));
    expect(cachedPlayedAt('a')).toBe('2026-11-27T18:00:00.000Z');
  });

  it('with no list cached it still sends, and creates no list', async () => {
    serveSong();
    const { result, queryClient } = renderMark(null);
    act(() => result.current.mark('a'));
    await waitFor(() => expect(sentTimes()).toEqual([NOW]));
    await waitFor(() => expect(pendingPlays(queryClient)).toBe(0));
    expect(queryClient.getQueryData(songKeys.forUser(USER))).toBeUndefined();
  });

  it('a song deleted meanwhile is no failure: nothing to move, and the entry goes', async () => {
    queryResult.mockResolvedValue({ data: null, error: null });
    const { result, queryClient } = renderMark();
    act(() => result.current.mark('a'));
    await waitFor(() => expect(sentTimes()).toEqual([NOW]));
    await waitFor(() => expect(pendingPlays(queryClient)).toBe(0));
    await waitFor(async () => expect(await outboxEntries(USER)).toEqual([]));
  });

  it('holds no song edit up: its key is its own', async () => {
    serveSong();
    const { result, queryClient } = renderMark();
    act(() => onlineManager.setOnline(false));
    act(() => result.current.mark('a'));
    await waitFor(() => expect(pendingPlays(queryClient)).toBe(1));
    expect(queryClient.isMutating({ mutationKey: songKeys.writes(USER) })).toBe(0);
  });
});

// 14 Test: two openings of one song close together (Original, then Drumless), each a write.
describe('two played times for one song in flight', () => {
  const LATER = '2026-11-27T18:30:05.000Z';

  /** Holds each write's answer; `answer(n)` lets the nth sent one land with what the database kept then. */
  function holdAnswers() {
    const answers: Array<() => void> = [];
    let held: string | null = null;
    queryResult.mockImplementation(async (call) => {
      const sent = (opArgs(call, 'update')?.[0] as { last_played_at: string } | undefined)
        ?.last_played_at;
      if (sent === undefined) return { data: null, error: null };
      // The database does each as it arrives; only the answers are slow.
      if (held === null || Date.parse(sent) > Date.parse(held)) held = sent;
      const kept = held;
      await new Promise<void>((resolve) => answers.push(resolve));
      return { data: { last_played_at: kept }, error: null };
    });
    return { answer: (index: number) => act(async () => answers[index]!()) };
  }

  it('shows the later time while both are on their way, and after the answers in the order sent', async () => {
    const { answer } = holdAnswers();
    const { result, queryClient, cachedPlayedAt } = renderMark();
    act(() => result.current.mark('a'));
    vi.setSystemTime(new Date(LATER));
    act(() => result.current.mark('a'));
    await waitFor(() => expect(sentTimes()).toEqual([NOW, LATER]));
    expect(cachedPlayedAt('a')).toBe(LATER);
    expect(hasUnsentWrites(queryClient, USER)).toBe(true);

    await answer(0);
    await waitFor(() => expect(pendingPlays(queryClient)).toBe(1));
    // The first answer says NOW, which was true when it was written: the newer time stays.
    expect(cachedPlayedAt('a')).toBe(LATER);
    await answer(1);
    await waitFor(() => expect(pendingPlays(queryClient)).toBe(0));
    expect(cachedPlayedAt('a')).toBe(LATER);
    await waitFor(async () => expect(await outboxEntries(USER)).toEqual([]));
    expect(hasUnsentWrites(queryClient, USER)).toBe(false);
  });

  // 14 Test, bug 4: the last answer to land is taken whole once nothing else is pending, so
  // an older write's answer that arrives after a newer one's moves the shown time back until
  // the list is next read. Take ".fails" off once it is fixed.
  it.fails('never shows the older time when the answers land in the other order', async () => {
    const { answer } = holdAnswers();
    const { result, queryClient, cachedPlayedAt } = renderMark();
    act(() => result.current.mark('a'));
    vi.setSystemTime(new Date(LATER));
    act(() => result.current.mark('a'));
    await waitFor(() => expect(sentTimes()).toEqual([NOW, LATER]));

    await answer(1);
    await waitFor(() => expect(pendingPlays(queryClient)).toBe(1));
    expect(cachedPlayedAt('a')).toBe(LATER);
    await answer(0);
    await waitFor(() => expect(pendingPlays(queryClient)).toBe(0));
    expect(cachedPlayedAt('a')).toBe(LATER);
  });
});

describe('marking a song played, offline and on a bad connection', () => {
  it('waits for the connection, kept on the device, and is sent once when it is back', async () => {
    serveSong();
    const { result, queryClient, cachedPlayedAt } = renderMark();
    act(() => onlineManager.setOnline(false));
    act(() => result.current.mark('a'));

    await waitFor(async () =>
      expect(await outboxEntries(USER)).toMatchObject([
        { kind: 'songPlayed', userId: USER, songId: 'a', playedAt: NOW },
      ]),
    );
    expect(cachedPlayedAt('a')).toBe(NOW);
    await settle();
    expect(sentTimes()).toEqual([]);
    // Sign-out waits for it, at the press and in the button's own render.
    expect(hasUnsentWrites(queryClient, USER)).toBe(true);
    await waitFor(() => expect(result.current.unsent).toBe(true));

    act(() => onlineManager.setOnline(true));
    await waitFor(() => expect(sentTimes()).toEqual([NOW]));
    await waitFor(async () => expect(await outboxEntries(USER)).toEqual([]));
    await waitFor(() => expect(result.current.unsent).toBe(false));
    expect(hasUnsentWrites(queryClient, USER)).toBe(false);
  });

  it('tries again after a request the connection dropped, rather than failing', async () => {
    serveSong();
    const served = queryResult.getMockImplementation()!;
    queryResult.mockImplementationOnce(async () => dropped).mockImplementation(served);
    const { result, queryClient } = renderMark();
    act(() => result.current.mark('a'));
    await waitFor(() => expect(sentTimes()).toEqual([NOW, NOW]), { timeout: 3000 });
    await waitFor(() => expect(pendingPlays(queryClient)).toBe(0));
    await waitFor(async () => expect(await outboxEntries(USER)).toEqual([]));
  });

  it('refreshes a refused token and sends again with the new one', async () => {
    serveSong();
    const served = queryResult.getMockImplementation()!;
    queryResult
      .mockImplementationOnce(async () => ({
        data: null,
        error: { message: 'JWT expired', code: 'PGRST303' },
      }))
      .mockImplementation(served);
    const { result, queryClient } = renderMark();
    act(() => result.current.mark('a'));
    await waitFor(() => expect(sentTimes()).toEqual([NOW, NOW]));
    expect(fakeSupabase.auth.refreshSession).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(pendingPlays(queryClient)).toBe(0));
  });

  it('gives up on the server’s refusal, quietly, and leaves the outbox', async () => {
    queryResult.mockResolvedValue({ data: null, error: { message: 'nope', code: '42501' } });
    const { result, queryClient } = renderMark();
    act(() => result.current.mark('a'));
    await waitFor(() => expect(sentTimes()).toEqual([NOW]));
    await waitFor(() => expect(pendingPlays(queryClient)).toBe(0));
    await waitFor(async () => expect(await outboxEntries(USER)).toEqual([]));
    await settle();
    expect(sentTimes()).toEqual([NOW]);
  });
});

describe('replaying a played time an earlier page left unsent', () => {
  const entry: OutboxEntry = {
    kind: 'songPlayed',
    id: 'left-1',
    userId: USER,
    queuedAt: Date.parse('2026-11-26T09:00:00Z'),
    songId: 'a',
    playedAt: '2026-11-26T09:00:00.000Z',
  };

  function renderReplay(queryClient: QueryClient, strict = false) {
    const Inner = wrapperFor(queryClient);
    const wrapper = ({ children }: { children: ReactNode }) =>
      strict ? (
        <StrictMode>
          <Inner>{children}</Inner>
        </StrictMode>
      ) : (
        <Inner>{children}</Inner>
      );
    return renderHook(() => useOutboxReplay(), { wrapper });
  }

  it('sends it once with its own time, under StrictMode too, and takes it out', async () => {
    serveSong();
    await offlineDb.outbox.put(entry);
    const queryClient = testQueryClient();
    queryClient.setQueryData(songKeys.forUser(USER), [librarySong('a')]);
    renderReplay(queryClient, true);

    await waitFor(() => expect(sentTimes()).toEqual(['2026-11-26T09:00:00.000Z']));
    await waitFor(async () => expect(await outboxEntries(USER)).toEqual([]));
    await settle();
    expect(sentTimes()).toHaveLength(1);
  });

  it('leaves a newer time opened on this page showing, whichever answer lands last', async () => {
    serveSong();
    await offlineDb.outbox.put(entry);
    const queryClient = testQueryClient();
    queryClient.setQueryData(songKeys.forUser(USER), [librarySong('a')]);
    // The user opens a recording before the outbox has been read.
    act(() => markSongPlayedUnobserved(queryClient, USER, { songId: 'a', playedAt: NOW }));
    renderReplay(queryClient);

    await waitFor(() => expect(sentTimes()).toContain('2026-11-26T09:00:00.000Z'));
    await waitFor(() => expect(pendingPlays(queryClient)).toBe(0));
    await waitFor(async () => expect(await outboxEntries(USER)).toEqual([]));
    // The page's own write may go a second time (its entry can still be in the outbox when the
    // replay reads it): the database keeps the later time either way, so the order can't matter.
    expect(sentTimes().filter((time) => time !== NOW)).toEqual(['2026-11-26T09:00:00.000Z']);
    expect(
      queryClient.getQueryData<LibrarySong[]>(songKeys.forUser(USER))?.[0]?.last_played_at,
    ).toBe(NOW);
  });

  it('keeps its entry, under its first queued time, while it waits offline again', async () => {
    serveSong();
    await offlineDb.outbox.put(entry);
    act(() => onlineManager.setOnline(false));
    renderReplay(testQueryClient());
    await settle();
    expect(sentTimes()).toEqual([]);
    expect(await outboxEntries(USER)).toEqual([entry]);
  });
});
