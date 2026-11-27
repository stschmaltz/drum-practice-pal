import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { onlineManager, QueryClient } from '@tanstack/react-query';
import { Route } from 'react-router';
import type { Song } from '@/features/library/songForm';
import { songKeys } from '@/features/library/useSongs';
import type { Loop } from '@/features/loops/loopForm';
import { loopKeys } from '@/features/loops/loopKeys';
import { offlineDb } from '@/features/offline/offlineDb';
import { restoredCacheIsStale } from '@/features/offline/queryPersister';
import type { EngineMount } from '@/features/player/playerEngine';
import type { Settings } from '@/features/settings/settingsForm';
import { songFilePath } from '@/lib/schema';
import {
  queryResult,
  resetFakeSupabase,
  storageResult,
  type FakeResult,
  type StorageCall,
} from '@/test/fakeSupabase';
import { FakePlayerEngine, startOfBar, TEMPO_CHANGE_BAR_TEMPOS } from '@/test/fakePlayerEngine';
import { loopRow, loopTable, type LoopTable } from '@/test/loopTable';
import { renderRoutes, RouteMarker, testQueryClient } from '@/test/render';
import { LoopPracticePage } from './LoopPracticePage';

vi.mock('@/lib/supabase', async () => (await import('@/test/fakeSupabase')).fakeSupabaseModule);

const engines: FakePlayerEngine[] = [];
vi.mock('@/features/player/alphaTabEngine', () => ({
  createAlphaTabEngine: (mount: EngineMount) => {
    const engine = new FakePlayerEngine();
    engine.mount = mount;
    engines.push(engine);
    return engine;
  },
}));

const USER = 'user-1';
const SONG = '11111111-1111-4111-8111-111111111111';
const CHORUS_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const VERSE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const MISSING_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const song: Song = {
  id: SONG,
  title: 'Tempo Change',
  artist: 'Fixture Band',
  original_tempo: 120,
  bar_count: 16,
  drum_track_index: 1,
  created_at: '2026-11-20T12:00:00Z',
};
const settingsRow: Settings = {
  metronome_on: true,
  metronome_volume: 0.8,
  count_in_bars: 0,
  count_in_mode: 'start',
  drums_muted_default: false,
};
// 90 BPM from bar 9 (the tempo-change fixture): 71% of it is 64 BPM.
const chorus = loopRow(CHORUS_ID, {
  song_id: SONG,
  name: 'Chorus fill',
  start_bar: 9,
  end_bar: 12,
  speed_ratio: 0.708333,
});
const verse = loopRow(VERSE_ID, { song_id: SONG, name: 'Verse', start_bar: 1, end_bar: 2 });

const ok = (data: unknown): FakeResult => ({ data, error: null });
let loops: LoopTable = loopTable();

function serve(saved: Loop[] = [chorus, verse]) {
  loops = loopTable(saved);
  queryResult.mockImplementation(async (call) => {
    if (call.table === 'user_settings') return ok(settingsRow);
    if (call.table === 'loops') return loops.answer(call);
    if (call.table === 'practice_sessions') return ok([]);
    return ok(song);
  });
  storageResult.mockImplementation(async ({ method, args }: StorageCall) =>
    method === 'download' && args[0] === songFilePath(USER, SONG)
      ? ok(new Blob([new Uint8Array([1, 2, 3])]))
      : ok({}),
  );
}

function renderPractice(loopId: string, queryClient?: QueryClient) {
  renderRoutes(
    <>
      <Route path="/songs/:id/loops/:loopId" element={<LoopPracticePage />} />
      <Route path="/songs/:id" element={<RouteMarker name="song overview" />} />
    </>,
    { path: `/songs/${SONG}/loops/${loopId}`, queryClient },
  );
  return userEvent.setup();
}

const playButton = () => screen.getByRole('button', { name: /^(Play|Pause)$/ });
const speed = () => screen.getByTestId('practice-speed');
const location = () => screen.getByTestId('location');

async function loadPlayer() {
  await waitFor(() => expect(engines[0]?.loadScore).toHaveBeenCalled());
  const engine = engines[0]!;
  act(() =>
    engine.finishLoading({ barCount: 16, trackCount: 3, barTempos: TEMPO_CHANGE_BAR_TEMPOS }),
  );
  await waitFor(() => expect(playButton()).toBeEnabled());
  return engine;
}

beforeEach(() => {
  resetFakeSupabase();
  engines.length = 0;
});

describe('LoopPracticePage', () => {
  it('sets the loop up at its saved speed, ready for Play, without starting playback', async () => {
    serve();
    const user = renderPractice(CHORUS_ID);
    const engine = await loadPlayer();

    expect(screen.getByRole('heading', { level: 1, name: 'Chorus fill' })).toBeInTheDocument();
    await waitFor(() => expect(speed()).toHaveTextContent('71%'));
    expect(
      within(screen.getByRole('group', { name: 'Loop speed' })).getByText('64 BPM'),
    ).toBeVisible();
    expect(screen.getByTestId('practice-to-full-speed')).toHaveTextContent('29% to full speed');
    expect(screen.getByTestId('practice-progress')).toHaveTextContent(
      'Bars 9 to 12 · 0:00 · 0 passes',
    );
    expect(engine.setPlaybackRange).toHaveBeenLastCalledWith({
      startTick: startOfBar(9),
      endTick: startOfBar(13),
    });
    expect(engine.setLooping).toHaveBeenLastCalledWith(true);
    expect(engine.play).not.toHaveBeenCalled();

    await user.click(playButton());
    expect(engine.play).toHaveBeenCalledTimes(1);
    expect(engine.setSpeed).toHaveBeenLastCalledWith(0.708333);
  });

  it('has its way back to the song', async () => {
    serve();
    renderPractice(CHORUS_ID);
    expect(await screen.findByRole('link', { name: 'Tempo Change' })).toHaveAttribute(
      'href',
      `/songs/${SONG}`,
    );
  });

  it.each([
    ['none of this song’s loops', MISSING_ID],
    ['not an id', 'not-an-id'],
  ])('says the loop is not found for an id that is %s, and loads no player', async (_what, id) => {
    serve();
    renderPractice(id);
    expect(await screen.findByRole('heading', { name: 'Loop not found' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to the song' })).toHaveAttribute(
      'href',
      `/songs/${SONG}`,
    );
    expect(engines).toHaveLength(0);
  });

  it('nudges the speed with the round buttons and saves it', async () => {
    serve();
    const user = renderPractice(CHORUS_ID);
    await loadPlayer();
    await waitFor(() => expect(speed()).toHaveTextContent('71%'));

    await user.click(screen.getByRole('button', { name: 'Faster by 5%' }));
    expect(speed()).toHaveTextContent('76%');
    await user.click(screen.getByRole('button', { name: 'Save speed' }));

    await waitFor(() => expect(loops.sent('update')).toEqual([{ speed_ratio: 0.76 }]));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save speed' })).toBeDisabled());
  });

  it('moves to the next loop with a loop key, and the URL follows, replaced', async () => {
    serve();
    const user = renderPractice(CHORUS_ID);
    await loadPlayer();
    await waitFor(() => expect(speed()).toHaveTextContent('71%'));

    // The panel's order is song order: Verse (bars 1 to 2), then Chorus fill.
    await user.keyboard('{ArrowLeft}');

    expect(await screen.findByRole('heading', { level: 1, name: 'Verse' })).toBeInTheDocument();
    expect(location()).toHaveTextContent(`/songs/${SONG}/loops/${VERSE_ID}`);
    expect(speed()).toHaveTextContent('100%');
  });

  it('waits for the loops when the score is in first, then opens the loop', async () => {
    serve();
    const release = loops.holdNext('select');
    renderPractice(CHORUS_ID);
    expect(await screen.findByText('Loading the loop…')).toBeInTheDocument();
    release();
    await loadPlayer();
    await waitFor(() => expect(speed()).toHaveTextContent('71%'));
  });

  describe('Session complete', () => {
    // Only the clock: the queries and Testing Library keep their real timers.
    beforeEach(() => vi.useFakeTimers({ toFake: ['Date'] }));
    afterEach(() => vi.useRealTimers());

    /** Plays the loop for `seconds` (nudged 5% faster on the way) and pauses: a session is logged. */
    async function practise(seconds: number) {
      serve();
      vi.setSystemTime(new Date(2026, 10, 26, 18));
      const user = renderPractice(CHORUS_ID);
      const engine = await loadPlayer();
      await waitFor(() => expect(speed()).toHaveTextContent('71%'));
      await user.click(playButton());
      act(() => engine.fire('stateChanged', { playing: true }));
      await user.click(screen.getByRole('button', { name: 'Faster by 5%' }));
      vi.setSystemTime(new Date(2026, 10, 26, 18, 0, seconds));
      await user.click(playButton());
      act(() => engine.fire('stateChanged', { playing: false }));
      return user;
    }

    const sessionLogs = () =>
      queryResult.mock.calls.filter(
        ([call]) =>
          call.table === 'practice_sessions' && call.ops.some((op) => op.method === 'upsert'),
      );

    it('sums up a logged session: time, passes, the speed it began and ended at, the streak', async () => {
      await practise(45);

      const summary = await screen.findByTestId('session-complete');
      await waitFor(() => expect(sessionLogs()).toHaveLength(1));
      expect(within(summary).getByRole('heading', { name: /Session complete/ })).toBeVisible();
      expect(summary).toHaveTextContent('45 s');
      expect(summary).toHaveTextContent('0 passes');
      expect(summary).toHaveTextContent('71% → 76%');
      expect(await within(summary).findByText('1 day')).toBeVisible();
      // In place of the line the whole song shows.
      expect(screen.queryByTestId('session-logged')).not.toBeInTheDocument();
    });

    it('"Keep going" closes it and stays on the loop', async () => {
      const user = await practise(45);
      const summary = await screen.findByTestId('session-complete');

      await user.click(within(summary).getByRole('button', { name: 'Keep going' }));
      expect(screen.queryByTestId('session-complete')).not.toBeInTheDocument();
      expect(location()).toHaveTextContent(`/songs/${SONG}/loops/${CHORUS_ID}`);
    });

    it('"Done" goes back to the song', async () => {
      const user = await practise(45);
      await user.click(
        within(await screen.findByTestId('session-complete')).getByRole('button', { name: 'Done' }),
      );
      expect(await screen.findByText('At song overview')).toBeInTheDocument();
    });

    it('shows nothing for a stretch too short to log', async () => {
      await practise(10);
      expect(screen.getByTestId('practice-progress')).toHaveTextContent('0:10');
      expect(screen.queryByTestId('session-complete')).not.toBeInTheDocument();
      expect(sessionLogs()).toHaveLength(0);
    });
  });

  describe('with a list cached from an earlier visit', () => {
    const loopsKey = loopKeys.forSong(USER, SONG);

    it('opens a loop another device saved since: the cached list lacks it, the read brings it', async () => {
      serve();
      const queryClient = testQueryClient();
      queryClient.setQueryData(loopsKey, [verse]);
      const release = loops.holdNext('select');
      renderPractice(CHORUS_ID, queryClient);
      expect(await screen.findByText('Loading the loop…')).toBeInTheDocument();

      release();

      expect(await screen.findByRole('heading', { level: 1, name: 'Chorus fill' })).toBeVisible();
      await loadPlayer();
      await waitFor(() => expect(speed()).toHaveTextContent('71%'));
    });

    it('opens at the speed another device saved since, not the cached one', async () => {
      serve();
      const queryClient = testQueryClient();
      queryClient.setQueryData(loopsKey, [{ ...chorus, speed_ratio: 1 }, verse]);
      const release = loops.holdNext('select');
      renderPractice(CHORUS_ID, queryClient);
      await loadPlayer();
      expect(speed()).toHaveTextContent('100%');

      release();

      await waitFor(() => expect(speed()).toHaveTextContent('71%'));
    });

    it('opens on a cold start offline, from the restored cache', async () => {
      serve();
      const queryClient = testQueryClient();
      queryClient.setQueryData(songKeys.detail(USER, SONG), song);
      queryClient.setQueryData(loopsKey, [chorus, verse]);
      restoredCacheIsStale(queryClient);
      await offlineDb.songFiles.put({
        userId: USER,
        songId: SONG,
        bytes: new Uint8Array([1, 2, 3]),
      });
      act(() => onlineManager.setOnline(false));

      renderPractice(CHORUS_ID, queryClient);
      await loadPlayer();

      await waitFor(() => expect(speed()).toHaveTextContent('71%'));
      expect(queryClient.getQueryState(loopsKey)?.fetchStatus).toBe('paused');
      expect(queryResult).not.toHaveBeenCalled();
    });

    it('offline with nothing cached says so', async () => {
      serve();
      const queryClient = testQueryClient();
      queryClient.setQueryData(songKeys.detail(USER, SONG), song);
      act(() => onlineManager.setOnline(false));
      renderPractice(CHORUS_ID, queryClient);
      expect(
        await screen.findByText("This song's loops haven't been opened on this device yet."),
      ).toBeInTheDocument();
    });
  });
});
