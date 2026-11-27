import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route } from 'react-router';
import type { Song } from '@/features/library/songForm';
import {
  queryResult,
  resetFakeSupabase,
  storageResult,
  type FakeResult,
} from '@/test/fakeSupabase';
import { loopRow, loopTable, type LoopTable } from '@/test/loopTable';
import { renderRoutes, RouteMarker } from '@/test/render';
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
    return ok(song);
  });
}

function renderOverview(search = '') {
  renderRoutes(
    <>
      <Route path="/songs/:id" element={<SongOverviewPage />} />
      <Route path="/songs/:id/loops/:loopId" element={<RouteMarker name="practice" />} />
      <Route path="/songs/:id/play" element={<RouteMarker name="whole song" />} />
    </>,
    { path: `/songs/${SONG}${search}` },
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

  it('ignores a ?loop= that is not an id', async () => {
    serve();
    renderOverview('?loop=%3Cb%3E');
    expect(await screen.findByRole('heading', { level: 1, name: 'Groove 120' })).toBeVisible();
  });
});
