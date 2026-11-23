import { useState } from 'react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { resetFakeSupabase } from '@/test/fakeSupabase';
import {
  LOOP_SONG_ID,
  loopPlayer,
  loopRow,
  serveLoopTable,
  startOfBar,
  usePlayerSnapshot,
} from '@/test/loopPlayer';
import { testQueryClient, wrapperFor } from '@/test/render';
import { PAGE_LAYOUT_QUERY } from '@/features/player/layout';
import type { PlayerService } from '@/features/player/PlayerService';
import type { Loop } from './loopForm';
import { loopKeys } from './loopKeys';
import { LoopPanel } from './LoopPanel';
import { useLoopPractice } from './useLoopPractice';
import { useLoops } from './useLoops';

vi.mock('@/lib/supabase', async () => (await import('@/test/fakeSupabase')).fakeSupabaseModule);

const BODY_ID = 'loop-panel-body';

/** The panel wired as the song page wires it: one loops query, the practice hook, one open state. */
function Panel({ player, startsOpen }: { player: PlayerService; startsOpen: boolean }) {
  const snapshot = usePlayerSnapshot(player);
  const loops = useLoops(LOOP_SONG_ID);
  const practice = useLoopPractice(player, snapshot, loops.data);
  const [open, setOpen] = useState(startsOpen);
  return (
    <LoopPanel
      songId={LOOP_SONG_ID}
      player={player}
      snapshot={snapshot}
      practice={practice}
      loops={loops}
      open={open}
      onOpenChange={setOpen}
      bodyId={BODY_ID}
    />
  );
}

const intro = loopRow('intro', { name: 'Intro', start_bar: 1, end_bar: 4, speed_ratio: 0.8 });
const late = loopRow('late', {
  name: 'Late',
  start_bar: 9,
  end_bar: 12,
  speed_ratio: 0.5,
  target_ratio: 1,
});

interface PanelOptions {
  loops?: Loop[];
  loaded?: boolean;
  startsOpen?: boolean;
  /** Runs before the first render, to make the first load fail or hang. */
  prepare?: (table: ReturnType<typeof serveLoopTable>) => void;
}

function renderPanel({
  loops = [intro, late],
  loaded = true,
  startsOpen = true,
  prepare,
}: PanelOptions = {}) {
  const table = serveLoopTable(loops);
  prepare?.(table);
  const { engine, player, finishLoading } = loopPlayer({ loaded });
  const queryClient = testQueryClient();
  render(<Panel player={player} startsOpen={startsOpen} />, { wrapper: wrapperFor(queryClient) });
  const panel = within(screen.getByTestId('loop-panel'));
  return {
    user: userEvent.setup(),
    table,
    engine,
    player,
    finishLoading,
    queryClient,
    panel,
    /** The phone sheet's header; from 768 px CSS hides it and the page has its own toggle. */
    header: () => panel.getByRole('button', { name: /(Open|Close)$/ }),
    item: (name: string) =>
      within(
        panel
          .getAllByRole('listitem')
          .find((li) => within(li).queryByText(name, { selector: 'p' })) ??
          (() => {
            throw new Error(`No loop "${name}" in the list`);
          })(),
      ),
    play: (name: string) => panel.getByRole('button', { name: `Play loop ${name}` }),
    names: () =>
      panel.queryAllByRole('listitem').map((li) => li.querySelector('p')?.textContent ?? ''),
  };
}

beforeEach(() => {
  resetFakeSupabase();
});

describe('LoopPanel open and closed', () => {
  it('is a labelled region whose header says how many loops there are and opens the body', async () => {
    const view = renderPanel({ startsOpen: false });
    expect(screen.getByRole('complementary', { name: 'Loops' })).toBeInTheDocument();
    await waitFor(() => expect(view.header()).toHaveTextContent('Loops (2)'));
    expect(view.header()).toHaveAttribute('aria-expanded', 'false');
    expect(view.header()).toHaveAttribute('aria-controls', BODY_ID);
    expect(document.getElementById(BODY_ID)).not.toBeVisible();
    expect(view.panel.queryByRole('button', { name: 'New loop' })).not.toBeInTheDocument();

    await view.user.click(view.header());
    expect(view.header()).toHaveAttribute('aria-expanded', 'true');
    expect(view.header()).toHaveTextContent('Close');
    expect(view.panel.getByRole('button', { name: 'New loop' })).toBeVisible();

    await view.user.click(view.header());
    expect(document.getElementById(BODY_ID)).not.toBeVisible();
  });

  it('counts no loops as 0, and names the playing loop in the header instead of the count', async () => {
    const view = renderPanel({ loops: [], startsOpen: false });
    await waitFor(() => expect(view.header()).toHaveTextContent('Loops (0)'));

    view.table.setRows([intro]);
    await act(() =>
      view.queryClient.invalidateQueries({ queryKey: loopKeys.forSong('user-1', LOOP_SONG_ID) }),
    );
    await waitFor(() => expect(view.header()).toHaveTextContent('Loops (1)'));
    await view.user.click(view.header());
    await view.user.click(view.play('Intro'));
    expect(view.header()).toHaveTextContent('Loop: Intro');
  });

  it('keeps the playing loop going while closed', async () => {
    const view = renderPanel();
    await view.user.click(await view.panel.findByRole('button', { name: 'Play loop Intro' }));
    await view.user.click(view.header());
    expect(view.player.getSnapshot()).toMatchObject({
      range: { startBar: 1, endBar: 4 },
      looping: true,
    });
  });
});

describe('LoopPanel list', () => {
  it('says it is loading, then lists the loops by first bar with bars, speed, BPM and target', async () => {
    let release: () => void = () => {};
    const view = renderPanel({
      loops: [late, intro],
      prepare: (table) => {
        release = table.holdNext('select');
      },
    });
    expect(view.panel.getByText('Loading loops…')).toBeInTheDocument();
    release();

    await waitFor(() => expect(view.names()).toEqual(['Intro', 'Late']));
    expect(view.item('Intro').getByText('Bars 1 to 4 · 80% (96 BPM)')).toBeInTheDocument();
    // Bar 9 is at 90 in the file: half speed is 45, and the 100% target is 90.
    expect(
      view.item('Late').getByText('Bars 9 to 12 · 50% (45 BPM) · target 100% (90 BPM)'),
    ).toBeInTheDocument();
  });
  it('names a one-bar loop as one bar', async () => {
    const view = renderPanel({
      loops: [loopRow('one', { name: 'Fill', start_bar: 8, end_bar: 8 })],
    });
    await waitFor(() => expect(view.names()).toEqual(['Fill']));
    expect(view.item('Fill').getByText('Bar 8 · 100% (120 BPM)')).toBeInTheDocument();
  });

  it('until the score has loaded: percent only, nothing to play, no new loop', async () => {
    const view = renderPanel({ loaded: false });
    await waitFor(() => expect(view.names()).toEqual(['Intro', 'Late']));
    expect(view.item('Late').getByText('Bars 9 to 12 · 50% · target 100%')).toBeInTheDocument();
    expect(view.play('Intro')).toBeDisabled();
    expect(view.panel.getByRole('button', { name: 'New loop' })).toBeDisabled();
    // Editing and deleting need no score.
    expect(view.panel.getByRole('button', { name: 'Edit Intro' })).toBeEnabled();

    act(() => view.finishLoading());

    expect(view.play('Intro')).toBeEnabled();
    expect(view.panel.getByRole('button', { name: 'New loop' })).toBeEnabled();
    expect(view.item('Late').getByText(/50% \(45 BPM\)/)).toBeInTheDocument();
  });

  it('cannot play a loop once the player has failed', async () => {
    const view = renderPanel();
    await waitFor(() => expect(view.play('Intro')).toBeEnabled());
    act(() => view.engine.fire('error', { error: new Error('boom') }));
    expect(view.player.getSnapshot().status).toBe('error');
    expect(view.play('Intro')).toBeDisabled();
  });

  it('a failed first load can be retried, without the server’s message on show', async () => {
    const view = renderPanel({ prepare: (table) => table.failNext('select', 'JWT expired') });
    const alert = await view.panel.findByRole('alert');
    expect(alert).toHaveTextContent("Couldn't load this song's loops.");
    expect(alert).not.toHaveTextContent('JWT');

    await view.user.click(within(alert).getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(view.names()).toEqual(['Intro', 'Late']));
  });

  it('a failed refetch keeps the list and the playing loop', async () => {
    const view = renderPanel();
    await view.user.click(await view.panel.findByRole('button', { name: 'Play loop Intro' }));
    view.table.failNext('select', 'offline');
    await act(() =>
      view.queryClient.invalidateQueries({ queryKey: loopKeys.forSong('user-1', LOOP_SONG_ID) }),
    );

    expect(view.names()).toEqual(['Intro', 'Late']);
    expect(view.panel.queryByRole('alert')).not.toBeInTheDocument();
    expect(view.player.getSnapshot().range).toEqual({ startBar: 1, endBar: 4 });
  });
});

describe('LoopPanel playing a loop', () => {
  it('Play loop starts it at its bars and saved speed, and shows it as the one being practiced', async () => {
    const view = renderPanel();
    await view.user.click(await view.panel.findByRole('button', { name: 'Play loop Late' }));

    expect(view.engine.play).toHaveBeenCalledTimes(1);
    expect(view.player.getSnapshot()).toMatchObject({
      range: { startBar: 9, endBar: 12 },
      looping: true,
      speedRatio: 0.5,
      barNumber: 9,
    });
    const card = within(view.panel.getByRole('region', { name: 'Practicing Late' }));
    expect(card.getByText('Bars 9 to 12, repeating')).toBeInTheDocument();
    expect(card.getByLabelText('BPM')).toHaveValue('45');
    // Its own button now restarts it; the other loop's still says Play.
    expect(view.panel.getByRole('button', { name: 'Restart loop Late' })).toBeInTheDocument();
    expect(view.play('Intro')).toBeInTheDocument();
  });

  it('Restart loop goes back to the first bar at the saved speed, without stopping', async () => {
    const view = renderPanel();
    await view.user.click(await view.panel.findByRole('button', { name: 'Play loop Late' }));
    act(() => {
      view.engine.fire('stateChanged', { playing: true });
      view.engine.fire('position', { tick: startOfBar(9) });
      view.engine.fire('position', { tick: startOfBar(11) + 5 });
    });
    await view.user.click(view.panel.getByRole('button', { name: 'Faster by 5%' }));
    expect(view.player.getSnapshot()).toMatchObject({ barNumber: 11, speedRatio: 0.55 });
    const pausesAndStops = view.engine.pause.mock.calls.length + view.engine.stop.mock.calls.length;

    await view.user.click(view.panel.getByRole('button', { name: 'Restart loop Late' }));

    expect(view.player.getSnapshot()).toMatchObject({
      status: 'playing',
      barNumber: 9,
      speedRatio: 0.5,
    });
    expect(view.engine.pause.mock.calls.length + view.engine.stop.mock.calls.length).toBe(
      pausesAndStops,
    );
    expect(view.engine.loadScore).toHaveBeenCalledTimes(1);
  });

  it('Back to whole song leaves the loop, and its card goes', async () => {
    const view = renderPanel();
    await view.user.click(await view.panel.findByRole('button', { name: 'Play loop Intro' }));
    await view.user.click(view.panel.getByRole('button', { name: 'Back to whole song' }));

    expect(view.panel.queryByRole('region', { name: /Practicing/ })).not.toBeInTheDocument();
    expect(view.player.getSnapshot()).toMatchObject({ range: null, looping: false });
    expect(view.play('Intro')).toBeInTheDocument();
  });
});

// 08 QA issue 1: the sheet lies over the score and the count-in number.
describe('LoopPanel Play loop and the phone sheet', () => {
  /** Below or from the 768 px breakpoint, as the browser would answer the layout query. */
  const atWidth = (kind: 'phone' | 'wide') =>
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: kind === 'wide' && query === PAGE_LAYOUT_QUERY,
    }));

  afterEach(() => vi.unstubAllGlobals());

  it('on a phone, Play loop closes the sheet and starts the loop, named in the header', async () => {
    atWidth('phone');
    const view = renderPanel();
    await view.user.click(await view.panel.findByRole('button', { name: 'Play loop Late' }));

    expect(view.header()).toHaveAttribute('aria-expanded', 'false');
    expect(document.getElementById(BODY_ID)).not.toBeVisible();
    expect(view.header()).toHaveTextContent('Loop: Late');
    expect(view.engine.play).toHaveBeenCalledTimes(1);
    expect(view.player.getSnapshot()).toMatchObject({
      range: { startBar: 9, endBar: 12 },
      looping: true,
      speedRatio: 0.5,
    });
  });

  it('on a phone, Play loop with a count-in closes the sheet for the counter', async () => {
    atWidth('phone');
    const view = renderPanel();
    act(() => view.player.setCountInBars(1));
    await view.user.click(await view.panel.findByRole('button', { name: 'Play loop Late' }));

    expect(view.player.getSnapshot().status).toBe('countingIn');
    expect(view.header()).toHaveAttribute('aria-expanded', 'false');
    // The loop's first bar is brought on screen for the count-in.
    expect(view.engine.scrollToBar).toHaveBeenLastCalledWith(8);
  });

  it('on a phone, choosing another loop during a count-in closes the sheet again', async () => {
    atWidth('phone');
    const view = renderPanel();
    act(() => view.player.setCountInBars(2));
    await view.user.click(await view.panel.findByRole('button', { name: 'Play loop Late' }));
    await view.user.click(view.header());
    expect(view.header()).toHaveAttribute('aria-expanded', 'true');

    await view.user.click(view.play('Intro'));

    expect(view.player.getSnapshot()).toMatchObject({ status: 'countingIn', barNumber: 1 });
    expect(view.header()).toHaveAttribute('aria-expanded', 'false');
  });

  it('on a phone, the sheet stays open when a loop is switched or restarted while playing', async () => {
    atWidth('phone');
    const view = renderPanel();
    await view.user.click(await view.panel.findByRole('button', { name: 'Play loop Late' }));
    act(() => view.engine.fire('stateChanged', { playing: true }));
    await view.user.click(view.header());

    await view.user.click(view.play('Intro'));
    expect(view.header()).toHaveAttribute('aria-expanded', 'true');
    expect(view.player.getSnapshot()).toMatchObject({ status: 'playing', barNumber: 1 });

    await view.user.click(view.panel.getByRole('button', { name: 'Restart loop Intro' }));
    expect(view.header()).toHaveAttribute('aria-expanded', 'true');
    expect(view.panel.getByRole('group', { name: 'Loop speed' })).toBeVisible();
  });

  it('from 768 px the panel is beside the score and Play loop leaves it open', async () => {
    atWidth('wide');
    const view = renderPanel();
    act(() => view.player.setCountInBars(1));
    await view.user.click(await view.panel.findByRole('button', { name: 'Play loop Late' }));

    expect(view.player.getSnapshot().status).toBe('countingIn');
    expect(view.header()).toHaveAttribute('aria-expanded', 'true');
    expect(view.panel.getByRole('region', { name: 'Practicing Late' })).toBeVisible();
  });
});

// Test stage, QA fix round 1: what the closed sheet must not cost, and the scroll to a paused loop.
describe('LoopPanel after Play loop has closed the phone sheet', () => {
  const asPhone = () => vi.stubGlobal('matchMedia', () => ({ matches: false }));
  const asWide = () =>
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === PAGE_LAYOUT_QUERY }));
  const enginePlays = (view: ReturnType<typeof renderPanel>) =>
    act(() => view.engine.fire('stateChanged', { playing: true }));

  afterEach(() => vi.unstubAllGlobals());

  it('reopened, it shows the playing loop and its speed control, and playback is untouched', async () => {
    asPhone();
    const view = renderPanel();
    await view.user.click(await view.panel.findByRole('button', { name: 'Play loop Late' }));
    enginePlays(view);
    expect(view.header()).toHaveAttribute('aria-expanded', 'false');
    const restarts = view.engine.restartCalls();

    await view.user.click(view.header());

    expect(view.header()).toHaveAttribute('aria-expanded', 'true');
    const card = within(view.panel.getByRole('region', { name: 'Practicing Late' }));
    expect(card.getByText('Bars 9 to 12, repeating')).toBeVisible();
    const speed = within(view.panel.getByRole('group', { name: 'Loop speed' }));
    expect(speed.getByLabelText('Speed %')).toBeVisible();
    expect(speed.getByLabelText('Speed %')).toHaveValue('50');
    expect(speed.getByLabelText('BPM')).toHaveValue('45');
    expect(view.panel.getByRole('button', { name: 'Restart loop Late' })).toBeVisible();
    expect(view.engine.restartCalls()).toBe(restarts);
    expect(view.player.getSnapshot()).toMatchObject({
      status: 'playing',
      range: { startBar: 9, endBar: 12 },
      speedRatio: 0.5,
    });
  });

  it('reopened, the speed control still changes the speed live', async () => {
    asPhone();
    const view = renderPanel();
    await view.user.click(await view.panel.findByRole('button', { name: 'Play loop Late' }));
    enginePlays(view);
    await view.user.click(view.header());
    const restarts = view.engine.restartCalls();

    await view.user.click(view.panel.getByRole('button', { name: 'Faster by 5%' }));

    expect(view.player.getSnapshot()).toMatchObject({ status: 'playing', speedRatio: 0.55 });
    expect(view.engine.restartCalls()).toBe(restarts);
    expect(view.header()).toHaveAttribute('aria-expanded', 'true');
  });

  it('on a phone, Play loop after a Pause closes the sheet again: playback starts from that press', async () => {
    asPhone();
    const view = renderPanel();
    await view.user.click(await view.panel.findByRole('button', { name: 'Play loop Late' }));
    enginePlays(view);
    await view.user.click(view.header());
    act(() => {
      view.player.pause();
      view.engine.fire('stateChanged', { playing: false });
    });
    expect(view.header()).toHaveAttribute('aria-expanded', 'true');

    await view.user.click(view.panel.getByRole('button', { name: 'Restart loop Late' }));

    expect(view.header()).toHaveAttribute('aria-expanded', 'false');
    expect(view.engine.play).toHaveBeenCalledTimes(2);
  });

  it('on a phone, switching and restarting while playing never stop playback or close the sheet', async () => {
    asPhone();
    const view = renderPanel();
    await view.user.click(await view.panel.findByRole('button', { name: 'Play loop Late' }));
    enginePlays(view);
    await view.user.click(view.header());
    const restarts = view.engine.restartCalls();
    view.engine.scrollToBar.mockClear();

    await view.user.click(view.play('Intro'));
    await view.user.click(view.panel.getByRole('button', { name: 'Restart loop Intro' }));
    await view.user.click(view.play('Late'));

    expect(view.header()).toHaveAttribute('aria-expanded', 'true');
    expect(view.engine.restartCalls()).toBe(restarts);
    // alphaTab follows its own cursor while it plays.
    expect(view.engine.scrollToBar).not.toHaveBeenCalled();
    expect(view.player.getSnapshot()).toMatchObject({ status: 'playing', barNumber: 9 });
    expect(view.panel.getByRole('group', { name: 'Loop speed' })).toBeVisible();
  });

  it('from 768 px nothing closes it: starting, switching, restarting, or a count-in', async () => {
    asWide();
    const view = renderPanel();
    await view.user.click(await view.panel.findByRole('button', { name: 'Play loop Late' }));
    expect(view.header()).toHaveAttribute('aria-expanded', 'true');
    enginePlays(view);
    await view.user.click(view.play('Intro'));
    expect(view.header()).toHaveAttribute('aria-expanded', 'true');
    await view.user.click(view.panel.getByRole('button', { name: 'Restart loop Intro' }));
    expect(view.header()).toHaveAttribute('aria-expanded', 'true');

    act(() => {
      view.player.pause();
      view.engine.fire('stateChanged', { playing: false });
      view.player.setCountInBars(2);
    });
    await view.user.click(view.play('Late'));
    expect(view.player.getSnapshot().status).toBe('countingIn');
    await view.user.click(view.play('Intro'));
    expect(view.player.getSnapshot()).toMatchObject({ status: 'countingIn', barNumber: 1 });
    expect(view.header()).toHaveAttribute('aria-expanded', 'true');
    expect(view.panel.getByRole('group', { name: 'Loop speed' })).toBeVisible();
    act(() => view.player.pause());
  });
});

// 08 QA issue 2, the part fixed: a loop chosen while paused is scrolled to.
describe('LoopPanel bringing a paused loop’s first bar on screen', () => {
  async function saveTypedLoop(view: ReturnType<typeof renderPanel>, first: string, last: string) {
    await view.user.click(await view.panel.findByRole('button', { name: 'New loop' }));
    await view.user.type(view.panel.getByLabelText('First bar'), first);
    await view.user.type(view.panel.getByLabelText('Last bar'), last);
    await view.user.type(view.panel.getByLabelText('Name'), 'Typed');
    await view.user.click(view.panel.getByRole('button', { name: 'Save loop' }));
    await view.panel.findByRole('region', { name: 'Practicing Typed' });
  }

  it('a loop saved from typed bars while paused scrolls to its first bar, and only once saved', async () => {
    const view = renderPanel();
    await view.user.click(await view.panel.findByRole('button', { name: 'New loop' }));
    await view.user.type(view.panel.getByLabelText('First bar'), '13');
    await view.user.type(view.panel.getByLabelText('Last bar'), '14');
    await view.user.type(view.panel.getByLabelText('Name'), 'Typed');
    // Typed bars are highlighted but not scrolled to (left for Unit 12).
    expect(view.engine.scrollToBar).not.toHaveBeenCalled();

    await view.user.click(view.panel.getByRole('button', { name: 'Save loop' }));
    await view.panel.findByRole('region', { name: 'Practicing Typed' });

    expect(view.engine.scrollToBar).toHaveBeenLastCalledWith(12);
    expect(view.player.getSnapshot()).toMatchObject({
      status: 'ready',
      barNumber: 13,
      range: { startBar: 13, endBar: 14 },
    });
    expect(view.engine.restartCalls()).toBe(1); // the one loadScore of setup
  });

  it('a loop the server refuses scrolls nowhere', async () => {
    const view = renderPanel();
    view.table.failNext('insert', 'nope');
    await view.user.click(await view.panel.findByRole('button', { name: 'New loop' }));
    await view.user.type(view.panel.getByLabelText('First bar'), '13');
    await view.user.type(view.panel.getByLabelText('Last bar'), '14');
    await view.user.type(view.panel.getByLabelText('Name'), 'Typed');
    await view.user.click(view.panel.getByRole('button', { name: 'Save loop' }));
    expect(await view.panel.findByRole('alert')).toBeInTheDocument();
    expect(view.engine.scrollToBar).not.toHaveBeenCalled();
  });

  it('a loop saved while the song plays is left to alphaTab’s own scrolling', async () => {
    const view = renderPanel();
    act(() => {
      view.player.play();
      view.engine.fire('stateChanged', { playing: true });
    });
    await saveTypedLoop(view, '13', '14');
    expect(view.player.getSnapshot()).toMatchObject({ status: 'playing', barNumber: 13 });
    expect(view.engine.scrollToBar).not.toHaveBeenCalled();
  });

  it('the paused loop’s bars, edited in the form, scroll to its new first bar on save', async () => {
    const view = renderPanel();
    await saveTypedLoop(view, '13', '14');
    view.engine.scrollToBar.mockClear();

    await view.user.click(view.panel.getByRole('button', { name: 'Edit Typed' }));
    const first = view.panel.getByLabelText('First bar');
    await view.user.clear(first);
    await view.user.type(first, '3');
    await view.user.click(view.panel.getByRole('button', { name: 'Save loop' }));

    await waitFor(() => expect(view.engine.scrollToBar).toHaveBeenLastCalledWith(2));
    expect(view.player.getSnapshot()).toMatchObject({
      status: 'ready',
      barNumber: 3,
      range: { startBar: 3, endBar: 14 },
    });
    expect(view.engine.play).not.toHaveBeenCalled();
  });

  it('renaming the paused loop moves nothing', async () => {
    const view = renderPanel();
    await saveTypedLoop(view, '13', '14');
    view.engine.scrollToBar.mockClear();
    view.engine.seek.mockClear();

    await view.user.click(view.panel.getByRole('button', { name: 'Edit Typed' }));
    await view.user.type(view.panel.getByLabelText('Name'), ' two');
    await view.user.click(view.panel.getByRole('button', { name: 'Save loop' }));
    await view.panel.findByRole('region', { name: 'Practicing Typed two' });

    expect(view.engine.scrollToBar).not.toHaveBeenCalled();
    expect(view.engine.seek).not.toHaveBeenCalled();
  });
});

describe('LoopPanel new and edited loops', () => {
  it('New loop swaps the list for the form; Cancel brings the list back unchanged', async () => {
    const view = renderPanel();
    await view.user.click(await view.panel.findByRole('button', { name: 'New loop' }));
    expect(view.panel.getByRole('form', { name: 'New loop' })).toBeInTheDocument();
    expect(view.panel.queryByRole('list')).not.toBeInTheDocument();

    await view.user.click(view.panel.getByRole('button', { name: 'Cancel' }));
    expect(view.panel.queryByRole('form')).not.toBeInTheDocument();
    expect(view.names()).toEqual(['Intro', 'Late']);
    expect(view.table.sent('insert')).toEqual([]);
  });

  it('a saved new loop is listed and becomes the loop being practiced, at the speed already playing', async () => {
    const view = renderPanel();
    act(() => view.player.setSpeed(0.9));
    await view.user.click(await view.panel.findByRole('button', { name: 'New loop' }));
    act(() => view.engine.fire('barTapped', { barIndex: 5 }));
    act(() => view.engine.fire('barTapped', { barIndex: 6 }));
    await view.user.type(view.panel.getByLabelText('Name'), 'Fill');
    await view.user.click(view.panel.getByRole('button', { name: 'Save loop' }));

    await waitFor(() => expect(view.names()).toEqual(['Intro', 'Fill', 'Late']));
    expect(view.item('Fill').getByText('Bars 6 to 7 · 90% (108 BPM)')).toBeInTheDocument();
    expect(view.panel.getByRole('region', { name: 'Practicing Fill' })).toBeInTheDocument();
    expect(view.player.getSnapshot()).toMatchObject({
      range: { startBar: 6, endBar: 7 },
      looping: true,
      speedRatio: 0.9,
      highlight: { startBar: 6, endBar: 7 },
    });
    // Saving doesn't start playback; Play does.
    expect(view.engine.play).not.toHaveBeenCalled();
  });

  it('a new loop the server refuses is never listed or looped', async () => {
    const view = renderPanel();
    view.table.failNext('insert', 'no');
    await view.user.click(await view.panel.findByRole('button', { name: 'New loop' }));
    await view.user.type(view.panel.getByLabelText('First bar'), '6');
    await view.user.type(view.panel.getByLabelText('Last bar'), '7');
    await view.user.type(view.panel.getByLabelText('Name'), 'Fill');
    await view.user.click(view.panel.getByRole('button', { name: 'Save loop' }));

    expect(await view.panel.findByRole('alert')).toHaveTextContent("Couldn't save the loop");
    expect(view.player.getSnapshot().range).toBeNull();
    await view.user.click(view.panel.getByRole('button', { name: 'Cancel' }));
    expect(view.names()).toEqual(['Intro', 'Late']);
  });

  it('editing another loop leaves the playing loop playing', async () => {
    const view = renderPanel();
    await view.user.click(await view.panel.findByRole('button', { name: 'Play loop Intro' }));
    await view.user.click(view.panel.getByRole('button', { name: 'Edit Late' }));
    // The form's bars are on show; the bars playing are still Intro's.
    expect(view.player.getSnapshot()).toMatchObject({
      range: { startBar: 1, endBar: 4 },
      highlight: { startBar: 9, endBar: 12 },
    });

    const name = view.panel.getByLabelText('Name');
    await view.user.clear(name);
    await view.user.type(name, 'Later');
    await view.user.click(view.panel.getByRole('button', { name: 'Save loop' }));

    await waitFor(() => expect(view.names()).toEqual(['Intro', 'Later']));
    expect(view.panel.getByRole('region', { name: 'Practicing Intro' })).toBeInTheDocument();
    expect(view.player.getSnapshot()).toMatchObject({
      range: { startBar: 1, endBar: 4 },
      highlight: { startBar: 1, endBar: 4 },
      speedRatio: 0.8,
    });
  });

  it('a renamed playing loop shows its new name everywhere', async () => {
    const view = renderPanel();
    await view.user.click(await view.panel.findByRole('button', { name: 'Play loop Intro' }));
    await view.user.click(view.panel.getByRole('button', { name: 'Edit Intro' }));
    const name = view.panel.getByLabelText('Name');
    await view.user.clear(name);
    await view.user.type(name, 'Opening');
    await view.user.click(view.panel.getByRole('button', { name: 'Save loop' }));

    expect(await view.panel.findByRole('region', { name: 'Practicing Opening' })).toBeVisible();
    expect(view.header()).toHaveTextContent('Loop: Opening');
    expect(view.panel.getByRole('button', { name: 'Restart loop Opening' })).toBeInTheDocument();
  });

  it('says so when the loop being edited has been deleted elsewhere, and goes back to the list', async () => {
    const view = renderPanel();
    await view.user.click(await view.panel.findByRole('button', { name: 'Edit Late' }));
    view.table.setRows([intro]);
    await act(() =>
      view.queryClient.invalidateQueries({ queryKey: loopKeys.forSong('user-1', LOOP_SONG_ID) }),
    );

    expect(await view.panel.findByText('This loop has been deleted.')).toBeInTheDocument();
    expect(view.panel.queryByRole('form')).not.toBeInTheDocument();
    await view.user.click(view.panel.getByRole('button', { name: 'Back to loops' }));
    expect(view.names()).toEqual(['Intro']);
  });
});

describe('LoopPanel deleting a loop', () => {
  const confirmFor = (view: ReturnType<typeof renderPanel>, name: string) =>
    within(view.panel.getByRole('group', { name: `Delete ${name}` }));

  it('asks first, in the item, saying the history goes too; Keep it backs out', async () => {
    const view = renderPanel();
    await view.user.click(await view.panel.findByRole('button', { name: 'Delete Late' }));

    const confirm = confirmFor(view, 'Late');
    expect(confirm.getByText(/Delete “Late”\? Its practice history is deleted too/)).toBeVisible();
    // Inline: no dialog, and the item's other actions make way for the question.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(view.panel.queryByRole('button', { name: 'Play loop Late' })).not.toBeInTheDocument();
    expect(view.play('Intro')).toBeInTheDocument();
    expect(view.table.sent('delete')).toEqual([]);

    await view.user.click(confirm.getByRole('button', { name: 'Keep it' }));
    expect(view.play('Late')).toBeInTheDocument();
    expect(view.table.rows()).toHaveLength(2);
  });

  it('keeps the loop listed until the server confirms, with both buttons locked meanwhile', async () => {
    const view = renderPanel();
    const release = view.table.holdNext('delete');
    await view.user.click(await view.panel.findByRole('button', { name: 'Delete Late' }));
    await view.user.click(confirmFor(view, 'Late').getByRole('button', { name: 'Delete loop' }));

    const deleting = await confirmFor(view, 'Late').findByRole('button', { name: 'Deleting…' });
    expect(deleting).toBeDisabled();
    expect(confirmFor(view, 'Late').getByRole('button', { name: 'Keep it' })).toBeDisabled();
    expect(view.names()).toEqual(['Intro', 'Late']);

    release();
    await waitFor(() => expect(view.names()).toEqual(['Intro']));
    expect(view.table.rows().map((row) => row.id)).toEqual(['intro']);
  });

  it('a failed delete says so and leaves the loop there to try again', async () => {
    const view = renderPanel();
    view.table.failNext('delete', 'network');
    await view.user.click(await view.panel.findByRole('button', { name: 'Delete Late' }));
    await view.user.click(confirmFor(view, 'Late').getByRole('button', { name: 'Delete loop' }));

    expect(await confirmFor(view, 'Late').findByRole('alert')).toHaveTextContent(
      "Couldn't delete the loop: network",
    );
    expect(view.names()).toEqual(['Intro', 'Late']);

    await view.user.click(confirmFor(view, 'Late').getByRole('button', { name: 'Delete loop' }));
    await waitFor(() => expect(view.names()).toEqual(['Intro']));
  });

  it('deleting a loop that is not playing leaves the playing one alone', async () => {
    const view = renderPanel();
    await view.user.click(await view.panel.findByRole('button', { name: 'Play loop Intro' }));
    await view.user.click(view.panel.getByRole('button', { name: 'Delete Late' }));
    await view.user.click(confirmFor(view, 'Late').getByRole('button', { name: 'Delete loop' }));

    await waitFor(() => expect(view.names()).toEqual(['Intro']));
    expect(view.panel.getByRole('region', { name: 'Practicing Intro' })).toBeInTheDocument();
    expect(view.player.getSnapshot().range).toEqual({ startBar: 1, endBar: 4 });
  });

  it('deleting the last loop leaves the empty note', async () => {
    const view = renderPanel({ loops: [intro] });
    await view.user.click(await view.panel.findByRole('button', { name: 'Delete Intro' }));
    await view.user.click(confirmFor(view, 'Intro').getByRole('button', { name: 'Delete loop' }));
    expect(await view.panel.findByText(/No loops yet/)).toBeInTheDocument();
  });
});
