import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { onlineManager, type QueryClient } from '@tanstack/react-query';
import { Route } from 'react-router';
import type { Song } from '@/features/library/songForm';
import { songKeys } from '@/features/library/useSongs';
import { loopKeys } from '@/features/loops/loopKeys';
import { offlineDb } from '@/features/offline/offlineDb';
import type { Sitting } from '@/features/practice/sittings';
import { readVisitSittings, recordVisitSitting } from '@/features/practice/visitSittings';
import type { SongLinkRow } from '@/features/recordings/songLinkForm';
import { songLinkKeys } from '@/features/recordings/songLinkKeys';
import {
  opArgs,
  queryResult,
  resetFakeSupabase,
  storageResult,
  type FakeResult,
} from '@/test/fakeSupabase';
import {
  linkRow,
  linkTable,
  playedWrites,
  SPOTIFY_URL,
  spotifyLink,
  VIDEO_ID,
  videoLink,
  WATCH_URL,
  type LinkTable,
} from '@/test/linkTable';
import { expectLocked, expectUnlocked } from '@/test/locked';
import { stubPointer } from '@/test/mediaQueries';
import { loopRow, loopTable, type LoopTable } from '@/test/loopTable';
import {
  historyBack,
  historyForward,
  renderRoutes,
  RouteMarker,
  settle,
  testQueryClient,
} from '@/test/render';
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
let links: LinkTable = linkTable();
/** The page's query client, for a test that reads the lists again as a refocus would. */
let client: QueryClient;

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

function serve(
  saved: ReturnType<typeof loopRow>[] = [older, newer, done],
  savedLinks: SongLinkRow[] = [],
) {
  loops = loopTable(saved);
  links = linkTable(savedLinks);
  queryResult.mockImplementation(async (call) => {
    if (call.table === 'loops') return loops.answer(call);
    if (call.table === 'song_links') return links.answer(call);
    if (call.table === 'practice_sessions') return ok([]);
    // "A recording was opened": the database answers with the time it kept.
    const played = opArgs(call, 'update')?.[0] as { last_played_at?: string } | undefined;
    if (played?.last_played_at) return ok({ last_played_at: played.last_played_at });
    return ok(song);
  });
}

function renderOverview(search = '', before?: string[]) {
  ({ queryClient: client } = renderRoutes(
    <>
      <Route path="/" element={<RouteMarker name="songs" />} />
      <Route path="/songs/:id" element={<SongOverviewPage />} />
      <Route path="/songs/:id/loops/:loopId" element={<RouteMarker name="practice" />} />
      <Route path="/songs/:id/play" element={<RouteMarker name="whole song" />} />
    </>,
    { path: `/songs/${SONG}${search}`, before },
  ));
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

  it('has New loop and Tab as links into the player', async () => {
    serve();
    renderOverview();
    expect(await screen.findByRole('link', { name: 'New loop' })).toHaveAttribute(
      'href',
      `/songs/${SONG}/play?new=1`,
    );
    expect(screen.getByRole('link', { name: 'Tab' })).toHaveAttribute(
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

  // 20 batch 8 (13.21, 13.35c). Held first, so the loop is seen in the other list before
  // the refusal lands and moves it back, taking the focus that followed it.
  describe('a refused status change', () => {
    const more = (list: string, loopName: string) =>
      within(screen.getByRole('list', { name: list })).getByRole('button', {
        name: `More actions for ${loopName}`,
      });

    /** "Mark finished" for Intro from its menu, refused once it is seen among the mastered. */
    async function refusedFinish() {
      serve();
      const user = renderOverview();
      const refuse = loops.holdNext('update');
      loops.failNext('update', 'nope');
      await user.click(await screen.findByRole('button', { name: 'More actions for Intro' }));
      await user.click(screen.getByRole('menuitem', { name: 'Mark finished' }));
      await waitFor(() => expect(more('Mastered loops', 'Intro')).toHaveFocus());
      refuse();
      // Looked up afresh: the loop's row is drawn anew in the list it lands back in.
      await waitFor(() =>
        expect(screen.getByRole('alert')).toHaveTextContent(
          "Couldn't mark the loop finished. Something went wrong. Try again.",
        ),
      );
      return user;
    }

    it('hands focus to the loop’s More button where it lands back, not to <body>', async () => {
      await refusedFinish();
      await waitFor(() => expect(more('Loops on the go', 'Intro')).toHaveFocus());
    });

    it('a refused Reopen hands focus back to the mastered loop’s More button', async () => {
      serve();
      const user = renderOverview();
      const refuse = loops.holdNext('update');
      loops.failNext('update', 'nope');
      await user.click(await screen.findByRole('button', { name: 'More actions for Outro' }));
      await user.click(screen.getByRole('menuitem', { name: 'Reopen' }));
      await waitFor(() => expect(more('Loops on the go', 'Outro')).toHaveFocus());
      refuse();
      await waitFor(() =>
        expect(screen.getByRole('alert')).toHaveTextContent("Couldn't reopen the loop."),
      );
      await waitFor(() => expect(more('Mastered loops', 'Outro')).toHaveFocus());
    });

    it('leaves focus where the user has since put it', async () => {
      serve();
      const user = renderOverview();
      const refuse = loops.holdNext('update');
      loops.failNext('update', 'nope');
      await user.click(await screen.findByRole('button', { name: 'More actions for Intro' }));
      await user.click(screen.getByRole('menuitem', { name: 'Mark finished' }));
      await waitFor(() => expect(more('Mastered loops', 'Intro')).toHaveFocus());
      const elsewhere = screen.getByRole('link', { name: 'New loop' });
      elsewhere.focus();
      refuse();
      await screen.findByRole('alert');
      await settle();
      expect(elsewhere).toHaveFocus();
    });

    it('Dismiss puts the message away, sends nothing, and hands focus to the loop’s More button', async () => {
      const user = await refusedFinish();

      await user.click(screen.getByRole('button', { name: /^Dismiss/ }));

      await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
      expect(screen.queryByRole('button', { name: /^Dismiss/ })).not.toBeInTheDocument();
      expect(more('Loops on the go', 'Intro')).toHaveFocus();
      expect(loops.sent('update')).toEqual([{ status: 'finished' }]);
    });

    it('is gone on coming back to the page', async () => {
      const user = await refusedFinish();

      await user.click(screen.getByRole('link', { name: 'Practise Intro' }));
      expect(await screen.findByText('At practice')).toBeInTheDocument();
      historyBack();

      await screen.findByRole('list', { name: 'Loops on the go' });
      await settle();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    // 20 batch 8, Test: what else can be on the page when the refusal lands.
    /** "Mark finished" for Intro, held: seen among the mastered, refused when called. */
    async function heldFinish() {
      serve();
      const user = renderOverview();
      const refuse = loops.holdNext('update');
      loops.failNext('update', 'nope');
      await user.click(await screen.findByRole('button', { name: 'More actions for Intro' }));
      await user.click(screen.getByRole('menuitem', { name: 'Mark finished' }));
      await waitFor(() => expect(more('Mastered loops', 'Intro')).toHaveFocus());
      return { user, refuse };
    }
    const refusalSaid = () =>
      waitFor(() =>
        expect(screen.getByRole('alert')).toHaveTextContent("Couldn't mark the loop finished."),
      );

    it('with focus fallen to <body> meanwhile, goes to the loop’s More button', async () => {
      const { refuse } = await heldFinish();
      (document.activeElement as HTMLElement).blur();
      expect(document.body).toHaveFocus();
      refuse();
      await refusalSaid();
      await waitFor(() => expect(more('Loops on the go', 'Intro')).toHaveFocus());
    });

    it('landing while the loop’s "Delete …?" question is up, takes the question away with the move and leaves focus on the loop’s More button', async () => {
      const { user, refuse } = await heldFinish();
      await user.click(more('Mastered loops', 'Intro'));
      await user.click(screen.getByRole('menuitem', { name: 'Delete' }));
      const question = await screen.findByRole('group', { name: 'Delete Intro' });
      await waitFor(() => expect(question).toHaveFocus());
      refuse();
      await refusalSaid();
      await waitFor(() => expect(more('Loops on the go', 'Intro')).toHaveFocus());
      expect(screen.queryByRole('group', { name: 'Delete Intro' })).not.toBeInTheDocument();
      expect(loops.sent('delete')).toEqual([]);
    });

    it('landing while another loop’s "Delete …?" question has focus, leaves it there', async () => {
      const { user, refuse } = await heldFinish();
      await user.click(more('Loops on the go', 'Chorus fill'));
      await user.click(screen.getByRole('menuitem', { name: 'Delete' }));
      const question = await screen.findByRole('group', { name: 'Delete Chorus fill' });
      await waitFor(() => expect(question).toHaveFocus());
      refuse();
      await refusalSaid();
      await settle();
      expect(question).toHaveFocus();
    });

    it('landing while another loop’s menu is open, leaves focus in the menu', async () => {
      const { user, refuse } = await heldFinish();
      await user.click(more('Loops on the go', 'Chorus fill'));
      const item = screen.getByRole('menuitem', { name: 'Edit' });
      await waitFor(() => expect(item).toHaveFocus());
      refuse();
      await refusalSaid();
      await settle();
      expect(screen.getByRole('menuitem', { name: 'Edit' })).toHaveFocus();
    });

    it('Dismiss by keyboard: Enter on it leaves focus on the loop’s More button, never on <body>', async () => {
      const user = await refusedFinish();
      screen.getByRole('button', { name: /^Dismiss/ }).focus();
      await user.keyboard('{Enter}');
      await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
      expect(document.body).not.toHaveFocus();
      expect(more('Loops on the go', 'Intro')).toHaveFocus();
    });

    it('a second loop refused meanwhile: each says so under its own row, and Dismiss takes one', async () => {
      const user = await refusedFinish();
      const refuse = loops.holdNext('update');
      loops.failNext('update', 'nope');
      await user.click(more('Mastered loops', 'Outro'));
      await user.click(screen.getByRole('menuitem', { name: 'Reopen' }));
      await waitFor(() => expect(more('Loops on the go', 'Outro')).toHaveFocus());
      refuse();
      await waitFor(() => expect(screen.getAllByRole('alert')).toHaveLength(2));
      await waitFor(() => expect(more('Mastered loops', 'Outro')).toHaveFocus());

      await user.click(screen.getByRole('button', { name: 'Dismiss the message about Intro' }));

      await waitFor(() => expect(screen.getAllByRole('alert')).toHaveLength(1));
      expect(screen.getByRole('alert')).toHaveTextContent("Couldn't reopen the loop.");
      expect(more('Loops on the go', 'Intro')).toHaveFocus();
    });

    // The page that asked has gone when the answer comes, to a screen with no status
    // controls: nothing heard it. The message is the only sign the change did not hold.
    it('refused after the page was left: said on coming back, with Dismiss, and without taking focus', async () => {
      const { user, refuse } = await heldFinish();
      await user.click(screen.getByRole('link', { name: 'Practise Chorus fill' }));
      expect(await screen.findByText('At practice')).toBeInTheDocument();
      // Past the tick in which leaving puts refusals away.
      await settle();
      refuse();
      await waitFor(() =>
        expect(client.getMutationCache().findAll({ status: 'error' })).toHaveLength(1),
      );
      historyBack();

      await refusalSaid();
      expect(
        within(screen.getByRole('list', { name: 'Loops on the go' })).getByRole('alert'),
      ).toBeInTheDocument();
      await settle();
      const focused = document.activeElement;
      expect(focused === document.body || !focused?.closest('[data-item]')).toBe(true);

      await user.click(screen.getByRole('button', { name: /^Dismiss/ }));
      await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
      expect(more('Loops on the go', 'Intro')).toHaveFocus();
    });
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

describe('SongOverviewPage recordings (Unit 14)', () => {
  const original = videoLink();
  const drumless = spotifyLink();
  const playAlong = () => screen.getByRole('region', { name: 'Play along' });
  /** No recording: the block has the tab's button, and no link to anything else. */
  const noRecordingButtons = () =>
    expect(
      within(playAlong())
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['Tab']);
  const form = () => screen.getByRole('form', { name: 'Recordings' });
  const noForm = () =>
    expect(screen.queryByRole('form', { name: 'Recordings' })).not.toBeInTheDocument();
  const field = (name: string) =>
    within(form()).getByRole('textbox', { name: new RegExp(`^${name}`) });
  const save = () => within(form()).getByRole('button', { name: /^(Save|Saving…)$/ });
  const formButton = (name: string) => within(form()).getByRole('button', { name });
  /** The form's Save has been pressed and its answer isn't in. */
  const savingShown = () => within(form()).findByRole('button', { name: 'Saving…' });
  /** The form's alert: a refused field's, or a failed save's. */
  const formAlert = () => within(form()).findByRole('alert');
  /** Nothing is said on the overview about a save of the recordings. */
  const noOverviewAlert = () =>
    expect(within(playAlong()).queryByRole('alert')).not.toBeInTheDocument();
  /** What the fake client answers for a request that never reached the server. */
  const dropped = { message: 'TypeError: Failed to fetch', code: '' };
  const headerMenu = () => screen.getByRole('button', { name: 'More actions for Groove 120' });
  const linkWrites = () => [
    ...links.sent('insert'),
    ...links.sent('update'),
    ...links.sent('delete'),
  ];

  /** Opens the form from "Add a recording", as a song with no links does, once that is offered. */
  async function addRecording(user: ReturnType<typeof userEvent.setup>) {
    await user.click(await screen.findByRole('button', { name: 'Add a recording' }));
  }

  /** Opens the form from the header's menu, as a song that already has links does. */
  async function manage(user: ReturnType<typeof userEvent.setup>) {
    await user.click(headerMenu());
    await user.click(screen.getByRole('menuitem', { name: 'Manage recordings' }));
    return form();
  }

  async function opened(savedLinks: SongLinkRow[] = []) {
    serve(undefined, savedLinks);
    const user = renderOverview();
    await screen.findByRole('list', { name: 'Loops on the go' });
    await waitFor(() =>
      expect(queryResult.mock.calls.some(([c]) => c.table === 'song_links')).toBe(true),
    );
    return user;
  }

  describe('a song with no links', () => {
    it('has the tab under Play along and a quiet Add a recording, and loads nothing of YouTube’s', async () => {
      await opened();
      expect(await screen.findByRole('button', { name: 'Add a recording' })).toBeVisible();
      expect(screen.getByRole('link', { name: 'Tab' })).toBeVisible();
      expect(screen.getByRole('link', { name: 'New loop' })).toBeVisible();
      noRecordingButtons();
      expect(document.querySelector('iframe')).toBeNull();
      expect(document.querySelector('script[src*="youtube"]')).toBeNull();
    });

    it('doesn’t offer Add a recording until the links are read, and says when they can’t be', async () => {
      serve();
      links.failNext('select', dropped);
      const user = renderOverview();
      expect(await screen.findByText(/Couldn't load this song's recordings\./)).toHaveTextContent(
        "The server couldn't be reached.",
      );
      expect(screen.queryByRole('button', { name: 'Add a recording' })).not.toBeInTheDocument();
      // The tab is still a tap away.
      expect(screen.getByRole('link', { name: 'Tab' })).toBeVisible();

      await user.click(
        within(
          screen.getByText(/Couldn't load this song's recordings\./).closest('[role="alert"]')!,
        ).getByRole('button', { name: 'Try again' }),
      );
      expect(await screen.findByRole('button', { name: 'Add a recording' })).toBeVisible();
    });

    it('adds a first link: the form takes focus, says what the link is, and saves it in its normal form', async () => {
      const user = await opened();
      await addRecording(user);
      // In place of the button that opened it; no field is focused, so no phone keyboard comes up.
      expect(form()).toHaveFocus();

      await user.type(field('Original'), `https://youtu.be/${VIDEO_ID}?si=abc123&t=90`);
      expect(form()).toHaveTextContent('YouTube video, starting at 1:30. Plays here');
      await user.click(save());

      await waitFor(() => noForm());
      expect(links.sent('insert')).toEqual([
        {
          id: expect.any(String),
          kind: 'original',
          provider: 'youtube',
          url: `${WATCH_URL}&t=90s`,
          song_id: SONG,
          user_id: 'user-1',
        },
      ]);
      // The new button is there at once, beside "Tab".
      const buttons = within(playAlong());
      expect(buttons.getByRole('link', { name: 'Tab' })).toHaveAttribute(
        'href',
        `/songs/${SONG}/play`,
      );
      expect(buttons.getByRole('link', { name: 'Original' })).toHaveAttribute(
        'href',
        `/songs/${SONG}/play?source=original`,
      );
      // "Add a recording" has gone with the empty state: focus is on the header's menu, which manages them now.
      await waitFor(() => expect(headerMenu()).toHaveFocus());
    });

    it('Cancel saves nothing and hands focus back to Add a recording', async () => {
      const user = await opened();
      await addRecording(user);
      await user.type(field('Original'), WATCH_URL);
      await user.click(formButton('Cancel'));

      noForm();
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Add a recording' })).toHaveFocus(),
      );
      await settle();
      expect(linkWrites()).toEqual([]);
    });

    it.each([
      ['javascript:alert(1)', 'Only links that start with https:// can be saved.'],
      ['the one from the lesson', "That isn't a link."],
      [
        `https://youtube.com.evil.test/watch?v=${VIDEO_ID}`,
        'That address only looks like YouTube or Spotify.',
      ],
      [
        `http://www.youtube.com/watch?v=${VIDEO_ID}`,
        'Only links that start with https:// can be saved.',
      ],
      // 14 QA issue 5: refused for its sign-in details, and told so, not called a look-alike.
      [
        'https://user:pw@example.com/x',
        'That address has a sign-in name or password in it, before an @.',
      ],
    ])(
      'refuses %s with fixed copy, saves nothing and puts focus on the field',
      async (text, copy) => {
        const user = await opened();
        await addRecording(user);
        await user.type(field('Original'), text);
        // A good link in another field doesn't get saved alone.
        await user.type(field('Drumless'), SPOTIFY_URL);
        await user.click(save());

        expect(await formAlert()).toHaveTextContent(copy);
        expect(within(form()).getByRole('alert')).not.toHaveTextContent('evil');
        expect(field('Original')).toHaveAttribute('aria-invalid', 'true');
        expect(field('Original')).toHaveFocus();
        await settle();
        expect(linkWrites()).toEqual([]);

        // Typing again clears the message; a good link then saves both.
        await user.clear(field('Original'));
        expect(within(form()).queryByRole('alert')).not.toBeInTheDocument();
        await user.type(field('Original'), WATCH_URL);
        await user.click(save());
        await waitFor(() => expect(links.rows()).toHaveLength(2));
      },
    );

    it('Save with nothing typed closes the form and sends nothing', async () => {
      const user = await opened();
      await addRecording(user);
      await user.click(save());
      noForm();
      await settle();
      expect(linkWrites()).toEqual([]);
    });
  });

  describe('a song with links', () => {
    it('has a button per way of hearing it: Tab, Original, Drumless, in that order', async () => {
      await opened([drumless, original]);
      const names = within(await screen.findByTestId('play-along-buttons'))
        .getAllByRole('link')
        .map((link) => link.textContent);
      expect(names).toEqual(['Tab', 'Original', 'Drumless on Spotify (opens in a new tab)']);
      // The loops and New loop are where they were; Add a recording isn't needed.
      expect(screen.getByRole('link', { name: 'New loop' })).toBeVisible();
      expect(screen.queryByRole('button', { name: 'Add a recording' })).not.toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Practise Intro' })).toBeVisible();
    });

    it('a YouTube link opens the play screen on that source', async () => {
      const user = await opened([original]);
      await user.click(await screen.findByRole('link', { name: 'Original' }));
      expect(screen.getByTestId('location')).toHaveTextContent(
        `/songs/${SONG}/play?source=original`,
      );
      // Opening the screen is what counts as playing; the button itself writes nothing.
      expect(playedWrites()).toEqual([]);
    });

    it('a Spotify link leaves the app: a new tab, nothing passed on, named for where it goes', async () => {
      await opened([drumless]);
      const link = await screen.findByRole('link', { name: /^Drumless on Spotify/ });
      expect(link).toHaveAttribute('href', SPOTIFY_URL);
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    });

    it('a link out counts as playing the song: a queued write of now, kept until answered', async () => {
      vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-27T18:30:00Z') });
      try {
        await opened([drumless]);
        const link = await screen.findByRole('link', { name: /^Drumless on Spotify/ });
        // Not cancelled: the browser opens Spotify.
        expect(fireEvent.click(link)).toBe(true);

        await waitFor(() => expect(playedWrites()).toHaveLength(1));
        expect(opArgs(playedWrites()[0]!, 'update')).toEqual([
          { last_played_at: '2026-11-27T18:30:00.000Z' },
        ]);
        await waitFor(async () => expect(await offlineDb.outbox.count()).toBe(0));
      } finally {
        vi.useRealTimers();
      }
    });

    it('lists other links under the buttons, each one line, opening in a new tab', async () => {
      const long = linkRow('long', { url: `https://example.com/${'a'.repeat(300)}` });
      await opened([
        original,
        linkRow('lesson', { url: 'https://www.drumeo.com/lesson?id=7' }),
        long,
      ]);
      const others = within(await screen.findByRole('list', { name: 'Other links' })).getAllByRole(
        'link',
      );
      expect(others).toHaveLength(2);
      expect(others[0]).toHaveTextContent('drumeo.com/lesson?id=7');
      expect(others[0]).toHaveAttribute('href', 'https://www.drumeo.com/lesson?id=7');
      expect(others[0]).toHaveAttribute('target', '_blank');
      expect(others[0]).toHaveAttribute('rel', 'noopener noreferrer');
      // The whole address is there for a pointer, the line itself is cut short.
      expect(others[1]).toHaveAttribute('title', long.url);
      expect(others[1]!.querySelector('.line-clamp-1')).not.toBeNull();
    });

    it('never draws a saved address the parser refuses, whatever its row says it is', async () => {
      await opened([
        original,
        linkRow('bad', { kind: 'drumless', provider: 'youtube', url: 'javascript:alert(1)' }),
        linkRow('fake', { url: `https://youtube.com.evil.test/watch?v=${VIDEO_ID}` }),
      ]);
      await screen.findByRole('link', { name: 'Original' });
      expect(screen.queryByRole('link', { name: /Drumless/ })).not.toBeInTheDocument();
      expect(screen.queryByRole('list', { name: 'Other links' })).not.toBeInTheDocument();
      expect(document.querySelector('a[href^="javascript"]')).toBeNull();
    });

    it('adds a second kind from Manage recordings in the header’s menu', async () => {
      const user = await opened([original]);
      await screen.findByRole('link', { name: 'Original' });
      await manage(user);
      expect(form()).toHaveFocus();
      expect(field('Original')).toHaveValue(WATCH_URL);

      await user.type(
        field('Drumless'),
        `https://open.spotify.com/intl-de/track/4uLU6hMCjMI75M1A2tKUQC?si=abc`,
      );
      expect(form()).toHaveTextContent(
        "Spotify track. Opens Spotify, which can't slow a song down",
      );
      await user.click(save());

      await waitFor(() => noForm());
      expect(links.sent('insert')).toMatchObject([
        { kind: 'drumless', provider: 'spotify', url: SPOTIFY_URL },
      ]);
      // The one that was there isn't written again.
      expect(links.sent('update')).toEqual([]);
      expect(await screen.findByRole('link', { name: /^Drumless on Spotify/ })).toBeVisible();
      await waitFor(() => expect(headerMenu()).toHaveFocus());
    });

    it('points a saved link somewhere else, sending only where it points', async () => {
      const user = await opened([original]);
      await screen.findByRole('link', { name: 'Original' });
      await manage(user);
      await user.clear(field('Original'));
      await user.type(field('Original'), SPOTIFY_URL);
      await user.click(save());

      await waitFor(() =>
        expect(links.sent('update')).toEqual([{ provider: 'spotify', url: SPOTIFY_URL }]),
      );
      expect(links.sent('insert')).toEqual([]);
      expect(await screen.findByRole('link', { name: /^Original on Spotify/ })).toHaveAttribute(
        'href',
        SPOTIFY_URL,
      );
    });

    it('Remove only empties the field; the link goes at Save, and the page is as it was before any link', async () => {
      const user = await opened([original]);
      await screen.findByRole('link', { name: 'Original' });
      await manage(user);
      const remove = formButton('Remove Original');
      await user.click(remove);

      expect(field('Original')).toHaveValue('');
      expect(form()).toHaveTextContent('This link is removed when you save.');
      // The button stays, locked, with focus on it.
      expect(remove).toHaveFocus();
      expectLocked(remove);
      await settle();
      expect(linkWrites()).toEqual([]);

      await user.click(save());
      await waitFor(() => expect(links.sent('delete')).toEqual([[original.id]]));
      await waitFor(() => noRecordingButtons());
      expect(screen.getByRole('link', { name: 'Tab' })).toBeVisible();
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Add a recording' })).toHaveFocus(),
      );
    });

    it('Cancel after Remove keeps the link', async () => {
      const user = await opened([original]);
      await screen.findByRole('link', { name: 'Original' });
      await manage(user);
      await user.click(formButton('Remove Original'));
      await user.click(formButton('Cancel'));
      expect(await screen.findByRole('link', { name: 'Original' })).toBeVisible();
      await settle();
      expect(linkWrites()).toEqual([]);
      expect(headerMenu()).toHaveFocus();
    });

    it('adds, changes and removes other links in one Save', async () => {
      const lesson = linkRow('lesson', { url: 'https://example.com/lesson' });
      const cover = linkRow('cover', {
        url: 'https://example.com/cover',
        created_at: '2026-11-22T12:00:00Z',
      });
      const user = await opened([original, lesson, cover]);
      await screen.findByRole('link', { name: 'Original' });
      await manage(user);

      await user.click(formButton('Remove Other link 1'));
      await user.clear(field('Other link 2'));
      await user.type(field('Other link 2'), 'example.com/cover-2');
      await user.click(formButton('Add another link'));
      // The new field has focus: the paste goes straight in.
      expect(field('Other link 3')).toHaveFocus();
      await user.type(field('Other link 3'), `https://youtu.be/${VIDEO_ID}`);
      await user.click(save());

      await waitFor(() => noForm());
      expect(links.sent('delete')).toEqual([['lesson']]);
      expect(links.sent('update')).toEqual([
        { provider: 'web', url: 'https://example.com/cover-2' },
      ]);
      expect(links.sent('insert')).toMatchObject([
        { kind: 'other', provider: 'youtube', url: WATCH_URL },
      ]);
      expect(
        within(await screen.findByRole('list', { name: 'Other links' }))
          .getAllByRole('link')
          .map((link) => link.getAttribute('href')),
      ).toEqual(['https://example.com/cover-2', WATCH_URL]);
    });

    it('an added link that is removed again goes at once, and focus to Add another link', async () => {
      const user = await opened([original]);
      await screen.findByRole('link', { name: 'Original' });
      await manage(user);
      await user.click(formButton('Add another link'));
      await user.click(formButton('Remove Other link 1'));
      expect(
        within(form()).queryByRole('textbox', { name: /^Other link/ }),
      ).not.toBeInTheDocument();
      await waitFor(() => expect(formButton('Add another link')).toHaveFocus());
    });

    it('shows a link saved on another device under a field nobody touched', async () => {
      const user = await opened([original]);
      await screen.findByRole('link', { name: 'Original' });
      await manage(user);
      await user.type(field('Drumless'), SPOTIFY_URL);
      links.setRows([{ ...original, url: `${WATCH_URL}&t=30s` }]);
      await act(() => client.invalidateQueries());
      await waitFor(() => expect(field('Original')).toHaveValue(`${WATCH_URL}&t=30s`));
      // What was typed stays.
      expect(field('Drumless')).toHaveValue(SPOTIFY_URL);
    });
  });

  describe('a save in flight, refused or lost', () => {
    it('locks the fields and every way out of the form until the answer', async () => {
      const user = await opened();
      await addRecording(user);
      await user.type(field('Original'), WATCH_URL);
      const release = links.holdNext('insert');
      await user.click(save());

      expect(await within(form()).findByRole('button', { name: 'Saving…' })).toHaveFocus();
      expectLocked(save());
      const cancel = formButton('Cancel');
      expectLocked(cancel);
      expect(field('Original')).toHaveAttribute('readonly');
      // Typed text, Cancel, a second Save and the menu's item all change nothing.
      await user.type(field('Drumless'), 'x');
      expect(field('Drumless')).toHaveValue('');
      await user.click(cancel);
      await user.click(save());
      await manage(user);
      expect(form()).toBeVisible();

      release();
      await waitFor(() => noForm());
      expect(links.sent('insert')).toHaveLength(1);
    });

    it('says a refusal in fixed copy and keeps the form and what was typed', async () => {
      const user = await opened();
      await addRecording(user);
      await user.type(field('Original'), WATCH_URL);
      links.failNext('insert', {
        message: 'permission denied for table song_links',
        code: '42501',
      });
      await user.click(save());

      const alert = await formAlert();
      expect(alert).toHaveTextContent("Couldn't save the recordings. The server refused it.");
      expect(alert).not.toHaveTextContent('permission denied');
      expect(field('Original')).toHaveValue(WATCH_URL);
      expect(links.rows()).toEqual([]);

      // Pressed again, it goes through, under the same id.
      await user.click(save());
      await waitFor(() => noForm());
      const ids = links.sent('insert').map((sent) => (sent as { id: string }).id);
      expect(ids).toHaveLength(2);
      expect(ids[0]).toBe(ids[1]);
    });

    it('a save whose answer was lost and is pressed again adds the link once', async () => {
      const user = await opened();
      await addRecording(user);
      await user.click(formButton('Add another link'));
      await user.type(field('Other link 1'), 'https://example.com/lesson');
      links.loseNext('insert');
      await user.click(save());

      expect(await formAlert()).toHaveTextContent(
        "Couldn't save the recordings. The server couldn't be reached.",
      );
      expect(links.rows()).toHaveLength(1);
      // The field shows it once, saved; the text can still be changed before the next Save.
      await waitFor(() =>
        expect(within(form()).getAllByRole('textbox', { name: /^Other link/ })).toHaveLength(1),
      );
      await user.clear(field('Other link 1'));
      await user.type(field('Other link 1'), 'https://example.com/lesson-2');
      await user.click(save());

      await waitFor(() => noForm());
      expect(links.rows()).toMatchObject([{ url: 'https://example.com/lesson-2' }]);
    });

    it('stops at the first step refused, and the form then shows what did get through', async () => {
      const lesson = linkRow('lesson', { url: 'https://example.com/lesson' });
      const user = await opened([original, lesson]);
      await screen.findByRole('link', { name: 'Original' });
      await manage(user);
      await user.click(formButton('Remove Other link 1'));
      await user.clear(field('Original'));
      await user.type(field('Original'), SPOTIFY_URL);
      await user.type(field('Drumless'), 'https://example.com/drumless');
      links.failNext('update');
      await user.click(save());

      expect(await formAlert()).toHaveTextContent('Some changes may have been saved');
      // The removal went, the update was refused, and the insert after it was never sent.
      expect(links.sent('delete')).toEqual([['lesson']]);
      expect(links.sent('insert')).toEqual([]);
      await waitFor(() =>
        expect(
          within(form()).queryByRole('textbox', { name: /^Other link/ }),
        ).not.toBeInTheDocument(),
      );
      expect(field('Original')).toHaveValue(SPOTIFY_URL);
      expect(field('Drumless')).toHaveValue('https://example.com/drumless');
    });
  });

  // 14 Test: what else can happen round a save, and a read that fails over what is showing.
  describe('other tabs, other reads and other ways out (14 Test)', () => {
    const linksKey = songLinkKeys.forSong('user-1', SONG);

    it('locks Remove and Add another link too while the save is on its way', async () => {
      const lesson = linkRow('lesson', { url: 'https://example.com/lesson' });
      const user = await opened([original, lesson]);
      await screen.findByRole('link', { name: 'Original' });
      await manage(user);
      await user.type(field('Drumless'), SPOTIFY_URL);
      const release = links.holdNext('insert');
      await user.click(save());
      await savingShown();

      const removeOriginal = formButton('Remove Original');
      const addAnother = formButton('Add another link');
      for (const control of [removeOriginal, addAnother]) expectLocked(control);
      await user.click(removeOriginal);
      await user.click(formButton('Remove Other link 1'));
      await user.click(addAnother);
      expect(field('Original')).toHaveValue(WATCH_URL);
      expect(within(form()).getAllByRole('textbox', { name: /^Other link/ })).toHaveLength(1);
      expect(field('Other link 1')).toHaveValue('https://example.com/lesson');

      release();
      await waitFor(() => noForm());
      // Only what was typed before the press was sent.
      expect(links.sent('delete')).toEqual([]);
      expect(links.sent('update')).toEqual([]);
      expect(links.sent('insert')).toHaveLength(1);
      expect(links.rows()).toHaveLength(3);
    });

    it('an Original saved in another tab while one is typed here is refused once, then the same field points that row at what was typed', async () => {
      const user = await opened();
      await addRecording(user);
      await user.type(field('Original'), WATCH_URL);
      // The other tab's save is in the database; this tab hasn't read the list since.
      const theirs = spotifyLink('theirs', { kind: 'original' });
      links.setRows([theirs]);
      await user.click(save());

      expect(await formAlert()).toHaveTextContent(
        "Couldn't save the recordings. The server refused it.",
      );
      expect(links.rows()).toEqual([theirs]);
      // The list is read again: the field now stands for their row, and keeps what was typed.
      expect(await within(form()).findByRole('button', { name: 'Remove Original' })).toBeVisible();
      expect(field('Original')).toHaveValue(WATCH_URL);

      await user.click(save());
      await waitFor(() => noForm());
      expect(links.sent('insert')).toHaveLength(1);
      expect(links.rows()).toEqual([{ ...theirs, provider: 'youtube', url: WATCH_URL }]);
      expect(await screen.findByRole('link', { name: 'Original' })).toHaveAttribute(
        'href',
        `/songs/${SONG}/play?source=original`,
      );
    });

    it('a link saved in another tab shows here at the next read, without the page being touched', async () => {
      await opened();
      const add = await screen.findByRole('button', { name: 'Add a recording' });
      add.focus();
      links.setRows([original, drumless]);
      await act(() => client.invalidateQueries({ queryKey: linksKey }));

      const names = within(await screen.findByTestId('play-along-buttons'))
        .getAllByRole('link')
        .map((link) => link.textContent);
      expect(names).toEqual(['Tab', 'Original', 'Drumless on Spotify (opens in a new tab)']);
      noForm();
    });

    it('a link removed in another tab leaves here at the next read, and the page is as it was before any link', async () => {
      await opened([original]);
      await screen.findByRole('link', { name: 'Original' });
      links.setRows([]);
      await act(() => client.invalidateQueries({ queryKey: linksKey }));
      await waitFor(() => noRecordingButtons());
      expect(screen.getByRole('link', { name: 'Tab' })).toBeVisible();
      expect(screen.getByRole('button', { name: 'Add a recording' })).toBeVisible();
    });

    it('a read from before the save that answers after it doesn’t take the new link away', async () => {
      const user = await opened();
      await addRecording(user);
      await user.type(field('Original'), WATCH_URL);

      // A read of the links goes out (the window was focused, say) and hangs.
      let answerStale!: () => void;
      const stale = new Promise<FakeResult>((resolve) => (answerStale = () => resolve(ok([]))));
      const served = queryResult.getMockImplementation()!;
      let held = false;
      queryResult.mockImplementation(async (call) => {
        const isRead =
          call.table === 'song_links' &&
          !['insert', 'update', 'delete'].some((method) => opArgs(call, method));
        if (isRead && !held) {
          held = true;
          return stale;
        }
        return served(call);
      });
      void client.refetchQueries({ queryKey: linksKey });
      await waitFor(() => expect(held).toBe(true));

      await user.click(save());
      await waitFor(() => noForm());
      expect(await screen.findByRole('link', { name: 'Original' })).toBeVisible();
      // The old answer arrives now: it says the song has no links.
      await act(async () => {
        answerStale();
        await stale;
      });
      await settle();
      expect(screen.getByRole('link', { name: 'Original' })).toBeVisible();
      expect(screen.queryByRole('button', { name: 'Add a recording' })).not.toBeInTheDocument();
      expect(client.getQueryData<SongLinkRow[]>(linksKey)).toMatchObject([{ url: WATCH_URL }]);
    });

    it('a read that fails over the links keeps the buttons, and the form still edits what is saved', async () => {
      const user = await opened([original, drumless]);
      await screen.findByRole('link', { name: 'Original' });
      links.failNext('select', dropped);
      await act(() => client.invalidateQueries({ queryKey: linksKey }));

      // The read did fail, with the rows still there: only then is "still showing" worth asserting.
      await waitFor(() => expect(client.getQueryState(linksKey)?.status).toBe('error'));
      expect(client.getQueryData(linksKey)).toHaveLength(2);
      expect(screen.getByRole('link', { name: 'Original' })).toBeVisible();
      expect(screen.getByRole('link', { name: /^Drumless on Spotify/ })).toBeVisible();
      expect(screen.queryByText(/Couldn't load this song's recordings/)).not.toBeInTheDocument();

      await manage(user);
      expect(field('Original')).toHaveValue(WATCH_URL);
      expect(field('Drumless')).toHaveValue(SPOTIFY_URL);
      expect(within(form()).queryByRole('alert')).not.toBeInTheDocument();
      expectUnlocked(save());
      expect(save()).toBeEnabled();
    });

    it('a removal whose answer was lost and is pressed again asks for nothing more and closes', async () => {
      const user = await opened([original]);
      await screen.findByRole('link', { name: 'Original' });
      await manage(user);
      await user.click(formButton('Remove Original'));
      links.loseNext('delete');
      await user.click(save());

      expect(await formAlert()).toHaveTextContent(
        "The server couldn't be reached. Check the connection and try again. Some changes may have been saved",
      );
      expect(links.rows()).toEqual([]);
      // Read again, the field is an empty new one: there is nothing saved to remove.
      await waitFor(() =>
        expect(
          within(form()).queryByRole('button', { name: 'Remove Original' }),
        ).not.toBeInTheDocument(),
      );
      expect(field('Original')).toHaveValue('');

      await user.click(save());
      await waitFor(() => noForm());
      expect(links.sent('delete')).toEqual([[original.id]]);
      expect(links.sent('insert')).toEqual([]);
      expect(await screen.findByRole('button', { name: 'Add a recording' })).toBeVisible();
      expect(screen.getByRole('link', { name: 'Tab' })).toBeVisible();
    });

    it('a change whose answer was lost and is pressed again sends the same change, and ends with one link', async () => {
      const user = await opened([original]);
      await screen.findByRole('link', { name: 'Original' });
      await manage(user);
      await user.clear(field('Original'));
      await user.type(field('Original'), SPOTIFY_URL);
      links.loseNext('update');
      await user.click(save());
      expect(await formAlert()).toHaveTextContent("The server couldn't be reached.");
      expect(links.rows()).toMatchObject([{ id: original.id, url: SPOTIFY_URL }]);

      await user.click(save());
      await waitFor(() => noForm());
      expect(links.sent('insert')).toEqual([]);
      expect(links.rows()).toMatchObject([
        { id: original.id, provider: 'spotify', url: SPOTIFY_URL },
      ]);
      expect(await screen.findByRole('link', { name: /^Original on Spotify/ })).toBeVisible();
    });

    // 14 Test, bug 3 (fixed here): an update that matches no row is no error to PostgREST, so
    // the form used to close as if it had saved, and the next read showed no link at all.
    it('a link changed here after another tab removed it: the form says it has been deleted, and Save again adds it', async () => {
      const user = await opened([original]);
      await screen.findByRole('link', { name: 'Original' });
      await manage(user);
      await user.clear(field('Original'));
      await user.type(field('Original'), SPOTIFY_URL);
      links.setRows([]);
      await user.click(save());

      expect(await formAlert()).toHaveTextContent(
        "Couldn't save the recordings. It has been deleted, on this device or another.",
      );
      expect(links.sent('update')).toHaveLength(1);
      expect(links.rows()).toEqual([]);
      // Read again, the field is a new one that keeps what was typed.
      await waitFor(() =>
        expect(
          within(form()).queryByRole('button', { name: 'Remove Original' }),
        ).not.toBeInTheDocument(),
      );
      expect(field('Original')).toHaveValue(SPOTIFY_URL);

      await user.click(save());
      await waitFor(() => noForm());
      expect(links.rows()).toMatchObject([
        { kind: 'original', provider: 'spotify', url: SPOTIFY_URL },
      ]);
      expect(await screen.findByRole('link', { name: /^Original on Spotify/ })).toBeVisible();
    });

    it('a step after a link that has gone isn’t sent: the save stops there, as at any refusal', async () => {
      const lesson = linkRow('lesson', { url: 'https://example.com/lesson' });
      const user = await opened([original, lesson]);
      await screen.findByRole('link', { name: 'Original' });
      await manage(user);
      await user.clear(field('Other link 1'));
      await user.type(field('Other link 1'), 'https://example.com/lesson-2');
      await user.type(field('Drumless'), SPOTIFY_URL);
      // Another device removes the lesson.
      links.setRows([original]);
      await user.click(save());

      expect(await formAlert()).toHaveTextContent(
        'It has been deleted, on this device or another. Some changes may have been saved',
      );
      expect(links.sent('insert')).toEqual([]);
      // Its field goes with it; what was typed elsewhere stays for the next press.
      await waitFor(() =>
        expect(
          within(form()).queryByRole('textbox', { name: /^Other link/ }),
        ).not.toBeInTheDocument(),
      );
      expect(field('Drumless')).toHaveValue(SPOTIFY_URL);
      await user.click(save());
      await waitFor(() => noForm());
      expect(links.rows()).toMatchObject([{ id: original.id }, { kind: 'drumless' }]);
    });

    // The page's own links aren't locked while the form saves (Build's known gap; 14 Test,
    // bug 2): what holds is that the save still lands and the page shows it on return.
    it('left by one of the page’s links while the save is on its way, the save still lands and shows on return', async () => {
      const user = await opened();
      await addRecording(user);
      await user.type(field('Original'), WATCH_URL);
      const release = links.holdNext('insert');
      await user.click(save());
      await savingShown();

      await user.click(screen.getByRole('link', { name: 'New loop' }));
      expect(await screen.findByText('At whole song')).toBeVisible();
      release();
      await waitFor(() => expect(links.rows()).toHaveLength(1));
      await waitFor(() =>
        expect(client.getQueryData<SongLinkRow[]>(linksKey)).toMatchObject([{ url: WATCH_URL }]),
      );

      historyBack();
      expect(await screen.findByRole('link', { name: 'Original' })).toBeVisible();
      noForm();
      expect(links.sent('insert')).toHaveLength(1);
    });

    it('on a cold start offline with the song cached but its links never read, offers the tab and asks for nothing', async () => {
      serve();
      const queryClient = testQueryClient();
      queryClient.setQueryData(songKeys.detail('user-1', SONG), song);
      queryClient.setQueryData(loopKeys.forSong('user-1', SONG), [older]);
      act(() => onlineManager.setOnline(false));
      renderRoutes(<Route path="/songs/:id" element={<SongOverviewPage />} />, {
        path: `/songs/${SONG}`,
        queryClient,
      });

      expect(await screen.findByRole('link', { name: 'Tab' })).toBeVisible();
      expect(screen.getByRole('link', { name: 'New loop' })).toBeVisible();
      await settle();
      // Not known to be none, so not offered; and not a failure either.
      expect(screen.queryByRole('button', { name: 'Add a recording' })).not.toBeInTheDocument();
      expect(screen.queryByText(/Couldn't load this song's recordings/)).not.toBeInTheDocument();
      noRecordingButtons();
      expect(queryResult.mock.calls.filter(([call]) => call.table === 'song_links')).toEqual([]);

      // Back online the links are read and the way in appears.
      act(() => onlineManager.setOnline(true));
      expect(await screen.findByRole('button', { name: 'Add a recording' })).toBeVisible();
    });
  });

  describe('offline', () => {
    it('shows the buttons from the cached links, off, and says why; the tab still opens', async () => {
      const user = await opened([original, drumless, linkRow('lesson')]);
      await screen.findByRole('link', { name: 'Original' });
      act(() => onlineManager.setOnline(false));

      const video = screen.getByRole('link', { name: 'Original' });
      const spotify = screen.getByRole('link', { name: /^Drumless on Spotify/ });
      const other = within(screen.getByRole('list', { name: 'Other links' })).getByRole('link');
      for (const control of [video, spotify, other]) expectLocked(control);
      const note = within(playAlong()).getByTestId('offline-note');
      expect(note).toHaveTextContent("You're offline. Recordings need a connection");
      // Above the list of other links, beside the buttons it is about (14 QA issue 8).
      expect(
        note.compareDocumentPosition(screen.getByRole('list', { name: 'Other links' })) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expectUnlocked(screen.getByRole('link', { name: 'Tab' }));

      // The presses are refused: no navigation, no new tab, nothing recorded as played.
      await user.click(video);
      expect(screen.getByTestId('location')).toHaveTextContent(new RegExp(`^/songs/${SONG}$`));
      expect(fireEvent.click(spotify)).toBe(false);
      expect(fireEvent.click(other)).toBe(false);
      await settle();
      expect(playedWrites()).toEqual([]);
      expect(await offlineDb.outbox.count()).toBe(0);

      // Back online the same button is heard.
      act(() => onlineManager.setOnline(true));
      expectUnlocked(screen.getByRole('link', { name: 'Original' }));
      await user.click(screen.getByRole('link', { name: 'Original' }));
      expect(screen.getByTestId('location')).toHaveTextContent('?source=original');
    });

    it('refuses a press made before the button has caught up with the connection going', async () => {
      await opened([drumless]);
      const spotify = await screen.findByRole('link', { name: /^Drumless on Spotify/ });
      let allowed = true;
      act(() => {
        onlineManager.setOnline(false);
        allowed = fireEvent.click(spotify);
      });
      expect(allowed).toBe(false);
      await settle();
      expect(playedWrites()).toEqual([]);
    });

    it('the form’s Save is off with a note, an Enter in a field sends nothing, and it works once back', async () => {
      const user = await opened([original]);
      await screen.findByRole('link', { name: 'Original' });
      await manage(user);
      await user.type(field('Drumless'), SPOTIFY_URL);
      act(() => onlineManager.setOnline(false));

      expect(save()).toBeDisabled();
      expect(within(form()).getByTestId('offline-note')).toHaveTextContent(
        "You're offline. Recordings can be changed once you're back online.",
      );
      // An Enter in a form whose submit is disabled submits nothing, so reach the handler itself.
      fireEvent.submit(form());
      await settle();
      expect(linkWrites()).toEqual([]);
      expect(field('Drumless')).toHaveValue(SPOTIFY_URL);

      act(() => onlineManager.setOnline(true));
      await user.click(save());
      await waitFor(() => expect(links.sent('insert')).toHaveLength(1));
    });

    it('fails a save whose connection drops rather than leaving it waiting', async () => {
      const user = await opened();
      await addRecording(user);
      await user.type(field('Original'), WATCH_URL);
      links.failNext('insert', dropped);
      await user.click(save());
      expect(await formAlert()).toHaveTextContent("The server couldn't be reached.");
      expect(save()).toHaveTextContent('Save');
    });
  });

  describe('QA fix round 1', () => {
    afterEach(() => vi.unstubAllGlobals());

    // Issue 7: on a cold load the links arrive after the page is drawn. What is already there
    // stays the same element in the same place; what comes joins the end of the buttons' row.
    it('keeps Tab, the heading and New loop where they are when the links arrive', async () => {
      serve(undefined, [original, drumless]);
      const release = links.holdNext('select');
      renderOverview();
      const tab = await screen.findByRole('link', { name: 'Tab' });
      const newLoop = screen.getByRole('link', { name: 'New loop' });
      const heading = screen.getByRole('heading', { name: 'Play along' });
      const row = screen.getByTestId('play-along-buttons');
      const block = playAlong();
      expect([...row.children]).toEqual([tab]);
      // Not known to be none yet, so nothing stands where a recording's button may come.
      expect(screen.queryByRole('button', { name: 'Add a recording' })).not.toBeInTheDocument();
      const before = [...block.children];

      release();
      await screen.findByRole('link', { name: 'Original' });
      expect(screen.getByRole('link', { name: 'Tab' })).toBe(tab);
      expect(screen.getByRole('link', { name: 'New loop' })).toBe(newLoop);
      expect(screen.getByRole('heading', { name: 'Play along' })).toBe(heading);
      expect(screen.getByTestId('play-along-buttons')).toBe(row);
      expect([...row.children].map((child) => child.textContent)).toEqual([
        'Tab',
        'Original',
        'Drumless on Spotify (opens in a new tab)',
      ]);
      expect(row.firstElementChild).toBe(tab);
      // Nothing was put before the buttons, and the block is still above New loop.
      expect([...playAlong().children].slice(0, before.length)).toEqual(before);
      expect(
        block.compareDocumentPosition(newLoop) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });

    it('puts Add a recording at the end of the same row when the links arrive and there are none', async () => {
      serve();
      const release = links.holdNext('select');
      renderOverview();
      const tab = await screen.findByRole('link', { name: 'Tab' });
      const row = screen.getByTestId('play-along-buttons');
      expect([...row.children]).toEqual([tab]);

      release();
      const add = await screen.findByRole('button', { name: 'Add a recording' });
      expect([...row.children]).toEqual([tab, add]);
    });

    // Issue 8.
    it('shows an other link as its host and a short path, with the whole address in its title and name', async () => {
      const long = linkRow('long', { url: `https://www.example.com/${'a'.repeat(300)}` });
      await opened([original, long]);
      const link = within(await screen.findByRole('list', { name: 'Other links' })).getByRole(
        'link',
      );
      expect(within(link).getByText(`example.com/${'a'.repeat(27)}…`)).toHaveAttribute(
        'aria-hidden',
        'true',
      );
      expect(link).toHaveAttribute('title', long.url);
      expect(link).toHaveAccessibleName(`example.com/${'a'.repeat(300)} (opens in a new tab)`);
      expect(link).toHaveAttribute('href', long.url);
    });

    it('lists three other links, then the rest on request, with focus staying on the button', async () => {
      const others = [1, 2, 3, 4, 5].map((n) =>
        linkRow(`other-${n}`, { url: `https://example.com/lesson-${n}` }),
      );
      const user = await opened([original, ...others]);
      const list = await screen.findByRole('list', { name: 'Other links' });
      const shown = () =>
        within(list)
          .getAllByRole('link')
          .map((link) => link.getAttribute('href'));
      expect(shown()).toEqual(others.slice(0, 3).map((row) => row.url));

      const more = screen.getByRole('button', { name: 'Show all 5 links' });
      expect(more).toHaveAttribute('aria-expanded', 'false');
      expect(more).toHaveAttribute('aria-controls', list.id);
      await user.click(more);
      expect(shown()).toEqual(others.map((row) => row.url));
      expect(more).toHaveFocus();
      expect(more).toHaveAttribute('aria-expanded', 'true');
      expect(more).toHaveTextContent('Show fewer links');

      await user.click(more);
      expect(shown()).toHaveLength(3);
      expect(more).toHaveFocus();
    });

    it('offers no "Show all" for three other links or fewer', async () => {
      await opened([original, linkRow('a'), linkRow('b'), linkRow('c')]);
      const list = await screen.findByRole('list', { name: 'Other links' });
      expect(within(list).getAllByRole('link')).toHaveLength(3);
      expect(screen.queryByRole('button', { name: /^Show all/ })).not.toBeInTheDocument();
    });

    // Issue 4.
    it('says a YouTube link in an Other field opens in YouTube, not that it plays here', async () => {
      const user = await opened([original]);
      await screen.findByRole('link', { name: 'Original' });
      await manage(user);
      await user.click(formButton('Add another link'));
      await user.type(field('Other link 1'), `https://youtu.be/${VIDEO_ID}`);
      const note = document.getElementById(field('Other link 1').getAttribute('aria-describedby')!);
      expect(note).toHaveTextContent(/^YouTube video\. Opens in YouTube\.$/);
      // The Original's own line still says it plays here.
      expect(
        document.getElementById(field('Original').getAttribute('aria-describedby')!),
      ).toHaveTextContent('YouTube video. Plays here, with the tab under it.');
    });

    // Issue 6.
    it('takes the link out of a paste with words round it, shows what was kept and saves that', async () => {
      const user = await opened();
      await addRecording(user);
      await user.click(field('Original'));
      await user.paste(`Never Gonna Give You Up https://youtu.be/${VIDEO_ID}?si=abc`);
      expect(field('Original')).toHaveValue(`https://youtu.be/${VIDEO_ID}?si=abc`);
      expect(form()).toHaveTextContent('YouTube video. Plays here, with the tab under it.');

      await user.click(save());
      await waitFor(() => noForm());
      expect(links.sent('insert')).toMatchObject([{ kind: 'original', url: WATCH_URL }]);
    });

    it('leaves words with no link in them as typed, and refuses them at Save', async () => {
      const user = await opened();
      await addRecording(user);
      await user.click(field('Original'));
      await user.paste('the one from the lesson');
      expect(field('Original')).toHaveValue('the one from the lesson');
      await user.click(save());
      expect(await formAlert()).toHaveTextContent("That isn't a link.");
    });

    // Issue 10.
    describe('where focus goes as the form opens', () => {
      it('with a mouse or trackpad, the first empty link field', async () => {
        stubPointer(true);
        const user = await opened();
        await addRecording(user);
        expect(field('Original')).toHaveFocus();
      });

      it('with a mouse, the first field that has no link yet', async () => {
        stubPointer(true);
        const user = await opened([original]);
        await screen.findByRole('link', { name: 'Original' });
        await manage(user);
        expect(field('Drumless')).toHaveFocus();
      });

      it('with a mouse and every field filled, the form itself', async () => {
        stubPointer(true);
        const user = await opened([original, drumless]);
        await screen.findByRole('link', { name: 'Original' });
        await manage(user);
        expect(form()).toHaveFocus();
      });

      it('with a mouse and the links still being read, the form, then the field once it is there', async () => {
        stubPointer(true);
        serve();
        const release = links.holdNext('select');
        const user = renderOverview();
        await screen.findByRole('link', { name: 'Tab' });
        await manage(user);
        expect(form()).toHaveFocus();
        release();
        await waitFor(() => expect(field('Original')).toHaveFocus());
      });

      it('with a mouse, leaves focus where the user has moved it while the links were read', async () => {
        stubPointer(true);
        serve();
        const release = links.holdNext('select');
        const user = renderOverview();
        await screen.findByRole('link', { name: 'Tab' });
        await manage(user);
        const cancel = formButton('Cancel');
        cancel.focus();
        release();
        await waitFor(() => expect(field('Original')).toBeVisible());
        await settle();
        expect(cancel).toHaveFocus();
      });

      it('on a touch screen, the form itself, so no keyboard comes up before a field is tapped', async () => {
        stubPointer(false);
        const user = await opened();
        await addRecording(user);
        expect(form()).toHaveFocus();
        await settle();
        expect(form()).toHaveFocus();
      });
    });

    // Test bug 2 / checklist 1, "an exit left open": the page's own links stay live while
    // the form saves, so the save's failure is kept for whoever is on the overview next.
    describe('a save whose form was left before it answered', () => {
      async function savingThenLeft(user: ReturnType<typeof userEvent.setup>) {
        await addRecording(user);
        await user.type(field('Original'), WATCH_URL);
        // Held first, then failed: a failure that lands before the page is left proves nothing.
        const release = links.holdNext('insert');
        await user.click(save());
        await savingShown();
        await user.click(screen.getByRole('link', { name: 'New loop' }));
        expect(await screen.findByText('At whole song')).toBeVisible();
        return release;
      }
      const overviewAlert = () => within(playAlong()).getByRole('alert');

      it('says the failure on return, with the form closed, until it is dismissed', async () => {
        const user = await opened();
        links.failNext('insert', dropped);
        const release = await savingThenLeft(user);
        release();
        await waitFor(() => expect(client.isMutating()).toBe(0));

        historyBack();
        await screen.findByRole('link', { name: 'Tab' });
        expect(await within(playAlong()).findByRole('alert')).toHaveTextContent(
          "Couldn't save the recordings. The server couldn't be reached. Check the connection and try again. Some changes may have been saved: this shows what is saved now.",
        );
        noForm();
        expect(links.rows()).toEqual([]);

        await user.click(within(overviewAlert()).getByRole('button', { name: 'Dismiss' }));
        noOverviewAlert();
        // Its button went with it: focus to the way back into the form.
        await waitFor(() =>
          expect(screen.getByRole('button', { name: 'Add a recording' })).toHaveFocus(),
        );
      });

      it('says it when the answer lands after the user is back on the overview', async () => {
        const user = await opened();
        links.failNext('insert', dropped);
        const release = await savingThenLeft(user);
        historyBack();
        await screen.findByRole('button', { name: 'Add a recording' });
        noOverviewAlert();

        release();
        expect(await within(playAlong()).findByRole('alert')).toHaveTextContent(
          "Couldn't save the recordings.",
        );
        // Opening the form again shows the same failure there, and Cancel puts it away.
        await user.click(screen.getByRole('button', { name: 'Add a recording' }));
        expect(within(form()).getByRole('alert')).toHaveTextContent(
          "Couldn't save the recordings.",
        );
        await user.click(formButton('Cancel'));
        noForm();
        noOverviewAlert();
      });

      it('locks a form opened again while that save is still on its way, and sends nothing twice', async () => {
        const user = await opened();
        const release = await savingThenLeft(user);
        historyBack();
        await addRecording(user);

        expect(save()).toHaveTextContent('Saving…');
        expectLocked(save());
        expectLocked(formButton('Cancel'));
        expect(field('Original')).toHaveAttribute('readonly');
        fireEvent.submit(form());
        await settle();
        expect(links.sent('insert')).toHaveLength(1);

        // Its answer unlocks the form, whose field now shows what was saved.
        release();
        await waitFor(() => expectUnlocked(save()));
        expect(field('Original')).toHaveValue(WATCH_URL);
        expect(within(form()).queryByRole('alert')).not.toBeInTheDocument();
        expect(links.sent('insert')).toHaveLength(1);
      });

      it('says nothing on return when the save went through', async () => {
        const user = await opened();
        const release = await savingThenLeft(user);
        release();
        await waitFor(() => expect(client.isMutating()).toBe(0));
        historyBack();
        expect(await screen.findByRole('link', { name: 'Original' })).toBeVisible();
        noOverviewAlert();
      });
    });

    it('a failed save read in the form and cancelled isn’t said again on the overview', async () => {
      const user = await opened();
      await addRecording(user);
      await user.type(field('Original'), WATCH_URL);
      links.failNext('insert', dropped);
      await user.click(save());
      expect(await formAlert()).toHaveTextContent("Couldn't save the recordings.");
      await user.click(formButton('Cancel'));
      noForm();
      await screen.findByRole('button', { name: 'Add a recording' });
      noOverviewAlert();
    });
  });

  describe('14 Review', () => {
    /** An other link's words on show: its name, which stands in for the address a screen reader gets. */
    const wordsShown = (link: HTMLElement) =>
      link.querySelector('span[aria-hidden="true"]')?.textContent;

    // QA (after fix round 1) issue 7: an other link reads as what it is, not as an address.
    it('names other links for what the app recognised, numbering the ones that share a name', async () => {
      const second = 'https://www.youtube.com/watch?v=aaaaaaaaaaa';
      const at = (seconds: number) => `2026-11-21T12:00:0${seconds}Z`;
      const user = await opened([
        original,
        linkRow('cover', { provider: 'youtube', url: WATCH_URL, created_at: at(1) }),
        linkRow('playlist', { provider: 'spotify', url: SPOTIFY_URL, created_at: at(2) }),
        linkRow('lesson', { url: 'https://www.drumeo.com/lesson?id=7', created_at: at(3) }),
        linkRow('cover-2', { provider: 'youtube', url: second, created_at: at(4) }),
      ]);
      const list = await screen.findByRole('list', { name: 'Other links' });
      await user.click(screen.getByRole('button', { name: 'Show all 4 links' }));
      const others = within(list).getAllByRole('link');
      expect(others.map(wordsShown)).toEqual([
        'YouTube video',
        'Spotify track',
        'drumeo.com/lesson?id=7',
        'YouTube video 2',
      ]);
      // The whole address is still there: for a pointer, and in the name a screen reader says.
      expect(others.map((link) => link.getAttribute('title'))).toEqual([
        WATCH_URL,
        SPOTIFY_URL,
        'https://www.drumeo.com/lesson?id=7',
        second,
      ]);
      expect(others[0]).toHaveAccessibleName(
        `YouTube video: youtube.com/watch?v=${VIDEO_ID} (opens in a new tab)`,
      );
      expect(others[1]).toHaveAccessibleName(
        'Spotify track: open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC (opens in a new tab)',
      );
      expect(others[2]).toHaveAccessibleName('drumeo.com/lesson?id=7 (opens in a new tab)');
      expect(others[3]).toHaveAccessibleName(
        'YouTube video 2: youtube.com/watch?v=aaaaaaaaaaa (opens in a new tab)',
      );
      expect(others[3]).toHaveAttribute('href', second);
    });

    it('keeps a link’s number while the list is folded', async () => {
      const second = 'https://www.youtube.com/watch?v=aaaaaaaaaaa';
      await opened([
        linkRow('cover', { provider: 'youtube', url: WATCH_URL }),
        linkRow('cover-2', {
          provider: 'youtube',
          url: second,
          created_at: '2026-11-21T12:00:01Z',
        }),
      ]);
      const list = await screen.findByRole('list', { name: 'Other links' });
      expect(within(list).getAllByRole('link').map(wordsShown)).toEqual([
        'YouTube video',
        'YouTube video 2',
      ]);
    });

    // QA (after fix round 1) issue 6: "Saving…" stood over empty fields.
    it('a form opened again while its save is on its way shows what is being saved', async () => {
      const lesson = linkRow('lesson', { url: 'https://www.drumeo.com/lesson?id=7' });
      const cover = linkRow('cover', {
        url: 'https://example.com/cover',
        created_at: '2026-11-21T12:00:01Z',
      });
      const user = await opened([original, lesson, cover]);
      await manage(user);
      // A change, a first Drumless, a removal and an added link, typed as a person types them.
      await user.clear(field('Original'));
      await user.type(field('Original'), `youtu.be/aaaaaaaaaaa?si=abc`);
      await user.type(field('Drumless'), `${SPOTIFY_URL}?si=abc`);
      await user.click(formButton('Remove Other link 1'));
      await user.click(formButton('Add another link'));
      await user.type(field('Other link 3'), 'https://example.com/new');
      // The first step is held: nothing of the save has landed while the form is reopened.
      const release = links.holdNext('delete');
      await user.click(save());
      await savingShown();
      await user.click(screen.getByRole('link', { name: 'New loop' }));
      expect(await screen.findByText('At whole song')).toBeVisible();
      historyBack();
      await screen.findByRole('link', { name: 'Tab' });

      await manage(user);
      expect(save()).toHaveTextContent('Saving…');
      // What the save is sending, in the form it is saved in; an untouched field as it is saved.
      expect(field('Original')).toHaveValue('https://www.youtube.com/watch?v=aaaaaaaaaaa');
      expect(field('Drumless')).toHaveValue(SPOTIFY_URL);
      expect(field('Other link 1')).toHaveValue('');
      expect(field('Other link 2')).toHaveValue(cover.url);
      expect(field('Other link 3')).toHaveValue('https://example.com/new');
      for (const name of ['Original', 'Drumless', 'Other link 1', 'Other link 2', 'Other link 3']) {
        expect(field(name)).toHaveAttribute('readonly');
      }
      // Still locked: what it shows can't be changed or sent a second time.
      expectLocked(formButton('Cancel'));
      fireEvent.submit(form());
      await settle();
      expect(links.sent('delete')).toHaveLength(1);

      // Its answer: the fields show what is saved, which is the same, and nothing was added twice.
      release();
      await waitFor(() => expectUnlocked(save()));
      expect(field('Original')).toHaveValue('https://www.youtube.com/watch?v=aaaaaaaaaaa');
      expect(field('Drumless')).toHaveValue(SPOTIFY_URL);
      expect(field('Other link 1')).toHaveValue(cover.url);
      expect(field('Other link 2')).toHaveValue('https://example.com/new');
      expect(within(form()).queryByRole('textbox', { name: /^Other link 3/ })).toBeNull();
      expect(links.rows().map((row) => row.url)).toEqual([
        'https://www.youtube.com/watch?v=aaaaaaaaaaa',
        cover.url,
        SPOTIFY_URL,
        'https://example.com/new',
      ]);
    });

    it('the form that sent the save keeps showing what was typed while it saves', async () => {
      const user = await opened();
      await addRecording(user);
      await user.type(field('Original'), `youtu.be/${VIDEO_ID}`);
      const release = links.holdNext('insert');
      await user.click(save());
      await savingShown();
      expect(field('Original')).toHaveValue(`youtu.be/${VIDEO_ID}`);
      release();
      await waitFor(() => noForm());
    });
  });
});
