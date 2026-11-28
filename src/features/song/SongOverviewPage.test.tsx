import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route } from 'react-router';
import type { Song } from '@/features/library/songForm';
import type { Sitting } from '@/features/practice/sittings';
import { readVisitSittings, recordVisitSitting } from '@/features/practice/visitSittings';
import {
  queryResult,
  resetFakeSupabase,
  storageResult,
  type FakeResult,
} from '@/test/fakeSupabase';
import { loopRow, loopTable, type LoopTable } from '@/test/loopTable';
import { historyBack, historyForward, renderRoutes, RouteMarker, settle } from '@/test/render';
import { SongOverviewPage } from './SongOverviewPage';

vi.mock('@/lib/supabase', async () => (await import('@/test/fakeSupabase')).fakeSupabaseModule);
// The overview loads no player: nothing may reach for alphaTab.
vi.mock('@/features/player/alphaTabEngine', () => {
  throw new Error('The song overview must not load the player');
});

const SONG = '11111111-1111-4111-8111-111111111111';
const LOOP_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const LOOP_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const LOOP_C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const song: Song = {
  id: SONG,
  title: 'Groove 120',
  artist: 'Fixture Band',
  original_tempo: 120,
  bar_count: 16,
  drum_track_index: 1,
  created_at: '2026-11-20T12:00:00Z',
};
const ok = (data: unknown): FakeResult => ({ data, error: null });
let loops: LoopTable = loopTable();

const older = loopRow(LOOP_A, {
  song_id: SONG,
  name: 'Intro',
  start_bar: 1,
  end_bar: 4,
  speed_ratio: 0.92,
  last_practiced_at: '2026-11-20T12:00:00Z',
});
const newer = loopRow(LOOP_B, {
  song_id: SONG,
  name: 'Chorus fill',
  start_bar: 9,
  end_bar: 12,
  speed_ratio: 0.7,
  last_practiced_at: '2026-11-25T12:00:00Z',
});
const done = loopRow(LOOP_C, {
  song_id: SONG,
  name: 'Outro',
  status: 'finished',
  finished_at: '2026-11-24T12:00:00Z',
});

function serve(saved: ReturnType<typeof loopRow>[] = [older, newer, done]) {
  loops = loopTable(saved);
  queryResult.mockImplementation(async (call) => {
    if (call.table === 'loops') return loops.answer(call);
    if (call.table === 'practice_sessions') return ok([]);
    return ok(song);
  });
}

function renderOverview(search = '', before?: string[]) {
  renderRoutes(
    <>
      <Route path="/" element={<RouteMarker name="songs" />} />
      <Route path="/songs/:id" element={<SongOverviewPage />} />
      <Route path="/songs/:id/loops/:loopId" element={<RouteMarker name="practice" />} />
      <Route path="/songs/:id/play" element={<RouteMarker name="whole song" />} />
    </>,
    { path: `/songs/${SONG}${search}`, before },
  );
  return userEvent.setup();
}

beforeEach(resetFakeSupabase);

describe('SongOverviewPage', () => {
  it('shows the song, its facts and how much of it is mastered', async () => {
    serve();
    renderOverview();
    expect(await screen.findByRole('heading', { level: 1, name: 'Groove 120' })).toBeVisible();
    expect(screen.getByText('Fixture Band')).toBeVisible();
    expect(await screen.findByTestId('song-facts')).toHaveTextContent(
      '16 bars · 120 BPM · 1 of 3 mastered',
    );
    expect(storageResult).not.toHaveBeenCalled();
  });

  it('lists the loops on the go by last practised, then the mastered ones', async () => {
    serve();
    renderOverview();
    const onTheGo = await screen.findByRole('list', { name: 'Loops on the go' });
    const names = within(onTheGo)
      .getAllByRole('listitem')
      .map((item) => item.querySelector('p')?.textContent);
    expect(names).toEqual(['Chorus fill', 'Intro']);
    expect(within(onTheGo).getAllByRole('listitem')[1]).toHaveTextContent('Bars 1 to 4 · 92%');
    expect(
      within(screen.getByRole('list', { name: 'Mastered loops' })).getByText('Outro'),
    ).toBeVisible();
  });

  it('opens a loop’s practice screen from its round play button', async () => {
    serve();
    const user = renderOverview();
    await user.click(await screen.findByRole('link', { name: 'Practise Intro' }));
    expect(screen.getByTestId('location')).toHaveTextContent(`/songs/${SONG}/loops/${LOOP_A}`);
  });

  it('opens a loop’s practice screen from its name too', async () => {
    serve();
    const user = renderOverview();
    await user.click(await screen.findByRole('link', { name: 'Intro' }));
    expect(screen.getByTestId('location')).toHaveTextContent(`/songs/${SONG}/loops/${LOOP_A}`);
  });

  it('has New loop and Play whole song as links into the player', async () => {
    serve();
    renderOverview();
    expect(await screen.findByRole('link', { name: 'New loop' })).toHaveAttribute(
      'href',
      `/songs/${SONG}/play?new=1`,
    );
    expect(screen.getByRole('link', { name: 'Play whole song' })).toHaveAttribute(
      'href',
      `/songs/${SONG}/play`,
    );
  });

  it('marks a loop finished from its menu, which moves it to the mastered list', async () => {
    serve();
    const user = renderOverview();
    await user.click(await screen.findByRole('button', { name: 'More actions for Intro' }));
    await user.click(screen.getByRole('menuitem', { name: 'Mark finished' }));

    const mastered = screen.getByRole('list', { name: 'Mastered loops' });
    await within(mastered).findByText('Intro');
    await waitFor(() => expect(loops.sent('update')).toEqual([{ status: 'finished' }]));
    // Focus followed the loop to its new place.
    await waitFor(() =>
      expect(
        within(mastered).getByRole('button', { name: 'More actions for Intro' }),
      ).toHaveFocus(),
    );
  });

  it('says so for a song with no loops', async () => {
    serve([]);
    renderOverview();
    expect(await screen.findByText(/No loops yet/)).toBeVisible();
  });

  it('sends an old ?loop= link on to that loop’s practice screen, replacing it', async () => {
    serve();
    renderOverview(`?loop=${LOOP_B}`);
    expect(await screen.findByText('At practice')).toBeVisible();
    expect(screen.getByTestId('location')).toHaveTextContent(`/songs/${SONG}/loops/${LOOP_B}`);
  });

  it('Back from the redirected ?loop= link skips the old address, so it never bounces forward again', async () => {
    serve();
    renderOverview(`?loop=${LOOP_B}`, ['/']);
    expect(await screen.findByText('At practice')).toBeVisible();

    historyBack();

    // Pushed, Back would land on `?loop=`, which would redirect straight back to practice.
    expect(await screen.findByText('At songs')).toBeVisible();
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/);
    historyForward();
    expect(await screen.findByText('At practice')).toBeVisible();
    expect(screen.getByTestId('location')).toHaveTextContent(`/songs/${SONG}/loops/${LOOP_B}`);
  });

  it('a ?loop= naming a loop this song doesn’t have still goes to the practice screen, which says so', async () => {
    // The overview doesn't read the loops before redirecting: the practice screen owns "Loop not found".
    serve();
    renderOverview('?loop=dddddddd-dddd-4ddd-8ddd-dddddddddddd');
    expect(await screen.findByText('At practice')).toBeVisible();
  });

  it('Back from a loop’s practice screen returns to the song, and Forward goes in again', async () => {
    serve();
    const user = renderOverview('', ['/']);
    await user.click(await screen.findByRole('link', { name: 'Practise Chorus fill' }));
    expect(await screen.findByText('At practice')).toBeVisible();

    historyBack();
    expect(await screen.findByRole('heading', { level: 1, name: 'Groove 120' })).toBeVisible();
    historyBack();
    expect(await screen.findByText('At songs')).toBeVisible();
    historyForward();
    expect(await screen.findByRole('heading', { level: 1, name: 'Groove 120' })).toBeVisible();
    historyForward();
    expect(screen.getByTestId('location')).toHaveTextContent(`/songs/${SONG}/loops/${LOOP_B}`);
  });

  it('ignores a ?loop= that is not an id', async () => {
    serve();
    renderOverview('?loop=%3Cb%3E');
    expect(await screen.findByRole('heading', { level: 1, name: 'Groove 120' })).toBeVisible();
  });

  describe('the visit’s practice summary', () => {
    // The sittings are stamped with real times; only the clock is faked.
    beforeEach(() => vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 10, 27, 18, 30) }));
    afterEach(() => vi.useRealTimers());

    const BEGAN = new Date(2026, 10, 27, 18).getTime();
    function practised(overrides: Partial<Sitting> = {}) {
      recordVisitSitting(
        {
          songId: SONG,
          loopId: LOOP_B,
          loopName: 'Chorus fill',
          beganAt: BEGAN,
          playedSeconds: 720,
          repeats: 20,
          startSpeedRatio: 0.8,
          endSpeedRatio: 0.9,
          ...overrides,
        },
        30,
      );
    }
    const summary = () => screen.getByTestId('visit-summary');
    const noSummary = () => expect(screen.queryByTestId('visit-summary')).not.toBeInTheDocument();
    const session = (day: number, hour = 19) => ({
      id: `session-${day}-${hour}`,
      loop_id: LOOP_B,
      started_at: new Date(2026, 10, day, hour).toISOString(),
      duration_seconds: 720,
      speed_ratio: 0.9,
      repeats: 20,
    });

    it('says what was practised: the loop, its time, and the speed it went from and to', async () => {
      practised();
      serve();
      renderOverview();
      await screen.findByRole('heading', { level: 1, name: 'Groove 120' });
      expect(summary()).toHaveAttribute('role', 'status');
      expect(summary()).toHaveTextContent('Chorus fill: 12 min, 80% → 90%');
    });

    it('is there in the overview’s first render, not after its loops', async () => {
      practised();
      serve();
      loops.holdNext('select');
      renderOverview();
      await screen.findByRole('heading', { level: 1, name: 'Groove 120' });
      expect(screen.getByText('Loading loops…')).toBeInTheDocument();
      expect(summary()).toHaveTextContent('Chorus fill: 12 min');
    });

    it('says one speed when the speed did not change', async () => {
      practised({ endSpeedRatio: 0.8 });
      serve();
      renderOverview();
      await screen.findByRole('heading', { level: 1, name: 'Groove 120' });
      expect(summary()).toHaveTextContent('Chorus fill: 12 min, 80%');
      expect(summary()).not.toHaveTextContent('→');
    });

    it('has one line per loop practised', async () => {
      practised();
      practised({
        loopId: LOOP_A,
        loopName: 'Intro',
        beganAt: BEGAN + 60_000,
        playedSeconds: 45,
        startSpeedRatio: 0.92,
        endSpeedRatio: 1,
      });
      serve();
      renderOverview();
      await screen.findByRole('heading', { level: 1, name: 'Groove 120' });
      expect(
        within(summary())
          .getAllByRole('listitem')
          .map((item) => item.textContent),
      ).toEqual(['Chorus fill: 12 min, 80% → 90%', 'Intro: 45 s, 92% → 100%']);
    });

    it('shows nothing with no sitting, and nothing for one too short to be a session', async () => {
      practised({ playedSeconds: 20 });
      serve();
      renderOverview();
      await screen.findByRole('list', { name: 'Loops on the go' });
      noSummary();
    });

    it('shows nothing for a sitting on another song', async () => {
      practised({ songId: '22222222-2222-4222-8222-222222222222' });
      serve();
      renderOverview();
      await screen.findByRole('list', { name: 'Loops on the go' });
      noSummary();
      // And it is forgotten: that song's overview won't show it later either.
      expect(readVisitSittings()).toEqual([]);
    });

    it('Dismiss takes it away and hands focus to New loop', async () => {
      practised();
      serve();
      const user = renderOverview();
      await screen.findByRole('list', { name: 'Loops on the go' });

      await user.click(within(summary()).getByRole('button', { name: 'Dismiss practice summary' }));

      noSummary();
      await waitFor(() => expect(screen.getByRole('link', { name: 'New loop' })).toHaveFocus());
      expect(readVisitSittings()).toEqual([]);
    });

    it('is gone after the overview is left and come back to', async () => {
      practised();
      serve();
      const user = renderOverview('', ['/']);
      await screen.findByRole('list', { name: 'Loops on the go' });
      expect(summary()).toBeVisible();

      await user.click(screen.getByRole('link', { name: 'Songs' }));
      expect(await screen.findByText('At songs')).toBeVisible();
      historyBack();

      await screen.findByRole('list', { name: 'Loops on the go' });
      noSummary();
    });

    it('fills in the streak once the sessions and loops are read, in a line that was already there', async () => {
      practised();
      serve();
      let answerSessions = () => {};
      const served = queryResult.getMockImplementation()!;
      queryResult.mockImplementation((call) =>
        call.table === 'practice_sessions'
          ? new Promise((resolve) => {
              answerSessions = () => resolve(ok([session(26), session(27, 18)]));
            })
          : served(call),
      );
      renderOverview();
      await screen.findByRole('list', { name: 'Loops on the go' });
      await settle();
      const extras = within(summary()).getByTestId('visit-extras');
      expect(extras).toBeEmptyDOMElement();
      // Its height is held from the start, so filling it moves nothing below.
      expect(extras).toHaveClass('min-h-5');

      act(() => answerSessions());

      expect(await within(summary()).findByText('Streak: 2 days')).toBeVisible();
      expect(within(summary()).getByTestId('visit-extras')).toBe(extras);
      expect(summary()).not.toHaveTextContent('Badge earned');
    });

    it('names a badge earned since the first sitting began, and none earned before', async () => {
      practised();
      serve();
      const served = queryResult.getMockImplementation()!;
      queryResult.mockImplementation(async (call) =>
        call.table === 'practice_sessions'
          ? // Two days running before today; the sitting's session makes three.
            ok([session(25), session(26), session(27, 18)])
          : served(call),
      );
      renderOverview();
      await screen.findByRole('heading', { level: 1, name: 'Groove 120' });

      expect(await within(summary()).findByText('Streak: 3 days')).toBeVisible();
      expect(within(summary()).getByText('Badge earned: 3-day streak')).toBeVisible();
    });

    it('leaves the streak and badges out when the sessions can’t be read', async () => {
      practised();
      serve();
      const served = queryResult.getMockImplementation()!;
      queryResult.mockImplementation(async (call) =>
        call.table === 'practice_sessions'
          ? { data: null, error: { message: 'TypeError: Failed to fetch', code: '' } }
          : served(call),
      );
      renderOverview();
      await screen.findByRole('list', { name: 'Loops on the go' });
      await settle();
      expect(summary()).toHaveTextContent('Chorus fill: 12 min, 80% → 90%');
      expect(within(summary()).getByTestId('visit-extras')).toBeEmptyDOMElement();
    });
  });
});
