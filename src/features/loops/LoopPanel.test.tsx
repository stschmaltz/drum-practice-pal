import { useState } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { onlineManager } from '@tanstack/react-query';
import { enginePlays } from '@/test/countInPlayer';
import { expectLocked, expectUnlocked } from '@/test/locked';
import { queryResult, resetFakeSupabase } from '@/test/fakeSupabase';
import { startOfBar, straightBars, TEMPO_CHANGE_BAR_TEMPOS } from '@/test/fakePlayerEngine';
import { loopPlayer, usePlayerSnapshot } from '@/test/loopPlayer';
import { LOOP_SONG_ID, loopRow, serveLoopTable, type LoopTable } from '@/test/loopTable';
import { settle, testQueryClient, wrapperFor } from '@/test/render';
import { PAGE_LAYOUT_QUERY } from '@/features/player/layout';
import type { PlayerService } from '@/features/player/PlayerService';
import type { PracticeSession } from '@/features/practice/sessions';
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
  prepare?: (table: LoopTable) => void;
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
  const user = userEvent.setup();
  return {
    user,
    table,
    engine,
    player,
    finishLoading,
    panel,
    /** Presses the panel's button of this name, once it is there. */
    press: async (name: string) => user.click(await panel.findByRole('button', { name })),
    /** Reads the list again, as a refocus or another write would. */
    refetch: () =>
      act(() =>
        queryClient.invalidateQueries({ queryKey: loopKeys.forSong('user-1', LOOP_SONG_ID) }),
      ),
    /** What alphaTab reports once play() takes effect. */
    enginePlays: () => act(() => enginePlays(engine)),
    /** Pause, and alphaTab's report of it. */
    pause: () =>
      act(() => {
        player.pause();
        engine.fire('stateChanged', { playing: false });
      }),
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

type View = ReturnType<typeof renderPanel>;

/** Opens the new-loop form and types its bars and name, without saving. */
async function typeNewLoop(view: View, loop: { first: string; last: string; name: string }) {
  await view.press('New loop');
  await view.user.type(view.panel.getByLabelText('First bar'), loop.first);
  await view.user.type(view.panel.getByLabelText('Last bar'), loop.last);
  await view.user.type(view.panel.getByLabelText('Name'), loop.name);
}

/** Types over the open form's name. */
async function rename(view: View, name: string) {
  const field = view.panel.getByLabelText('Name');
  await view.user.clear(field);
  await view.user.type(field, name);
}

/** Below or from the 768 px breakpoint, as the browser would answer the layout query. */
const atWidth = (kind: 'phone' | 'wide') =>
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: kind === 'wide' && query === PAGE_LAYOUT_QUERY,
  }));

beforeEach(() => {
  resetFakeSupabase();
});

afterEach(() => {
  vi.unstubAllGlobals();
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
    await view.refetch();
    await waitFor(() => expect(view.header()).toHaveTextContent('Loops (1)'));
    await view.user.click(view.header());
    await view.press('Play loop Intro');
    expect(view.header()).toHaveTextContent('Loop: Intro');
  });

  it('keeps the playing loop going while closed', async () => {
    const view = renderPanel();
    await view.press('Play loop Intro');
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

  it('cannot play a loop while the sounds are still loading, though the score is there', async () => {
    atWidth('phone');
    const view = renderPanel({ loaded: false });
    await waitFor(() => expect(view.names()).toEqual(['Intro', 'Late']));
    // alphaTab has the score; the MIDI and the soundfont are still to come.
    act(() =>
      view.engine.fire('scoreLoaded', {
        barCount: 16,
        trackCount: 3,
        barTempos: [...TEMPO_CHANGE_BAR_TEMPOS],
        barMeters: Array.from({ length: 16 }, () => ({ beats: 4, beatValue: 4 })),
      }),
    );
    expect(view.player.getSnapshot()).toMatchObject({ status: 'loading', barCount: 16 });

    // Play would not start, so nothing offers it; the bars and BPM are already known.
    expect(view.play('Intro')).toBeDisabled();
    expect(view.item('Late').getByText(/50% \(45 BPM\)/)).toBeInTheDocument();
    expect(view.panel.getByRole('button', { name: 'New loop' })).toBeEnabled();
    await view.user.click(view.play('Intro'));
    expect(view.header()).toHaveAttribute('aria-expanded', 'true');
    expect(view.player.getSnapshot().range).toBeNull();

    act(() => {
      view.engine.fire('ticksReady', { bars: straightBars(16) });
      view.engine.fire('readyForPlayback', undefined);
    });
    expect(view.play('Intro')).toBeEnabled();
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
    await view.press('Play loop Intro');
    view.table.failNext('select', 'offline');
    await view.refetch();

    expect(view.names()).toEqual(['Intro', 'Late']);
    expect(view.panel.queryByRole('alert')).not.toBeInTheDocument();
    expect(view.player.getSnapshot().range).toEqual({ startBar: 1, endBar: 4 });
  });
});

describe('LoopPanel playing a loop', () => {
  it('Play loop starts it at its bars and saved speed, and shows it as the one being practiced', async () => {
    const view = renderPanel();
    await view.press('Play loop Late');

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

  it('Restart loop goes back to the first bar at the speed playing now, without stopping', async () => {
    const view = renderPanel();
    await view.press('Play loop Late');
    act(() => {
      view.engine.fire('stateChanged', { playing: true });
      view.engine.fire('position', { tick: startOfBar(9) });
      view.engine.fire('position', { tick: startOfBar(11) + 5 });
    });
    await view.press('Faster by 5%');
    expect(view.player.getSnapshot()).toMatchObject({ barNumber: 11, speedRatio: 0.55 });
    const pausesAndStops = view.engine.pause.mock.calls.length + view.engine.stop.mock.calls.length;

    await view.press('Restart loop Late');

    expect(view.player.getSnapshot()).toMatchObject({
      status: 'playing',
      barNumber: 9,
      // Not back to the saved 50%: the nudge hasn't been saved, and Restart must not lose it.
      speedRatio: 0.55,
    });
    expect(view.engine.pause.mock.calls.length + view.engine.stop.mock.calls.length).toBe(
      pausesAndStops,
    );
    expect(view.engine.loadScore).toHaveBeenCalledTimes(1);
  });

  it('Back to whole song leaves the loop, and its card goes', async () => {
    const view = renderPanel();
    await view.press('Play loop Intro');
    await view.press('Back to whole song');

    expect(view.panel.queryByRole('region', { name: /Practicing/ })).not.toBeInTheDocument();
    expect(view.player.getSnapshot()).toMatchObject({ range: null, looping: false });
    expect(view.play('Intro')).toBeInTheDocument();
  });
});

// 08 QA issue 1: the sheet lies over the score and the count-in number.
describe('LoopPanel Play loop and the phone sheet', () => {
  it('on a phone, Play loop closes the sheet and starts the loop, named in the header', async () => {
    atWidth('phone');
    const view = renderPanel();
    await view.press('Play loop Late');

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
    await view.press('Play loop Late');

    expect(view.player.getSnapshot().status).toBe('countingIn');
    expect(view.header()).toHaveAttribute('aria-expanded', 'false');
    // The loop's first bar is brought on screen for the count-in.
    expect(view.engine.scrollToBar).toHaveBeenLastCalledWith(8);
  });

  it('on a phone, choosing another loop during a count-in closes the sheet again', async () => {
    atWidth('phone');
    const view = renderPanel();
    act(() => view.player.setCountInBars(2));
    await view.press('Play loop Late');
    await view.user.click(view.header());
    expect(view.header()).toHaveAttribute('aria-expanded', 'true');

    await view.press('Play loop Intro');

    expect(view.player.getSnapshot()).toMatchObject({ status: 'countingIn', barNumber: 1 });
    expect(view.header()).toHaveAttribute('aria-expanded', 'false');
  });

  it('reopened, it shows the playing loop and its speed control, and playback is untouched', async () => {
    atWidth('phone');
    const view = renderPanel();
    await view.press('Play loop Late');
    view.enginePlays();
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
    atWidth('phone');
    const view = renderPanel();
    await view.press('Play loop Late');
    view.enginePlays();
    await view.user.click(view.header());
    const restarts = view.engine.restartCalls();

    await view.press('Faster by 5%');

    expect(view.player.getSnapshot()).toMatchObject({ status: 'playing', speedRatio: 0.55 });
    expect(view.engine.restartCalls()).toBe(restarts);
    expect(view.header()).toHaveAttribute('aria-expanded', 'true');
  });

  it('on a phone, Play loop after a Pause closes the sheet again: playback starts from that press', async () => {
    atWidth('phone');
    const view = renderPanel();
    await view.press('Play loop Late');
    view.enginePlays();
    await view.user.click(view.header());
    view.pause();
    expect(view.header()).toHaveAttribute('aria-expanded', 'true');

    await view.press('Restart loop Late');

    expect(view.header()).toHaveAttribute('aria-expanded', 'false');
    expect(view.engine.play).toHaveBeenCalledTimes(2);
  });

  it('on a phone, switching and restarting while playing never stop playback or close the sheet', async () => {
    atWidth('phone');
    const view = renderPanel();
    await view.press('Play loop Late');
    view.enginePlays();
    await view.user.click(view.header());
    const restarts = view.engine.restartCalls();
    view.engine.scrollToBar.mockClear();

    await view.press('Play loop Intro');
    await view.press('Restart loop Intro');
    await view.press('Play loop Late');

    expect(view.header()).toHaveAttribute('aria-expanded', 'true');
    expect(view.engine.restartCalls()).toBe(restarts);
    // alphaTab follows its own cursor while it plays.
    expect(view.engine.scrollToBar).not.toHaveBeenCalled();
    expect(view.player.getSnapshot()).toMatchObject({ status: 'playing', barNumber: 9 });
    expect(view.panel.getByRole('group', { name: 'Loop speed' })).toBeVisible();
  });

  it('from 768 px nothing closes it: starting, switching, restarting, or a count-in', async () => {
    atWidth('wide');
    const view = renderPanel();
    await view.press('Play loop Late');
    expect(view.header()).toHaveAttribute('aria-expanded', 'true');
    view.enginePlays();
    await view.press('Play loop Intro');
    expect(view.header()).toHaveAttribute('aria-expanded', 'true');
    await view.press('Restart loop Intro');
    expect(view.header()).toHaveAttribute('aria-expanded', 'true');

    act(() => {
      view.player.pause();
      view.engine.fire('stateChanged', { playing: false });
      view.player.setCountInBars(2);
    });
    await view.press('Play loop Late');
    expect(view.player.getSnapshot().status).toBe('countingIn');
    await view.press('Play loop Intro');
    expect(view.player.getSnapshot()).toMatchObject({ status: 'countingIn', barNumber: 1 });
    expect(view.header()).toHaveAttribute('aria-expanded', 'true');
    expect(view.panel.getByRole('group', { name: 'Loop speed' })).toBeVisible();
    act(() => view.player.pause());
  });
});

// 08 QA issue 2, the part fixed: a loop chosen while paused is scrolled to.
describe('LoopPanel bringing a paused loop’s first bar on screen', () => {
  async function saveTypedLoop(view: View, first: string, last: string) {
    await typeNewLoop(view, { first, last, name: 'Typed' });
    await view.press('Save loop');
    await view.panel.findByRole('region', { name: 'Practicing Typed' });
  }

  it('a loop saved from typed bars while paused scrolls to its first bar, and only once saved', async () => {
    const view = renderPanel();
    await typeNewLoop(view, { first: '13', last: '14', name: 'Typed' });
    // Typed bars are highlighted but not scrolled to (left for Unit 12).
    expect(view.engine.scrollToBar).not.toHaveBeenCalled();

    await view.press('Save loop');
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
    await typeNewLoop(view, { first: '13', last: '14', name: 'Typed' });
    await view.press('Save loop');
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

    await view.press('Edit Typed');
    const first = view.panel.getByLabelText('First bar');
    await view.user.clear(first);
    await view.user.type(first, '3');
    await view.press('Save loop');

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

    await view.press('Edit Typed');
    await view.user.type(view.panel.getByLabelText('Name'), ' two');
    await view.press('Save loop');
    await view.panel.findByRole('region', { name: 'Practicing Typed two' });

    expect(view.engine.scrollToBar).not.toHaveBeenCalled();
    expect(view.engine.seek).not.toHaveBeenCalled();
  });
});

describe('LoopPanel new and edited loops', () => {
  it('New loop swaps the list for the form; Cancel brings the list back unchanged', async () => {
    const view = renderPanel();
    await view.press('New loop');
    expect(view.panel.getByRole('form', { name: 'New loop' })).toBeInTheDocument();
    expect(view.panel.queryByRole('list')).not.toBeInTheDocument();

    await view.press('Cancel');
    expect(view.panel.queryByRole('form')).not.toBeInTheDocument();
    expect(view.names()).toEqual(['Intro', 'Late']);
    expect(view.table.sent('insert')).toEqual([]);
  });

  it('a saved new loop is listed and becomes the loop being practiced, at the speed already playing', async () => {
    const view = renderPanel();
    act(() => view.player.setSpeed(0.9));
    await view.press('New loop');
    act(() => view.engine.fire('barTapped', { barIndex: 5 }));
    act(() => view.engine.fire('barTapped', { barIndex: 6 }));
    await view.user.type(view.panel.getByLabelText('Name'), 'Fill');
    await view.press('Save loop');

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
    await typeNewLoop(view, { first: '6', last: '7', name: 'Fill' });
    await view.press('Save loop');

    expect(await view.panel.findByRole('alert')).toHaveTextContent("Couldn't save the loop");
    expect(view.player.getSnapshot().range).toBeNull();
    await view.press('Cancel');
    expect(view.names()).toEqual(['Intro', 'Late']);
  });

  it('while a save is on its way, the score picks no bars; a refused save gives them back', async () => {
    const view = renderPanel();
    const tap = (barNumber: number) =>
      act(() => view.engine.fire('barTapped', { barIndex: barNumber - 1 }));
    const drag = (fromBar: number, toBar: number) =>
      act(() =>
        view.engine.fire('barsDragged', {
          fromBarIndex: fromBar - 1,
          toBarIndex: toBar - 1,
          done: true,
        }),
      );
    const bars = () => [
      view.panel.getByLabelText<HTMLInputElement>('First bar').value,
      view.panel.getByLabelText<HTMLInputElement>('Last bar').value,
    ];
    await typeNewLoop(view, { first: '6', last: '7', name: 'Fill' });
    view.table.failNext('insert', 'no');
    const release = view.table.holdNext('insert');
    await view.press('Save loop');
    await view.panel.findByRole('button', { name: 'Saving…' });

    // What was sent stays what is shown and highlighted.
    tap(12);
    drag(2, 3);
    expect(bars()).toEqual(['6', '7']);
    expect(view.player.getSnapshot().highlight).toEqual({ startBar: 6, endBar: 7 });

    release();
    expect(await view.panel.findByRole('alert')).toHaveTextContent("Couldn't save the loop");
    drag(2, 3);
    expect(bars()).toEqual(['2', '3']);
    tap(12);
    expect(bars()).toEqual(['12', '12']);
  });

  it('editing another loop leaves the playing loop playing', async () => {
    const view = renderPanel();
    await view.press('Play loop Intro');
    await view.press('Edit Late');
    // The form's bars are on show; the bars playing are still Intro's.
    expect(view.player.getSnapshot()).toMatchObject({
      range: { startBar: 1, endBar: 4 },
      highlight: { startBar: 9, endBar: 12 },
    });

    await rename(view, 'Later');
    await view.press('Save loop');

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
    await view.press('Play loop Intro');
    await view.press('Edit Intro');
    await rename(view, 'Opening');
    await view.press('Save loop');

    expect(await view.panel.findByRole('region', { name: 'Practicing Opening' })).toBeVisible();
    expect(view.header()).toHaveTextContent('Loop: Opening');
    expect(view.panel.getByRole('button', { name: 'Restart loop Opening' })).toBeInTheDocument();
  });

  it('says so when the loop being edited has been deleted elsewhere, and goes back to the list', async () => {
    const view = renderPanel();
    await view.press('Edit Late');
    view.table.setRows([intro]);
    await view.refetch();

    expect(await view.panel.findByText('This loop has been deleted.')).toBeInTheDocument();
    expect(view.panel.queryByRole('form')).not.toBeInTheDocument();
    await view.press('Back to loops');
    expect(view.names()).toEqual(['Intro']);
  });
});

describe('LoopPanel deleting a loop', () => {
  const confirmFor = (view: View, name: string) =>
    within(view.panel.getByRole('group', { name: `Delete ${name}` }));

  it('asks first, in the item, saying the history goes too; Keep it backs out', async () => {
    const view = renderPanel();
    await view.press('Delete Late');

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
    await view.press('Delete Late');
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
    await view.press('Delete Late');
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
    await view.press('Play loop Intro');
    await view.press('Delete Late');
    await view.user.click(confirmFor(view, 'Late').getByRole('button', { name: 'Delete loop' }));

    await waitFor(() => expect(view.names()).toEqual(['Intro']));
    expect(view.panel.getByRole('region', { name: 'Practicing Intro' })).toBeInTheDocument();
    expect(view.player.getSnapshot().range).toEqual({ startBar: 1, endBar: 4 });
  });

  it('deleting the last loop leaves the empty note', async () => {
    const view = renderPanel({ loops: [intro] });
    await view.press('Delete Intro');
    await view.user.click(confirmFor(view, 'Intro').getByRole('button', { name: 'Delete loop' }));
    expect(await view.panel.findByText(/No loops yet/)).toBeInTheDocument();
  });
});

describe('LoopPanel finishing a loop', () => {
  const atTarget = loopRow('late', {
    name: 'Late',
    start_bar: 9,
    end_bar: 12,
    speed_ratio: 1,
    target_ratio: 1,
  });
  const prompt = (view: ReturnType<typeof renderPanel>) =>
    within(view.panel.getByRole('group', { name: 'Mark finished?' }));
  /** The Late loop as the table holds it now. */
  const savedLate = (view: ReturnType<typeof renderPanel>) =>
    view.table.rows().find((row) => row.id === 'late');
  const finishedNames = (view: ReturnType<typeof renderPanel>) =>
    within(view.panel.getByRole('region', { name: 'Finished loops' }))
      .getAllByRole('listitem')
      .map((li) => li.querySelector('p')?.textContent ?? '');

  it('does not ask while the saved speed is under the target, however fast it is playing', async () => {
    const view = renderPanel();
    await view.press('Play loop Late');
    view.enginePlays();

    await view.press('Faster by 5%');
    act(() => view.player.setSpeed(1.2));

    expect(view.panel.queryByTestId('finish-prompt')).not.toBeInTheDocument();
  });

  it('asks once the saved speed reaches the target, and finishes nothing by itself', async () => {
    const view = renderPanel();
    await view.press('Play loop Late');
    view.enginePlays();
    act(() => view.player.setSpeed(1));

    await view.press('Save speed');

    expect(await view.panel.findByTestId('finish-prompt')).toHaveTextContent(
      "You've reached your target of 100%. Mark this loop finished?",
    );
    expect(view.table.sent('update')).toEqual([{ speed_ratio: 1 }]);
    expect(savedLate(view)?.status).toBe('active');
    // Still playing: the question interrupts nothing.
    expect(view.player.getSnapshot().status).toBe('playing');
  });

  it('"Not yet" takes the question away until a faster speed is saved', async () => {
    const view = renderPanel({ loops: [intro, atTarget] });
    await view.press('Play loop Late');
    view.enginePlays();

    await view.user.click(prompt(view).getByRole('button', { name: 'Not yet' }));

    expect(view.panel.queryByTestId('finish-prompt')).not.toBeInTheDocument();
    expect(view.table.sent('update')).toEqual([]);
    // Opening and closing the form doesn't bring it back.
    await view.press('Edit Intro');
    await view.press('Cancel');
    expect(view.panel.queryByTestId('finish-prompt')).not.toBeInTheDocument();

    await view.press('Faster by 5%');
    await view.press('Save speed');
    expect(await view.panel.findByTestId('finish-prompt')).toBeInTheDocument();
  });

  it('"Mark finished" moves the loop under Finished, keeps it playing, and stops asking', async () => {
    const view = renderPanel({ loops: [intro, atTarget] });
    await view.press('Play loop Late');
    view.enginePlays();

    await view.user.click(prompt(view).getByRole('button', { name: 'Mark finished' }));

    await waitFor(() => expect(finishedNames(view)).toEqual(['Late']));
    expect(view.table.sent('update')).toEqual([{ status: 'finished' }]);
    expect(view.panel.queryByTestId('finish-prompt')).not.toBeInTheDocument();
    expect(view.panel.getByRole('heading', { name: 'Finished (1)' })).toBeInTheDocument();
    expect(view.player.getSnapshot()).toMatchObject({
      status: 'playing',
      range: { startBar: 9, endBar: 12 },
    });
  });

  it('finishes and reopens from the list, without touching playback', async () => {
    const view = renderPanel();
    expect(view.panel.queryByRole('region', { name: 'Finished loops' })).not.toBeInTheDocument();

    await view.press('Mark finished Intro');

    await waitFor(() => expect(finishedNames(view)).toEqual(['Intro']));
    expect(view.names()).toEqual(['Late', 'Intro']);
    expect(view.engine.play).not.toHaveBeenCalled();

    await view.press('Reopen Intro');

    await waitFor(() =>
      expect(view.panel.queryByRole('region', { name: 'Finished loops' })).not.toBeInTheDocument(),
    );
    expect(view.names()).toEqual(['Intro', 'Late']);
    expect(view.table.sent('update')).toEqual([{ status: 'finished' }, { status: 'active' }]);
  });

  it('a finished loop can still be played', async () => {
    const view = renderPanel({
      loops: [
        loopRow('intro', { ...intro, status: 'finished', finished_at: '2026-11-20T10:00:00Z' }),
      ],
    });
    expect(await view.panel.findByText('Every loop of this song is finished.')).toBeInTheDocument();

    await view.press('Play loop Intro');

    expect(view.engine.play).toHaveBeenCalledTimes(1);
    expect(view.player.getSnapshot().range).toEqual({ startBar: 1, endBar: 4 });
  });

  it('locks the button while the change is on its way, and says so when it is refused', async () => {
    const view = renderPanel();
    const release = view.table.holdNext('update');
    await view.press('Mark finished Intro');

    const reopen = await view.panel.findByRole('button', { name: 'Reopen Intro' });
    expectLocked(reopen);
    release();
    await waitFor(() => expectUnlocked(view.panel.getByRole('button', { name: 'Reopen Intro' })));

    // Held, so the loop is seen to move back among the active ones before the refusal:
    // the button that was pressed is gone by then, and the one that returns must say why.
    const refuse = view.table.holdNext('update');
    view.table.failNext('update', 'nope');
    await view.press('Reopen Intro');
    await waitFor(() =>
      expect(view.panel.queryByRole('region', { name: 'Finished loops' })).not.toBeInTheDocument(),
    );
    refuse();

    await waitFor(() => expect(finishedNames(view)).toEqual(['Intro']));
    expect(await view.item('Intro').findByRole('alert')).toHaveTextContent(
      "Couldn't change the loop: nope",
    );
  });

  it('a refused "Mark finished" from the prompt brings the prompt back with the reason', async () => {
    const view = renderPanel({ loops: [intro, atTarget] });
    await view.press('Play loop Late');
    view.enginePlays();
    const refuse = view.table.holdNext('update');
    view.table.failNext('update', 'nope');

    await view.user.click(prompt(view).getByRole('button', { name: 'Mark finished' }));
    await waitFor(() => expect(finishedNames(view)).toEqual(['Late']));
    expect(view.panel.queryByTestId('finish-prompt')).not.toBeInTheDocument();
    refuse();

    expect(await view.panel.findByTestId('finish-prompt')).toHaveTextContent(
      "Couldn't mark the loop finished: nope",
    );
    expect(savedLate(view)?.status).toBe('active');
  });

  it('asks when the speed shows as the target’s percent, though its ratio is a hair under', async () => {
    // A speed typed as a BPM is kept as a fine ratio (85 at a tempo of 120 is 0.708333);
    // the target field holds whole percents.
    const view = renderPanel({
      loops: [loopRow('late', { ...atTarget, speed_ratio: 0.708333, target_ratio: 0.71 })],
    });
    await view.press('Play loop Late');
    view.enginePlays();

    expect(view.item('Late').getByText(/71% \(64 BPM\) · target 71% \(64 BPM\)/)).toBeVisible();
    expect(await view.panel.findByTestId('finish-prompt')).toHaveTextContent(
      "You've reached your target of 71%.",
    );
  });

  it('while the prompt’s "Mark finished" is on its way, the list’s button is locked and a press sends nothing', async () => {
    const view = renderPanel({ loops: [intro, atTarget] });
    await view.press('Play loop Late');
    view.enginePlays();
    const release = view.table.holdNext('update');
    await view.user.click(prompt(view).getByRole('button', { name: 'Mark finished' }));

    const reopen = await view.panel.findByRole('button', { name: 'Reopen Late' });
    expectLocked(reopen);
    // Another loop's button is not held up by it.
    expectUnlocked(view.panel.getByRole('button', { name: 'Mark finished Intro' }));
    await view.user.click(reopen);
    expect(view.table.sent('update')).toEqual([{ status: 'finished' }]);

    release();

    await waitFor(() => expectUnlocked(view.panel.getByRole('button', { name: 'Reopen Late' })));
    expect(view.table.sent('update')).toEqual([{ status: 'finished' }]);
    expect(savedLate(view)?.status).toBe('finished');
  });

  it('while the list’s Reopen is on its way, the prompt’s Mark finished is locked, and a press sends nothing', async () => {
    const finishedAtTarget = loopRow('late', {
      ...atTarget,
      status: 'finished',
      finished_at: '2026-11-20T10:00:00Z',
    });
    const view = renderPanel({ loops: [intro, finishedAtTarget] });
    await view.press('Play loop Late');
    view.enginePlays();
    expect(view.panel.queryByTestId('finish-prompt')).not.toBeInTheDocument();
    const release = view.table.holdNext('update');
    await view.press('Reopen Late');

    // Reopened at its target, so the prompt asks at once, with the reopen still pending.
    const finish = await prompt(view).findByRole('button', { name: 'Mark finished' });
    expectLocked(finish);
    await view.user.click(finish);
    finish.focus();
    await view.user.keyboard('{Enter}');
    await view.user.keyboard(' ');
    await settle();
    expect(view.table.sent('update')).toEqual([{ status: 'active' }]);
    // The refused press had no other effect: the prompt is still asking.
    expect(view.panel.getByTestId('finish-prompt')).toBeInTheDocument();

    release();
    await waitFor(() => expectUnlocked(finish));
    await view.user.click(finish);
    await waitFor(() =>
      expect(view.table.sent('update')).toEqual([{ status: 'active' }, { status: 'finished' }]),
    );
    await waitFor(() => expect(finishedNames(view)).toEqual(['Late']));
  });

  it('"Save speed" pressed while "Mark finished" is on its way waits for it, and neither undoes the other', async () => {
    const view = renderPanel({ loops: [intro, atTarget] });
    await view.press('Play loop Late');
    view.enginePlays();
    const release = view.table.holdNext('update');
    await view.user.click(prompt(view).getByRole('button', { name: 'Mark finished' }));
    await waitFor(() => expect(finishedNames(view)).toEqual(['Late']));

    // Loop edits go one at a time (their scope), so the speed isn't sent until the finish
    // has its answer: no answer can come back from before the other write.
    await view.press('Slower by 5%');
    await view.press('Save speed');
    await settle();
    expect(view.table.sent('update')).toEqual([{ status: 'finished' }]);
    expect(finishedNames(view)).toEqual(['Late']);
    expect(view.panel.queryByTestId('finish-prompt')).not.toBeInTheDocument();

    release();
    await waitFor(() =>
      expect(view.table.sent('update')).toEqual([{ status: 'finished' }, { speed_ratio: 0.95 }]),
    );

    await waitFor(() =>
      expect(savedLate(view)).toMatchObject({
        status: 'finished',
        speed_ratio: 0.95,
      }),
    );
    await waitFor(() => expectUnlocked(view.panel.getByRole('button', { name: 'Reopen Late' })));
    expect(finishedNames(view)).toEqual(['Late']);
    expect(view.item('Late').getByText(/95% \(86 BPM\)/)).toBeInTheDocument();
  });

  it('a finer target survives finishing and reopening: only the status is sent', async () => {
    const view = renderPanel({
      loops: [loopRow('late', { ...late, speed_ratio: 0.708333, target_ratio: 0.855556 })],
    });

    await view.press('Mark finished Late');
    await view.press('Reopen Late');

    await waitFor(() =>
      expect(view.table.sent('update')).toEqual([{ status: 'finished' }, { status: 'active' }]),
    );
    expect(view.table.rows()[0]).toMatchObject({ speed_ratio: 0.708333, target_ratio: 0.855556 });
  });
});

describe('LoopPanel history', () => {
  const session = (id: string, overrides: Partial<PracticeSession> = {}): PracticeSession => ({
    id,
    loop_id: 'late',
    started_at: '2026-11-20T19:42:00.000Z',
    duration_seconds: 65,
    speed_ratio: 0.5,
    repeats: 9,
    ...overrides,
  });

  /** Serves the loops table as before, and `sessions` (or a failure) for the history. */
  function withSessions(sessions: PracticeSession[] | 'fail') {
    return (table: LoopTable) => {
      queryResult.mockImplementation(async (call) => {
        if (call.table === 'loops') return table.answer(call);
        if (sessions === 'fail') return { data: null, error: { message: 'internal detail' } };
        const loopId = call.ops.find((op) => op.method === 'eq' && op.args[0] === 'loop_id');
        return {
          data: sessions.filter((row) => row.loop_id === loopId?.args[1]),
          error: null,
        };
      });
    };
  }
  const history = (view: ReturnType<typeof renderPanel>, name: string) =>
    within(view.panel.getByRole('region', { name: `History of ${name}` }));

  it('is fetched only when opened, and lists each session newest first with a total', async () => {
    const view = renderPanel({
      prepare: withSessions([
        session('older', { started_at: '2026-11-18T10:00:00.000Z', duration_seconds: 300 }),
        session('newer', { speed_ratio: 0.708333, repeats: 1 }),
        session('other-loop', { loop_id: 'intro' }),
      ]),
    });
    await view.panel.findByRole('button', { name: 'History Late' });
    const sessionQueries = () =>
      queryResult.mock.calls.filter(([call]) => call.table === 'practice_sessions');
    expect(sessionQueries()).toHaveLength(0);

    await view.press('History Late');

    const list = history(view, 'Late');
    expect(await list.findByTestId('loop-history-summary')).toHaveTextContent(
      '2 sessions · 6 min 5 s in all',
    );
    const rows = list.getAllByRole('listitem').map((li) => li.textContent ?? '');
    expect(rows).toHaveLength(2);
    // BPM from the tempo at the loop's first bar (90 from bar 9).
    expect(rows[0]).toMatch(/· 1 min 5 s · 71% \(64 BPM\) · 1 pass$/);
    expect(rows[1]).toMatch(/· 5 min · 50% \(45 BPM\) · 9 passes$/);
    expect(view.panel.getByRole('button', { name: 'History Late' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );

    await view.press('History Late');
    expect(view.panel.queryByRole('region', { name: 'History of Late' })).not.toBeInTheDocument();
  });

  it('says when nothing has been logged yet, and when a session counts', async () => {
    const view = renderPanel({ prepare: withSessions([]) });

    await view.press('History Intro');

    expect(
      await view.panel.findByText(
        /No practice logged yet\. A session is logged once .* 30 seconds\./,
      ),
    ).toBeInTheDocument();
  });

  it('shows ten sessions and the rest on request', async () => {
    const sessions = Array.from({ length: 12 }, (_, i) =>
      session(`s${i}`, { started_at: new Date(Date.UTC(2026, 10, 1 + i)).toISOString() }),
    );
    const view = renderPanel({ prepare: withSessions(sessions) });
    await view.press('History Late');

    const list = history(view, 'Late');
    await waitFor(() => expect(list.getAllByRole('listitem')).toHaveLength(10));

    await view.user.click(list.getByRole('button', { name: 'Show all 12 sessions' }));

    expect(list.getAllByRole('listitem')).toHaveLength(12);
  });

  it("a history that won't load says so in fixed words, with a way to try again", async () => {
    const view = renderPanel({ prepare: withSessions('fail') });

    await view.press('History Late');

    const alert = await view.item('Late').findByRole('alert');
    expect(alert).toHaveTextContent("Couldn't load this loop's history.");
    expect(alert).not.toHaveTextContent('internal');
    expect(within(alert).getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('keeps the history on show when a later read of it fails', async () => {
    let failing = false;
    const view = renderPanel({
      prepare: (table) => {
        queryResult.mockImplementation(async (call) => {
          if (call.table === 'loops') return table.answer(call);
          return failing
            ? { data: null, error: { message: 'internal detail' } }
            : { data: [session('only')], error: null };
        });
      },
    });
    await view.press('History Late');
    const list = history(view, 'Late');
    await waitFor(() => expect(list.getAllByRole('listitem')).toHaveLength(1));
    const reads = () =>
      queryResult.mock.calls.filter(([call]) => call.table === 'practice_sessions').length;
    const readsBefore = reads();

    failing = true;
    // Closed and opened again: the history is read anew, and this time the read fails.
    await view.press('History Late');
    await view.press('History Late');
    await waitFor(() => expect(reads()).toBeGreaterThan(readsBefore));
    await settle();

    expect(history(view, 'Late').getAllByRole('listitem')).toHaveLength(1);
    expect(view.item('Late').queryByRole('alert')).not.toBeInTheDocument();
  });

  it('says when each loop was last practiced', async () => {
    const view = renderPanel({
      loops: [intro, loopRow('late', { ...late, last_practiced_at: new Date().toISOString() })],
    });

    await view.panel.findByRole('button', { name: 'History Late' });

    expect(view.item('Late').getByTestId('loop-last-practiced')).toHaveTextContent(
      'Last practiced today',
    );
    expect(view.item('Intro').getByTestId('loop-last-practiced')).toHaveTextContent(
      'Not practiced yet',
    );
  });
});

describe('LoopPanel keeping focus', () => {
  const atTarget = loopRow('late', {
    name: 'Late',
    start_bar: 9,
    end_bar: 12,
    speed_ratio: 1,
    target_ratio: 1,
  });

  it('New loop moves focus into the form, not to a field, and Cancel gives it back to New loop', async () => {
    const view = renderPanel();
    await view.press('New loop');

    const form = view.panel.getByRole('form', { name: 'New loop' });
    expect(form).toHaveFocus();
    await view.press('Cancel');

    expect(await view.panel.findByRole('button', { name: 'New loop' })).toHaveFocus();
  });

  it('a saved new loop gives focus back to New loop', async () => {
    const view = renderPanel();
    await typeNewLoop(view, { first: '5', last: '8', name: 'Verse' });
    await view.press('Save loop');

    await waitFor(() => expect(view.panel.getByRole('button', { name: 'New loop' })).toHaveFocus());
  });

  it('Edit gives focus to the form, and Cancel or a save back to that loop’s Edit', async () => {
    const view = renderPanel();
    await view.press('Edit Late');
    expect(view.panel.getByRole('form', { name: 'Edit Late' })).toHaveFocus();

    await view.press('Cancel');
    expect(await view.panel.findByRole('button', { name: 'Edit Late' })).toHaveFocus();

    await view.press('Edit Late');
    await rename(view, 'Later');
    await view.press('Save loop');
    await waitFor(() =>
      expect(view.panel.getByRole('button', { name: 'Edit Later' })).toHaveFocus(),
    );
  });

  it('back from a loop deleted elsewhere, focus goes to New loop', async () => {
    const view = renderPanel();
    await view.press('Edit Late');
    view.table.setRows([intro]);
    await view.refetch();

    await view.press('Back to loops');
    expect(await view.panel.findByRole('button', { name: 'New loop' })).toHaveFocus();
  });

  it('a form opened by a drag gives focus to New loop when it closes', async () => {
    const view = renderPanel();
    act(() => view.engine.fire('barsDragged', { fromBarIndex: 1, toBarIndex: 3, done: true }));
    const form = await view.panel.findByRole('form', { name: 'New loop' });
    expect(form).toHaveFocus();

    await view.press('Cancel');
    expect(await view.panel.findByRole('button', { name: 'New loop' })).toHaveFocus();
  });

  it('Mark finished follows the loop to its Reopen under Finished, and Reopen back again', async () => {
    const view = renderPanel();
    await view.press('Mark finished Intro');

    await waitFor(() =>
      expect(view.panel.getByRole('button', { name: 'Reopen Intro' })).toHaveFocus(),
    );
    await view.press('Reopen Intro');
    await waitFor(() =>
      expect(view.panel.getByRole('button', { name: 'Mark finished Intro' })).toHaveFocus(),
    );
  });

  it('the prompt’s Mark finished hands focus to the loop’s Reopen', async () => {
    const view = renderPanel({ loops: [intro, atTarget] });
    await view.press('Play loop Late');
    view.enginePlays();

    const prompt = within(view.panel.getByRole('group', { name: 'Mark finished?' }));
    await view.user.click(prompt.getByRole('button', { name: 'Mark finished' }));

    await waitFor(() =>
      expect(view.panel.getByRole('button', { name: 'Reopen Late' })).toHaveFocus(),
    );
  });

  // Held: the loop's new button is rendered while its write is still pending, as on a real network.
  it('with the write on its way, focus is on the loop’s Reopen at once, and Enter there sends nothing', async () => {
    const view = renderPanel();
    const release = view.table.holdNext('update');
    await view.press('Mark finished Intro');

    const reopen = await view.panel.findByRole('button', { name: 'Reopen Intro' });
    await waitFor(() => expect(reopen).toHaveFocus());
    expectLocked(reopen);
    await view.user.keyboard('{Enter}');
    expect(view.table.sent('update')).toEqual([{ status: 'finished' }]);

    release();
    await waitFor(() => expectUnlocked(reopen));
    expect(reopen).toHaveFocus();
    expect(view.table.sent('update')).toEqual([{ status: 'finished' }]);

    // And back: Reopen, held, focuses Mark finished.
    const releaseReopen = view.table.holdNext('update');
    await view.user.keyboard('{Enter}');
    const finish = await view.panel.findByRole('button', { name: 'Mark finished Intro' });
    await waitFor(() => expect(finish).toHaveFocus());
    expectLocked(finish);
    releaseReopen();
    await waitFor(() => expectUnlocked(finish));
    expect(finish).toHaveFocus();
  });

  it('Space on the locked Reopen sends nothing either', async () => {
    const view = renderPanel();
    const release = view.table.holdNext('update');
    await view.press('Mark finished Intro');
    const reopen = await view.panel.findByRole('button', { name: 'Reopen Intro' });
    await waitFor(() => expect(reopen).toHaveFocus());

    await view.user.keyboard(' ');
    await settle();
    expect(view.table.sent('update')).toEqual([{ status: 'finished' }]);
    release();
    await waitFor(() => expectUnlocked(reopen));
    expect(view.table.sent('update')).toEqual([{ status: 'finished' }]);
  });

  it('a refused write unlocks the loop’s button where it lands, and a press there sends again', async () => {
    const view = renderPanel();
    const refuse = view.table.holdNext('update');
    view.table.failNext('update', 'nope');
    (await view.panel.findByRole('button', { name: 'Mark finished Intro' })).focus();
    await view.user.keyboard('{Enter}');
    const reopen = await view.panel.findByRole('button', { name: 'Reopen Intro' });
    await waitFor(() => expect(reopen).toHaveFocus());
    expectLocked(reopen);

    refuse();

    await waitFor(() =>
      expect(view.panel.queryByRole('region', { name: 'Finished loops' })).not.toBeInTheDocument(),
    );
    expect(await view.item('Intro').findByRole('alert')).toHaveTextContent(
      "Couldn't change the loop: nope",
    );
    const finish = view.panel.getByRole('button', { name: 'Mark finished Intro' });
    expectUnlocked(finish);
    await view.user.click(finish);
    await waitFor(() =>
      expect(view.table.sent('update')).toEqual([{ status: 'finished' }, { status: 'finished' }]),
    );
    await waitFor(() =>
      expect(view.panel.getByRole('button', { name: 'Reopen Intro' })).toHaveFocus(),
    );
  });

  it('with the prompt’s write on its way, focus is on the loop’s Reopen at once', async () => {
    const view = renderPanel({ loops: [intro, atTarget] });
    await view.press('Play loop Late');
    view.enginePlays();
    const release = view.table.holdNext('update');

    const prompt = within(view.panel.getByRole('group', { name: 'Mark finished?' }));
    await view.user.click(prompt.getByRole('button', { name: 'Mark finished' }));

    const reopen = await view.panel.findByRole('button', { name: 'Reopen Late' });
    await waitFor(() => expect(reopen).toHaveFocus());
    expectLocked(reopen);
    release();
    await waitFor(() => expectUnlocked(reopen));
    expect(reopen).toHaveFocus();
  });
});

describe('LoopPanel offline', () => {
  const offline = () => act(() => onlineManager.setOnline(false));
  const online = () => act(() => onlineManager.setOnline(true));
  const queuedNote = (view: View) => view.panel.queryByTestId('loop-speed-queued');

  it('a speed saved offline shows at once, says it waits, can be saved again behind it, and both go in order', async () => {
    const view = renderPanel();
    await view.press('Play loop Intro');
    offline();

    await view.press('Slower by 5%');
    await view.press('Save speed');
    expect(await view.panel.findByTestId('loop-speed-queued')).toHaveTextContent(
      "Saved on this device. It's sent when you're back online.",
    );
    expect(view.panel.getByTestId('loop-saved-speed')).toHaveTextContent('Saved: 75%');

    // Waiting for the connection is not "being sent": a second save can queue behind it.
    await view.press('Slower by 5%');
    const save = view.panel.getByRole('button', { name: 'Save speed' });
    expect(save).toBeEnabled();
    await view.user.click(save);
    await waitFor(() =>
      expect(view.panel.getByTestId('loop-saved-speed')).toHaveTextContent('Saved: 70%'),
    );
    await settle();
    expect(view.table.sent('update')).toEqual([]);

    online();
    await waitFor(() =>
      expect(view.table.sent('update')).toEqual([{ speed_ratio: 0.75 }, { speed_ratio: 0.7 }]),
    );
    await waitFor(() => expect(queuedNote(view)).not.toBeInTheDocument());
    expect(view.table.rows().find((row) => row.id === 'intro')?.speed_ratio).toBe(0.7);
    expect(view.panel.getByTestId('loop-saved-speed')).toHaveTextContent('Saved: 70%');
  });

  it('"Save speed" is locked while a save is being sent, once the connection is back', async () => {
    const view = renderPanel();
    await view.press('Play loop Intro');
    offline();
    await view.press('Slower by 5%');
    await view.press('Save speed');
    await view.panel.findByTestId('loop-speed-queued');

    const release = view.table.holdNext('update');
    online();
    await waitFor(() => expect(view.table.sent('update')).toHaveLength(1));
    await view.press('Slower by 5%');
    const save = view.panel.getByRole('button', { name: 'Save speed' });
    expect(save).toBeDisabled();
    release();
    await waitFor(() => expect(save).toBeEnabled());
  });

  it('a loop finished offline moves at once, its Reopen is locked until the write has gone, and other loops can still change', async () => {
    const view = renderPanel();
    offline();
    await view.press('Mark finished Intro');
    await waitFor(() => expect(finishedOf(view)).toEqual(['Intro']));

    const reopen = view.panel.getByRole('button', { name: 'Reopen Intro' });
    expectLocked(reopen);
    await view.user.click(reopen);
    await view.press('Mark finished Late');
    await waitFor(() => expect(finishedOf(view).sort()).toEqual(['Intro', 'Late']));
    await settle();
    expect(view.table.sent('update')).toEqual([]);

    online();
    await waitFor(() =>
      expect(view.table.sent('update')).toEqual([{ status: 'finished' }, { status: 'finished' }]),
    );
    await waitFor(() => expectUnlocked(view.panel.getByRole('button', { name: 'Reopen Intro' })));
    expect(view.table.rows().map((row) => row.status)).toEqual(['finished', 'finished']);
  });

  it('"Save loop" is off with a reason, and a submit of the form saves nothing', async () => {
    const view = renderPanel();
    await typeNewLoop(view, { first: '2', last: '3', name: 'Fill' });
    offline();
    const save = view.panel.getByRole('button', { name: 'Save loop' });
    expect(save).toBeDisabled();
    expect(view.panel.getByTestId('offline-note')).toHaveTextContent(
      "You're offline. Loops can be saved once you're back online.",
    );
    fireEvent.submit(view.panel.getByRole('form'));
    await settle();
    expect(view.table.sent('insert')).toEqual([]);
    expect(view.panel.getByLabelText('Name')).toHaveValue('Fill');

    online();
    await view.user.click(save);
    await waitFor(() => expect(view.names()).toContain('Fill'));
    expect(view.table.sent('insert')).toHaveLength(1);
  });

  it('"Delete loop" is off with a reason while offline', async () => {
    const view = renderPanel();
    await view.press('Delete Late');
    offline();
    const confirm = within(view.panel.getByRole('group', { name: 'Delete Late' }));
    const remove = confirm.getByRole('button', { name: 'Delete loop' });
    expect(remove).toBeDisabled();
    expect(confirm.getByTestId('offline-note')).toHaveTextContent(
      "You're offline. Loops can be deleted once you're back online.",
    );
    act(() => remove.click());
    // And a press that comes before the button is drawn off reaches the handler, which refuses.
    online();
    act(() => {
      onlineManager.setOnline(false);
      expect(remove).toBeEnabled();
      remove.click();
    });
    await settle();
    expect(view.table.sent('delete')).toEqual([]);

    online();
    await view.user.click(remove);
    await waitFor(() => expect(view.names()).toEqual(['Intro']));
  });

  it("says why, rather than loading for ever, when the song's loops were never read on this device", async () => {
    offline();
    const view = renderPanel();
    expect(
      await view.panel.findByText(/loops haven't been opened on this device yet/),
    ).toBeInTheDocument();
    expect(view.panel.queryByText('Loading loops…')).not.toBeInTheDocument();
    expect(view.table.sent('update')).toEqual([]);
    expect(queryResult).not.toHaveBeenCalled();

    online();
    await waitFor(() => expect(view.names()).toEqual(['Intro', 'Late']));
  });
});

const finishedOf = (view: View) =>
  within(view.panel.getByRole('region', { name: 'Finished loops' }))
    .queryAllByRole('listitem')
    .map((li) => li.querySelector('p')?.textContent ?? '');
