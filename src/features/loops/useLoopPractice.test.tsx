import { act, renderHook, waitFor } from '@testing-library/react';
import type { PlayerService } from '@/features/player/PlayerService';
import { resetFakeSupabase } from '@/test/fakeSupabase';
import { startOfBar } from '@/test/fakePlayerEngine';
import { loopPlayer, usePlayerSnapshot } from '@/test/loopPlayer';
import { LOOP_SONG_ID, loopRow, serveLoopTable } from '@/test/loopTable';
import { signedInAs, testQueryClient, wrapperFor } from '@/test/render';
import type { Loop } from './loopForm';
import { loopKeys } from './loopKeys';
import { editorBarFields, useLoopPractice } from './useLoopPractice';
import { useLoops } from './useLoops';

vi.mock('@/lib/supabase', async () => (await import('@/test/fakeSupabase')).fakeSupabaseModule);

const verse = loopRow('verse', { name: 'Verse', start_bar: 5, end_bar: 8, speed_ratio: 0.8 });
const outro = loopRow('outro', { name: 'Outro', start_bar: 13, end_bar: 16, speed_ratio: 1.1 });

/** The practice hook over a real player and the song's loops query, as the song page wires it. */
async function renderPractice(loops: Loop[] = [verse, outro], { loaded = true } = {}) {
  const table = serveLoopTable(loops);
  const { engine, player, finishLoading } = loopPlayer({ loaded });
  const queryClient = testQueryClient();
  const hook = renderHook(
    ({ mounted }: { mounted: PlayerService | null }) => {
      const snapshot = usePlayerSnapshot(player);
      const query = useLoops(LOOP_SONG_ID);
      return { practice: useLoopPractice(mounted, snapshot, query.data), query };
    },
    {
      wrapper: wrapperFor(queryClient, signedInAs()),
      initialProps: { mounted: player as PlayerService | null },
    },
  );
  await waitFor(() => expect(hook.result.current.query.isSuccess).toBe(true));
  const practice = () => hook.result.current.practice;
  /** What another device, or a refetch, leaves in the list. */
  const listBecomes = async (next: Loop[]) => {
    act(() => {
      queryClient.setQueryData(loopKeys.forSong('user-1', LOOP_SONG_ID), next);
    });
    // TanStack Query notifies on a timer.
    await waitFor(() => expect(hook.result.current.query.data).toEqual(next));
  };
  const tap = (barNumber: number) =>
    act(() => engine.fire('barTapped', { barIndex: barNumber - 1 }));
  const drag = (fromBar: number, toBar: number, done: boolean) =>
    act(() =>
      engine.fire('barsDragged', { fromBarIndex: fromBar - 1, toBarIndex: toBar - 1, done }),
    );
  const fields = () => {
    const { editor, editedLoop } = practice();
    return editor ? editorBarFields(editor, editedLoop) : null;
  };
  return { table, engine, player, finishLoading, hook, practice, listBecomes, tap, drag, fields };
}

const rangeOfBars = (startBar: number, endBar: number) => ({
  startTick: startOfBar(startBar),
  endTick: startOfBar(endBar + 1),
});

beforeEach(() => {
  resetFakeSupabase();
});

describe('playing a loop', () => {
  it('sets the range, looping and the saved speed, and starts playing, all inside the call', async () => {
    const { engine, practice, player } = await renderPractice();

    // Synchronous: nothing is awaited between the tap and play() (iOS audio).
    act(() => {
      practice().playLoop(verse);
      expect(engine.play).toHaveBeenCalledTimes(1);
    });

    expect(engine.setPlaybackRange).toHaveBeenLastCalledWith(rangeOfBars(5, 8));
    expect(engine.setLooping).toHaveBeenLastCalledWith(true);
    expect(engine.setSpeed).toHaveBeenLastCalledWith(0.8);
    expect(engine.seek).toHaveBeenLastCalledWith(startOfBar(5));
    expect(player.getSnapshot()).toMatchObject({
      range: { startBar: 5, endBar: 8 },
      looping: true,
      speedRatio: 0.8,
      barNumber: 5,
      highlight: { startBar: 5, endBar: 8 },
    });
    expect(practice().activeLoop).toEqual(verse);
  });

  it('switching loops mid-play changes range and speed live, with no stop, play or reload', async () => {
    const { engine, practice, player } = await renderPractice();
    act(() => practice().playLoop(verse));
    act(() => engine.fire('stateChanged', { playing: true }));
    const restarts = engine.restartCalls();

    act(() => practice().playLoop(outro));

    expect(engine.restartCalls()).toBe(restarts);
    expect(engine.setPlaybackRange).toHaveBeenLastCalledWith(rangeOfBars(13, 16));
    expect(player.getSnapshot()).toMatchObject({
      status: 'playing',
      speedRatio: 1.1,
      barNumber: 13,
      highlight: { startBar: 13, endBar: 16 },
    });
  });

  it('playing the active loop again goes back to its first bar and keeps the speed playing now', async () => {
    const { engine, practice, player } = await renderPractice();
    act(() => practice().playLoop(verse));
    act(() => {
      engine.fire('stateChanged', { playing: true });
      engine.fire('position', { tick: startOfBar(5) });
      engine.fire('position', { tick: startOfBar(7) + 10 });
      player.setSpeed(0.5);
    });
    expect(player.getSnapshot().barNumber).toBe(7);

    act(() => practice().playLoop(verse));

    expect(engine.seek).toHaveBeenLastCalledWith(startOfBar(5));
    expect(player.getSnapshot()).toMatchObject({ barNumber: 5, speedRatio: 0.5, looping: true });
  });

  it('playing a loop after leaving it starts from its saved speed again', async () => {
    const { practice, player } = await renderPractice();
    act(() => practice().playLoop(verse));
    act(() => player.setSpeed(0.5));
    act(() => practice().exitLoop());

    act(() => practice().playLoop(verse));

    expect(player.getSnapshot().speedRatio).toBe(0.8);
  });

  it('opening a loop from a link sets it up at its saved speed without starting playback', async () => {
    const { engine, practice, player } = await renderPractice();

    act(() => practice().openLoop(outro));

    expect(practice().activeLoop).toEqual(outro);
    expect(player.getSnapshot()).toMatchObject({
      status: 'ready',
      range: { startBar: 13, endBar: 16 },
      looping: true,
      barNumber: 13,
      speedRatio: 1.1,
    });
    expect(engine.play).not.toHaveBeenCalled();
  });

  it.each([
    ['ends past the last bar', { start_bar: 14, end_bar: 20 }],
    ['starts past the last bar', { start_bar: 17, end_bar: 18 }],
    ['runs backwards', { start_bar: 8, end_bar: 5 }],
    ['starts at bar 0', { start_bar: 0, end_bar: 4 }],
  ])('does nothing for a loop that %s in this song', async (_what, bars) => {
    const broken = loopRow('broken', bars);
    const { engine, practice, player } = await renderPractice([broken]);
    engine.setPlaybackRange.mockClear();

    act(() => practice().playLoop(broken));

    expect(engine.play).not.toHaveBeenCalled();
    expect(engine.setPlaybackRange).not.toHaveBeenCalled();
    expect(player.getSnapshot()).toMatchObject({ range: null, looping: false, speedRatio: 1 });
    expect(practice().activeLoop).toBeNull();
  });

  it('does nothing until the score has loaded', async () => {
    const { engine, practice } = await renderPractice([verse], { loaded: false });
    act(() => practice().playLoop(verse));
    expect(engine.play).not.toHaveBeenCalled();
    expect(practice().activeLoop).toBeNull();
  });

  it('does nothing without a player', async () => {
    const { hook, practice, engine } = await renderPractice();
    hook.rerender({ mounted: null });
    act(() => practice().playLoop(verse));
    expect(engine.play).not.toHaveBeenCalled();
    expect(practice().activeLoop).toBeNull();
  });

  it('a single-bar loop is a range of that one bar', async () => {
    const one = loopRow('one', { start_bar: 16, end_bar: 16 });
    const { engine, practice } = await renderPractice([one]);
    act(() => practice().playLoop(one));
    expect(engine.setPlaybackRange).toHaveBeenLastCalledWith(rangeOfBars(16, 16));
    expect(engine.setLooping).toHaveBeenLastCalledWith(true);
  });
});

// 08 QA issues 1 and 2: alphaTab only scrolls to its cursor while playing.
describe('bringing a loop’s first bar on screen', () => {
  it('playLoop while paused scrolls to the first bar before playback starts', async () => {
    const { engine, practice } = await renderPractice();
    act(() => practice().playLoop(outro));
    expect(engine.scrollToBar).toHaveBeenCalledWith(12);
    const scrolled = engine.scrollToBar.mock.invocationCallOrder[0] ?? Infinity;
    expect(scrolled).toBeLessThan(engine.play.mock.invocationCallOrder[0] ?? 0);
  });

  it('playLoop with a count-in has the first bar on screen while it counts', async () => {
    const { engine, practice, player } = await renderPractice();
    act(() => player.setCountInBars(2));
    act(() => practice().playLoop(outro));
    expect(player.getSnapshot()).toMatchObject({ status: 'countingIn', barNumber: 13 });
    expect(engine.scrollToBar).toHaveBeenLastCalledWith(12);
    expect(engine.play).not.toHaveBeenCalled();
    act(() => player.pause());
  });

  it('selectLoop while paused scrolls to the first bar', async () => {
    const { engine, practice } = await renderPractice();
    act(() => practice().selectLoop(outro.id));
    expect(engine.scrollToBar).toHaveBeenCalledTimes(1);
    expect(engine.scrollToBar).toHaveBeenLastCalledWith(12);
    expect(engine.play).not.toHaveBeenCalled();
  });

  it('a paused loop whose bars another device moved scrolls to its new first bar', async () => {
    const { engine, practice, listBecomes } = await renderPractice();
    act(() => practice().selectLoop(verse.id));
    await listBecomes([{ ...verse, start_bar: 9, end_bar: 10 }, outro]);
    expect(engine.scrollToBar).toHaveBeenLastCalledWith(8);
  });

  it('while playing, switching loops leaves the scrolling to alphaTab', async () => {
    const { engine, practice } = await renderPractice();
    act(() => practice().playLoop(verse));
    act(() => engine.fire('stateChanged', { playing: true }));
    engine.scrollToBar.mockClear();

    act(() => practice().playLoop(outro));

    expect(engine.scrollToBar).not.toHaveBeenCalled();
  });

  it('exitLoop scrolls nowhere', async () => {
    const { engine, practice } = await renderPractice();
    act(() => practice().selectLoop(verse.id));
    engine.scrollToBar.mockClear();
    act(() => practice().exitLoop());
    expect(engine.scrollToBar).not.toHaveBeenCalled();
  });

  it('a tap that seeks in jam mode does not scroll', async () => {
    const { engine, player } = await renderPractice();
    act(() => void player.seekToBar(13));
    expect(engine.scrollToBar).not.toHaveBeenCalled();
  });
});

describe('selecting and leaving a loop', () => {
  it('selectLoop loops the bars without touching speed or starting playback', async () => {
    const { engine, practice, player } = await renderPractice();
    act(() => player.setSpeed(0.6));
    engine.setSpeed.mockClear();

    act(() => practice().selectLoop(verse.id));

    expect(player.getSnapshot()).toMatchObject({
      range: { startBar: 5, endBar: 8 },
      looping: true,
      speedRatio: 0.6,
      status: 'ready',
      barNumber: 5,
    });
    expect(engine.setSpeed).not.toHaveBeenCalled();
    expect(engine.play).not.toHaveBeenCalled();
  });

  it('a loop selected before its row is in the list starts looping when the row arrives', async () => {
    const { practice, player, listBecomes } = await renderPractice([verse]);
    const fresh = loopRow('fresh', { start_bar: 2, end_bar: 3 });

    act(() => practice().selectLoop(fresh.id));
    expect(practice().activeLoop).toBeNull();
    expect(player.getSnapshot().range).toBeNull();

    await listBecomes([verse, fresh]);
    expect(practice().activeLoop).toEqual(fresh);
    expect(player.getSnapshot()).toMatchObject({
      range: { startBar: 2, endBar: 3 },
      looping: true,
    });
  });

  it('exitLoop plays on through the whole song: no range, no looping, no stop, same speed', async () => {
    const { engine, practice, player } = await renderPractice();
    act(() => practice().playLoop(verse));
    act(() => engine.fire('stateChanged', { playing: true }));
    const restarts = engine.restartCalls();
    engine.seek.mockClear();

    act(() => practice().exitLoop());

    expect(engine.setPlaybackRange).toHaveBeenLastCalledWith(null);
    expect(engine.setLooping).toHaveBeenLastCalledWith(false);
    expect(engine.restartCalls()).toBe(restarts);
    // Playback carries on from where it is, not from the top.
    expect(engine.seek).not.toHaveBeenCalled();
    expect(player.getSnapshot()).toMatchObject({
      status: 'playing',
      range: null,
      looping: false,
      speedRatio: 0.8,
      highlight: null,
    });
    expect(practice().activeLoop).toBeNull();
  });
});

describe('the playing loop follows its saved row', () => {
  it('moves to new bars saved on another device, without restarting playback', async () => {
    const { engine, practice, player, listBecomes } = await renderPractice();
    act(() => practice().playLoop(verse));
    act(() => engine.fire('stateChanged', { playing: true }));
    const restarts = engine.restartCalls();

    await listBecomes([{ ...verse, start_bar: 6, end_bar: 9 }, outro]);

    expect(engine.setPlaybackRange).toHaveBeenLastCalledWith(rangeOfBars(6, 9));
    expect(engine.restartCalls()).toBe(restarts);
    expect(player.getSnapshot()).toMatchObject({
      status: 'playing',
      range: { startBar: 6, endBar: 9 },
      highlight: { startBar: 6, endBar: 9 },
    });
  });

  it('leaves the player alone when something other than the bars changes', async () => {
    const { engine, practice, player, listBecomes } = await renderPractice();
    act(() => practice().playLoop(verse));
    act(() => {
      engine.fire('position', { tick: startOfBar(5) });
      engine.fire('position', { tick: startOfBar(7) });
      player.setSpeed(0.9);
    });
    engine.setPlaybackRange.mockClear();
    engine.seek.mockClear();
    engine.setSpeed.mockClear();

    // Renamed, and its speed saved, on another device.
    await listBecomes([{ ...verse, name: 'Verse 1', speed_ratio: 0.5 }, outro]);

    expect(practice().activeLoop?.name).toBe('Verse 1');
    expect(engine.setPlaybackRange).not.toHaveBeenCalled();
    expect(engine.seek).not.toHaveBeenCalled();
    // The speed playing is the user's until they press Play loop again.
    expect(engine.setSpeed).not.toHaveBeenCalled();
    expect(player.getSnapshot()).toMatchObject({ barNumber: 7, speedRatio: 0.9 });
  });

  it('goes back to the whole song when the loop is deleted, and keeps playing', async () => {
    const { engine, practice, player, listBecomes } = await renderPractice();
    act(() => practice().playLoop(verse));
    act(() => engine.fire('stateChanged', { playing: true }));
    const restarts = engine.restartCalls();

    await listBecomes([outro]);

    expect(practice().activeLoop).toBeNull();
    expect(engine.restartCalls()).toBe(restarts);
    expect(player.getSnapshot()).toMatchObject({
      status: 'playing',
      range: null,
      looping: false,
      highlight: null,
    });
  });

  it('keeps the old bars playing when the saved row no longer fits the song', async () => {
    const { practice, player, listBecomes } = await renderPractice();
    act(() => practice().playLoop(verse));
    await listBecomes([{ ...verse, end_bar: 40 }, outro]);
    expect(player.getSnapshot().range).toEqual({ startBar: 5, endBar: 8 });
  });
});

describe('picking bars on the score', () => {
  it('taps do nothing here while no form is open (jam mode seeks instead)', async () => {
    const { practice, tap, player } = await renderPractice();
    tap(4);
    expect(practice().editor).toBeNull();
    expect(player.getSnapshot().highlight).toBeNull();
  });

  it('first tap picks one bar, the second makes the range, a third starts again', async () => {
    const { practice, tap, fields, player } = await renderPractice();
    act(() => practice().openEditor(null));
    expect(fields()).toEqual({ startBar: '', endBar: '' });

    tap(6);
    expect(fields()).toEqual({ startBar: '6', endBar: '6' });
    expect(practice().editor?.awaitingEnd).toBe(true);
    expect(player.getSnapshot().highlight).toEqual({ startBar: 6, endBar: 6 });

    tap(9);
    expect(fields()).toEqual({ startBar: '6', endBar: '9' });
    expect(practice().editor?.awaitingEnd).toBe(false);
    expect(player.getSnapshot().highlight).toEqual({ startBar: 6, endBar: 9 });

    tap(2);
    expect(fields()).toEqual({ startBar: '2', endBar: '2' });
    expect(practice().editor?.awaitingEnd).toBe(true);
  });

  it('an earlier bar tapped second still gives the range in order', async () => {
    const { practice, tap, fields } = await renderPractice();
    act(() => practice().openEditor(null));
    tap(9);
    tap(6);
    expect(fields()).toEqual({ startBar: '6', endBar: '9' });
  });

  it('the same bar tapped twice is a one-bar range', async () => {
    const { practice, tap, fields } = await renderPractice();
    act(() => practice().openEditor(null));
    tap(4);
    tap(4);
    expect(fields()).toEqual({ startBar: '4', endBar: '4' });
    expect(practice().editor?.awaitingEnd).toBe(false);
  });

  it('never seeks, moves the range or changes playback, even while another loop plays', async () => {
    const { engine, practice, tap, player } = await renderPractice();
    act(() => practice().playLoop(verse));
    act(() => {
      engine.fire('stateChanged', { playing: true });
      engine.fire('position', { tick: startOfBar(5) });
    });
    const restarts = engine.restartCalls();
    engine.seek.mockClear();
    engine.setPlaybackRange.mockClear();

    act(() => practice().openEditor(null));
    tap(13);
    tap(14);

    expect(engine.seek).not.toHaveBeenCalled();
    expect(engine.setPlaybackRange).not.toHaveBeenCalled();
    expect(engine.restartCalls()).toBe(restarts);
    // The bars on show are the ones being picked; the ones playing are the loop's.
    expect(player.getSnapshot()).toMatchObject({
      status: 'playing',
      range: { startBar: 5, endBar: 8 },
      highlight: { startBar: 13, endBar: 14 },
      barNumber: 5,
    });
  });

  it('typing a bar ends a half-made tap selection, so the next tap starts again', async () => {
    const { practice, tap, fields } = await renderPractice();
    act(() => practice().openEditor(null));
    tap(6);
    act(() => practice().setEditorBars({ endBar: '8' }));
    expect(fields()).toEqual({ startBar: '6', endBar: '8' });
    expect(practice().editor?.awaitingEnd).toBe(false);

    tap(11);
    expect(fields()).toEqual({ startBar: '11', endBar: '11' });
  });

  it('typed bars that make no range in this song are not highlighted, and a tap starts from scratch', async () => {
    const { practice, tap, fields, player } = await renderPractice();
    act(() => practice().openEditor(null));
    act(() => practice().setEditorBars({ startBar: '9', endBar: '40' }));
    expect(player.getSnapshot().highlight).toBeNull();

    tap(3);
    expect(fields()).toEqual({ startBar: '3', endBar: '3' });
    expect(player.getSnapshot().highlight).toEqual({ startBar: 3, endBar: 3 });
  });

  it('editing a saved loop starts from its bars; the first tap starts a new selection', async () => {
    const { practice, tap, fields, player } = await renderPractice();
    act(() => practice().openEditor(outro));
    expect(practice().editedLoop).toEqual(outro);
    expect(fields()).toEqual({ startBar: '13', endBar: '16' });
    expect(player.getSnapshot().highlight).toEqual({ startBar: 13, endBar: 16 });

    tap(9);
    expect(fields()).toEqual({ startBar: '9', endBar: '9' });
    tap(12);
    expect(fields()).toEqual({ startBar: '9', endBar: '12' });
  });

  it('a typed bar on an edit keeps the saved value of the other field', async () => {
    const { practice, fields, listBecomes } = await renderPractice();
    act(() => practice().openEditor(outro));
    act(() => practice().setEditorBars({ startBar: '11' }));
    expect(fields()).toEqual({ startBar: '11', endBar: '16' });
    // The other end changed on another device meanwhile: it shows through.
    await listBecomes([verse, { ...outro, end_bar: 15 }]);
    expect(fields()).toEqual({ startBar: '11', endBar: '15' });
  });

  it('closing the form stops taps picking bars and shows the playing loop’s bars again', async () => {
    const { practice, tap, player } = await renderPractice();
    act(() => practice().playLoop(verse));
    act(() => practice().openEditor(null));
    tap(1);
    tap(2);
    expect(player.getSnapshot().highlight).toEqual({ startBar: 1, endBar: 2 });

    act(() => practice().closeEditor());
    expect(player.getSnapshot().highlight).toEqual({ startBar: 5, endBar: 8 });
    tap(12);
    expect(practice().editor).toBeNull();
    expect(player.getSnapshot().highlight).toEqual({ startBar: 5, endBar: 8 });
  });

  it('opening the form again starts with no bars, not the last selection', async () => {
    const { practice, tap, fields } = await renderPractice();
    act(() => practice().openEditor(null));
    tap(3);
    act(() => practice().closeEditor());
    act(() => practice().openEditor(null));
    expect(fields()).toEqual({ startBar: '', endBar: '' });
    expect(practice().editor?.awaitingEnd).toBe(false);
  });
});

describe('dragging across bars', () => {
  it('with no form open: shown while dragging, and the form opens with the bars on release', async () => {
    const { practice, drag, fields, player } = await renderPractice();

    drag(3, 4, false);
    expect(practice().editor).toBeNull();
    expect(player.getSnapshot().highlight).toEqual({ startBar: 3, endBar: 4 });
    drag(3, 6, false);
    expect(player.getSnapshot().highlight).toEqual({ startBar: 3, endBar: 6 });

    drag(3, 6, true);
    expect(practice().editor).toMatchObject({ loopId: null, awaitingEnd: false });
    expect(fields()).toEqual({ startBar: '3', endBar: '6' });
    expect(player.getSnapshot().highlight).toEqual({ startBar: 3, endBar: 6 });
  });

  it('a right-to-left drag gives the bars in order', async () => {
    const { drag, fields } = await renderPractice();
    drag(9, 6, true);
    expect(fields()).toEqual({ startBar: '6', endBar: '9' });
  });

  it('a drag that comes back to the bar it started on opens nothing and leaves no mark', async () => {
    const { practice, drag, player } = await renderPractice();
    drag(3, 4, false);
    drag(3, 3, false);
    drag(3, 3, true);
    expect(practice().editor).toBeNull();
    expect(player.getSnapshot().highlight).toBeNull();
  });

  it('with the playing loop on show: the drag is shown instead, then the loop’s bars again if nothing came of it', async () => {
    const { practice, drag, player } = await renderPractice();
    act(() => practice().playLoop(verse));
    drag(11, 12, false);
    expect(player.getSnapshot().highlight).toEqual({ startBar: 11, endBar: 12 });
    drag(11, 11, true);
    expect(player.getSnapshot().highlight).toEqual({ startBar: 5, endBar: 8 });
    expect(player.getSnapshot().range).toEqual({ startBar: 5, endBar: 8 });
  });

  it('with the form open: replaces its bars as the drag goes, and ends a half-made tap selection', async () => {
    const { practice, tap, drag, fields } = await renderPractice();
    act(() => practice().openEditor(outro));
    tap(2);
    expect(practice().editor?.awaitingEnd).toBe(true);

    drag(9, 10, false);
    expect(fields()).toEqual({ startBar: '9', endBar: '10' });
    drag(9, 12, true);
    expect(fields()).toEqual({ startBar: '9', endBar: '12' });
    // Still the same loop's form.
    expect(practice().editor).toMatchObject({ loopId: outro.id, awaitingEnd: false });
  });

  it('while the form is saving, taps and drags leave its bars as they were sent', async () => {
    const { practice, tap, drag, fields, player } = await renderPractice();
    act(() => practice().openEditor(outro));
    drag(9, 12, true);
    act(() => practice().setEditorSaving(true));

    tap(2);
    drag(3, 4, false);
    drag(3, 6, true);
    expect(fields()).toEqual({ startBar: '9', endBar: '12' });
    expect(practice().editor).toMatchObject({ loopId: outro.id, awaitingEnd: false });
    expect(player.getSnapshot().highlight).toEqual({ startBar: 9, endBar: 12 });

    // The save failed: the form is still open, and the score picks bars again.
    act(() => practice().setEditorSaving(false));
    tap(2);
    expect(fields()).toEqual({ startBar: '2', endBar: '2' });
  });

  it('a form opened after one that was saving starts unlocked', async () => {
    const { practice, tap, fields } = await renderPractice();
    act(() => practice().openEditor(outro));
    act(() => practice().setEditorSaving(true));
    act(() => practice().closeEditor());
    act(() => practice().openEditor(null));
    tap(3);
    expect(fields()).toEqual({ startBar: '3', endBar: '3' });
  });

  it('never seeks or changes the range', async () => {
    const { engine, drag, player } = await renderPractice();
    engine.setPlaybackRange.mockClear();
    drag(3, 6, false);
    drag(3, 6, true);
    expect(engine.seek).not.toHaveBeenCalled();
    expect(engine.setPlaybackRange).not.toHaveBeenCalled();
    expect(player.getSnapshot()).toMatchObject({ barNumber: 1, range: null });
  });
});
