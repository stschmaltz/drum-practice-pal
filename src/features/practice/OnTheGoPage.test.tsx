import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route } from 'react-router';
import type { Loop } from '@/features/loops/loopForm';
import { loopKeys } from '@/features/loops/loopKeys';
import { PRACTICE_LOOP_SELECT, type PracticeLoop } from '@/features/loops/practiceList';
import { opArgs, queryResult, resetFakeSupabase, type FakeResult } from '@/test/fakeSupabase';
import { loopRow } from '@/test/loopTable';
import { renderRoutes, RouteMarker } from '@/test/render';
import { OnTheGoPage } from './OnTheGoPage';

vi.mock('@/lib/supabase', async () => (await import('@/test/fakeSupabase')).fakeSupabaseModule);

const SONG_A = '11111111-1111-4111-8111-111111111111';
const SONG_B = '22222222-2222-4222-8222-222222222222';
const FILL = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const NOW = new Date(2026, 10, 23, 12, 0);
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString();

const practiceLoop = (id: string, overrides: Partial<PracticeLoop> = {}): PracticeLoop => ({
  ...loopRow(id, { song_id: SONG_A }),
  song: { title: 'Groove 120', artist: 'Fixture Band' },
  ...overrides,
});

const fill = practiceLoop(FILL, {
  name: 'Chorus fill',
  start_bar: 9,
  end_bar: 12,
  speed_ratio: 0.708333,
  target_ratio: 1,
  last_practiced_at: daysAgo(1),
});
const intro = practiceLoop('intro', {
  name: 'Intro',
  start_bar: 1,
  end_bar: 1,
  last_practiced_at: daysAgo(0),
});
const outro = practiceLoop('outro', {
  name: 'Outro',
  song_id: SONG_B,
  song: { title: 'Tempo Change', artist: '' },
});
const done = practiceLoop('done', {
  name: 'Done one',
  status: 'finished',
  finished_at: daysAgo(3),
  last_practiced_at: daysAgo(3),
});

/** The loops table with each loop's song, answering the page's list and its status writes. */
function serve(initial: PracticeLoop[]) {
  let rows = initial;
  const failures: string[] = [];
  const gates: Promise<void>[] = [];
  queryResult.mockImplementation(async (call): Promise<FakeResult> => {
    if (call.table !== 'loops') return { data: null, error: null };
    const changes = opArgs(call, 'update')?.[0] as Partial<Loop> | undefined;
    if (!changes) return { data: rows, error: null };
    await gates.shift();
    const failure = failures.shift();
    if (failure !== undefined) return { data: null, error: { message: failure } };
    const id = call.ops.find((op) => op.method === 'eq' && op.args[0] === 'id')?.args[1];
    rows = rows.map((row) =>
      row.id === id
        ? {
            ...row,
            ...changes,
            // The database's trigger: finished_at follows the status.
            finished_at: changes.status === 'finished' ? NOW.toISOString() : null,
          }
        : row,
    );
    // As updateLoop selects it: the loop's own columns, without the song.
    const saved: Partial<PracticeLoop> = { ...rows.find((row) => row.id === id) };
    delete saved.song;
    return { data: saved, error: null };
  });
  return {
    rows: () => rows,
    failNextWrite: (message: string) => failures.push(message),
    holdNextWrite: () => {
      let release!: () => void;
      gates.push(new Promise<void>((resolve) => (release = resolve)));
      return release;
    },
    writes: () =>
      queryResult.mock.calls
        .map(([call]) => opArgs(call, 'update')?.[0])
        .filter((changes) => changes !== undefined),
  };
}

function renderHome(path = '/') {
  renderRoutes(
    <>
      <Route path="/" element={<OnTheGoPage />} />
      <Route path="/songs/:id" element={<RouteMarker name="the song" />} />
      <Route path="/library" element={<RouteMarker name="the library" />} />
    </>,
    { path },
  );
  // The clock, for "today" and "yesterday"; TanStack Query and Testing Library keep real timers.
  return userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) });
}

const tab = (name: RegExp) => screen.getByRole('button', { name });
const listed = () =>
  screen.queryAllByRole('listitem').map((item) => item.querySelector('p')?.textContent ?? '');
const item = (name: string) =>
  within(
    screen.getAllByRole('listitem').find((li) => within(li).queryByText(name, { selector: 'p' })) ??
      (() => {
        throw new Error(`No loop "${name}" listed`);
      })(),
  );

beforeEach(() => {
  resetFakeSupabase();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('On the go', () => {
  it('lists the active loops, last practiced first, each with its song, speeds and last date', async () => {
    serve([outro, done, fill, intro]);
    renderHome();

    await waitFor(() => expect(listed()).toEqual(['Intro', 'Chorus fill', 'Outro']));

    const row = item('Chorus fill');
    expect(row.getByText('Groove 120 · Fixture Band')).toBeInTheDocument();
    expect(row.getByText('Bars 9 to 12 · 71% · target 100%')).toBeInTheDocument();
    expect(row.getByText('Last practiced yesterday')).toBeInTheDocument();
    // No artist, no target, never practiced.
    expect(item('Outro').getByText('Tempo Change')).toBeInTheDocument();
    expect(item('Outro').getByText('Bars 5 to 8 · 100%')).toBeInTheDocument();
    expect(item('Outro').getByText('Not practiced yet')).toBeInTheDocument();
    expect(item('Intro').getByText('Bar 1 · 100%')).toBeInTheDocument();
    expect(item('Intro').getByText('Last practiced today')).toBeInTheDocument();
  });

  it("asks for each loop with its song's name, every page of them", async () => {
    serve([fill]);
    renderHome();
    await waitFor(() => expect(listed()).toEqual(['Chorus fill']));

    const [call] = queryResult.mock.calls.map(([sent]) => sent);
    expect(opArgs(call!, 'select')).toEqual([PRACTICE_LOOP_SELECT]);
    expect(call!.ops.find((op) => op.method === 'eq')?.args).toEqual(['user_id', 'user-1']);
    expect(opArgs(call!, 'range')).toBeDefined();
  });

  it('counts both tabs and shows the finished ones beside the active', async () => {
    serve([fill, intro, done]);
    const user = renderHome();
    await waitFor(() => expect(tab(/^On the go/)).toHaveTextContent('On the go (2)'));
    expect(tab(/^Finished/)).toHaveTextContent('Finished (1)');
    expect(tab(/^On the go/)).toHaveAttribute('aria-pressed', 'true');

    await user.click(tab(/^Finished/));

    expect(listed()).toEqual(['Done one']);
    expect(item('Done one').getByText(/finished 3 days ago$/)).toBeInTheDocument();
    expect(tab(/^Finished/)).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('location')).toHaveTextContent('/?tab=finished');

    await user.click(tab(/^On the go/));
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/);
  });

  it('opens on the tab the address names, and on the first for anything else', async () => {
    serve([fill, done]);
    renderHome('/?tab=finished');
    await waitFor(() => expect(listed()).toEqual(['Done one']));
  });

  it('never shows text from the address', async () => {
    serve([fill, done]);
    renderHome('/?tab=%3Cb%3Enope%3C%2Fb%3E');

    await waitFor(() => expect(listed()).toEqual(['Chorus fill']));
    // The page itself; the test's own location readout sits beside it.
    const page = screen.getByRole('group', { name: 'Loops to show' }).parentElement;
    expect(page).not.toHaveTextContent('nope');
  });

  it("Practice is a link to the loop's song, opened on the loop", async () => {
    serve([fill]);
    const user = renderHome();
    const link = await screen.findByRole('link', { name: 'Practice Chorus fill' });
    expect(link).toHaveAttribute('href', `/songs/${SONG_A}?loop=${FILL}`);

    await user.click(link);

    expect(screen.getByText('At the song')).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent(`/songs/${SONG_A}?loop=${FILL}`);
  });
});

describe('finishing and reopening from the home page', () => {
  it('Mark finished moves the loop to the Finished tab, and Reopen brings it back', async () => {
    const table = serve([fill, intro]);
    const user = renderHome();
    await waitFor(() => expect(listed()).toEqual(['Intro', 'Chorus fill']));

    await user.click(screen.getByRole('button', { name: 'Mark finished Chorus fill' }));

    await waitFor(() => expect(listed()).toEqual(['Intro']));
    await waitFor(() => expect(tab(/^Finished/)).toHaveTextContent('Finished (1)'));
    expect(table.writes()).toEqual([{ status: 'finished' }]);
    expect(table.rows().find((row) => row.id === FILL)?.status).toBe('finished');

    await user.click(tab(/^Finished/));
    expect(listed()).toEqual(['Chorus fill']);
    // Its history and speeds are as they were.
    expect(item('Chorus fill').getByText('Bars 9 to 12 · 71% · target 100%')).toBeInTheDocument();
    expect(
      item('Chorus fill').getByText(/^Last practiced yesterday · finished today$/),
    ).toBeTruthy();

    await user.click(await screen.findByRole('button', { name: 'Reopen Chorus fill' }));

    await waitFor(() => expect(listed()).toEqual([]));
    expect(screen.getByText(/No finished loops yet/)).toBeInTheDocument();
    expect(table.writes()).toEqual([{ status: 'finished' }, { status: 'active' }]);
    await user.click(tab(/^On the go/));
    expect(listed()).toEqual(['Intro', 'Chorus fill']);
  });

  it('moves the loop at once and locks its button while the write is on its way', async () => {
    const table = serve([fill]);
    const release = table.holdNextWrite();
    const user = renderHome();
    await user.click(await screen.findByRole('button', { name: 'Mark finished Chorus fill' }));

    await waitFor(() => expect(tab(/^Finished/)).toHaveTextContent('Finished (1)'));
    await user.click(tab(/^Finished/));
    const reopen = screen.getByRole('button', { name: 'Reopen Chorus fill' });
    expect(reopen).toBeDisabled();
    await user.click(reopen);
    expect(table.writes()).toEqual([{ status: 'finished' }]);

    release();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Reopen Chorus fill' })).toBeEnabled(),
    );
  });

  it('a refused change puts the loop back and says so, though its button left the tab meanwhile', async () => {
    const table = serve([fill]);
    const refuse = table.holdNextWrite();
    table.failNextWrite('nope');
    const user = renderHome();
    await user.click(await screen.findByRole('button', { name: 'Mark finished Chorus fill' }));
    // The optimistic move: the loop, and the button that was pressed, are off this tab.
    await waitFor(() => expect(listed()).toEqual([]));

    refuse();

    await waitFor(() => expect(listed()).toEqual(['Chorus fill']));
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't change the loop: nope");
    expect(table.rows()[0]?.status).toBe('active');
  });
});

describe('On the go with nothing to show', () => {
  it('says so and points to the library when no loop is active', async () => {
    serve([done]);
    const user = renderHome();

    expect(await screen.findByText(/Nothing on the go/)).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Go to Library' }));
    expect(screen.getByText('At the library')).toBeInTheDocument();
  });

  it('says there are no finished loops yet', async () => {
    serve([fill]);
    renderHome('/?tab=finished');

    expect(await screen.findByText(/No finished loops yet/)).toBeInTheDocument();
  });

  it('shows a loading note, then a failure with a way to try again, without the server’s words', async () => {
    let failing = true;
    queryResult.mockImplementation(async () =>
      failing
        ? { data: null, error: { message: 'internal <b>detail</b>' } }
        : { data: [fill], error: null },
    );
    const user = renderHome();
    expect(screen.getByText('Loading your loops…')).toBeInTheDocument();

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load your loops.");
    expect(screen.getByRole('alert')).not.toHaveTextContent('internal');

    failing = false;
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(listed()).toEqual(['Chorus fill']));
  });
});

describe('On the go read again', () => {
  /** The page over a client the test can ask to read the list again, as a logged session does. */
  function renderHomeWithClient() {
    const { queryClient } = renderRoutes(<Route path="/" element={<OnTheGoPage />} />);
    const reads = () => queryResult.mock.calls.length;
    return {
      readAgain: async () => {
        const before = reads();
        await queryClient.invalidateQueries({ queryKey: loopKeys.forUser('user-1') });
        expect(reads()).toBeGreaterThan(before);
        // TanStack Query tells React on a timer: give the answer time to be drawn.
        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 20));
        });
      },
      listState: () => queryClient.getQueryState(loopKeys.practice('user-1')),
    };
  }

  it('moves a loop practiced since to the top', async () => {
    let rows = [fill, intro, outro];
    queryResult.mockImplementation(async () => ({ data: rows, error: null }));
    const view = renderHomeWithClient();
    await waitFor(() => expect(listed()).toEqual(['Intro', 'Chorus fill', 'Outro']));

    // A session was logged for Outro: the server moved its last_practiced_at.
    rows = [
      fill,
      intro,
      { ...outro, last_practiced_at: new Date(NOW.getTime() + 60_000).toISOString() },
    ];
    await view.readAgain();

    await waitFor(() => expect(listed()).toEqual(['Outro', 'Intro', 'Chorus fill']));
    expect(item('Outro').getByText(/Last practiced today/)).toBeInTheDocument();
  });

  it('keeps the list on show when a later read fails', async () => {
    let failing = false;
    queryResult.mockImplementation(async () =>
      failing
        ? { data: null, error: { message: 'internal detail' } }
        : { data: [fill], error: null },
    );
    const view = renderHomeWithClient();
    await waitFor(() => expect(listed()).toEqual(['Chorus fill']));

    failing = true;
    await view.readAgain();

    // The read did fail, or keeping the list would prove nothing.
    expect(view.listState()).toMatchObject({ status: 'error', data: [fill] });
    expect(listed()).toEqual(['Chorus fill']);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Practice Chorus fill' })).toBeInTheDocument();
  });
});

describe('the tab in the address', () => {
  it('follows the tab pressed, and leaves the address clean on the first', async () => {
    serve([fill, done]);
    const user = renderHome('/?tab=nonsense');
    await waitFor(() => expect(listed()).toEqual(['Chorus fill']));

    await user.click(tab(/^Finished/));
    expect(screen.getByTestId('location')).toHaveTextContent('/?tab=finished');
    expect(listed()).toEqual(['Done one']);

    await user.click(tab(/^On the go/));
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/);
    expect(listed()).toEqual(['Chorus fill']);
  });

  it('stays on the Finished tab when its last loop is reopened', async () => {
    const table = serve([done]);
    const user = renderHome('/?tab=finished');

    await user.click(await screen.findByRole('button', { name: 'Reopen Done one' }));

    expect(await screen.findByText(/No finished loops yet/)).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/?tab=finished');
    expect(table.writes()).toEqual([{ status: 'active' }]);
    expect(tab(/^On the go/)).toHaveTextContent('On the go (1)');
  });
});
