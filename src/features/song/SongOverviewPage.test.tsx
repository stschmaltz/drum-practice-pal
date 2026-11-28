import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { onlineManager, type QueryClient } from '@tanstack/react-query';
import { Route } from 'react-router';
import type { Song } from '@/features/library/songForm';
import { offlineDb } from '@/features/offline/offlineDb';
import type { Sitting } from '@/features/practice/sittings';
import { readVisitSittings, recordVisitSitting } from '@/features/practice/visitSittings';
import type { SongLinkRow } from '@/features/recordings/songLinkForm';
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
  SPOTIFY_URL,
  spotifyLink,
  VIDEO_ID,
  videoLink,
  WATCH_URL,
  type LinkTable,
} from '@/test/linkTable';
import { expectLocked, expectUnlocked } from '@/test/locked';
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

describe('SongOverviewPage recordings (Unit 14)', () => {
  const original = videoLink();
  const drumless = spotifyLink();
  const playAlong = () => screen.getByRole('region', { name: 'Play along' });
  const noPlayAlong = () =>
    expect(screen.queryByRole('region', { name: 'Play along' })).not.toBeInTheDocument();
  const form = () => screen.getByRole('form', { name: 'Recordings' });
  const noForm = () =>
    expect(screen.queryByRole('form', { name: 'Recordings' })).not.toBeInTheDocument();
  const field = (name: string) =>
    within(form()).getByRole('textbox', { name: new RegExp(`^${name}`) });
  const save = () => within(form()).getByRole('button', { name: /^(Save|Saving…)$/ });
  const headerMenu = () => screen.getByRole('button', { name: 'More actions for Groove 120' });
  const linkWrites = () => [
    ...links.sent('insert'),
    ...links.sent('update'),
    ...links.sent('delete'),
  ];
  const playedWrites = () =>
    queryResult.mock.calls
      .map(([call]) => call)
      .filter((call) => call.table === 'songs' && opArgs(call, 'update'));

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
    it('looks as it did, plus a quiet Add a recording, and loads nothing of YouTube’s', async () => {
      await opened();
      expect(await screen.findByRole('button', { name: 'Add a recording' })).toBeVisible();
      expect(screen.getByRole('link', { name: 'Play whole song' })).toBeVisible();
      expect(screen.getByRole('link', { name: 'New loop' })).toBeVisible();
      noPlayAlong();
      expect(document.querySelector('iframe')).toBeNull();
      expect(document.querySelector('script[src*="youtube"]')).toBeNull();
    });

    it('doesn’t offer Add a recording until the links are read, and says when they can’t be', async () => {
      serve();
      links.failNext('select', { message: 'TypeError: Failed to fetch', code: '' });
      const user = renderOverview();
      expect(await screen.findByText(/Couldn't load this song's recordings\./)).toHaveTextContent(
        "The server couldn't be reached.",
      );
      expect(screen.queryByRole('button', { name: 'Add a recording' })).not.toBeInTheDocument();
      // The tab is still a tap away.
      expect(screen.getByRole('link', { name: 'Play whole song' })).toBeVisible();

      await user.click(
        within(
          screen.getByText(/Couldn't load this song's recordings\./).closest('[role="alert"]')!,
        ).getByRole('button', { name: 'Try again' }),
      );
      expect(await screen.findByRole('button', { name: 'Add a recording' })).toBeVisible();
    });

    it('adds a first link: the form takes focus, says what the link is, and saves it in its normal form', async () => {
      const user = await opened();
      await user.click(await screen.findByRole('button', { name: 'Add a recording' }));
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
      // The buttons are there at once: "Tab" stands in for "Play whole song".
      const buttons = within(playAlong());
      expect(buttons.getByRole('link', { name: 'Tab' })).toHaveAttribute(
        'href',
        `/songs/${SONG}/play`,
      );
      expect(buttons.getByRole('link', { name: 'Original' })).toHaveAttribute(
        'href',
        `/songs/${SONG}/play?source=original`,
      );
      expect(screen.queryByRole('link', { name: 'Play whole song' })).not.toBeInTheDocument();
      // "Add a recording" has gone with the empty state: focus is on the header's menu, which manages them now.
      await waitFor(() => expect(headerMenu()).toHaveFocus());
    });

    it('Cancel saves nothing and hands focus back to Add a recording', async () => {
      const user = await opened();
      await user.click(await screen.findByRole('button', { name: 'Add a recording' }));
      await user.type(field('Original'), WATCH_URL);
      await user.click(within(form()).getByRole('button', { name: 'Cancel' }));

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
    ])(
      'refuses %s with fixed copy, saves nothing and puts focus on the field',
      async (text, copy) => {
        const user = await opened();
        await user.click(await screen.findByRole('button', { name: 'Add a recording' }));
        await user.type(field('Original'), text);
        // A good link in another field doesn't get saved alone.
        await user.type(field('Drumless'), SPOTIFY_URL);
        await user.click(save());

        expect(await within(form()).findByRole('alert')).toHaveTextContent(copy);
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
      await user.click(await screen.findByRole('button', { name: 'Add a recording' }));
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
      const remove = within(form()).getByRole('button', { name: 'Remove Original' });
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
      await waitFor(() => noPlayAlong());
      expect(screen.getByRole('link', { name: 'Play whole song' })).toBeVisible();
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Add a recording' })).toHaveFocus(),
      );
    });

    it('Cancel after Remove keeps the link', async () => {
      const user = await opened([original]);
      await screen.findByRole('link', { name: 'Original' });
      await manage(user);
      await user.click(within(form()).getByRole('button', { name: 'Remove Original' }));
      await user.click(within(form()).getByRole('button', { name: 'Cancel' }));
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

      await user.click(within(form()).getByRole('button', { name: 'Remove Other link 1' }));
      await user.clear(field('Other link 2'));
      await user.type(field('Other link 2'), 'example.com/cover-2');
      await user.click(within(form()).getByRole('button', { name: 'Add another link' }));
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
      await user.click(within(form()).getByRole('button', { name: 'Add another link' }));
      await user.click(within(form()).getByRole('button', { name: 'Remove Other link 1' }));
      expect(
        within(form()).queryByRole('textbox', { name: /^Other link/ }),
      ).not.toBeInTheDocument();
      await waitFor(() =>
        expect(within(form()).getByRole('button', { name: 'Add another link' })).toHaveFocus(),
      );
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
      await user.click(await screen.findByRole('button', { name: 'Add a recording' }));
      await user.type(field('Original'), WATCH_URL);
      const release = links.holdNext('insert');
      await user.click(save());

      expect(await within(form()).findByRole('button', { name: 'Saving…' })).toHaveFocus();
      expectLocked(save());
      const cancel = within(form()).getByRole('button', { name: 'Cancel' });
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
      await user.click(await screen.findByRole('button', { name: 'Add a recording' }));
      await user.type(field('Original'), WATCH_URL);
      links.failNext('insert', {
        message: 'permission denied for table song_links',
        code: '42501',
      });
      await user.click(save());

      const alert = await within(form()).findByRole('alert');
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
      await user.click(await screen.findByRole('button', { name: 'Add a recording' }));
      await user.click(within(form()).getByRole('button', { name: 'Add another link' }));
      await user.type(field('Other link 1'), 'https://example.com/lesson');
      links.loseNext('insert');
      await user.click(save());

      expect(await within(form()).findByRole('alert')).toHaveTextContent(
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
      await user.click(within(form()).getByRole('button', { name: 'Remove Other link 1' }));
      await user.clear(field('Original'));
      await user.type(field('Original'), SPOTIFY_URL);
      await user.type(field('Drumless'), 'https://example.com/drumless');
      links.failNext('update');
      await user.click(save());

      expect(await within(form()).findByRole('alert')).toHaveTextContent(
        'Some changes may have been saved',
      );
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

  describe('offline', () => {
    it('shows the buttons from the cached links, off, and says why; the tab still opens', async () => {
      const user = await opened([original, drumless, linkRow('lesson')]);
      await screen.findByRole('link', { name: 'Original' });
      act(() => onlineManager.setOnline(false));

      const video = screen.getByRole('link', { name: 'Original' });
      const spotify = screen.getByRole('link', { name: /^Drumless on Spotify/ });
      const other = within(screen.getByRole('list', { name: 'Other links' })).getByRole('link');
      for (const control of [video, spotify, other]) expectLocked(control);
      expect(within(playAlong()).getByTestId('offline-note')).toHaveTextContent(
        "You're offline. Recordings need a connection",
      );
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
      await user.click(await screen.findByRole('button', { name: 'Add a recording' }));
      await user.type(field('Original'), WATCH_URL);
      links.failNext('insert', { message: 'TypeError: Failed to fetch', code: '' });
      await user.click(save());
      expect(await within(form()).findByRole('alert')).toHaveTextContent(
        "The server couldn't be reached.",
      );
      expect(save()).toHaveTextContent('Save');
    });
  });
});
